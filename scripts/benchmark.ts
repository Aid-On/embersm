#!/usr/bin/env npx tsx
/**
 * LOCOMO Benchmark for EmbersM v2
 * Tests the 5-layer memory architecture against the LOCOMO benchmark.
 *
 * Usage:
 *   CLOUDFLARE_API_KEY="..." CLOUDFLARE_EMAIL="..." npx tsx scripts/benchmark.ts [--limit N] [--verbose]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createEmbersM, type EmbersM } from "../src/index";
import { createMockEnv, type MockAIOptions } from "../src/testing/mocks";
import {
  log,
  sleep,
  fallbackEvaluate,
  QA_SYSTEM_PROMPT,
  JUDGE_SYSTEM_PROMPT,
  type LOCOMOData,
  type BenchmarkResult,
  type CloudflareCredentials,
  type Question,
  type Conversation,
} from "./benchmark-helpers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CF_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

async function callCloudflareViaUnilmpFn(
  systemPrompt: string,
  userPrompt: string,
  credentials: CloudflareCredentials
): Promise<string> {
  const { generate } = await import("@aid-on/unilmp");
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
  const result = await generate(
    `cloudflare:${CF_MODEL}`,
    messages,
    {
      cloudflareApiKey: credentials.apiKey,
      cloudflareEmail: credentials.email,
      cloudflareAccountId: credentials.accountId,
    },
    { temperature: 0.1, maxTokens: 256 }
  );
  return result.text;
}

async function answerWithMemory(
  memory: EmbersM,
  userId: string,
  question: string,
  credentials: CloudflareCredentials
): Promise<{ answer: string; context: string; timeMs: number }> {
  const startTime = Date.now();
  const memoryContext = await memory.query(userId, question);
  const userPrompt = `Memory Context:\n${memoryContext.contextString}\n\nQuestion: ${question}\n\nAnswer based on the memory context above:`;
  const answer = await callCloudflareViaUnilmpFn(QA_SYSTEM_PROMPT, userPrompt, credentials);
  return { answer, context: memoryContext.contextString, timeMs: Date.now() - startTime };
}

async function evaluateAnswerWithLLM(
  generated: string,
  expected: string,
  credentials: CloudflareCredentials
): Promise<boolean> {
  const prompt = `Expected answer: ${expected}\nGenerated answer: ${generated}\n\nIs the generated answer correct?`;
  try {
    const result = await callCloudflareViaUnilmpFn(JUDGE_SYSTEM_PROMPT, prompt, credentials);
    return result.toUpperCase().includes("CORRECT") && !result.toUpperCase().includes("INCORRECT");
  } catch {
    return fallbackEvaluate(generated, expected);
  }
}

async function processConversation(
  memory: EmbersM,
  conv: Conversation,
  userId: string,
  verbose: boolean
): Promise<void> {
  const alreadyProcessed = (await memory.flash.get(userId)).length > 0;
  if (alreadyProcessed) return;

  if (verbose) log(`Processing conversation ${conv.id} (${conv.messages.length} messages)`);
  for (let turn = 0; turn < conv.messages.length; turn += 2) {
    const userMsg = conv.messages[turn];
    const assistantMsg = conv.messages[turn + 1];
    if (userMsg && assistantMsg) {
      await memory.extract(userId, conv.id, userMsg.content, assistantMsg.content);
    }
  }
}

interface AnswerOpts {
  memory: EmbersM;
  userId: string;
  q: Question;
  credentials: CloudflareCredentials;
}

async function answerSingleQuestion(opts: AnswerOpts, verbose: boolean, progress: string): Promise<BenchmarkResult> {
  const { memory, userId, q, credentials } = opts;
  const { answer, context, timeMs } = await answerWithMemory(memory, userId, q.question, credentials);
  const isCorrect = await evaluateAnswerWithLLM(answer, q.answer, credentials);

  if (verbose) {
    const status = isCorrect ? "+" : "-";
    log(`${progress} ${status} [${q.category}] ${q.question}`);
    log(`   Expected: ${q.answer}`);
    log(`   Got: ${answer}`);
    log(`   Time: ${timeMs}ms\n`);
  }

  return {
    questionId: q.id, category: q.category, question: q.question,
    expectedAnswer: q.answer, generatedAnswer: answer, isCorrect,
    memoryContext: context, timingMs: timeMs,
  };
}

function printBenchmarkResults(
  results: BenchmarkResult[],
  categoryResults: Record<string, { correct: number; total: number }>
): void {
  log(`\n${"=".repeat(60)}`);
  log("BENCHMARK RESULTS");
  log("=".repeat(60));
  log("\n=== Results by Category ===");
  for (const [category, { correct, total }] of Object.entries(categoryResults)) {
    log(`${category.padEnd(15)}: ${correct}/${total} (${((correct / total) * 100).toFixed(1)}%)`);
  }
  const totalCorrect = results.filter((r) => r.isCorrect).length;
  const overallPct = ((totalCorrect / results.length) * 100).toFixed(1);
  log(`\nTotal: ${totalCorrect}/${results.length} (${overallPct}%) | Mem0 baseline: 41.0% | Target: 72.0%`);
  const diff = parseFloat(overallPct) - 41.0;
  log(`Difference from baseline: ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`);
}

function updateCategoryResults(
  categoryResults: Record<string, { correct: number; total: number }>,
  category: string,
  isCorrect: boolean
): void {
  if (!categoryResults[category]) categoryResults[category] = { correct: 0, total: 0 };
  categoryResults[category].total++;
  if (isCorrect) categoryResults[category].correct++;
}

interface RunContext { memory: EmbersM; credentials: CloudflareCredentials; verbose: boolean }

async function processAllQuestions(
  questions: Question[],
  conversationMap: Map<string, Conversation>,
  ctx: RunContext
): Promise<{ results: BenchmarkResult[]; categoryResults: Record<string, { correct: number; total: number }> }> {
  const results: BenchmarkResult[] = [];
  const categoryResults: Record<string, { correct: number; total: number }> = {};

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const conv = conversationMap.get(q.conversation_id);
    if (!conv) continue;
    const userId = `user_${conv.id}`;

    await processConversation(ctx.memory, conv, userId, ctx.verbose);

    const progress = `[${i + 1}/${questions.length}]`;
    const result = await answerSingleQuestion({ memory: ctx.memory, userId, q, credentials: ctx.credentials }, ctx.verbose, progress);
    results.push(result);
    updateCategoryResults(categoryResults, q.category, result.isCorrect);

    if (!ctx.verbose) {
      process.stdout.write(`${progress} ${result.isCorrect ? "+" : "-"} `);
      if ((i + 1) % 10 === 0) log("");
    }
    await sleep(100);
  }

  return { results, categoryResults };
}

interface BenchmarkOptions {
  dataPath: string;
  credentials: CloudflareCredentials;
  limit?: number;
  verbose?: boolean;
}

async function runBenchmark(options: BenchmarkOptions): Promise<void> {
  const { dataPath, credentials, limit, verbose = false } = options;

  log(`\n Loading LOCOMO data from ${dataPath}...`);
  const rawData = fs.readFileSync(dataPath, "utf-8");
  const data: LOCOMOData = JSON.parse(rawData);
  log(`   ${data.conversations.length} conversations, ${data.questions.length} questions`);

  let questions = data.questions;
  if (limit) {
    questions = questions.slice(0, limit);
    log(`   Using first ${limit} questions`);
  }

  const mockAIOptions: MockAIOptions = {
    llmHandler: async (messages) => {
      const systemMsg = messages.find((m) => m.role === "system");
      const userMsg = messages.find((m) => m.role === "user");
      if (!systemMsg || !userMsg) return '{"type": "hybrid", "entities": [], "events": [], "facts": []}';
      try { return await callCloudflareViaUnilmpFn(systemMsg.content, userMsg.content, credentials); }
      catch { return '{"type": "hybrid", "entities": [], "events": [], "facts": []}'; }
    },
  };

  const env = createMockEnv(mockAIOptions);
  const memory = createEmbersM(env);
  await memory.migrate();

  const conversationMap = new Map(data.conversations.map((c) => [c.id, c]));

  log(`\n Processing conversations and answering questions...\n`);

  const { results, categoryResults } = await processAllQuestions(
    questions, conversationMap, { memory, credentials, verbose }
  );

  printBenchmarkResults(results, categoryResults);

  const resultsPath = path.join(__dirname, "..", "benchmark-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  log(`\nDetailed results saved to: ${resultsPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose") || args.includes("-v");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : undefined;

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "0fc5c2d478a1383a6b624d19ff4bd340";
  const apiKey = process.env.CLOUDFLARE_API_KEY;
  const email = process.env.CLOUDFLARE_EMAIL;

  if (!apiKey || !email) {
    log("CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL environment variables are required");
    process.exit(1);
  }

  const credentials: CloudflareCredentials = { accountId, apiKey, email };

  const possiblePaths = [
    path.join(__dirname, "..", "benchmark-data", "locomo100.json"),
    path.join(__dirname, "..", "benchmark-data", "locomo-sample.json"),
    path.join(__dirname, "..", "..", "embersm", "benchmark-data", "locomo-sample.json"),
  ];

  let dataPath: string | null = null;
  for (const p of possiblePaths) { if (fs.existsSync(p)) { dataPath = p; break; } }

  if (!dataPath) {
    log("LOCOMO data not found. Tried:");
    possiblePaths.forEach((p) => log(`   - ${p}`));
    process.exit(1);
  }

  await runBenchmark({ dataPath, credentials, limit, verbose });
}

main().catch((e: unknown) => { log("Benchmark failed:", String(e)); process.exit(1); });
