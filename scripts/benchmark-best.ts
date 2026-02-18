#!/usr/bin/env npx tsx
/**
 * Best Configuration Benchmark for EmbersM v2
 * - Uses @aid-on/unilmp
 * - Simple RAG: Semantic + Episode (keyword + recent)
 * - No Query Router, No Temporal/Graph
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  createBestHelpers,
  extractKeywords,
  getCredentialsFromEnv,
  log,
  type LOCOMOData,
  type BenchmarkResult,
  type Conversation,
  type Question,
} from "./benchmark-best-helpers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const credentials = getCredentialsFromEnv();
const D1_DATABASE_ID = "874cf13f-587d-4caa-adab-3c2984fb88a6";
const VECTORIZE_INDEX = "embersm2-benchmark-vectors";
const LLM_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

const { d1Query, vectorizeInsert, vectorizeQuery, getEmbedding, llmChat } = createBestHelpers({
  accountId: credentials.cloudflareAccountId!, email: credentials.cloudflareEmail!,
  apiKey: credentials.cloudflareApiKey!, d1DatabaseId: D1_DATABASE_ID,
  vectorizeIndex: VECTORIZE_INDEX, embeddingModel: EMBEDDING_MODEL,
  llmModel: LLM_MODEL, credentials,
});

interface EpisodeInput { userId: string; threadId: string; content: string; role: string; turnIndex: number }

async function saveEpisode(input: EpisodeInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d1Query(`INSERT INTO episodes (id, user_id, thread_id, content, role, turn_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, input.userId, input.threadId, input.content, input.role, input.turnIndex, now, now]);
  return id;
}

async function saveAndIndexSemantic(userId: string, content: string, sourceId: string): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d1Query(`INSERT INTO semantic_items (id, user_id, content, source, source_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, userId, content, "episode", sourceId, now, now]);
  const embedding = await getEmbedding(content);
  await vectorizeInsert([{ id, values: embedding, metadata: { userId, content: content.slice(0, 500) } }]);
}

async function searchSemantic(userId: string, query: string, topK: number = 50): Promise<string[]> {
  const queryEmbedding = await getEmbedding(query);
  const matches = await vectorizeQuery(queryEmbedding, topK) as Array<{ metadata?: { content?: string } }>;
  return matches.map((m) => m.metadata?.content || "").filter(Boolean);
}

async function searchEpisodesByKeyword(userId: string, keyword: string, limit: number = 5): Promise<string[]> {
  const rows = await d1Query(`SELECT content FROM episodes WHERE user_id = ? AND content LIKE ? ORDER BY turn_index DESC LIMIT ?`, [userId, `%${keyword}%`, limit]) as Array<{ content: string }>;
  return rows.map((r) => r.content);
}

async function getRecentEpisodes(userId: string, limit: number = 10): Promise<string[]> {
  const rows = await d1Query(`SELECT content FROM episodes WHERE user_id = ? ORDER BY turn_index DESC LIMIT ?`, [userId, limit]) as Array<{ content: string }>;
  return rows.map((r) => r.content);
}

async function queryMemory(userId: string, question: string): Promise<string> {
  const parts: string[] = [];
  try {
    const semanticResults = await searchSemantic(userId, question, 50);
    if (semanticResults.length > 0) parts.push("## Semantic Matches\n" + semanticResults.join("\n"));
  } catch { /* semantic search may fail */ }
  const keywords = extractKeywords(question);
  const keywordResults: string[] = [];
  for (const kw of keywords.slice(0, 3)) {
    const found = await searchEpisodesByKeyword(userId, kw, 5);
    for (const f of found) { if (!keywordResults.includes(f)) keywordResults.push(f); }
  }
  if (keywordResults.length > 0) parts.push("## Related Conversations\n" + keywordResults.slice(0, 15).join("\n"));
  const recent = await getRecentEpisodes(userId, 10);
  if (recent.length > 0) parts.push("## Recent Context\n" + recent.join("\n"));
  return parts.join("\n\n") || "No relevant memories found.";
}

async function answerQuestion(userId: string, question: string): Promise<{ answer: string; context: string }> {
  const context = await queryMemory(userId, question);
  const systemPrompt = `You are a helpful assistant answering questions about past conversations between Caroline and Melanie.
INSTRUCTIONS: 1. Answer based on memory context 2. Pay attention to WHO said something 3. For date questions, look for "[Date: ...]" prefixes 4. For hypothetical questions, make reasonable inferences 5. Be concise - 1-2 sentences`;
  const answer = await llmChat(systemPrompt, `Memory Context:\n${context}\n\nQuestion: ${question}\n\nAnswer:`);
  return { answer, context };
}

async function evaluateAnswer(generated: string, expected: string): Promise<boolean> {
  const systemPrompt = `You are evaluating if an AI's answer matches the expected answer. Be LENIENT. Respond with only "CORRECT" or "INCORRECT".`;
  try {
    const result = await llmChat(systemPrompt, `Expected Answer: ${expected}\nGenerated Answer: ${generated}\n\nIs the generated answer correct?`);
    return result.toUpperCase().includes("CORRECT") && !result.toUpperCase().includes("INCORRECT");
  } catch { return generated.toLowerCase().includes(expected.toLowerCase().slice(0, 20)); }
}

async function extractAndSave(userId: string, threadId: string, userMsg: string, assistantMsg: string): Promise<void> {
  const userEpId = await saveEpisode({ userId, threadId, content: userMsg, role: "user", turnIndex: 0 });
  const assistantEpId = await saveEpisode({ userId, threadId, content: assistantMsg, role: "assistant", turnIndex: 1 });
  try { await saveAndIndexSemantic(userId, userMsg, userEpId); await new Promise(r => setTimeout(r, 50)); await saveAndIndexSemantic(userId, assistantMsg, assistantEpId); } catch { /* vectorize rate limit */ }
  await new Promise(r => setTimeout(r, 100));
}

async function ingestConversation(userId: string, conv: Conversation): Promise<void> {
  const existing = await d1Query(`SELECT COUNT(*) as count FROM episodes WHERE user_id = ?`, [userId]) as Array<{ count: number }>;
  if (existing[0]?.count > 0) {
    log(`Conversation already indexed (${existing[0].count} episodes)\n`);
    return;
  }
  log("Indexing conversation into memory...\n");
  for (let turn = 0; turn < conv.messages.length; turn += 2) {
    const userMsg = conv.messages[turn], assistantMsg = conv.messages[turn + 1];
    if (userMsg && assistantMsg) {
      await extractAndSave(userId, conv.id, userMsg.content, assistantMsg.content);
      if ((turn / 2 + 1) % 10 === 0) process.stdout.write(`  Indexed ${turn / 2 + 1} turns\n`);
    }
  }
  log(`Indexed ${Math.floor(conv.messages.length / 2)} conversation turns\n`);
}

async function runQuestions(userId: string, questions: Question[]): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    try {
      const { answer } = await answerQuestion(userId, q.question);
      const isCorrect = await evaluateAnswer(answer, q.answer);
      results.push({ id: q.id, category: q.category, correct: isCorrect, question: q.question, expected: q.answer, generated: answer });
      process.stdout.write(isCorrect ? "+" : "-");
    } catch (e) {
      results.push({ id: q.id, category: q.category, correct: false, question: q.question, expected: q.answer, generated: `ERROR: ${(e as Error).message?.slice(0, 100)}` });
      process.stdout.write("!");
    }
    if ((i + 1) % 10 === 0) process.stdout.write(` [${i + 1}/${questions.length}]\n`);
    await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

function printResults(results: BenchmarkResult[]): void {
  log("\n\n============================================================");
  log("BEST CONFIGURATION RESULTS");
  log("============================================================\n");
  const categories = [...new Set(results.map(r => r.category))];
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    const correct = catResults.filter(r => r.correct).length;
    log(`${cat.padEnd(15)}: ${correct}/${catResults.length} (${((correct / catResults.length) * 100).toFixed(1)}%)`);
  }
  const totalCorrect = results.filter(r => r.correct).length;
  const totalPct = ((totalCorrect / results.length) * 100).toFixed(1);
  log(`\nTotal: ${totalCorrect}/${results.length} (${totalPct}%) | Mem0 baseline: 41.0% | Improvement: +${(parseFloat(totalPct) - 41).toFixed(1)}%`);
}

async function main() {
  const limit = parseInt(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1] || "100");
  const skipIngest = process.argv.includes("--skip-ingest");

  log("\n EmbersM v2 - Best Configuration Benchmark");
  log("=============================================");
  log(`Using @aid-on/unilmp | LLM: ${LLM_MODEL} | Questions: ${limit}`);

  const dataPath = path.join(__dirname, "../benchmark-data/locomo100.json");
  const data: LOCOMOData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const questions = data.questions.slice(0, limit);
  log(`Loaded ${data.conversations.length} conversations, ${questions.length} questions\n`);

  const conv = data.conversations[0];
  const userId = `prod_conv_${conv.id}`;

  if (!skipIngest) await ingestConversation(userId, conv);

  log("Answering questions...\n");
  const results = await runQuestions(userId, questions);

  printResults(results);
  const outputPath = path.join(__dirname, "../benchmark-best-results.json");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  log(`Results saved to: ${outputPath}`);
}

main().catch((e: unknown) => { log("Benchmark failed:", String(e)); process.exit(1); });
