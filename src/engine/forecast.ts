import type { Bill, Invoice, StudioSettings } from '../types/database';

export type HorizonDays = 30 | 60 | 90;

export interface RecoverOverdue {
  invoiceNumber: string;
  onDay: number;
}

export interface SurpriseExpense {
  amount: number;
  dayOffset: number;
}

export interface ForecastInput {
  /** 'YYYY-MM-DD'. Day 0 of the forecast. */
  today: string;
  studio: StudioSettings;
  invoices: Invoice[];
  bills: Bill[];
}

export interface ForecastOptions {
  horizonDays: HorizonDays;
  /** Extra days added to an invoice's due date, keyed by invoice_number. */
  delayInvoices?: Record<string, number>;
  /** Unpaid overdue invoices recovered (cash received) on a given day offset. */
  recoverOverdue?: RecoverOverdue[];
  surpriseExpenses?: SurpriseExpense[];
}

export interface ForecastDay {
  day: number;
  date: string;
  inflow: number;
  outflow: number;
  closingBalance: number;
}

export interface ForecastResult {
  days: ForecastDay[];
  lowestBalance: number;
  lowestDay: number;
  cashShortfall: number;
  atRiskOverdueCash: number;
}

const DAY_MS = 86_400_000;
const RECURRING_STEP_DAYS = 30;

/** Parse 'YYYY-MM-DD' as a UTC timestamp (ms). */
function parseUtc(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function toYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whole-day offset of `date` relative to `today`, computed in UTC. */
function dayOffset(today: string, date: string): number {
  return Math.round((parseUtc(date) - parseUtc(today)) / DAY_MS);
}

export function forecast(input: ForecastInput, options: ForecastOptions): ForecastResult {
  const { today, studio, invoices, bills } = input;
  const horizon = options.horizonDays;
  const delays = options.delayInvoices ?? {};

  // Index 0..horizon inclusive. Events outside this window are ignored.
  const inflows = new Array<number>(horizon + 1).fill(0);
  const outflows = new Array<number>(horizon + 1).fill(0);
  const addInflow = (offset: number, amount: number) => {
    if (offset >= 0 && offset <= horizon) inflows[offset] += amount;
  };
  const addOutflow = (offset: number, amount: number) => {
    if (offset >= 0 && offset <= horizon) outflows[offset] += amount;
  };

  // Invoices: sent & not yet due -> baseline inflow; overdue -> at risk, excluded from baseline.
  let atRiskOverdueCash = 0;
  const overdueByNumber = new Map<string, Invoice>();
  for (const inv of invoices) {
    if (inv.status === 'paid' || inv.status === 'draft') continue;
    if (inv.status === 'overdue' || inv.due_date < today) {
      atRiskOverdueCash += inv.amount;
      overdueByNumber.set(inv.invoice_number, inv);
      continue;
    }
    const extra = delays[inv.invoice_number] ?? 0;
    addInflow(dayOffset(today, inv.due_date) + extra, inv.amount);
  }

  // Bills: unpaid bills on due date; recurring ones repeat every 30 days.
  for (const bill of bills) {
    if (bill.paid) continue;
    const first = dayOffset(today, bill.due_date);
    if (first < 0) continue;
    if (bill.recurring_monthly) {
      for (let off = first; off <= horizon; off += RECURRING_STEP_DAYS) {
        addOutflow(off, bill.amount);
      }
    } else {
      addOutflow(first, bill.amount);
    }
  }

  // Recovery of overdue invoices (these are not in the baseline, so no double count).
  for (const rec of options.recoverOverdue ?? []) {
    const inv = overdueByNumber.get(rec.invoiceNumber);
    if (inv) addInflow(rec.onDay, inv.amount);
  }

  for (const s of options.surpriseExpenses ?? []) {
    addOutflow(s.dayOffset, s.amount);
  }

  // Running balance.
  const todayMs = parseUtc(today);
  let balance = studio.opening_balance;
  const days: ForecastDay[] = [];
  for (let d = 0; d <= horizon; d++) {
    balance += inflows[d] - outflows[d];
    days.push({
      day: d,
      date: toYmd(todayMs + d * DAY_MS),
      inflow: inflows[d],
      outflow: outflows[d],
      closingBalance: balance,
    });
  }

  let lowestBalance = days[0].closingBalance;
  let lowestDay = 0;
  for (const day of days) {
    if (day.closingBalance < lowestBalance) {
      lowestBalance = day.closingBalance;
      lowestDay = day.day;
    }
  }

  return {
    days,
    lowestBalance,
    lowestDay,
    cashShortfall: Math.max(0, -lowestBalance),
    atRiskOverdueCash,
  };
}
