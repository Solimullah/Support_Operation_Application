import { describe, expect, it } from 'vitest';

import { mergeColumns } from './mergeColumns';

describe('mergeColumns', () => {
  it('stacks one chosen column from each file into a single output column, in selection order', () => {
    const result = mergeColumns(
      [
        { data: [{ Phone: '0701234567' }, { Phone: '0709876543' }], column: 'Phone', sourceLabel: 'fileA.csv' },
        { data: [{ Mobile: '+41791112233' }], column: 'Mobile', sourceLabel: 'fileB.csv' },
      ],
      'Combined Phone'
    );

    expect(result).toEqual([
      { 'Combined Phone': '0701234567', 'Source File': 'fileA.csv' },
      { 'Combined Phone': '0709876543', 'Source File': 'fileA.csv' },
      { 'Combined Phone': '+41791112233', 'Source File': 'fileB.csv' },
    ]);
  });

  it('ignores every other column in the source rows — only the chosen column and the source label survive', () => {
    const result = mergeColumns(
      [{ data: [{ Name: 'Alice', Phone: '123', Email: 'a@x.com' }], column: 'Phone', sourceLabel: 'f.csv' }],
      'Out'
    );

    expect(result).toEqual([{ Out: '123', 'Source File': 'f.csv' }]);
  });

  it('returns an empty array when no files are selected', () => {
    expect(mergeColumns([], 'Out')).toEqual([]);
  });

  it('omits the Source File column when includeSourceColumn is false', () => {
    const result = mergeColumns(
      [{ data: [{ Phone: '123' }], column: 'Phone', sourceLabel: 'f.csv' }],
      'Out',
      false
    );

    expect(result).toEqual([{ Out: '123' }]);
    expect('Source File' in result[0]).toBe(false);
  });
});
