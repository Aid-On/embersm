/**
 * EmbersM v2 - Core Types
 * 5-Layer Memory Architecture
 */
/** Minimal D1 Database interface */
export interface D1DatabaseLike {
    prepare(query: string): {
        bind(...values: unknown[]): {
            first<T = unknown>(): Promise<T | null>;
            all<T = unknown>(): Promise<{
                results: T[] | null;
            }>;
            run(): Promise<unknown>;
        };
    };
}
/** Minimal Vectorize Index interface */
export interface VectorizeIndexLike {
    upsert(vectors: unknown): Promise<unknown>;
    query(vector: unknown, options?: unknown): Promise<{
        matches: unknown[] | null;
    }>;
}
/** Minimal Workers AI interface */
export interface WorkersAILike {
    run(model: string, inputs: {
        text: string[];
    } | {
        messages?: Array<{
            role: string;
            content: string;
        }>;
        max_tokens?: number;
    }): Promise<{
        data?: number[][];
    } | {
        response?: string;
    } | unknown>;
}
export interface EmbersMEnv {
    KV: KVNamespace;
    DB: D1Database;
    VECTORIZE: VectorizeIndex;
    AI: Ai;
}
export interface MemoryItem {
    id: string;
    userId: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface FlashItem extends MemoryItem {
    role: "user" | "assistant" | "system";
    turnIndex: number;
}
export interface EpisodeItem extends MemoryItem {
    threadId: string;
    role: "user" | "assistant";
    turnIndex: number;
    summary?: string;
}
export interface SemanticItem extends MemoryItem {
    source: "episode" | "fact" | "entity";
    sourceId: string;
    embedding?: number[];
}
export interface TemporalItem extends MemoryItem {
    occurredAt: Date;
    eventType: "event" | "deadline" | "recurring" | "duration";
    endedAt?: Date;
    recurrence?: string;
    confidence: number;
}
export interface GraphItem extends MemoryItem {
    predicate: string;
    subject: string;
    object: string;
    confidence: number;
    sourceEpisodeId?: string;
}
export type QueryType = "factual" | "temporal" | "relational" | "contextual" | "hybrid";
export interface ClassifiedQuery {
    original: string;
    type: QueryType;
    entities: string[];
    temporalHints?: {
        type: "before" | "after" | "during" | "between";
        reference?: Date;
        rangeStart?: Date;
        rangeEnd?: Date;
    };
    confidence: number;
}
export interface RetrievedMemory {
    content: string;
    source: "flash" | "episode" | "semantic" | "temporal" | "graph";
    score: number;
    confidence: number;
    itemId: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}
export interface MemoryContext {
    query: ClassifiedQuery;
    memories: RetrievedMemory[];
    contextString: string;
    retrievalTimeMs: number;
    timing: {
        flash: number;
        episode: number;
        semantic: number;
        temporal: number;
        graph: number;
        fusion: number;
    };
}
export interface MemoryUpdates {
    episodes: EpisodeItem[];
    semantic: SemanticItem[];
    temporal: TemporalItem[];
    graph: GraphItem[];
    flashUpdated: boolean;
    extractionTimeMs: number;
}
export interface FlashStore {
    get(userId: string): Promise<FlashItem[]>;
    push(userId: string, item: Omit<FlashItem, "id" | "createdAt" | "updatedAt">): Promise<void>;
    clear(userId: string): Promise<void>;
}
export interface EpisodeStore {
    getByThread(threadId: string, limit?: number): Promise<EpisodeItem[]>;
    getByUser(userId: string, limit?: number): Promise<EpisodeItem[]>;
    save(item: Omit<EpisodeItem, "id" | "createdAt" | "updatedAt">): Promise<EpisodeItem>;
    search(userId: string, query: string, limit?: number): Promise<EpisodeItem[]>;
}
export interface SemanticStore {
    search(userId: string, query: string, topK?: number): Promise<SemanticItem[]>;
    index(item: Omit<SemanticItem, "id" | "createdAt" | "updatedAt">): Promise<SemanticItem>;
    indexBatch(items: Omit<SemanticItem, "id" | "createdAt" | "updatedAt">[]): Promise<SemanticItem[]>;
}
export interface TemporalStore {
    queryRange(userId: string, start: Date, end: Date): Promise<TemporalItem[]>;
    queryBefore(userId: string, date: Date, limit?: number): Promise<TemporalItem[]>;
    queryAfter(userId: string, date: Date, limit?: number): Promise<TemporalItem[]>;
    save(item: Omit<TemporalItem, "id" | "createdAt" | "updatedAt">): Promise<TemporalItem>;
    getRecurring(userId: string): Promise<TemporalItem[]>;
}
export interface GraphStore {
    queryBySubject(userId: string, subject: string): Promise<GraphItem[]>;
    queryByPredicate(userId: string, predicate: string): Promise<GraphItem[]>;
    queryByObject(userId: string, object: string): Promise<GraphItem[]>;
    traverse(userId: string, startEntity: string, maxHops?: number): Promise<GraphItem[]>;
    save(item: Omit<GraphItem, "id" | "createdAt" | "updatedAt">): Promise<GraphItem>;
    exists(userId: string, predicate: string, subject: string, object: string): Promise<boolean>;
}
export interface EmbersM {
    flash: FlashStore;
    episode: EpisodeStore;
    semantic: SemanticStore;
    temporal: TemporalStore;
    graph: GraphStore;
    query(userId: string, message: string): Promise<MemoryContext>;
    extract(userId: string, threadId: string, userMessage: string, assistantResponse: string): Promise<MemoryUpdates>;
    migrate(): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map