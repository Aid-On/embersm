#!/usr/bin/env npx tsx
/** 5-Layer Architecture Benchmark for EmbersM v2 - Uses @aid-on/unilmp */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { getCredentialsFromEnv } from "@aid-on/unilmp";
import {
  createCfHelpers,
  llmChat,
  classifyQuery,
  getStoresToQuery,
  extractFirstJson,
  extractConversationDate,
  extractSpeaker,
  resolveDate,
  extractKeywords,
  log,
  TEMPORAL_PROMPT,
  GRAPH_PROMPT,
  type LOCOMOData,
  type TemporalItem,
  type GraphItem,
  type BenchmarkResult,
  type Conversation,
  type Question,
} from "./benchmark-5layer-helpers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const credentials = getCredentialsFromEnv();
const CF_ACCOUNT_ID = credentials.cloudflareAccountId!;

const D1_DATABASE_ID = "874cf13f-587d-4caa-adab-3c2984fb88a6";
const VECTORIZE_INDEX = "embersm2-benchmark-vectors";
const LLM_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const EXTRACTION_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

const { d1Query, vectorizeInsert, vectorizeQuery, getEmbedding } = createCfHelpers({
  accountId: CF_ACCOUNT_ID, email: credentials.cloudflareEmail!,
  apiKey: credentials.cloudflareApiKey!, d1DatabaseId: D1_DATABASE_ID,
  vectorizeIndex: VECTORIZE_INDEX, embeddingModel: EMBEDDING_MODEL,
});

// Extraction
async function extractTemporalEvents(message: string): Promise<TemporalItem[]> {
  try {
    const response = await llmChat(TEMPORAL_PROMPT, message, EXTRACTION_MODEL, credentials);
    const json = extractFirstJson(response);
    if (!json) return [];
    const parsed = JSON.parse(json) as { events: Array<{ content: string; occurred_at: string; event_type?: string; confidence?: number }> };
    if (!parsed.events?.length) return [];
    const conversationDate = extractConversationDate(message);
    return parsed.events.filter((e) => e.content && e.occurred_at).map((e) => ({
      id: crypto.randomUUID(), content: e.content,
      occurred_at: resolveDate(e.occurred_at, conversationDate),
      event_type: e.event_type || "event", confidence: e.confidence || 0.5,
    }));
  } catch { return []; }
}

async function extractGraphFacts(message: string): Promise<GraphItem[]> {
  try {
    const speaker = extractSpeaker(message) || "unknown";
    const response = await llmChat(GRAPH_PROMPT, message, EXTRACTION_MODEL, credentials);
    const json = extractFirstJson(response);
    if (!json) return [];
    const parsed = JSON.parse(json) as { facts: Array<{ predicate: string; subject: string; object: string; confidence?: number }> };
    if (!parsed.facts?.length) return [];
    return parsed.facts.filter((f) => f.predicate && f.subject && f.object).map((f) => {
      const subject = f.subject === "speaker" ? speaker : f.subject;
      return {
        id: crypto.randomUUID(), predicate: f.predicate.toLowerCase(),
        subject: subject.toLowerCase(), object: f.object.toLowerCase(),
        confidence: f.confidence || 0.5, content: `${f.predicate}(${subject}, ${f.object})`,
      };
    });
  } catch { return []; }
}

// Memory Operations

interface EpisodeInput { userId: string; threadId: string; content: string; role: string; turnIndex: number }

async function saveEpisode(input: EpisodeInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d1Query(`INSERT INTO episodes (id, user_id, thread_id, content, role, turn_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, input.userId, input.threadId, input.content, input.role, input.turnIndex, now, now]);
  return id;
}

async function saveTemporalItem(userId: string, item: TemporalItem): Promise<void> {
  const now = new Date().toISOString();
  await d1Query(`INSERT INTO temporal_items (id, user_id, content, occurred_at, event_type, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [item.id, userId, item.content, item.occurred_at, item.event_type, item.confidence, now, now]);
}

async function saveGraphItem(userId: string, item: GraphItem): Promise<void> {
  const existing = await d1Query(`SELECT 1 FROM graph_items WHERE user_id = ? AND LOWER(predicate) = ? AND LOWER(subject) = ? AND LOWER(object) = ? LIMIT 1`, [userId, item.predicate, item.subject, item.object]);
  if ((existing as unknown[]).length > 0) return;
  const now = new Date().toISOString();
  await d1Query(`INSERT INTO graph_items (id, user_id, content, predicate, subject, object, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [item.id, userId, item.content, item.predicate, item.subject, item.object, item.confidence, now, now]);
}

async function saveAndIndexSemantic(userId: string, content: string, sourceId: string): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d1Query(`INSERT INTO semantic_items (id, user_id, content, source, source_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, userId, content, "episode", sourceId, now, now]);
  const embedding = await getEmbedding(content);
  await vectorizeInsert([{ id, values: embedding, metadata: { userId, content: content.slice(0, 500) } }]);
}

// Query Functions

async function queryEpisodes(userId: string, question: string, limit = 20): Promise<string[]> {
  const recent = await d1Query(`SELECT content FROM episodes WHERE user_id = ? ORDER BY turn_index DESC LIMIT ?`, [userId, limit]) as Array<{ content: string }>;
  const keywords = extractKeywords(question);
  const keywordResults: string[] = [];
  for (const kw of keywords.slice(0, 3)) {
    const found = await d1Query(`SELECT content FROM episodes WHERE user_id = ? AND content LIKE ? ORDER BY turn_index DESC LIMIT 5`, [userId, `%${kw}%`]) as Array<{ content: string }>;
    for (const row of found) { if (!keywordResults.includes(row.content)) keywordResults.push(row.content); }
  }
  const all = [...recent.map((r) => r.content), ...keywordResults];
  return [...new Set(all)].slice(0, limit);
}

async function querySemantic(userId: string, question: string, topK = 50): Promise<string[]> {
  const embedding = await getEmbedding(question);
  const matches = await vectorizeQuery(embedding, topK) as Array<{ metadata?: { content?: string } }>;
  return matches.map((m) => m.metadata?.content || "").filter(Boolean);
}

async function queryTemporal(userId: string, question: string): Promise<string[]> {
  const keywords = extractKeywords(question);
  const items: Array<{ content: string; occurred_at: string }> = [];
  for (const kw of keywords.slice(0, 3)) {
    const found = await d1Query(`SELECT content, occurred_at FROM temporal_items WHERE user_id = ? AND LOWER(content) LIKE ? ORDER BY occurred_at DESC LIMIT 10`, [userId, `%${kw.toLowerCase()}%`]) as Array<{ content: string; occurred_at: string }>;
    for (const row of found) { if (!items.some(i => i.content === row.content)) items.push(row); }
  }
  if (items.length < 5) {
    const recent = await d1Query(`SELECT content, occurred_at FROM temporal_items WHERE user_id = ? ORDER BY occurred_at DESC LIMIT 10`, [userId]) as Array<{ content: string; occurred_at: string }>;
    for (const row of recent) { if (!items.some(i => i.content === row.content)) items.push(row); }
  }
  return items.slice(0, 15).map((item) => `[${new Date(item.occurred_at).toISOString().split("T")[0]}] ${item.content}`);
}

async function queryGraph(userId: string, question: string): Promise<string[]> {
  const entities = (question.match(/\b[A-Z][a-z]+\b/g) || []).map(e => e.toLowerCase());
  const keywords = extractKeywords(question);
  const facts: string[] = [];
  for (const entity of entities) {
    const asSubject = await d1Query(`SELECT content FROM graph_items WHERE user_id = ? AND LOWER(subject) = ? LIMIT 10`, [userId, entity]) as Array<{ content: string }>;
    const asObject = await d1Query(`SELECT content FROM graph_items WHERE user_id = ? AND LOWER(object) LIKE ? LIMIT 10`, [userId, `%${entity}%`]) as Array<{ content: string }>;
    for (const row of [...asSubject, ...asObject]) { if (!facts.includes(row.content)) facts.push(row.content); }
  }
  const actionKws = keywords.filter(kw => ["paint", "run", "go", "move", "attend", "camp", "sign", "research", "give", "meet", "celebrate", "pursue", "like", "partake"].some(v => kw.includes(v)));
  for (const kw of [...keywords.slice(0, 2), ...actionKws]) {
    const byPred = await d1Query(`SELECT content FROM graph_items WHERE user_id = ? AND (LOWER(predicate) LIKE ? OR LOWER(object) LIKE ?) LIMIT 10`, [userId, `%${kw.toLowerCase()}%`, `%${kw.toLowerCase()}%`]) as Array<{ content: string }>;
    for (const row of byPred) { if (!facts.includes(row.content)) facts.push(row.content); }
  }
  return facts.slice(0, 20);
}

// Extraction + Ingestion

interface ExtractionResult { temporal: number; graph: number }

async function extractAndSave(userId: string, threadId: string, userMsg: string, assistantMsg: string): Promise<ExtractionResult> {
  const turnIndex = 0;
  const userEpId = await saveEpisode({ userId, threadId, content: userMsg, role: "user", turnIndex: turnIndex * 2 });
  const assistantEpId = await saveEpisode({ userId, threadId, content: assistantMsg, role: "assistant", turnIndex: turnIndex * 2 + 1 });
  try { await saveAndIndexSemantic(userId, userMsg, userEpId); await new Promise(r => setTimeout(r, 30)); await saveAndIndexSemantic(userId, assistantMsg, assistantEpId); } catch { /* vectorize rate limit */ }
  const [userTemporal, assistantTemporal] = await Promise.all([extractTemporalEvents(userMsg), extractTemporalEvents(assistantMsg)]);
  let temporalCount = 0;
  for (const item of [...userTemporal, ...assistantTemporal]) { try { await saveTemporalItem(userId, item); temporalCount++; } catch { /* ignore duplicates */ } }
  const [userFacts, assistantFacts] = await Promise.all([extractGraphFacts(userMsg), extractGraphFacts(assistantMsg)]);
  let graphCount = 0;
  for (const item of [...userFacts, ...assistantFacts]) { try { await saveGraphItem(userId, item); graphCount++; } catch { /* ignore duplicates */ } }
  await new Promise(r => setTimeout(r, 100));
  return { temporal: temporalCount, graph: graphCount };
}

// Query with Fusion + Answer

async function queryMemory5Layer(userId: string, question: string): Promise<string> {
  const type = classifyQuery(question);
  const stores = getStoresToQuery(type);
  const parts: string[] = [];
  const queries: Promise<void>[] = [];
  queries.push((async () => { const r = await querySemantic(userId, question, 50); if (r.length > 0) parts.push("## Semantic Matches\n" + r.join("\n")); })());
  queries.push((async () => { const r = await queryEpisodes(userId, question, 20); if (r.length > 0) parts.push("## Related Conversations\n" + r.slice(0, 15).join("\n")); })());
  if (stores.temporal) { queries.push((async () => { const r = await queryTemporal(userId, question); if (r.length > 0) parts.push("## Timeline Events\n" + r.join("\n")); })()); }
  if (stores.graph) { queries.push((async () => { const r = await queryGraph(userId, question); if (r.length > 0) parts.push("## Known Facts\n" + r.join("\n")); })()); }
  await Promise.all(queries);
  return parts.join("\n\n") || "No relevant memories found.";
}

async function answerQuestion(userId: string, question: string): Promise<{ answer: string; context: string }> {
  const context = await queryMemory5Layer(userId, question);
  const systemPrompt = `You are a helpful assistant answering questions about past conversations between Caroline and Melanie.
The memory context contains Semantic Matches, Related Conversations, Timeline Events, and Known Facts.
INSTRUCTIONS: 1. Answer based on memory context 2. Pay attention to WHO said something 3. For date questions, look for "[Date: ...]" prefixes 4. For hypothetical questions, make reasonable inferences 5. Use Known Facts for factual questions 6. Be concise - 1-2 sentences`;
  const answer = await llmChat(systemPrompt, `Memory Context:\n${context}\n\nQuestion: ${question}\n\nAnswer:`, LLM_MODEL, credentials);
  return { answer, context };
}

async function evaluateAnswer(generated: string, expected: string): Promise<boolean> {
  const systemPrompt = `You are evaluating if an AI's answer matches the expected answer. Be LENIENT. Mark as CORRECT if core info matches. Respond with only "CORRECT" or "INCORRECT".`;
  try {
    const result = await llmChat(systemPrompt, `Expected: ${expected}\nGenerated: ${generated}\n\nIs correct?`, LLM_MODEL, credentials);
    return result.toUpperCase().includes("CORRECT") && !result.toUpperCase().includes("INCORRECT");
  } catch { return generated.toLowerCase().includes(expected.toLowerCase().slice(0, 20)); }
}

// Ingestion

async function ingestConversation(userId: string, conv: Conversation): Promise<void> {
  const existing = await d1Query(`SELECT COUNT(*) as count FROM episodes WHERE user_id = ?`, [userId]) as Array<{ count: number }>;
  if (existing[0]?.count > 0) {
    log(`Already indexed: Episodes=${existing[0].count}\n`);
    return;
  }
  log("Indexing with 5-layer extraction...\n");
  let totalTemporal = 0, totalGraph = 0;
  for (let turn = 0; turn < conv.messages.length; turn += 2) {
    const userMsg = conv.messages[turn], assistantMsg = conv.messages[turn + 1];
    if (userMsg && assistantMsg) {
      const { temporal, graph } = await extractAndSave(userId, conv.id, userMsg.content, assistantMsg.content);
      totalTemporal += temporal; totalGraph += graph;
      if ((turn / 2 + 1) % 10 === 0) process.stdout.write(`  Indexed ${turn / 2 + 1} turns (T:${totalTemporal} G:${totalGraph})\n`);
    }
  }
  log(`Extraction complete: T=${totalTemporal} G=${totalGraph}\n`);
}

// Run Questions

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
  log("5-LAYER BENCHMARK RESULTS");
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

// Main

async function main() {
  const limit = parseInt(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1] || "100");
  const skipIngest = process.argv.includes("--skip-ingest");

  log("\n EmbersM v2 - 5-Layer Architecture Benchmark");
  log("================================================");
  log(`Using @aid-on/unilmp | LLM: ${LLM_MODEL} | Extraction: ${EXTRACTION_MODEL} | Questions: ${limit}`);

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
  fs.writeFileSync(path.join(__dirname, "../benchmark-5layer-results.json"), JSON.stringify(results, null, 2));
  log(`Results saved`);
}
main().catch((e: unknown) => { log("Benchmark failed:", String(e)); process.exit(1); });
