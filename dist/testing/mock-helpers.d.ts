/**
 * Mock Helpers - D1 SQL parsing and Vectorize mock
 *
 * Extracted from mocks.ts for file size compliance.
 */
interface D1Row {
    [key: string]: unknown;
}
export declare function parseInsert(sql: string, bindings: unknown[]): {
    table: string;
    row: D1Row;
} | null;
export declare function parseSelect(sql: string, bindings: unknown[]): {
    table: string;
    where: Record<string, unknown>;
    limit?: number;
} | null;
export declare function matchesWhere(row: D1Row, where: Record<string, unknown>): boolean;
export interface VectorEntry {
    id: string;
    values: number[];
    metadata: Record<string, unknown>;
}
export declare function toNumberArray(values: number[] | VectorFloatArray): number[];
export declare function cosineSimilarity(a: number[], b: number[]): number;
export {};
//# sourceMappingURL=mock-helpers.d.ts.map