/**
 * Memory Fusion - Rank and merge memories from multiple sources
 *
 * Combines results from 5 memory stores with intelligent ranking.
 * Target: <5ms after all stores return
 */
import type { MemoryContext, ClassifiedQuery, FlashItem, EpisodeItem, SemanticItem, TemporalItem, GraphItem } from "../types";
export { formatTemporalContent, buildContextString } from "./context-builder";
export interface FusionConfig {
    maxMemories: number;
    weights: {
        flash: number;
        episode: number;
        semantic: number;
        temporal: number;
        graph: number;
    };
}
export interface StoreResults {
    flash: FlashItem[];
    episode: EpisodeItem[];
    semantic: Array<SemanticItem & {
        score?: number;
    }>;
    temporal: TemporalItem[];
    graph: GraphItem[];
    timing: {
        flash: number;
        episode: number;
        semantic: number;
        temporal: number;
        graph: number;
    };
}
/**
 * Fuse memories from multiple sources into ranked context
 */
export declare function fuseMemories(query: ClassifiedQuery, results: StoreResults, config?: FusionConfig): MemoryContext;
//# sourceMappingURL=index.d.ts.map