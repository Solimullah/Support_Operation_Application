import { ExcelRow } from '@/types';

export type MatchType = 'text' | 'phone';

export interface PhoneMatchCandidate {
  row1: ExcelRow;
  row2: ExcelRow;
  value1: string;
  value2: string;
  sharedDigits: string;
}

export interface CompareResult {
  in1Only: ExcelRow[];
  in2Only: ExcelRow[];
  common: ExcelRow[];
  // Only populated for matchType 'phone'. Pairs drawn from in1Only/in2Only
  // that share a long digit suffix but didn't exactly match — e.g. a
  // country-code form and a trunk-zero form of the same number. These are
  // NOT folded into `common` automatically: phone-number equivalence across
  // formats is a judgment call (how many digits of overlap is "the same
  // number" varies by what the data actually looks like), so this is a
  // reviewable shortlist, not an automatic decision.
  possibleMatches?: PhoneMatchCandidate[];
}

// Strips everything but digits, then strips a single leading national trunk
// zero. Deliberately does NOT truncate to any fixed length — a country code
// is a *prefix* added in front of the national number, so if both sides
// already share the same representation (both national, or both already
// written the same international way) this is already enough for an exact
// match. A fixed-length truncation was tried first and rejected: it breaks
// for national numbers shorter than the chosen length, since slicing a
// fixed suffix off an international form can clip into the country code
// instead of past it. See findPossiblePhoneMatches for how
// different-length-but-related numbers are handled instead.
const corePhoneDigits = (value: unknown): string => {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  return digits.replace(/^0+/, '');
};

// Returns null for "nothing to compare" (a blank cell under phone mode, or
// a value with no digits at all) — null keys are never placed in the match
// sets and never count as common, so two blank phone cells don't
// spuriously "match" each other. Exact-text mode is left exactly as it was
// before this match-type option existed: a blank cell is still just the
// string "", matching other blanks, since that's existing, already-relied-on
// behavior this change isn't meant to touch.
export const normalizeForMatch = (value: unknown, matchType: MatchType): string | null => {
  if (matchType === 'phone') {
    const digits = corePhoneDigits(value);
    return digits === '' ? null : digits;
  }
  return String(value);
};

// A shared trailing run of at least this many digits is treated as strong
// evidence two differently-formatted values are the same phone number (a
// coincidental match this long between two unrelated numbers is very
// unlikely). Below this, overlap is too easy to hit by chance to be useful.
// Above MAX, nothing realistic needs checking — real phone numbers don't run
// past this many digits even with a country code attached.
const MIN_SUFFIX_MATCH_LENGTH = 7;
const MAX_SUFFIX_CHECK_LENGTH = 15;

// Finds pairs between two row sets whose phone values share a long digit
// suffix, without any fixed-length assumption and without comparing every
// row in one set against every row in the other (which would be too slow
// for large leftover sets). Instead, file2's rows are indexed once under
// every suffix length they actually have (bounded between MIN and MAX), and
// each file1 row is looked up — trying its longest possible suffix first,
// so the most confident match wins when more than one is plausible. This
// keeps the whole pass roughly O(rows × constant) rather than O(rows²).
export const findPossiblePhoneMatches = (
  rows1: ExcelRow[],
  col1: string,
  rows2: ExcelRow[],
  col2: string
): PhoneMatchCandidate[] => {
  const suffixIndex = new Map<string, ExcelRow[]>();
  rows2.forEach(row => {
    const digits = corePhoneDigits(row[col2]);
    const maxLen = Math.min(digits.length, MAX_SUFFIX_CHECK_LENGTH);
    for (let len = MIN_SUFFIX_MATCH_LENGTH; len <= maxLen; len++) {
      const key = len + ':' + digits.slice(-len);
      const bucket = suffixIndex.get(key);
      if (bucket) bucket.push(row);
      else suffixIndex.set(key, [row]);
    }
  });

  const claimedRow2 = new Set<ExcelRow>();
  const candidates: PhoneMatchCandidate[] = [];

  rows1.forEach(row1 => {
    const digits1 = corePhoneDigits(row1[col1]);
    const maxLen = Math.min(digits1.length, MAX_SUFFIX_CHECK_LENGTH);
    if (maxLen < MIN_SUFFIX_MATCH_LENGTH) return;

    for (let len = maxLen; len >= MIN_SUFFIX_MATCH_LENGTH; len--) {
      const suffix = digits1.slice(-len);
      const bucket = suffixIndex.get(len + ':' + suffix);
      const row2 = bucket && bucket.find(r => !claimedRow2.has(r));
      if (row2) {
        claimedRow2.add(row2);
        candidates.push({
          row1,
          row2,
          value1: String(row1[col1] ?? ''),
          value2: String(row2[col2] ?? ''),
          sharedDigits: suffix,
        });
        break; // longest-match-wins: stop trying shorter suffixes for this row
      }
    }
  });

  return candidates;
};

export type PhoneExportFormat = 'original' | 'national' | 'international';

export interface PhoneFormatOptions {
  format: PhoneExportFormat;
  // Required (and only meaningful) when format === 'international'. Not
  // inferred from the data — the app can't safely guess which country's
  // dialing code a given leading digit group represents.
  countryCode?: string;
}

// Builds one combined, lossless row per accepted possible-match pair: every
// column from file1 as-is, plus every column from file2 prefixed with "B_"
// so a same-named column in both files (very common — "Name", "Email") never
// silently overwrites the other side's value. `sharedDigits` (the canonical
// digits common to both formats) is always included for traceability; a
// `Normalized Phone` column is added on top only when the user asked for a
// specific output format rather than keeping both originals as-is.
export const buildAcceptedMatchRows = (candidates: PhoneMatchCandidate[], options: PhoneFormatOptions): ExcelRow[] => {
  return candidates.map(c => {
    const combined: ExcelRow = { ...c.row1 };
    Object.entries(c.row2).forEach(([key, value]) => {
      combined[`B_${key}`] = value;
    });
    combined['Shared Digits'] = c.sharedDigits;

    if (options.format === 'national') {
      combined['Normalized Phone'] = '0' + c.sharedDigits;
    } else if (options.format === 'international') {
      combined['Normalized Phone'] = (options.countryCode || '') + c.sharedDigits;
    }

    return combined;
  });
};

export const compareFiles = (
  data1: ExcelRow[],
  col1: string,
  data2: ExcelRow[],
  col2: string,
  matchType: MatchType
): CompareResult => {
  const keyed1 = data1.map(row => ({ row, key: normalizeForMatch(row[col1], matchType) }));
  const keyed2 = data2.map(row => ({ row, key: normalizeForMatch(row[col2], matchType) }));

  const set1 = new Set(keyed1.filter(k => k.key !== null).map(k => k.key));
  const set2 = new Set(keyed2.filter(k => k.key !== null).map(k => k.key));

  const in1Only = keyed1.filter(k => k.key === null || !set2.has(k.key)).map(k => k.row);
  const in2Only = keyed2.filter(k => k.key === null || !set1.has(k.key)).map(k => k.row);
  const common = keyed1.filter(k => k.key !== null && set2.has(k.key)).map(k => k.row);

  const possibleMatches = matchType === 'phone' ? findPossiblePhoneMatches(in1Only, col1, in2Only, col2) : undefined;

  return { in1Only, in2Only, common, possibleMatches };
};
