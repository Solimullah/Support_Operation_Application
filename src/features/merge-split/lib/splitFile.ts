import { ExcelRow } from '@/types';

export const splitByColumnValue = (data: ExcelRow[], column: string): Record<string, ExcelRow[]> => {
  const groups: Record<string, ExcelRow[]> = {};

  data.forEach(row => {
    const rawVal = row[column];
    const val = rawVal !== undefined && rawVal !== null && rawVal !== '' ? String(rawVal) : 'Empty_Value';
    // Remove characters that are illegal in file names.
    const safeVal = val.replace(/[<>:"/\\|?*]/g, '_');

    if (!groups[safeVal]) groups[safeVal] = [];
    groups[safeVal].push(row);
  });

  return groups;
};

export const splitByRowCount = (data: ExcelRow[], rowsPerFile: number): ExcelRow[][] => {
  const chunks: ExcelRow[][] = [];
  for (let i = 0; i < data.length; i += rowsPerFile) {
    chunks.push(data.slice(i, i + rowsPerFile));
  }
  return chunks;
};

export const splitByPercentageRows = (data: ExcelRow[], percentage: number): [ExcelRow[], ExcelRow[]] => {
  const pct = Math.min(Math.max(percentage, 1), 99);
  const splitIndex = Math.floor(data.length * (pct / 100));
  return [data.slice(0, splitIndex), data.slice(splitIndex)];
};

export interface ColumnSplitResult {
  columns1: string[];
  columns2: string[];
  data1: ExcelRow[];
  data2: ExcelRow[];
}

export const splitByPercentageColumns = (data: ExcelRow[], columns: string[], percentage: number): ColumnSplitResult => {
  const pct = Math.min(Math.max(percentage, 1), 99);
  const colSplitIndex = Math.floor(columns.length * (pct / 100));
  const columns1 = columns.slice(0, colSplitIndex);
  const columns2 = columns.slice(colSplitIndex);

  const pick = (row: ExcelRow, cols: string[]): ExcelRow => {
    const newRow: ExcelRow = {};
    cols.forEach(c => {
      newRow[c] = row[c];
    });
    return newRow;
  };

  return {
    columns1,
    columns2,
    data1: data.map(row => pick(row, columns1)),
    data2: data.map(row => pick(row, columns2)),
  };
};

// Ported from File-Splitter.html's hand-rolled validator (kept deliberately
// stricter than a typical one-liner regex): local part 1-64 chars, domain
// 1-255 chars, total <=320, no leading/trailing/doubled dots, a TLD of at
// least 2 letters.
const LOCAL_CHARS = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const DOMAIN_CHARS = /^[a-zA-Z0-9.-]+$/;
const TLD_CHARS = /^[a-zA-Z]{2,}$/;

export const isValidEmail = (rawEmail: string): boolean => {
  const email = rawEmail.trim();
  if (email.length === 0 || email.length > 320 || /\s/.test(email)) return false;

  const atCount = (email.match(/@/g) || []).length;
  if (atCount !== 1) return false;

  const [local, domain] = email.split('@');

  if (local.length < 1 || local.length > 64) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (!LOCAL_CHARS.test(local)) return false;

  if (domain.length < 1 || domain.length > 255 || !domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.startsWith('-') || domain.endsWith('-')) return false;
  if (domain.includes('..')) return false;
  if (!DOMAIN_CHARS.test(domain)) return false;

  const labels = domain.split('.');
  for (const label of labels) {
    if (label.length < 1 || label.length > 63) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
  }

  return TLD_CHARS.test(labels[labels.length - 1]);
};

const utf8ByteLength = (value: unknown): number => {
  const str = value === undefined || value === null ? '' : String(value);
  let bytes = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  if (/["\n\r,]/.test(str)) {
    const quoteCount = (str.match(/"/g) || []).length;
    bytes += 2 + quoteCount; // wrapping quotes + doubled internal quotes
  }
  return bytes;
};

// Ported from File-Splitter.html's calculateActualRowSize: the true
// CSV-serialized byte size of a row, used to decide chunk boundaries. This
// estimate is used even when the eventual export format is Excel — the
// same approximation the original tool made, kept deliberately rather than
// silently "fixed", since Excel's real binary size can't be predicted
// before the workbook is actually written.
export const calculateRowByteSize = (cells: unknown[]): number => {
  const cellBytes = cells.reduce<number>((sum, cell) => sum + utf8ByteLength(cell), 0);
  const separators = Math.max(0, cells.length - 1);
  const CRLF = 2;
  return cellBytes + separators + CRLF;
};

// Splitting into an unbounded number of results — "by unique column value"
// on a high-cardinality column (an ID, a hash), or a too-small row/size
// chunk setting on a large file — used to render one full result card per
// output with no cap at all in MergePanel's "Generations History" list.
// That was observed to crash the browser tab outright ("Aw, Snap! Out of
// Memory") once the count reached the tens of thousands. Call this after
// computing a split's raw chunks/groups (a cheap single pass) but before
// building any per-result UI objects or touching React state, so an
// excessive split never reaches rendering at all.
export const SPLIT_RESULTS_CONFIRM_THRESHOLD = 200;
export const SPLIT_RESULTS_HARD_LIMIT = 5000;

export const guardSplitResultCount = (count: number): boolean => {
  if (count > SPLIT_RESULTS_HARD_LIMIT) {
    alert(
      `This split would create ${count.toLocaleString()} separate files, which is enough to crash this tab. ` +
        `Try "By Max File Size" with a larger size, "By Row Count" with a larger count, or a less unique column.`
    );
    return false;
  }
  if (count > SPLIT_RESULTS_CONFIRM_THRESHOLD) {
    return window.confirm(
      `This will create ${count.toLocaleString()} separate files. That's a lot to hold in this tab at once and may be slow. Continue anyway?`
    );
  }
  return true;
};

export interface SizeSplitOptions {
  maxSizeMB: number;
  emailMode: boolean;
}

export interface SizeSplitResult {
  chunks: ExcelRow[][];
  columns: string[];
  invalidEmails: number;
  duplicateEmails: number;
}

// Ported from File-Splitter.html's main split loop. Email mode collapses
// every row down to just the first column (matching the original, which
// kept only row[0]), validating and case-insensitively deduplicating.
export const splitBySize = (data: ExcelRow[], columns: string[], options: SizeSplitOptions): SizeSplitResult => {
  const maxBytes = Math.max(0, options.maxSizeMB) * 1024 * 1024;
  const outputColumns = options.emailMode ? columns.slice(0, 1) : columns;
  const emailColumn = columns[0];

  let rows = data;
  let invalidEmails = 0;
  let duplicateEmails = 0;

  if (options.emailMode) {
    const seen = new Set<string>();
    const cleaned: ExcelRow[] = [];

    for (const row of data) {
      const raw = row[emailColumn];
      const email = raw === undefined || raw === null ? '' : String(raw).trim();

      if (!email || !isValidEmail(email)) {
        invalidEmails += 1;
        continue;
      }

      const key = email.toLowerCase();
      if (seen.has(key)) {
        duplicateEmails += 1;
        continue;
      }
      seen.add(key);
      cleaned.push({ [emailColumn]: email });
    }

    rows = cleaned;
  }

  const headerSize = calculateRowByteSize(outputColumns);
  const chunks: ExcelRow[][] = [];
  let currentChunk: ExcelRow[] = [];
  let currentSize = headerSize;

  for (const row of rows) {
    const cells = outputColumns.map(c => row[c]);
    const rowSize = calculateRowByteSize(cells);

    if (currentSize + rowSize > maxBytes && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = headerSize;
    }

    currentChunk.push(row);
    currentSize += rowSize;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);

  return { chunks, columns: outputColumns, invalidEmails, duplicateEmails };
};
