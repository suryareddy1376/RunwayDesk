import { useEffect, useId, useMemo, useRef, useState } from "react";
import { logFollowUp } from "../services/db";
import { WORKSPACE_CHANGED_EVENT } from "../hooks/useWorkspace";
import {
  TONE_LABELS,
  buildMailtoUrl,
  buildReminder,
  buildWhatsAppUrl,
  formatINR,
} from "../engine/reminderTemplates";
import type {
  Client,
  FollowupChannel,
  FollowupLog,
  FollowupTone,
  Invoice,
} from "../types/database";

export interface ChaseDrawerProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  client: Client | null;
  daysOverdue: number;
  followupLogs: FollowupLog[];
  defaultTone?: FollowupTone;
  /** Studio name used to sign the reminder. Defaults to "Your studio". */
  studioName?: string;
  /** Called after a follow-up is logged successfully. */
  onLogged?: () => void;
}

const TONE_ORDER: FollowupTone[] = ["friendly", "firm", "final"];
const COPY_FEEDBACK_MS = 2000;

const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const dateTimeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function ChaseDrawer({
  open,
  onClose,
  invoice,
  client,
  daysOverdue,
  followupLogs,
  defaultTone = "friendly",
  studioName = "Your studio",
  onLogged,
}: ChaseDrawerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const copyTimerRef = useRef<number | null>(null);

  const [tone, setTone] = useState<FollowupTone>(defaultTone);
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<FollowupChannel>("whatsapp");
  const [entered, setEntered] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);

  const invoiceId = invoice?.id ?? null;
  const invoiceNumber = invoice?.invoice_number ?? "";
  const invoiceAmount = invoice?.amount ?? 0;
  const contactName = client?.contact_name || client?.name || "there";

  // Reset per-open state each time the drawer opens.
  useEffect(() => {
    if (open) {
      setTone(defaultTone);
      setLogError(null);
      setLogged(false);
      setCopyState("idle");
    }
    // defaultTone is intentionally read only when the drawer opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Slide-in: start off-screen, then transition to the on-screen position.
  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    setEntered(false);
    const frame = window.requestAnimationFrame(() => setEntered(true));
    closeRef.current?.focus();
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  // Escape closes the drawer while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Rebuild the editable message whenever the tone or the invoice context changes.
  useEffect(() => {
    if (!open || !invoiceId) return;
    setMessage(
      buildReminder(tone, {
        contactName,
        studioName,
        invoiceNumber,
        amount: invoiceAmount,
        daysOverdue,
      })
    );
    setCopyState("idle");
    setLogged(false);
  }, [open, invoiceId, invoiceNumber, invoiceAmount, contactName, studioName, daysOverdue, tone]);

  // Clear any pending copy-feedback timer on unmount.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const logsForInvoice = useMemo(
    () =>
      followupLogs
        .filter((log) => invoiceId !== null && log.invoice_id === invoiceId)
        .sort((a, b) => b.sent_at.localeCompare(a.sent_at)),
    [followupLogs, invoiceId]
  );

  if (!open || !invoice) return null;

  const hasWhatsapp = (client?.whatsapp ?? "").replace(/\D/g, "").length > 0;
  const hasEmail = (client?.email ?? "").trim().length > 0;
  const clientName = client?.name ?? "Unknown client";
  const subject = `Invoice ${invoice.invoice_number} reminder`;

  let overdueLabel: string;
  let overdueClass: string;
  if (daysOverdue > 0) {
    overdueLabel = `${plural(daysOverdue, "day")} overdue`;
    overdueClass = "text-rose-600";
  } else if (daysOverdue === 0) {
    overdueLabel = "Due today";
    overdueClass = "text-amber-600";
  } else {
    overdueLabel = `Due in ${plural(Math.abs(daysOverdue), "day")}`;
    overdueClass = Math.abs(daysOverdue) <= 7 ? "text-amber-600" : "text-slate-600";
  }

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

  const handleWhatsApp = () => {
    if (!client || !hasWhatsapp) return;
    setChannel("whatsapp");
    window.open(buildWhatsAppUrl(client.whatsapp ?? "", message), "_blank", "noopener,noreferrer");
  };

  const handleEmail = () => {
    if (!client || !hasEmail) return;
    setChannel("email");
    window.location.href = buildMailtoUrl(client.email ?? "", subject, message);
  };

  const handleLog = async () => {
    if (!invoice) return;
    setLogging(true);
    setLogError(null);
    setLogged(false);
    try {
      await logFollowUp(invoice.id, channel, tone, message);
      setLogged(true);
      window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
      onLogged?.();
    } catch (err) {
      setLogError(err instanceof Error ? err.message : "Could not log follow-up.");
    } finally {
      setLogging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 bg-slate-900/40 transition-opacity duration-200 motion-reduce:transition-none ${
          entered ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`fixed inset-y-0 right-0 flex w-full max-w-md transform flex-col bg-white shadow-xl transition-transform duration-200 motion-reduce:transition-none ${
          entered ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-lg font-semibold text-slate-900">
              {clientName}
            </h2>
            <p className="text-sm text-slate-600">
              Invoice {invoice.invoice_number}
              {invoice.title ? ` - ${invoice.title}` : ""}
            </p>
            <p className="mt-1 text-base font-semibold tabular-nums text-slate-900">
              {formatINR(invoice.amount)}
            </p>
            <p className={`text-sm font-medium ${overdueClass}`}>{overdueLabel}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close chase drawer"
            onClick={onClose}
            className={`${BUTTON_BASE} h-11 w-11 shrink-0 px-0 text-slate-600 hover:bg-slate-100`}
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

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div role="tablist" aria-label="Reminder tone" className="grid grid-cols-3 gap-2">
            {TONE_ORDER.map((value) => {
              const selected = tone === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`${titleId}-tab-${value}`}
                  aria-selected={selected}
                  onClick={() => setTone(value)}
                  className={`${BUTTON_BASE} px-2 ${
                    selected
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {TONE_LABELS[value]}
                </button>
              );
            })}
          </div>

          <div>
            <label htmlFor={`${titleId}-message`} className="sr-only">
              Reminder message
            </label>
            <textarea
              id={`${titleId}-message`}
              aria-label="Reminder message"
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                setCopyState("idle");
              }}
              rows={10}
              className="w-full rounded-md border border-slate-300 p-3 text-sm leading-relaxed text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={handleCopy}
              className={`${BUTTON_BASE} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
            >
              Copy Message
            </button>
            <button
              type="button"
              onClick={handleWhatsApp}
              disabled={!hasWhatsapp}
              className={`${BUTTON_BASE} bg-slate-900 text-white hover:bg-slate-800`}
            >
              Open WhatsApp
            </button>
            <button
              type="button"
              onClick={handleEmail}
              disabled={!hasEmail}
              className={`${BUTTON_BASE} bg-slate-900 text-white hover:bg-slate-800`}
            >
              Open Email
            </button>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleLog}
              disabled={logging}
              aria-busy={logging}
              className={`${BUTTON_BASE} w-full bg-slate-900 text-white hover:bg-slate-800`}
            >
              {logging ? "Logging follow-up..." : "Log Follow-Up"}
            </button>
            <p className="text-xs text-slate-500">
              Logs via {channel === "whatsapp" ? "WhatsApp" : "Email"}, the channel you used last.
            </p>
            {logged && (
              <p role="status" className="text-sm font-medium text-emerald-600">
                Follow-up logged.
              </p>
            )}
            {logError && (
              <p role="alert" className="text-sm font-medium text-rose-600">
                {logError}
              </p>
            )}
          </div>

          <div aria-live="polite" className="min-h-5 text-sm">
            {copyState === "copied" && (
              <span className="font-medium text-emerald-600">Copied</span>
            )}
            {copyState === "failed" && (
              <span className="font-medium text-rose-600">
                Clipboard is not available in this browser.
              </span>
            )}
          </div>

          <section aria-labelledby={`${titleId}-history`}>
            <h3 id={`${titleId}-history`} className="text-sm font-semibold text-slate-900">
              Past follow-ups
            </h3>
            {logsForInvoice.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No follow-ups logged yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-200">
                {logsForInvoice.map((log) => (
                  <li key={log.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="tabular-nums text-slate-700">
                      {dateTimeFormat.format(new Date(log.sent_at))}
                    </span>
                    <span className="text-slate-600">
                      {log.channel === "whatsapp" ? "WhatsApp" : "Email"} · {TONE_LABELS[log.tone]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
