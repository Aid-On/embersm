/**
 * Context Building - Format memories for LLM consumption
 *
 * Extracted from fusion/index.ts for file size compliance.
 */

import type { RetrievedMemory, TemporalItem } from "../types";

/**
 * Format temporal item for context
 */
export function formatTemporalContent(item: TemporalItem): string {
  const date = item.occurredAt.toISOString().split("T")[0];

  switch (item.eventType) {
    case "event":
      return `[${date}] ${item.content}`;
    case "deadline":
      return `[Deadline: ${date}] ${item.content}`;
    case "recurring":
      return `[Recurring: ${item.recurrence}] ${item.content}`;
    case "duration": {
      const endDate = item.endedAt?.toISOString().split("T")[0] || "ongoing";
      return `[${date} - ${endDate}] ${item.content}`;
    }
    default:
      return item.content;
  }
}

function formatSection(title: string, memories: RetrievedMemory[]): string {
  return `## ${title}\n` + memories.map((m) => m.content).join("\n");
}

function buildContextual(bySource: Record<string, RetrievedMemory[]>): string[] {
  const sections: string[] = [];
  if (bySource.flash.length > 0) sections.push(formatSection("Recent Conversation", bySource.flash));
  if (bySource.episode.length > 0) sections.push(formatSection("Earlier Context", bySource.episode));
  return sections;
}

function buildTemporal(bySource: Record<string, RetrievedMemory[]>): string[] {
  const sections: string[] = [];
  if (bySource.temporal.length > 0) sections.push(formatSection("Timeline", bySource.temporal));
  if (bySource.episode.length > 0) sections.push(formatSection("Related Conversations", bySource.episode));
  return sections;
}

function buildRelational(bySource: Record<string, RetrievedMemory[]>): string[] {
  const sections: string[] = [];
  if (bySource.graph.length > 0) sections.push(formatSection("Known Facts", bySource.graph));
  if (bySource.semantic.length > 0) sections.push(formatSection("Related Information", bySource.semantic));
  return sections;
}

function buildFactual(bySource: Record<string, RetrievedMemory[]>): string[] {
  const sections: string[] = [];
  if (bySource.semantic.length > 0) sections.push(formatSection("Relevant Memories", bySource.semantic));
  if (bySource.graph.length > 0) sections.push(formatSection("Known Facts", bySource.graph));
  return sections;
}

function buildDefault(bySource: Record<string, RetrievedMemory[]>): string[] {
  const sections: string[] = [];
  for (const [source, items] of Object.entries(bySource)) {
    if (items.length > 0) {
      const title = source.charAt(0).toUpperCase() + source.slice(1);
      sections.push(formatSection(`${title} Memory`, items));
    }
  }
  return sections;
}

/**
 * Build formatted context string for LLM
 */
export function buildContextString(
  memories: RetrievedMemory[],
  queryType: string
): string {
  if (memories.length === 0) {
    return "No relevant memories found.";
  }

  const bySource: Record<string, RetrievedMemory[]> = {
    flash: memories.filter((m) => m.source === "flash"),
    episode: memories.filter((m) => m.source === "episode"),
    semantic: memories.filter((m) => m.source === "semantic"),
    temporal: memories.filter((m) => m.source === "temporal"),
    graph: memories.filter((m) => m.source === "graph"),
  };

  const builders: Record<string, (s: Record<string, RetrievedMemory[]>) => string[]> = {
    contextual: buildContextual,
    temporal: buildTemporal,
    relational: buildRelational,
    factual: buildFactual,
  };

  const builder = builders[queryType] || buildDefault;
  return builder(bySource).join("\n\n");
}
