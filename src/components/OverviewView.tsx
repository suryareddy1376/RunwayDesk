import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { todayIso, useWorkspace } from '../hooks/useWorkspace';
import { forecast } from '../engine/forecast';
import type { HorizonDays } from '../engine/forecast';
import type { WorkspaceData } from '../services/db';
import type { FollowupTone } from '../types/database';

type Settings = NonNullable<WorkspaceData['settings']>;
type InvoiceRow = WorkspaceData['invoices'][number];
type ForecastOptions = Parameters<typeof forecast>[1];

export type Preset = 'none' | 'key-client' | 'bad-day';

const KEY_CLIENT_INVOICE = 'INV-106';
const COLLECT_INVOICE = 'INV-104';
const HORIZONS: HorizonDays[] = [30, 60, 90];
const PRESETS: { value: Preset; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'key-client', label: 'Key Client +15d Late' },
  { value: 'bad-day', label: 'Bad Day Mode' },
];

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const inr = (n: number): string => INR.format(n);

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2';
const buttonBase =
  'button-sm inline-flex items-center justify-center rounded-lg border px-3 py-1.5 active:scale-[0.98] transition-transform duration-150 ease-emphasis';
const buttonClass = `${buttonBase} border-line bg-surface text-ink hover:bg-subtle ${focusRing}`;
const activeButtonClass = `${buttonBase} border-line-strong bg-subtle text-ink ${focusRing}`;
const inputClass = `h-9 rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-blue focus:outline-none`;
const cardClass = 'rounded-xl border border-line bg-surface p-5';
const kpiLabelClass = 'text-[11px] font-medium uppercase tracking-wide text-ink-muted';
const kpiFigureClass = 'font-mono text-2xl font-semibold tabular-nums text-ink';

/** An invoice is overdue when its status says so, or its due date has passed and it is not paid. */
function isOverdue(inv: InvoiceRow, today: string): boolean {
  if (inv.status === 'paid') return false;
  return inv.status === 'overdue' || inv.due_date < today;
}

/**
 * Builds the forecast options for the What-If controls. Only non-default values are
 * included, so isSimulationActive() is false when nothing is being simulated.
 * Custom per-invoice delays override preset delays for the same invoice.
 */
export function buildSimulationOptions(
  preset: Preset,
  presetDelay: number,
  recover: boolean,
  customDelays: Record<string, number>,
  surprise: { amount: number; dayOffset: number },
  horizonDays: HorizonDays,
  invoices: ReadonlyArray<InvoiceRow> = [],
  today: string = todayIso(),
): ForecastOptions {
  const options: ForecastOptions = { horizonDays };

  const delays: Record<string, number> = {};
  if (preset === 'key-client') {
    delays[KEY_CLIENT_INVOICE] = presetDelay;
  }
  if (preset === 'bad-day') {
    for (const inv of invoices) {
      if (inv.status === 'sent' && inv.due_date >= today) {
        delays[inv.invoice_number] = presetDelay;
      }
    }
  }
  for (const [invoiceNumber, days] of Object.entries(customDelays)) {
    delays[invoiceNumber] = days;
  }
  if (Object.keys(delays).length > 0) {
    options.delayInvoices = delays;
  }

  if (recover) {
    options.recoverOverdue = [{ invoiceNumber: COLLECT_INVOICE, onDay: 3 }];
  }

  if (surprise.amount > 0) {
    const dayOffset = Math.min(horizonDays, Math.max(0, Math.round(surprise.dayOffset)));
    options.surpriseExpenses = [{ amount: surprise.amount, dayOffset }];
  }

  return options;
}

/** True when the options object contains any non-default simulation value. */
export function isSimulationActive(options: ForecastOptions): boolean {
  return (
    Object.keys(options.delayInvoices ?? {}).length > 0 ||
    (options.recoverOverdue?.length ?? 0) > 0 ||
    (options.surpriseExpenses?.length ?? 0) > 0
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface OverviewViewProps {
  openChase: (target: { invoiceId: string; tone: FollowupTone }) => void;
  simulationRequest?: number;
}

export function OverviewView({ openChase, simulationRequest }: OverviewViewProps) {
  const { data, alerts, loading, error } = useWorkspace();

  const [horizonDays, setHorizonDays] = useState<HorizonDays>(30);
  const [preset, setPreset] = useState<Preset>('none');
  const [keyClientDelay, setKeyClientDelay] = useState(15);
  const [badDayDelay, setBadDayDelay] = useState(20);
  const [recover, setRecover] = useState(false);
  const [customDelays, setCustomDelays] = useState<Record<string, number>>({});
  const [surpriseAmount, setSurpriseAmount] = useState(0);
  const [surpriseDay, setSurpriseDay] = useState(0);

  const forecastRef = useRef<HTMLElement | null>(null);

  // External request (from elsewhere in the app) to open the key-client simulation.
  useEffect(() => {
    if (!simulationRequest || simulationRequest <= 0) return;
    setPreset('key-client');
    forecastRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [simulationRequest]);

  const settings: Settings | null = data?.settings ?? null;
  const today = todayIso();

  const engine = useMemo(() => {
    if (!data || !settings) return null;
    const base = {
      today,
      studio: settings,
      invoices: data.invoices,
      bills: data.bills,
    };
    const presetDelay = preset === 'bad-day' ? badDayDelay : keyClientDelay;
    const simOptions = buildSimulationOptions(
      preset,
      presetDelay,
      recover,
      customDelays,
      { amount: surpriseAmount, dayOffset: surpriseDay },
      horizonDays,
      data.invoices,
      today,
    );
    const baseline = forecast(base, { horizonDays });
    const active = isSimulationActive(simOptions);
    const simulated = active ? forecast(base, simOptions) : null;
    return { baseline, simulated, active };
  }, [
    data,
    settings,
    today,
    preset,
    keyClientDelay,
    badDayDelay,
    recover,
    customDelays,
    surpriseAmount,
    surpriseDay,
    horizonDays,
  ]);

  if (loading && !data) {
    return <p className="text-sm text-slate-600">Loading workspace...</p>;
  }
  if (error) {
    return <p className="text-sm text-rose-700">Could not load workspace: {String(error)}</p>;
  }
  if (!data || !settings || !engine) {
    return <p className="text-sm text-slate-600">No studio settings found yet.</p>;
  }

  const { baseline, simulated, active } = engine;
  const invoices = data.invoices;
  const unpaid = invoices.filter((inv) => inv.status !== 'paid');

  const totalOwed = invoices
    .filter((inv) => inv.status === 'sent' || inv.status === 'overdue')
    .reduce((sum, inv) => sum + inv.amount, 0);
  const overdueInvoices = invoices.filter((inv) => isOverdue(inv, today));
  const overdueTotal = overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0);

  const dateOfDay = (result: { days: { day: number; date: string }[]; lowestDay: number }) =>
    result.days.find((d) => d.day === result.lowestDay)?.date ?? '-';

  const inv104 = invoices.find((inv) => inv.invoice_number === COLLECT_INVOICE);
  const inv104Overdue = inv104 ? isOverdue(inv104, today) : false;

  const series = simulated ?? baseline;
  const ledgerRows = series.days.filter((d) => d.inflow > 0 || d.outflow > 0);

  const chartRows = baseline.days.map((d, i) => ({
    date: d.date,
    baseline: d.closingBalance,
    simulated: simulated ? simulated.days[i]?.closingBalance : undefined,
  }));

  const baselineColor = '#6B7280';
  const simulatedColor = '#059669';

  const setCustomDelay = (invoiceNumber: string, raw: string) => {
    setCustomDelays((prev) => {
      const next = { ...prev };
      if (raw === '') {
        delete next[invoiceNumber];
      } else {
        next[invoiceNumber] = Math.min(90, Math.max(0, Number(raw) || 0));
      }
      return next;
    });
  };

  const resetSimulation = () => {
    setPreset('none');
    setKeyClientDelay(15);
    setBadDayDelay(20);
    setRecover(false);
    setCustomDelays({});
    setSurpriseAmount(0);
    setSurpriseDay(0);
  };

  const startKeyClientSimulation = () => {
    setPreset('key-client');
    forecastRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 1. KPI strip */}
      <section aria-label="Key figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cardClass}>
          <p className={kpiLabelClass}>Current Cash</p>
          <p className={`mt-2 ${kpiFigureClass}`}>{inr(settings.opening_balance)}</p>
        </div>
        <div className={cardClass}>
          <p className={kpiLabelClass}>Total Owed</p>
          <p className={`mt-2 ${kpiFigureClass}`}>{inr(totalOwed)}</p>
        </div>
        <div className={cardClass}>
          <p className={kpiLabelClass}>Overdue Now</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-rose">
            {overdueInvoices.length} {overdueInvoices.length === 1 ? 'invoice' : 'invoices'}
          </p>
          <p className="body-sm mt-1 tabular-nums text-rose">{inr(overdueTotal)}</p>
        </div>
        <div className={cardClass}>
          <p className={kpiLabelClass}>Lowest Projected Cash</p>
          <p
            className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
              baseline.lowestBalance < 0 ? 'text-rose' : 'text-emerald'
            }`}
          >
            {inr(baseline.lowestBalance)}
          </p>
          <p className="body-sm mt-1 text-ink-secondary">On {dateOfDay(baseline)} (baseline, {horizonDays} days)</p>
        </div>
      </section>


      {/* 2. Alerts queue */}
      <section aria-labelledby="alerts-heading" className={cardClass}>
        <h2 id="alerts-heading" className="title-md text-ink">
          Alerts Queue
        </h2>
        {alerts.length === 0 ? (
          <p className="mt-3 text-sm text-ink-secondary">No alerts. Cash position looks stable.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {alerts.map((alert) => {
              const action = alert.action;
              const invoiceId = action.invoiceNumber
                ? invoices.find((inv) => inv.invoice_number === action.invoiceNumber)?.id
                : undefined;
              const severityClass =
                alert.severity === 'high'
                  ? 'text-rose'
                  : alert.severity === 'medium'
                    ? 'text-amber'
                    : 'text-emerald';
              const severityLabel =
                alert.severity === 'high' ? 'High' : alert.severity === 'medium' ? 'Medium' : 'Low';

              return (
                <li
                  key={alert.id}
                  className="flex flex-col gap-3 rounded-lg border border-line p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="title-sm text-ink">{alert.message}</p>
                    <p className={`mt-1 text-xs font-medium ${severityClass}`}>
                      Severity: {severityLabel}
                      {action.invoiceNumber ? ` | Invoice ${action.invoiceNumber}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {action.type === 'draft_reminder' && invoiceId && (
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => openChase({ invoiceId, tone: 'friendly' })}
                      >
                        Draft Reminder
                      </button>
                    )}
                    {action.type === 'send_firm_followup' && invoiceId && (
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => openChase({ invoiceId, tone: 'firm' })}
                      >
                        Send Firm Follow-Up
                      </button>
                    )}
                    {action.type === 'simulate_delay' && (
                      <button type="button" className={buttonClass} onClick={startKeyClientSimulation}>
                        Simulate +15d Delay
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>


      {/* 3. Forecast */}
      <section
        id="forecast"
        ref={forecastRef}
        aria-labelledby="forecast-heading"
        className={`${cardClass} scroll-mt-6`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="forecast-heading" className="title-md text-ink">
            Cash Forecast
          </h2>
          <div role="group" aria-label="Forecast horizon" className="flex flex-wrap gap-2">
            {HORIZONS.map((h) => (
              <button
                key={h}
                type="button"
                aria-pressed={horizonDays === h}
                onClick={() => setHorizonDays(h)}
                className={horizonDays === h ? activeButtonClass : buttonClass}
              >
                {h} days
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">At-Risk Overdue Cash</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-amber-900">
            {inr(baseline.atRiskOverdueCash)}
          </p>
          <p className="mt-1 text-sm text-amber-900">
            Overdue invoices are excluded from automatic inflows, so this cash is not counted in the forecast
            until it is collected.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-secondary">
          <span className="flex items-center gap-2">
            <svg aria-hidden="true" width="24" height="8" viewBox="0 0 24 8">
              <line x1="0" y1="4" x2="24" y2="4" stroke="#6B7280" strokeWidth="2" strokeDasharray="6 4" />
            </svg>
            Baseline
          </span>
          <span className="flex items-center gap-2">
            <svg aria-hidden="true" width="24" height="8" viewBox="0 0 24 8">
              <line x1="0" y1="4" x2="24" y2="4" stroke="#059669" strokeWidth="2.5" />
            </svg>
            Simulated
          </span>
          <span className="flex items-center gap-2">
            <svg aria-hidden="true" width="24" height="8" viewBox="0 0 24 8">
              <line x1="0" y1="4" x2="24" y2="4" stroke="#D97706" strokeWidth="2" strokeDasharray="4 4" />
            </svg>
            Safe Buffer
          </span>
          <span className="flex items-center gap-2">
            <svg aria-hidden="true" width="24" height="8" viewBox="0 0 24 8">
              <line x1="0" y1="4" x2="24" y2="4" stroke="#E11D48" strokeWidth="1.5" />
            </svg>
            ₹0 Danger Line
          </span>
        </div>

        <div className="mt-3 h-[280px] w-full min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartRows} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E5E9" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6B7280' }} minTickGap={24} />
              <YAxis
                tick={{ fontSize: 12, fill: '#6B7280' }}
                width={110}
                tickFormatter={(v: number) => inr(v)}
              />
              <Tooltip
                formatter={(value) => inr(Number(value))}
                contentStyle={{ fontSize: '12px', padding: '6px 8px' }}
                wrapperStyle={{ zIndex: 20, pointerEvents: 'none' }}
              />
              <ReferenceLine y={0} stroke="#e11d48" strokeWidth={2} />
              <ReferenceLine
                y={settings.safe_buffer_amount}
                stroke="#D97706"
                strokeDasharray="4 4"
              />
              <Line
                type="monotone"
                dataKey="baseline"
                name="Baseline"
                stroke={baselineColor}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                isAnimationActive={false}
              />
              {active && (
                <Line
                  type="monotone"
                  dataKey="simulated"
                  name="Simulated"
                  stroke={simulatedColor}
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {simulated && (
          <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-lg border border-line bg-surface p-4">
              <dt className="text-xs text-ink-muted">Baseline Lowest</dt>
              <dd className="num-inr mt-1 text-lg font-semibold text-ink">
                {inr(baseline.lowestBalance)}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-surface p-4">
              <dt className="text-xs text-ink-muted">Simulated Lowest</dt>
              <dd
                className={`num-inr mt-1 text-lg font-semibold ${
                  simulated.lowestBalance < 0 ? 'text-rose' : 'text-emerald'
                }`}
              >
                {inr(simulated.lowestBalance)}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-surface p-4">
              <dt className="text-xs text-ink-muted">Cash Shortfall</dt>
              <dd
                className={`num-inr mt-1 text-lg font-semibold ${
                  simulated.cashShortfall > 0 ? 'text-rose' : 'text-emerald'
                }`}
              >
                {inr(simulated.cashShortfall)}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-surface p-4">
              <dt className="text-xs text-ink-muted">Exact Crunch Date</dt>
              <dd className="mt-1 text-lg font-semibold text-ink">
                {simulated.cashShortfall === 0 ? 'None in window' : dateOfDay(simulated)}
              </dd>
            </div>
          </dl>
        )}
      </section>


      {/* 4. What-If controls */}
      <section aria-labelledby="whatif-heading" className={`${cardClass} flex flex-col gap-6`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="whatif-heading" className="title-md text-ink">
            What-If Controls
          </h2>
          <button type="button" className={buttonClass} onClick={resetSimulation}>
            Reset Simulation
          </button>
        </div>
        <p className="text-sm text-ink-secondary">
          Simulations are temporary and are never saved to the database.
        </p>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-ink">Preset</legend>
          <div className="flex flex-wrap gap-3">
            {PRESETS.map((p) => (
              <label
                key={p.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                  preset === p.value
                    ? 'border-line-strong bg-subtle text-ink'
                    : 'border-line bg-surface text-ink-secondary hover:bg-subtle'
                }`}
              >
                <input
                  type="radio"
                  name="whatif-preset"
                  value={p.value}
                  checked={preset === p.value}
                  onChange={() => setPreset(p.value)}
                  className={`h-4 w-4 accent-blue ${focusRing}`}
                />
                {p.label}
              </label>
            ))}
          </div>

          {preset === 'key-client' && (
            <label className="flex flex-col gap-2 text-sm text-ink">
              <span>
                {KEY_CLIENT_INVOICE} delay: <span className="tabular-nums">{keyClientDelay}</span> days
              </span>
              <input
                type="range"
                min={0}
                max={45}
                step={1}
                value={keyClientDelay}
                onChange={(e) => setKeyClientDelay(Number(e.target.value))}
                className={`w-full accent-blue ${focusRing}`}
              />
            </label>
          )}

          {preset === 'bad-day' && (
            <label className="flex flex-col gap-2 text-sm text-ink">
              <span>
                Delay on all sent, not-yet-due invoices:{' '}
                <span className="tabular-nums">{badDayDelay}</span> days
              </span>
              <input
                type="range"
                min={15}
                max={25}
                step={1}
                value={badDayDelay}
                onChange={(e) => setBadDayDelay(Number(e.target.value))}
                className={`w-full accent-blue ${focusRing}`}
              />
            </label>
          )}
        </fieldset>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={recover && inv104Overdue}
              disabled={!inv104Overdue}
              onChange={(e) => setRecover(e.target.checked)}
              className={`h-4 w-4 accent-blue ${focusRing} disabled:opacity-50`}
            />
            Collect overdue {COLLECT_INVOICE} ({inr(inv104?.amount ?? 55000)}) on Day 3
          </label>
          {!inv104Overdue && (
            <p className="text-xs text-ink-secondary">
              {COLLECT_INVOICE} is not overdue in the current data, so this option is unavailable.
            </p>
          )}
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-ink">Custom invoice delays (days)</legend>
          {unpaid.length === 0 ? (
            <p className="text-sm text-ink-secondary">No unpaid invoices.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {unpaid.map((inv) => (
                <label key={inv.id} className="flex flex-col gap-1 text-sm text-ink">
                  <span>{inv.invoice_number}</span>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    inputMode="numeric"
                    value={customDelays[inv.invoice_number] ?? ''}
                    placeholder="Preset"
                    onChange={(e) => setCustomDelay(inv.invoice_number, e.target.value)}
                    className={`${inputClass} tabular-nums`}
                  />
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-ink">One-time surprise expense</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-ink">
              <span>Amount (INR)</span>
              <input
                type="number"
                min={0}
                inputMode="decimal"
                value={surpriseAmount}
                onChange={(e) => setSurpriseAmount(Math.max(0, Number(e.target.value) || 0))}
                className={`${inputClass} tabular-nums`}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              <span>Day offset (0 to {horizonDays})</span>
              <input
                type="number"
                min={0}
                max={horizonDays}
                inputMode="numeric"
                value={surpriseDay}
                onChange={(e) =>
                  setSurpriseDay(Math.min(horizonDays, Math.max(0, Number(e.target.value) || 0)))
                }
                className={`${inputClass} tabular-nums`}
              />
            </label>
          </div>
        </fieldset>
      </section>

      {/* 5. Daily cash-event ledger */}
      <section aria-labelledby="ledger-heading" className={cardClass}>
        <h2 id="ledger-heading" className="title-md text-ink">
          Daily Cash Events
        </h2>
        {ledgerRows.length === 0 ? (
          <p className="mt-3 text-sm text-ink-secondary">No cash events in this window.</p>
        ) : (
          <div className="mt-4 max-h-72 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <caption className="sr-only">
                Daily cash inflows, outflows and running balance for the next {horizonDays} days
                {active ? ' (simulated)' : ' (baseline)'}
              </caption>
              <thead className="sticky top-0">
                <tr className="border-b border-line text-left">
                  <th scope="col" className="bg-subtle py-2 pr-4 text-xs font-medium uppercase tracking-wide text-ink-muted">Date</th>
                  <th scope="col" className="bg-subtle py-2 pr-4 text-right text-xs font-medium uppercase tracking-wide text-ink-muted">Inflow</th>
                  <th scope="col" className="bg-subtle py-2 pr-4 text-right text-xs font-medium uppercase tracking-wide text-ink-muted">Outflow</th>
                  <th scope="col" className="bg-subtle py-2 text-right text-xs font-medium uppercase tracking-wide text-ink-muted">Running balance</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((row) => (
                  <tr key={row.day} className="border-b border-line">
                    <td className="py-2 pr-4 text-ink">{row.date}</td>
                    <td className="num-inr py-2 pr-4 text-right text-emerald">
                      {row.inflow > 0 ? inr(row.inflow) : '-'}
                    </td>
                    <td className="num-inr py-2 pr-4 text-right text-rose">
                      {row.outflow > 0 ? inr(row.outflow) : '-'}
                    </td>
                    <td
                      className={`num-inr py-2 text-right ${
                        row.closingBalance < 0 ? 'text-rose' : 'text-ink'
                      }`}
                    >
                      {inr(row.closingBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default OverviewView;
