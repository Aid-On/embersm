/**
 * Simple EmbersM Factory - Best Benchmark Configuration
 *
 * Uses: Semantic (50) + Episode Keyword (15) + Recent (10)
 * No Query Router, no Temporal/Graph layers
 */
import { createEpisodeStore, createSemanticStore, EPISODE_MIGRATION, SEMANTIC_MIGRATION, } from "./stores";
import { extractKeywords } from "./keywords";
/**
 * Create a Simple EmbersM instance using best benchmark configuration
 *
 * This configuration achieves 66-75% on LOCOMO benchmark (+25-34% vs Mem0)
 */
export function createEmbersMSimple(env) {
    const db = env.DB;
    const vectorize = env.VECTORIZE;
    const ai = env.AI;
    const episode = createEpisodeStore(db);
    const semantic = createSemanticStore(vectorize, ai, db);
    return {
        async query(userId, question) {
            const parts = [];
            try {
                const semanticResults = await semantic.search(userId, question, 50);
                if (semanticResults.length > 0) {
                    const lines = semanticResults.map(r => r.content);
                    parts.push("## Semantic Matches\n" + lines.join("\n"));
                }
            }
            catch {
                /* semantic search may fail gracefully */
            }
            const keywords = extractKeywords(question);
            const keywordResults = [];
            for (const kw of keywords.slice(0, 3)) {
                const found = await episode.search(userId, kw, 5);
                for (const f of found) {
                    if (!keywordResults.includes(f.content)) {
                        keywordResults.push(f.content);
                    }
                }
            }
            if (keywordResults.length > 0) {
                parts.push("## Related Conversations\n" + keywordResults.slice(0, 15).join("\n"));
            }
            const recent = await episode.getByUser(userId, 10);
            if (recent.length > 0) {
                const lines = recent.map(r => r.content);
                parts.push("## Recent Context\n" + lines.join("\n"));
            }
            return parts.join("\n\n") || "No relevant memories found.";
        },
        async extract(input) {
            const { userId, threadId, userMessage, assistantResponse, turnIndex } = input;
            const userEpisode = await episode.save({
                userId,
                threadId,
                content: userMessage,
                role: "user",
                turnIndex: turnIndex * 2,
            });
            const assistantEpisode = await episode.save({
                userId,
                threadId,
                content: assistantResponse,
                role: "assistant",
                turnIndex: turnIndex * 2 + 1,
            });
            try {
                await Promise.all([
                    semantic.index({
                        userId,
                        content: userMessage,
                        source: "episode",
                        sourceId: userEpisode.id,
                    }),
                    semantic.index({
                        userId,
                        content: assistantResponse,
                        source: "episode",
                        sourceId: assistantEpisode.id,
                    }),
                ]);
            }
            catch {
                /* semantic indexing may fail gracefully */
            }
        },
        async migrate() {
            const migrations = [
                EPISODE_MIGRATION,
                SEMANTIC_MIGRATION,
            ];
            for (const migration of migrations) {
                const statements = migration
                    .split(";")
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
                for (const statement of statements) {
                    await db.prepare(statement).bind().run();
                }
            }
        },
    };
}
//# sourceMappingURL=simple-memory.js.map