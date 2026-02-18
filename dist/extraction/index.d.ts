/**
 * Memory Extraction - Extract memories from conversation turns
 *
 * Parallel extraction for all memory types:
 * - Episodes (always)
 * - Semantic indexing
 * - Temporal events
 * - Graph facts
 */
import type { EmbersMEnv, MemoryUpdates } from "../types";
export { extractFirstJson, extractConversationDate, parseAbsoluteDate, parseDate, } from "./date-utils";
export interface ExtractionOptions {
    skipTemporal?: boolean;
    skipGraph?: boolean;
    skipSemantic?: boolean;
}
export declare function createExtractor(env: EmbersMEnv): {
    extract(input: {
        userId: string;
        threadId: string;
        userMessage: string;
        assistantResponse: string;
    }, turnIndex: number, options?: ExtractionOptions): Promise<MemoryUpdates>;
};
//# sourceMappingURL=index.d.ts.map