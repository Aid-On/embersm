/**
 * EmbersM v2 - Cloudflare Native Memory System
 *
 * 5-Layer Architecture:
 * 1. Flash Memory (KV) - Ultra-fast recent context
 * 2. Episode Memory (D1) - Full conversation history
 * 3. Semantic Memory (Vectorize) - Vector similarity search
 * 4. Temporal Memory (D1) - Time-indexed events
 * 5. Graph Memory (D1) - Relationships & reasoning
 */

// Re-export types
export * from "./types";

// Re-export stores
export {
  createFlashStore,
  createEpisodeStore,
  createSemanticStore,
  createTemporalStore,
  createGraphStore,
  EPISODE_MIGRATION,
  SEMANTIC_MIGRATION,
  TEMPORAL_MIGRATION,
  GRAPH_MIGRATION,
} from "./stores";

// Re-export router
export { createQueryRouter } from "./router";

// Re-export fusion
export { fuseMemories } from "./fusion";

// Re-export extraction
export { createExtractor } from "./extraction";

// Re-export simple memory
export {
  createEmbersMSimple,
  type EmbersMSimpleEnv,
  type EmbersMSimple,
} from "./simple-memory";

// Re-export keywords
export { extractKeywords } from "./keywords";

import type {
  EmbersMEnv,
  EmbersM,
  MemoryContext,
  MemoryUpdates,
  EpisodeItem,
} from "./types";

import {
  createFlashStore,
  createEpisodeStore,
  createSemanticStore,
  createTemporalStore,
  createGraphStore,
  EPISODE_MIGRATION,
  SEMANTIC_MIGRATION,
  TEMPORAL_MIGRATION,
  GRAPH_MIGRATION,
} from "./stores";

import { createQueryRouter } from "./router";
import { fuseMemories, type StoreResults } from "./fusion";
import { createExtractor } from "./extraction";
import { extractKeywords } from "./keywords";

// =============================================================================
// Factory
// =============================================================================

/**
 * Create an EmbersM instance
 */
export function createEmbersM(env: EmbersMEnv): EmbersM {
  const flash = createFlashStore(env.KV);
  const episode = createEpisodeStore(env.DB);
  const semantic = createSemanticStore(env.VECTORIZE, env.AI, env.DB);
  const temporal = createTemporalStore(env.DB);
  const graph = createGraphStore(env.DB);

  const router = createQueryRouter(env.AI);
  const extractor = createExtractor(env);

  const turnIndexCache = new Map<string, number>();

  return {
    flash,
    episode,
    semantic,
    temporal,
    graph,

    async query(userId: string, message: string): Promise<MemoryContext> {
      const classification = await router.classify(message);
      const storesToQuery = router.getStoresToQuery(classification);

      const timing = { flash: 0, episode: 0, semantic: 0, temporal: 0, graph: 0 };
      const results: StoreResults = {
        flash: [], episode: [], semantic: [], temporal: [], graph: [], timing,
      };

      const fetchPromises: Promise<void>[] = [];
      const ctx = { results, timing };

      if (storesToQuery.flash) {
        fetchPromises.push(fetchFlash(flash, userId, ctx));
      }
      if (storesToQuery.episode) {
        fetchPromises.push(fetchEpisodes(episode, userId, { message, classification, ...ctx }));
      }
      if (storesToQuery.semantic) {
        fetchPromises.push(fetchSemantic(semantic, userId, { message, ...ctx }));
      }
      if (storesToQuery.temporal) {
        fetchPromises.push(fetchTemporal(temporal, userId, { classification, ...ctx }));
      }
      if (storesToQuery.graph) {
        fetchPromises.push(fetchGraph(graph, userId, { classification, ...ctx }));
      }

      await Promise.all(fetchPromises);
      return fuseMemories(classification, results);
    },

    async extract(
      userId: string,
      threadId: string,
      userMessage: string,
      assistantResponse: string
    ): Promise<MemoryUpdates> {
      const currentTurn = turnIndexCache.get(threadId) || 0;
      turnIndexCache.set(threadId, currentTurn + 1);

      const updates = await extractor.extract(
        { userId, threadId, userMessage, assistantResponse }, currentTurn
      );

      const savePromises: Promise<void>[] = [];

      for (const ep of updates.episodes) {
        savePromises.push(episode.save(ep).then(() => { /* fire and forget */ }));
      }
      if (updates.semantic.length > 0) {
        savePromises.push(semantic.indexBatch(updates.semantic).then(() => { /* fire and forget */ }));
      }
      for (const t of updates.temporal) {
        savePromises.push(temporal.save(t).then(() => { /* fire and forget */ }));
      }
      for (const g of updates.graph) {
        savePromises.push(saveGraphIfNew(graph, userId, g));
      }

      savePromises.push(
        flash.push(userId, { userId, content: userMessage, role: "user", turnIndex: currentTurn * 2 })
      );
      savePromises.push(
        flash.push(userId, { userId, content: assistantResponse, role: "assistant", turnIndex: currentTurn * 2 + 1 })
      );

      await Promise.all(savePromises);
      return updates;
    },

    async migrate(): Promise<void> {
      const migrations = [EPISODE_MIGRATION, SEMANTIC_MIGRATION, TEMPORAL_MIGRATION, GRAPH_MIGRATION];
      for (const migration of migrations) {
        const statements = migration.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
        for (const statement of statements) {
          await env.DB.prepare(statement).run();
        }
      }
    },
  };
}

// =============================================================================
// Fetch helpers (keep main function body compact)
// =============================================================================

interface FetchCtx {
  results: StoreResults;
  timing: StoreResults["timing"];
}

async function fetchFlash(
  flash: ReturnType<typeof createFlashStore>,
  userId: string,
  ctx: FetchCtx
): Promise<void> {
  const start = Date.now();
  ctx.results.flash = await flash.get(userId);
  ctx.timing.flash = Date.now() - start;
}

async function fetchEpisodes(
  episode: ReturnType<typeof createEpisodeStore>,
  userId: string,
  opts: FetchCtx & { message: string; classification: { entities: string[] } }
): Promise<void> {
  const start = Date.now();
  const recent = await episode.getByUser(userId, 20);
  const searchResults: EpisodeItem[] = [];

  const terms = [...opts.classification.entities, ...extractKeywords(opts.message)];
  for (const term of terms) {
    const limit = opts.classification.entities.includes(term) ? 10 : 5;
    const found = await episode.search(userId, term, limit);
    addUniqueEpisodes(searchResults, found, recent);
  }

  opts.results.episode = [...recent, ...searchResults.slice(0, 20)];
  opts.timing.episode = Date.now() - start;
}

function addUniqueEpisodes(
  target: EpisodeItem[],
  found: EpisodeItem[],
  exclude: EpisodeItem[]
): void {
  for (const item of found) {
    if (!target.find((s) => s.id === item.id) && !exclude.find((r) => r.id === item.id)) {
      target.push(item);
    }
  }
}

async function fetchSemantic(
  semantic: ReturnType<typeof createSemanticStore>,
  userId: string,
  opts: FetchCtx & { message: string }
): Promise<void> {
  const start = Date.now();
  opts.results.semantic = await semantic.search(userId, opts.message, 10);
  opts.timing.semantic = Date.now() - start;
}

async function fetchTemporal(
  temporal: ReturnType<typeof createTemporalStore>,
  userId: string,
  opts: FetchCtx & { classification: { temporalHints?: { reference?: Date } } }
): Promise<void> {
  const start = Date.now();
  if (opts.classification.temporalHints?.reference) {
    const ref = opts.classification.temporalHints.reference;
    const weekBefore = new Date(ref.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAfter = new Date(ref.getTime() + 7 * 24 * 60 * 60 * 1000);
    opts.results.temporal = await temporal.queryRange(userId, weekBefore, weekAfter);
  } else {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    opts.results.temporal = await temporal.queryAfter(userId, thirtyDaysAgo, 20);
  }
  opts.timing.temporal = Date.now() - start;
}

async function fetchGraph(
  graphStore: ReturnType<typeof createGraphStore>,
  userId: string,
  opts: FetchCtx & { classification: { entities: string[] } }
): Promise<void> {
  const start = Date.now();
  const allFacts: typeof opts.results.graph = [];
  for (const entity of opts.classification.entities) {
    const facts = await graphStore.traverse(userId, entity, 2);
    for (const fact of facts) {
      if (!allFacts.find((f) => f.id === fact.id)) {
        allFacts.push(fact);
      }
    }
  }
  opts.results.graph = allFacts;
  opts.timing.graph = Date.now() - start;
}

async function saveGraphIfNew(
  graphStore: ReturnType<typeof createGraphStore>,
  userId: string,
  g: Parameters<typeof graphStore.save>[0] & { predicate: string; subject: string; object: string }
): Promise<void> {
  const exists = await graphStore.exists(userId, g.predicate, g.subject, g.object);
  if (!exists) {
    await graphStore.save(g);
  }
}
