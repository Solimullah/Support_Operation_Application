import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  calculateRowByteSize,
  guardSplitResultCount,
  isValidEmail,
  splitByColumnValue,
  splitByPercentageColumns,
  splitByPercentageRows,
  splitByRowCount,
  splitBySize,
  SPLIT_RESULTS_CONFIRM_THRESHOLD,
  SPLIT_RESULTS_HARD_LIMIT,
} from './splitFile';

describe('splitByColumnValue', () => {
  it('groups rows by distinct value and sanitizes filename-illegal characters', () => {
    const data = [{ region: 'US/East' }, { region: 'US/East' }, { region: 'EU' }, { region: '' }];
    const groups = splitByColumnValue(data, 'region');

    expect(Object.keys(groups).sort()).toEqual(['EU', 'Empty_Value', 'US_East']);
    expect(groups['US_East']).toHaveLength(2);
    expect(groups['Empty_Value']).toHaveLength(1);
  });
});

describe('splitByRowCount', () => {
  it('chunks rows into fixed-size groups, last group possibly smaller', () => {
    const data = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    const chunks = splitByRowCount(data, 2);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(2);
    expect(chunks[2]).toHaveLength(1);
  });
});

describe('splitByPercentageRows / Columns', () => {
  it('splits rows by percentage, clamping to 1-99', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    const [part1, part2] = splitByPercentageRows(data, 30);

    expect(part1).toHaveLength(3);
    expect(part2).toHaveLength(7);
  });

  it('splits columns by percentage and preserves each row subset', () => {
    const data = [{ a: 1, b: 2, c: 3, d: 4 }];
    const result = splitByPercentageColumns(data, ['a', 'b', 'c', 'd'], 50);

    expect(result.columns1).toEqual(['a', 'b']);
    expect(result.columns2).toEqual(['c', 'd']);
    expect(result.data1[0]).toEqual({ a: 1, b: 2 });
    expect(result.data2[0]).toEqual({ c: 3, d: 4 });
  });
});

describe('isValidEmail', () => {
  it('accepts a normal address', () => {
    expect(isValidEmail('alice@example.com')).toBe(true);
  });

  it.each([
    ['no @ at all', 'aliceexample.com'],
    ['two @ signs', 'ali@ce@example.com'],
    ['leading dot in local part', '.alice@example.com'],
    ['double dot in local part', 'ali..ce@example.com'],
    ['domain with no dot', 'alice@example'],
    ['single-letter TLD', 'alice@example.c'],
    ['contains a space', 'ali ce@example.com'],
  ])('rejects %s (%s)', (_label, email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe('calculateRowByteSize', () => {
  it('counts one byte per ASCII character plus separators and CRLF', () => {
    // "ab" (2) + comma (1) + "cd" (2) + CRLF (2) = 7
    expect(calculateRowByteSize(['ab', 'cd'])).toBe(7);
  });

  it('adds quoting overhead for cells containing a comma', () => {
    // "a,b" is 3 raw chars + 2 bytes for wrapping quotes (no internal quotes
    // to double) + CRLF (2) = 7. No separator bytes since there's only one cell.
    expect(calculateRowByteSize(['a,b'])).toBe(7);
  });
});

describe('splitBySize', () => {
  const columns = ['id', 'note'];

  it('closes a chunk once the byte budget is exceeded, keeping at least one row per chunk', () => {
    const data = [
      { id: '1', note: 'x'.repeat(20) },
      { id: '2', note: 'x'.repeat(20) },
      { id: '3', note: 'x'.repeat(20) },
    ];
    // Each row is roughly 25-30 bytes; a tiny budget forces one row per chunk.
    const result = splitBySize(data, columns, { maxSizeMB: 0.00003, emailMode: false });

    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks.every(chunk => chunk.length >= 1)).toBe(true);
    const totalRows = result.chunks.reduce((sum, c) => sum + c.length, 0);
    expect(totalRows).toBe(3);
  });

  it('keeps everything in one chunk when the budget is generous', () => {
    const data = Array.from({ length: 50 }, (_, i) => ({ id: String(i), note: 'short' }));
    const result = splitBySize(data, columns, { maxSizeMB: 4, emailMode: false });

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toHaveLength(50);
    expect(result.columns).toEqual(columns);
  });

  it('email mode collapses to the first column, validates, and dedupes case-insensitively', () => {
    const data = [
      { email: 'Alice@Example.com', extra: 'ignored' },
      { email: 'alice@example.com', extra: 'ignored' }, // duplicate of the above
      { email: 'not-an-email', extra: 'ignored' }, // invalid
      { email: 'bob@example.com', extra: 'ignored' },
    ];

    const result = splitBySize(data, ['email', 'extra'], { maxSizeMB: 4, emailMode: true });

    expect(result.columns).toEqual(['email']);
    expect(result.invalidEmails).toBe(1);
    expect(result.duplicateEmails).toBe(1);
    const emails = result.chunks.flat().map(r => r.email);
    expect(emails).toEqual(['Alice@Example.com', 'bob@example.com']);
  });
});

describe('guardSplitResultCount', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows a small result count through silently, with no prompt at all', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    expect(guardSplitResultCount(5)).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('asks for confirmation once past the warn threshold, honoring the answer', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(guardSplitResultCount(SPLIT_RESULTS_CONFIRM_THRESHOLD + 1)).toBe(true);
    expect(confirmSpy).toHaveBeenCalledOnce();

    confirmSpy.mockReturnValue(false);
    expect(guardSplitResultCount(SPLIT_RESULTS_CONFIRM_THRESHOLD + 1)).toBe(false);
  });

  it('refuses outright past the hard limit, without even asking', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    expect(guardSplitResultCount(SPLIT_RESULTS_HARD_LIMIT + 1)).toBe(false);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledOnce();
  });
});
