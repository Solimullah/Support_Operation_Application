import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import { countAll, countCsvTxt, countExcel, CountOutcome } from './countEntries';

const asFile = (content: string, name: string) => new File([content], name);

const collect = async (files: File[], hasHeader = true): Promise<CountOutcome[]> => {
  const outcomes: CountOutcome[] = [];
  for await (const outcome of countAll(files, { hasHeader })) {
    outcomes.push(outcome);
  }
  return outcomes;
};

describe('countCsvTxt', () => {
  it('excludes the header row by default', async () => {
    await expect(countCsvTxt(asFile('a,b\n1,2\n3,4\n', 'data.csv'), true)).resolves.toBe(2);
  });

  it('counts every row when hasHeader is false', async () => {
    await expect(countCsvTxt(asFile('1,2\n3,4\n5,6\n', 'data.csv'), false)).resolves.toBe(3);
  });

  it("skips fully blank lines, matching the original tool's greedy mode", async () => {
    await expect(countCsvTxt(asFile('a,b\n1,2\n\n3,4\n', 'data.csv'), true)).resolves.toBe(2);
  });
});

describe('countExcel', () => {
  it('sums entries across every sheet in the workbook', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['h'], ['1'], ['2']]), 'Sheet1');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['h'], ['3']]), 'Sheet2');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    await expect(countExcel(new File([buffer], 'book.xlsx'))).resolves.toBe(3);
  });
});

describe('countAll', () => {
  it('reports unsupported file types as a visible row instead of dropping them silently', async () => {
    const outcomes = await collect([asFile('whatever', 'notes.pdf')]);

    expect(outcomes).toEqual([
      { name: 'notes.pdf', type: 'PDF', count: 0, status: 'unsupported', message: 'Unsupported file type' },
    ]);
  });

  it('reports a read error as a visible row rather than throwing and aborting the batch', async () => {
    // A truncated ZIP local-file-header signature: valid enough to be
    // recognised as an xlsx container, invalid enough that SheetJS throws
    // trying to actually parse it — unlike plain garbage bytes, which
    // SheetJS silently reads as an empty sheet rather than erroring.
    const truncatedZip = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])], 'broken.xlsx');
    const outcomes = await collect([truncatedZip, asFile('a,b\n1,2\n', 'ok.csv')]);

    expect(outcomes[0]).toMatchObject({ name: 'broken.xlsx', type: 'Error', count: 0, status: 'error' });
    expect(outcomes[0].message).toBeTruthy();
    // The batch keeps going after one file errors.
    expect(outcomes[1]).toMatchObject({ name: 'ok.csv', count: 1, status: 'ok' });
  });

  it('recurses into nested zip archives instead of dropping them', async () => {
    const innerZip = new JSZip();
    innerZip.file('nested.csv', 'a,b\n1,2\n3,4\n');
    const innerBuffer = await innerZip.generateAsync({ type: 'arraybuffer' });

    const outerZip = new JSZip();
    outerZip.file('top.csv', 'a,b\n1,2\n');
    outerZip.file('inner.zip', innerBuffer);
    const outerBuffer = await outerZip.generateAsync({ type: 'arraybuffer' });

    const outcomes = await collect([new File([outerBuffer], 'archive.zip')]);

    const byName = Object.fromEntries(outcomes.map(o => [o.name, o]));
    expect(byName['top.csv']).toMatchObject({ count: 1, status: 'ok' });
    expect(byName['nested.csv']).toMatchObject({ count: 2, status: 'ok' });
  });

  it('resets nothing between files in the same batch, summing across all of them', async () => {
    const outcomes = await collect([asFile('a\n1\n2\n', 'a.csv'), asFile('a\n1\n', 'b.csv')]);
    const total = outcomes.filter(o => o.status === 'ok').reduce((sum, o) => sum + o.count, 0);

    expect(total).toBe(3);
  });
});
