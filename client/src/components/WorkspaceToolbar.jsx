import { useState, useRef, useEffect } from "react";
import { LANGUAGES } from "../constants/languages.js";
import {
  FileText, ArrowRight, Search, Filter, Sparkles, Eye,
  Save, Upload, Download, Trash2, RefreshCw, ChevronDown, Plus, Link2,
  FolderOpen, Sliders, GitBranch, Check, BookOpen, ShieldAlert,
  CheckCircle2, XCircle, X
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
  lengthRestrictionEnabled, onToggleLengthRestriction,
  forbiddenTermsCount = 0, forbiddenTermsEnabled = true, onOpenForbiddenTerms,
  onAcceptAllChanges, hasTrackedChanges, onApplyGlossary,
  isAllSelected, onToggleSelectAll, selectedCount = 0,
  onTranslateSelected, onVerifySelected, onUnverifySelected,
  onCopySourceToTargetSelected, onClearTargetSelected, onClearSelection,
  showLivePreview = false, onToggleLivePreview, isPreviewLoading = false,
  hasAutoTranslation = true, hasAutoQc = true
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
        {hasAutoTranslation && (
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
        )}

        {/* QA Check */}
        {hasAutoQc && (
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
        )}

        {/* Run QC */}
        {hasAutoQc && (
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
        )}

        {/* Live Preview Toggle */}
        <button
          onClick={onToggleLivePreview}
          disabled={!canAct}
          className={`ab ${showLivePreview ? "ab-preview-active" : ""}`}
          style={showLivePreview ? {
            background: "rgba(99,102,241,0.2)",
            color: "#818cf8",
            border: "1px solid rgba(99,102,241,0.4)"
          } : undefined}
        >
          <Eye
            style={{ width: 12, height: 12, color: showLivePreview ? "#818cf8" : "var(--text-muted)", flexShrink: 0 }}
            className={isPreviewLoading ? "animate-spin" : ""}
          />
          <span>{showLivePreview ? "Hide Preview" : "Live Preview"}</span>
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

        <button
          onClick={onToggleLengthRestriction}
          className="ab"
          style={
            lengthRestrictionEnabled
              ? {
                  background: "rgba(99,102,241,0.3)",
                  color: "#fff",
                  border: "1px solid rgba(99,102,241,0.6)",
                  marginLeft: "8px",
                  display: "flex",
                  alignItems: "center",
                  padding: "2px 6px",
                  borderRadius: "4px"
                }
              : {
                  background: "rgba(200,200,200,0.2)",
                  color: "var(--text-muted)",
                  border: "1px solid rgba(99,102,241,0.4)",
                  marginLeft: "8px",
                  display: "flex",
                  alignItems: "center",
                  padding: "2px 6px",
                  borderRadius: "4px"
                }
          }
          title="Toggle segment word length restrictions"
        >
          <Sliders style={{ width: 12, height: 12, color: lengthRestrictionEnabled ? "#fff" : "var(--text-muted)", flexShrink: 0 }} />
          <span style={{ marginLeft: "4px" }}>Length Limits: {lengthRestrictionEnabled ? "ON" : "OFF"}</span>
        </button>

        {/* Forbidden Terms Guard */}
        <button
          onClick={onOpenForbiddenTerms}
          className="ab"
          style={
            forbiddenTermsEnabled && forbiddenTermsCount > 0
              ? {
                  background: "rgba(244,63,94,0.2)",
                  color: "#f43f5e",
                  border: "1px solid rgba(244,63,94,0.5)",
                  marginLeft: "8px",
                  display: "flex",
                  alignItems: "center",
                  padding: "2px 6px",
                  borderRadius: "4px"
                }
              : {
                  background: "rgba(200,200,200,0.2)",
                  color: "var(--text-muted)",
                  border: "1px solid rgba(244,63,94,0.3)",
                  marginLeft: "8px",
                  display: "flex",
                  alignItems: "center",
                  padding: "2px 6px",
                  borderRadius: "4px"
                }
          }
          title="Configure Forbidden Terms Guard"
        >
          <ShieldAlert style={{ width: 12, height: 12, color: forbiddenTermsEnabled && forbiddenTermsCount > 0 ? "#f43f5e" : "var(--text-muted)", flexShrink: 0 }} />
          <span style={{ marginLeft: "4px" }}>
            Forbidden Terms: {forbiddenTermsEnabled ? (forbiddenTermsCount > 0 ? `${forbiddenTermsCount}` : "ON") : "OFF"}
          </span>
        </button>

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
                  <input type="file" accept=".html,.htm,.docx,.pptx,.xlsx,.txt,.pdf,.srt"
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

        {/* Selected Segments Bulk Actions Strip */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 px-3 py-1 rounded-xl text-xs font-bold text-indigo-400 select-none mr-3 animate-in fade-in shrink-0">
            <span className="flex items-center gap-1 font-extrabold text-white bg-indigo-600 px-2 py-0.5 rounded-md text-[10px]">
              {selectedCount} Selected
            </span>

            {hasAutoTranslation && onTranslateSelected && (
              <button
                type="button"
                onClick={onTranslateSelected}
                disabled={isTranslating}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 font-bold text-[11px] transition-all cursor-pointer border border-indigo-500/30"
                title="Auto-translate selected segments"
              >
                <Sparkles size={12} />
                <span>Translate</span>
              </button>
            )}

            {onVerifySelected && (
              <button
                type="button"
                onClick={onVerifySelected}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[11px] transition-all cursor-pointer border border-emerald-500/30"
                title="Mark selected segments as verified"
              >
                <CheckCircle2 size={12} />
                <span>Verify</span>
              </button>
            )}

            {onUnverifySelected && (
              <button
                type="button"
                onClick={onUnverifySelected}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-[11px] transition-all cursor-pointer border border-amber-500/30"
                title="Unverify selected segments"
              >
                <XCircle size={12} />
                <span>Unverify</span>
              </button>
            )}

            {onCopySourceToTargetSelected && (
              <button
                type="button"
                onClick={onCopySourceToTargetSelected}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 font-bold text-[11px] transition-all cursor-pointer border border-blue-500/30"
                title="Copy source text to target for selected segments"
              >
                <ArrowRight size={12} />
                <span>Copy Source</span>
              </button>
            )}

            {onClearTargetSelected && (
              <button
                type="button"
                onClick={onClearTargetSelected}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold text-[11px] transition-all cursor-pointer border border-rose-500/30"
                title="Clear target text for selected segments"
              >
                <Trash2 size={12} />
                <span>Clear Target</span>
              </button>
            )}

            {onClearSelection && (
              <button
                type="button"
                onClick={onClearSelection}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-all cursor-pointer ml-1"
                title="Deselect All"
              >
                <X size={14} />
              </button>
            )}
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
