import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createClientRecord } from "../services/db";
import { useWorkspace, WORKSPACE_CHANGED_EVENT } from "../hooks/useWorkspace";
import type { Client, Invoice } from "../types/database";

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_PATTERN = /^\+?\d+$/;

const INPUT_CLASS =
  "mt-1 block w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30";

/** Sum of unpaid (sent or overdue) invoice amounts keyed by client_id. */
export function unpaidOwedByClient(invoices: Invoice[]): Record<string, number> {
  const owed: Record<string, number> = {};
  for (const inv of invoices) {
    if (inv.status !== "sent" && inv.status !== "overdue") continue;
    owed[inv.client_id] = (owed[inv.client_id] ?? 0) + Number(inv.amount);
  }
  return owed;
}

export interface ClientSummary {
  client: Client;
  owed: number;
}

/** One row per client with the total unpaid amount owed by that client. */
export function clientSummaries(clients: Client[], invoices: Invoice[]): ClientSummary[] {
  const owed = unpaidOwedByClient(invoices);
  return clients.map((client) => ({ client, owed: owed[client.id] ?? 0 }));
}

interface ClientFormValues {
  name: string;
  email: string;
  whatsapp: string;
  avgDelay: string;
  notes: string;
}

type FormErrors = Partial<Record<keyof ClientFormValues, string>>;

const EMPTY_FORM: ClientFormValues = {
  name: "",
  email: "",
  whatsapp: "",
  avgDelay: "0",
  notes: "",
};

function validateForm(values: ClientFormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.name.trim()) {
    errors.name = "Enter the client name.";
  }
  const email = values.email.trim();
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address, such as name@example.com.";
  }
  const whatsapp = values.whatsapp.trim();
  if (whatsapp && !WHATSAPP_PATTERN.test(whatsapp)) {
    errors.whatsapp = "Use digits only, with an optional leading + and country code.";
  }
  const delayText = values.avgDelay.trim();
  const delay = delayText === "" ? 0 : Number(delayText);
  if (!Number.isFinite(delay) || delay < 0) {
    errors.avgDelay = "Enter a number of days, 0 or more.";
  }
  return errors;
}

interface AddClientDialogProps {
  onClose: () => void;
  onSaved: () => void;
  refresh: () => Promise<void>;
}

function AddClientDialog({ onClose, onSaved, refresh }: AddClientDialogProps) {
  const titleId = useId();
  const nameId = useId();
  const emailId = useId();
  const whatsappId = useId();
  const delayId = useId();
  const notesId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState<ClientFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function update(field: keyof ClientFormValues, value: string) {
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
    if (saving) return;

    const found = validateForm(values);
    setErrors(found);
    setSubmitError(null);
    if (Object.keys(found).length > 0) return;

    const delayText = values.avgDelay.trim();
    setSaving(true);
    try {
      await createClientRecord({
        name: values.name.trim(),
        contact_name: null,
        email: values.email.trim() || null,
        whatsapp: values.whatsapp.trim() || null,
        avg_delay_days: delayText === "" ? 0 : Number(delayText),
        notes: values.notes.trim() || null,
      });
      await refresh();
      window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
      onSaved();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not save client.");
    } finally {
      setSaving(false);
    }
  }

  const errorList = Object.values(errors).filter((msg): msg is string => Boolean(msg));
  const hasSummary = errorList.length > 0 || submitError !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h3 id={titleId} className="text-lg font-semibold text-slate-900">
            Add client
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
          >
            Cancel
          </button>
        </div>

        {hasSummary && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {submitError ? <p>{submitError}</p> : <p>Please fix the following:</p>}
            {errorList.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {errorList.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
          <div>
            <label htmlFor={nameId} className="block text-sm font-medium text-slate-700">
              Name <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              ref={nameRef}
              id={nameId}
              type="text"
              required
              value={values.name}
              onChange={(e) => update("name", e.target.value)}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${nameId}-error` : undefined}
              className={INPUT_CLASS}
            />
            {errors.name && (
              <p id={`${nameId}-error`} className="mt-1 text-sm text-red-700">
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={emailId} className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id={emailId}
              type="email"
              value={values.email}
              onChange={(e) => update("email", e.target.value)}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? `${emailId}-error` : undefined}
              className={INPUT_CLASS}
            />
            {errors.email && (
              <p id={`${emailId}-error`} className="mt-1 text-sm text-red-700">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={whatsappId} className="block text-sm font-medium text-slate-700">
              WhatsApp number
            </label>
            <p id={`${whatsappId}-hint`} className="text-xs text-slate-500">
              Digits with country code, for example 919812345678.
            </p>
            <input
              id={whatsappId}
              type="tel"
              inputMode="tel"
              value={values.whatsapp}
              onChange={(e) => update("whatsapp", e.target.value)}
              aria-invalid={errors.whatsapp ? true : undefined}
              aria-describedby={
                errors.whatsapp ? `${whatsappId}-hint ${whatsappId}-error` : `${whatsappId}-hint`
              }
              className={INPUT_CLASS}
            />
            {errors.whatsapp && (
              <p id={`${whatsappId}-error`} className="mt-1 text-sm text-red-700">
                {errors.whatsapp}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={delayId} className="block text-sm font-medium text-slate-700">
              Avg delay days
            </label>
            <input
              id={delayId}
              type="number"
              min={0}
              step="any"
              value={values.avgDelay}
              onChange={(e) => update("avgDelay", e.target.value)}
              aria-invalid={errors.avgDelay ? true : undefined}
              aria-describedby={errors.avgDelay ? `${delayId}-error` : undefined}
              className={INPUT_CLASS}
            />
            {errors.avgDelay && (
              <p id={`${delayId}-error`} className="mt-1 text-sm text-red-700">
                {errors.avgDelay}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={notesId} className="block text-sm font-medium text-slate-700">
              Notes
            </label>
            <textarea
              id={notesId}
              rows={3}
              value={values.notes}
              onChange={(e) => update("notes", e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/50"
            >
              {saving ? "Saving..." : "Save client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ClientsView() {
  const { data, refresh } = useWorkspace();
  const [dialogOpen, setDialogOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const clients = data?.clients ?? [];
  const invoices = data?.invoices ?? [];
  const rows = clientSummaries(clients, invoices);
  const count = clients.length;

  function closeDialog() {
    setDialogOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Clients</h2>
          <p className="text-sm text-slate-600 tabular-nums">
            {count} {count === 1 ? "client" : "clients"} in your workspace
          </p>
        </div>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setDialogOpen(true)}
          className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/50"
        >
          + Add Client
        </button>
      </div>

      {count === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          No clients yet. Add your first client to start tracking receivables.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ client, owed }) => (
            <li key={client.id} className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="text-lg font-semibold text-slate-900">{client.name}</h3>
              <p className="mt-2 text-sm text-slate-700">
                <span className="text-slate-500">Email: </span>
                {client.email ?? "Not set"}
              </p>
              <p className="mt-1 text-sm text-slate-700 tabular-nums">
                <span className="text-slate-500">WhatsApp: </span>
                {client.whatsapp ?? "Not set"}
              </p>
              <p className="mt-1 text-sm text-slate-700 tabular-nums">
                Avg delay: {client.avg_delay_days} days
              </p>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-500">Total unpaid owed</p>
                {owed > 0 ? (
                  <p className="text-xl font-semibold text-amber-700 tabular-nums">
                    {inrFormatter.format(owed)}
                  </p>
                ) : (
                  <p className="text-xl font-semibold text-emerald-700">All clear</p>
                )}
              </div>

              <p className="mt-4 text-sm text-slate-600">
                {client.notes && client.notes.trim() ? client.notes : "No notes"}
              </p>
            </li>
          ))}
        </ul>
      )}

      {dialogOpen && (
        <AddClientDialog
          onClose={closeDialog}
          onSaved={closeDialog}
          refresh={refresh}
        />
      )}
    </section>
  );
}
