import React, { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, Trash2, Plus, FileText } from 'lucide-react';
import { UploadedFile } from '@/types';
import { Button } from '@/components/ui/Button';

interface FileUploadProps {
  files: UploadedFile[];
  onFilesSelect: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  isLoading: boolean;
}

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.txt'];

const getExtension = (filename: string) => {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx).toLowerCase();
};

export const FileUpload: React.FC<FileUploadProps> = ({ files, onFilesSelect, onRemoveFile, isLoading }) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      onFilesSelect(selectedFiles);
      // Reset value so same file can be selected again
      e.target.value = '';
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoading) return;
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
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
    if (isLoading || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

    const droppedFiles: File[] = Array.from(e.dataTransfer.files);
    const validFiles = droppedFiles.filter(f => ALLOWED_EXTENSIONS.includes(getExtension(f.name)));
    const rejectedFiles = droppedFiles.filter(f => !ALLOWED_EXTENSIONS.includes(getExtension(f.name)));

    if (rejectedFiles.length > 0) {
      alert(`Unsupported file type for:\n\n${rejectedFiles.map(f => f.name).join('\n')}\n\nOnly .xlsx, .xls, .csv, and .txt files are supported.`);
    }

    if (validFiles.length > 0) {
      onFilesSelect(validFiles);
    }
  };

  return (
    <div className="max-w-3xl mx-auto mt-10 space-y-8">

      {/* Upload Area */}
      <div
        className={`rounded-2xl shadow-sm border p-12 text-center transition-colors duration-150 ${isDragging ? 'bg-indigo-50/50 dark:bg-indigo-500/10 border-dashed border-indigo-400 dark:border-indigo-500' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="w-16 h-16 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-6">
          <UploadCloud className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Upload Data Files</h2>
        <p className="text-gray-500 dark:text-gray-300 mb-8">
          Upload at least 2 files to use the Comparison and Merge features.
          <br />
          Drag and drop files here, or click below to browse.
          <br />
          Supported formats: <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded text-gray-700 dark:text-gray-300">.xlsx</span> <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded text-gray-700 dark:text-gray-300">.xls</span> <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded text-gray-700 dark:text-gray-300">.csv</span> <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded text-gray-700 dark:text-gray-300">.txt</span>
        </p>

        <label className={`relative inline-flex items-center justify-center px-8 py-4 font-semibold text-white transition-all duration-200 bg-indigo-600 rounded-full cursor-pointer hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 ${isLoading ? 'opacity-75 cursor-wait' : ''}`}>
          {isLoading ? (
            <span>Processing Files...</span>
          ) : (
            <>
              <Plus className="w-5 h-5 mr-2" />
              <span>Add Files</span>
            </>
          )}
          <input 
            type="file" 
            className="hidden" 
            accept=".xlsx, .xls, .csv, .txt, text/csv, text/plain"
            onChange={handleFileChange}
            disabled={isLoading}
            multiple
          />
        </label>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Uploaded Files ({files.length})</h3>
            </div>
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                {files.map((file) => (
                    <li key={file.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800">
                        <div className="flex items-center space-x-3">
                            <div className={`p-2 rounded-lg ${file.name.endsWith('.csv') || file.name.endsWith('.txt') ? 'bg-blue-100 dark:bg-blue-500/10' : 'bg-green-100 dark:bg-green-500/10'}`}>
                                {file.name.endsWith('.csv') || file.name.endsWith('.txt') ? (
                                    <FileText className={`h-5 w-5 ${file.name.endsWith('.csv') || file.name.endsWith('.txt') ? 'text-blue-700 dark:text-blue-400' : 'text-green-700 dark:text-green-400'}`} />
                                ) : (
                                    <FileSpreadsheet className="h-5 w-5 text-green-700 dark:text-green-400" />
                                )}
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                    {file.name}
                                    {file.isGenerated && (
                                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 px-1.5 py-0.5 rounded">
                                            Generated
                                        </span>
                                    )}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-300">{file.data.length} rows, {file.columns.length} columns</p>
                            </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => onRemoveFile(file.id)}>
                            <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                        </Button>
                    </li>
                ))}
            </ul>
        </div>
      )}
    </div>
  );
};
