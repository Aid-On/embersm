/**
 * Episode Memory Store - D1-based conversation history
 *
 * Full conversation history with thread organization.
 * ~5ms latency for indexed queries.
 */
import type { EpisodeStore } from "../types";
export declare function createEpisodeStore(db: D1Database): EpisodeStore;
export declare const EPISODE_MIGRATION = "\nCREATE TABLE IF NOT EXISTS episodes (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  thread_id TEXT NOT NULL,\n  content TEXT NOT NULL,\n  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),\n  turn_index INTEGER NOT NULL,\n  summary TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_episodes_thread ON episodes(thread_id, turn_index);\nCREATE INDEX IF NOT EXISTS idx_episodes_user ON episodes(user_id, created_at DESC);\nCREATE INDEX IF NOT EXISTS idx_episodes_content ON episodes(user_id, content);\n";
//# sourceMappingURL=episode.d.ts.map