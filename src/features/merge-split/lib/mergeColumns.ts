import { ExcelRow } from '@/types';

export interface ColumnMergeSelection {
  data: ExcelRow[];
  column: string;
  sourceLabel: string;
}

// Stacks one chosen column from each selected file into a single output
// column — e.g. pulling "Phone" from one file and "Mobile" from another into
// one combined list — rather than the existing whole-file merge, which
// unions every column and keeps every row's full shape. A `Source File`
// column can optionally be added so a value's origin isn't lost once
// stacked; defaults to on since that's the more common/traceable case.
export const mergeColumns = (
  selections: ColumnMergeSelection[],
  outputColumnName: string,
  includeSourceColumn: boolean = true
): ExcelRow[] => {
  const rows: ExcelRow[] = [];
  selections.forEach(({ data, column, sourceLabel }) => {
    data.forEach(row => {
      const outRow: ExcelRow = { [outputColumnName]: row[column] };
      if (includeSourceColumn) {
        outRow['Source File'] = sourceLabel;
      }
      rows.push(outRow);
    });
  });
  return rows;
};
