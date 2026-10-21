import React, { useState } from 'react';
import { UploadedFile, ExportFormat, ExcelRow } from '@/types';
import { Button } from '@/components/ui/Button';
import { GitCompare, ArrowRightLeft, AlertCircle, HelpCircle, Check, X, Save } from 'lucide-react';
import { downloadExcelFile } from '@/lib/excel';
import { ExportMenu } from '@/components/ui/ExportMenu';
import {
  buildAcceptedMatchRows,
  compareFiles,
  CompareResult,
  MatchType,
  PhoneExportFormat,
} from '@/features/compare/lib/compareFiles';

type MatchDecision = 'pending' | 'accepted' | 'rejected';

interface ComparePanelProps {
  files: UploadedFile[];
  onSaveAsFile?: (name: string, data: ExcelRow[]) => void;
}

export const ComparePanel: React.FC<ComparePanelProps> = ({ files, onSaveAsFile }) => {
  const [file1Id, setFile1Id] = useState<string>(files[0]?.id || '');
  const [file2Id, setFile2Id] = useState<string>(files[1]?.id || '');
  const [col1, setCol1] = useState<string>('');
  const [col2, setCol2] = useState<string>('');
  const [matchType, setMatchType] = useState<MatchType>('text');
  const [result, setResult] = useState<CompareResult | null>(null);

  // Possible-match review state: every candidate starts 'pending' — neither
  // bucket is pre-filled, so "Matched"/"Unmatched" only ever reflect a
  // decision you actually made, not a silent default. A search filter over
  // the review table, which side (accepted/rejected) to export, and the
  // phone format to apply to that export round out the review workflow.
  const [matchDecisions, setMatchDecisions] = useState<Map<number, MatchDecision>>(new Map());
  const [matchSearch, setMatchSearch] = useState('');
  const [matchDownloadTarget, setMatchDownloadTarget] = useState<'matched' | 'unmatched'>('matched');
  const [matchExportFileFormat, setMatchExportFileFormat] = useState<ExportFormat>('xlsx');
  const [phoneExportFormat, setPhoneExportFormat] = useState<PhoneExportFormat>('original');
  const [countryCode, setCountryCode] = useState('');

  const file1 = files.find(f => f.id === file1Id);
  const file2 = files.find(f => f.id === file2Id);

  // Initialize columns when files change
  React.useEffect(() => {
    if (file1 && !col1) setCol1(file1.columns[0] || '');
    if (file2 && !col2) setCol2(file2.columns[0] || '');
  }, [file1, file2, col1, col2]);

  if (files.length < 2) {
    return (
      <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800">
        <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Not Enough Files</h3>
        <p className="text-gray-500 dark:text-gray-300">Please upload at least 2 files to use the comparison feature.</p>
      </div>
    );
  }

  const handleCompare = () => {
    if (!file1 || !file2 || !col1 || !col2) return;

    const newResult = compareFiles(file1.data, col1, file2.data, col2, matchType);
    setResult(newResult);
    // Every possible match starts pending — neither bucket is pre-filled, so
    // "Matched"/"Unmatched" only ever reflect a decision actually made here.
    const pending = new Map<number, MatchDecision>();
    newResult.possibleMatches?.forEach((_, i) => pending.set(i, 'pending'));
    setMatchDecisions(pending);
    setMatchSearch('');
  };

  const downloadResult = (data: any[], type: string, format: ExportFormat) => {
    if (data.length === 0) return;
    downloadExcelFile(data, `comparison_${type}.${format}`, format);
  };

  const getDecision = (idx: number): MatchDecision => matchDecisions.get(idx) ?? 'pending';

  // Clicking the already-active decision again resets that row to pending,
  // rather than needing a separate "undo" control.
  const setDecision = (idx: number, decision: MatchDecision) => {
    setMatchDecisions(prev => {
      const next = new Map(prev);
      next.set(idx, prev.get(idx) === decision ? 'pending' : decision);
      return next;
    });
  };

  const setAllDecisions = (decision: MatchDecision) => {
    if (!result?.possibleMatches) return;
    const next = new Map<number, MatchDecision>();
    result.possibleMatches.forEach((_, i) => next.set(i, decision));
    setMatchDecisions(next);
  };

  const buildChosenMatchRows = (): ExcelRow[] | null => {
    if (!result?.possibleMatches) return null;
    const wantDecision: MatchDecision = matchDownloadTarget === 'matched' ? 'accepted' : 'rejected';
    const chosen = result.possibleMatches.filter((_, idx) => getDecision(idx) === wantDecision);
    if (chosen.length === 0) return null;
    return buildAcceptedMatchRows(chosen, { format: phoneExportFormat, countryCode });
  };

  const downloadAcceptedMatches = (format: ExportFormat) => {
    const rows = buildChosenMatchRows();
    if (!rows) return;
    downloadExcelFile(rows, `comparison_possible_${matchDownloadTarget}.${format}`, format);
  };

  const saveAcceptedMatches = () => {
    const rows = buildChosenMatchRows();
    if (!rows || !onSaveAsFile) return;
    onSaveAsFile(`comparison_possible_${matchDownloadTarget}`, rows);
  };

  const visibleMatches = (result?.possibleMatches ?? [])
    .map((m, idx) => ({ ...m, idx }))
    .filter(m => {
      if (!matchSearch) return true;
      const q = matchSearch.toLowerCase();
      return m.value1.toLowerCase().includes(q) || m.value2.toLowerCase().includes(q);
    });

  const totalPossibleMatches = result?.possibleMatches?.length ?? 0;
  const decisionCounts = { pending: 0, accepted: 0, rejected: 0 };
  for (let i = 0; i < totalPossibleMatches; i++) decisionCounts[getDecision(i)]++;
  const downloadTargetCount = matchDownloadTarget === 'matched' ? decisionCounts.accepted : decisionCounts.rejected;
  const acceptedExportDisabled = downloadTargetCount === 0 || (phoneExportFormat === 'international' && !countryCode.trim());

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-8">
        <div className="flex items-center mb-6 text-gray-900 dark:text-gray-100">
            <GitCompare className="h-6 w-6 text-indigo-600 dark:text-indigo-400 mr-2" />
            <h2 className="text-2xl font-bold">Compare Files</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
           {/* Connector Icon */}
           <div className="hidden md:flex absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-100 dark:bg-gray-800 p-2 rounded-full border border-gray-200 dark:border-gray-700 z-10">
                <ArrowRightLeft className="h-5 w-5 text-gray-500 dark:text-gray-300" />
           </div>

           {/* Source 1 */}
           <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-4">Source File A</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-500 dark:text-gray-300 mb-1">Select File</label>
                        <select
                            value={file1Id}
                            onChange={(e) => setFile1Id(e.target.value)}
                            className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        >
                            {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 dark:text-gray-300 mb-1">Compare Column</label>
                         <select
                            value={col1}
                            onChange={(e) => setCol1(e.target.value)}
                            className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        >
                            {file1?.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>
           </div>

           {/* Source 2 */}
           <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-4">Source File B</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-500 dark:text-gray-300 mb-1">Select File</label>
                        <select
                            value={file2Id}
                            onChange={(e) => setFile2Id(e.target.value)}
                            className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        >
                            {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                    </div>
                    <div>
                         <label className="block text-sm text-gray-500 dark:text-gray-300 mb-1">Compare Column</label>
                         <select
                            value={col2}
                            onChange={(e) => setCol2(e.target.value)}
                            className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        >
                            {file2?.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>
           </div>
        </div>

        <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Match Type</span>
            <div className="flex items-center space-x-6">
                <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                        type="radio"
                        checked={matchType === 'text'}
                        onChange={() => setMatchType('text')}
                    />
                    <span>Exact Text</span>
                </label>
                <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                        type="radio"
                        checked={matchType === 'phone'}
                        onChange={() => setMatchType('phone')}
                    />
                    <span>Phone Number</span>
                </label>
            </div>
            {matchType === 'phone' && (
                <p className="text-xs text-gray-500 dark:text-gray-300 mt-2">
                    Numbers formatted identically on both sides (e.g. the same national format) match automatically as "Common".
                    Numbers that share a long run of digits but differ in length — like <span className="font-mono">+41791234567</span> vs <span className="font-mono">0791234567</span> — aren't auto-matched; they show up below under "Possible Matches" for you to review.
                </p>
            )}
        </div>

        <div className="mt-6 flex justify-center">
            <Button size="lg" onClick={handleCompare} disabled={!file1 || !file2}>
                Compare Data
            </Button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
                <h4 className="font-bold text-lg text-red-600 dark:text-red-400 mb-2">Unique to {file1?.name}</h4>
                <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">{result.in1Only.length} <span className="text-sm font-normal text-gray-500 dark:text-gray-300">rows</span></div>
                <div className="flex items-center gap-2">
                    <ExportMenu
                        label="Download"
                        size="sm"
                        onExport={(format) => downloadResult(result.in1Only, 'unique_to_A', format)}
                    />
                    {onSaveAsFile && (
                        <Button variant="ghost" size="sm" disabled={result.in1Only.length === 0} onClick={() => onSaveAsFile('comparison_unique_to_A', result.in1Only)} title="Make this available as a file elsewhere in the app">
                            <Save className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
             <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
                <h4 className="font-bold text-lg text-green-600 dark:text-green-400 mb-2">Common Rows</h4>
                <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">{result.common.length} <span className="text-sm font-normal text-gray-500 dark:text-gray-300">rows</span></div>
                <div className="flex items-center gap-2">
                    <ExportMenu
                        label="Download"
                        size="sm"
                        onExport={(format) => downloadResult(result.common, 'common', format)}
                    />
                    {onSaveAsFile && (
                        <Button variant="ghost" size="sm" disabled={result.common.length === 0} onClick={() => onSaveAsFile('comparison_common', result.common)} title="Make this available as a file elsewhere in the app">
                            <Save className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
             <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
                <h4 className="font-bold text-lg text-blue-600 dark:text-blue-400 mb-2">Unique to {file2?.name}</h4>
                <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">{result.in2Only.length} <span className="text-sm font-normal text-gray-500 dark:text-gray-300">rows</span></div>
                <div className="flex items-center gap-2">
                    <ExportMenu
                        label="Download"
                        size="sm"
                        onExport={(format) => downloadResult(result.in2Only, 'unique_to_B', format)}
                    />
                    {onSaveAsFile && (
                        <Button variant="ghost" size="sm" disabled={result.in2Only.length === 0} onClick={() => onSaveAsFile('comparison_unique_to_B', result.in2Only)} title="Make this available as a file elsewhere in the app">
                            <Save className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Possible phone matches: pairs that share a long digit suffix but didn't
          exactly match, surfaced for manual review rather than auto-merged. */}
      {result && matchType === 'phone' && result.possibleMatches && (
        <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-amber-200 dark:border-amber-500/30">
            <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-lg text-amber-600 dark:text-amber-400 flex items-center">
                    <HelpCircle className="h-5 w-5 mr-2" />
                    Possible Matches (Review)
                </h4>
                <span className="text-xs text-gray-500 dark:text-gray-300">
                    {decisionCounts.accepted} accepted · {decisionCounts.rejected} rejected · {decisionCounts.pending} pending
                </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-300 mb-4">
                These pairs share a long run of digits but weren't formatted the same way, so they're not counted as matched or unmatched automatically. Every row starts <b>pending</b> — mark each one Accept or Reject below, then download either set as combined rows from both files.
            </p>

            {result.possibleMatches.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">None found.</p>
            ) : (
                <>
                    {/* Controls: search + bulk select */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                        <input
                            type="text"
                            value={matchSearch}
                            onChange={(e) => setMatchSearch(e.target.value)}
                            placeholder="Search by phone value..."
                            className="flex-1 p-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                        <div className="flex gap-2 shrink-0">
                            <Button variant="ghost" size="sm" onClick={() => setAllDecisions('accepted')}>Accept All</Button>
                            <Button variant="ghost" size="sm" onClick={() => setAllDecisions('rejected')}>Reject All</Button>
                            <Button variant="ghost" size="sm" onClick={() => setAllDecisions('pending')}>Reset All</Button>
                        </div>
                    </div>

                    {/* Scrollable, sticky-header review table */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-4">
                        <div className="max-h-80 overflow-y-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
                                    <tr className="text-xs text-gray-500 dark:text-gray-300 uppercase">
                                        <th className="py-2 pl-4 pr-4 w-36">Decision</th>
                                        <th className="py-2 pr-4">{file1?.name || 'File A'} value</th>
                                        <th className="py-2 pr-4">{file2?.name || 'File B'} value</th>
                                        <th className="py-2 pr-4">Shared digits</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleMatches.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                                                No possible matches match your search.
                                            </td>
                                        </tr>
                                    ) : (
                                        visibleMatches.map(m => {
                                            const decision = getDecision(m.idx);
                                            return (
                                                <tr key={m.idx} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                    <td className="py-2 pl-4 pr-4">
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => setDecision(m.idx, 'accepted')}
                                                                title="Accept as a match"
                                                                className={`p-1 rounded border ${decision === 'accepted'
                                                                    ? 'bg-green-100 border-green-300 text-green-700 dark:bg-green-500/20 dark:border-green-500/40 dark:text-green-400'
                                                                    : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:text-green-600 hover:border-green-300'}`}
                                                            >
                                                                <Check className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setDecision(m.idx, 'rejected')}
                                                                title="Reject — not the same number"
                                                                className={`p-1 rounded border ${decision === 'rejected'
                                                                    ? 'bg-red-100 border-red-300 text-red-700 dark:bg-red-500/20 dark:border-red-500/40 dark:text-red-400'
                                                                    : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:text-red-600 hover:border-red-300'}`}
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </button>
                                                            {decision === 'pending' && (
                                                                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide ml-1">Pending</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-2 pr-4 font-mono text-gray-900 dark:text-gray-100">{m.value1}</td>
                                                    <td className="py-2 pr-4 font-mono text-gray-900 dark:text-gray-100">{m.value2}</td>
                                                    <td className="py-2 pr-4 font-mono text-amber-600 dark:text-amber-400">{m.sharedDigits}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Which side of the review to export */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-4">
                        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Download</span>
                        <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                <input type="radio" checked={matchDownloadTarget === 'matched'} onChange={() => setMatchDownloadTarget('matched')} />
                                <span>Matched (accepted) — {decisionCounts.accepted}</span>
                            </label>
                            <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                <input type="radio" checked={matchDownloadTarget === 'unmatched'} onChange={() => setMatchDownloadTarget('unmatched')} />
                                <span>Unmatched (rejected) — {decisionCounts.rejected}</span>
                            </label>
                            {decisionCounts.pending > 0 && (
                                <span className="text-xs text-gray-400 dark:text-gray-500">({decisionCounts.pending} still pending, in neither)</span>
                            )}
                        </div>
                    </div>

                    {/* Phone format for the chosen export */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-4">
                        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Phone format for export</span>
                        <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                <input type="radio" checked={phoneExportFormat === 'original'} onChange={() => setPhoneExportFormat('original')} />
                                <span>Keep both original values</span>
                            </label>
                            <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                <input type="radio" checked={phoneExportFormat === 'national'} onChange={() => setPhoneExportFormat('national')} />
                                <span>National (0XXXXXXXXX)</span>
                            </label>
                            <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                <input type="radio" checked={phoneExportFormat === 'international'} onChange={() => setPhoneExportFormat('international')} />
                                <span>International (+code XXXXXXXXX)</span>
                            </label>
                        </div>
                        {phoneExportFormat === 'international' && (
                            <input
                                type="text"
                                value={countryCode}
                                onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="Country code, e.g. 46"
                                className="mt-3 w-48 p-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                            />
                        )}
                        {(phoneExportFormat === 'national' || phoneExportFormat === 'international') && (
                            <p className="text-xs text-gray-500 dark:text-gray-300 mt-2">
                                Both files' original columns are always kept in the export — this adds one extra "Normalized Phone" column in your chosen format, it never overwrites the originals.
                                {matchDownloadTarget === 'unmatched' && " Since you're exporting rows you rejected as NOT the same number, treat this normalized value with that in mind — it's still just the shared digits the algorithm found, not a confirmed real number."}
                            </p>
                        )}
                    </div>

                    {/* File format for the downloaded file itself */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-4">
                        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">File Format</span>
                        <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                <input type="radio" checked={matchExportFileFormat === 'xlsx'} onChange={() => setMatchExportFileFormat('xlsx')} />
                                <span>Excel (.xlsx)</span>
                            </label>
                            <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                <input type="radio" checked={matchExportFileFormat === 'csv'} onChange={() => setMatchExportFileFormat('csv')} />
                                <span>CSV (.csv)</span>
                            </label>
                            <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                <input type="radio" checked={matchExportFileFormat === 'txt'} onChange={() => setMatchExportFileFormat('txt')} />
                                <span>Text, tab-delimited (.txt)</span>
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        {onSaveAsFile && (
                            <Button
                                variant="secondary"
                                onClick={saveAcceptedMatches}
                                disabled={downloadTargetCount === 0}
                                title="Make this available as a file elsewhere in the app"
                            >
                                <Save className="h-4 w-4 mr-2" />
                                Save to File Manager
                            </Button>
                        )}
                        <Button
                            onClick={() => downloadAcceptedMatches(matchExportFileFormat)}
                            disabled={acceptedExportDisabled}
                        >
                            Download {downloadTargetCount} {matchDownloadTarget === 'matched' ? 'Matched' : 'Unmatched'}
                        </Button>
                    </div>
                </>
            )}
        </div>
      )}
    </div>
  );
};
