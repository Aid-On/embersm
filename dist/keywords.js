/**
 * Keyword Extraction Utility
 *
 * Extract key nouns/keywords from a question for search.
 * Shared between main factory and simple-memory.
 */
const STOPWORDS = new Set([
    "what", "when", "where", "who", "why", "how", "which",
    "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "can", "may", "might", "must",
    "a", "an", "the", "this", "that", "these", "those",
    "i", "you", "he", "she", "it", "we", "they",
    "my", "your", "his", "her", "its", "our", "their",
    "and", "or", "but", "if", "then", "so", "because",
    "in", "on", "at", "to", "for", "of", "with", "by",
    "about", "from", "into", "through", "during", "before", "after",
    "above", "below", "between", "under", "over",
    "did", "go", "went", "like", "likely", "still", "want",
]);
/**
 * Extract key nouns/keywords from a question for search
 */
export function extractKeywords(query) {
    const words = query
        .toLowerCase()
        .replace(/[?.,!'"]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w));
    const capitalizedPattern = /\b[A-Z][a-z]+(?:'s)?\b/g;
    const capitalizedMatches = query.match(capitalizedPattern) || [];
    const all = [...new Set([...capitalizedMatches.map((w) => w.toLowerCase()), ...words])];
    return all.slice(0, 5);
}
//# sourceMappingURL=keywords.js.map