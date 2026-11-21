import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { parseQuickAdd, type QuickAddResult } from "../engine/quickAddParser";
import { formatINR } from "../engine/reminderTemplates";
import { supabase } from "../lib/supabase";
import { createBill, createClientRecord, createInvoice } from "../services/db";
import type { Client } from "../types/database";

interface QuickAddBarProps {
  /** Local date as 'YYYY-MM-DD'. Due dates are computed from it. */
  today: string;
  /** Called after a record is saved so the caller can reload its data. */
  onSaved?: () => void;
  disabled?: boolean;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2";
const EXAMPLE = "Invoice Aarav Studio 45000 due in 14 days for Brand Guidelines";

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Could not save. Try again.";
}

/** Escapes LIKE wildcards so a client name is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function invoiceNumberFor(today: string): string {
  const compact = today.replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-${compact}-${suffix}`;
}

/** Matches an existing client by name (case-insensitive) or creates one. */
async function findOrCreateClient(userId: string, name: string): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", userId)
    .ilike("name", escapeLike(name))
    .limit(20);
  if (error) throw new Error(error.message);

  const wanted = name.trim().toLowerCase();
  const match = ((data ?? []) as Client[]).find((c) => c.name.trim().toLowerCase() === wanted);
  if (match) return match;

  return createClientRecord({
    name,
    contact_name: null,
    email: null,
    whatsapp: null,
    avg_delay_days: 0,
    notes: null,
  });
}

async function saveEntry(entry: QuickAddResult, today: string, userId: string): Promise<void> {
  if (entry.type === "invoice") {
    const client = await findOrCreateClient(userId, entry.name);
    await createInvoice({
      client_id: client.id,
      invoice_number: invoiceNumberFor(today),
      title: entry.title,
      amount: entry.amount,
      issue_date: today,
      due_date: entry.dueDate,
      status: "sent",
      paid_date: null,
      last_followed_up_at: null,
    });
    return;
  }

  await createBill({
    title: entry.title,
    category: "other",
    amount: entry.amount,
    due_date: entry.dueDate,
    recurring_monthly: false,
    paid: false,
  });
}

export default function QuickAddBar({ today, onSaved, disabled = false }: QuickAddBarProps) {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const parsed = useMemo(() => parseQuickAdd(input, today), [input, today]);
  const hasText = input.trim().length > 0;
  const canSubmit = !disabled && !saving && parsed !== null && user !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed || !user || disabled) return;

    setSaving(true);
    setError(null);
    setSavedNote(null);
    try {
      await saveEntry(parsed, today, user.id);
      setInput("");
      setSavedNote(`Saved ${parsed.type} for ${parsed.name}.`);
      onSaved?.();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  const isInvoice = parsed?.type === "invoice";

  return (
    <div className="space-y-2">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="quick-add" className="sr-only">
          Quick add an invoice or bill
        </label>
        <input
          id="quick-add"
          type="text"
          value={input}
          disabled={disabled || saving}
          onChange={(e) => {
            setInput(e.target.value);
            setSavedNote(null);
          }}
          placeholder={EXAMPLE}
          autoComplete="off"
          className={`min-h-11 w-full min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 disabled:opacity-60 ${FOCUS_RING}`}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className={`min-h-11 shrink-0 rounded-md bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
        >
          {saving ? "Saving..." : "Save entry"}
        </button>
      </form>

      <div aria-live="polite" className="min-h-6 text-sm">
        {parsed ? (
          <span
            className={`inline-flex flex-wrap items-center gap-x-2 rounded-md border px-2.5 py-1 ${
              isInvoice
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            <span className="font-semibold capitalize">{parsed.type}</span>
            <span>{parsed.name}</span>
            <span className="tabular-nums">{formatINR(parsed.amount)}</span>
            <span className="tabular-nums">due {parsed.dueDate}</span>
          </span>
        ) : hasText ? (
          <span className="text-slate-500">Format: {EXAMPLE}</span>
        ) : savedNote ? (
          <span className="text-slate-600">{savedNote}</span>
        ) : null}
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
