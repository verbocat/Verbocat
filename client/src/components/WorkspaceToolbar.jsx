import { useState, useRef, useEffect } from "react";
import { LANGUAGES } from "../constants/languages.js";
import {
  FileText,
  ArrowRight,
  Search,
  Filter,
  Sparkles,
  Save,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  ChevronDown,
  Plus,
  Link2
} from "lucide-react";

export const WorkspaceToolbar = ({
  onCloseProject,
  onExport,
  onLoadProject,
  onSaveProject,
  onRelinkHtml,
  onImportXliff,
  onTranslate,
  onToggleQa,
  isTranslating,
  qaIssuesCount,
  searchQuery,
  segmentsCount,
  setSearchQuery,
  stats,
  sourceLanguage,
  onSourceLanguageChange,
  targetLanguage,
  onTargetLanguageChange,
  fileName,
  theme,
  canTranslate = true,
  fileExtension,
  filterStatus,
  setFilterStatus,
  onUpload
}) => {
  const [showDocMenu, setShowDocMenu] = useState(false);
  const docMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (docMenuRef.current && !docMenuRef.current.contains(event.target)) {
        setShowDocMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const canAct = segmentsCount > 0;

  return (
    <div className="action-bar">
      {/* ──────────────────────────────────────────────
          ROW 1 — Primary Actions
      ────────────────────────────────────────────── */}
      <div className="action-bar-row1">

        {/* Upload new file */}
        <label className="tb-btn" style={{ cursor: "pointer" }}>
          <Plus style={{ width: 12, height: 12 }} />
          <span>New File</span>
          <input type="file" onChange={onUpload} className="hidden" />
        </label>

        <div className="action-bar-sep" />

        {/* Auto-translate */}
        <button
          onClick={onTranslate}
          disabled={!canAct || isTranslating || !canTranslate}
          className={`tb-btn ${canAct && !isTranslating && canTranslate ? "tb-btn-primary" : ""}`}
        >
          <RefreshCw
            style={{ width: 12, height: 12 }}
            className={isTranslating ? "animate-spin" : ""}
          />
          <span>{isTranslating ? "Translating…" : "Auto-Translate"}</span>
        </button>

        {/* QA Check */}
        <button
          onClick={onToggleQa}
          disabled={!canAct}
          className="tb-btn"
        >
          <Sparkles style={{ width: 12, height: 12, color: "#f59e0b" }} />
          <span>QA Check</span>
          {qaIssuesCount > 0 && (
            <span style={{
              background: "rgba(244,63,94,0.18)",
              color: "#fb7185",
              fontSize: 9,
              fontWeight: 700,
              borderRadius: 99,
              padding: "1px 6px",
              border: "1px solid rgba(244,63,94,0.25)"
            }}>
              {qaIssuesCount}
            </span>
          )}
        </button>

        <div className="action-bar-sep" style={{ marginLeft: "auto" }} />

        {/* Document dropdown */}
        <div className="relative" ref={docMenuRef}>
          <button
            onClick={() => setShowDocMenu(!showDocMenu)}
            className="tb-btn"
          >
            <FileText style={{ width: 12, height: 12 }} />
            <span>Document</span>
            <ChevronDown style={{ width: 10, height: 10, marginLeft: 1 }} />
          </button>

          {showDocMenu && (
            <div className="dropdown-menu">
              {/* Save Session */}
              <button
                className="dropdown-item"
                disabled={!canAct}
                onClick={() => { onSaveProject(); setShowDocMenu(false); }}
              >
                <Save style={{ width: 13, height: 13, opacity: 0.7 }} />
                Save Session
              </button>

              {/* Import XLIFF */}
              <label className={`dropdown-item ${!canAct ? "opacity-30 pointer-events-none" : "cursor-pointer"}`}>
                <Upload style={{ width: 13, height: 13, opacity: 0.7 }} />
                Import XLIFF
                <input
                  type="file"
                  accept=".xlf,.xliff"
                  onChange={(e) => { onImportXliff(e); setShowDocMenu(false); }}
                  className="hidden"
                  disabled={!canAct}
                />
              </label>

              {/* Relink Template */}
              <label className={`dropdown-item ${!canAct ? "opacity-30 pointer-events-none" : "cursor-pointer"}`}>
                <Link2 style={{ width: 13, height: 13, opacity: 0.7 }} />
                Relink Template
                <input
                  type="file"
                  accept=".html,.htm,.docx,.pptx,.xlsx,.txt"
                  onChange={(e) => { onRelinkHtml(e); setShowDocMenu(false); }}
                  className="hidden"
                  disabled={!canAct}
                />
              </label>

              <div className="dropdown-sep" />

              {/* Close file */}
              <button
                className="dropdown-item danger"
                disabled={!canAct}
                onClick={() => { onCloseProject(); setShowDocMenu(false); }}
              >
                <Trash2 style={{ width: 13, height: 13 }} />
                Close File
              </button>
            </div>
          )}
        </div>

        {/* Export */}
        <button
          onClick={onExport}
          disabled={!canAct}
          className={`tb-btn ${canAct ? "tb-btn-emerald" : ""}`}
        >
          <Download style={{ width: 12, height: 12 }} />
          <span>Export</span>
        </button>

      </div>

      {/* ──────────────────────────────────────────────
          ROW 2 — Languages, Search, Filter
      ────────────────────────────────────────────── */}
      <div className="action-bar-row2">

        {/* Source Language */}
        <div className="lang-select-wrap">
          <select
            value={sourceLanguage}
            onChange={(e) => onSourceLanguageChange(e.target.value)}
            className="lang-select"
          >
            {LANGUAGES.map((lang) => (
              <option key={`src-${lang.code}`} value={lang.code}>
                {lang.flag} {lang.name}
              </option>
            ))}
          </select>
          <span className="lang-select-arrow">▼</span>
        </div>

        {/* Arrow */}
        <span className="lang-arrow-icon">
          <ArrowRight style={{ width: 11, height: 11 }} />
        </span>

        {/* Target Language */}
        <div className="lang-select-wrap">
          <select
            value={targetLanguage}
            onChange={(e) => onTargetLanguageChange(e.target.value)}
            className="lang-select"
          >
            {LANGUAGES.map((lang) => (
              <option key={`tgt-${lang.code}`} value={lang.code}>
                {lang.flag} {lang.name}
              </option>
            ))}
          </select>
          <span className="lang-select-arrow">▼</span>
        </div>

        <div className="action-bar-sep" />

        {/* Search */}
        <div className="search-bar">
          <Search style={{ width: 12, height: 12, color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search source or target…"
          />
        </div>

        {/* Filter */}
        <div className="filter-select-wrap">
          <Filter
            style={{
              width: 11,
              height: 11,
              color: "var(--text-muted)",
              position: "absolute",
              left: 8,
              pointerEvents: "none"
            }}
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Segments</option>
            <option value="translated">Translated</option>
            <option value="untranslated">Untranslated</option>
            <option value="verified">Verified</option>
          </select>
          <span style={{
            position: "absolute",
            right: 8,
            fontSize: 7,
            color: "var(--text-muted)",
            pointerEvents: "none"
          }}>▼</span>
        </div>

        {/* Segment count pill */}
        {stats && segmentsCount > 0 && (
          <span style={{
            marginLeft: "auto",
            fontSize: 10,
            fontWeight: 600,
            fontFamily: "'IBM Plex Mono', monospace",
            color: "var(--text-muted)",
            flexShrink: 0,
            whiteSpace: "nowrap"
          }}>
            {stats.words.toLocaleString()} words · {stats.progress}% verified
          </span>
        )}

      </div>
    </div>
  );
};
