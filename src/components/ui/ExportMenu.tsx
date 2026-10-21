import React, { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, FileSpreadsheet, FileText, FileType } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ExportFormat } from '@/types';

interface ExportMenuProps {
  onExport: (format: ExportFormat) => void;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  trigger?: React.ReactNode;
  disabled?: boolean;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({
  onExport,
  label = "Export",
  size = "md",
  className = "",
  variant = "secondary",
  trigger,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative inline-block text-left ${className}`} ref={menuRef}>
      {trigger ? (
        <div
          onClick={(e) => { if (disabled) return; e.stopPropagation(); setIsOpen(!isOpen); }}
          className={`inline-flex ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {trigger}
        </div>
      ) : (
        <Button
          onClick={() => setIsOpen(!isOpen)}
          variant={variant}
          size={size}
          className="flex items-center"
          disabled={disabled}
        >
          <Download className="h-4 w-4 mr-2" />
          {label}
          <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
        </Button>
      )}

      {isOpen && (
        <div className="origin-top-right absolute right-0 mt-2 w-64 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 dark:ring-white/10 focus:outline-none z-50">
          <div className="py-1" role="menu">
            <button
              onClick={() => { onExport('xlsx'); setIsOpen(false); }}
              className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center transition-colors border-b border-gray-100 dark:border-gray-700"
              role="menuitem"
            >
              <div className="bg-green-100 dark:bg-green-500/10 p-1.5 rounded mr-3">
                <FileSpreadsheet className="h-4 w-4 text-green-700 dark:text-green-400" />
              </div>
              <div>
                <span className="block font-medium">Excel Workbook</span>
                <span className="block text-xs text-gray-500 dark:text-gray-300">*.xlsx</span>
              </div>
            </button>
            <button
              onClick={() => { onExport('csv'); setIsOpen(false); }}
              className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center transition-colors border-b border-gray-100 dark:border-gray-700"
              role="menuitem"
            >
              <div className="bg-blue-100 dark:bg-blue-500/10 p-1.5 rounded mr-3">
                <FileText className="h-4 w-4 text-blue-700 dark:text-blue-400" />
              </div>
              <div>
                <span className="block font-medium">CSV UTF-8 (Comma)</span>
                <span className="block text-xs text-gray-500 dark:text-gray-300">*.csv</span>
              </div>
            </button>
            <button
              onClick={() => { onExport('csv'); setIsOpen(false); }}
              className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center transition-colors border-b border-gray-100 dark:border-gray-700"
              role="menuitem"
            >
              <div className="bg-blue-50 dark:bg-blue-500/10 p-1.5 rounded mr-3">
                <FileType className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <span className="block font-medium">CSV (Comma delimited)</span>
                <span className="block text-xs text-gray-500 dark:text-gray-300">*.csv</span>
              </div>
            </button>
            <button
              onClick={() => { onExport('txt'); setIsOpen(false); }}
              className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center transition-colors"
              role="menuitem"
            >
              <div className="bg-gray-100 dark:bg-gray-700 p-1.5 rounded mr-3">
                <FileText className="h-4 w-4 text-gray-700 dark:text-gray-300" />
              </div>
               <div>
                <span className="block font-medium">Text (Tab delimited)</span>
                <span className="block text-xs text-gray-500 dark:text-gray-300">*.txt</span>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
