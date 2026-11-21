export interface QuickAddResult {
  type: 'invoice' | 'bill';
  name: string;
  amount: number;
  dueDate: string;
  title: string;
}

// e.g. "Invoice Aarav Studio 45000 due in 14 days for Brand Guidelines"
// Optional leading rupee sign (\u20B9) and comma-grouped amounts are accepted.
const PATTERN =
  /^\s*(invoice|bill)\s+(.+?)\s+\u20B9?\s*(\d[\d,]*(?:\.\d+)?)\s+due\s+in\s+(\d+)\s+days?(?:\s+for\s+(.+?))?\s*$/i;

/** Adds whole days to a 'YYYY-MM-DD' date using UTC math. */
function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function parseQuickAdd(input: string, today: string): QuickAddResult | null {
  const match = PATTERN.exec(input);
  if (!match) return null;

  const [, kind, rawName, rawAmount, rawDays, rawTitle] = match;
  const name = rawName.trim();
  const amount = Number(rawAmount.replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;

  return {
    type: kind.toLowerCase() as 'invoice' | 'bill',
    name,
    amount,
    dueDate: addDays(today, Number(rawDays)),
    title: rawTitle?.trim() || name,
  };
}
