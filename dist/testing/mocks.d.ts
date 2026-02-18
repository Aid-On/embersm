/**
 * Local Mocks for Cloudflare Services
 *
 * In-memory implementations for testing and benchmarking.
 */
export declare function createMockKV(): KVNamespace;
export declare function createMockD1(): D1Database;
export declare function createMockVectorize(): VectorizeIndex;
export interface MockAIOptions {
    llmHandler?: (messages: Array<{
        role: string;
        content: string;
    }>) => Promise<string>;
    embeddingDim?: number;
}
export declare function createMockAI(options?: MockAIOptions): Ai;
export interface MockEnv {
    KV: KVNamespace;
    DB: D1Database;
    VECTORIZE: VectorizeIndex;
    AI: Ai;
}
export declare function createMockEnv(aiOptions?: MockAIOptions): MockEnv;
//# sourceMappingURL=mocks.d.ts.map