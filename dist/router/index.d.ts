/**
 * Query Router - Workers AI-based query classification
 *
 * Uses a small, fast model to classify queries and extract entities.
 * Routes to appropriate memory stores based on classification.
 * Target: <10ms latency
 */
import type { QueryType, ClassifiedQuery } from "../types";
export interface QueryRouterOptions {
    /** Override classification for testing */
    forceType?: QueryType;
}
export declare function createQueryRouter(ai: Ai): {
    /**
     * Classify a query and extract entities
     */
    classify(query: string, options?: QueryRouterOptions): Promise<ClassifiedQuery>;
    /**
     * Determine which stores to query based on classification
     */
    getStoresToQuery(classification: ClassifiedQuery): {
        flash: boolean;
        episode: boolean;
        semantic: boolean;
        temporal: boolean;
        graph: boolean;
    };
};
//# sourceMappingURL=index.d.ts.map