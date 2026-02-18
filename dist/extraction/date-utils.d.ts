/**
 * Date/Temporal Parsing Utilities
 *
 * Extracted from extraction/index.ts for file size compliance.
 */
/**
 * Extract the first valid JSON object from a string
 * Handles cases where LLM adds extra text before/after JSON
 */
export declare function extractFirstJson(text: string): string | null;
/**
 * Extract conversation date from message prefix like "[Date: 1:56 pm on 8 May, 2023]"
 */
export declare function extractConversationDate(message: string): Date | null;
/**
 * Parse an absolute date string (not relative)
 */
export declare function parseAbsoluteDate(dateStr: string): Date | null;
/**
 * Parse date string, resolving relative dates from a context date
 */
export declare function parseDate(dateStr: string, contextDate?: Date): Date;
//# sourceMappingURL=date-utils.d.ts.map