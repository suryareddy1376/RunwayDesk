import { describe, it, expect } from 'vitest';
import { forecast } from '../forecast';
import type { Bill, Invoice, StudioSettings } from '../../types/database';

const TODAY = '2026-01-01';

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const studio: StudioSettings = {
  user_id: 'user-1',
  studio_name: 'Test Studio',
  owner_name: 'Owner',
  currency_symbol: '$',
  opening_balance: 115000,
  safe_buffer_amount: 30000,
  created_at: 'ts',
};

function bill(id: string, amount: number, dueOffset: number, recurring: boolean): Bill {
  return {
    id,
    user_id: 'user-1',
    title: `Bill ${id}`,
    category: 'other',
    amount,
    due_date: addDays(TODAY, dueOffset),
    recurring_monthly: recurring,
    paid: false,
    created_at: 'ts',
  };
}

function invoice(
  number: string,
  amount: number,
  dueOffset: number,
  status: Invoice['status'],
): Invoice {
  return {
    id: `id-${number}`,
    user_id: 'user-1',
    client_id: 'client-1',
    invoice_number: number,
    title: `Invoice ${number}`,
    amount,
    issue_date: addDays(TODAY, dueOffset - 30),
    due_date: addDays(TODAY, dueOffset),
    status,
    paid_date: status === 'paid' ? TODAY : null,
    last_followed_up_at: null,
    created_at: 'ts',
  };
}

const bills: Bill[] = [
  bill('b1', 12500, 7, true),
  bill('b2', 45000, 14, true),
  bill('b3', 60000, 19, false),
  bill('b4', 18000, 27, true),
];

const invoices: Invoice[] = [
  invoice('INV-102', 20000, 5, 'paid'),
  invoice('INV-103', 25000, 2, 'paid'),
  invoice('INV-104', 55000, -14, 'overdue'),
  invoice('INV-105', 32000, -6, 'overdue'),
  invoice('INV-106', 95000, 10, 'sent'),
  invoice('INV-107', 40000, 24, 'sent'),
  invoice('INV-108', 95000, 40, 'sent'),
  invoice('INV-109', 65000, 58, 'sent'),
];

const input = { today: TODAY, studio, invoices, bills };

describe('forecast', () => {
  it('baseline closing balance on day 19 is 92500', () => {
    const result = forecast(input, { horizonDays: 60 });
    expect(result.days[19].day).toBe(19);
    expect(result.days[19].closingBalance).toBe(92500);
  });

  it('preset 1 (INV-106 delayed 15 days) gives a day-19 deficit of -2500', () => {
    const result = forecast(input, {
      horizonDays: 60,
      delayInvoices: { 'INV-106': 15 },
    });
    expect(result.days[19].closingBalance).toBe(-2500);
    expect(result.cashShortfall).toBeGreaterThan(0);
    expect(result.lowestDay).toBeLessThanOrEqual(19);
  });

  it('preset 1 + INV-104 recovery on day 3 gives a day-19 balance of 52500', () => {
    const result = forecast(input, {
      horizonDays: 60,
      delayInvoices: { 'INV-106': 15 },
      recoverOverdue: [{ invoiceNumber: 'INV-104', onDay: 3 }],
    });
    expect(result.days[19].closingBalance).toBe(52500);
    expect(result.days[19].closingBalance).toBeGreaterThan(30000);
  });

  it('reports overdue unpaid invoices as at-risk cash and excludes them from baseline', () => {
    const result = forecast(input, { horizonDays: 30 });
    expect(result.atRiskOverdueCash).toBe(87000);
    expect(result.days[3].inflow).toBe(0);
  });
});
