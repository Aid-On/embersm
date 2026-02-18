/**
 * Mock Helpers - D1 SQL parsing and Vectorize mock
 *
 * Extracted from mocks.ts for file size compliance.
 */
export function parseInsert(sql, bindings) {
    const match = sql.match(/INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (!match)
        return null;
    const table = match[1];
    const columns = match[2].split(",").map((c) => c.trim());
    const row = {};
    columns.forEach((col, i) => { row[col] = bindings[i]; });
    return { table, row };
}
function parseCondition(cond, bindings, bindIndex) {
    const matchers = [
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
export function parseSelect(sql, bindings) {
    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    if (!tableMatch)
        return null;
    const table = tableMatch[1];
    const where = {};
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:ORDER|LIMIT|$)/i);
    if (whereMatch) {
        const conditions = whereMatch[1].split(/\s+AND\s+/i);
        const bindIndex = { idx: 0 };
        for (const cond of conditions) {
            const result = parseCondition(cond, bindings, bindIndex);
            if (result)
                where[result[0]] = result[1];
        }
    }
    const limitMatch = sql.match(/LIMIT\s+(\d+|\?)/i);
    let limit;
    if (limitMatch) {
        limit = limitMatch[1] === "?" ? Number(bindings[bindings.length - 1]) : Number(limitMatch[1]);
    }
    return { table, where, limit };
}
function compareSuffix(suffix, rowVal, filterVal) {
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
const SUFFIXES = ["__like", "__gt", "__lt", "__gte", "__lte", "__lower"];
export function matchesWhere(row, where) {
    for (const [key, value] of Object.entries(where)) {
        const suffix = SUFFIXES.find(s => key.endsWith(s));
        if (suffix) {
            const col = key.replace(suffix, "");
            if (!compareSuffix(suffix, String(row[col]), String(value)))
                return false;
        }
        else if (row[key] !== value) {
            return false;
        }
    }
    return true;
}
export function toNumberArray(values) {
    if (Array.isArray(values))
        return values;
    return Array.from(values);
}
export function cosineSimilarity(a, b) {
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
//# sourceMappingURL=mock-helpers.js.map