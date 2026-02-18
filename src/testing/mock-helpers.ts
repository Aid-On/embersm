/**
 * Mock Helpers - D1 SQL parsing and Vectorize mock
 *
 * Extracted from mocks.ts for file size compliance.
 */

interface D1Row {
  [key: string]: unknown;
}

export function parseInsert(sql: string, bindings: unknown[]): { table: string; row: D1Row } | null {
  const match = sql.match(/INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (!match) return null;

  const table = match[1];
  const columns = match[2].split(",").map((c) => c.trim());
  const row: D1Row = {};
  columns.forEach((col, i) => { row[col] = bindings[i]; });

  return { table, row };
}

function parseCondition(cond: string, bindings: unknown[], bindIndex: { idx: number }): [string, unknown] | null {
  const matchers: Array<[RegExp, string]> = [
    [/(\w+)\s*=\s*\?/, ""],
    [/(\w+)\s+LIKE\s+\?/i, "__like"],
    [/(\w+)\s*>\s*\?/, "__gt"],
    [/(\w+)\s*<\s*\?/, "__lt"],
    [/(\w+)\s*>=\s*\?/, "__gte"],
    [/(\w+)\s*<=\s*\?/, "__lte"],
    [/LOWER\((\w+)\)\s*=\s*\?/i, "__lower"],
  ];

  for (const [regex, suffix] of matchers) {
    const m = cond.match(regex);
    if (m) {
      return [`${m[1]}${suffix}`, bindings[bindIndex.idx++]];
    }
  }
  return null;
}

export function parseSelect(
  sql: string,
  bindings: unknown[]
): { table: string; where: Record<string, unknown>; limit?: number } | null {
  const tableMatch = sql.match(/FROM\s+(\w+)/i);
  if (!tableMatch) return null;

  const table = tableMatch[1];
  const where: Record<string, unknown> = {};

  const whereMatch = sql.match(/WHERE\s+(.+?)(?:ORDER|LIMIT|$)/i);
  if (whereMatch) {
    const conditions = whereMatch[1].split(/\s+AND\s+/i);
    const bindIndex = { idx: 0 };
    for (const cond of conditions) {
      const result = parseCondition(cond, bindings, bindIndex);
      if (result) where[result[0]] = result[1];
    }
  }

  const limitMatch = sql.match(/LIMIT\s+(\d+|\?)/i);
  let limit: number | undefined;
  if (limitMatch) {
    limit = limitMatch[1] === "?" ? Number(bindings[bindings.length - 1]) : Number(limitMatch[1]);
  }

  return { table, where, limit };
}

function compareSuffix(suffix: string, rowVal: string, filterVal: string): boolean {
  switch (suffix) {
    case "__like": return new RegExp(filterVal.replace(/%/g, ".*"), "i").test(rowVal);
    case "__gt": return rowVal > filterVal;
    case "__lt": return rowVal < filterVal;
    case "__gte": return rowVal >= filterVal;
    case "__lte": return rowVal <= filterVal;
    case "__lower": return rowVal.toLowerCase() === filterVal.toLowerCase();
    default: return false;
  }
}

const SUFFIXES = ["__like", "__gt", "__lt", "__gte", "__lte", "__lower"] as const;

export function matchesWhere(row: D1Row, where: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(where)) {
    const suffix = SUFFIXES.find(s => key.endsWith(s));
    if (suffix) {
      const col = key.replace(suffix, "");
      if (!compareSuffix(suffix, String(row[col]), String(value))) return false;
    } else if (row[key] !== value) {
      return false;
    }
  }
  return true;
}

// Vectorize Mock Helpers

export interface VectorEntry {
  id: string;
  values: number[];
  metadata: Record<string, unknown>;
}

export function toNumberArray(values: number[] | VectorFloatArray): number[] {
  if (Array.isArray(values)) return values;
  return Array.from(values);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
