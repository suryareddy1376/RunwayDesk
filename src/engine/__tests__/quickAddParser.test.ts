import { describe, it, expect } from 'vitest';
import { parseQuickAdd } from '../quickAddParser';

const TODAY = '2026-01-01';

describe('parseQuickAdd', () => {
  it('parses an invoice command with a title', () => {
    expect(parseQuickAdd('Invoice Aarav Studio 45000 due in 14 days for Brand Guidelines', TODAY)).toEqual({
      type: 'invoice',
      name: 'Aarav Studio',
      amount: 45000,
      dueDate: '2026-01-15',
      title: 'Brand Guidelines',
    });
  });

  it('parses a bill command and defaults the title to the name', () => {
    expect(parseQuickAdd('Bill Figma 3500 due in 5 days', TODAY)).toEqual({
      type: 'bill',
      name: 'Figma',
      amount: 3500,
      dueDate: '2026-01-06',
      title: 'Figma',
    });
  });

  it('returns null for unparseable input', () => {
    expect(parseQuickAdd('hello there', TODAY)).toBeNull();
  });
});
