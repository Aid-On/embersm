/**
 * Production Benchmark Helpers
 * Extracted from benchmark-prod.ts for file size compliance.
 */

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

export interface BenchmarkResult {
  id: string;
  category: string;
  correct: boolean;
  question: string;
  expected: string;
  generated: string;
  context: string;
}

export interface CfConfig {
  accountId: string;
  email: string;
  apiKey: string;
  d1DatabaseId: string;
  vectorizeIndex: string;
  embeddingModel: string;
  llmModel: string;
}

// =============================================================================
// Cloudflare API Helpers
// =============================================================================

export function createProdHelpers(config: CfConfig) {

  async function cfFetch(endpoint: string, options: RequestInit = {}): Promise<unknown> {
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
      throw new Error(`CF API error: ${response.status} - ${text}`);
    }
    return response.json();
  }

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

  async function vectorizeQueryFn(vector: number[], topK: number = 10): Promise<unknown[]> {
    const result = await cfFetch(`/vectorize/v2/indexes/${config.vectorizeIndex}/query`, {
      method: "POST",
      body: JSON.stringify({ vector, topK, returnMetadata: "all" }),
    }) as { result?: { matches?: unknown[] } };
    return result.result?.matches || [];
  }

  async function aiRun(model: string, input: unknown): Promise<unknown> {
    const result = await cfFetch(`/ai/run/${model}`, {
      method: "POST",
      body: JSON.stringify(input),
    }) as { result: unknown };
    return result.result;
  }

  async function getEmbedding(text: string): Promise<number[]> {
    const result = await aiRun(config.embeddingModel, { text: [text] }) as { data: number[][] };
    return result.data[0];
  }

  async function llmChat(systemPrompt: string, userPrompt: string): Promise<string> {
    const result = await aiRun(config.llmModel, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 512,
    }) as { response: string };
    return result.response;
  }

  return { d1Query, vectorizeInsert, vectorizeQuery: vectorizeQueryFn, getEmbedding, llmChat };
}

export function extractKeywords(query: string): string[] {
  const stopwords = new Set([
    "what", "when", "where", "who", "why", "how", "which",
    "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would",
    "the", "a", "an", "this", "that", "these", "those",
    "i", "you", "he", "she", "it", "we", "they",
    "my", "your", "his", "her", "its", "our", "their",
  ]);

  return query
    .toLowerCase()
    .replace(/[?.,!'"]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w))
    .slice(0, 5);
}

export { log };
