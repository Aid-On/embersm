/**
 * Semantic Memory Store - Vectorize-based similarity search
 *
 * Vector embeddings for semantic similarity search.
 * ~10ms latency for similarity queries.
 */
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
export function createSemanticStore(vectorize, ai, db) {
    /**
     * Generate embedding using Workers AI
     */
    async function embed(text) {
        const result = await ai.run(EMBEDDING_MODEL, { text: [text] });
        return result.data[0];
    }
    return {
        async search(userId, query, topK = 10) {
            // Generate query embedding
            const queryEmbedding = await embed(query);
            // Search Vectorize with user filter
            const results = await vectorize.query(queryEmbedding, {
                topK,
                filter: { user_id: userId },
                returnMetadata: "all",
            });
            if (!results.matches || results.matches.length === 0) {
                return [];
            }
            // Get full items from D1
            const ids = results.matches.map((m) => m.id);
            const placeholders = ids.map(() => "?").join(",");
            const dbResults = await db
                .prepare(`SELECT * FROM semantic_items WHERE id IN (${placeholders})`)
                .bind(...ids)
                .all();
            // Map with scores
            const scoreMap = new Map(results.matches.map((m) => [m.id, m.score]));
            return dbResults.results
                .map((row) => ({
                ...rowToItem(row),
                // Attach score for ranking
                _score: scoreMap.get(row.id) || 0,
            }))
                .sort((a, b) => (b._score || 0) - (a._score || 0))
                .map(({ _score, ...item }) => item);
        },
        async index(item) {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            // Generate embedding
            const embedding = await embed(item.content);
            // Store in Vectorize
            await vectorize.upsert([
                {
                    id,
                    values: embedding,
                    metadata: {
                        user_id: item.userId,
                        source: item.source,
                        source_id: item.sourceId,
                    },
                },
            ]);
            // Store metadata in D1
            await db
                .prepare(`INSERT INTO semantic_items (id, user_id, content, source, source_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`)
                .bind(id, item.userId, item.content, item.source, item.sourceId, now, now)
                .run();
            return {
                ...item,
                id,
                createdAt: new Date(now),
                updatedAt: new Date(now),
            };
        },
        async indexBatch(items) {
            if (items.length === 0)
                return [];
            const now = new Date().toISOString();
            const results = [];
            // Generate all embeddings in parallel (batch)
            const texts = items.map((i) => i.content);
            const embeddingResult = await ai.run(EMBEDDING_MODEL, { text: texts });
            const embeddings = embeddingResult.data;
            // Prepare vectors and DB rows
            const vectors = [];
            const dbInserts = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const id = crypto.randomUUID();
                vectors.push({
                    id,
                    values: embeddings[i],
                    metadata: {
                        user_id: item.userId,
                        source: item.source,
                        source_id: item.sourceId,
                    },
                });
                dbInserts.push(db
                    .prepare(`INSERT INTO semantic_items (id, user_id, content, source, source_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`)
                    .bind(id, item.userId, item.content, item.source, item.sourceId, now, now)
                    .run());
                results.push({
                    ...item,
                    id,
                    createdAt: new Date(now),
                    updatedAt: new Date(now),
                });
            }
            // Execute in parallel
            await Promise.all([vectorize.upsert(vectors), ...dbInserts]);
            return results;
        },
    };
}
function rowToItem(row) {
    return {
        id: row.id,
        userId: row.user_id,
        content: row.content,
        source: row.source,
        sourceId: row.source_id,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    };
}
// =============================================================================
// Migration
// =============================================================================
export const SEMANTIC_MIGRATION = `
CREATE TABLE IF NOT EXISTS semantic_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('episode', 'fact', 'entity')),
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_semantic_user ON semantic_items(user_id);
CREATE INDEX IF NOT EXISTS idx_semantic_source ON semantic_items(source, source_id);
`;
//# sourceMappingURL=semantic.js.map