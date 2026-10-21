import React, { useState, useEffect } from 'react';
import { UploadedFile, ExportFormat } from '@/types';
import { ChevronDown } from 'lucide-react';
import { ExportMenu } from '@/components/ui/ExportMenu';

interface DataViewProps {
  files: UploadedFile[];
  onDownload: (fileId: string, format: ExportFormat) => void;
}

export const DataView: React.FC<DataViewProps> = ({ files, onDownload }) => {
  const [selectedFileId, setSelectedFileId] = useState<string>(files[0]?.id || '');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!files.find(f => f.id === selectedFileId) && files.length > 0) {
        setSelectedFileId(files[0].id);
    }
  }, [files, selectedFileId]);

  useEffect(() => {
    setSearch('');
  }, [selectedFileId]);

  const activeFile = files.find(f => f.id === selectedFileId);

  if (!activeFile) {
    return (
      <div className="text-center py-20 text-gray-500 dark:text-gray-300">
        No files uploaded. Please go to the File Manager.
      </div>
    );
  }

  // Search runs over the full dataset, not just the on-screen slice — finding
  // a row shouldn't depend on it happening to be in the first 100. The 100-row
  // cap still applies to whatever matches, for the same performance reason as
  // before.
  const filteredData = search.trim()
    ? activeFile.data.filter(row =>
        activeFile.columns.some(col => String(row[col] ?? '').toLowerCase().includes(search.trim().toLowerCase()))
      )
    : activeFile.data;
  const displayData = filteredData.slice(0, 100);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">

        <div className="flex items-center space-x-4">
             <div className="relative">
                <select
                    value={selectedFileId}
                    onChange={(e) => setSelectedFileId(e.target.value)}
                    className="appearance-none pl-4 pr-10 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    {files.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700 dark:text-gray-300">
                    <ChevronDown className="h-4 w-4" />
                </div>
            </div>
            <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this file..."
                className="w-56 p-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
        </div>

        <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500 dark:text-gray-300 mr-2">
                {search.trim()
                    ? `Showing ${displayData.length} of ${filteredData.length} matching rows`
                    : `Showing top 100 of ${activeFile.data.length} rows`}
            </span>
            <ExportMenu onExport={(format) => onDownload(activeFile.id, format)} />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="max-h-[600px] overflow-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
              <tr>
                {activeFile.columns.map((col, idx) => (
                  <th
                    key={idx}
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              {displayData.length === 0 ? (
                <tr>
                  <td colSpan={activeFile.columns.length} className="px-6 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                    No rows match your search.
                  </td>
                </tr>
              ) : (
                displayData.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    {activeFile.columns.map((col, colIdx) => (
                      <td
                        key={`${rowIdx}-${colIdx}`}
                        className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100"
                      >
                        {row[col]?.toString() || ''}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
