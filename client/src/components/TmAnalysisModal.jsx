import React, { useState, useEffect } from "react";
import { X, BarChart3, Download, RefreshCw, Layers, FileText, ChevronDown, ChevronRight, Check, Sparkles } from "lucide-react";
import { fetchTmAnalysis, fetchProjectTmAnalysis } from "../services/api";

const LANGUAGES = [
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "mr", name: "Marathi" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "bn", name: "Bengali" },
  { code: "gu", name: "Gujarati" },
  { code: "kn", name: "Kannada" },
  { code: "ml", name: "Malayalam" },
  { code: "pa", name: "Punjabi" }
];

export const TmAnalysisModal = ({
  show,
  onClose,
  projectId = null,
  projectName = "",
  documentId = null,
  targetLanguage = "hi",
  availableLanguages = [],
  showToast
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [activeTargetLang, setActiveTargetLang] = useState(targetLanguage || "hi");
  const [analysisMode, setAnalysisMode] = useState("exclusive"); // 'exclusive' | 'inclusive'
  const [expandedFileIds, setExpandedFileIds] = useState([]);

  const isProjectLevel = Boolean(projectId);

  useEffect(() => {
    if (targetLanguage) {
      setActiveTargetLang(targetLanguage);
    }
  }, [targetLanguage]);

  const loadAnalysis = async () => {
    if (!show) return;
    if (!projectId && !documentId) return;

    setLoading(true);
    try {
      if (isProjectLevel) {
        const res = await fetchProjectTmAnalysis(projectId, activeTargetLang, {
          mode: analysisMode,
          crossFile: analysisMode === "exclusive"
        });
        setData(res);
      } else {
        const res = await fetchTmAnalysis(documentId, activeTargetLang);
        setData(res);
      }
    } catch (err) {
      console.error("Failed to fetch TM analysis:", err);
      showToast && showToast("Failed to run volume analysis", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show) {
      loadAnalysis();
    } else {
      setData(null);
      setExpandedFileIds([]);
    }
  }, [show, projectId, documentId, activeTargetLang, analysisMode]);

  if (!show) return null;

  const toggleExpandFile = (docId) => {
    setExpandedFileIds(prev =>
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    );
  };

  const getLanguageName = (code) => {
    if (!code) return "";
    const found = LANGUAGES.find(l => l.code === code.toLowerCase());
    return found ? found.name : code.toUpperCase();
  };

  const exportCsv = () => {
    if (!data || !data.categories) return;

    const headers = ["Category", "Segments", "Words", "Percentage", "Billing Weight", "Weighted Words"];
    const rows = Object.keys(data.categories).map((key) => {
      const cat = data.categories[key];
      return [
        cat.name,
        cat.count,
        cat.words,
        `${cat.percentage}%`,
        `${Math.round(cat.billingWeight * 100)}%`,
        cat.weightedWords
      ];
    });

    // Add totals row
    rows.push([
      "Total",
      data.totalSegments,
      data.totalWords,
      "100%",
      "-",
      data.totalWeightedWords
    ]);

    // If project level, append per-file breakdowns
    if (data.fileBreakdowns && data.fileBreakdowns.length > 0) {
      rows.push([]);
      rows.push(["--- Per-File Volume Analysis Breakdown ---"]);
      rows.push(["File Name", "Total Segments", "Total Words", "Weighted Words", "Savings %", "Cross-File Words", "Internal Rep Words"]);
      data.fileBreakdowns.forEach(fb => {
        rows.push([
          fb.fileName,
          fb.totalSegments,
          fb.totalWords,
          fb.totalWeightedWords,
          `${fb.savingsPercentage}%`,
          fb.crossFileRepetitionWords || 0,
          fb.internalRepetitionWords || 0
        ]);
      });
    }

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const filename = isProjectLevel
      ? `TM_Analysis_Project_${(projectName || projectId).replace(/\s+/g, "_")}_${activeTargetLang}_${analysisMode}.csv`
      : `TM_Analysis_Doc_${(data.fileName || documentId).replace(/\s+/g, "_")}_${activeTargetLang}.csv`;

    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const CATEGORY_COLORS = {
    ice: "#10b981",
    exact: "#6366f1",
    crossFileRepetitions: "#06b6d4",
    internalRepetitions: "#8b5cf6",
    fuzzy95: "#fbbf24",
    fuzzy85: "#f59e0b",
    fuzzy75: "#ea580c",
    fuzzy50: "#dc2626",
    new: "#94a3b8"
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 text-xs">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]/50 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0">
              <BarChart3 size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[var(--text-primary)] truncate">
                  {isProjectLevel ? "Project Volume & TM Leverage Analysis" : "Document TM Analysis"}
                </h2>
                {isProjectLevel && (
                  <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-semibold">
                    {analysisMode === "exclusive" ? "Exclusive (Cross-File)" : "Inclusive"}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                {isProjectLevel ? `Project: ${projectName || "Workspace"}` : `File: ${data?.fileName || "Document"}`}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Controls Bar: Target Language & Analysis Mode Switcher */}
        <div className="px-6 py-2.5 bg-[var(--bg-base)] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Target Language Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">Target Locale:</span>
            <div className="flex items-center gap-1 bg-[var(--bg-surface)] p-0.5 rounded-lg border border-[var(--border-subtle)]">
              {(availableLanguages && availableLanguages.length > 0 ? availableLanguages : [activeTargetLang]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setActiveTargetLang(lang)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                    activeTargetLang === lang
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  {lang.toUpperCase()} - {getLanguageName(lang)}
                </button>
              ))}
            </div>
          </div>

          {/* Exclusive vs Inclusive Mode Selector (for Project Level) */}
          {isProjectLevel && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">Mode:</span>
              <div className="flex items-center bg-[var(--bg-surface)] p-0.5 rounded-lg border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setAnalysisMode("exclusive")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                    analysisMode === "exclusive"
                      ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-semibold"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent"
                  }`}
                  title="Cross-file repetitions across all files are leveraged sequentially"
                >
                  <Sparkles size={12} className="text-cyan-400" />
                  Exclusive (Cross-File)
                </button>
                <button
                  type="button"
                  onClick={() => setAnalysisMode("inclusive")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                    analysisMode === "inclusive"
                      ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 font-semibold"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent"
                  }`}
                  title="Files are analyzed independently without cross-file repetition deductions"
                >
                  Inclusive
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 select-text">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <RefreshCw className="animate-spin text-indigo-400" size={28} />
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Analyzing Translation Memory and Cross-File Repetitions...
              </p>
            </div>
          ) : !data || !data.categories ? (
            <div className="text-center py-16 text-[var(--text-muted)]">
              No analysis data available for this selection.
            </div>
          ) : (
            <>
              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Total Words */}
                <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl p-3.5 text-center shadow-xs">
                  <div className="text-[10px] uppercase font-semibold text-[var(--text-muted)] tracking-wider">Total Source</div>
                  <div className="text-xl font-bold text-[var(--text-primary)] mt-1 font-mono">
                    {data.totalWords?.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {data.totalSegments} segments {isProjectLevel ? `(${data.totalDocuments || 1} files)` : ""}
                  </div>
                </div>

                {/* Weighted Billable Words */}
                <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl p-3.5 text-center shadow-xs">
                  <div className="text-[10px] uppercase font-semibold text-[var(--text-muted)] tracking-wider">Weighted Words</div>
                  <div className="text-xl font-bold text-indigo-400 mt-1 font-mono">
                    {data.totalWeightedWords?.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Billable equivalent</div>
                </div>

                {/* TM & Repetition Savings */}
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3.5 text-center shadow-xs">
                  <div className="text-[10px] uppercase font-semibold text-emerald-400 tracking-wider">Total Savings</div>
                  <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">
                    {data.savingsPercentage}%
                  </div>
                  <div className="text-[10px] text-emerald-400/80 mt-0.5">Efficiency gain</div>
                </div>

                {/* Cross-File Leverage Savings (Exclusive mode) */}
                <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-3.5 text-center shadow-xs">
                  <div className="text-[10px] uppercase font-semibold text-cyan-400 tracking-wider">Cross-File Reps</div>
                  <div className="text-xl font-bold text-cyan-400 mt-1 font-mono">
                    {data.crossFileRepetitionWords?.toLocaleString() || 0}
                  </div>
                  <div className="text-[10px] text-cyan-400/80 mt-0.5">Words leveraged</div>
                </div>
              </div>

              {/* Match Coverage Visual Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-medium text-[var(--text-secondary)]">
                  <span>Match Coverage Visualizer</span>
                  <span className="text-emerald-400">{data.savingsPercentage}% Overall Leverage</span>
                </div>
                <div className="h-3 w-full bg-[var(--bg-input)] rounded-full overflow-hidden border border-[var(--border-subtle)] flex shadow-inner">
                  {Object.keys(data.categories).map((key) => {
                    const cat = data.categories[key];
                    if (!cat || cat.words === 0) return null;
                    const color = CATEGORY_COLORS[key] || "#6366f1";
                    return (
                      <div
                        key={key}
                        style={{ width: `${cat.percentage}%`, backgroundColor: color }}
                        className="h-full transition-all duration-300 hover:opacity-80"
                        title={`${cat.name}: ${cat.words.toLocaleString()} words (${cat.percentage}%)`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Detailed Category Table */}
              <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 text-[10px] uppercase font-semibold tracking-wider text-[var(--text-muted)]">
                      <th className="py-2.5 px-4">Match Category</th>
                      <th className="py-2.5 px-3 text-right">Segments</th>
                      <th className="py-2.5 px-3 text-right">Source Words</th>
                      <th className="py-2.5 px-3 text-right">Words %</th>
                      <th className="py-2.5 px-3 text-right">Billing Weight</th>
                      <th className="py-2.5 px-4 text-right">Weighted Words</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] font-normal">
                    {Object.keys(data.categories).map((key) => {
                      const cat = data.categories[key];
                      const color = CATEGORY_COLORS[key] || "#6366f1";
                      return (
                        <tr key={key} className="hover:bg-[var(--bg-hover)] transition-colors">
                          <td className="py-2.5 px-4 font-medium text-[var(--text-primary)]">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              <span>{cat.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[var(--text-secondary)]">{cat.count}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-medium text-[var(--text-primary)]">
                            {cat.words?.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[var(--text-secondary)]">{cat.percentage}%</td>
                          <td className="py-2.5 px-3 text-right font-mono text-[var(--text-secondary)]">
                            {Math.round(cat.billingWeight * 100)}%
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-indigo-400">
                            {cat.weightedWords?.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Summary Totals Row */}
                    <tr className="bg-[var(--bg-surface)] font-bold border-t border-[var(--border-medium)]">
                      <td className="py-3 px-4 text-[var(--text-primary)]">Total</td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--text-primary)]">{data.totalSegments}</td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--text-primary)]">{data.totalWords?.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">100%</td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--text-muted)]">—</td>
                      <td className="py-3 px-4 text-right font-mono text-indigo-400 text-sm">{data.totalWeightedWords?.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Per-File Breakdown List (for Project Level) */}
              {isProjectLevel && data.fileBreakdowns && data.fileBreakdowns.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] uppercase font-semibold text-[var(--text-muted)] tracking-wider">
                    Per-Document Breakdown ({data.fileBreakdowns.length} files)
                  </div>
                  <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden divide-y divide-[var(--border-subtle)] bg-[var(--bg-panel)]">
                    {data.fileBreakdowns.map((file) => {
                      const isExpanded = expandedFileIds.includes(file.documentId);
                      return (
                        <div key={file.documentId} className="transition-colors">
                          <div
                            onClick={() => toggleExpandFile(file.documentId)}
                            className="p-3 flex items-center justify-between gap-3 hover:bg-[var(--bg-hover)] cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isExpanded ? <ChevronDown size={14} className="text-[var(--text-muted)] shrink-0" /> : <ChevronRight size={14} className="text-[var(--text-muted)] shrink-0" />}
                              <FileText size={14} className="text-indigo-400 shrink-0" />
                              <span className="font-semibold text-[var(--text-primary)] truncate">{file.fileName}</span>
                            </div>

                            <div className="flex items-center gap-4 text-xs shrink-0 font-mono">
                              <span className="text-[var(--text-secondary)]">{file.totalWords?.toLocaleString()} words</span>
                              <span className="text-indigo-400 font-semibold">{file.totalWeightedWords?.toLocaleString()} weighted</span>
                              {file.crossFileRepetitionWords > 0 && (
                                <span className="text-cyan-400 text-[10px] font-semibold bg-cyan-500/10 px-1.5 py-0.2 rounded border border-cyan-500/20">
                                  +{file.crossFileRepetitionWords} cross-file
                                </span>
                              )}
                              <span className="text-emerald-400 font-semibold">{file.savingsPercentage}% savings</span>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="p-3 bg-[var(--bg-surface)]/60 border-t border-[var(--border-subtle)]">
                              <table className="w-full text-left border-collapse text-[11px]">
                                <thead>
                                  <tr className="text-[9px] uppercase font-semibold text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                                    <th className="py-1 px-2">Category</th>
                                    <th className="py-1 px-2 text-right">Words</th>
                                    <th className="py-1 px-2 text-right">%</th>
                                    <th className="py-1 px-2 text-right">Weighted</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {Object.keys(file.categories).map((k) => {
                                    const fc = file.categories[k];
                                    if (fc.words === 0) return null;
                                    return (
                                      <tr key={k} className="border-b border-[var(--border-subtle)]/50">
                                        <td className="py-1 px-2 text-[var(--text-primary)]">{fc.name}</td>
                                        <td className="py-1 px-2 text-right font-mono">{fc.words?.toLocaleString()}</td>
                                        <td className="py-1 px-2 text-right font-mono text-[var(--text-secondary)]">{fc.percentage}%</td>
                                        <td className="py-1 px-2 text-right font-mono font-semibold text-indigo-400">{fc.weightedWords?.toLocaleString()}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)]/70 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <Layers size={13} />
            <span>Multi-pass CAT repetition & fuzzy match analysis</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              disabled={loading || !data}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-[var(--bg-hover)] hover:bg-[var(--border-medium)] text-[var(--text-primary)] text-xs font-medium transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
