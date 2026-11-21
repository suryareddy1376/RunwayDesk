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
  "mt-1 block h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/30";

const TEXTAREA_CLASS =
  "mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/30";

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

  function dismissSummary() {
    setErrors({});
    setSubmitError(null);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-line bg-surface p-6"
      >
        <h3 id={titleId} className="text-xl font-semibold text-ink">
          Add client
        </h3>

        {hasSummary && (
          <div
            role="alert"
            className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-rose/30 bg-rose/5 px-3 py-2 text-sm text-rose"
          >
            <div>
              {submitError ? <p>{submitError}</p> : <p>Please fix the following:</p>}
              {errorList.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {errorList.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={dismissSummary}
              aria-label="Dismiss message"
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-rose hover:bg-rose/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/30"
            >
              Dismiss
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
          <div>
            <label htmlFor={nameId} className="block text-xs font-medium text-ink-secondary">
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
              <p id={`${nameId}-error`} className="mt-1 text-sm text-rose">
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={emailId} className="block text-xs font-medium text-ink-secondary">
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
              <p id={`${emailId}-error`} className="mt-1 text-sm text-rose">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={whatsappId} className="block text-xs font-medium text-ink-secondary">
              WhatsApp number
            </label>
            <p id={`${whatsappId}-hint`} className="text-xs text-ink-muted">
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
              <p id={`${whatsappId}-error`} className="mt-1 text-sm text-rose">
                {errors.whatsapp}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={delayId} className="block text-xs font-medium text-ink-secondary">
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
              <p id={`${delayId}-error`} className="mt-1 text-sm text-rose">
                {errors.avgDelay}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={notesId} className="block text-xs font-medium text-ink-secondary">
              Notes
            </label>
            <textarea
              id={notesId}
              rows={3}
              value={values.notes}
              onChange={(e) => update("notes", e.target.value)}
              className={TEXTAREA_CLASS}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-subtle active:scale-[0.98] transition-transform duration-150 ease-emphasis focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/30"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue px-3 py-2 text-sm font-medium text-white hover:bg-blue/90 active:scale-[0.98] transition-transform duration-150 ease-emphasis disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/30"
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
          <h2 className="text-xl font-semibold text-ink">Clients</h2>
          <p className="text-sm text-ink-secondary tabular-nums">
            {count} {count === 1 ? "client" : "clients"} in your workspace
          </p>
        </div>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setDialogOpen(true)}
          className="rounded-lg bg-blue px-3 py-2 text-sm font-medium text-white hover:bg-blue/90 active:scale-[0.98] transition-transform duration-150 ease-emphasis focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/30"
        >
          + Add Client
        </button>
      </div>

      {count === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-line bg-surface p-8 text-center">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-ink">No clients yet.</h3>
            <p className="text-sm text-ink-secondary">Add your first client to start tracking receivables.</p>
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="rounded-lg bg-blue px-3 py-2 text-sm font-medium text-white hover:bg-blue/90 active:scale-[0.98] transition-transform duration-150 ease-emphasis focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/30"
          >
            + Add Client
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ client, owed }) => (
            <li key={client.id} className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-surface p-5">
              <h3 className="truncate text-lg font-semibold text-ink">{client.name}</h3>
              <div className="space-y-1">
                <p className="text-sm text-ink-secondary">
                  <span className="text-ink-muted">Email: </span>
                  {client.email ? (
                    <a href={`mailto:${client.email}`} className="break-all text-sm text-blue hover:underline">
                      {client.email}
                    </a>
                  ) : (
                    "Not set"
                  )}
                </p>
                <p className="text-sm text-ink-secondary tabular-nums">
                  <span className="text-ink-muted">WhatsApp: </span>
                  {client.whatsapp ? (
                    <a
                      href={`https://wa.me/${client.whatsapp.replace(/\D/g, "")}`}
                      className="break-all text-sm text-blue hover:underline"
                    >
                      {client.whatsapp}
                    </a>
                  ) : (
                    "Not set"
                  )}
                </p>
                <p className="inline-flex w-fit items-center rounded-full border border-line bg-subtle px-2 py-0.5 text-xs font-medium text-ink-secondary tabular-nums">
                  Avg delay: {client.avg_delay_days} days
                </p>
              </div>

              <div className="border-t border-line pt-4">
                <p className="text-xs uppercase text-ink-muted">Total unpaid owed</p>
                {owed > 0 ? (
                  <p className="text-lg font-semibold text-ink tabular-nums">{inrFormatter.format(owed)}</p>
                ) : (
                  <p className="text-lg font-semibold text-ink">All clear</p>
                )}
              </div>

              <p className="line-clamp-3 text-sm text-ink-secondary">
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
