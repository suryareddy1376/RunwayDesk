import { describe, it, expect } from 'vitest';
import { daysOverdue, agingBucket, BUCKET_LABELS } from '../aging';

const TODAY = '2026-01-01';

/** Returns the ISO date `days` days after `iso` (UTC). */
function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

describe('daysOverdue', () => {
  it.each([0, 1, 7, 8, 15, 16])('returns %i for a due date %i days before today', (n) => {
    expect(daysOverdue(shift(TODAY, -n), TODAY)).toBe(n);
  });

  it('is negative when the due date is still in the future', () => {
    expect(daysOverdue(shift(TODAY, 5), TODAY)).toBe(-5);
  });
});

describe('agingBucket', () => {
  it('maps the boundary days to the expected buckets', () => {
    const cases: [number, string][] = [
      [0, 'Current'],
      [1, '1-7d overdue'],
      [7, '1-7d overdue'],
      [8, '8-15d overdue'],
      [15, '8-15d overdue'],
      [16, '15+d overdue'],
    ];
    for (const [days, label] of cases) {
      expect(agingBucket(days)).toBe(label);
    }
  });

  it('derives buckets from daysOverdue for due dates at the boundaries', () => {
    expect(agingBucket(daysOverdue(shift(TODAY, 0), TODAY))).toBe(BUCKET_LABELS.current);
    expect(agingBucket(daysOverdue(shift(TODAY, -1), TODAY))).toBe(BUCKET_LABELS.days1to7);
    expect(agingBucket(daysOverdue(shift(TODAY, -7), TODAY))).toBe(BUCKET_LABELS.days1to7);
    expect(agingBucket(daysOverdue(shift(TODAY, -8), TODAY))).toBe(BUCKET_LABELS.days8to15);
    expect(agingBucket(daysOverdue(shift(TODAY, -15), TODAY))).toBe(BUCKET_LABELS.days8to15);
    expect(agingBucket(daysOverdue(shift(TODAY, -16), TODAY))).toBe(BUCKET_LABELS.days15plus);
  });
});
