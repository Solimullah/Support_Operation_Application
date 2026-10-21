import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { FileUpload } from '@/features/files/components/FileUpload';
import { DataView } from '@/features/data-view/components/DataView';
import { CleaningPanel } from '@/features/cleaning/components/CleaningPanel';
import { FormulaPanel } from '@/features/formula/components/FormulaPanel';
import { ComparePanel } from '@/features/compare/components/ComparePanel';
import { MergePanel } from '@/features/merge-split/components/MergePanel';
import { ExtraToolFrame } from '@/components/ui/ExtraToolFrame';
import { EntryCounterPanel } from '@/features/entry-counter/components/EntryCounterPanel';
import { AppTab, UploadedFile, ExcelRow, ExportFormat, CleaningAction, EXTRA_TOOLS } from '@/types';
import { readExcelFile, downloadExcelFile } from '@/lib/excel';

const getInitialTheme = (): 'light' | 'dark' => {
  const stored = localStorage.getItem('excelai-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.UPLOAD);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('excelai-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  // Bridge State: Passing actions from Formula AI to Operations
  const [pendingCleaningAction, setPendingCleaningAction] = useState<{
    fileId: string;
    action: CleaningAction;
  } | null>(null);

  const handleFilesSelect = async (filesToUpload: File[]) => {
    const existingNames = new Set(files.map(f => f.name.toLowerCase()));
    const duplicateNames = filesToUpload.filter(f => existingNames.has(f.name.toLowerCase())).map(f => f.name);

    let filesToProcess = filesToUpload;
    if (duplicateNames.length > 0) {
      const proceed = window.confirm(
        `The following file(s) share a name with a file already uploaded:\n\n${duplicateNames.join('\n')}\n\nAdd them anyway as separate entries?`
      );
      if (!proceed) {
        filesToProcess = filesToUpload.filter(f => !duplicateNames.includes(f.name));
        if (filesToProcess.length === 0) return;
      }
    }

    setIsProcessing(true);
    try {
      const newUploadedFiles = await Promise.all(
        filesToProcess.map(async (file) => {
          const { data, columns } = await readExcelFile(file);
          return {
            id: crypto.randomUUID(),
            name: file.name,
            data,
            columns
          } as UploadedFile;
        })
      );
      setFiles(prev => [...prev, ...newUploadedFiles]);
    } catch (error) {
      console.error("Error processing files", error);
      const message = error instanceof Error ? error.message : String(error);
      // This app has no backend: every file is read entirely into the tab's
      // memory, and SheetJS needs several times a workbook's size in RAM to
      // unzip and parse it. A large file can fail with a RangeError/allocation
      // message rather than a normal parse error — that's not a format problem,
      // so don't tell the user to check their file extension when it happens.
      const looksLikeMemoryIssue = /alloc|memory|invalid (array|typed array|string) length/i.test(message);

      alert(
        looksLikeMemoryIssue
          ? `One or more files are too large for the browser to hold in memory (everything here runs in this tab — there is no server). Try splitting the file into smaller pieces before uploading.\n\nDetails: ${message}`
          : `Error reading one or more files: ${message}\n\nPlease ensure they are valid .xlsx, .xls, .csv, or .txt files.`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleFileUpdate = (fileId: string, newData: ExcelRow[]) => {
    setFiles(prev => prev.map(f => {
        if (f.id === fileId) {
            return {
                ...f,
                data: newData,
                columns: newData.length > 0 ? Object.keys(newData[0]) : []
            };
        }
        return f;
    }));
  };

  // Promotes a result produced by another panel (Operations, Merge/Split,
  // Compare) into the shared file pool, so it becomes selectable everywhere
  // else that reads `files` — the same "load to" idea Power Query uses for a
  // query's output, mapped onto this app's existing UploadedFile model.
  // Reuses the exact duplicate-name confirmation already used for uploads.
  const handleSaveAsFile = (name: string, data: ExcelRow[]) => {
    const existingNames = new Set(files.map(f => f.name.toLowerCase()));
    if (existingNames.has(name.toLowerCase())) {
      const proceed = window.confirm(
        `"${name}" matches a file already in File Manager.\n\nAdd it anyway as a separate entry?`
      );
      if (!proceed) return;
    }

    const newFile: UploadedFile = {
      id: crypto.randomUUID(),
      name,
      data,
      columns: data.length > 0 ? Object.keys(data[0]) : [],
      isGenerated: true,
    };
    setFiles(prev => [...prev, newFile]);
  };

  const handleDownload = (fileId: string, format: ExportFormat) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    
    // Create new name preserving original name but changing extension and adding modifier
    const originalName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    const newName = `${originalName}_modified.${format}`;
    
    downloadExcelFile(file.data, newName, format);
  };

  // Bridge Function
  const handleAddToPipeline = (fileId: string, formula: string, targetColumn: string) => {
    setPendingCleaningAction({
      fileId,
      action: {
        type: 'apply_formula',
        column: targetColumn,
        value: formula
      }
    });
    setActiveTab(AppTab.CLEANING);
  };

  const clearPendingAction = () => {
    setPendingCleaningAction(null);
  };

  const renderContent = () => {
    const extraTool = EXTRA_TOOLS.find(t => t.tab === activeTab);
    if (extraTool) {
      return <ExtraToolFrame src={extraTool.path} title={extraTool.name} />;
    }

    if (activeTab === AppTab.UPLOAD) {
      return (
        <FileUpload
            files={files}
            onFilesSelect={handleFilesSelect}
            onRemoveFile={handleRemoveFile}
            isLoading={isProcessing}
        />
      );
    }

    // Entry Counter has its own independent upload (it needs to read every
    // sheet, unzip archives, etc. — a different contract than the shared
    // `files` pool's readExcelFile), so it isn't gated on files being loaded.
    if (activeTab === AppTab.EXTRA_COUNTER) {
      return <EntryCounterPanel />;
    }

    if (files.length === 0) {
       return (
         <div className="text-center py-20">
           <p className="text-gray-500 dark:text-gray-300 mb-4">No files uploaded yet.</p>
           <button
             onClick={() => setActiveTab(AppTab.UPLOAD)}
             className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
           >
             Go to File Manager
           </button>
         </div>
       );
    }

    return (
      <>
        {/* Persistent Cleaning Panel: kept mounted but hidden when inactive to preserve state */}
        <div className={activeTab === AppTab.CLEANING ? 'block' : 'hidden'}>
          <CleaningPanel
            files={files}
            onUpdateFile={handleFileUpdate}
            incomingAction={pendingCleaningAction}
            onActionHandled={clearPendingAction}
            onSaveAsFile={handleSaveAsFile}
          />
        </div>

        {/* Other workspace tabs */}
        {activeTab === AppTab.VIEW && <DataView files={files} onDownload={handleDownload} />}
        {activeTab === AppTab.COMPARE && <ComparePanel files={files} onSaveAsFile={handleSaveAsFile} />}
        {activeTab === AppTab.MERGE && <MergePanel files={files} onSaveAsFile={handleSaveAsFile} />}
        {activeTab === AppTab.FORMULA && <FormulaPanel files={files} onAddToPipeline={handleAddToPipeline} />}
      </>
    );
  };

  const activeExtraTool = EXTRA_TOOLS.find(t => t.tab === activeTab);

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab} fileCount={files.length} theme={theme} onToggleTheme={toggleTheme}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {activeExtraTool ? activeExtraTool.name :
             activeTab === AppTab.UPLOAD ? 'File Manager' :
             activeTab === AppTab.VIEW ? 'Data Overview' :
             activeTab === AppTab.COMPARE ? 'Compare Files' :
             activeTab === AppTab.MERGE ? 'Merge & Split Tool' :
             activeTab === AppTab.CLEANING ? 'Operations & Cleaning' :
             activeTab === AppTab.EXTRA_COUNTER ? 'Entry Counter' :
             'Formula Builder'}
        </h1>
        <p className="text-gray-500 dark:text-gray-300 mt-1">
            {activeExtraTool ? activeExtraTool.description :
             activeTab === AppTab.UPLOAD ? 'Manage your uploaded spreadsheets and data files.' :
             activeTab === AppTab.VIEW ? 'View and export your data.' :
             activeTab === AppTab.COMPARE ? 'Identify differences between two datasets.' :
             activeTab === AppTab.MERGE ? 'Combine multiple datasets or split one into many.' :
             activeTab === AppTab.CLEANING ? 'Clean, modify, and extract data.' :
             activeTab === AppTab.EXTRA_COUNTER ? 'Count rows across CSV, TXT, Excel and ZIP files.' :
             'Use templates to build complex custom formulas.'}
        </p>
      </div>
      {renderContent()}
    </Layout>
  );
};

export default App;
