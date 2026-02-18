/**
 * Local Mocks for Cloudflare Services
 *
 * In-memory implementations for testing and benchmarking.
 */
import { parseInsert, parseSelect, matchesWhere, toNumberArray, cosineSimilarity, } from "./mock-helpers";
// =============================================================================
// KV Mock (Flash Memory)
// =============================================================================
export function createMockKV() {
    const store = new Map();
    return {
        get: async (key, options) => {
            const entry = store.get(key);
            if (!entry)
                return null;
            if (entry.expiration && Date.now() > entry.expiration) {
                store.delete(key);
                return null;
            }
            if (options === "json" || options?.type === "json") {
                return JSON.parse(entry.value);
            }
            return entry.value;
        },
        put: async (key, value, options) => {
            const expiration = options?.expirationTtl
                ? Date.now() + options.expirationTtl * 1000
                : undefined;
            store.set(key, { value, expiration });
        },
        delete: async (key) => {
            store.delete(key);
        },
        list: async () => ({
            keys: Array.from(store.keys()).map((name) => ({ name })),
            list_complete: true,
            cacheStatus: null,
        }),
        getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
    };
}
const D1_META = {
    duration: 0, size_after: 0, rows_read: 0, rows_written: 0,
    last_row_id: 0, changed_db: false, changes: 0,
};
export function createMockD1() {
    const tables = new Map();
    const createStatement = (sql) => {
        let bindings = [];
        const stmt = {
            bind: (...args) => {
                bindings = args;
                return stmt;
            },
            all: async () => {
                const parsed = parseSelect(sql, bindings);
                if (!parsed)
                    return { results: [], success: true, meta: D1_META };
                const tableData = tables.get(parsed.table) || [];
                let results = tableData.filter((row) => matchesWhere(row, parsed.where));
                if (parsed.limit) {
                    results = results.slice(0, parsed.limit);
                }
                return { results: results, success: true, meta: D1_META };
            },
            first: async () => {
                const result = await stmt.all();
                return result.results[0] || null;
            },
            run: async () => {
                if (sql.match(/CREATE\s+(TABLE|INDEX)/i)) {
                    const tableMatch = sql.match(/(?:TABLE|ON)\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
                    if (tableMatch && !tables.has(tableMatch[1])) {
                        tables.set(tableMatch[1], []);
                    }
                    return { results: [], success: true, meta: D1_META };
                }
                const insertData = parseInsert(sql, bindings);
                if (insertData) {
                    if (!tables.has(insertData.table)) {
                        tables.set(insertData.table, []);
                    }
                    tables.get(insertData.table).push(insertData.row);
                    return { results: [], success: true, meta: D1_META };
                }
                return { results: [], success: true, meta: D1_META };
            },
            raw: (async () => []),
        };
        return stmt;
    };
    return {
        prepare: createStatement,
        dump: async () => new ArrayBuffer(0),
        batch: async (statements) => {
            const results = [];
            for (const stmt of statements) {
                results.push(await stmt.run());
            }
            return results;
        },
        exec: async (sql) => {
            const statements = sql.split(";").filter((s) => s.trim());
            for (const s of statements) {
                await createStatement(s).run();
            }
            return { count: statements.length, duration: 0 };
        },
    };
}
// =============================================================================
// Vectorize Mock (Semantic Memory vectors)
// =============================================================================
export function createMockVectorize() {
    const vectors = [];
    return {
        query: async (queryVector, options) => {
            const queryArr = toNumberArray(queryVector);
            let candidates = vectors;
            if (options?.filter) {
                candidates = candidates.filter((v) => {
                    for (const [key, value] of Object.entries(options.filter)) {
                        if (v.metadata[key] !== value)
                            return false;
                    }
                    return true;
                });
            }
            const scored = candidates.map((v) => ({
                id: v.id,
                score: cosineSimilarity(queryArr, v.values),
                metadata: options?.returnMetadata ? v.metadata : undefined,
            }));
            scored.sort((a, b) => b.score - a.score);
            const topK = options?.topK || 10;
            return { matches: scored.slice(0, topK), count: scored.length };
        },
        upsert: async (entries) => {
            for (const entry of entries) {
                const existing = vectors.findIndex((v) => v.id === entry.id);
                const values = toNumberArray(entry.values);
                if (existing >= 0) {
                    vectors[existing] = {
                        id: entry.id, values,
                        metadata: (entry.metadata || {}),
                    };
                }
                else {
                    vectors.push({
                        id: entry.id, values,
                        metadata: (entry.metadata || {}),
                    });
                }
            }
            return { count: entries.length };
        },
        insert: async (entries) => {
            for (const entry of entries) {
                vectors.push({
                    id: entry.id,
                    values: toNumberArray(entry.values),
                    metadata: (entry.metadata || {}),
                });
            }
            return { count: entries.length };
        },
        deleteByIds: async (ids) => {
            const idsSet = new Set(ids);
            const before = vectors.length;
            vectors.splice(0, vectors.length, ...vectors.filter((v) => !idsSet.has(v.id)));
            return { count: before - vectors.length };
        },
        getByIds: async (ids) => {
            const idsSet = new Set(ids);
            return vectors.filter((v) => idsSet.has(v.id));
        },
        describe: async () => ({
            dimensions: 768, vectorCount: vectors.length,
            processedUpToMutation: "", processedUpToDatetime: "",
        }),
    };
}
export function createMockAI(options = {}) {
    const embeddingDim = options.embeddingDim || 768;
    function hashEmbed(text) {
        const result = new Array(embeddingDim).fill(0);
        for (let i = 0; i < text.length; i++) {
            const idx = i % embeddingDim;
            result[idx] += text.charCodeAt(i) / 1000;
        }
        const norm = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
        return result.map((v) => v / (norm || 1));
    }
    return {
        run: async (model, input) => {
            if (model.includes("bge") || model.includes("embed")) {
                const texts = input.text;
                return { shape: [texts.length, embeddingDim], data: texts.map(hashEmbed) };
            }
            if (options.llmHandler) {
                const messages = input.messages;
                const response = await options.llmHandler(messages);
                return { response };
            }
            return { response: '{"type": "hybrid", "entities": [], "events": [], "facts": []}' };
        },
    };
}
export function createMockEnv(aiOptions) {
    return {
        KV: createMockKV(),
        DB: createMockD1(),
        VECTORIZE: createMockVectorize(),
        AI: createMockAI(aiOptions),
    };
}
//# sourceMappingURL=mocks.js.map