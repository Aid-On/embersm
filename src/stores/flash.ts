/**
 * Flash Memory Store - KV-based ultra-fast recent context
 *
 * Stores the last N turns for immediate context retrieval.
 * ~1ms latency, perfect for "what did I just say" queries.
 */

import type { FlashStore, FlashItem } from "../types";

const FLASH_KEY_PREFIX = "flash:";
const MAX_TURNS = 10; // Keep last 10 turns

interface FlashData {
  items: FlashItem[];
  lastUpdated: string;
}

export function createFlashStore(kv: KVNamespace): FlashStore {
  const getKey = (userId: string) => `${FLASH_KEY_PREFIX}${userId}`;

  return {
    async get(userId: string): Promise<FlashItem[]> {
      const data = await kv.get<FlashData>(getKey(userId), "json");
      if (!data) return [];

      // Parse dates
      return data.items.map((item) => ({
        ...item,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      }));
    },

    async push(
      userId: string,
      item: Omit<FlashItem, "id" | "createdAt" | "updatedAt">
    ): Promise<void> {
      const existing = await this.get(userId);
      const now = new Date();

      const newItem: FlashItem = {
        ...item,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };

      // Add new item, keep only last MAX_TURNS
      const items = [...existing, newItem].slice(-MAX_TURNS);

      const data: FlashData = {
        items,
        lastUpdated: now.toISOString(),
      };

      // TTL of 1 hour - flash memory is ephemeral
      await kv.put(getKey(userId), JSON.stringify(data), {
        expirationTtl: 3600,
      });
    },

    async clear(userId: string): Promise<void> {
      await kv.delete(getKey(userId));
    },
  };
}
