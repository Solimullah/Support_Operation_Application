import { describe, expect, it } from 'vitest';

import { buildAcceptedMatchRows, compareFiles, findPossiblePhoneMatches, normalizeForMatch, PhoneMatchCandidate } from './compareFiles';

describe('normalizeForMatch', () => {
  it('in text mode, just stringifies the value', () => {
    expect(normalizeForMatch(123, 'text')).toBe('123');
    expect(normalizeForMatch('abc', 'text')).toBe('abc');
  });

  it('in phone mode, strips formatting and a leading trunk zero, but does not truncate', () => {
    expect(normalizeForMatch('0791234567', 'phone')).toBe('791234567');
    expect(normalizeForMatch('+41791234567', 'phone')).toBe('41791234567');
  });

  it('in phone mode, a blank value normalizes to null rather than an empty string', () => {
    expect(normalizeForMatch('', 'phone')).toBeNull();
    expect(normalizeForMatch(undefined, 'phone')).toBeNull();
  });
});

describe('compareFiles', () => {
  it('matches exact text by default', () => {
    const a = [{ id: '1' }, { id: '2' }];
    const b = [{ id: '2' }, { id: '3' }];
    const result = compareFiles(a, 'id', b, 'id', 'text');

    expect(result.in1Only).toEqual([{ id: '1' }]);
    expect(result.in2Only).toEqual([{ id: '3' }]);
    expect(result.common).toEqual([{ id: '2' }]);
    expect(result.possibleMatches).toBeUndefined();
  });

  it('in phone mode, an identically-formatted number on both sides is an exact Common match', () => {
    const fileA = [{ phone: '0791234567' }];
    const fileB = [{ phone: '0791234567' }];
    const result = compareFiles(fileA, 'phone', fileB, 'phone', 'phone');

    expect(result.common).toEqual([{ phone: '0791234567' }]);
    expect(result.in1Only).toEqual([]);
    expect(result.in2Only).toEqual([]);
  });

  it('never treats two blank phone cells as a match', () => {
    const fileA = [{ phone: '' }];
    const fileB = [{ phone: '' }];
    const result = compareFiles(fileA, 'phone', fileB, 'phone', 'phone');

    expect(result.common).toEqual([]);
    expect(result.in1Only).toEqual([{ phone: '' }]);
    expect(result.in2Only).toEqual([{ phone: '' }]);
  });

  it('puts a country-code form and a trunk-zero form of the same number into possibleMatches, not common', () => {
    const fileA = [{ phone: '+41791234567' }];
    const fileB = [{ phone: '0791234567' }];
    const result = compareFiles(fileA, 'phone', fileB, 'phone', 'phone');

    expect(result.common).toEqual([]);
    expect(result.possibleMatches).toHaveLength(1);
    expect(result.possibleMatches![0]).toMatchObject({
      value1: '+41791234567',
      value2: '0791234567',
      sharedDigits: '791234567',
    });
  });

  it('finds a possible match for a SHORT national number that a fixed 9-digit heuristic would miss', () => {
    // An 8-digit national number: a fixed "keep the last 9 digits" approach
    // (tried and rejected — see corePhoneDigits' comment) under-strips the
    // country code here, leaving a stray leading digit that breaks the
    // match. This is the exact bug report this test guards against.
    const shortA = [{ phone: '+4181234567' }]; // country code "41" + 8-digit national number "81234567"
    const shortB = [{ phone: '081234567' }]; // trunk zero + the same 8-digit number
    const result = compareFiles(shortA, 'phone', shortB, 'phone', 'phone');

    expect(result.possibleMatches).toHaveLength(1);
    expect(result.possibleMatches![0].sharedDigits).toBe('81234567');
  });

  it('does not falsely pair unrelated numbers that only share digits below the minimum threshold', () => {
    // '+41791234567' -> core '41791234567', last 6 = '234567', last 7 = '1234567'.
    // '0099234567' -> core '99234567' (both leading zeros stripped), last 6 =
    // '234567' (same!) but last 7 = '9234567' (different) — so these share
    // only 6 digits, one short of MIN_SUFFIX_MATCH_LENGTH, and must not pair.
    const fileA = [{ phone: '+41791234567' }];
    const fileB = [{ phone: '0099234567' }];
    const result = compareFiles(fileA, 'phone', fileB, 'phone', 'phone');

    expect(result.common).toEqual([]);
    expect(result.possibleMatches).toEqual([]);
  });
});

describe('findPossiblePhoneMatches', () => {
  it('prefers the longest shared suffix when multiple candidates are plausible', () => {
    const rows1 = [{ phone: '41791234567' }];
    const rows2 = [
      { phone: '91234567' }, // shares 8 digits
      { phone: '791234567' }, // shares 9 digits — should be preferred
    ];
    const matches = findPossiblePhoneMatches(rows1, 'phone', rows2, 'phone');

    expect(matches).toHaveLength(1);
    expect(matches[0].value2).toBe('791234567');
    expect(matches[0].sharedDigits).toBe('791234567');
  });

  it('does not reuse the same file2 row for two different file1 rows', () => {
    const rows1 = [{ phone: '41791234567' }, { phone: '0791234567' }];
    const rows2 = [{ phone: '791234567' }];
    const matches = findPossiblePhoneMatches(rows1, 'phone', rows2, 'phone');

    expect(matches).toHaveLength(1);
  });
});

describe('buildAcceptedMatchRows', () => {
  const candidate: PhoneMatchCandidate = {
    row1: { Name: 'Alice', Phone: '46703032646' },
    row2: { Name: 'A. Smith', Phone: '0703032646', Source: 'whitelist' },
    value1: '46703032646',
    value2: '0703032646',
    sharedDigits: '703032646',
  };

  it('combines both rows losslessly, prefixing file2 columns to avoid collisions', () => {
    const [row] = buildAcceptedMatchRows([candidate], { format: 'original' });

    expect(row).toMatchObject({
      Name: 'Alice', // file1's value wins the unprefixed key
      Phone: '46703032646', // file1's own phone value, untouched
      B_Name: 'A. Smith', // file2's same-named column, preserved under a prefix
      B_Phone: '0703032646',
      B_Source: 'whitelist',
      'Shared Digits': '703032646',
    });
    expect('Source' in row).toBe(false); // only file2 had this column, so it must appear only prefixed
    expect(row['Normalized Phone']).toBeUndefined();
  });

  it('adds a National-format normalized column on top, without touching the originals', () => {
    const [row] = buildAcceptedMatchRows([candidate], { format: 'national' });

    expect(row['Normalized Phone']).toBe('0703032646');
    expect(row.Phone).toBe('46703032646');
    expect(row.B_Phone).toBe('0703032646');
  });

  it('adds an International-format normalized column using the given country code', () => {
    const [row] = buildAcceptedMatchRows([candidate], { format: 'international', countryCode: '46' });

    expect(row['Normalized Phone']).toBe('46703032646');
  });
});
