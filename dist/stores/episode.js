/**
 * Episode Memory Store - D1-based conversation history
 *
 * Full conversation history with thread organization.
 * ~5ms latency for indexed queries.
 */
export function createEpisodeStore(db) {
    return {
        async getByThread(threadId, limit = 50) {
            const result = await db
                .prepare(`SELECT * FROM episodes
           WHERE thread_id = ?
           ORDER BY turn_index ASC
           LIMIT ?`)
                .bind(threadId, limit)
                .all();
            return result.results.map(rowToItem);
        },
        async getByUser(userId, limit = 100) {
            const result = await db
                .prepare(`SELECT * FROM episodes
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT ?`)
                .bind(userId, limit)
                .all();
            return result.results.map(rowToItem);
        },
        async save(item) {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            await db
                .prepare(`INSERT INTO episodes (id, user_id, thread_id, content, role, turn_index, summary, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .bind(id, item.userId, item.threadId, item.content, item.role, item.turnIndex, item.summary || null, now, now)
                .run();
            return {
                ...item,
                id,
                createdAt: new Date(now),
                updatedAt: new Date(now),
            };
        },
        async search(userId, query, limit = 20) {
            // Simple LIKE search - for better search use Semantic store
            const result = await db
                .prepare(`SELECT * FROM episodes
           WHERE user_id = ? AND content LIKE ?
           ORDER BY created_at DESC
           LIMIT ?`)
                .bind(userId, `%${query}%`, limit)
                .all();
            return result.results.map(rowToItem);
        },
    };
}
function rowToItem(row) {
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
//# sourceMappingURL=episode.js.map