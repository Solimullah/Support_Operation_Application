export interface ExcelRow {
  [key: string]: any;
}

export interface UploadedFile {
  id: string;
  name: string;
  data: ExcelRow[];
  columns: string[];
  // True for a file created from another panel's result via "Save to File
  // Manager" (Operations, Merge/Split, Compare), as opposed to a real upload.
  // Display-only — every downstream consumer treats it identically to an
  // uploaded file.
  isGenerated?: boolean;
}

export enum AppTab {
  UPLOAD = 'UPLOAD',
  VIEW = 'VIEW',
  CLEANING = 'CLEANING',
  COMPARE = 'COMPARE',
  MERGE = 'MERGE',
  FORMULA = 'FORMULA',
  EXTRA_COUNTER = 'EXTRA_COUNTER',
  EXTRA_SPLITTER = 'EXTRA_SPLITTER',
  EXTRA_COMBINER = 'EXTRA_COMBINER',
  EXTRA_EGT_LOGGER = 'EXTRA_EGT_LOGGER',
  EXTRA_VLOOKUP = 'EXTRA_VLOOKUP'
}

export interface ExtraTool {
  tab: AppTab;
  name: string;
  description: string;
  path: string;
}

// Standalone HTML tools served from public/extra-tools and shown in an iframe.
// EXTRA_COUNTER has been migrated to a native component (EntryCounterPanel)
// and is intentionally absent here — see App.tsx's render branch for it.
export const EXTRA_TOOLS: ExtraTool[] = [
  { tab: AppTab.EXTRA_SPLITTER, name: 'File Splitter', description: 'Split Large Excel files based on the desired size', path: '/extra-tools/File-Splitter.html' },
  { tab: AppTab.EXTRA_COMBINER, name: 'SNTS-Combiner', description: "Combine files from client's side ( Sanitas )", path: '/extra-tools/SNTS-Combiner.html' },
  { tab: AppTab.EXTRA_EGT_LOGGER, name: 'EGT Control Logger', description: 'Special rules for a task from Spain', path: '/extra-tools/EGT-Control-Logger.html' },
  { tab: AppTab.EXTRA_VLOOKUP, name: 'VLookup', description: "Match and fill values between files, even across multiple reference files, mismatched formats, or messy headers", path: '/extra-tools/vlookup.html' },
];

export interface CleaningAction {
  type: 'remove_duplicates' | 'remove_empty' | 'uppercase' | 'lowercase' | 'trim' | 'add_prefix' | 'remove_prefix' | 'extract_column' | 'apply_formula';
  column?: string;
  value?: string;
}

export type ExportFormat = 'xlsx' | 'csv' | 'txt';