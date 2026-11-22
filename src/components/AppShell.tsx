import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { todayIso, useWorkspace } from "../hooks/useWorkspace";
import { seedDemoWorkspace } from "../services/db";
import { daysOverdue } from "../engine/aging";
import type { FollowupTone } from "../types/database";
import LoginScreen from "./LoginScreen";
import QuickAddBar from "./QuickAddBar";
import { BillsView } from "./BillsView";
import { ChaseDrawer } from "./ChaseDrawer";
import { ClientsView } from "./ClientsView";
import { OverviewView } from "./OverviewView";
import { ReceivablesView } from "./ReceivablesView";

type TabId = "overview" | "receivables" | "bills" | "clients";

interface TabDef {
  id: TabId;
  label: string;
  iconPath: string;
  description: string;
}

const TABS: TabDef[] = [
  {
    id: "overview",
    label: "Overview",
    iconPath: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    description: "Cash position, forecast and open alerts for the next 30 days.",
  },
  {
    id: "receivables",
    label: "Receivables",
    iconPath: "M4 6h16v12H4zM4 10h16M8 14h3",
    description: "Invoices awaiting payment, with follow-up status.",
  },
  {
    id: "bills",
    label: "Bills",
    iconPath: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
    description: "Upcoming and recurring payables.",
  },
  {
    id: "clients",
    label: "Clients",
    iconPath: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0",
    description: "Client contacts and average payment delay.",
  },
];

const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2";
const SIDEBAR_ID = "app-sidebar";

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Something went wrong. Try again.";
}

function Icon({ path, className = "h-5 w-5" }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}


export function Workspace() {
  const { signOut } = useAuth();
  const { data, loading, error, refresh } = useWorkspace();
  const [tab, setTab] = useState<TabId>("overview");
  const [resetting, setResetting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [chase, setChase] = useState<{ invoiceId: string; tone: FollowupTone } | null>(null);
  const [simulationRequest] = useState(0);
  const [isNavOpen, setIsNavOpen] = useState(false);

  const today = todayIso();
  const studioName = data?.settings?.studio_name ?? "RunwayDesk";
  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];

  function openChase(target: { invoiceId: string; tone: FollowupTone }) {
    setChase(target);
  }

  const chaseInvoice = chase ? (data?.invoices.find((i) => i.id === chase.invoiceId) ?? null) : null;
  const chaseClient = chaseInvoice ? (data?.clients.find((c) => c.id === chaseInvoice.client_id) ?? null) : null;
  const chaseLogs = chase
    ? (data?.followupLogs ?? [])
        .filter((l) => l.invoice_id === chase.invoiceId)
        .sort((a, b) => b.sent_at.localeCompare(a.sent_at))
    : [];
  const chaseDaysOverdue = chaseInvoice ? daysOverdue(chaseInvoice.due_date, today) : 0;

  useEffect(() => {
    if (!isNavOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsNavOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isNavOpen]);

  useEffect(() => {
    if (!isNavOpen || window.matchMedia("(min-width: 1024px)").matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isNavOpen]);

  async function resetDemo() {
    const confirmed = window.confirm("Reset demo data? The current demo records will be replaced.");
    if (!confirmed) return;
    setResetting(true);
    setActionError(null);
    try {
      await seedDemoWorkspace();
      await refresh();
    } catch (err) {
      setActionError(messageOf(err));
    } finally {
      setResetting(false);
    }
  }

  async function handleSignOut() {
    setActionError(null);
    try {
      await signOut();
    } catch (err) {
      setActionError(messageOf(err));
    }
  }

  return (
    <div className="flex min-h-screen bg-canvas pb-[env(safe-area-inset-bottom)] font-sans text-ink">
      <aside
        id={SIDEBAR_ID}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(84vw,280px)] flex-col overflow-y-auto border-r border-line bg-surface transition-transform duration-200 ease-emphasis motion-reduce:transition-none lg:static lg:w-56 lg:translate-x-0 lg:overflow-visible ${
          isNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 py-3 pl-5 pr-3 lg:px-5 lg:py-5">
          <img src="/logo.png" alt="RunwayDesk" className="h-8 w-auto object-contain" />
          <button
            type="button"
            onClick={() => setIsNavOpen(false)}
            aria-label="Close menu"
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-secondary transition-transform duration-200 ease-emphasis hover:bg-subtle hover:text-ink active:scale-[0.98] lg:hidden ${FOCUS_RING}`}
          >
            <Icon path="M6 6l12 12M18 6L6 18" />
          </button>
        </div>
        <nav aria-label="Sections" className="flex flex-col gap-1 px-3 pb-3 lg:pb-0">
          {TABS.map((item) => {
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setIsNavOpen(false);
                }}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ease-emphasis hover:bg-subtle hover:text-ink active:scale-[0.98] ${
                  active ? "bg-subtle font-semibold text-ink" : "font-medium text-ink-secondary"
                } ${FOCUS_RING}`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-blue"
                  />
                )}
                <Icon path={item.iconPath} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {isNavOpen && (
        <div aria-hidden="true" onClick={() => setIsNavOpen(false)} className="fixed inset-0 z-40 bg-ink/40 lg:hidden" />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b border-line bg-surface px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setIsNavOpen(true)}
              aria-label="Open menu"
              aria-expanded={isNavOpen}
              aria-controls={SIDEBAR_ID}
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-secondary transition-transform duration-200 ease-emphasis hover:bg-subtle hover:text-ink active:scale-[0.98] lg:hidden ${FOCUS_RING}`}
            >
              <Icon path="M4 6h16M4 12h16M4 18h16" />
            </button>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald" />
                Studio
              </p>
              <h1 className="title-md truncate">{studioName}</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={resetDemo}
              disabled={resetting}
              className={`flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-transform duration-150 ease-emphasis hover:bg-subtle active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
            >
              <Icon path="M4 4v6h6M20 20v-6h-6M5.6 15A8 8 0 0 0 19 12M18.4 9A8 8 0 0 0 5 12" className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only">{resetting ? "Resetting..." : "Reset Demo Data"}</span>
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-secondary transition-transform duration-150 ease-emphasis hover:bg-subtle hover:text-ink active:scale-[0.98] ${FOCUS_RING}`}
            >
              <Icon path="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </header>
        <div className="border-b border-line bg-surface px-4 py-3 lg:px-6">
          <QuickAddBar today={today} onSaved={refresh} disabled={loading && !data} />
        </div>

        <main className="min-h-screen min-w-0 flex-1 space-y-6 bg-canvas px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}
          {actionError && (
            <p role="alert" className="text-sm text-rose-700">
              {actionError}
            </p>
          )}
          {loading && !data && <p className="text-sm text-ink-muted">Loading workspace...</p>}

          <section aria-labelledby="tab-heading" className="space-y-4">
            <div className="flex items-center gap-2 text-ink">
              <Icon path={activeTab.iconPath} className="h-5 w-5 text-ink-muted" />
              <h2 id="tab-heading" className="text-lg font-semibold tracking-tight">
                {activeTab.label}
              </h2>
            </div>
            <p className="text-sm text-ink-secondary">{activeTab.description}</p>

            <div className="min-w-0 overflow-x-auto">
              {tab === "overview" && <OverviewView openChase={openChase} simulationRequest={simulationRequest} />}
              {tab === "receivables" && <ReceivablesView openChase={openChase} />}
              {tab === "bills" && <BillsView />}
              {tab === "clients" && <ClientsView />}
            </div>
          </section>
        </main>

      </div>

      <ChaseDrawer
        key={chase ? chase.invoiceId + chase.tone : "closed"}
        open={chase !== null}
        onClose={() => setChase(null)}
        invoice={chaseInvoice}
        client={chaseClient}
        daysOverdue={chaseDaysOverdue}
        followupLogs={chaseLogs}
        defaultTone={chase?.tone}
        studioName={studioName}
      />
    </div>
  );
}

export default function AppShell() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas font-sans text-sm text-ink-muted">
        Loading...
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return <Workspace />;
}
