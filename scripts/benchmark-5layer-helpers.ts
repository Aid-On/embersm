/**
 * 5-Layer Architecture Benchmark Helpers
 * Extracted from benchmark-5layer.ts for file size compliance.
 */

import {
  callCloudflareRest,
  type Credentials,
} from "@aid-on/unilmp";

const log = (...args: unknown[]) => { process.stdout.write(args.map(String).join(' ') + '\n'); };

// =============================================================================
// Types
// =============================================================================

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface Conversation {
  id: string;
  messages: Message[];
}

export interface Question {
  id: string;
  conversation_id: string;
  question: string;
  answer: string;
  category: string;
}

export interface LOCOMOData {
  conversations: Conversation[];
  questions: Question[];
}

export type QueryType = "factual" | "temporal" | "relational" | "contextual" | "hybrid";

export interface TemporalItem {
  id: string;
  content: string;
  occurred_at: string;
  event_type: string;
  confidence: number;
}

export interface GraphItem {
  id: string;
  predicate: string;
  subject: string;
  object: string;
  confidence: number;
  content: string;
}

export interface BenchmarkResult {
  id: string;
  category: string;
  correct: boolean;
  question: string;
  expected: string;
  generated: string;
}

export interface CfConfig {
  accountId: string;
  email: string;
  apiKey: string;
  d1DatabaseId: string;
  vectorizeIndex: string;
  embeddingModel: string;
}

// =============================================================================
// Cloudflare API Helpers
// =============================================================================

function makeCfFetch(config: CfConfig) {
  return async function cfFetch(endpoint: string, options: RequestInit = {}): Promise<unknown> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "X-Auth-Email": config.email,
        "X-Auth-Key": config.apiKey,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`CF API error: ${response.status} - ${text.slice(0, 200)}`);
    }

    return response.json();
  };
}

export function createCfHelpers(config: CfConfig) {
  const cfFetch = makeCfFetch(config);

  async function d1Query(sql: string, params: unknown[] = []): Promise<unknown[]> {
    const result = await cfFetch(`/d1/database/${config.d1DatabaseId}/query`, {
      method: "POST",
      body: JSON.stringify({ sql, params }),
    }) as { result?: Array<{ results?: unknown[] }> };
    return result.result?.[0]?.results || [];
  }

  async function vectorizeInsert(vectors: { id: string; values: number[]; metadata: Record<string, unknown> }[]): Promise<void> {
    await cfFetch(`/vectorize/v2/indexes/${config.vectorizeIndex}/insert`, {
      method: "POST",
      body: JSON.stringify({ vectors }),
    });
  }

  async function vectorizeQuery(vector: number[], topK: number = 10): Promise<unknown[]> {
    const result = await cfFetch(`/vectorize/v2/indexes/${config.vectorizeIndex}/query`, {
      method: "POST",
      body: JSON.stringify({ vector, topK, returnMetadata: "all" }),
    }) as { result?: { matches?: unknown[] } };
    return result.result?.matches || [];
  }

  async function getEmbedding(text: string): Promise<number[]> {
    const result = await cfFetch(`/ai/run/${config.embeddingModel}`, {
      method: "POST",
      body: JSON.stringify({ text: [text] }),
    }) as { result: { data: number[][] } };
    return result.result.data[0];
  }

  return { d1Query, vectorizeInsert, vectorizeQuery, getEmbedding };
}

export async function llmChat(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  credentials: Credentials
): Promise<string> {
  const result = await callCloudflareRest(
    model,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    credentials
  );
  return result.result.response;
}

// =============================================================================
// Query Router
// =============================================================================

export function classifyQuery(query: string): QueryType {
  const lower = query.toLowerCase();

  const temporalKeywords = ["when", "before", "after", "during", "last week", "yesterday", "year", "month", "date", "time"];
  const relationalKeywords = ["who is", "connection", "related", "relationship", "between", "likely", "would"];
  const contextualKeywords = ["just said", "repeat", "what did i", "mentioned", "earlier"];

  if (contextualKeywords.some(kw => lower.includes(kw))) return "contextual";
  if (temporalKeywords.some(kw => lower.includes(kw))) return "temporal";
  if (relationalKeywords.some(kw => lower.includes(kw))) return "relational";
  return "factual";
}

export function getStoresToQuery(type: QueryType) {
  switch (type) {
    case "factual":
      return { episode: true, semantic: true, temporal: false, graph: true };
    case "temporal":
      return { episode: true, semantic: true, temporal: true, graph: false };
    case "relational":
      return { episode: true, semantic: true, temporal: false, graph: true };
    case "contextual":
      return { episode: true, semantic: false, temporal: false, graph: false };
    default:
      return { episode: true, semantic: true, temporal: false, graph: true };
  }
}

// =============================================================================
// Extraction Helpers
// =============================================================================

export const TEMPORAL_PROMPT = `Extract time-related events from the message.
Output JSON only: {"events": [{"content": "description", "occurred_at": "date", "event_type": "event", "confidence": 0.8}]}
If no events, return {"events": []}`;

export const GRAPH_PROMPT = `Extract factual relationships as Prolog-style facts.
Format: predicate(subject, object)

Examples:
- "I painted a lake sunrise" -> {"facts": [{"predicate": "painted", "subject": "speaker", "object": "lake sunrise"}]}
- "I went to a LGBTQ support group" -> {"facts": [{"predicate": "attended", "subject": "speaker", "object": "LGBTQ support group"}]}

Output JSON only: {"facts": [{"predicate": "verb", "subject": "person", "object": "thing", "confidence": 0.8}]}
If no facts, return {"facts": []}`;

function processJsonChar(
  char: string,
  state: { depth: number; inString: boolean; escape: boolean }
): boolean {
  if (state.escape) { state.escape = false; return false; }
  if (char === "\\") { state.escape = true; return false; }
  if (char === '"') { state.inString = !state.inString; return false; }
  if (state.inString) return false;
  if (char === "{") state.depth++;
  if (char === "}") {
    state.depth--;
    return state.depth === 0;
  }
  return false;
}

export function extractFirstJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  const state = { depth: 0, inString: false, escape: false };
  for (let i = start; i < text.length; i++) {
    if (processJsonChar(text[i], state)) return text.slice(start, i + 1);
  }
  return null;
}

export function extractConversationDate(message: string): Date | null {
  const dateMatch = message.match(/\[Date:\s*([^\]]+)\]/i);
  if (!dateMatch) return null;

  const dateStr = dateMatch[1].trim().replace(/^\d+:\d+\s*(am|pm)\s*on\s*/i, "").trim();
  const dayMonthYear = dateStr.match(/(\d{1,2})\s+(\w+),?\s+(\d{4})/);
  if (dayMonthYear) {
    const months: Record<string, number> = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
    const monthNum = months[dayMonthYear[2].toLowerCase()];
    if (monthNum !== undefined) {
      return new Date(parseInt(dayMonthYear[3]), monthNum, parseInt(dayMonthYear[1]));
    }
  }
  return null;
}

export function extractSpeaker(message: string): string | null {
  const match = message.match(/\[(\w+)\]:/);
  return match ? match[1] : null;
}

export function resolveDate(dateStr: string, contextDate: Date | null): string {
  const lower = dateStr.toLowerCase();
  const base = contextDate || new Date();

  if (lower === "yesterday") {
    const d = new Date(base); d.setDate(d.getDate() - 1); return d.toISOString();
  }
  if (lower.includes("last week")) {
    const d = new Date(base); d.setDate(d.getDate() - 7); return d.toISOString();
  }
  if (lower.includes("last year")) {
    const d = new Date(base); d.setFullYear(d.getFullYear() - 1); return d.toISOString();
  }
  if (lower.includes("last month")) {
    const d = new Date(base); d.setMonth(d.getMonth() - 1); return d.toISOString();
  }

  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();
  return base.toISOString();
}

export function extractKeywords(query: string): string[] {
  const stopwords = new Set(["what", "when", "where", "who", "why", "how", "which", "is", "are", "was", "were", "the", "a", "an", "this", "that", "i", "you", "my", "your"]);
  return query.toLowerCase().replace(/[?.,!'"]/g, "").split(/\s+/).filter(w => w.length > 2 && !stopwords.has(w)).slice(0, 5);
}

export { log };
