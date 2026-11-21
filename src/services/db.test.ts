import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchWorkspaceData,
  logFollowUp,
  markInvoicePaid,
  seedDemoWorkspace,
  toggleBillPaid,
} from "./db";
import type { Bill, Invoice } from "../types/database";

// Shared in-memory fake of the Supabase client. Hoisted so vi.mock can use it.
const fake = vi.hoisted(() => {
  type Call = {
    table: string;
    op: "select" | "insert" | "update";
    payload?: unknown;
    filters: Array<{ column: string; value: unknown }>;
  };
  type Result = { data: unknown; error: { message: string } | null };

  const state = {
    userId: "user-123",
    calls: [] as Call[],
    rpcCalls: [] as Array<{ fn: string; args: unknown }>,
    tableData: {} as Record<string, unknown>,
    tableError: {} as Record<string, { message: string } | null>,
    rpcError: null as { message: string } | null,
  };

  const makeBuilder = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    state.calls.push(call);

    const result = (): Result => {
      // Mirror Supabase update().select().single(): the returned row is the
      // stored row with the patch applied, so it is never null for an update.
      const stored = state.tableData[table];
      const data =
        call.op === "update"
          ? { ...((stored ?? {}) as object), ...((call.payload ?? {}) as object) }
          : (stored ?? null);
      return { data, error: state.tableError[table] ?? null };
    };

    const builder = {
      select: () => builder,
      insert: (payload: unknown) => {
        call.op = "insert";
        call.payload = payload;
        return builder;
      },
      update: (payload: unknown) => {
        call.op = "update";
        call.payload = payload;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        call.filters.push({ column, value });
        return builder;
      },
      order: () => builder,
      single: () => Promise.resolve(result()),
      maybeSingle: () => Promise.resolve(result()),
      then: (
        onFulfilled?: ((value: Result) => unknown) | null,
        onRejected?: ((reason: unknown) => unknown) | null
      ) => Promise.resolve(result()).then(onFulfilled, onRejected),
    };
    return builder;
  };

  const client = {
    from: (table: string) => makeBuilder(table),
    rpc: (fn: string, args?: unknown) => {
      state.rpcCalls.push({ fn, args });
      return Promise.resolve({ data: null, error: state.rpcError });
    },
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: state.userId } }, error: null }),
    },
  };

  return { state, client };
});

vi.mock("../lib/supabase", () => ({
  supabase: fake.client,
}));

const { state } = fake;

function callsFor(table: string) {
  return state.calls.filter((c) => c.table === table);
}

beforeEach(() => {
  state.calls = [];
  state.rpcCalls = [];
  state.tableData = {};
  state.tableError = {};
  state.rpcError = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchWorkspaceData", () => {
  it("returns settings opening_balance and safe_buffer_amount as numbers from numeric strings", async () => {
    state.tableData.studio_settings = {
      user_id: "user-123",
      studio_name: "Studio",
      owner_name: "Owner",
      currency_symbol: "$",
      opening_balance: "1200.50",
      safe_buffer_amount: "300.25",
      created_at: "2025-01-01T00:00:00.000Z",
    };

    const result = await fetchWorkspaceData("user-123");

    expect(typeof result.settings?.opening_balance).toBe("number");
    expect(typeof result.settings?.safe_buffer_amount).toBe("number");
    expect(result.settings?.opening_balance).toBe(1200.5);
    expect(result.settings?.safe_buffer_amount).toBe(300.25);
  });

  it("returns invoice and bill amounts as numbers from numeric strings", async () => {
    state.tableData.invoices = [
      { id: "inv-1", amount: "450.75", status: "sent" },
    ];
    state.tableData.bills = [{ id: "bill-1", amount: "80", paid: false }];

    const result = await fetchWorkspaceData("user-123");

    expect(typeof result.invoices[0].amount).toBe("number");
    expect(result.invoices[0].amount).toBe(450.75);
    expect(typeof result.bills[0].amount).toBe("number");
    expect(result.bills[0].amount).toBe(80);
  });

  it("queries every workspace table filtered by the user id", async () => {
    await fetchWorkspaceData("user-123");

    for (const table of [
      "studio_settings",
      "clients",
      "invoices",
      "bills",
      "followup_logs",
    ]) {
      const calls = callsFor(table);
      expect(calls).toHaveLength(1);
      expect(calls[0].op).toBe("select");
      expect(calls[0].filters).toContainEqual({
        column: "user_id",
        value: "user-123",
      });
    }
  });
});

describe("markInvoicePaid", () => {
  const invoice = {
    id: "inv-1",
    user_id: "user-123",
    client_id: "c-1",
    invoice_number: "INV-1",
    title: "Shoot",
    amount: "450.75",
    issue_date: "2025-02-01",
    due_date: "2025-02-15",
    status: "sent",
    paid_date: null,
    last_followed_up_at: null,
    created_at: "2025-02-01T00:00:00.000Z",
  } as unknown as Invoice;

  it("sets the invoice status to paid and paid_date to the local YYYY-MM-DD date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 5, 23, 30));
    state.tableData.invoices = { ...invoice, status: "paid", paid_date: "2025-03-05" };

    await markInvoicePaid(invoice, "1200.50" as unknown as number);

    const update = callsFor("invoices").find((c) => c.op === "update");
    expect(update?.payload).toEqual({ status: "paid", paid_date: "2025-03-05" });
    expect(update?.filters).toContainEqual({ column: "id", value: "inv-1" });
  });

  it("sets studio_settings opening_balance to Number(current) + Number(amount) using string inputs", async () => {
    await markInvoicePaid(invoice, "1200.50" as unknown as number);

    const update = callsFor("studio_settings").find((c) => c.op === "update");
    expect(update?.payload).toEqual({ opening_balance: 1651.25 });
  });

  it("scopes the studio_settings update to the current user", async () => {
    await markInvoicePaid(invoice, 1200.5);

    const update = callsFor("studio_settings").find((c) => c.op === "update");
    expect(update?.filters).toContainEqual({ column: "user_id", value: "user-123" });
  });

  it("throws and does not update settings when the invoice update fails", async () => {
    state.tableError.invoices = { message: "invoice update failed" };

    await expect(markInvoicePaid(invoice, 1200.5)).rejects.toThrow(
      "invoice update failed"
    );
    expect(callsFor("studio_settings")).toHaveLength(0);
  });
});

describe("logFollowUp", () => {
  it("inserts a followup_logs row with user, invoice, channel, tone and message", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 5, 9, 0));
    const sentAt = new Date(2025, 2, 5, 9, 0).toISOString();
    state.tableData.followup_logs = { id: "log-1" };

    await logFollowUp("inv-1", "email", "firm", "Please pay the invoice");

    const insert = callsFor("followup_logs").find((c) => c.op === "insert");
    expect(insert?.payload).toEqual({
      user_id: "user-123",
      invoice_id: "inv-1",
      sent_at: sentAt,
      channel: "email",
      tone: "firm",
      message: "Please pay the invoice",
    });
  });

  it("updates invoices.last_followed_up_at to the same timestamp as the log", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 5, 9, 0));
    const sentAt = new Date(2025, 2, 5, 9, 0).toISOString();

    await logFollowUp("inv-1", "whatsapp", "friendly", "Hi there");

    const update = callsFor("invoices").find((c) => c.op === "update");
    expect(update?.payload).toEqual({ last_followed_up_at: sentAt });
    expect(update?.filters).toContainEqual({ column: "id", value: "inv-1" });
  });
});

describe("toggleBillPaid", () => {
  it("flips paid from false to true", async () => {
    const bill = { id: "bill-1", paid: false, amount: "80" } as unknown as Bill;

    await toggleBillPaid(bill);

    const update = callsFor("bills").find((c) => c.op === "update");
    expect(update?.payload).toEqual({ paid: true });
    expect(update?.filters).toContainEqual({ column: "id", value: "bill-1" });
  });

  it("flips paid from true to false", async () => {
    const bill = { id: "bill-1", paid: true, amount: "80" } as unknown as Bill;

    await toggleBillPaid(bill);

    const update = callsFor("bills").find((c) => c.op === "update");
    expect(update?.payload).toEqual({ paid: false });
  });
});

describe("seedDemoWorkspace", () => {
  it("calls supabase.rpc with seed_demo_workspace", async () => {
    await seedDemoWorkspace();

    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].fn).toBe("seed_demo_workspace");
  });

  it("throws when the rpc returns an error", async () => {
    state.rpcError = { message: "seed failed" };

    await expect(seedDemoWorkspace()).rejects.toThrow("seed failed");
  });
});
