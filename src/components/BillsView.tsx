import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useWorkspace, WORKSPACE_CHANGED_EVENT, todayIso } from "../hooks/useWorkspace";
import { createBill, toggleBillPaid } from "../services/db";
import type { Bill, BillCategory } from "../types/database";

const MS_PER_DAY = 86_400_000;
const DUE_SOON_DAYS = 7;
const EMPTY_BILLS: Bill[] = [];

const CATEGORY_OPTIONS: { value: BillCategory; label: string }[] = [
  { value: "rent", label: "Rent" },
  { value: "contractor", label: "Contractor" },
  { value: "software", label: "Software" },
  { value: "tax", label: "Tax" },
  { value: "other", label: "Other" },
];

const CATEGORY_LABEL: Record<BillCategory, string> = {
  rent: "Rent",
  contractor: "Contractor",
  software: "Software",
  tax: "Tax",
  other: "Other",
};

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Whole days from `today` until `dueDate` (negative when overdue). Both are 'YYYY-MM-DD'. */
function daysUntil(dueDate: string, today: string): number {
  const toDay = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d) / MS_PER_DAY;
  };
  return Math.round(toDay(dueDate) - toDay(today));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Human label for a bill's due date relative to today, e.g. "Due in 3 days". */
export function billDueLabel(dueDate: string, today: string): string {
  const diff = daysUntil(dueDate, today);
  if (diff === 0) return "Due today";
  if (diff > 0) return `Due in ${plural(diff, "day")}`;
  return `${plural(-diff, "day")} overdue`;
}

/** Unpaid bills first, then by due date ascending. Returns a new array. */
export function sortBills(bills: Bill[]): Bill[] {
  return [...bills].sort((a, b) => {
    if (a.paid !== b.paid) return a.paid ? 1 : -1;
    if (a.due_date < b.due_date) return -1;
    if (a.due_date > b.due_date) return 1;
    return 0;
  });
}

type StatusTone = "paid" | "overdue" | "soon" | "upcoming";

function billStatus(bill: Bill, today: string): { tone: StatusTone; label: string } {
  if (bill.paid) return { tone: "paid", label: "Paid" };
  const label = billDueLabel(bill.due_date, today);
  const diff = daysUntil(bill.due_date, today);
  if (diff < 0) return { tone: "overdue", label };
  if (diff <= DUE_SOON_DAYS) return { tone: "soon", label };
  return { tone: "upcoming", label };
}

const STATUS_CLASS: Record<StatusTone, string> = {
  paid: "text-emerald",
  overdue: "text-rose",
  soon: "text-amber",
  upcoming: "text-ink-secondary",
};

const CATEGORY_BADGE_CLASS =
  "inline-flex rounded-full border border-line bg-subtle px-2 py-0.5 text-xs font-medium text-ink-secondary";
const RECURRING_BADGE_CLASS =
  "inline-flex rounded-full border border-blue/30 bg-blue/5 px-2 py-0.5 text-xs font-medium text-blue";
const PRIMARY_BUTTON_CLASS =
  "button-md rounded-lg bg-blue px-3 py-2 text-white hover:bg-blue/90 active:scale-[0.98] transition-transform duration-150 ease-emphasis disabled:opacity-50";
const SECONDARY_BUTTON_CLASS =
  "button-md rounded-lg border border-line bg-surface px-3 py-2 text-ink hover:bg-canvas active:scale-[0.98] transition-transform duration-150 ease-emphasis disabled:opacity-50";
const ERROR_BANNER_CLASS = "rounded-lg border border-rose/30 bg-rose/5 px-3 py-2 text-sm text-rose";
const INPUT_CLASS =
  "mt-1 block h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/30";
const INPUT_ERROR_CLASS = "border-rose";
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2";

interface BillFormState {
  title: string;
  category: BillCategory;
  amount: string;
  dueDate: string;
  recurring: boolean;
}

interface BillFormErrors {
  title?: string;
  amount?: string;
  dueDate?: string;
}

const EMPTY_FORM: BillFormState = {
  title: "",
  category: "rent",
  amount: "",
  dueDate: "",
  recurring: false,
};

function validateBillForm(form: BillFormState): BillFormErrors {
  const errors: BillFormErrors = {};
  if (!form.title.trim()) errors.title = "Enter a title for this bill.";
  const amount = Number(form.amount);
  if (form.amount.trim() === "" || !Number.isFinite(amount) || amount <= 0) {
    errors.amount = "Enter an amount greater than 0.";
  }
  if (!form.dueDate) errors.dueDate = "Choose a due date.";
  return errors;
}

export function BillsView() {
  const { data, refresh } = useWorkspace();
  const bills = data?.bills ?? EMPTY_BILLS;
  const sortedBills = useMemo(() => sortBills(bills), [bills]);
  const today = todayIso();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<BillFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<BillFormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!modalOpen) return;
    firstFieldRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModalOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  function openModal() {
    setForm(EMPTY_FORM);
    setErrors({});
    setSubmitted(false);
    setSaveError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    triggerRef.current?.focus();
  }

  function updateField<K extends keyof BillFormState>(key: K, value: BillFormState[K]) {
    const next = { ...form, [key]: value };
    setForm(next);
    if (submitted) setErrors(validateBillForm(next));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    const nextErrors = validateBillForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      await createBill({
        title: form.title.trim(),
        category: form.category,
        amount: Number(form.amount),
        due_date: form.dueDate,
        recurring_monthly: form.recurring,
        paid: false,
      });
      await refresh();
      window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
      setSaving(false);
      closeModal();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save this bill. Try again.");
      setSaving(false);
    }
  }

  async function handleTogglePaid(bill: Bill) {
    setPendingId(bill.id);
    setToggleError(null);
    try {
      await toggleBillPaid(bill);
      await refresh();
      window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
    } catch (err) {
      setToggleError(
        err instanceof Error
          ? `Could not update "${bill.title}": ${err.message}`
          : `Could not update "${bill.title}". Try again.`,
      );
    } finally {
      setPendingId(null);
    }
  }

  const errorList = Object.values(errors).filter((msg): msg is string => Boolean(msg));

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="heading-md text-ink">Bills and Fixed Costs</h2>
        <button
          ref={triggerRef}
          type="button"
          onClick={openModal}
          className={`${PRIMARY_BUTTON_CLASS} ${FOCUS_RING}`}
        >
          + Add Bill
        </button>
      </div>

      {toggleError && (
        <div role="alert" className={`flex items-start justify-between gap-3 ${ERROR_BANNER_CLASS}`}>
          <p>{toggleError}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setToggleError(null)}
            className={`shrink-0 rounded text-rose ${FOCUS_RING}`}
          >
            ×
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        {sortedBills.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <h3 className="title-sm text-ink">No bills yet.</h3>
            <p className="body-md text-ink-secondary">
              Add rent, contractors, or software costs to see your runway.
            </p>
            <button
              type="button"
              onClick={openModal}
              className={`${PRIMARY_BUTTON_CLASS} ${FOCUS_RING}`}
            >
              + Add Bill
            </button>
          </div>
        ) : (
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Bills and fixed costs</caption>
            <thead className="bg-subtle">
              <tr>
                <th scope="col" className="border-b border-line px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-muted">Title</th>
                <th scope="col" className="border-b border-line px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-muted">Category</th>
                <th scope="col" className="border-b border-line px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-muted">Due date</th>
                <th scope="col" className="border-b border-line px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-muted">Recurring</th>
                <th scope="col" className="border-b border-line px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-ink-muted">Amount</th>
                <th scope="col" className="border-b border-line px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-muted">Status</th>
                <th scope="col" className="border-b border-line px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-muted">Paid</th>
              </tr>
            </thead>
            <tbody>
              {sortedBills.map((bill) => {
                const status = billStatus(bill, today);
                const pending = pendingId === bill.id;
                return (
                  <tr key={bill.id} className="border-b border-line hover:bg-canvas">
                    <td className="px-4 py-3 align-middle font-medium text-ink">{bill.title}</td>
                    <td className="px-4 py-3 align-middle">
                      <span className={CATEGORY_BADGE_CLASS}>{CATEGORY_LABEL[bill.category]}</span>
                    </td>
                    <td className="num-inr px-4 py-3 align-middle text-ink-secondary">
                      {new Date(`${bill.due_date}T00:00:00`).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {bill.recurring_monthly ? (
                        <span className={RECURRING_BADGE_CLASS}>Monthly</span>
                      ) : (
                        <span className={CATEGORY_BADGE_CLASS}>One-time</span>
                      )}
                    </td>
                    <td className="num-inr px-4 py-3 text-right align-middle text-ink">
                      {inrFormatter.format(bill.amount)}
                    </td>
                    <td className={`px-4 py-3 align-middle font-medium ${STATUS_CLASS[status.tone]}`}>
                      {status.label}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={bill.paid}
                        aria-label={bill.paid ? "Mark unpaid" : "Mark paid"}
                        disabled={pending}
                        onClick={() => handleTogglePaid(bill)}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors duration-150 ease-emphasis disabled:opacity-50 ${FOCUS_RING} ${
                          bill.paid ? "bg-emerald" : "bg-line-strong"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-150 ease-emphasis ${
                            bill.paid ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-bill-title"
            className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-surface p-6"
          >
            <h3 id="add-bill-title" className="heading-md text-ink">
              Add Bill
            </h3>

            {submitted && errorList.length > 0 && (
              <div role="alert" className={`mt-4 ${ERROR_BANNER_CLASS}`}>
                <p className="font-medium">Please fix the following:</p>
                <ul className="list-disc pl-5">
                  {errorList.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            {saveError && (
              <p role="alert" className={`mt-4 ${ERROR_BANNER_CLASS}`}>
                {saveError}
              </p>
            )}

            <form noValidate onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="bill-title" className="caption block text-ink-secondary">
                    Title
                  </label>
                  <input
                    id="bill-title"
                    ref={firstFieldRef}
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => updateField("title", e.target.value)}
                    aria-invalid={Boolean(errors.title)}
                    aria-describedby={errors.title ? "bill-title-error" : undefined}
                    className={`${INPUT_CLASS} ${errors.title ? INPUT_ERROR_CLASS : ""}`}
                  />
                  {errors.title && (
                    <p id="bill-title-error" className="mt-1 text-sm text-rose">
                      {errors.title}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="bill-category" className="caption block text-ink-secondary">
                    Category
                  </label>
                  <select
                    id="bill-category"
                    value={form.category}
                    onChange={(e) => updateField("category", e.target.value as BillCategory)}
                    className={INPUT_CLASS}
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="bill-amount" className="caption block text-ink-secondary">
                    Amount (INR)
                  </label>
                  <input
                    id="bill-amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    required
                    value={form.amount}
                    onChange={(e) => updateField("amount", e.target.value)}
                    aria-invalid={Boolean(errors.amount)}
                    aria-describedby={errors.amount ? "bill-amount-error" : undefined}
                    className={`${INPUT_CLASS} ${errors.amount ? INPUT_ERROR_CLASS : ""}`}
                  />
                  {errors.amount && (
                    <p id="bill-amount-error" className="mt-1 text-sm text-rose">
                      {errors.amount}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="bill-due-date" className="caption block text-ink-secondary">
                    Due date
                  </label>
                  <input
                    id="bill-due-date"
                    type="date"
                    required
                    value={form.dueDate}
                    onChange={(e) => updateField("dueDate", e.target.value)}
                    aria-invalid={Boolean(errors.dueDate)}
                    aria-describedby={errors.dueDate ? "bill-due-date-error" : undefined}
                    className={`${INPUT_CLASS} ${errors.dueDate ? INPUT_ERROR_CLASS : ""}`}
                  />
                  {errors.dueDate && (
                    <p id="bill-due-date-error" className="mt-1 text-sm text-rose">
                      {errors.dueDate}
                    </p>
                  )}
                </div>

                <div className="flex h-9 items-center gap-2 sm:self-end">
                  <input
                    id="bill-recurring"
                    type="checkbox"
                    checked={form.recurring}
                    onChange={(e) => updateField("recurring", e.target.checked)}
                    className="h-4 w-4 rounded border-line text-blue focus:ring-blue/30"
                  />
                  <label htmlFor="bill-recurring" className="text-sm font-medium text-ink">
                    Recurring monthly
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className={`${SECONDARY_BUTTON_CLASS} ${FOCUS_RING}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`${PRIMARY_BUTTON_CLASS} ${FOCUS_RING}`}
                >
                  {saving ? "Saving..." : "Save Bill"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
