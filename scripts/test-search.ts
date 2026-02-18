#!/usr/bin/env npx tsx
/**
 * Test semantic search for debugging
 */

const log = (...args: unknown[]) => { process.stdout.write(args.map(String).join(' ') + '\n'); };

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const CF_API_KEY = process.env.CLOUDFLARE_API_KEY!;
const CF_EMAIL = process.env.CLOUDFLARE_EMAIL!;
const VECTORIZE_INDEX = "embersm2-benchmark-vectors";
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

async function cfFetch(endpoint: string, options: RequestInit = {}): Promise<unknown> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "X-Auth-Email": CF_EMAIL,
      "X-Auth-Key": CF_API_KEY,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  return response.json();
}

async function getEmbedding(text: string): Promise<number[]> {
  const result = await cfFetch(`/ai/run/${EMBEDDING_MODEL}`, {
    method: "POST",
    body: JSON.stringify({ text: [text] }),
  }) as { result: { data: number[][] } };
  return result.result.data[0];
}

async function vectorizeQuery(
  vector: number[],
  topK: number = 5,
  filter?: Record<string, unknown>
): Promise<Array<{ score: number; metadata?: { content?: string } }>> {
  const body: Record<string, unknown> = { vector, topK, returnMetadata: "all" };
  if (filter) body.filter = filter;
  const result = await cfFetch(`/vectorize/v2/indexes/${VECTORIZE_INDEX}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  }) as { result?: { matches?: Array<{ score: number; metadata?: { content?: string } }> } };
  log("Vectorize response:", JSON.stringify(result, null, 2).slice(0, 500));
  return result.result?.matches || [];
}

async function main() {
  const query = process.argv[2] || "When did Melanie paint a sunrise?";
  const userId = "prod_conv_conv-26";
  log("Query:", query);
  log("Filter userId:", userId);

  const embedding = await getEmbedding(query);
  log("Embedding dimensions:", String(embedding.length));

  log("\n=== With filter ===");
  const matchesWithFilter = await vectorizeQuery(embedding, 5, { userId });
  log("Matches with filter:", String(matchesWithFilter.length));
  for (const m of matchesWithFilter) {
    const score = m.score.toFixed(4);
    const content = (m.metadata?.content || "").slice(0, 80);
    log(`Score: ${score} | ${content}...`);
  }

  log("\n=== Without filter ===");
  const matchesNoFilter = await vectorizeQuery(embedding, 5);
  log("Matches without filter:", String(matchesNoFilter.length));
  for (const m of matchesNoFilter) {
    const score = m.score.toFixed(4);
    const content = (m.metadata?.content || "").slice(0, 80);
    log(`Score: ${score} | ${content}...`);
  }
}

main();
