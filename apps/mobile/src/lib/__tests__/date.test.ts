import { describe, expect, it } from '@jest/globals';
import { dateKeyToDate, safeDate } from '../date';

describe('safeDate', () => {
  it('returns null for missing or unparseable values', () => {
    expect(safeDate(null)).toBeNull();
    expect(safeDate(undefined)).toBeNull();
    expect(safeDate('')).toBeNull();
    expect(safeDate('not-a-date')).toBeNull();
  });

  it('parses valid ISO timestamps', () => {
    const d = safeDate('2026-06-01T12:00:00.000Z');
    expect(d).toBeInstanceOf(Date);
    expect(d?.getTime()).toBe(new Date('2026-06-01T12:00:00.000Z').getTime());
  });
});

describe('dateKeyToDate', () => {
  it('returns null for missing/invalid keys', () => {
    expect(dateKeyToDate(null)).toBeNull();
    expect(dateKeyToDate('')).toBeNull();
    expect(dateKeyToDate('2026-13-99')).toBeNull();
  });

  it('parses a YYYY-MM-DD key at noon local time', () => {
    const d = dateKeyToDate('2026-06-01');
    expect(d).toBeInstanceOf(Date);
    expect(d?.getHours()).toBe(12);
  });
});
