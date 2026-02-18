/**
 * Episode Memory Store - D1-based conversation history
 *
 * Full conversation history with thread organization.
 * ~5ms latency for indexed queries.
 */

import type { EpisodeStore, EpisodeItem } from "../types";

export function createEpisodeStore(db: D1Database): EpisodeStore {
  return {
    async getByThread(threadId: string, limit = 50): Promise<EpisodeItem[]> {
      const result = await db
        .prepare(
          `SELECT * FROM episodes
           WHERE thread_id = ?
           ORDER BY turn_index ASC
           LIMIT ?`
        )
        .bind(threadId, limit)
        .all<EpisodeRow>();

      return result.results.map(rowToItem);
    },

    async getByUser(userId: string, limit = 100): Promise<EpisodeItem[]> {
      const result = await db
        .prepare(
          `SELECT * FROM episodes
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .bind(userId, limit)
        .all<EpisodeRow>();

      return result.results.map(rowToItem);
    },

    async save(
      item: Omit<EpisodeItem, "id" | "createdAt" | "updatedAt">
    ): Promise<EpisodeItem> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT INTO episodes (id, user_id, thread_id, content, role, turn_index, summary, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          item.userId,
          item.threadId,
          item.content,
          item.role,
          item.turnIndex,
          item.summary || null,
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

    async search(
      userId: string,
      query: string,
      limit = 20
    ): Promise<EpisodeItem[]> {
      // Simple LIKE search - for better search use Semantic store
      const result = await db
        .prepare(
          `SELECT * FROM episodes
           WHERE user_id = ? AND content LIKE ?
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .bind(userId, `%${query}%`, limit)
        .all<EpisodeRow>();

      return result.results.map(rowToItem);
    },
  };
}

// =============================================================================
// Row Mapping
// =============================================================================

interface EpisodeRow {
  id: string;
  user_id: string;
  thread_id: string;
  content: string;
  role: "user" | "assistant";
  turn_index: number;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

function rowToItem(row: EpisodeRow): EpisodeItem {
  return {
    id: row.id,
    userId: row.user_id,
    threadId: row.thread_id,
    content: row.content,
    role: row.role,
    turnIndex: row.turn_index,
    summary: row.summary || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// =============================================================================
// Migration
// =============================================================================

export const EPISODE_MIGRATION = `
CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  content TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  turn_index INTEGER NOT NULL,
  summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_episodes_thread ON episodes(thread_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_episodes_user ON episodes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_content ON episodes(user_id, content);
`;
