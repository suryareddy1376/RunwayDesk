import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useWorkspace, todayIso, WORKSPACE_CHANGED_EVENT } from "../hooks/useWorkspace";
import { createInvoice, markInvoicePaid } from "../services/db";
import { BUCKET_LABELS, agingBucket, daysOverdue, type AgingBucketLabel } from "../engine/aging";
import type { Client, FollowupLog, FollowupTone, Invoice } from "../types/database";

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const dueDateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

const CARD_CLASS = "overflow-x-auto rounded-xl border border-line bg-surface";
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2";
const BUTTON_BASE = `inline-flex items-center justify-center rounded-lg font-medium transition-transform duration-150 ease-emphasis active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const PRIMARY_BUTTON = `${BUTTON_BASE} button-md bg-blue px-3 py-2 text-white hover:bg-blue/90`;
const SECONDARY_BUTTON = `${BUTTON_BASE} button-md border border-line bg-surface px-3 py-2 text-ink hover:bg-subtle`;
const SECONDARY_SMALL_BUTTON = `${BUTTON_BASE} min-h-11 sm:min-h-0 border border-line bg-surface px-2.5 py-1 text-xs text-ink hover:bg-subtle`;
const GHOST_EMERALD_BUTTON = `${BUTTON_BASE} min-h-11 sm:min-h-0 px-2.5 py-1 text-xs text-emerald hover:bg-emerald/5`;
const INPUT_CLASS = `mt-1 block h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-blue focus:outline-none ${FOCUS_RING}`;

const BUCKET_STYLES: Record<AgingBucketLabel, string> = {
  [BUCKET_LABELS.current]: "border-line bg-subtle text-ink-secondary",
  [BUCKET_LABELS.days1to7]: "border-amber/30 bg-amber/5 text-amber",
  [BUCKET_LABELS.days8to15]: "border-amber/30 bg-amber/5 text-amber",
  [BUCKET_LABELS.days15plus]: "border-rose/30 bg-rose/5 text-rose",
};

export type ReceivableSortKey =
  | "client"
  | "invoice_number"
  | "title"
  | "amount"
  | "due_date"
  | "days"
  | "aging"
  | "last_follow_up";
export type SortDirection = "asc" | "desc";

export interface ReceivableRow {
  invoice: Invoice;
  clientName: string;
  /** Positive when overdue, negative when days remain (today minus due date). */
  days: number;
  /** Latest follow-up as an ISO timestamp, or null when never followed up. */
  lastFollowUp: string | null;
}

/** Latest follow-up across the invoice timestamp and its follow-up logs. */
function latestFollowUp(invoice: Invoice, logs: FollowupLog[]): string | null {
  const candidates: (string | null | undefined)[] = [
    invoice.last_followed_up_at,
    ...logs.filter((log) => log.invoice_id === invoice.id).map((log) => log.sent_at),
  ];
  let latest: number | null = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const ms = Date.parse(candidate);
    if (Number.isNaN(ms)) continue;
    if (latest === null || ms > latest) latest = ms;
  }
  return latest === null ? null : new Date(latest).toISOString();
}

/** Pure sort over receivable rows. Returns a new array; the input is not mutated. */
export function sortReceivables(
  rows: ReceivableRow[],
  key: ReceivableSortKey,
  direction: SortDirection
): ReceivableRow[] {
  const sign = direction === "asc" ? 1 : -1;
  const compare = (a: ReceivableRow, b: ReceivableRow): number => {
    switch (key) {
      case "client":
        return a.clientName.localeCompare(b.clientName);
      case "invoice_number":
        return a.invoice.invoice_number.localeCompare(b.invoice.invoice_number, undefined, {
          numeric: true,
        });
      case "title":
        return a.invoice.title.localeCompare(b.invoice.title);
      case "amount":
        return a.invoice.amount - b.invoice.amount;
      case "due_date":
        return a.invoice.due_date.localeCompare(b.invoice.due_date);
      case "days":
      case "aging":
        return a.days - b.days;
      case "last_follow_up":
        // ISO timestamps; "" sorts first so "Never" comes first ascending.
        return (a.lastFollowUp ?? "").localeCompare(b.lastFollowUp ?? "");
    }
  };
  return [...rows].sort((a, b) => sign * compare(a, b));
}

/** Aging bucket label for an invoice as of `today` ('YYYY-MM-DD'). */
export function agingLabelFor(invoice: Invoice, today: string): AgingBucketLabel {
  return agingBucket(daysOverdue(invoice.due_date, today));
}

function formatInr(amount: number): string {
  return inrFormatter.format(amount);
}

function formatDueDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return dueDateFormatter.format(new Date(year, month - 1, day));
}

interface ReceivablesViewProps {
  openChase: (target: { invoiceId: string; tone: FollowupTone }) => void;
}

export function ReceivablesView({ openChase }: ReceivablesViewProps) {
  const { data, refresh } = useWorkspace();
  const today = todayIso();
  const [dialogOpen, setDialogOpen] = useState(false);
  const newInvoiceButtonRef = useRef<HTMLButtonElement>(null);
  const [sort, setSort] = useState<{ key: ReceivableSortKey; direction: SortDirection }>({
    key: "days",
    direction: "desc",
  });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const rows = useMemo<ReceivableRow[]>(() => {
    if (!data) return [];
    const clientNames = new Map(data.clients.map((client) => [client.id, client.name] as const));
    return data.invoices
      .filter((invoice) => invoice.status !== "paid")
      .map((invoice) => ({
        invoice,
        clientName: clientNames.get(invoice.client_id) ?? "Unknown client",
        days: daysOverdue(invoice.due_date, today),
        lastFollowUp: latestFollowUp(invoice, data.followupLogs),
      }));
  }, [data, today]);

  const sorted = useMemo(
    () => sortReceivables(rows, sort.key, sort.direction),
    [rows, sort]
  );

  function toggleSort(key: ReceivableSortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }

  function ariaSortFor(key: ReceivableSortKey): "none" | "ascending" | "descending" {
    if (sort.key !== key) return "none";
    return sort.direction === "asc" ? "ascending" : "descending";
  }

  function arrowFor(key: ReceivableSortKey): string {
    if (sort.key !== key) return "";
    return sort.direction === "asc" ? " \u25B2" : " \u25BC";
  }

  async function notifyWorkspaceChanged() {
    await refresh();
    window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
  }

  async function handleMarkPaid(invoice: Invoice) {
    const settings = data?.settings;
    if (!settings) return;
    setPendingId(invoice.id);
    setRowError(null);
    try {
      await markInvoicePaid(invoice, settings.opening_balance);
      await notifyWorkspaceChanged();
    } catch (err) {
      setRowError({
        id: invoice.id,
        message: err instanceof Error ? err.message : "Could not mark this invoice as paid.",
      });
    } finally {
      setPendingId(null);
    }
  }

  function closeDialog() {
    setDialogOpen(false);
    newInvoiceButtonRef.current?.focus();
  }

  const columns: { key: ReceivableSortKey | null; label: string; align?: "right" }[] = [
    { key: "client", label: "Client" },
    { key: "invoice_number", label: "Invoice #" },
    { key: "title", label: "Title" },
    { key: "amount", label: "Amount", align: "right" },
    { key: "due_date", label: "Due Date" },
    { key: "days", label: "Days Overdue / Remaining" },
    { key: "aging", label: "Aging" },
    { key: "last_follow_up", label: "Last Follow-Up" },
    { key: null, label: "Actions" },
  ];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="heading-md text-ink">Who Owes Me?</h2>
        <button
          ref={newInvoiceButtonRef}
          type="button"
          onClick={() => setDialogOpen(true)}
          className={PRIMARY_BUTTON}
        >
          + New Invoice
        </button>
      </div>

      {rowError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-rose/30 bg-rose/5 px-3 py-2 text-sm text-rose"
        >
          <span>{rowError.message}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setRowError(null)}
            className={`${SECONDARY_SMALL_BUTTON} shrink-0`}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className={CARD_CLASS}>
        {!data ? (
          <p className="p-6 text-sm text-ink-secondary">Loading receivables...</p>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <p className="title-sm text-ink">No open invoices. Everything is collected.</p>
            <button type="button" onClick={() => setDialogOpen(true)} className={PRIMARY_BUTTON}>
              + New Invoice
            </button>
          </div>
        ) : (
          <table className="min-w-full border-collapse text-left text-sm">
            <caption className="mb-3 text-left title-sm text-ink">Receivables</caption>
            <thead>
              <tr className="bg-subtle">
                {columns.map((col) => (
                  <th
                    key={col.label}
                    scope="col"
                    aria-sort={col.key ? ariaSortFor(col.key) : undefined}
                    className={`border-b border-line px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-muted ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {col.key ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key as ReceivableSortKey)}
                        className={`inline-flex items-center rounded px-1 text-xs font-medium uppercase tracking-wide text-ink-muted hover:text-ink ${FOCUS_RING}`}
                      >
                        {col.label}
                        <span aria-hidden="true">{arrowFor(col.key)}</span>
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const { invoice } = row;
                const bucket = agingLabelFor(invoice, today);
                const isPending = pendingId === invoice.id;
                const overdue = row.days > 0;
                const unit = Math.abs(row.days) === 1 ? "day" : "days";
                return (
                  <tr key={invoice.id} className="border-b border-line align-middle hover:bg-canvas">
                    <td className="px-4 py-3 text-ink">{row.clientName}</td>
                    <td className="px-4 py-3 text-ink-secondary">{invoice.invoice_number}</td>
                    <td className="px-4 py-3 text-ink-secondary">{invoice.title}</td>
                    <td className="num-inr px-4 py-3 text-right font-medium text-ink">
                      {formatInr(invoice.amount)}
                    </td>
                    <td className="num-inr px-4 py-3 text-ink-secondary">
                      {formatDueDate(invoice.due_date)}
                    </td>
                    <td className="num-inr px-4 py-3">
                      {overdue ? (
                        <span className="text-rose">
                          {row.days} {unit} overdue
                        </span>
                      ) : (
                        <span className={row.days >= -7 ? "text-amber" : "text-emerald"}>
                          {-row.days} {unit} left
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${BUCKET_STYLES[bucket]}`}
                      >
                        {bucket}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">
                      {row.lastFollowUp ? dateTimeFormatter.format(new Date(row.lastFollowUp)) : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openChase({ invoiceId: invoice.id, tone: "friendly" })}
                          className={SECONDARY_SMALL_BUTTON}
                        >
                          Chase Now
                        </button>
                        <button
                          type="button"
                          disabled={pendingId !== null || !data.settings}
                          onClick={() => handleMarkPaid(invoice)}
                          className={GHOST_EMERALD_BUTTON}
                        >
                          {isPending ? "Saving..." : "Mark Paid"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {dialogOpen && (
        <NewInvoiceDialog
          clients={data?.clients ?? []}
          onClose={closeDialog}
          onCreated={notifyWorkspaceChanged}
        />
      )}
    </section>
  );
}

interface InvoiceFormValues {
  client_id: string;
  invoice_number: string;
  title: string;
  amount: string;
  due_date: string;
  status: "sent" | "draft";
}

type FormField = keyof InvoiceFormValues;
type FormErrors = Partial<Record<FormField, string>>;

function validateInvoiceForm(values: InvoiceFormValues, hasClients: boolean): FormErrors {
  const errors: FormErrors = {};
  if (!values.client_id) {
    errors.client_id = hasClients ? "Choose a client." : "Add a client before creating an invoice.";
  }
  if (!values.invoice_number.trim()) {
    errors.invoice_number = "Invoice number is required.";
  }
  const amount = Number(values.amount);
  if (values.amount.trim() === "" || !Number.isFinite(amount) || amount <= 0) {
    errors.amount = "Amount must be greater than 0.";
  }
  if (!values.due_date) {
    errors.due_date = "Due date is required.";
  }
  return errors;
}

interface NewInvoiceDialogProps {
  clients: Client[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}

function NewInvoiceDialog({ clients, onClose, onCreated }: NewInvoiceDialogProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const [values, setValues] = useState<InvoiceFormValues>(() => ({
    client_id: clients[0]?.id ?? "",
    invoice_number: "",
    title: "",
    amount: "",
    due_date: "",
    status: "sent",
  }));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const fieldId = (field: FormField) => `${baseId}-${field}`;
  const errorId = (field: FormField) => `${baseId}-${field}-error`;
  const describedBy = (field: FormField) => (errors[field] ? errorId(field) : undefined);
  const errorCount = Object.keys(errors).length;

  function update<K extends FormField>(field: K, value: InvoiceFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateInvoiceForm(values, clients.length > 0);
    setErrors(found);
    setSubmitError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await createInvoice({
        client_id: values.client_id,
        invoice_number: values.invoice_number.trim(),
        title: values.title.trim(),
        amount: Number(values.amount),
        issue_date: todayIso(),
        due_date: values.due_date,
        status: values.status,
        paid_date: null,
        last_followed_up_at: null,
      });
      await onCreated();
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Could not save the invoice. Please try again."
      );
      setSubmitting(false);
    }
  }

  const inputClass = (field: FormField) =>
    `${INPUT_CLASS} ${errors[field] ? "border-rose" : "border-line"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40" onKeyDown={handleKeyDown}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-surface p-6"
      >
        <h3 id={titleId} className="heading-md text-ink">
          New Invoice
        </h3>

        {errorCount > 0 && (
          <div role="alert" className="mt-4 rounded-lg border border-rose/30 bg-rose/5 px-3 py-2 text-sm text-rose">
            Please fix the highlighted fields.
          </div>
        )}
        {submitError && (
          <div
            role="alert"
            className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-rose/30 bg-rose/5 px-3 py-2 text-sm text-rose"
          >
            <span>{submitError}</span>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setSubmitError(null)}
              className={`${SECONDARY_SMALL_BUTTON} shrink-0`}
            >
              Dismiss
            </button>
          </div>
        )}

        <form noValidate onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={fieldId("client_id")} className="block caption text-ink-secondary">
              Client
            </label>
            <select
              id={fieldId("client_id")}
              ref={firstFieldRef}
              value={values.client_id}
              onChange={(e) => update("client_id", e.target.value)}
              aria-invalid={errors.client_id ? true : undefined}
              aria-describedby={describedBy("client_id")}
              className={inputClass("client_id")}
            >
              {clients.length === 0 && <option value="">No clients yet</option>}
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            {errors.client_id && (
              <p id={errorId("client_id")} className="mt-1 text-sm text-rose">
                {errors.client_id}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={fieldId("invoice_number")} className="block caption text-ink-secondary">
              Invoice number
            </label>
            <input
              id={fieldId("invoice_number")}
              type="text"
              value={values.invoice_number}
              onChange={(e) => update("invoice_number", e.target.value)}
              aria-invalid={errors.invoice_number ? true : undefined}
              aria-describedby={describedBy("invoice_number")}
              aria-required="true"
              className={inputClass("invoice_number")}
            />
            {errors.invoice_number && (
              <p id={errorId("invoice_number")} className="mt-1 text-sm text-rose">
                {errors.invoice_number}
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor={fieldId("title")} className="block caption text-ink-secondary">
              Title
            </label>
            <input
              id={fieldId("title")}
              type="text"
              value={values.title}
              onChange={(e) => update("title", e.target.value)}
              className={inputClass("title")}
            />
          </div>

          <div>
            <label htmlFor={fieldId("amount")} className="block caption text-ink-secondary">
              Amount (INR)
            </label>
            <input
              id={fieldId("amount")}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={values.amount}
              onChange={(e) => update("amount", e.target.value)}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={describedBy("amount")}
              aria-required="true"
              className={`${inputClass("amount")} tabular-nums`}
            />
            {errors.amount && (
              <p id={errorId("amount")} className="mt-1 text-sm text-rose">
                {errors.amount}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={fieldId("due_date")} className="block caption text-ink-secondary">
              Due date
            </label>
            <input
              id={fieldId("due_date")}
              type="date"
              value={values.due_date}
              onChange={(e) => update("due_date", e.target.value)}
              aria-invalid={errors.due_date ? true : undefined}
              aria-describedby={describedBy("due_date")}
              aria-required="true"
              className={inputClass("due_date")}
            />
            {errors.due_date && (
              <p id={errorId("due_date")} className="mt-1 text-sm text-rose">
                {errors.due_date}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={fieldId("status")} className="block caption text-ink-secondary">
              Status
            </label>
            <select
              id={fieldId("status")}
              value={values.status}
              onChange={(e) => update("status", e.target.value as "sent" | "draft")}
              className={inputClass("status")}
            >
              <option value="sent">Sent</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          <div className="flex flex-wrap justify-end gap-3 pt-2 sm:col-span-2">
            <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={PRIMARY_BUTTON}>
              {submitting ? "Saving..." : "Create invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
