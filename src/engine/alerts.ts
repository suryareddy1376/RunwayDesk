import { daysOverdue } from './aging';
import { formatINR } from './reminderTemplates';

export type AlertSeverity = 'high' | 'medium' | 'low';

export interface AlertInvoice {
  id: string;
  invoiceNumber: string;
  clientName: string;
  amount: number;
  dueDate: string;
  status: string;
}

export interface AlertBill {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: string;
}

export interface AlertAction {
  label: string;
  type: 'draft_reminder' | 'simulate_delay' | 'send_firm_followup';
  invoiceNumber?: string;
  tone?: 'firm';
}

export interface Alert {
  id: string;
  severity: AlertSeverity;
  message: string;
  action: AlertAction;
}

export interface BuildAlertsInput {
  invoices: AlertInvoice[];
  /** Accepted for the common input shape; the current rules do not raise alerts from bills. */
  bills: AlertBill[];
  lowestBalance: number;
  safeBuffer: number;
  today: string;
  /** Map of invoiceNumber -> 'YYYY-MM-DD' date of the last follow-up. */
  lastFollowUpByInvoice?: Record<string, string>;
}

const STALE_FOLLOW_UP_DAYS = 5;
const SEVERITY_RANK: Record<AlertSeverity, number> = { high: 0, medium: 1, low: 2 };

export function buildAlerts(input: BuildAlertsInput): Alert[] {
  const { invoices, lowestBalance, safeBuffer, today, lastFollowUpByInvoice = {} } = input;
  const ranked: { alert: Alert; amount: number }[] = [];

  if (lowestBalance < safeBuffer || lowestBalance < 0) {
    ranked.push({
      alert: {
        id: 'crunch-simulate-delay',
        severity: 'high',
        message: `Projected cash low of ${formatINR(lowestBalance)} is below the safe buffer of ${formatINR(safeBuffer)}.`,
        action: { label: 'Simulate +15d Delay', type: 'simulate_delay' },
      },
      amount: 0,
    });
  }

  for (const invoice of invoices) {
    if (invoice.status === 'paid') continue;
    const days = daysOverdue(invoice.dueDate, today);
    if (days <= 0) continue;

    const lastFollowUp = lastFollowUpByInvoice[invoice.invoiceNumber];
    if (!lastFollowUp) {
      ranked.push({
        alert: {
          id: `draft-${invoice.invoiceNumber}`,
          severity: 'medium',
          message: `Invoice ${invoice.invoiceNumber} from ${invoice.clientName} is ${days} days overdue with no follow-up yet.`,
          action: {
            label: '[Draft Reminder]',
            type: 'draft_reminder',
            invoiceNumber: invoice.invoiceNumber,
          },
        },
        amount: invoice.amount,
      });
      continue;
    }

    const daysSinceFollowUp = daysOverdue(lastFollowUp, today);
    if (daysSinceFollowUp >= STALE_FOLLOW_UP_DAYS) {
      ranked.push({
        alert: {
          id: `followup-${invoice.invoiceNumber}`,
          severity: 'high',
          message: `Invoice ${invoice.invoiceNumber} from ${invoice.clientName} is ${days} days overdue and was last followed up ${daysSinceFollowUp} days ago.`,
          action: {
            label: 'Send Firm Follow-Up',
            type: 'send_firm_followup',
            invoiceNumber: invoice.invoiceNumber,
            tone: 'firm',
          },
        },
        amount: invoice.amount,
      });
    }
  }

  ranked.sort(
    (a, b) =>
      SEVERITY_RANK[a.alert.severity] - SEVERITY_RANK[b.alert.severity] || b.amount - a.amount,
  );

  return ranked.map((entry) => entry.alert);
}
