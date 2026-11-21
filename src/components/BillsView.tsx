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
  paid: "text-emerald-700",
  overdue: "text-rose-700",
  soon: "text-amber-700",
  upcoming: "text-slate-700",
};

const INPUT_CLASS =
  "mt-1 block w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
const INPUT_ERROR_CLASS = "border-rose-500";
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2";

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
        <h2 className="text-2xl font-semibold text-slate-900">Bills and Fixed Costs</h2>
        <button
          ref={triggerRef}
          type="button"
          onClick={openModal}
          className={`min-h-11 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 ${FOCUS_RING}`}
        >
          + Add Bill
        </button>
      </div>

      {toggleError && (
        <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          {toggleError}
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {sortedBills.length === 0 ? (
          <p className="text-sm text-slate-600">
            No bills yet. Add rent, contractors, or software costs to see your runway.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <caption className="sr-only">Bills and fixed costs</caption>
              <thead>
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Title</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Category</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Due date</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Recurring</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold text-slate-700">Amount</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Status</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-slate-700">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedBills.map((bill) => {
                  const status = billStatus(bill, today);
                  const pending = pendingId === bill.id;
                  return (
                    <tr key={bill.id}>
                      <td className="px-3 py-2 font-medium text-slate-900">{bill.title}</td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                          {CATEGORY_LABEL[bill.category]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {new Date(`${bill.due_date}T00:00:00`).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            bill.recurring_monthly
                              ? "bg-indigo-50 text-indigo-700"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {bill.recurring_monthly ? "Monthly" : "One-time"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                        {inrFormatter.format(bill.amount)}
                      </td>
                      <td className={`px-3 py-2 font-medium ${STATUS_CLASS[status.tone]}`}>
                        {status.label}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={bill.paid}
                          aria-label={`Mark ${bill.title} as ${bill.paid ? "unpaid" : "paid"}`}
                          disabled={pending}
                          onClick={() => handleTogglePaid(bill)}
                          className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium disabled:opacity-50 ${FOCUS_RING} ${
                            bill.paid
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-slate-300 bg-white text-slate-700"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`inline-block h-4 w-7 rounded-full ${
                              bill.paid ? "bg-emerald-500" : "bg-slate-300"
                            }`}
                          />
                          {pending ? "Saving..." : bill.paid ? "Paid" : "Unpaid"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-bill-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h3 id="add-bill-title" className="text-lg font-semibold text-slate-900">
              Add Bill
            </h3>

            {submitted && errorList.length > 0 && (
              <div role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                <p className="font-medium">Please fix the following:</p>
                <ul className="list-disc pl-5">
                  {errorList.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            {saveError && (
              <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                {saveError}
              </p>
            )}

            <form noValidate onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="bill-title" className="block text-sm font-medium text-slate-700">
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
                  <p id="bill-title-error" className="mt-1 text-sm text-rose-700">
                    {errors.title}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="bill-category" className="block text-sm font-medium text-slate-700">
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
                <label htmlFor="bill-amount" className="block text-sm font-medium text-slate-700">
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
                  <p id="bill-amount-error" className="mt-1 text-sm text-rose-700">
                    {errors.amount}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="bill-due-date" className="block text-sm font-medium text-slate-700">
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
                  <p id="bill-due-date-error" className="mt-1 text-sm text-rose-700">
                    {errors.dueDate}
                  </p>
                )}
              </div>

              <div className="flex min-h-11 items-center gap-2">
                <input
                  id="bill-recurring"
                  type="checkbox"
                  checked={form.recurring}
                  onChange={(e) => updateField("recurring", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <label htmlFor="bill-recurring" className="text-sm font-medium text-slate-700">
                  Recurring monthly
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className={`min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 ${FOCUS_RING}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`min-h-11 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 ${FOCUS_RING}`}
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
