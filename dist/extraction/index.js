/**
 * Memory Extraction - Extract memories from conversation turns
 *
 * Parallel extraction for all memory types:
 * - Episodes (always)
 * - Semantic indexing
 * - Temporal events
 * - Graph facts
 */
import { extractFirstJson, extractConversationDate, parseDate, } from "./date-utils";
// Re-export date utils for external consumers
export { extractFirstJson, extractConversationDate, parseAbsoluteDate, parseDate, } from "./date-utils";
const EXTRACTION_MODEL = "@cf/openai/gpt-oss-120b";
// =============================================================================
// Extraction Prompts
// =============================================================================
const TEMPORAL_EXTRACTION_PROMPT = `Extract time-related events from the user's message.

For each event, output JSON:
{"events": [{"content": "event description", "occurred_at": "ISO date or relative like 'yesterday'", "event_type": "event|deadline|recurring|duration", "ended_at": null|"ISO date", "recurrence": null|"pattern", "confidence": 0.0-1.0}]}

Only extract events with clear temporal information. If no events, return {"events": []}.`;
const GRAPH_EXTRACTION_PROMPT = `Extract factual relationships from the conversation message as Prolog-style facts.

The message format is "[Speaker]: text" or "[Date: ...] [Speaker]: text".
Extract facts about:
- Activities/hobbies (painted, ran, attended, participated)
- Personal attributes (is_transgender, has_kids, is_married)
- Relationships (friend_of, works_with)
- Preferences (likes, interested_in, wants_to)
- Actions taken (researched, went_to, created)

Output JSON:
{"facts": [{"predicate": "verb", "subject": "person", "object": "thing/person", "confidence": 0.0-1.0}]}

Examples:
- "[Melanie]: I painted that lake sunrise last year" -> {"predicate": "painted", "subject": "Melanie", "object": "lake sunrise", "confidence": 0.9}
- "[Caroline]: I went to a LGBTQ support group" -> {"predicate": "attended", "subject": "Caroline", "object": "LGBTQ support group", "confidence": 0.9}

Extract all relevant facts. If no facts, return {"facts": []}.`;
export function createExtractor(env) {
    const { AI: ai } = env;
    async function extractTemporal(userId, message) {
        try {
            const conversationDate = extractConversationDate(message);
            const aiRun = ai.run.bind(ai);
            const result = await aiRun(EXTRACTION_MODEL, {
                messages: [
                    { role: "system", content: TEMPORAL_EXTRACTION_PROMPT },
                    { role: "user", content: message },
                ],
                max_tokens: 500,
            });
            const rawResponse = result.response ?? result;
            const response = typeof rawResponse === "string" ? rawResponse : JSON.stringify(rawResponse);
            const json = extractFirstJson(response);
            if (!json)
                return [];
            const parsed = JSON.parse(json);
            if (!parsed.events || !Array.isArray(parsed.events))
                return [];
            return parsed.events.filter((e) => e.content && e.occurred_at).map((e) => ({
                id: crypto.randomUUID(),
                userId,
                content: e.content,
                occurredAt: parseDate(e.occurred_at, conversationDate ?? undefined),
                eventType: e.event_type,
                endedAt: e.ended_at ? parseDate(e.ended_at, conversationDate ?? undefined) : undefined,
                recurrence: e.recurrence,
                confidence: e.confidence,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
        }
        catch {
            return [];
        }
    }
    async function extractGraph(userId, message) {
        try {
            const aiRun = ai.run.bind(ai);
            const result = await aiRun(EXTRACTION_MODEL, {
                messages: [
                    { role: "system", content: GRAPH_EXTRACTION_PROMPT },
                    { role: "user", content: message },
                ],
                max_tokens: 500,
            });
            const rawResponse = result.response ?? result;
            const response = typeof rawResponse === "string" ? rawResponse : JSON.stringify(rawResponse);
            const json = extractFirstJson(response);
            if (!json)
                return [];
            const parsed = JSON.parse(json);
            if (!parsed.facts || !Array.isArray(parsed.facts))
                return [];
            return parsed.facts
                .filter((f) => f.predicate && f.subject && f.object)
                .map((f) => ({
                id: crypto.randomUUID(),
                userId,
                content: `${f.predicate}(${f.subject}, ${f.object})`,
                predicate: f.predicate,
                subject: f.subject,
                object: f.object,
                confidence: f.confidence || 0.5,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
        }
        catch {
            return [];
        }
    }
    return {
        async extract(input, turnIndex, options) {
            const { userId, threadId, userMessage, assistantResponse } = input;
            const opts = options || {};
            const startTime = Date.now();
            const episodes = [
                {
                    id: crypto.randomUUID(),
                    userId,
                    threadId,
                    content: userMessage,
                    role: "user",
                    turnIndex: turnIndex * 2,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: crypto.randomUUID(),
                    userId,
                    threadId,
                    content: assistantResponse,
                    role: "assistant",
                    turnIndex: turnIndex * 2 + 1,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ];
            const [temporalResults, graphResults] = await Promise.all([
                opts.skipTemporal
                    ? Promise.resolve([])
                    : extractTemporal(userId, userMessage),
                opts.skipGraph
                    ? Promise.resolve([])
                    : extractGraph(userId, userMessage),
            ]);
            const semantic = opts.skipSemantic
                ? []
                : [
                    {
                        id: crypto.randomUUID(),
                        userId,
                        content: userMessage,
                        source: "episode",
                        sourceId: episodes[0].id,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    },
                ];
            return {
                episodes,
                semantic,
                temporal: temporalResults,
                graph: graphResults,
                flashUpdated: true,
                extractionTimeMs: Date.now() - startTime,
            };
        },
    };
}
//# sourceMappingURL=index.js.map