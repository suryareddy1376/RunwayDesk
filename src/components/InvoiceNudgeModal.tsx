import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import {
  buildNudgeMessage,
  logInvoiceNudge,
  type NudgeTone,
} from "../services/invoiceNudgeService";
import type { Invoice } from "../types/database";

export interface InvoiceNudgeModalProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  clientName: string;
  daysOverdue: number;
  /** Called after a nudge is logged successfully, before the modal closes. */
  onLogged?: () => void;
}

const TONE_ORDER: NudgeTone[] = ["Friendly", "Firm", "Final"];
const TONE_LABELS: Record<NudgeTone, string> = {
  Friendly: "Friendly",
  Firm: "Firm",
  Final: "Final",
};
const TONE_DOT: Record<NudgeTone, string> = {
  Friendly: "bg-emerald",
  Firm: "bg-amber",
  Final: "bg-rose",
};
const COPY_FEEDBACK_MS = 2000;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue";

const BUTTON_BASE = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-transform duration-200 ease-emphasis active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BUTTON_SECONDARY = `${BUTTON_BASE} border border-line bg-surface text-ink hover:bg-subtle`;
const BUTTON_PRIMARY = `${BUTTON_BASE} bg-blue text-white hover:bg-blue/90`;

const TAB_BASE = `inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-transform duration-200 ease-emphasis active:scale-[0.98] sm:text-sm ${FOCUS_RING}`;

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function InvoiceNudgeModal({
  open,
  onClose,
  invoice,
  clientName,
  daysOverdue,
  onLogged,
}: InvoiceNudgeModalProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const copyTimerRef = useRef<number | null>(null);

  const [tone, setTone] = useState<NudgeTone>("Friendly");
  const [message, setMessage] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const invoiceId = invoice?.id ?? null;

  // Reset per-open state, and regenerate the message, when the modal opens
  // or a different invoice is shown. Edits persist until tone or reopen.
  useEffect(() => {
    if (!open || !invoice) return;
    setTone("Friendly");
    setMessage(
      buildNudgeMessage("Friendly", {
        clientName,
        invoiceNumber: invoice.invoice_number,
        amount: invoice.amount,
        dueDate: invoice.due_date,
        daysOverdue,
      })
    );
    setCopyState("idle");
    setLogError(null);
    closeRef.current?.focus();
    // Only the open state and the invoice identity reset the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

  // Escape closes the modal while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Clear any pending copy-feedback timer on unmount.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  if (!open || !invoice) return null;

  const amountText = inrFormatter.format(invoice.amount);

  let overdueLabel: string;
  let overdueClass: string;
  if (daysOverdue > 0) {
    overdueLabel = `${plural(daysOverdue, "day")} overdue`;
    overdueClass = "border-rose/30 bg-rose/5 text-rose";
  } else if (daysOverdue === 0) {
    overdueLabel = "Due today";
    overdueClass = "border-amber/30 bg-amber/5 text-amber";
  } else {
    overdueLabel = `Due in ${plural(Math.abs(daysOverdue), "day")}`;
    overdueClass = "border-line bg-subtle text-ink-secondary";
  }

  const handleToneChange = (next: NudgeTone) => {
    setTone(next);
    setMessage(
      buildNudgeMessage(next, {
        clientName,
        invoiceNumber: invoice.invoice_number,
        amount: invoice.amount,
        dueDate: invoice.due_date,
        daysOverdue,
      })
    );
    setCopyState("idle");
    setLogError(null);
  };

  const handleCopy = async () => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard || typeof clipboard.writeText !== "function") {
      setCopyState("failed");
      return;
    }
    try {
      await clipboard.writeText(message);
      setCopyState("copied");
      copyTimerRef.current = window.setTimeout(() => {
        setCopyState("idle");
        copyTimerRef.current = null;
      }, COPY_FEEDBACK_MS);
    } catch {
      setCopyState("failed");
    }
  };

  const handleLog = async () => {
    if (logging) return;
    setLogging(true);
    setLogError(null);
    try {
      await logInvoiceNudge({
        invoiceRef: invoice.invoice_number,
        clientLabel: clientName || null,
        amountInr: invoice.amount,
        tone,
        message,
      });
      onLogged?.();
      onClose();
    } catch (err) {
      setLogError(err instanceof Error ? err.message : "Could not log nudge.");
    } finally {
      setLogging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 bg-ink/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 flex max-h-[92vh] w-full max-w-full flex-col rounded-t-xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:max-w-[460px] sm:rounded-none sm:border-t-0 sm:border-l sm:border-line"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0 max-w-full">
            <h2 id={titleId} className="min-w-0 break-words font-sans text-lg font-semibold text-ink">
              {clientName}
            </h2>
            <p className="min-w-0 break-words text-sm text-ink-secondary">
              Invoice <span className="font-mono tabular-nums">{invoice.invoice_number}</span>
              {invoice.title ? ` - ${invoice.title}` : ""}
            </p>
            <p className="mt-1 min-w-0 break-words font-mono text-sm tabular-nums text-ink">
              {amountText}
            </p>
            <p className="mt-0.5 font-mono text-xs tabular-nums text-ink-muted">
              Due <span>{invoice.due_date}</span>
            </p>
            <span
              className={`mt-1 inline-flex max-w-full break-words rounded-full border px-2 py-0.5 text-xs font-medium ${overdueClass}`}
            >
              {overdueLabel}
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg p-2 text-ink-secondary hover:bg-subtle active:scale-[0.98] transition-transform duration-200 ease-emphasis ${FOCUS_RING}`}
          >
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="px-4 pt-4 sm:px-5">
          <div role="tablist" aria-label="Nudge tone" className="flex gap-1 rounded-lg bg-subtle p-1">
            {TONE_ORDER.map((value) => {
              const selected = tone === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`${titleId}-tab-${value}`}
                  aria-selected={selected}
                  onClick={() => handleToneChange(value)}
                  className={`${TAB_BASE} ${
                    selected
                      ? "border-line bg-surface text-ink"
                      : "border-transparent text-ink-secondary hover:text-ink"
                  }`}
                >
                  <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[value]}`} />
                  <span className="truncate">{TONE_LABELS[value]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="w-full max-w-full min-w-0 break-words">
            <label htmlFor={`${titleId}-message`} className="sr-only">
              Nudge message
            </label>
            <textarea
              id={`${titleId}-message`}
              aria-label="Nudge message"
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                setCopyState("idle");
              }}
              className="block min-h-[160px] w-full max-w-full resize-y rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed text-ink focus:border-blue focus:outline-none sm:min-h-[220px]"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" onClick={handleCopy} className={BUTTON_SECONDARY}>
              {copyState === "copied" ? (
                <Check aria-hidden="true" className="h-4 w-4 shrink-0" />
              ) : (
                <Copy aria-hidden="true" className="h-4 w-4 shrink-0" />
              )}
              {copyState === "copied" ? "Copied" : "Copy Message"}
            </button>
            <button
              type="button"
              onClick={handleLog}
              disabled={logging}
              aria-busy={logging}
              className={BUTTON_PRIMARY}
            >
              {logging ? "Logging..." : "Log Nudge"}
            </button>
          </div>

          <div aria-live="polite" className="min-h-5 text-sm">
            {copyState === "failed" && (
              <span className="text-rose">Clipboard is not available in this browser.</span>
            )}
          </div>

          {logError && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-lg border border-rose/30 bg-rose/5 px-3 py-2 text-sm text-rose"
            >
              <span className="min-w-0 break-words">{logError}</span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setLogError(null)}
                className={`shrink-0 rounded-md p-1 hover:bg-rose/10 ${FOCUS_RING}`}
              >
                <svg
                  aria-hidden="true"
                  focusable="false"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
