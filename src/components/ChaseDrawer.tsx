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

const TONE_DOT: Record<FollowupTone, string> = {
  friendly: "bg-emerald",
  firm: "bg-amber",
  final: "bg-rose",
};

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue";

const BUTTON_BASE = `inline-flex items-center justify-center gap-2 px-4 transition-transform duration-200 ease-emphasis active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

const BUTTON_SECONDARY = `${BUTTON_BASE} min-h-11 sm:h-9 rounded-lg border border-line bg-surface text-sm font-medium text-ink hover:bg-subtle`;

const BUTTON_PRIMARY = `${BUTTON_BASE} min-h-11 sm:col-span-2 sm:h-9 rounded-lg bg-blue text-sm font-medium text-white hover:bg-blue/90`;

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
    overdueClass = "border-rose/30 bg-rose/5 text-rose";
  } else if (daysOverdue === 0) {
    overdueLabel = "Due today";
    overdueClass = "border-amber/30 bg-amber/5 text-amber";
  } else {
    overdueLabel = `Due in ${plural(Math.abs(daysOverdue), "day")}`;
    overdueClass =
      Math.abs(daysOverdue) <= 7
        ? "border-amber/30 bg-amber/5 text-amber"
        : "border-line bg-subtle text-ink-secondary";
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
        className={`fixed inset-0 bg-ink/40 transition-opacity duration-200 motion-reduce:transition-none ${
          entered ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`fixed inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] transition-transform duration-200 ease-emphasis motion-reduce:transition-none sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-full sm:max-w-[460px] sm:rounded-none sm:border-t-0 sm:border-l sm:border-line ${
          entered ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-x-full sm:translate-y-0"
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="title-md min-w-0 break-words text-ink">
              {clientName}
            </h2>
            <p className="body-sm min-w-0 break-words text-ink-secondary">
              Invoice <span className="num-inr">{invoice.invoice_number}</span>
              {invoice.title ? ` - ${invoice.title}` : ""}
            </p>
            <p className="num-inr mt-1 min-w-0 break-words text-ink">{formatINR(invoice.amount)}</p>
            <span
              className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${overdueClass}`}
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
          <div role="tablist" aria-label="Reminder tone" className="flex gap-1 rounded-lg bg-subtle p-1">
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
                  className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-transform duration-200 ease-emphasis active:scale-[0.98] sm:text-sm ${FOCUS_RING} ${
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
              className="min-h-[160px] w-full resize-y rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed text-ink focus:border-blue sm:min-h-[220px]"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleCopy}
              className={BUTTON_SECONDARY}
            >
              Copy Message
            </button>
            <button
              type="button"
              onClick={handleWhatsApp}
              disabled={!hasWhatsapp}
              className={BUTTON_SECONDARY}
            >
              Open WhatsApp
            </button>
            <button
              type="button"
              onClick={handleEmail}
              disabled={!hasEmail}
              className={BUTTON_SECONDARY}
            >
              Open Email
            </button>
            <button
              type="button"
              onClick={handleLog}
              disabled={logging}
              aria-busy={logging}
              className={BUTTON_PRIMARY}
            >
              {logging ? "Logging follow-up..." : "Log Follow-Up"}
            </button>
          </div>

          <p className="body-sm text-ink-muted">
            Logs via {channel === "whatsapp" ? "WhatsApp" : "Email"}, the channel you used last.
          </p>

          <div aria-live="polite" className="min-h-5 body-sm">
            {logged && (
              <p role="status" className="text-emerald">
                Follow-up logged.
              </p>
            )}
            {copyState === "copied" && <span className="text-emerald">Copied</span>}
            {copyState === "failed" && (
              <span className="text-rose">Clipboard is not available in this browser.</span>
            )}
          </div>

          {logError && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-lg border border-rose/30 bg-rose/5 px-3 py-2 text-sm text-rose"
            >
              <span>{logError}</span>
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

        <section
          aria-labelledby={`${titleId}-history`}
          className="border-t border-line px-4 py-4 sm:px-5"
        >
          <h3 id={`${titleId}-history`} className="title-sm text-ink">
            Past follow-ups
          </h3>
          {logsForInvoice.length === 0 ? (
            <p className="mt-2 body-sm text-ink-muted">No follow-ups logged yet.</p>
          ) : (
            <ul className="mt-2 max-h-40 divide-y divide-line overflow-y-auto sm:max-h-48">
              {logsForInvoice.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center justify-between gap-1 py-2">
                  <span className="body-sm min-w-0 break-words text-ink">
                    {log.channel === "whatsapp" ? "WhatsApp" : "Email"} · {TONE_LABELS[log.tone]}
                  </span>
                  <span className="num-inr caption min-w-0 break-words text-ink-muted">
                    {dateTimeFormat.format(new Date(log.sent_at))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
