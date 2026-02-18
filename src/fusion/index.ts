/**
 * Memory Fusion - Rank and merge memories from multiple sources
 *
 * Combines results from 5 memory stores with intelligent ranking.
 * Target: <5ms after all stores return
 */

import type {
  RetrievedMemory,
  MemoryContext,
  ClassifiedQuery,
  FlashItem,
  EpisodeItem,
  SemanticItem,
  TemporalItem,
  GraphItem,
} from "../types";

import { formatTemporalContent, buildContextString } from "./context-builder";

// Re-export context builder utilities
export { formatTemporalContent, buildContextString } from "./context-builder";

export interface FusionConfig {
  maxMemories: number;
  weights: {
    flash: number;
    episode: number;
    semantic: number;
    temporal: number;
    graph: number;
  };
}

const DEFAULT_CONFIG: FusionConfig = {
  maxMemories: 20,
  weights: {
    flash: 1.5,
    episode: 1.0,
    semantic: 1.2,
    temporal: 1.3,
    graph: 1.1,
  },
};

export interface StoreResults {
  flash: FlashItem[];
  episode: EpisodeItem[];
  semantic: Array<SemanticItem & { score?: number }>;
  temporal: TemporalItem[];
  graph: GraphItem[];
  timing: {
    flash: number;
    episode: number;
    semantic: number;
    temporal: number;
    graph: number;
  };
}

/**
 * Fuse memories from multiple sources into ranked context
 */
export function fuseMemories(
  query: ClassifiedQuery,
  results: StoreResults,
  config: FusionConfig = DEFAULT_CONFIG
): MemoryContext {
  const startTime = Date.now();
  const memories: RetrievedMemory[] = [];

  for (const item of results.flash) {
    memories.push({
      content: `[${item.role}] ${item.content}`,
      source: "flash",
      score: calculateFlashScore(item, results.flash.length),
      confidence: 1.0,
      itemId: item.id,
      timestamp: item.createdAt,
      metadata: { role: item.role, turnIndex: item.turnIndex },
    });
  }

  for (const item of results.episode) {
    memories.push({
      content: item.summary || item.content,
      source: "episode",
      score: calculateRecencyScore(item.createdAt),
      confidence: 1.0,
      itemId: item.id,
      timestamp: item.createdAt,
      metadata: { threadId: item.threadId, role: item.role },
    });
  }

  for (const item of results.semantic) {
    memories.push({
      content: item.content,
      source: "semantic",
      score: item.score || 0.5,
      confidence: 1.0,
      itemId: item.id,
      timestamp: item.createdAt,
      metadata: { sourceType: item.source, sourceId: item.sourceId },
    });
  }

  for (const item of results.temporal) {
    memories.push({
      content: formatTemporalContent(item),
      source: "temporal",
      score: calculateTemporalScore(item, query),
      confidence: item.confidence,
      itemId: item.id,
      timestamp: item.occurredAt,
      metadata: { eventType: item.eventType },
    });
  }

  for (const item of results.graph) {
    memories.push({
      content: `${item.predicate}(${item.subject}, ${item.object})`,
      source: "graph",
      score: calculateGraphScore(item, query),
      confidence: item.confidence,
      itemId: item.id,
      timestamp: item.createdAt,
      metadata: { predicate: item.predicate },
    });
  }

  for (const memory of memories) {
    memory.score *= config.weights[memory.source];
  }

  memories.sort((a, b) => b.score - a.score);

  const topMemories = memories.slice(0, config.maxMemories);
  const contextString = buildContextString(topMemories, query.type);
  const fusionTime = Date.now() - startTime;

  return {
    query,
    memories: topMemories,
    contextString,
    retrievalTimeMs:
      Math.max(
        results.timing.flash,
        results.timing.episode,
        results.timing.semantic,
        results.timing.temporal,
        results.timing.graph
      ) + fusionTime,
    timing: {
      ...results.timing,
      fusion: fusionTime,
    },
  };
}

// =============================================================================
// Scoring Functions
// =============================================================================

function calculateFlashScore(item: FlashItem, totalItems: number): number {
  return 0.5 + (item.turnIndex / totalItems) * 0.5;
}

function calculateRecencyScore(timestamp: Date): number {
  const ageMs = Date.now() - timestamp.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  return Math.exp(-ageHours / 24);
}

function calculateTemporalScore(
  item: TemporalItem,
  query: ClassifiedQuery
): number {
  let score = item.confidence;

  if (query.type === "temporal") {
    score *= 1.5;
  }

  if (query.temporalHints?.reference) {
    const refTime = query.temporalHints.reference.getTime();
    const itemTime = item.occurredAt.getTime();
    const diff = Math.abs(refTime - itemTime);
    const daysDiff = diff / (1000 * 60 * 60 * 24);
    score *= Math.exp(-daysDiff / 30);
  }

  return score;
}

function calculateGraphScore(item: GraphItem, query: ClassifiedQuery): number {
  let score = item.confidence;

  const queryEntities = query.entities.map((e) => e.toLowerCase());
  if (
    queryEntities.includes(item.subject.toLowerCase()) ||
    queryEntities.includes(item.object.toLowerCase())
  ) {
    score *= 1.5;
  }

  if (query.type === "relational") {
    score *= 1.3;
  }

  return score;
}
