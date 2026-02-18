/**
 * Flash Memory Store - KV-based ultra-fast recent context
 *
 * Stores the last N turns for immediate context retrieval.
 * ~1ms latency, perfect for "what did I just say" queries.
 */
const FLASH_KEY_PREFIX = "flash:";
const MAX_TURNS = 10; // Keep last 10 turns
export function createFlashStore(kv) {
    const getKey = (userId) => `${FLASH_KEY_PREFIX}${userId}`;
    return {
        async get(userId) {
            const data = await kv.get(getKey(userId), "json");
            if (!data)
                return [];
            // Parse dates
            return data.items.map((item) => ({
                ...item,
                createdAt: new Date(item.createdAt),
                updatedAt: new Date(item.updatedAt),
            }));
        },
        async push(userId, item) {
            const existing = await this.get(userId);
            const now = new Date();
            const newItem = {
                ...item,
                id: crypto.randomUUID(),
                createdAt: now,
                updatedAt: now,
            };
            // Add new item, keep only last MAX_TURNS
            const items = [...existing, newItem].slice(-MAX_TURNS);
            const data = {
                items,
                lastUpdated: now.toISOString(),
            };
            // TTL of 1 hour - flash memory is ephemeral
            await kv.put(getKey(userId), JSON.stringify(data), {
                expirationTtl: 3600,
            });
        },
        async clear(userId) {
            await kv.delete(getKey(userId));
        },
    };
}
//# sourceMappingURL=flash.js.map