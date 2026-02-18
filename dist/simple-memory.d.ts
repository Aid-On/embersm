/**
 * Simple EmbersM Factory - Best Benchmark Configuration
 *
 * Uses: Semantic (50) + Episode Keyword (15) + Recent (10)
 * No Query Router, no Temporal/Graph layers
 */
/**
 * Environment for Simple EmbersM (no KV required)
 */
export interface EmbersMSimpleEnv {
    /** D1 Database - any object with prepare() method */
    DB: {
        prepare: (query: string) => unknown;
    };
    /** Vectorize Index - any object with upsert/query methods */
    VECTORIZE: {
        upsert: unknown;
        query: unknown;
    };
    /** Workers AI - any object with run() method */
    AI: {
        run: unknown;
    };
}
/**
 * Simple EmbersM API - Best benchmark configuration
 */
export interface ExtractInput {
    userId: string;
    threadId: string;
    userMessage: string;
    assistantResponse: string;
    turnIndex: number;
}
export interface EmbersMSimple {
    query(userId: string, question: string): Promise<string>;
    extract(input: ExtractInput): Promise<void>;
    migrate(): Promise<void>;
}
/**
 * Create a Simple EmbersM instance using best benchmark configuration
 *
 * This configuration achieves 66-75% on LOCOMO benchmark (+25-34% vs Mem0)
 */
export declare function createEmbersMSimple(env: EmbersMSimpleEnv): EmbersMSimple;
//# sourceMappingURL=simple-memory.d.ts.map