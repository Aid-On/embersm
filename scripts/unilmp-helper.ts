/**
 * Unified LLM helper for EmbersM benchmarks
 * Replaces direct Cloudflare API calls with @aid-on/unilmp
 */

import { generate } from "@aid-on/unilmp";

// =============================================================================
// Types
// =============================================================================

export interface CloudflareCredentials {
  accountId: string;
  apiKey: string;
  email: string;
}

// =============================================================================
// Unified LLM Functions
// =============================================================================

/**
 * Call Cloudflare Workers AI via unilmp
 * Replaces direct fetch calls to Cloudflare API
 */
export async function callCloudflareViaUnilmp(
  systemPrompt: string,
  userPrompt: string,
  credentials: CloudflareCredentials,
  model = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    const result = await generate(
      `cloudflare:${model}`,
      messages,
      {
        cloudflareApiKey: credentials.apiKey,
        cloudflareEmail: credentials.email,
        cloudflareAccountId: credentials.accountId,
      },
      {
        temperature: 0.1,
        maxTokens: 256,
      }
    );

    return result.text;
  } catch (error) {
    throw new Error(`Cloudflare API error via unilmp: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate embeddings via unilmp (when available)
 * Currently falls back to direct API for embeddings
 */
export async function generateEmbeddingsViaUnilmp(
  text: string,
  credentials: CloudflareCredentials,
  model = "@cf/baai/bge-base-en-v1.5"
): Promise<number[]> {
  // TODO: Add embedding support to unilmp
  // For now, fall back to direct API call
  const { accountId, apiKey, email } = credentials;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Auth-Email": email,
      "X-Auth-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: [text],
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data = await response.json() as { result?: { data?: number[][] } };
  return data.result?.data?.[0] || [];
}

/**
 * Get Cloudflare credentials from environment
 */
export function getCloudflareCredentials(): CloudflareCredentials {
  const accountId = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiKey = process.env.CF_API_KEY || process.env.CLOUDFLARE_API_KEY;
  const email = process.env.CF_EMAIL || process.env.CLOUDFLARE_EMAIL;

  if (!accountId || !apiKey || !email) {
    throw new Error("Missing Cloudflare credentials: CF_ACCOUNT_ID, CF_API_KEY, CF_EMAIL");
  }

  return { accountId, apiKey, email };
}