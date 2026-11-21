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

const CARD_CLASS = "rounded-xl border border-slate-200 bg-white p-6";
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2";
const BUTTON_BASE = `inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`;
const PRIMARY_BUTTON = `${BUTTON_BASE} bg-slate-900 text-white hover:bg-slate-800`;
const SECONDARY_BUTTON = `${BUTTON_BASE} border border-slate-300 bg-white text-slate-900 hover:bg-slate-50`;
const INPUT_CLASS = `mt-1 block w-full min-h-11 rounded-md border px-3 py-2 text-sm text-slate-900 ${FOCUS_RING}`;

const BUCKET_STYLES: Record<AgingBucketLabel, string> = {
  [BUCKET_LABELS.current]: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  [BUCKET_LABELS.days1to7]: "bg-amber-50 text-amber-800 ring-amber-600/20",
  [BUCKET_LABELS.days8to15]: "bg-orange-50 text-orange-800 ring-orange-600/20",
  [BUCKET_LABELS.days15plus]: "bg-rose-50 text-rose-700 ring-rose-600/20",
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
        <h2 className="text-2xl font-semibold text-slate-900">Who Owes Me?</h2>
        <button
          ref={newInvoiceButtonRef}
          type="button"
          onClick={() => setDialogOpen(true)}
          className={PRIMARY_BUTTON}
        >
          + New Invoice
        </button>
      </div>

      <div className={CARD_CLASS}>
        {!data ? (
          <p className="text-sm text-slate-600">Loading receivables...</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-slate-600">No open invoices. Everything is collected.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <caption className="mb-3 text-left text-base font-semibold text-slate-900">
                Receivables
              </caption>
              <thead>
                <tr className="border-b border-slate-200">
                  {columns.map((col) => (
                    <th
                      key={col.label}
                      scope="col"
                      aria-sort={col.key ? ariaSortFor(col.key) : undefined}
                      className={`px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 ${
                        col.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      {col.key ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key as ReceivableSortKey)}
                          className={`inline-flex min-h-11 items-center rounded-md px-1 text-xs font-medium uppercase tracking-wide text-slate-700 hover:text-slate-900 ${FOCUS_RING}`}
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
                    <tr key={invoice.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3 text-sm text-slate-900">{row.clientName}</td>
                      <td className="px-3 py-3 text-sm text-slate-700">{invoice.invoice_number}</td>
                      <td className="px-3 py-3 text-sm text-slate-700">{invoice.title}</td>
                      <td className="px-3 py-3 text-right text-sm font-medium tabular-nums text-slate-900">
                        {formatInr(invoice.amount)}
                      </td>
                      <td className="px-3 py-3 text-sm tabular-nums text-slate-700">
                        {formatDueDate(invoice.due_date)}
                      </td>
                      <td className="px-3 py-3 text-sm tabular-nums">
                        {overdue ? (
                          <span className="text-rose-700">
                            {row.days} {unit} overdue
                          </span>
                        ) : (
                          <span className={row.days >= -7 ? "text-amber-700" : "text-emerald-700"}>
                            {-row.days} {unit} left
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BUCKET_STYLES[bucket]}`}
                        >
                          {bucket}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-700">
                        {row.lastFollowUp ? dateTimeFormatter.format(new Date(row.lastFollowUp)) : "Never"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openChase({ invoiceId: invoice.id, tone: "friendly" })}
                            className={SECONDARY_BUTTON}
                          >
                            Chase Now
                          </button>
                          <button
                            type="button"
                            disabled={pendingId !== null || !data.settings}
                            onClick={() => handleMarkPaid(invoice)}
                            className={PRIMARY_BUTTON}
                          >
                            {isPending ? "Saving..." : "Mark Paid"}
                          </button>
                        </div>
                        {rowError?.id === invoice.id && (
                          <p role="alert" className="mt-2 text-sm text-rose-700">
                            {rowError.message}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
    `${INPUT_CLASS} ${errors[field] ? "border-rose-600" : "border-slate-300"}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onKeyDown={handleKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 id={titleId} className="text-lg font-semibold text-slate-900">
          New Invoice
        </h3>

        {errorCount > 0 && (
          <div role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Please fix the highlighted fields.
          </div>
        )}
        {submitError && (
          <div role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {submitError}
          </div>
        )}

        <form noValidate onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor={fieldId("client_id")} className="block text-sm font-medium text-slate-700">
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
              <p id={errorId("client_id")} className="mt-1 text-sm text-rose-700">
                {errors.client_id}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={fieldId("invoice_number")} className="block text-sm font-medium text-slate-700">
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
              <p id={errorId("invoice_number")} className="mt-1 text-sm text-rose-700">
                {errors.invoice_number}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={fieldId("title")} className="block text-sm font-medium text-slate-700">
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
            <label htmlFor={fieldId("amount")} className="block text-sm font-medium text-slate-700">
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
              <p id={errorId("amount")} className="mt-1 text-sm text-rose-700">
                {errors.amount}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={fieldId("due_date")} className="block text-sm font-medium text-slate-700">
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
              <p id={errorId("due_date")} className="mt-1 text-sm text-rose-700">
                {errors.due_date}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={fieldId("status")} className="block text-sm font-medium text-slate-700">
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

          <div className="flex flex-wrap justify-end gap-3 pt-2">
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
