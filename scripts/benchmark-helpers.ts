/**
 * Benchmark Helpers
 * Extracted from benchmark.ts for file size compliance.
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
  category: "single_hop" | "multi_hop" | "temporal" | "open_domain" | "adversarial";
}

export interface LOCOMOData {
  conversations: Conversation[];
  questions: Question[];
}

export interface BenchmarkResult {
  questionId: string;
  category: string;
  question: string;
  expectedAnswer: string;
  generatedAnswer: string;
  isCorrect: boolean;
  memoryContext: string;
  timingMs: number;
}

export interface CloudflareCredentials {
  accountId: string;
  apiKey: string;
  email: string;
}

// =============================================================================
// Evaluation helpers
// =============================================================================

export const QA_SYSTEM_PROMPT = `You are a helpful assistant with access to a memory system.
Use the provided memory context to answer questions accurately.
If the answer is not in the memory, answer from your general knowledge.
Keep answers concise and direct.`;

export const JUDGE_SYSTEM_PROMPT = `You are an answer evaluator. Compare the generated answer to the expected answer.
Output ONLY "CORRECT" or "INCORRECT" (nothing else).

Rules:
- CORRECT if the generated answer conveys the same meaning as expected
- CORRECT if it contains the key information even with extra details
- CORRECT if it correctly says "don't know" when the expected answer indicates missing info
- INCORRECT if the meaning is different or contradicts the expected answer`;

export function fallbackEvaluate(generated: string, expected: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[,.!?()]/g, "").trim();
  const g = norm(generated);
  const e = norm(expected);
  return g.includes(e) || e.includes(g);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { log };
