/**
 * Graph Memory Store - D1-based relationship storage
 *
 * Prolog-style facts: predicate(subject, object)
 * Supports multi-hop traversal for relational queries.
 * ~5ms latency with proper indexing.
 */

import type { GraphStore, GraphItem } from "../types";

export function createGraphStore(db: D1Database): GraphStore {
  return {
    async queryBySubject(
      userId: string,
      subject: string
    ): Promise<GraphItem[]> {
      // Normalize subject for case-insensitive matching
      const normalizedSubject = subject.toLowerCase();

      const result = await db
        .prepare(
          `SELECT * FROM graph_items
           WHERE user_id = ? AND LOWER(subject) = ?
           ORDER BY confidence DESC, created_at DESC`
        )
        .bind(userId, normalizedSubject)
        .all<GraphRow>();

      return result.results.map(rowToItem);
    },

    async queryByPredicate(
      userId: string,
      predicate: string
    ): Promise<GraphItem[]> {
      const normalizedPredicate = predicate.toLowerCase();

      const result = await db
        .prepare(
          `SELECT * FROM graph_items
           WHERE user_id = ? AND LOWER(predicate) = ?
           ORDER BY confidence DESC, created_at DESC`
        )
        .bind(userId, normalizedPredicate)
        .all<GraphRow>();

      return result.results.map(rowToItem);
    },

    async queryByObject(userId: string, object: string): Promise<GraphItem[]> {
      const normalizedObject = object.toLowerCase();

      const result = await db
        .prepare(
          `SELECT * FROM graph_items
           WHERE user_id = ? AND LOWER(object) = ?
           ORDER BY confidence DESC, created_at DESC`
        )
        .bind(userId, normalizedObject)
        .all<GraphRow>();

      return result.results.map(rowToItem);
    },

    async traverse(
      userId: string,
      startEntity: string,
      maxHops = 3
    ): Promise<GraphItem[]> {
      const result: GraphItem[] = [];
      const state: TraverseState = {
        visited: new Set<string>(),
        queue: [{ entity: startEntity.toLowerCase(), hop: 0 }],
        maxHops,
      };

      while (state.queue.length > 0) {
        const item = state.queue.shift()!;
        if (state.visited.has(item.entity) || item.hop > maxHops) continue;
        state.visited.add(item.entity);

        const [asSubject, asObject] = await Promise.all([
          this.queryBySubject(userId, item.entity),
          this.queryByObject(userId, item.entity),
        ]);
        const facts = [...asSubject, ...asObject];
        addUniqueFacts(result, facts);
        enqueueNeighbors(facts, item, state);
      }

      return result;
    },

    async save(
      item: Omit<GraphItem, "id" | "createdAt" | "updatedAt">
    ): Promise<GraphItem> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      // Ensure required fields are present
      const predicate = item.predicate || "";
      const subject = item.subject || "";
      const object = item.object || "";

      await db
        .prepare(
          `INSERT INTO graph_items
           (id, user_id, content, predicate, subject, object, confidence, source_episode_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          item.userId,
          item.content,
          predicate.toLowerCase(),
          subject.toLowerCase(),
          object.toLowerCase(),
          item.confidence,
          item.sourceEpisodeId || null,
          now,
          now
        )
        .run();

      return {
        ...item,
        id,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };
    },

    async exists(
      userId: string,
      predicate: string,
      subject: string,
      object: string
    ): Promise<boolean> {
      // Null check
      if (!predicate || !subject || !object) {
        return false;
      }

      const result = await db
        .prepare(
          `SELECT 1 FROM graph_items
           WHERE user_id = ?
             AND LOWER(predicate) = ?
             AND LOWER(subject) = ?
             AND LOWER(object) = ?
           LIMIT 1`
        )
        .bind(
          userId,
          predicate.toLowerCase(),
          subject.toLowerCase(),
          object.toLowerCase()
        )
        .first();

      return result !== null;
    },
  };
}

// =============================================================================
// Traverse Helpers
// =============================================================================

function addUniqueFacts(result: GraphItem[], facts: GraphItem[]): void {
  for (const fact of facts) {
    if (!result.find((f) => f.id === fact.id)) {
      result.push(fact);
    }
  }
}

interface TraverseState {
  visited: Set<string>;
  queue: { entity: string; hop: number }[];
  maxHops: number;
}

function enqueueNeighbors(
  facts: GraphItem[],
  current: { entity: string; hop: number },
  state: TraverseState
): void {
  if (current.hop >= state.maxHops) return;
  for (const fact of facts) {
    const nextEntity = fact.subject.toLowerCase() === current.entity
      ? fact.object.toLowerCase()
      : fact.subject.toLowerCase();
    if (!state.visited.has(nextEntity)) {
      state.queue.push({ entity: nextEntity, hop: current.hop + 1 });
    }
  }
}

// =============================================================================
// Row Mapping
// =============================================================================

interface GraphRow {
  id: string;
  user_id: string;
  content: string;
  predicate: string;
  subject: string;
  object: string;
  confidence: number;
  source_episode_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToItem(row: GraphRow): GraphItem {
  return {
    id: row.id,
    userId: row.user_id,
    content: row.content,
    predicate: row.predicate,
    subject: row.subject,
    object: row.object,
    confidence: row.confidence,
    sourceEpisodeId: row.source_episode_id || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// =============================================================================
// Migration
// =============================================================================

export const GRAPH_MIGRATION = `
CREATE TABLE IF NOT EXISTS graph_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  predicate TEXT NOT NULL,
  subject TEXT NOT NULL,
  object TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  source_episode_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_graph_subject ON graph_items(user_id, subject);
CREATE INDEX IF NOT EXISTS idx_graph_predicate ON graph_items(user_id, predicate);
CREATE INDEX IF NOT EXISTS idx_graph_object ON graph_items(user_id, object);
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_unique ON graph_items(user_id, predicate, subject, object);
`;
