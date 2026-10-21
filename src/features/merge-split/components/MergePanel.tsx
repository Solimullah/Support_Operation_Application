import React, { useState } from 'react';
import { UploadedFile, ExcelRow, ExportFormat } from '@/types';
import { Button } from '@/components/ui/Button';
import { Combine, CheckSquare, Square, FileSpreadsheet, MoreVertical, Layers, ArrowDown, TableProperties, SplitSquareHorizontal, Columns3, Save } from 'lucide-react';
import { downloadExcelFile } from '@/lib/excel';
import { ExportMenu } from '@/components/ui/ExportMenu';
import {
  guardSplitResultCount,
  splitByColumnValue,
  splitByPercentageColumns,
  splitByPercentageRows,
  splitByRowCount,
  splitBySize,
} from '@/features/merge-split/lib/splitFile';
import { mergeColumns } from '@/features/merge-split/lib/mergeColumns';

interface MergePanelProps {
  files: UploadedFile[];
  onSaveAsFile?: (name: string, data: ExcelRow[]) => void;
}

interface ProcessedFile {
    id: string;
    name: string;
    data: ExcelRow[];
    columns: string[];
    fileCount: number;
    timestamp: Date;
    type: 'merge' | 'split';
}


export const MergePanel: React.FC<MergePanelProps> = ({ files, onSaveAsFile }) => {
  const [mode, setMode] = useState<'merge' | 'split'>('merge');
  
  // Merge state
  const [selectedMergeFileIds, setSelectedMergeFileIds] = useState<Set<string>>(new Set());
  const [mergeTarget, setMergeTarget] = useState<'rows' | 'column'>('rows');
  const [columnMergeSelections, setColumnMergeSelections] = useState<Record<string, string>>({});
  const [mergeOutputColumnName, setMergeOutputColumnName] = useState<string>('Merged Column');
  const [mergeIncludeSourceColumn, setMergeIncludeSourceColumn] = useState<boolean>(true);
  const [mergeExportFileFormat, setMergeExportFileFormat] = useState<ExportFormat>('xlsx');

  // Split state
  const [selectedSplitFileId, setSelectedSplitFileId] = useState<string>(files[0]?.id || '');
  const [splitMethod, setSplitMethod] = useState<'column' | 'row' | 'percentage' | 'size'>('column');
  const [splitColumn, setSplitColumn] = useState<string>('');
  const [rowsPerFile, setRowsPerFile] = useState<number>(100);
  const [splitPercentage, setSplitPercentage] = useState<number>(50);
  const [splitPercentageTarget, setSplitPercentageTarget] = useState<'rows' | 'columns'>('rows');
  const [maxSizeMB, setMaxSizeMB] = useState<number>(4);
  const [emailMode, setEmailMode] = useState<boolean>(false);
  const [sizeSplitStats, setSizeSplitStats] = useState<{ invalidEmails: number; duplicateEmails: number } | null>(null);

  const [results, setResults] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  React.useEffect(() => {
    if (!files.find(f => f.id === selectedSplitFileId) && files.length > 0) {
        setSelectedSplitFileId(files[0].id);
    }
  }, [files, selectedSplitFileId]);

  const activeSplitFile = files.find(f => f.id === selectedSplitFileId);

  React.useEffect(() => {
    if (activeSplitFile && activeSplitFile.columns.length > 0 && !activeSplitFile.columns.includes(splitColumn)) {
        setSplitColumn(activeSplitFile.columns[0]);
    }
  }, [activeSplitFile, splitColumn]);

  const toggleMergeFile = (id: string) => {
    const next = new Set(selectedMergeFileIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedMergeFileIds(next);
  };

  const handleMerge = () => {
    if (selectedMergeFileIds.size < 2) return;
    setIsProcessing(true);

    const selectedFiles = files.filter(f => selectedMergeFileIds.has(f.id));
    
    const allUniqueColumns = new Set<string>();
    selectedFiles.forEach(file => {
        file.columns.forEach(col => {
            if (col && col.trim() !== "") {
                allUniqueColumns.add(col);
            }
        });
    });

    const masterHeaders = Array.from(allUniqueColumns);

    let combinedNormalizedData: ExcelRow[] = [];

    selectedFiles.forEach(file => {
        const normalizedFileRows = file.data.map(row => {
            const normalizedRow: ExcelRow = {};
            masterHeaders.forEach(header => {
                normalizedRow[header] = row[header] !== undefined && row[header] !== null ? row[header] : "";
            });
            return normalizedRow;
        });
        combinedNormalizedData = [...combinedNormalizedData, ...normalizedFileRows];
    });

    const result: ProcessedFile = {
        id: crypto.randomUUID(),
        name: `Merged_${selectedFiles.length}_Files_${new Date().toLocaleDateString().replace(/\//g, '-')}`,
        data: combinedNormalizedData,
        columns: masterHeaders,
        fileCount: selectedFiles.length,
        timestamp: new Date(),
        type: 'merge'
    };

    setResults(prev => [result, ...prev]);
    setIsProcessing(false);
    setSelectedMergeFileIds(new Set());
  };

  // Unlike handleMerge (which unions every column and keeps full rows, then
  // lands in Generations History for later download in any format), this
  // downloads immediately in the format chosen up front — mirroring the
  // Compare panel's possible-match review export, which the user explicitly
  // asked to match.
  const buildMergedColumnResult = (): { data: ExcelRow[]; fileName: string } | null => {
    const selectedFiles = files.filter(f => selectedMergeFileIds.has(f.id));
    if (selectedFiles.length < 2) return null;

    const outputName = mergeOutputColumnName.trim() || 'Merged Column';
    const selections = selectedFiles.map(f => ({
        data: f.data,
        column: columnMergeSelections[f.id] || f.columns[0],
        sourceLabel: f.name,
    }));

    const data = mergeColumns(selections, outputName, mergeIncludeSourceColumn);
    const fileName = `Merged_Column_${selectedFiles.length}_Files_${new Date().toLocaleDateString().replace(/\//g, '-')}`;
    return { data, fileName };
  };

  const handleMergeColumns = () => {
    const result = buildMergedColumnResult();
    if (!result) return;
    downloadExcelFile(result.data, result.fileName, mergeExportFileFormat);
  };

  const handleSaveMergedColumn = () => {
    const result = buildMergedColumnResult();
    if (!result || !onSaveAsFile) return;
    onSaveAsFile(result.fileName, result.data);
  };

  const handleSplit = () => {
    if (!activeSplitFile) return;
    setIsProcessing(true);
    setSizeSplitStats(null);

    const baseName = activeSplitFile.name.substring(0, activeSplitFile.name.lastIndexOf('.')) || activeSplitFile.name;

    if (splitMethod === 'column') {
        if (!splitColumn) {
            setIsProcessing(false);
            return;
        }

        const groups = splitByColumnValue(activeSplitFile.data, splitColumn);
        const groupEntries = Object.entries(groups);

        if (!guardSplitResultCount(groupEntries.length)) {
            setIsProcessing(false);
            return;
        }

        const newResults: ProcessedFile[] = groupEntries.map(([val, groupData]) => ({
            id: crypto.randomUUID(),
            name: `${baseName}_split_${val}`,
            data: groupData,
            columns: activeSplitFile.columns,
            fileCount: 1,
            timestamp: new Date(),
            type: 'split'
        }));

        setResults(prev => [...newResults, ...prev]);
    } else if (splitMethod === 'row') {
        if (rowsPerFile <= 0) {
            setIsProcessing(false);
            return;
        }

        const chunks = splitByRowCount(activeSplitFile.data, rowsPerFile);

        if (!guardSplitResultCount(chunks.length)) {
            setIsProcessing(false);
            return;
        }

        const newResults: ProcessedFile[] = chunks.map((chunkData, index) => ({
            id: crypto.randomUUID(),
            name: `${baseName}_part_${index + 1}`,
            data: chunkData,
            columns: activeSplitFile.columns,
            fileCount: 1,
            timestamp: new Date(),
            type: 'split'
        }));
        setResults(prev => [...newResults, ...prev]);
    } else if (splitMethod === 'percentage') {
        const pct = Math.min(Math.max(splitPercentage, 1), 99);

        if (splitPercentageTarget === 'rows') {
            const [part1, part2] = splitByPercentageRows(activeSplitFile.data, pct);

            const result1: ProcessedFile = {
                id: crypto.randomUUID(),
                name: `${baseName}_part1_${pct}pct_rows`,
                data: part1,
                columns: activeSplitFile.columns,
                fileCount: 1,
                timestamp: new Date(),
                type: 'split'
            };
            const result2: ProcessedFile = {
                id: crypto.randomUUID(),
                name: `${baseName}_part2_${100 - pct}pct_rows`,
                data: part2,
                columns: activeSplitFile.columns,
                fileCount: 1,
                timestamp: new Date(),
                type: 'split'
            };
            setResults(prev => [result1, result2, ...prev]);

        } else if (splitPercentageTarget === 'columns') {
            const { columns1, columns2, data1, data2 } = splitByPercentageColumns(activeSplitFile.data, activeSplitFile.columns, pct);

            const result1: ProcessedFile = {
                id: crypto.randomUUID(),
                name: `${baseName}_part1_${pct}pct_cols`,
                data: data1,
                columns: columns1,
                fileCount: 1,
                timestamp: new Date(),
                type: 'split'
            };
            const result2: ProcessedFile = {
                id: crypto.randomUUID(),
                name: `${baseName}_part2_${100 - pct}pct_cols`,
                data: data2,
                columns: columns2,
                fileCount: 1,
                timestamp: new Date(),
                type: 'split'
            };
            setResults(prev => [result1, result2, ...prev]);
        }
    } else if (splitMethod === 'size') {
        if (maxSizeMB <= 0) {
            setIsProcessing(false);
            return;
        }

        const { chunks, columns: outColumns, invalidEmails, duplicateEmails } = splitBySize(
            activeSplitFile.data,
            activeSplitFile.columns,
            { maxSizeMB, emailMode }
        );

        if (!guardSplitResultCount(chunks.length)) {
            setIsProcessing(false);
            return;
        }

        setSizeSplitStats({ invalidEmails, duplicateEmails });

        const newResults: ProcessedFile[] = chunks.map((chunkData, index) => ({
            id: crypto.randomUUID(),
            name: `${baseName}_part_${index + 1}`,
            data: chunkData,
            columns: outColumns,
            fileCount: 1,
            timestamp: new Date(),
            type: 'split'
        }));
        setResults(prev => [...newResults, ...prev]);
    }

    setIsProcessing(false);
  };

  if (files.length === 0) {
    return (
      <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 max-w-2xl mx-auto">
        <Combine className="h-12 w-12 text-indigo-400 dark:text-indigo-400/70 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Merge & Split Workspace</h3>
        <p className="text-gray-500 dark:text-gray-300 mt-2 px-6">
          Upload files in the File Manager to use the merge or split features.
        </p>
      </div>
    );
  }

  // Calculate union of headers for the current selection to show preview
  const currentSelectionHeaders = new Set<string>();
  files.filter(f => selectedMergeFileIds.has(f.id)).forEach(f => f.columns.forEach(c => currentSelectionHeaders.add(c)));

  return (
    <div className="max-w-6xl mx-auto space-y-8">
        
      {/* Mode Toggle */}
      <div className="flex justify-center mb-8">
          <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl inline-flex shadow-inner">
              <button
                  onClick={() => setMode('merge')}
                  className={`flex items-center px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      mode === 'merge' ? 'bg-white dark:bg-gray-900 text-indigo-700 dark:text-indigo-400 shadow-sm' : 'text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
              >
                  <Combine className="h-4 w-4 mr-2" />
                  Merge Multiple Files
              </button>
              <button
                  onClick={() => setMode('split')}
                  className={`flex items-center px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      mode === 'split' ? 'bg-white dark:bg-gray-900 text-indigo-700 dark:text-indigo-400 shadow-sm' : 'text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
              >
                  <SplitSquareHorizontal className="h-4 w-4 mr-2" />
                  Split a File
              </button>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Selection Area */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 flex flex-col">

            {mode === 'merge' ? (
                // MERGE UI
                <>
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
                            <Layers className="h-5 w-5 mr-2 text-indigo-600 dark:text-indigo-400" />
                            Select Files to Combine
                        </h3>
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded">
                            {selectedMergeFileIds.size} Selected
                        </span>
                    </div>

                    <div className="flex items-center space-x-4 mb-4 text-sm">
                        <label className="flex items-center space-x-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                            <input type="radio" checked={mergeTarget === 'rows'} onChange={() => setMergeTarget('rows')} />
                            <span>Merge Entire Files</span>
                        </label>
                        <label className="flex items-center space-x-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                            <input type="radio" checked={mergeTarget === 'column'} onChange={() => setMergeTarget('column')} />
                            <span>Merge One Column</span>
                        </label>
                    </div>
                    {mergeTarget === 'column' && (
                        <p className="text-xs text-gray-500 dark:text-gray-300 mb-4">
                            Pick one column from each file below — they don't need the same name — and stack their values into a single combined column.
                        </p>
                    )}

                    <div className="space-y-2 max-h-[350px] overflow-y-auto mb-6 pr-2 custom-scrollbar flex-1">
                        {files.map(file => {
                            const isSelected = selectedMergeFileIds.has(file.id);
                            return (
                                <div
                                    key={file.id}
                                    onClick={() => toggleMergeFile(file.id)}
                                    className={`flex items-center p-4 rounded-lg border cursor-pointer transition-all ${
                                        isSelected
                                        ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 ring-1 ring-indigo-200 dark:ring-indigo-500/30'
                                        : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                    }`}
                                >
                                    <div className="mr-4">
                                        {isSelected ? (
                                            <CheckSquare className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                        ) : (
                                            <Square className="h-5 w-5 text-gray-300 dark:text-gray-600" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-900 dark:text-indigo-300' : 'text-gray-900 dark:text-gray-100'}`}>
                                            {file.name}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-300">
                                            {file.data.length} rows • {file.columns.length} headers
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {mergeTarget === 'rows' ? (
                        <>
                            {selectedMergeFileIds.size > 0 && (
                                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <h4 className="text-xs font-bold text-gray-500 dark:text-gray-300 uppercase mb-2 flex items-center">
                                        <TableProperties className="h-3 w-3 mr-1" />
                                        Detected Merge Schema ({currentSelectionHeaders.size} columns)
                                    </h4>
                                    <div className="flex flex-wrap gap-1">
                                        {Array.from(currentSelectionHeaders).slice(0, 10).map(header => (
                                            <span key={header} className="text-[10px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                                                {header}
                                            </span>
                                        ))}
                                        {currentSelectionHeaders.size > 10 && (
                                            <span className="text-[10px] text-gray-400 dark:text-gray-500 py-0.5">+{currentSelectionHeaders.size - 10} more...</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            <Button
                                onClick={handleMerge}
                                disabled={selectedMergeFileIds.size < 2 || isProcessing}
                                className="w-full py-4 rounded-xl shadow-md"
                                isLoading={isProcessing && mode === 'merge'}
                            >
                                <Combine className="h-5 w-5 mr-2" />
                                Merge {selectedMergeFileIds.size} Files
                            </Button>
                        </>
                    ) : (
                        <>
                            {selectedMergeFileIds.size > 0 && (
                                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
                                    <h4 className="text-xs font-bold text-gray-500 dark:text-gray-300 uppercase mb-1 flex items-center">
                                        <Columns3 className="h-3 w-3 mr-1" />
                                        Column per file
                                    </h4>
                                    {files.filter(f => selectedMergeFileIds.has(f.id)).map(f => (
                                        <div key={f.id} className="flex items-center gap-3">
                                            <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1" title={f.name}>{f.name}</span>
                                            <select
                                                value={columnMergeSelections[f.id] || f.columns[0] || ''}
                                                onChange={(e) => setColumnMergeSelections(prev => ({ ...prev, [f.id]: e.target.value }))}
                                                className="flex-1 p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                            >
                                                {f.columns.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Output column name</label>
                                <input
                                    type="text"
                                    value={mergeOutputColumnName}
                                    onChange={(e) => setMergeOutputColumnName(e.target.value)}
                                    placeholder="Merged Column"
                                    className="block w-full rounded-md border-gray-300 dark:border-gray-700 border p-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                />
                            </div>

                            <div className="mb-4 flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="merge-include-source-column"
                                    checked={mergeIncludeSourceColumn}
                                    onChange={(e) => setMergeIncludeSourceColumn(e.target.checked)}
                                    className="rounded border-gray-300 dark:border-gray-700"
                                />
                                <label htmlFor="merge-include-source-column" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                    Add a "Source File" column showing which file each value came from
                                </label>
                            </div>

                            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">File Format</span>
                                <div className="flex flex-wrap items-center gap-4">
                                    <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                        <input type="radio" checked={mergeExportFileFormat === 'xlsx'} onChange={() => setMergeExportFileFormat('xlsx')} />
                                        <span>Excel (.xlsx)</span>
                                    </label>
                                    <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                        <input type="radio" checked={mergeExportFileFormat === 'csv'} onChange={() => setMergeExportFileFormat('csv')} />
                                        <span>CSV (.csv)</span>
                                    </label>
                                    <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                        <input type="radio" checked={mergeExportFileFormat === 'txt'} onChange={() => setMergeExportFileFormat('txt')} />
                                        <span>Text, tab-delimited (.txt)</span>
                                    </label>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <Button
                                    onClick={handleMergeColumns}
                                    disabled={selectedMergeFileIds.size < 2}
                                    className="flex-1 py-4 rounded-xl shadow-md"
                                >
                                    <Columns3 className="h-5 w-5 mr-2" />
                                    Merge Column from {selectedMergeFileIds.size} Files
                                </Button>
                                {onSaveAsFile && (
                                    <Button
                                        variant="secondary"
                                        onClick={handleSaveMergedColumn}
                                        disabled={selectedMergeFileIds.size < 2}
                                        className="py-4 rounded-xl"
                                        title="Make this merged column available as a file in File Manager, Compare, etc."
                                    >
                                        <Save className="h-5 w-5" />
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </>
            ) : (
                // SPLIT UI
                <>
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
                            <SplitSquareHorizontal className="h-5 w-5 mr-2 text-indigo-600 dark:text-indigo-400" />
                            Split Dataset
                        </h3>
                    </div>

                    <div className="space-y-6 flex-1">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">1. Select File to Split</label>
                            <select
                                value={selectedSplitFileId}
                                onChange={(e) => setSelectedSplitFileId(e.target.value)}
                                className="block w-full rounded-md border-gray-300 dark:border-gray-700 border p-3 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            >
                                {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                        </div>

                        {activeSplitFile && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">2. Split Method</label>
                                    <div className="flex items-center space-x-4">
                                        <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={splitMethod === 'column'}
                                                onChange={() => setSplitMethod('column')}
                                            />
                                            <span>By Unique Column Value</span>
                                        </label>
                                        <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={splitMethod === 'row'}
                                                onChange={() => setSplitMethod('row')}
                                            />
                                            <span>By Row Count</span>
                                        </label>
                                        <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={splitMethod === 'percentage'}
                                                onChange={() => setSplitMethod('percentage')}
                                            />
                                            <span>By Percentage</span>
                                        </label>
                                        <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={splitMethod === 'size'}
                                                onChange={() => setSplitMethod('size')}
                                            />
                                            <span>By Max File Size</span>
                                        </label>
                                    </div>
                                </div>

                                {splitMethod === 'column' ? (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">3. Target Column to Split By</label>
                                        <p className="text-xs text-gray-500 dark:text-gray-300 mb-2">The file will be separated into new files for every unique value found in this column.</p>
                                        <select
                                            value={splitColumn}
                                            onChange={(e) => setSplitColumn(e.target.value)}
                                            className="block w-full rounded-md border-gray-300 dark:border-gray-700 border p-3 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                        >
                                            {activeSplitFile.columns.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                ) : splitMethod === 'percentage' ? (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">3. Split Target</label>
                                            <div className="flex items-center space-x-4">
                                                <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        checked={splitPercentageTarget === 'rows'}
                                                        onChange={() => setSplitPercentageTarget('rows')}
                                                    />
                                                    <span>Rows</span>
                                                </label>
                                                <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        checked={splitPercentageTarget === 'columns'}
                                                        onChange={() => setSplitPercentageTarget('columns')}
                                                    />
                                                    <span>Columns</span>
                                                </label>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">4. Percentage for first file (1-99)</label>
                                            <p className="text-xs text-gray-500 dark:text-gray-300 mb-2">The dataset will be split into two files based on this percentage (e.g., {splitPercentage}% and {100 - splitPercentage}%).</p>
                                            <input
                                                type="number"
                                                value={splitPercentage}
                                                min={1}
                                                max={99}
                                                onChange={(e) => setSplitPercentage(parseInt(e.target.value) || 50)}
                                                className="block w-full rounded-md border-gray-300 dark:border-gray-700 border p-3 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                            />
                                            <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg border border-indigo-100 dark:border-indigo-500/20 flex flex-col shadow-inner">
                                                <span className="text-indigo-800 dark:text-indigo-300 text-sm mb-1">
                                                    <strong>File 1:</strong> {splitPercentage}%
                                                    ({splitPercentageTarget === 'rows'
                                                        ? Math.floor(activeSplitFile.data.length * (splitPercentage / 100)) + ' rows'
                                                        : Math.floor(activeSplitFile.columns.length * (splitPercentage / 100)) + ' columns'})
                                                </span>
                                                <span className="text-indigo-800 dark:text-indigo-300 text-sm">
                                                    <strong>File 2:</strong> {100 - splitPercentage}%
                                                    ({splitPercentageTarget === 'rows'
                                                        ? activeSplitFile.data.length - Math.floor(activeSplitFile.data.length * (splitPercentage / 100)) + ' rows'
                                                        : activeSplitFile.columns.length - Math.floor(activeSplitFile.columns.length * (splitPercentage / 100)) + ' columns'})
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : splitMethod === 'row' ? (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">3. Maximum Rows per File</label>
                                        <p className="text-xs text-gray-500 dark:text-gray-300 mb-2">The file will be chunked into parts containing up to this number of rows.</p>
                                        <input
                                            type="number"
                                            value={rowsPerFile}
                                            min={1}
                                            onChange={(e) => setRowsPerFile(parseInt(e.target.value) || 1)}
                                            className="block w-full rounded-md border-gray-300 dark:border-gray-700 border p-3 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                        />
                                        {rowsPerFile > 0 && activeSplitFile.data.length > 0 && (
                                            <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg border border-indigo-100 dark:border-indigo-500/20 flex items-center shadow-inner">
                                                <span className="text-indigo-800 dark:text-indigo-300 text-sm">
                                                    This will generate <strong>{Math.ceil(activeSplitFile.data.length / rowsPerFile)}</strong> new file(s) from {activeSplitFile.data.length} total rows.
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">3. Maximum Size per File (MB)</label>
                                            <p className="text-xs text-gray-500 dark:text-gray-300 mb-2">
                                                The file will be chunked so each part stays under this size, estimated from CSV-serialized byte size
                                                (an approximation — actual Excel export size can differ slightly).
                                            </p>
                                            <input
                                                type="number"
                                                value={maxSizeMB}
                                                min={1}
                                                max={100}
                                                step={0.5}
                                                onChange={(e) => setMaxSizeMB(parseFloat(e.target.value) || 4)}
                                                className="block w-full rounded-md border-gray-300 dark:border-gray-700 border p-3 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                            />
                                        </div>

                                        <label className="flex items-start space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={emailMode}
                                                onChange={(e) => setEmailMode(e.target.checked)}
                                                className="mt-0.5 rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span>
                                                Email List Mode — keep only the first column ({activeSplitFile.columns[0] || 'first column'}),
                                                validate each value as an email address, and remove duplicates (case-insensitive).
                                            </span>
                                        </label>

                                        {sizeSplitStats && (
                                            <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg border border-indigo-100 dark:border-indigo-500/20 text-sm text-indigo-800 dark:text-indigo-300 shadow-inner">
                                                {emailMode
                                                    ? `Last run: ${sizeSplitStats.invalidEmails} invalid and ${sizeSplitStats.duplicateEmails} duplicate email(s) removed before splitting.`
                                                    : 'Last run complete.'}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        <div className="p-4 bg-blue-50 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300 rounded-lg border border-blue-100 dark:border-blue-500/20 text-xs shadow-inner mt-auto">
                            <strong>Tip:</strong> Splitting a large dataset automatically creates separate files that retain your original column headers. This is great for slicing regional reports or handling large batches!
                        </div>
                    </div>

                    <Button
                        onClick={handleSplit}
                        variant="primary"
                        disabled={!activeSplitFile || (splitMethod === 'column' && !splitColumn) || (splitMethod === 'row' && rowsPerFile <= 0) || (splitMethod === 'percentage' && (splitPercentage < 1 || splitPercentage > 99)) || (splitMethod === 'size' && maxSizeMB <= 0) || isProcessing}
                        className="w-full py-4 rounded-xl shadow-md mt-6"
                        isLoading={isProcessing && mode === 'split'}
                    >
                        <SplitSquareHorizontal className="h-5 w-5 mr-2" />
                        Split Dataset Now
                    </Button>
                </>
            )}
        </div>

        {/* Results Staging Area */}
        <div className="space-y-4 flex flex-col h-full">
            <div className="flex items-center justify-between px-2">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
                    <ArrowDown className="h-5 w-5 mr-2 text-green-600 dark:text-green-400" />
                    Generations History
                </h3>
                {results.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setResults([])} className="text-gray-400 hover:text-red-500 h-8">
                        Clear Area
                    </Button>
                )}
            </div>

            <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-4 overflow-y-auto max-h-[600px] custom-scrollbar">
                {results.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 p-8 text-center min-h-[300px]">
                        <Combine className="h-10 w-10 mb-2 opacity-20" />
                        <p className="text-sm">Processed files will appear here.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {results.map(result => (
                            <div key={result.id} className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-colors animate-fade-in relative group">
                                <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${result.type === 'merge' ? 'bg-indigo-500' : 'bg-pink-500'}`}></div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3 pl-2 max-w-[85%]">
                                        <div className={`p-2 rounded-lg ${result.type === 'merge' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400' : 'bg-pink-100 text-pink-700 dark:bg-pink-500/10 dark:text-pink-400'}`}>
                                            {result.type === 'merge' ? <Combine className="h-5 w-5" /> : <SplitSquareHorizontal className="h-5 w-5" />}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate" title={result.name}>
                                                {result.name}
                                            </h4>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                {result.type === 'merge' ? (
                                                    <span className="text-[10px] bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter border border-indigo-100 dark:border-indigo-500/20 whitespace-nowrap">
                                                        {result.fileCount} Merged
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter border border-pink-100 dark:border-pink-500/20 whitespace-nowrap">
                                                        Split Segment
                                                    </span>
                                                )}
                                                <span className="text-xs text-gray-500 dark:text-gray-300 whitespace-nowrap">
                                                    {result.data.length} rows
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {onSaveAsFile && (
                                            <button
                                                onClick={() => onSaveAsFile(result.name, result.data)}
                                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-500 dark:text-gray-300"
                                                title="Make this result available as a file in File Manager, Compare, etc."
                                            >
                                                <Save className="h-5 w-5" />
                                            </button>
                                        )}
                                        <ExportMenu
                                            trigger={
                                                <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-500 dark:text-gray-300">
                                                    <MoreVertical className="h-5 w-5" />
                                                </button>
                                            }
                                            onExport={(format) => downloadExcelFile(result.data, result.name, format)}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};