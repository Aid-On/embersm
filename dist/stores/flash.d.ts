/**
 * Flash Memory Store - KV-based ultra-fast recent context
 *
 * Stores the last N turns for immediate context retrieval.
 * ~1ms latency, perfect for "what did I just say" queries.
 */
import type { FlashStore } from "../types";
export declare function createFlashStore(kv: KVNamespace): FlashStore;
//# sourceMappingURL=flash.d.ts.map