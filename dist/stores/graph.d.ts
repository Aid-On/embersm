/**
 * Graph Memory Store - D1-based relationship storage
 *
 * Prolog-style facts: predicate(subject, object)
 * Supports multi-hop traversal for relational queries.
 * ~5ms latency with proper indexing.
 */
import type { GraphStore } from "../types";
export declare function createGraphStore(db: D1Database): GraphStore;
export declare const GRAPH_MIGRATION = "\nCREATE TABLE IF NOT EXISTS graph_items (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  content TEXT NOT NULL,\n  predicate TEXT NOT NULL,\n  subject TEXT NOT NULL,\n  object TEXT NOT NULL,\n  confidence REAL NOT NULL DEFAULT 1.0,\n  source_episode_id TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_graph_subject ON graph_items(user_id, subject);\nCREATE INDEX IF NOT EXISTS idx_graph_predicate ON graph_items(user_id, predicate);\nCREATE INDEX IF NOT EXISTS idx_graph_object ON graph_items(user_id, object);\nCREATE UNIQUE INDEX IF NOT EXISTS idx_graph_unique ON graph_items(user_id, predicate, subject, object);\n";
//# sourceMappingURL=graph.d.ts.map