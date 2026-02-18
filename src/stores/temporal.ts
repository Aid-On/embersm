/**
 * Temporal Memory Store - D1-based time-indexed events
 *
 * Time-aware memory for "when did X happen" queries.
 * ~5ms latency with proper indexing.
 */

import type { TemporalStore, TemporalItem } from "../types";

export function createTemporalStore(db: D1Database): TemporalStore {
  return {
    async queryRange(
      userId: string,
      start: Date,
      end: Date
    ): Promise<TemporalItem[]> {
      const result = await db
        .prepare(
          `SELECT * FROM temporal_items
           WHERE user_id = ?
             AND occurred_at >= ?
             AND occurred_at <= ?
           ORDER BY occurred_at ASC`
        )
        .bind(userId, start.toISOString(), end.toISOString())
        .all<TemporalRow>();

      return result.results.map(rowToItem);
    },

    async queryBefore(
      userId: string,
      date: Date,
      limit = 10
    ): Promise<TemporalItem[]> {
      const result = await db
        .prepare(
          `SELECT * FROM temporal_items
           WHERE user_id = ? AND occurred_at < ?
           ORDER BY occurred_at DESC
           LIMIT ?`
        )
        .bind(userId, date.toISOString(), limit)
        .all<TemporalRow>();

      return result.results.map(rowToItem);
    },

    async queryAfter(
      userId: string,
      date: Date,
      limit = 10
    ): Promise<TemporalItem[]> {
      const result = await db
        .prepare(
          `SELECT * FROM temporal_items
           WHERE user_id = ? AND occurred_at > ?
           ORDER BY occurred_at ASC
           LIMIT ?`
        )
        .bind(userId, date.toISOString(), limit)
        .all<TemporalRow>();

      return result.results.map(rowToItem);
    },

    async save(
      item: Omit<TemporalItem, "id" | "createdAt" | "updatedAt">
    ): Promise<TemporalItem> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT INTO temporal_items
           (id, user_id, content, occurred_at, event_type, ended_at, recurrence, confidence, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          item.userId,
          item.content,
          item.occurredAt.toISOString(),
          item.eventType,
          item.endedAt?.toISOString() || null,
          item.recurrence || null,
          item.confidence,
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

    async getRecurring(userId: string): Promise<TemporalItem[]> {
      const result = await db
        .prepare(
          `SELECT * FROM temporal_items
           WHERE user_id = ? AND event_type = 'recurring'
           ORDER BY occurred_at ASC`
        )
        .bind(userId)
        .all<TemporalRow>();

      return result.results.map(rowToItem);
    },
  };
}

// =============================================================================
// Row Mapping
// =============================================================================

interface TemporalRow {
  id: string;
  user_id: string;
  content: string;
  occurred_at: string;
  event_type: "event" | "deadline" | "recurring" | "duration";
  ended_at: string | null;
  recurrence: string | null;
  confidence: number;
  created_at: string;
  updated_at: string;
}

function rowToItem(row: TemporalRow): TemporalItem {
  return {
    id: row.id,
    userId: row.user_id,
    content: row.content,
    occurredAt: new Date(row.occurred_at),
    eventType: row.event_type,
    endedAt: row.ended_at ? new Date(row.ended_at) : undefined,
    recurrence: row.recurrence || undefined,
    confidence: row.confidence,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// =============================================================================
// Migration
// =============================================================================

export const TEMPORAL_MIGRATION = `
CREATE TABLE IF NOT EXISTS temporal_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('event', 'deadline', 'recurring', 'duration')),
  ended_at TEXT,
  recurrence TEXT,
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_temporal_user_time ON temporal_items(user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_temporal_type ON temporal_items(user_id, event_type);
`;
