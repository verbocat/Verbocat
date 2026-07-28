import { useMemo, useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import { 
  X, Search, FileUp, FileDown, Database, Edit, Plus, Trash2, Check, RefreshCw, 
  Download, Upload, AlertTriangle, Sparkles, Copy 
} from "lucide-react";

export const GlossaryModal = ({
  darkMode,
  canApplyGlossary,
  glossary,
  glossaryKey,
  glossaryLanguagePairs,
  glossarySourceLang,
  glossaryTargetLang,
  languages,
  onAddRow,
  onApplyGlossary,
  onClearCurrentGlossary,
  onClearSelection,
  onClose,
  onDeleteLanguagePair,
  onDeleteSelected,
  onPasteGlossary,
  onSelectAll,
  onSelectPair,
  onToggleRow,
  onUpdateGlossary,
  selectedGlossaryRows,
  setGlossarySourceLang,
  setGlossaryTargetLang,
  setGlossary,
  show,
  theme,
  onImportTmx
}) => {
  const languageNameMap = useMemo(
    () =>
      Object.fromEntries(
        languages.map((language) => [language.code, language.name])
      ),
    [languages]
  );

  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newRowIndex, setNewRowIndex] = useState(null);
  const [activeView, setActiveView] = useState("list"); // "list", "spreadsheet", "duplicates"
  const [pasteText, setPasteText] = useState("");
  const fileInputRef = useRef(null);
  const tbxFileInputRef = useRef(null);

  // Duplicate Detection Analysis
  const duplicateInfo = useMemo(() => {
    const counts = {};
    const duplicateIndices = new Set();
    const duplicateGroups = {}; // normalizedSource -> array of { source, target, originalIndex }

    glossary.forEach((item, index) => {
      const norm = (item.source || "").trim().toLowerCase();
      if (!norm) return;
      if (!counts[norm]) {
        counts[norm] = [];
      }
      counts[norm].push({ ...item, originalIndex: index });
    });

    Object.entries(counts).forEach(([norm, list]) => {
      if (list.length > 1) {
        duplicateGroups[norm] = list;
        list.forEach(el => duplicateIndices.add(el.originalIndex));
      }
    });

    return {
      duplicateIndices,
      duplicateGroups,
      totalDuplicateCount: duplicateIndices.size,
      duplicateGroupCount: Object.keys(duplicateGroups).length
    };
  }, [glossary]);

  const handleRemoveSubsequentDuplicates = () => {
    const seen = new Set();
    const cleaned = [];
    glossary.forEach(item => {
      const norm = (item.source || "").trim().toLowerCase();
      if (!norm || !seen.has(norm)) {
        if (norm) seen.add(norm);
        cleaned.push(item);
      }
    });
    setGlossary(cleaned);
    if (selectedGlossaryRows.length > 0) onClearSelection();
  };

  const handleAddRow = () => {
    onAddRow();
    setNewRowIndex(glossary.length);
  };

  const handleBlur = (event) => {
    const relatedTarget = event.relatedTarget;
    if (
      !relatedTarget ||
      typeof relatedTarget.closest !== "function" ||
      relatedTarget.closest(".glossary-row") !== event.currentTarget.closest(".glossary-row")
    ) {
      setNewRowIndex(null);
    }
  };

  const handleDeleteRow = (index, event) => {
    if (event) event.stopPropagation();
    setGlossary(glossary.filter((_, idx) => idx !== index));
    if (selectedGlossaryRows.includes(index)) {
      onClearSelection();
    }
  };

  const handleImportSpreadsheet = () => {
    if (!pasteText.trim()) return;
    const rows = pasteText
      .split("\n")
      .map((row) => {
        let cols;
        if (row.includes("\t")) {
          cols = row.split("\t");
        } else if (row.includes("=")) {
          cols = row.split("=");
        } else {
          cols = [row, ""];
        }
        
        const src = cols[0]?.trim();
        const tgt = cols[1]?.trim();
        if (src || tgt) {
          return { source: src || "", target: tgt || "" };
        }
        return null;
      })
      .filter(Boolean);

    if (rows.length > 0) {
      setGlossary([...glossary, ...rows]);
      setPasteText("");
      setActiveView("list");
      setTimeout(() => {
        onApplyGlossary();
      }, 100);
    }
  };

  useEffect(() => {
    if (!show) {
      setIsEditing(false);
    }
  }, [show]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      Papa.parse(event.target.result, {
        complete: (results) => {
          const newGlossary = results.data
            .filter(row => row.length >= 2 && row[0] && row[1])
            .map(row => ({ source: String(row[0]).trim(), target: String(row[1]).trim() }));
          if (newGlossary.length > 0) {
            setGlossary(newGlossary);
            onClearSelection();
          }
        }
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file, "UTF-8");
  };

  /* ── TBX Import ────────────────────────────────────── */
  const handleImportTbx = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(event.target.result, "text/xml");
        const entries = xmlDoc.querySelectorAll("termEntry, conceptEntry");
        const imported = [];

        entries.forEach((entry) => {
          const langSets = entry.querySelectorAll("langSet");
          let sourceTerm = "";
          let targetTerm = "";

          langSets.forEach((ls) => {
            const lang = (ls.getAttribute("xml:lang") || ls.getAttribute("lang") || "").toLowerCase();
            const termEl = ls.querySelector("term");
            const term = termEl ? termEl.textContent.trim() : "";
            if (!term) return;

            const srcCode = glossarySourceLang.toLowerCase();
            const tgtCode = glossaryTargetLang.toLowerCase();

            if (lang === srcCode || lang.startsWith(srcCode + "-") || srcCode.startsWith(lang + "-")) {
              sourceTerm = term;
            } else if (lang === tgtCode || lang.startsWith(tgtCode + "-") || tgtCode.startsWith(lang + "-")) {
              targetTerm = term;
            } else if (!sourceTerm) {
              sourceTerm = term;
            } else if (!targetTerm) {
              targetTerm = term;
            }
          });

          if (sourceTerm && targetTerm) {
            imported.push({ source: sourceTerm, target: targetTerm });
          }
        });

        if (imported.length > 0) {
          setGlossary([...glossary, ...imported]);
        }
      } catch (err) {
        console.error("TBX parse error:", err);
      }
      if (tbxFileInputRef.current) tbxFileInputRef.current.value = "";
    };
    reader.readAsText(file, "UTF-8");
  };

  /* ── TBX Export ────────────────────────────────────── */
  const handleExportTbx = () => {
    if (glossary.length === 0) return;

    const escXml = (str) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    let tbx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    tbx += `<tbx type="TBX-Basic" style="dca" xml:lang="${escXml(glossarySourceLang)}" xmlns="urn:iso:std:iso:30042:ed-2">\n`;
    tbx += `  <tbxHeader>\n`;
    tbx += `    <fileDesc>\n`;
    tbx += `      <sourceDesc><p>Exported from Verbocat Glossary</p></sourceDesc>\n`;
    tbx += `    </fileDesc>\n`;
    tbx += `  </tbxHeader>\n`;
    tbx += `  <text>\n`;
    tbx += `    <body>\n`;

    glossary.forEach((term, i) => {
      tbx += `      <conceptEntry id="c${i + 1}">\n`;
      tbx += `        <langSec xml:lang="${escXml(glossarySourceLang)}">\n`;
      tbx += `          <termSec>\n`;
      tbx += `            <term>${escXml(term.source)}</term>\n`;
      tbx += `          </termSec>\n`;
      tbx += `        </langSec>\n`;
      tbx += `        <langSec xml:lang="${escXml(glossaryTargetLang)}">\n`;
      tbx += `          <termSec>\n`;
      tbx += `            <term>${escXml(term.target)}</term>\n`;
      tbx += `          </termSec>\n`;
      tbx += `        </langSec>\n`;
      tbx += `      </conceptEntry>\n`;
    });

    tbx += `    </body>\n`;
    tbx += `  </text>\n`;
    tbx += `</tbx>`;

    const blob = new Blob([tbx], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `glossary_${glossarySourceLang}-${glossaryTargetLang}.tbx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredGlossary = glossary.map((item, index) => ({...item, originalIndex: index}))
    .filter(item => 
      item.source.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.target.toLowerCase().includes(searchQuery.toLowerCase())
    );

  if (!show) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-5xl w-full flex flex-col overflow-hidden text-left" style={{ borderRadius: "6px", height: "82vh" }}>
        
        {/* Header */}
        <div className="modal-header border-b border-[var(--border-subtle)] flex items-center justify-between p-4 bg-[var(--bg-surface)] shrink-0">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Database className="w-4 h-4 text-[var(--text-accent)]" />
              Document Glossary Manager
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
            title="Close glossary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Split View */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[var(--bg-surface)]">
          
          {/* Sidebar (Language Pairs Management) */}
          <aside className="w-full md:w-[280px] shrink-0 border-b md:border-b-0 md:border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] flex flex-col p-4 overflow-y-auto">
            <div className="space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Glossary Language Selection
              </div>
              
              <div className="flex flex-col gap-3">
                <label className="block space-y-1.5">
                  <span className="text-[10px] font-semibold text-[var(--text-secondary)]">Source</span>
                  <select
                    value={glossarySourceLang}
                    onChange={(event) => setGlossarySourceLang(event.target.value)}
                    className="w-full rounded-lg border border-[var(--border-medium)] bg-[var(--bg-input)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none cursor-pointer focus:border-[var(--accent)]"
                  >
                    {languages.filter((l) => !l.hidden).map((language) => (
                      <option key={`source-${language.code}`} value={language.code}>
                        {language.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[10px] font-semibold text-[var(--text-secondary)]">Target</span>
                  <select
                    value={glossaryTargetLang}
                    onChange={(event) => setGlossaryTargetLang(event.target.value)}
                    className="w-full rounded-lg border border-[var(--border-medium)] bg-[var(--bg-input)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none cursor-pointer focus:border-[var(--accent)]"
                  >
                    {languages.filter((l) => !l.hidden).map((language) => (
                      <option key={`target-${language.code}`} value={language.code}>
                        {language.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Status Stats */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--border-subtle)]">
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${theme.accentSoft}`}>
                  {glossary.length} terms
                </span>
                {selectedGlossaryRows.length > 0 && (
                  <span className="rounded-full bg-[var(--bg-active)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-accent)] border border-[var(--border-subtle)]">
                    {selectedGlossaryRows.length} selected
                  </span>
                )}
                {duplicateInfo.totalDuplicateCount > 0 && (
                  <span className="rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {duplicateInfo.totalDuplicateCount} duplicates
                  </span>
                )}
              </div>

              {/* List of active pairs */}
              <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Active Glossaries
                </div>
                {glossaryLanguagePairs.length > 0 ? (
                  glossaryLanguagePairs.map((pair) => (
                    <div
                      key={pair.key}
                      className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
                        pair.key === glossaryKey
                          ? "border-[var(--accent)] bg-[var(--bg-active)] text-[var(--text-primary)]"
                          : "border-[var(--border-medium)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                      }`}
                      onClick={() => onSelectPair(pair.source, pair.target)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate">{pair.label}</div>
                        <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{pair.count} terms</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteLanguagePair(pair.key);
                        }}
                        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-rose)] hover:bg-[var(--bg-hover)] transition-all cursor-pointer ml-1 font-bold text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-[10px] text-[var(--text-muted)] font-medium p-2 bg-[var(--bg-input)] rounded-lg text-center border border-[var(--border-subtle)]">
                    No active glossaries.
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* Right Section (Content Table & Importer) */}
          <section className="flex-1 flex flex-col min-w-0 bg-[var(--bg-surface)]">
            
            {/* Toolbar Header */}
            <div className="p-4 border-b border-[var(--border-subtle)] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
              {/* Tab selector */}
              <div className="flex gap-1.5 p-1 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-medium)] w-fit shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveView("list")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeView === "list"
                      ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border-subtle)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent"
                  }`}
                >
                  Term List
                </button>

                <button
                  type="button"
                  onClick={() => setActiveView("spreadsheet")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeView === "spreadsheet"
                      ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border-subtle)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent"
                  }`}
                >
                  Spreadsheet Importer
                </button>

                <button
                  type="button"
                  onClick={() => setActiveView("duplicates")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeView === "duplicates"
                      ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border-subtle)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent"
                  }`}
                >
                  <span>Duplicates</span>
                  {duplicateInfo.totalDuplicateCount > 0 && (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {duplicateInfo.totalDuplicateCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2">
                
                {/* Search Bar */}
                <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-input)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]">
                  <Search className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  <input 
                    type="text" 
                    placeholder="Search terms..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="bg-transparent outline-none w-28 placeholder-[var(--text-muted)] font-semibold"
                  />
                </div>

                {/* Edit Button */}
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold border transition-all cursor-pointer shadow-sm ${
                    isEditing 
                      ? "bg-[var(--accent)] border-[var(--accent)] text-white" 
                      : "bg-transparent border-[var(--border-medium)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <Edit className="w-3.5 h-3.5" />
                  {isEditing ? "Editing Mode" : "Edit"}
                </button>

                {/* Delete Selected */}
                {selectedGlossaryRows.length > 0 && (
                  <button
                    onClick={onDeleteSelected}
                    title="Remove Selected"
                    className="rounded-lg p-1.5 border border-transparent bg-[var(--text-rose)]/10 text-[var(--text-rose)] hover:bg-[var(--text-rose)]/20 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                {/* Add Field */}
                <button
                  onClick={handleAddRow}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold px-3 py-1.5 transition-all cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Term
                </button>
              </div>
            </div>

            {/* Content viewport */}
            <div className="flex-1 p-4 overflow-hidden flex flex-col">
              
              {activeView === "spreadsheet" ? (
                /* Paste importer */
                <div className="flex flex-col flex-1 gap-3.5 p-4 rounded-xl border border-[var(--border-medium)] bg-[var(--bg-input)] overflow-hidden">
                  <div className="shrink-0">
                    <h4 className="text-xs font-bold text-[var(--text-primary)]">Spreadsheet Paste Importer</h4>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1 font-semibold leading-relaxed">
                      Copy rows from Excel or Google Sheets (Source term in column 1, Target term in column 2) and paste them here.
                    </p>
                  </div>

                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="Paste cells here...&#10;Example:&#10;hello&#9;नमस्ते&#10;world&#9;दुनिया"
                    className="flex-1 w-full p-3 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none font-mono text-xs resize-none focus:border-[var(--accent)]"
                  />

                  <div className="flex items-center justify-between shrink-0">
                    <button
                      onClick={() => setPasteText("")}
                      className="rounded-lg px-3 py-1.5 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
                    >
                      Clear
                    </button>
                    <button
                      onClick={handleImportSpreadsheet}
                      disabled={!pasteText.trim()}
                      className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                    >
                      Import & Apply
                    </button>
                  </div>
                </div>
              ) : activeView === "duplicates" ? (
                /* Duplicates Inspector & Cleaner View */
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden space-y-3">
                  {/* Summary Header */}
                  <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">
                          Glossary Duplicate Detection
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] font-semibold mt-0.5">
                          Found {duplicateInfo.duplicateGroupCount} repeated source term{duplicateInfo.duplicateGroupCount !== 1 ? "s" : ""} across {duplicateInfo.totalDuplicateCount} rows.
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleRemoveSubsequentDuplicates}
                      disabled={duplicateInfo.totalDuplicateCount === 0}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Auto-Clean Duplicates (Keep First)
                    </button>
                  </div>

                  {/* Duplicate Groups List */}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {duplicateInfo.duplicateGroupCount === 0 ? (
                      <div className="p-12 text-center text-xs text-[var(--text-muted)] font-bold bg-[var(--bg-input)] rounded-xl border border-[var(--border-subtle)] space-y-1">
                        <Check className="w-8 h-8 mx-auto text-emerald-400 opacity-80" />
                        <div className="text-sm text-[var(--text-primary)]">No duplicate source terms found!</div>
                        <div className="text-[11px] font-medium text-[var(--text-muted)]">All glossary source terms in this language pair are unique.</div>
                      </div>
                    ) : (
                      Object.entries(duplicateInfo.duplicateGroups).map(([norm, items], gIdx) => (
                        <div key={gIdx} className="bg-[var(--bg-input)] border border-amber-500/30 rounded-xl p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-extrabold text-[var(--text-primary)] font-mono bg-[var(--bg-surface)] px-2.5 py-1 rounded-md border border-[var(--border-subtle)]">
                                &quot;{items[0].source}&quot;
                              </span>
                              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                                {items.length} Occurrences
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            {items.map((entry, idx) => (
                              <div key={entry.originalIndex} className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs hover:border-amber-500/40 transition">
                                <div className="flex items-center gap-3 font-semibold text-[var(--text-secondary)]">
                                  <span className="text-[10px] font-bold font-mono text-[var(--text-muted)] w-8 text-center bg-[var(--bg-panel)] py-0.5 rounded border border-[var(--border-subtle)]">
                                    #{entry.originalIndex + 1}
                                  </span>
                                  <span className="text-[var(--text-primary)] font-bold">{entry.source}</span>
                                  <span className="text-[var(--text-muted)]">➔</span>
                                  <span className="text-indigo-400 font-bold">{entry.target || "(Empty Target)"}</span>
                                  {idx === 0 && (
                                    <span className="text-[9px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                      Primary (Keep First)
                                    </span>
                                  )}
                                </div>

                                <button
                                  onClick={(e) => handleDeleteRow(entry.originalIndex, e)}
                                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-rose)] hover:bg-[var(--text-rose)]/10 transition cursor-pointer"
                                  title="Delete this duplicate entry"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                /* Terms grid table */
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden border border-[var(--border-medium)] rounded-xl bg-[var(--bg-input)]">
                  
                  {/* Grid Header */}
                  <div className="grid grid-cols-[56px_1fr_1fr_48px] border-b border-[var(--border-subtle)] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] shrink-0 bg-[var(--bg-panel)]">
                    <div className="text-center">No.</div>
                    <div className="pl-1">Source Term</div>
                    <div className="pl-1">Target Term</div>
                    <div className="text-center">Action</div>
                  </div>

                  {/* Grid Rows */}
                  <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] bg-[var(--bg-surface)]">
                    {filteredGlossary.length === 0 ? (
                      <div className="p-10 text-center text-xs text-[var(--text-muted)] font-bold">
                        No glossary rows found.
                      </div>
                    ) : (
                      filteredGlossary.map((item) => {
                        const index = item.originalIndex;
                        const selected = selectedGlossaryRows.includes(index);
                        const isDuplicate = duplicateInfo.duplicateIndices.has(index);

                        return (
                          <div
                            key={`${glossaryKey}-${index}`}
                            onClick={(event) => onToggleRow(index, event)}
                            className={`glossary-row grid grid-cols-[56px_1fr_1fr_48px] items-center cursor-pointer transition-colors ${
                              selected 
                                ? "bg-[var(--bg-active)]" 
                                : isDuplicate 
                                ? "bg-amber-500/10 border-l-2 border-l-amber-500 hover:bg-amber-500/15" 
                                : "hover:bg-[var(--bg-hover)]"
                            }`}
                          >
                            {/* Row number */}
                            <div className="h-full border-r border-[var(--border-subtle)] flex items-center justify-center font-bold text-[10px] text-[var(--text-muted)] bg-[var(--bg-panel)]/50 shrink-0">
                              {index + 1}
                            </div>

                            {/* Source term input */}
                            <div className="h-full border-r border-[var(--border-subtle)] flex items-center relative">
                              <input
                                value={item.source}
                                disabled={!isEditing && newRowIndex !== index}
                                onClick={(event) => event.stopPropagation()}
                                onBlur={handleBlur}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    setNewRowIndex(null);
                                    e.target.blur();
                                  }
                                }}
                                onChange={(event) =>
                                  onUpdateGlossary(index, "source", event.target.value)
                                }
                                placeholder="Enter source term..."
                                className="w-full h-full bg-transparent border-none outline-none text-xs text-[var(--text-primary)] px-3.5 py-2.5 placeholder-[var(--text-muted)] disabled:opacity-85 font-semibold focus:bg-[var(--bg-panel)] pr-20"
                              />
                              {isDuplicate && (
                                <span 
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-extrabold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded pointer-events-none"
                                  title="Duplicate source term in glossary"
                                >
                                  ⚠️ Duplicate
                                </span>
                              )}
                            </div>

                            {/* Target term input */}
                            <div className="h-full flex items-center">
                              <input
                                value={item.target}
                                disabled={!isEditing && newRowIndex !== index}
                                onClick={(event) => event.stopPropagation()}
                                onBlur={handleBlur}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    setNewRowIndex(null);
                                    e.target.blur();
                                  }
                                }}
                                onChange={(event) =>
                                  onUpdateGlossary(index, "target", event.target.value)
                                }
                                placeholder="Enter target term..."
                                className="w-full h-full bg-transparent border-none outline-none text-xs text-[var(--text-primary)] px-3.5 py-2.5 placeholder-[var(--text-muted)] disabled:opacity-85 font-semibold focus:bg-[var(--bg-panel)]"
                              />
                            </div>

                            {/* Delete row */}
                            <div className="h-full border-l border-[var(--border-subtle)] flex items-center justify-center">
                              <button
                                onClick={(e) => handleDeleteRow(index, e)}
                                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-rose)] hover:bg-[var(--text-rose)]/10 transition-all cursor-pointer"
                                title="Delete term"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-[var(--bg-panel)] border-t border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          
          {/* File management */}
          <div className="flex items-center gap-2">
            <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-medium)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold px-3 py-2 transition-all cursor-pointer shadow-sm"
            >
              <FileUp className="w-3.5 h-3.5" />
              Upload CSV
            </button>
            
            <input
              type="file"
              accept=".tmx"
              id="tmx-import-file-input"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  onImportTmx(file);
                }
                e.target.value = "";
              }}
            />
            <button
              onClick={() => document.getElementById("tmx-import-file-input")?.click()}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-medium)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold px-3 py-2 transition-all cursor-pointer shadow-sm"
              title="Import Translation Memory TMX file into database"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Import TMX
            </button>

            <input type="file" accept=".tbx,.xml" ref={tbxFileInputRef} className="hidden" onChange={handleImportTbx} />
            <button
              onClick={() => tbxFileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-medium)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold px-3 py-2 transition-all cursor-pointer shadow-sm"
              title="Import terminology from a TBX file"
            >
              <Upload className="w-3.5 h-3.5" />
              Import TBX
            </button>
            <button
              onClick={handleExportTbx}
              disabled={glossary.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border-medium)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold px-3 py-2 transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export current glossary as a TBX file"
            >
              <Download className="w-3.5 h-3.5" />
              Export TBX
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onApplyGlossary}
              disabled={!canApplyGlossary}
              className="rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
              title={canApplyGlossary ? "Apply glossary terms to segment translations" : "Open a file first to apply glossary terms"}
            >
              Apply to Project
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-transparent border border-[var(--border-medium)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] text-xs font-bold px-4 py-2 transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
