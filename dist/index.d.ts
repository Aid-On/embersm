/**
 * EmbersM v2 - Cloudflare Native Memory System
 *
 * 5-Layer Architecture:
 * 1. Flash Memory (KV) - Ultra-fast recent context
 * 2. Episode Memory (D1) - Full conversation history
 * 3. Semantic Memory (Vectorize) - Vector similarity search
 * 4. Temporal Memory (D1) - Time-indexed events
 * 5. Graph Memory (D1) - Relationships & reasoning
 */
export * from "./types";
export { createFlashStore, createEpisodeStore, createSemanticStore, createTemporalStore, createGraphStore, EPISODE_MIGRATION, SEMANTIC_MIGRATION, TEMPORAL_MIGRATION, GRAPH_MIGRATION, } from "./stores";
export { createQueryRouter } from "./router";
export { fuseMemories } from "./fusion";
export { createExtractor } from "./extraction";
export { createEmbersMSimple, type EmbersMSimpleEnv, type EmbersMSimple, } from "./simple-memory";
export { extractKeywords } from "./keywords";
import type { EmbersMEnv, EmbersM } from "./types";
/**
 * Create an EmbersM instance
 */
export declare function createEmbersM(env: EmbersMEnv): EmbersM;
//# sourceMappingURL=index.d.ts.map