/**
 * Context Building - Format memories for LLM consumption
 *
 * Extracted from fusion/index.ts for file size compliance.
 */
import type { RetrievedMemory, TemporalItem } from "../types";
/**
 * Format temporal item for context
 */
export declare function formatTemporalContent(item: TemporalItem): string;
/**
 * Build formatted context string for LLM
 */
export declare function buildContextString(memories: RetrievedMemory[], queryType: string): string;
//# sourceMappingURL=context-builder.d.ts.map