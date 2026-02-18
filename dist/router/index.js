/**
 * Query Router - Workers AI-based query classification
 *
 * Uses a small, fast model to classify queries and extract entities.
 * Routes to appropriate memory stores based on classification.
 * Target: <10ms latency
 */
const CLASSIFICATION_MODEL = "@cf/meta/llama-3.2-1b-instruct";
const CLASSIFICATION_PROMPT = `You are a query classifier. Classify the user's query into exactly one category and extract relevant entities.

Categories:
- factual: Questions about specific facts ("What is X's favorite color?", "Where does Y work?")
- temporal: Questions involving time ("When did X happen?", "What happened last week?", "Before/after something")
- relational: Questions requiring multi-hop reasoning ("Who is X's friend's boss?", "What is the connection between A and B?")
- contextual: Questions about recent conversation ("What did I just say?", "Can you repeat that?")
- hybrid: Complex questions requiring multiple types of memory

Output JSON only:
{"type": "factual|temporal|relational|contextual|hybrid", "entities": ["entity1", "entity2"], "temporal_hint": null|{"type": "before|after|during|between", "reference": "date or event"}}`;
export function createQueryRouter(ai) {
    return {
        /**
         * Classify a query and extract entities
         */
        async classify(query, options = {}) {
            // Allow forcing type for testing
            if (options.forceType) {
                return {
                    original: query,
                    type: options.forceType,
                    entities: extractEntitiesSimple(query),
                    confidence: 1.0,
                };
            }
            try {
                const result = await ai.run(CLASSIFICATION_MODEL, {
                    messages: [
                        { role: "system", content: CLASSIFICATION_PROMPT },
                        { role: "user", content: query },
                    ],
                    max_tokens: 200,
                });
                const rawResponse = "response" in result ? result.response : result;
                const response = typeof rawResponse === "string" ? rawResponse : JSON.stringify(rawResponse);
                // Parse JSON from response
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    return fallbackClassification(query);
                }
                const parsed = JSON.parse(jsonMatch[0]);
                let temporalHints;
                if (parsed.temporal_hint) {
                    const ref = parsed.temporal_hint.reference
                        ? parseDate(parsed.temporal_hint.reference)
                        : undefined;
                    temporalHints = { type: parsed.temporal_hint.type, reference: ref };
                }
                return {
                    original: query,
                    type: parsed.type || "hybrid",
                    entities: parsed.entities || extractEntitiesSimple(query),
                    temporalHints,
                    confidence: 0.8,
                };
            }
            catch {
                return fallbackClassification(query);
            }
        },
        /**
         * Determine which stores to query based on classification
         */
        getStoresToQuery(classification) {
            switch (classification.type) {
                case "factual":
                    return {
                        flash: false,
                        episode: false,
                        semantic: true,
                        temporal: false,
                        graph: true,
                    };
                case "temporal":
                    return {
                        flash: false,
                        episode: true, // Recent context might help
                        semantic: false,
                        temporal: true,
                        graph: false,
                    };
                case "relational":
                    return {
                        flash: false,
                        episode: false,
                        semantic: true, // For entity context
                        temporal: false,
                        graph: true, // Primary source
                    };
                case "contextual":
                    return {
                        flash: true, // Primary source
                        episode: true,
                        semantic: false,
                        temporal: false,
                        graph: false,
                    };
                case "hybrid":
                default:
                    // Query all stores
                    return {
                        flash: true,
                        episode: true,
                        semantic: true,
                        temporal: true,
                        graph: true,
                    };
            }
        },
    };
}
// =============================================================================
// Helpers
// =============================================================================
/**
 * Simple entity extraction using regex patterns
 */
function extractEntitiesSimple(query) {
    const entities = [];
    // Capitalized words (likely names)
    const capitalizedPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    const capitalizedMatches = query.match(capitalizedPattern);
    if (capitalizedMatches) {
        entities.push(...capitalizedMatches);
    }
    // Quoted strings
    const quotedPattern = /"([^"]+)"|'([^']+)'/g;
    let match;
    while ((match = quotedPattern.exec(query)) !== null) {
        entities.push(match[1] || match[2]);
    }
    // Remove duplicates
    return [...new Set(entities)];
}
/**
 * Fallback classification using heuristics
 */
function fallbackClassification(query) {
    const lowerQuery = query.toLowerCase();
    // Temporal keywords
    const temporalKeywords = [
        "when",
        "before",
        "after",
        "during",
        "last week",
        "yesterday",
        "tomorrow",
        "next",
        "previous",
        "date",
        "time",
        "year",
        "month",
    ];
    // Relational keywords
    const relationalKeywords = [
        "who is",
        "connection",
        "related",
        "relationship",
        "between",
        "friend of",
        "work with",
    ];
    // Contextual keywords
    const contextualKeywords = [
        "just said",
        "repeat",
        "what did i",
        "mentioned",
        "earlier",
        "just now",
    ];
    let type = "factual";
    if (temporalKeywords.some((kw) => lowerQuery.includes(kw))) {
        type = "temporal";
    }
    else if (relationalKeywords.some((kw) => lowerQuery.includes(kw))) {
        type = "relational";
    }
    else if (contextualKeywords.some((kw) => lowerQuery.includes(kw))) {
        type = "contextual";
    }
    return {
        original: query,
        type,
        entities: extractEntitiesSimple(query),
        confidence: 0.5, // Lower confidence for heuristic
    };
}
/**
 * Parse date reference from string
 */
function parseDate(reference) {
    // Try parsing as ISO date
    const parsed = new Date(reference);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }
    // Handle relative references
    const now = new Date();
    const lower = reference.toLowerCase();
    if (lower.includes("yesterday")) {
        return new Date(now.setDate(now.getDate() - 1));
    }
    if (lower.includes("tomorrow")) {
        return new Date(now.setDate(now.getDate() + 1));
    }
    if (lower.includes("last week")) {
        return new Date(now.setDate(now.getDate() - 7));
    }
    if (lower.includes("next week")) {
        return new Date(now.setDate(now.getDate() + 7));
    }
    return undefined;
}
//# sourceMappingURL=index.js.map