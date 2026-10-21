import React, { ReactNode } from 'react';
import { AppTab, EXTRA_TOOLS } from '@/types';
import {
  FileSpreadsheet,
  Eraser,
  Calculator,
  Upload,
  GitCompare,
  Combine,
  Hash,
  Scissors,
  Layers,
  ClipboardList,
  ScanSearch,
  Sun,
  Moon
} from 'lucide-react';

// The guide (context/eGENTIC-design-guide.md) says this 2-colour mark shouldn't
// appear on dark backgrounds, and there's no reversed/white variant available yet
// — used in both themes anyway per explicit product decision until one exists.
const EGENTIC_LOGO_SRC = '/brand/egentic-logo.png';

interface LayoutProps {
  children: ReactNode;
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  fileCount: number;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const NavItem = ({
  tab,
  active,
  icon: Icon,
  label,
  onClick
}: {
  tab: AppTab;
  active: boolean;
  icon: React.ElementType;
  label: string;
  onClick: (t: AppTab) => void;
}) => (
  <button
    onClick={() => onClick(tab)}
    className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium rounded-lg transition-all ${
      active
        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400'
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
    }`}
  >
    <Icon className={`h-5 w-5 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}`} />
    <span>{label}</span>
  </button>
);

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, fileCount, theme, onToggleTheme }) => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex-shrink-0 fixed h-full z-10">
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 min-w-0">
            <img src={EGENTIC_LOGO_SRC} alt="eGENTIC Lead Generation" className="h-3.5 w-auto flex-shrink-0" />
            <div className="flex flex-col justify-center min-w-0 leading-tight">
              <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 truncate">Sales Support</span>
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">Workbench</span>
            </div>
          </div>
          <button
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        <div className="p-4 space-y-1">
          <NavItem 
            tab={AppTab.UPLOAD} 
            active={activeTab === AppTab.UPLOAD} 
            icon={Upload} 
            label="File Manager" 
            onClick={onTabChange} 
          />
          <div className="pt-4 pb-2">
            <p className="px-4 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Workspace</p>
          </div>
          <NavItem 
            tab={AppTab.CLEANING} 
            active={activeTab === AppTab.CLEANING} 
            icon={Eraser} 
            label="Operations" 
            onClick={onTabChange} 
          />
          <NavItem 
            tab={AppTab.VIEW} 
            active={activeTab === AppTab.VIEW} 
            icon={FileSpreadsheet} 
            label="Data View" 
            onClick={onTabChange} 
          />
          <NavItem 
            tab={AppTab.COMPARE} 
            active={activeTab === AppTab.COMPARE} 
            icon={GitCompare} 
            label="Compare Files" 
            onClick={onTabChange} 
          />
          <NavItem 
            tab={AppTab.MERGE} 
            active={activeTab === AppTab.MERGE} 
            icon={Combine} 
            label="Merge / Split" 
            onClick={onTabChange} 
          />
          <NavItem 
            tab={AppTab.FORMULA} 
            active={activeTab === AppTab.FORMULA} 
            icon={Calculator} 
            label="Formula AI" 
            onClick={onTabChange} 
          />

          <div className="pt-4 pb-2">
            <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Extra Tools</p>
          </div>
          <NavItem
            tab={AppTab.EXTRA_COUNTER}
            active={activeTab === AppTab.EXTRA_COUNTER}
            icon={Hash}
            label="SNTS-Counter"
            onClick={onTabChange}
          />
          <NavItem
            tab={AppTab.EXTRA_SPLITTER}
            active={activeTab === AppTab.EXTRA_SPLITTER}
            icon={Scissors}
            label={EXTRA_TOOLS[0].name}
            onClick={onTabChange}
          />
          <NavItem
            tab={AppTab.EXTRA_COMBINER}
            active={activeTab === AppTab.EXTRA_COMBINER}
            icon={Layers}
            label={EXTRA_TOOLS[1].name}
            onClick={onTabChange}
          />
          <NavItem
            tab={AppTab.EXTRA_EGT_LOGGER}
            active={activeTab === AppTab.EXTRA_EGT_LOGGER}
            icon={ClipboardList}
            label={EXTRA_TOOLS[2].name}
            onClick={onTabChange}
          />
          <NavItem
            tab={AppTab.EXTRA_VLOOKUP}
            active={activeTab === AppTab.EXTRA_VLOOKUP}
            icon={ScanSearch}
            label={EXTRA_TOOLS[3].name}
            onClick={onTabChange}
          />
        </div>

        <div className="absolute bottom-0 w-full p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {fileCount} Active File{fileCount !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-300 truncate">
                  Sales Support Workbench
                </p>
              </div>
            </div>
          </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8 overflow-y-auto h-screen">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};