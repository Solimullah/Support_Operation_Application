import React, { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';
import { Hash, UploadCloud, AlertTriangle, XCircle } from 'lucide-react';
import { countAll, CountOutcome } from '@/features/entry-counter/lib/countEntries';

const ACCEPTED = '.zip,.csv,.txt,.xlsx,.xls';

const statusStyles: Record<CountOutcome['status'], string> = {
  ok: 'text-indigo-600 dark:text-indigo-400',
  unsupported: 'text-amber-600 dark:text-amber-500',
  error: 'text-red-600 dark:text-red-500',
};

export const EntryCounterPanel: React.FC = () => {
  const [results, setResults] = useState<CountOutcome[]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const grandTotal = useMemo(
    () => results.filter(r => r.status === 'ok').reduce((sum, r) => sum + r.count, 0),
    [results]
  );

  const handleFiles = async (files: File[]) => {
    if (files.length === 0 || isProcessing) return;

    // Each new batch replaces the previous results, matching the original tool.
    setResults([]);
    setIsProcessing(true);
    try {
      for await (const outcome of countAll(files, { hasHeader })) {
        setResults(prev => [...prev, outcome]);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void handleFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isProcessing) return;
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    if (isProcessing || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    void handleFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-8">
        <div className="flex items-center mb-6 text-gray-900 dark:text-gray-100">
          <Hash className="h-6 w-6 text-indigo-600 dark:text-indigo-400 mr-2" />
          <h2 className="text-2xl font-bold">Entry Counter</h2>
        </div>

        <label className="flex items-center gap-2 mb-4 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={hasHeader}
            onChange={e => setHasHeader(e.target.checked)}
            disabled={isProcessing}
            className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500"
          />
          Files have a header row (CSV / TXT only — Excel sheets always count this way)
        </label>

        <div
          className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer ${
            isDragging
              ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10'
              : 'border-gray-300 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-600'
          }`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <label className={`inline-flex flex-col items-center ${isProcessing ? 'cursor-wait' : 'cursor-pointer'}`}>
            <UploadCloud className="h-8 w-8 text-indigo-500 mb-2" />
            <span className="text-gray-700 dark:text-gray-300">
              {isProcessing ? 'Counting…' : 'Drop files here or click to browse'}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              .zip, .csv, .txt, .xlsx, .xls — zip archives are unpacked automatically, including nested zips
            </span>
            <input
              type="file"
              multiple
              accept={ACCEPTED}
              className="hidden"
              onChange={handleFileChange}
              disabled={isProcessing}
            />
          </label>
        </div>
      </div>

      <div className="bg-indigo-600 dark:bg-indigo-700 rounded-lg p-6 text-center shadow-sm">
        <h3 className="text-sm uppercase tracking-widest text-white/80">Total Combined Entries</h3>
        <p className="text-6xl font-black text-white">{grandTotal.toLocaleString()}</p>
      </div>

      {results.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-gray-100">File Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    File Name
                  </th>
                  <th className="p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Entries (Excl. Header)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {results.map((r, idx) => (
                  <tr key={`${r.name}-${idx}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="p-4 truncate max-w-xs text-gray-900 dark:text-gray-100">
                      <div className="flex items-center gap-2">
                        {r.status === 'unsupported' && (
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        )}
                        {r.status === 'error' && <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                        <span title={r.message}>{r.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-gray-500 dark:text-gray-400">{r.type}</td>
                    <td className={`p-4 text-right font-mono ${statusStyles[r.status]}`}>
                      {r.status === 'ok' ? r.count.toLocaleString() : r.message || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
