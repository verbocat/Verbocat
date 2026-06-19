import { useState, useRef, useEffect } from "react";
import { LANGUAGES } from "../constants/languages.js";
import {
  FileText, ArrowRight, Search, Filter, Sparkles,
  Save, Upload, Download, Trash2, RefreshCw, ChevronDown, Plus, Link2
} from "lucide-react";

export const WorkspaceToolbar = ({
  onCloseProject, onExport, onLoadProject, onSaveProject,
  onRelinkHtml, onImportXliff, onTranslate, onToggleQa,
  isTranslating, qaIssuesCount, searchQuery, segmentsCount,
  setSearchQuery, stats, sourceLanguage, onSourceLanguageChange,
  targetLanguage, onTargetLanguageChange, fileName, theme,
  canTranslate = true, fileExtension, filterStatus, setFilterStatus, onUpload
}) => {
  const [showDocMenu, setShowDocMenu] = useState(false);
  const docMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (docMenuRef.current && !docMenuRef.current.contains(e.target)) setShowDocMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const canAct = segmentsCount > 0;

  return (
    <div className="action-bar">

      {/* ── ROW 1 — Actions + Stats ── */}
      <div className="action-row1">

        {/* New File — always prominent */}
        <label className="ab ab-newfile" style={{ cursor: "pointer" }}>
          <Plus style={{ width: 12, height: 12, flexShrink: 0 }} />
          <span>New File</span>
          <input type="file" onChange={onUpload} className="hidden" />
        </label>

        <div className="action-sep" />

        {/* Auto-Translate */}
        <button
          onClick={onTranslate}
          disabled={!canAct || isTranslating || !canTranslate}
          className={`ab ${canAct && !isTranslating && canTranslate ? "ab-translate" : ""}`}
        >
          <RefreshCw
            style={{ width: 12, height: 12, flexShrink: 0 }}
            className={isTranslating ? "animate-spin" : ""}
          />
          <span>{isTranslating ? "Translating…" : "Auto-Translate"}</span>
        </button>

        {/* QA Check */}
        <button onClick={onToggleQa} disabled={!canAct} className="ab">
          <Sparkles style={{ width: 12, height: 12, color: "var(--amber)", flexShrink: 0 }} />
          <span>QA Check</span>
          {qaIssuesCount > 0 && (
            <span style={{
              background: "rgba(244,63,94,0.15)",
              color: "var(--text-rose)",
              border: "1px solid rgba(244,63,94,0.25)",
              borderRadius: 99,
              fontSize: 9,
              fontWeight: 700,
              padding: "0 5px",
              lineHeight: "16px"
            }}>
              {qaIssuesCount}
            </span>
          )}
        </button>

        {/* Document dropdown */}
        <div className="relative" ref={docMenuRef}>
          <button onClick={() => setShowDocMenu(!showDocMenu)} className="ab">
            <FileText style={{ width: 12, height: 12, flexShrink: 0 }} />
            <span>Document</span>
            <ChevronDown style={{ width: 10, height: 10, marginLeft: 1, flexShrink: 0 }} />
          </button>

          {showDocMenu && (
            <div className="dropdown-menu" style={{ top: "calc(100% + 4px)", left: 0 }}>
              <button className="dropdown-item" disabled={!canAct}
                onClick={() => { onSaveProject(); setShowDocMenu(false); }}>
                <Save style={{ width: 13, height: 13, opacity: 0.65, flexShrink: 0 }} />
                Save Session
              </button>

              <label className={`dropdown-item ${!canAct ? "opacity-30 pointer-events-none" : "cursor-pointer"}`}>
                <Upload style={{ width: 13, height: 13, opacity: 0.65, flexShrink: 0 }} />
                Import XLIFF
                <input type="file" accept=".xlf,.xliff"
                  onChange={(e) => { onImportXliff(e); setShowDocMenu(false); }}
                  className="hidden" disabled={!canAct} />
              </label>

              <label className={`dropdown-item ${!canAct ? "opacity-30 pointer-events-none" : "cursor-pointer"}`}>
                <Link2 style={{ width: 13, height: 13, opacity: 0.65, flexShrink: 0 }} />
                Relink Template
                <input type="file" accept=".html,.htm,.docx,.pptx,.xlsx,.txt"
                  onChange={(e) => { onRelinkHtml(e); setShowDocMenu(false); }}
                  className="hidden" disabled={!canAct} />
              </label>

              <div className="dropdown-sep" />

              <button className="dropdown-item danger" disabled={!canAct}
                onClick={() => { onCloseProject(); setShowDocMenu(false); }}>
                <Trash2 style={{ width: 13, height: 13, flexShrink: 0 }} />
                Close File
              </button>
            </div>
          )}
        </div>

        {/* ── Stats strip — restored ── */}
        {canAct && stats && (
          <div className="stats-strip">
            <div className="stat-item">
              <span className="stat-label">Words</span>
              <span className="stat-value">{stats.words.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Unique</span>
              <span className="stat-value">{stats.uniqueWords.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Dup.</span>
              <span className="stat-value">{stats.duplicateWords.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Done</span>
              <span className="stat-value" style={{ color: "var(--text-emerald)" }}>
                {stats.progress}%
              </span>
            </div>
          </div>
        )}

        {/* Push Export to the right */}
        <div style={{ flex: 1 }} />

        {/* Export — premium CTA */}
        <button onClick={onExport} disabled={!canAct} className="ab ab-export">
          <Download style={{ width: 12, height: 12, flexShrink: 0 }} />
          <span>Export</span>
        </button>

      </div>

      {/* ── ROW 2 — Language pair + Search + Filter ── */}
      <div className="action-row2">

        {/* Source language */}
        <div className="lang-wrap">
          <select value={sourceLanguage} onChange={(e) => onSourceLanguageChange(e.target.value)} className="lang-select">
            {LANGUAGES.map((l) => (
              <option key={`src-${l.code}`} value={l.code}>{l.flag} {l.name}</option>
            ))}
          </select>
          <span className="lang-arrow">▼</span>
        </div>

        {/* Arrow */}
        <ArrowRight style={{ width: 11, height: 11, color: "var(--text-muted)", flexShrink: 0 }} />

        {/* Target language */}
        <div className="lang-wrap">
          <select value={targetLanguage} onChange={(e) => onTargetLanguageChange(e.target.value)} className="lang-select">
            {LANGUAGES.map((l) => (
              <option key={`tgt-${l.code}`} value={l.code}>{l.flag} {l.name}</option>
            ))}
          </select>
          <span className="lang-arrow">▼</span>
        </div>

        <div className="action-sep" />

        {/* Search */}
        <div className="search-wrap">
          <Search style={{ width: 11, height: 11, color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search source or target…"
          />
        </div>

        {/* Filter */}
        <div className="filter-wrap">
          <Filter style={{ width: 10, height: 10 }} className="filter-icon" />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="filter-select">
            <option value="all">All Segments</option>
            <option value="translated">Translated</option>
            <option value="untranslated">Untranslated</option>
            <option value="verified">Verified</option>
          </select>
          <span className="filter-arrow">▼</span>
        </div>

      </div>
    </div>
  );
};
