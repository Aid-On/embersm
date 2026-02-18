/**
 * Temporal Memory Store - D1-based time-indexed events
 *
 * Time-aware memory for "when did X happen" queries.
 * ~5ms latency with proper indexing.
 */
import type { TemporalStore } from "../types";
export declare function createTemporalStore(db: D1Database): TemporalStore;
export declare const TEMPORAL_MIGRATION = "\nCREATE TABLE IF NOT EXISTS temporal_items (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  content TEXT NOT NULL,\n  occurred_at TEXT NOT NULL,\n  event_type TEXT NOT NULL CHECK (event_type IN ('event', 'deadline', 'recurring', 'duration')),\n  ended_at TEXT,\n  recurrence TEXT,\n  confidence REAL NOT NULL DEFAULT 1.0,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_temporal_user_time ON temporal_items(user_id, occurred_at);\nCREATE INDEX IF NOT EXISTS idx_temporal_type ON temporal_items(user_id, event_type);\n";
//# sourceMappingURL=temporal.d.ts.map