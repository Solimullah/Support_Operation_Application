import React, { useState, useEffect } from 'react';
import { UploadedFile, ExcelRow, CleaningAction, ExportFormat } from '@/types';
import { Button } from '@/components/ui/Button';
import { Trash2, Type, Scissors, Wand2, PlusSquare, MinusSquare, Download, ChevronDown, Plus, Play, X, ArrowRight, MoreVertical, FileSpreadsheet, Calculator, Save } from 'lucide-react';
import { downloadExcelFile } from '@/lib/excel';
import { ExportMenu } from '@/components/ui/ExportMenu';

interface CleaningPanelProps {
  files: UploadedFile[];
  onUpdateFile: (fileId: string, newData: ExcelRow[]) => void;
  incomingAction?: { fileId: string; action: CleaningAction } | null;
  onActionHandled?: () => void;
  onSaveAsFile?: (name: string, data: ExcelRow[]) => void;
}

interface ProcessedResult {
    id: string;
    name: string;
    data: ExcelRow[];
    columns: string[];
    timestamp: Date;
}

export const CleaningPanel: React.FC<CleaningPanelProps> = ({ files, onUpdateFile, incomingAction, onActionHandled, onSaveAsFile }) => {
  const [selectedFileId, setSelectedFileId] = useState<string>(files[0]?.id || '');
  const [selectedColumn, setSelectedColumn] = useState<string>('');

  // Queue State
  const [queue, setQueue] = useState<CleaningAction[]>([]);
  const [currentOpType, setCurrentOpType] = useState<CleaningAction['type']>('uppercase');
  const [opValue, setOpValue] = useState('');
  const [exportScope, setExportScope] = useState<'full' | 'column'>('full');
  
  // Processed Results State
  const [processedResults, setProcessedResults] = useState<ProcessedResult[]>([]);

  useEffect(() => {
    if (!files.find(f => f.id === selectedFileId) && files.length > 0) {
        setSelectedFileId(files[0].id);
    }
  }, [files, selectedFileId]);

  // Handle incoming action from bridge (e.g. Formula AI)
  useEffect(() => {
      if (incomingAction && onActionHandled) {
          // If the action is for a different file, switch to it
          if (incomingAction.fileId !== selectedFileId) {
              setSelectedFileId(incomingAction.fileId);
          }
          
          setQueue(prev => [...prev, incomingAction.action]);
          onActionHandled();
      }
  }, [incomingAction, onActionHandled, selectedFileId]);

  const activeFile = files.find(f => f.id === selectedFileId);

  useEffect(() => {
    if (activeFile && !activeFile.columns.includes(selectedColumn)) {
        setSelectedColumn(activeFile.columns[0] || '');
    }
  }, [activeFile, selectedColumn]);

  if (!activeFile) return <div className="text-center py-10 dark:text-gray-300">No files available.</div>;

  const processData = (data: ExcelRow[], actions: CleaningAction[]) => {
    let newData = [...data];
    for (const action of actions) {
        switch (action.type) {
            case 'remove_duplicates':
                const seen = new Set();
                newData = newData.filter(row => {
                const str = JSON.stringify(row);
                return seen.has(str) ? false : seen.add(str);
                });
                break;
            case 'remove_empty':
                newData = newData.filter(row => {
                return Object.values(row).some(val => val !== null && val !== '' && val !== undefined);
                });
                break;
            case 'uppercase':
                if (!action.column) break;
                newData = newData.map(row => ({
                ...row,
                [action.column!]: typeof row[action.column!] === 'string' 
                    ? (row[action.column!] as string).toUpperCase() 
                    : row[action.column!]
                }));
                break;
            case 'lowercase':
                if (!action.column) break;
                newData = newData.map(row => ({
                ...row,
                [action.column!]: typeof row[action.column!] === 'string' 
                    ? (row[action.column!] as string).toLowerCase() 
                    : row[action.column!]
                }));
                break;
            case 'trim':
                if (!action.column) break;
                newData = newData.map(row => ({
                    ...row,
                    [action.column!]: typeof row[action.column!] === 'string'
                        ? (row[action.column!] as string).trim()
                        : row[action.column!]
                }));
                break;
            case 'add_prefix':
                if (!action.column || !action.value) break;
                newData = newData.map(row => ({
                    ...row,
                    [action.column!]: `${action.value}${row[action.column!] || ''}`
                }));
                break;
            case 'remove_prefix':
                if (!action.column || !action.value) break;
                newData = newData.map(row => {
                    const val = String(row[action.column!] || '');
                    if (val.startsWith(action.value!)) {
                        return { ...row, [action.column!]: val.substring(action.value!.length) };
                    }
                    return row;
                });
                break;
            case 'apply_formula':
                if (!action.column || !action.value) break;
                // Add the formula as a string value to the new column for every row
                newData = newData.map(row => ({
                    ...row,
                    [action.column!]: action.value
                }));
                break;
        }
    }
    return newData;
  };

  const handleApplyQueue = () => {
      const newData = processData(activeFile.data, queue);
      onUpdateFile(activeFile.id, newData);
      setQueue([]);
  };

  const handleProcess = () => {
      const processedData = processData(activeFile.data, queue);
      
      let finalData = processedData;
      let fileNameSuffix = 'processed';

      if (exportScope === 'column' && selectedColumn) {
          finalData = processedData.map(row => ({
              [selectedColumn]: row[selectedColumn]
          }));
          fileNameSuffix = `${selectedColumn}_processed`;
      }

      const newResult: ProcessedResult = {
          id: crypto.randomUUID(),
          name: `${activeFile.name.replace(/\.[^/.]+$/, "")}_${fileNameSuffix}`,
          data: finalData,
          columns: finalData.length > 0 ? Object.keys(finalData[0]) : [],
          timestamp: new Date()
      };
      
      setProcessedResults(prev => [newResult, ...prev]);
  };

  const handleExtractColumn = (format: ExportFormat) => {
    if (!selectedColumn) return;
    const extractedData = activeFile.data.map(row => ({
        [selectedColumn]: row[selectedColumn]
    }));
    downloadExcelFile(extractedData, `${activeFile.name}_${selectedColumn}.${format}`, format);
  };

  const addToQueue = () => {
    setQueue(prev => [...prev, { type: currentOpType, column: selectedColumn, value: opValue }]);
    setOpValue(''); // Reset value
  };

  const removeFromQueue = (index: number) => {
      setQueue(prev => prev.filter((_, i) => i !== index));
  };



  // Immediate row operations
  const handleImmediateAction = (action: CleaningAction) => {
    const newData = processData(activeFile.data, [action]);
    onUpdateFile(activeFile.id, newData);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
       
      {/* File Selector */}
      <div className="mb-6 flex justify-between items-center bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
         <span className="font-semibold text-gray-700 dark:text-gray-300">Select File to Operate On:</span>
         <div className="relative w-64">
            <select
                value={selectedFileId}
                onChange={(e) => setSelectedFileId(e.target.value)}
                className="appearance-none w-full pl-4 pr-10 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
                {files.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700 dark:text-gray-300">
                <ChevronDown className="h-4 w-4" />
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Row Operations (Immediate) */}
        <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                    <Trash2 className="h-5 w-5 mr-2 text-indigo-600 dark:text-indigo-400" />
                    Row Operations
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-300 mb-4">Applied immediately to the file.</p>
                <div className="space-y-3">
                    <Button
                        variant="secondary"
                        className="w-full justify-start"
                        onClick={() => handleImmediateAction({ type: 'remove_duplicates' })}
                    >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove Exact Duplicates
                    </Button>
                    <Button
                        variant="secondary"
                        className="w-full justify-start"
                        onClick={() => handleImmediateAction({ type: 'remove_empty' })}
                    >
                    <EraserIcon className="h-4 w-4 mr-2" />
                    Remove Empty Rows
                    </Button>
                </div>
            </div>

            {/* Extraction */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                 <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                    <Download className="h-5 w-5 mr-2 text-indigo-600 dark:text-indigo-400" />
                    Extract Column
                </h3>
                <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Column</label>
                        <select
                            value={selectedColumn}
                            onChange={(e) => setSelectedColumn(e.target.value)}
                            className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        >
                            {activeFile.columns.map(col => <option key={col} value={col}>{col}</option>)}
                        </select>
                    </div>
                    <ExportMenu 
                         onExport={handleExtractColumn} 
                         label="Extract Column"
                         className="w-full"
                         variant="primary"
                    />
                </div>
            </div>
        </div>

        {/* Right: Transformation Pipeline (Queue) */}
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
                        <Type className="h-5 w-5 mr-2 text-indigo-600 dark:text-indigo-400" />
                        Transformation Pipeline
                    </h3>
                    <span className="text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 px-2 py-1 rounded-full font-medium">Batch Mode</span>
                </div>

                {/* Builder */}
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                        <div className="md:col-span-4">
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1 uppercase">Column</label>
                            <select
                                value={selectedColumn}
                                onChange={(e) => setSelectedColumn(e.target.value)}
                                className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                            >
                                {activeFile.columns.map(col => <option key={col} value={col}>{col}</option>)}
                            </select>
                        </div>
                        <div className="md:col-span-3">
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1 uppercase">Operation</label>
                            <select
                                value={currentOpType}
                                onChange={(e) => setCurrentOpType(e.target.value as CleaningAction['type'])}
                                className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                            >
                                <option value="uppercase">Uppercase</option>
                                <option value="lowercase">Lowercase</option>
                                <option value="trim">Trim Whitespace</option>
                                <option value="add_prefix">Add Prefix</option>
                                <option value="remove_prefix">Remove Prefix</option>
                            </select>
                        </div>
                        <div className="md:col-span-3">
                            {(currentOpType === 'add_prefix' || currentOpType === 'remove_prefix') && (
                                <>
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1 uppercase">Value</label>
                                    <input
                                        type="text"
                                        value={opValue}
                                        onChange={(e) => setOpValue(e.target.value)}
                                        placeholder="Prefix..."
                                        className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                                    />
                                </>
                            )}
                        </div>
                        <div className="md:col-span-2">
                            <Button
                                onClick={addToQueue}
                                disabled={(currentOpType === 'add_prefix' || currentOpType === 'remove_prefix') && !opValue}
                                size="sm"
                                className="w-full"
                            >
                                <Plus className="h-4 w-4 mr-1" /> Add
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Queue List */}
                <div className="flex-1 min-h-[150px] border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6 relative bg-gray-50/50 dark:bg-gray-800/50">
                    {queue.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
                            No operations queued. Add operations above.
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {queue.map((action, idx) => (
                                <li key={idx} className="flex items-center justify-between bg-white dark:bg-gray-900 p-3 rounded shadow-sm border border-gray-100 dark:border-gray-700">
                                    <div className="flex items-center space-x-3">
                                        <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                                            {idx + 1}
                                        </span>
                                        <div className="text-sm">
                                            {action.type === 'apply_formula' ? (
                                                 <>
                                                    <span className="font-semibold text-gray-800 dark:text-gray-200 flex items-center">
                                                        <Calculator className="h-3 w-3 mr-1" /> FORMULA
                                                    </span>
                                                    <span className="text-gray-500 dark:text-gray-300 mx-1">into</span>
                                                    <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded text-purple-600 dark:text-purple-400">
                                                        {action.column}
                                                    </span>
                                                    <span className="text-gray-500 dark:text-gray-300 mx-1">=</span>
                                                    <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded text-gray-600 dark:text-gray-300 text-xs">
                                                        {action.value}
                                                    </span>
                                                 </>
                                            ) : (
                                                <>
                                                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                                                        {action.type.replace('_', ' ').toUpperCase()}
                                                    </span>
                                                    <span className="text-gray-500 dark:text-gray-300 mx-1">on</span>
                                                    <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded text-gray-700 dark:text-gray-300">
                                                        {action.column}
                                                    </span>
                                                    {action.value && (
                                                        <>
                                                            <span className="text-gray-500 dark:text-gray-300 mx-1">with value</span>
                                                            <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded text-blue-600 dark:text-blue-400">"{action.value}"</span>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={() => removeFromQueue(idx)} className="text-gray-400 hover:text-red-500 transition-colors">
                                        <X className="h-4 w-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Actions */}
                <div className="flex flex-col xl:flex-row justify-between items-center pt-4 border-t border-gray-100 dark:border-gray-800 gap-4">
                    <div className="flex items-center space-x-4 bg-gray-50 dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700 w-full xl:w-auto">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">Output Scope:</span>
                        <label className="flex items-center space-x-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                            <input
                                type="radio"
                                name="exportScope"
                                checked={exportScope === 'full'}
                                onChange={() => setExportScope('full')}
                                className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Full File</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                            <input
                                type="radio"
                                name="exportScope"
                                checked={exportScope === 'column'}
                                onChange={() => setExportScope('column')}
                                className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Target Column</span>
                        </label>
                    </div>

                    <div className="flex gap-2 w-full xl:w-auto justify-end">
                        <Button variant="secondary" onClick={() => setQueue([])} disabled={queue.length === 0}>
                            Clear
                        </Button>
                        <Button variant="primary" onClick={handleProcess} disabled={queue.length === 0}>
                            Process File
                        </Button>
                    </div>
                </div>
            </div>
            
            {/* Processed Results List */}
            {processedResults.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                    <div className="flex items-center justify-between mb-4">
                         <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Processed Outputs</h3>
                         <Button variant="ghost" size="sm" onClick={() => setProcessedResults([])}>Clear All</Button>
                    </div>

                    <div className="space-y-3">
                        {processedResults.map(result => (
                            <div key={result.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-500/40 transition-colors">
                                <div className="flex items-center space-x-3">
                                    <div className="bg-green-100 dark:bg-green-500/10 p-2 rounded text-green-700 dark:text-green-400">
                                         <FileSpreadsheet className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{result.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-300">
                                            {result.data.length} rows • {result.columns.length} columns • {result.timestamp.toLocaleTimeString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    {onSaveAsFile && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => onSaveAsFile(result.name, result.data)}
                                            title="Make this result available as a file in File Manager, Compare, Merge/Split, etc."
                                        >
                                            <Save className="h-4 w-4 mr-1" />
                                            Save to File Manager
                                        </Button>
                                    )}
                                    <ExportMenu
                                        trigger={
                                            <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 dark:text-gray-300">
                                                <MoreVertical className="h-5 w-5" />
                                            </button>
                                        }
                                        onExport={(format) => downloadExcelFile(result.data, result.name, format)}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </div>

      </div>
  );
};

const EraserIcon = ({ className }: { className?: string }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
);
