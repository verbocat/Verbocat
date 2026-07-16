import { useState, useRef, useEffect } from "react";
import { LANGUAGES } from "../constants/languages.js";
import {
  FileText, ArrowRight, Search, Filter, Sparkles,
  Save, Upload, Download, Trash2, RefreshCw, ChevronDown, Plus, Link2,
  FolderOpen, Sliders, GitBranch, Check, BookOpen
} from "lucide-react";

export const WorkspaceToolbar = ({
  onDeleteProject, onExport, onLoadProject, onSaveProject,
  onRelinkHtml, onImportXliff, onImportTargetHtml, onTranslate, onToggleQa,
  isTranslating, qaIssuesCount, searchQuery, segmentsCount,
  setSearchQuery, stats, sourceLanguage, onSourceLanguageChange,
  targetLanguage, onTargetLanguageChange, fileName, theme,
  canTranslate = true, fileExtension, filterStatus, setFilterStatus, onUpload,
  onRunQc, isAuditing,
  trackChangesEnabled, onToggleTrackChanges, isOwner,
  onAcceptAllChanges, hasTrackedChanges, onApplyGlossary,
  isAllSelected, onToggleSelectAll, selectedCount
}) => {
  const [showDocMenu, setShowDocMenu] = useState(false);
  const docMenuRef = useRef(null);
  const selectAllRef = useRef(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedCount > 0 && selectedCount < segmentsCount;
    }
  }, [selectedCount, segmentsCount]);

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

        {/* Run QC */}
        <button
          onClick={onRunQc}
          disabled={!canAct || isAuditing}
          className={`ab ${canAct && !isAuditing ? "ab-qc" : ""}`}
        >
          <RefreshCw
            style={{ width: 12, height: 12, color: "var(--indigo-400)", flexShrink: 0 }}
            className={isAuditing ? "animate-spin" : ""}
          />
          <span>{isAuditing ? "Auditing…" : "Run QC"}</span>
        </button>

        {/* Track Changes (Owner Only) */}
        {isOwner && (
          <button
            onClick={onToggleTrackChanges}
            disabled={!canAct}
            className={`ab ${trackChangesEnabled ? "ab-track-changes-active" : ""}`}
            style={trackChangesEnabled ? {
              background: "rgba(16,185,129,0.15)",
              color: "var(--emerald)",
              border: "1px solid rgba(16,185,129,0.25)"
            } : undefined}
          >
            <GitBranch style={{ width: 12, height: 12, color: trackChangesEnabled ? "var(--emerald)" : "var(--text-muted)", flexShrink: 0 }} />
            <span>Track Changes: {trackChangesEnabled ? "ON" : "OFF"}</span>
          </button>
        )}

        {/* Accept All Changes (Owner Only) */}
        {isOwner && hasTrackedChanges && (
          <button
            onClick={onAcceptAllChanges}
            disabled={!canAct}
            className="ab"
            style={{
              background: "rgba(16,185,129,0.15)",
              color: "var(--emerald)",
              border: "1px solid rgba(16,185,129,0.25)"
            }}
          >
            <Check style={{ width: 12, height: 12, color: "var(--emerald)", flexShrink: 0 }} />
            <span>Accept All Changes</span>
          </button>
        )}



        {/* Document dropdown */}
        {isOwner && (
          <div className="relative" ref={docMenuRef}>
            <button onClick={() => setShowDocMenu(!showDocMenu)} className="ab">
              <FileText style={{ width: 12, height: 12, flexShrink: 0 }} />
              <span>Document</span>
              <ChevronDown style={{ width: 10, height: 10, marginLeft: 1, flexShrink: 0 }} />
            </button>

            {showDocMenu && (
              <div className="dropdown-menu" style={{ top: "calc(100% + 4px)", left: 0 }}>
                <label className="dropdown-item cursor-pointer">
                  <FolderOpen style={{ width: 13, height: 13, opacity: 0.65, flexShrink: 0 }} />
                  Load Saved File
                  <input type="file" accept=".json"
                    onChange={(e) => { onLoadProject(e); setShowDocMenu(false); }}
                    className="hidden" />
                </label>

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
                  <input type="file" accept=".html,.htm,.docx,.pptx,.xlsx,.txt,.pdf"
                    onChange={(e) => { onRelinkHtml(e); setShowDocMenu(false); }}
                    className="hidden" disabled={!canAct} />
                </label>
              </div>
            )}
          </div>
        )}



        {/* ── Stats strip — restored ── */}


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

        {/* Select All Checkbox */}
        {segmentsCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginRight: "12px", borderRight: "1px solid var(--border-subtle)", paddingRight: "12px" }}>
            <input
              type="checkbox"
              ref={selectAllRef}
              checked={isAllSelected}
              onChange={(e) => onToggleSelectAll(e.target.checked)}
              style={{ cursor: "pointer", width: "13px", height: "13px" }}
              title="Select all segments"
            />
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", userSelect: "none" }}>
              Select All
            </span>
          </div>
        )}

        {/* Source language */}
        <div className="lang-wrap">
          <select value={sourceLanguage} onChange={(e) => onSourceLanguageChange(e.target.value)} className="lang-select" disabled={!isOwner}>
            {LANGUAGES.filter((l) => !l.hidden).map((l) => (
              <option key={`src-${l.code}`} value={l.code}>{l.flag} {l.name}</option>
            ))}
          </select>
          <span className="lang-arrow">▼</span>
        </div>

        {/* Arrow */}
        <ArrowRight style={{ width: 11, height: 11, color: "var(--text-muted)", flexShrink: 0 }} />

        {/* Target language */}
        <div className="lang-wrap">
          <select value={targetLanguage} onChange={(e) => onTargetLanguageChange(e.target.value)} className="lang-select" disabled={!isOwner}>
            {LANGUAGES.filter((l) => !l.hidden).map((l) => (
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
            <option value="duplicate">Duplicates</option>
            <option value="ice">ICE Matches</option>
            <option value="tm">TM Matches</option>
            <option value="fuzzy">Fuzzy Matches</option>
            <option value="normal">Normal Translations</option>
          </select>
          <span className="filter-arrow">▼</span>
        </div>

      </div>
    </div>
  );
};
