const MS_PER_DAY = 86_400_000;

export const BUCKET_LABELS = {
  current: 'Current',
  days1to7: '1-7d overdue',
  days8to15: '8-15d overdue',
  days15plus: '15+d overdue',
} as const;

export type AgingBucketLabel = (typeof BUCKET_LABELS)[keyof typeof BUCKET_LABELS];

/** Parses 'YYYY-MM-DD' as a UTC midnight timestamp. */
function toUtcMs(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * Whole days between dueDate and today (today - dueDate).
 * Positive when past due, zero on the due date, negative when not yet due.
 */
export function daysOverdue(dueDate: string, today: string): number {
  return Math.round((toUtcMs(today) - toUtcMs(dueDate)) / MS_PER_DAY);
}

/**
 * Buckets an overdue day count.
 * Overlap at 15 is resolved as: 8-15 covers 15 inclusive, 15+ starts at 16.
 */
export function agingBucket(days: number): AgingBucketLabel {
  if (days <= 0) return BUCKET_LABELS.current;
  if (days <= 7) return BUCKET_LABELS.days1to7;
  if (days <= 15) return BUCKET_LABELS.days8to15;
  return BUCKET_LABELS.days15plus;
}
