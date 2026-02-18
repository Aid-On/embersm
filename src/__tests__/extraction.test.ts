import { describe, it, expect } from "vitest";
import {
  extractConversationDate,
  parseAbsoluteDate,
  parseDate,
} from "../extraction";

describe("extractConversationDate", () => {
  it("should extract date from LOCOMO format with time", () => {
    const message =
      "[Date: 1:56 pm on 8 May, 2023] [Caroline]: Hey Mel! Good to see you!";
    const date = extractConversationDate(message);
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2023);
    expect(date?.getMonth()).toBe(4); // May is month 4 (0-indexed)
    expect(date?.getDate()).toBe(8);
  });

  it("should extract date from simple format", () => {
    const message = "[Date: 25 May 2023] Some message";
    const date = extractConversationDate(message);
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2023);
    expect(date?.getMonth()).toBe(4);
    expect(date?.getDate()).toBe(25);
  });

  it("should return null when no date prefix", () => {
    const message = "Just a regular message without date";
    const date = extractConversationDate(message);
    expect(date).toBeNull();
  });
});

describe("parseAbsoluteDate", () => {
  it("should parse ISO date", () => {
    const date = parseAbsoluteDate("2023-05-08");
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2023);
    expect(date?.getMonth()).toBe(4);
    expect(date?.getDate()).toBe(8);
  });

  it("should parse '8 May, 2023' format", () => {
    const date = parseAbsoluteDate("8 May, 2023");
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2023);
    expect(date?.getMonth()).toBe(4);
    expect(date?.getDate()).toBe(8);
  });

  it("should parse '8 May 2023' format (no comma)", () => {
    const date = parseAbsoluteDate("8 May 2023");
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2023);
    expect(date?.getMonth()).toBe(4);
    expect(date?.getDate()).toBe(8);
  });

  it("should parse 'May 8, 2023' format", () => {
    const date = parseAbsoluteDate("May 8, 2023");
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2023);
    expect(date?.getMonth()).toBe(4);
    expect(date?.getDate()).toBe(8);
  });

  it("should return null for relative dates", () => {
    expect(parseAbsoluteDate("yesterday")).toBeNull();
    expect(parseAbsoluteDate("last week")).toBeNull();
  });
});

describe("parseDate", () => {
  it("should parse absolute dates without context", () => {
    const date = parseDate("8 May, 2023");
    expect(date.getFullYear()).toBe(2023);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(8);
  });

  it("should resolve 'yesterday' relative to context date", () => {
    // If the conversation happened on May 8, 2023, "yesterday" should be May 7
    const contextDate = new Date(2023, 4, 8); // May 8, 2023
    const date = parseDate("yesterday", contextDate);
    expect(date.getFullYear()).toBe(2023);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(7);
  });

  it("should resolve 'last week' relative to context date", () => {
    const contextDate = new Date(2023, 4, 25); // May 25, 2023
    const date = parseDate("last week", contextDate);
    expect(date.getFullYear()).toBe(2023);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(18); // 7 days before May 25
  });

  it("should resolve 'tomorrow' relative to context date", () => {
    const contextDate = new Date(2023, 4, 8); // May 8, 2023
    const date = parseDate("tomorrow", contextDate);
    expect(date.getFullYear()).toBe(2023);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(9);
  });

  it("should resolve 'last sunday' relative to context date", () => {
    // May 25, 2023 was a Thursday (day 4)
    // Last Sunday from Thursday would be May 21, 2023 (day 0)
    const contextDate = new Date(2023, 4, 25); // May 25, 2023 (Thursday)
    const date = parseDate("last sunday", contextDate);
    expect(date.getFullYear()).toBe(2023);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(21); // May 21, 2023 (Sunday)
  });

  it("should NOT use today's date for relative dates when context is provided", () => {
    // This is the critical test - relative dates must use context, not today
    const contextDate = new Date(2023, 4, 8); // May 8, 2023
    const date = parseDate("yesterday", contextDate);

    // The result should be May 7, 2023, NOT yesterday from today
    const today = new Date();
    const yesterdayFromToday = new Date(today);
    yesterdayFromToday.setDate(today.getDate() - 1);

    // If we're running this test in 2025, the date should still be 2023
    expect(date.getFullYear()).toBe(2023);
    expect(date.getFullYear()).not.toBe(yesterdayFromToday.getFullYear());
  });
});

describe("Integration: LOCOMO message parsing", () => {
  it("should correctly parse dates from LOCOMO conversation", () => {
    const message =
      "[Date: 1:56 pm on 8 May, 2023] [Caroline]: I went to a LGBTQ support group yesterday and it was so powerful.";

    // Extract conversation date
    const contextDate = extractConversationDate(message);
    expect(contextDate).not.toBeNull();
    expect(contextDate?.getFullYear()).toBe(2023);
    expect(contextDate?.getMonth()).toBe(4);
    expect(contextDate?.getDate()).toBe(8);

    // If Caroline said "yesterday" on May 8, 2023, she went on May 7, 2023
    const eventDate = parseDate("yesterday", contextDate!);
    expect(eventDate.getFullYear()).toBe(2023);
    expect(eventDate.getMonth()).toBe(4);
    expect(eventDate.getDate()).toBe(7);
  });

  it("should resolve 'last Saturday' correctly", () => {
    // "I ran a charity race for mental health last Saturday"
    // Conversation on May 25, 2023 (Thursday)
    // Last Saturday would be May 20, 2023
    const message =
      "[Date: 1:14 pm on 25 May, 2023] [Melanie]: Hey Caroline, since we last chatted, I've had a lot of things happening to me. I ran a charity race for mental health last Saturday – it was really rewarding.";

    const contextDate = extractConversationDate(message);
    expect(contextDate).not.toBeNull();
    expect(contextDate?.getFullYear()).toBe(2023);
    expect(contextDate?.getMonth()).toBe(4); // May
    expect(contextDate?.getDate()).toBe(25);

    // Last Saturday from May 25, 2023 (Thu) should be May 20, 2023 (Sat)
    const eventDate = parseDate("last saturday", contextDate!);
    expect(eventDate.getFullYear()).toBe(2023);
    expect(eventDate.getMonth()).toBe(4);
    expect(eventDate.getDate()).toBe(20);
  });
});
