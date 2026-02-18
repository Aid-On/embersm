/**
 * Date/Temporal Parsing Utilities
 *
 * Extracted from extraction/index.ts for file size compliance.
 */
/**
 * Track JSON brace depth and handle string escaping
 */
function processJsonChar(char, state) {
    if (state.escape) {
        state.escape = false;
        return false;
    }
    if (char === "\\") {
        state.escape = true;
        return false;
    }
    if (char === '"') {
        state.inString = !state.inString;
        return false;
    }
    if (state.inString)
        return false;
    if (char === "{")
        state.depth++;
    if (char === "}") {
        state.depth--;
        return state.depth === 0;
    }
    return false;
}
/**
 * Extract the first valid JSON object from a string
 * Handles cases where LLM adds extra text before/after JSON
 */
export function extractFirstJson(text) {
    const start = text.indexOf("{");
    if (start === -1)
        return null;
    const state = { depth: 0, inString: false, escape: false };
    for (let i = start; i < text.length; i++) {
        if (processJsonChar(text[i], state)) {
            return text.slice(start, i + 1);
        }
    }
    return null;
}
/**
 * Extract conversation date from message prefix like "[Date: 1:56 pm on 8 May, 2023]"
 */
export function extractConversationDate(message) {
    const dateMatch = message.match(/\[Date:\s*([^\]]+)\]/i);
    if (!dateMatch)
        return null;
    const dateStr = dateMatch[1].trim();
    const cleaned = dateStr
        .replace(/^\d+:\d+\s*(am|pm)\s*on\s*/i, "")
        .trim();
    return parseAbsoluteDate(cleaned);
}
/**
 * Parse an absolute date string (not relative)
 */
export function parseAbsoluteDate(dateStr) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }
    const dayMonthYear = dateStr.match(/(\d{1,2})\s+(\w+),?\s+(\d{4})/);
    if (dayMonthYear) {
        const [, day, month, year] = dayMonthYear;
        const monthNum = getMonthNumber(month);
        if (monthNum !== -1) {
            return new Date(parseInt(year), monthNum, parseInt(day));
        }
    }
    const monthDayYear = dateStr.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (monthDayYear) {
        const [, month, day, year] = monthDayYear;
        const monthNum = getMonthNumber(month);
        if (monthNum !== -1) {
            return new Date(parseInt(year), monthNum, parseInt(day));
        }
    }
    return null;
}
function getMonthNumber(month) {
    const months = {
        january: 0, jan: 0,
        february: 1, feb: 1,
        march: 2, mar: 2,
        april: 3, apr: 3,
        may: 4,
        june: 5, jun: 5,
        july: 6, jul: 6,
        august: 7, aug: 7,
        september: 8, sep: 8, sept: 8,
        october: 9, oct: 9,
        november: 10, nov: 10,
        december: 11, dec: 11,
    };
    return months[month.toLowerCase()] ?? -1;
}
function resolveRelativeDay(lower, baseDate) {
    if (lower === "today")
        return new Date(baseDate);
    if (lower === "yesterday") {
        const d = new Date(baseDate);
        d.setDate(d.getDate() - 1);
        return d;
    }
    if (lower === "tomorrow") {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + 1);
        return d;
    }
    return null;
}
function resolveRelativeWeekOrMonth(lower, baseDate) {
    if (lower.includes("last week") || lower.includes("a week ago")) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() - 7);
        return d;
    }
    if (lower.includes("next week")) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + 7);
        return d;
    }
    if (lower.includes("last month")) {
        const d = new Date(baseDate);
        d.setMonth(d.getMonth() - 1);
        return d;
    }
    if (lower.includes("next month")) {
        const d = new Date(baseDate);
        d.setMonth(d.getMonth() + 1);
        return d;
    }
    return null;
}
function resolveRelativeDayOfWeek(lower, baseDate) {
    if (!lower.includes("last sunday") && !lower.includes("last saturday"))
        return null;
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const targetDay = dayNames.findIndex(d => lower.includes(d));
    if (targetDay === -1)
        return null;
    const d = new Date(baseDate);
    const currentDay = d.getDay();
    const diff = currentDay - targetDay;
    d.setDate(d.getDate() - (diff <= 0 ? diff + 7 : diff));
    return d;
}
/**
 * Parse date string, resolving relative dates from a context date
 */
export function parseDate(dateStr, contextDate) {
    const absolute = parseAbsoluteDate(dateStr);
    if (absolute)
        return absolute;
    const baseDate = contextDate ? new Date(contextDate) : new Date();
    const lower = dateStr.toLowerCase();
    return resolveRelativeDay(lower, baseDate)
        || resolveRelativeWeekOrMonth(lower, baseDate)
        || resolveRelativeDayOfWeek(lower, baseDate)
        || new Date(baseDate);
}
//# sourceMappingURL=date-utils.js.map