import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { supabase } from "../lib/supabase";
import {
  buildNudgeMessage,
  latestNudgeLabel,
  fetchInvoiceNudges,
  logInvoiceNudge,
  type NudgeRecord,
} from "./invoiceNudgeService";

const { state, builder } = vi.hoisted(() => {
  const state = {
    result: { data: null as unknown, error: null as { message: string } | null },
  };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "insert", "single"]) {
    builder[method] = vi.fn(() => builder);
  }
  // Makes the chain awaitable: any chain resolves to the current mocked { data, error }.
  builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(state.result).then(onFulfilled, onRejected);
  return { state, builder };
});

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => builder),
  },
}));

const q = builder as unknown as Record<string, Mock>;

function makeNudge(overrides: Partial<NudgeRecord>): NudgeRecord {
  return {
    id: "n1",
    user_id: "user-1",
    invoice_ref: "INV-2026-042",
    client_label: "Asha Studio",
    amount_inr: 125000,
    tone: "Friendly",
    message: "hello",
    nudged_at: "2026-01-10T10:00:00.000Z",
    created_at: "2026-01-10T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.result = { data: null, error: null };
});

describe("buildNudgeMessage", () => {
  const input = {
    clientName: "Asha Studio",
    invoiceNumber: "INV-2026-042",
    amount: 125000,
    dueDate: "2026-01-05",
    daysOverdue: 5,
  };

  it.each(["Friendly", "Firm", "Final"] as const)(
    "%s tone includes invoice number and Indian-formatted amount",
    (tone) => {
      const message = buildNudgeMessage(tone, input);
      expect(message).toContain("INV-2026-042");
      expect(message).toContain("\u20B91,25,000");
      expect(message).toContain("2026-01-05");
    }
  );

  it.each(["Friendly", "Firm", "Final"] as const)("%s tone contains no em dash", (tone) => {
    const message = buildNudgeMessage(tone, input);
    expect(message.includes("\u2014")).toBe(false);
  });

  it("produces distinct messages per tone", () => {
    const messages = new Set(
      (["Friendly", "Firm", "Final"] as const).map((tone) => buildNudgeMessage(tone, input))
    );
    expect(messages.size).toBe(3);
  });
});

describe("latestNudgeLabel", () => {
  const now = new Date("2026-01-10T12:00:00.000Z");

  it("returns null when there are no nudges", () => {
    expect(latestNudgeLabel([], now)).toBeNull();
  });

  it("labels a single nudge from today", () => {
    const nudges = [makeNudge({ tone: "Firm", nudged_at: "2026-01-10T06:00:00.000Z" })];
    expect(latestNudgeLabel(nudges, now)).toBe("Nudged today (Firm)");
  });

  it("labels a single nudge from one day ago", () => {
    const nudges = [makeNudge({ tone: "Friendly", nudged_at: "2026-01-09T11:00:00.000Z" })];
    expect(latestNudgeLabel(nudges, now)).toBe("Nudged 1 day ago (Friendly)");
  });

  it("picks the most recent nudge when several exist", () => {
    const nudges = [
      makeNudge({ id: "a", tone: "Friendly", nudged_at: "2026-01-05T10:00:00.000Z" }),
      makeNudge({ id: "b", tone: "Final", nudged_at: "2026-01-07T10:00:00.000Z" }),
      makeNudge({ id: "c", tone: "Firm", nudged_at: "2026-01-06T10:00:00.000Z" }),
    ];
    expect(latestNudgeLabel(nudges, now)).toBe("Nudged 3 days ago (Final)");
  });
});

describe("fetchInvoiceNudges", () => {
  it("queries invoice_nudges by invoice ref ordered newest first", async () => {
    const rows = [makeNudge({ id: "n2" }), makeNudge({ id: "n1" })];
    state.result = { data: rows, error: null };

    const result = await fetchInvoiceNudges("INV-2026-042");

    expect(supabase.from).toHaveBeenCalledWith("invoice_nudges");
    expect(q.select).toHaveBeenCalledWith("*");
    expect(q.eq).toHaveBeenCalledWith("invoice_ref", "INV-2026-042");
    expect(q.order).toHaveBeenCalledWith("nudged_at", { ascending: false });
    expect(result).toEqual(rows);
  });

  it("returns an empty array when data is null", async () => {
    state.result = { data: null, error: null };
    await expect(fetchInvoiceNudges("INV-2026-042")).resolves.toEqual([]);
  });

  it("throws when the query returns an error", async () => {
    state.result = { data: null, error: { message: "permission denied" } };
    await expect(fetchInvoiceNudges("INV-2026-042")).rejects.toThrow("permission denied");
  });
});

describe("logInvoiceNudge", () => {
  it("inserts without user_id and returns the inserted row", async () => {
    const row = makeNudge({ id: "new", tone: "Final", message: "last notice" });
    state.result = { data: row, error: null };

    const result = await logInvoiceNudge({
      invoiceRef: "INV-2026-042",
      clientLabel: "Asha Studio",
      amountInr: 125000,
      tone: "Final",
      message: "last notice",
    });

    expect(supabase.from).toHaveBeenCalledWith("invoice_nudges");
    expect(q.insert).toHaveBeenCalledWith({
      invoice_ref: "INV-2026-042",
      client_label: "Asha Studio",
      amount_inr: 125000,
      tone: "Final",
      message: "last notice",
    });
    expect(q.select).toHaveBeenCalled();
    expect(q.single).toHaveBeenCalled();
    expect(result).toEqual(row);
  });

  it("throws when the insert returns an error", async () => {
    state.result = { data: null, error: { message: "check constraint violated" } };
    await expect(
      logInvoiceNudge({
        invoiceRef: "INV-2026-042",
        clientLabel: null,
        amountInr: null,
        tone: "Firm",
        message: "x",
      })
    ).rejects.toThrow("check constraint violated");
  });
});
