import JSZip from 'jszip';
import * as XLSX from 'xlsx';

export type CountStatus = 'ok' | 'error' | 'unsupported';

export interface CountOutcome {
  name: string;
  type: string;
  count: number;
  status: CountStatus;
  message?: string;
}

export interface CountOptions {
  // Only applies to CSV/TXT. Excel files always follow SheetJS's own
  // header-row convention (see countExcel), matching the original tool.
  hasHeader: boolean;
}

const SUPPORTED_LEAF_EXTENSIONS = new Set(['csv', 'txt', 'xlsx', 'xls']);

export const getExtension = (filename: string): string => {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx + 1).toLowerCase();
};

// Ported from SNTS-Counter.html's countCsvTxt, which used Papa.parse with
// skipEmptyLines: 'greedy' and subtracted exactly 1 for a header row. Reusing
// xlsx here instead of adding papaparse as a dependency: `blankrows: false`
// reproduces the same "skip fully-blank lines" behaviour.
export const countCsvTxt = async (file: File, hasHeader: boolean): Promise<number> => {
  const text = await file.text();
  const workbook = XLSX.read(text, { type: 'string' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  return hasHeader ? Math.max(0, rows.length - 1) : rows.length;
};

// Ported from SNTS-Counter.html's countExcel: sums every sheet in the
// workbook (unlike the main app's readExcelFile, which only reads sheet 0),
// and relies on sheet_to_json's default behaviour of treating row 1 as a
// header and excluding it from the count.
export const countExcel = async (file: File): Promise<number> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  return workbook.SheetNames.reduce((total, sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return total + XLSX.utils.sheet_to_json(sheet).length;
  }, 0);
};

const countLeafFile = async (file: File, options: CountOptions): Promise<CountOutcome> => {
  const ext = getExtension(file.name);

  if (!SUPPORTED_LEAF_EXTENSIONS.has(ext)) {
    // Bug fix vs. the original tool: unsupported files used to be dropped
    // with zero feedback. Now they get a visible row instead.
    return {
      name: file.name,
      type: ext ? ext.toUpperCase() : 'Unknown',
      count: 0,
      status: 'unsupported',
      message: 'Unsupported file type',
    };
  }

  try {
    const count =
      ext === 'csv' || ext === 'txt' ? await countCsvTxt(file, options.hasHeader) : await countExcel(file);
    return { name: file.name, type: ext.toUpperCase(), count, status: 'ok' };
  } catch (error) {
    return {
      name: file.name,
      type: 'Error',
      count: 0,
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to read file',
    };
  }
};

// Bug fix vs. the original tool: a .zip nested inside a .zip used to fall
// through every case and be silently dropped. This recurses into nested
// archives instead.
export async function* expandZip(zipFile: File, options: CountOptions): AsyncGenerator<CountOutcome> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipFile);
  } catch (error) {
    yield {
      name: zipFile.name,
      type: 'Error',
      count: 0,
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to read zip archive',
    };
    return;
  }

  for (const entryName of Object.keys(zip.files)) {
    const entry = zip.files[entryName];
    if (entry.dir) continue;

    const buffer = await entry.async('arraybuffer');
    const entryFile = new File([buffer], entryName);

    if (getExtension(entryName) === 'zip') {
      yield* expandZip(entryFile, options);
    } else {
      yield await countLeafFile(entryFile, options);
    }
  }
}

// Streams one outcome at a time (rather than resolving with the whole
// batch), so the UI can render results as they arrive, matching the
// original tool's row-at-a-time feel.
export async function* countAll(files: Iterable<File>, options: CountOptions): AsyncGenerator<CountOutcome> {
  for (const file of files) {
    if (getExtension(file.name) === 'zip') {
      yield* expandZip(file, options);
    } else {
      yield await countLeafFile(file, options);
    }
  }
}
