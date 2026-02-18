/**
 * Semantic Memory Store - Vectorize-based similarity search
 *
 * Vector embeddings for semantic similarity search.
 * ~10ms latency for similarity queries.
 */
import type { SemanticStore } from "../types";
export declare function createSemanticStore(vectorize: VectorizeIndex, ai: Ai, db: D1Database): SemanticStore;
export declare const SEMANTIC_MIGRATION = "\nCREATE TABLE IF NOT EXISTS semantic_items (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  content TEXT NOT NULL,\n  source TEXT NOT NULL CHECK (source IN ('episode', 'fact', 'entity')),\n  source_id TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_semantic_user ON semantic_items(user_id);\nCREATE INDEX IF NOT EXISTS idx_semantic_source ON semantic_items(source, source_id);\n";
//# sourceMappingURL=semantic.d.ts.map