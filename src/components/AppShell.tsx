import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { todayIso, useWorkspace } from "../hooks/useWorkspace";
import { seedDemoWorkspace } from "../services/db";
import { formatINR } from "../engine/reminderTemplates";
import LoginScreen from "./LoginScreen";
import QuickAddBar from "./QuickAddBar";

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

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2";

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

function StatCard({ label, value, tone }: { label: string; value: string; tone: "neutral" | "rose" | "amber" }) {
  const toneClass =
    tone === "rose" ? "text-rose-700" : tone === "amber" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function Workspace() {
  const { signOut } = useAuth();
  const { data, loading, error, refresh, alerts, forecast } = useWorkspace();
  const [tab, setTab] = useState<TabId>("overview");
  const [resetting, setResetting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const today = todayIso();
  const studioName = data?.settings?.studio_name ?? "RunwayDesk";
  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];

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

  const lowest = forecast?.lowestBalance ?? 0;
  const shortfall = forecast?.cashShortfall ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-slate-200 bg-white md:min-h-screen md:border-b-0 md:border-r">
        <div className="px-5 py-5">
          <p className="text-sm font-semibold tracking-tight">RunwayDesk</p>
        </div>
        <nav aria-label="Sections" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0">
          {TABS.map((item) => {
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 shrink-0 items-center gap-3 rounded-md px-3 text-sm font-medium ${
                  active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                } ${FOCUS_RING}`}
              >
                <Icon path={item.iconPath} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Studio</p>
              <h1 className="truncate text-lg font-semibold tracking-tight">{studioName}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetDemo}
                disabled={resetting}
                className={`flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
              >
                <Icon path="M4 4v6h6M20 20v-6h-6M5.6 15A8 8 0 0 0 19 12M18.4 9A8 8 0 0 0 5 12" className="h-4 w-4" />
                {resetting ? "Resetting..." : "Reset Demo Data"}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className={`flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${FOCUS_RING}`}
              >
                <Icon path="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
          <div className="border-t border-slate-100 px-6 py-3">
            <QuickAddBar today={today} onSaved={refresh} disabled={loading && !data} />
          </div>
        </header>

        <main className="flex-1 space-y-6 px-6 py-6">
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
          {loading && !data && <p className="text-sm text-slate-500">Loading workspace...</p>}

          <section aria-labelledby="tab-heading" className="space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <Icon path={activeTab.iconPath} className="h-5 w-5 text-slate-500" />
              <h2 id="tab-heading" className="text-lg font-semibold tracking-tight">
                {activeTab.label}
              </h2>
            </div>
            <p className="text-sm text-slate-600">{activeTab.description}</p>

            {tab === "overview" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard label="Lowest projected cash" value={formatINR(lowest)} tone="neutral" />
                <StatCard
                  label="Cash shortfall"
                  value={formatINR(shortfall)}
                  tone={shortfall > 0 ? "rose" : "neutral"}
                />
                <StatCard label="Open alerts" value={String(alerts.length)} tone={alerts.length > 0 ? "amber" : "neutral"} />
              </div>
            )}

            <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
              {activeTab.label} panel placeholder
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 font-sans text-sm text-slate-500">
        Loading...
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return <Workspace />;
}
