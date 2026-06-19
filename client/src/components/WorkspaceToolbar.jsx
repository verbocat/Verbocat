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
  ChevronDown
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
  setFilterStatus
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

  return (
    <section className="space-y-4 select-none">
      
      {/* ========================================================
          1. STATS DASHBOARD HEADER ROW (Sleek and Horizontal)
          ======================================================== */}
      {segmentsCount > 0 && stats && (
        <div className="bg-[#0b0c11]/40 border border-white/5 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-4 text-xs shadow-lg">
          {/* Left side: Active File Details */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-white truncate max-w-[240px]" title={fileName}>
                {fileName.toUpperCase()}
              </span>
              <span className="text-[9px] text-neutral-500 font-mono">({fileExtension ? fileExtension.toUpperCase() : "FILE"})</span>
            </div>

          </div>

          {/* Right side: Core Stats */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[11px] font-mono text-neutral-400">
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-500 uppercase tracking-wider">Words:</span>
              <span className="font-bold text-white">{stats.words}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-500 uppercase tracking-wider">Unique:</span>
              <span className="font-bold text-white">{stats.uniqueWords}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-500 uppercase tracking-wider">Duplicates:</span>
              <span className="font-bold text-white">{stats.duplicateWords}</span>
            </div>
            {stats.progress !== undefined && (
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-500 uppercase tracking-wider">Progress:</span>
                <span className="font-bold text-white">{stats.progress}%</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          2. TOOLBAR MIDDLE ROW (Grouped and Categorized)
          ======================================================== */}
      <div className="bg-[#0b0c11]/25 border border-white/5 rounded-xl px-4 py-3 flex flex-col lg:flex-row items-center justify-between gap-4 shadow-md">
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-4 w-full">
          
          {/* GROUP 1: Language Pair Selectors */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative flex items-center">
              <select
                value={sourceLanguage}
                onChange={(e) => onSourceLanguageChange(e.target.value)}
                className="bg-neutral-950/40 border border-white/5 hover:border-white/10 rounded-xl pl-3 pr-8 py-2 text-xs font-semibold text-neutral-200 outline-none focus:ring-1 focus:ring-violet-500/30 appearance-none cursor-pointer min-w-[130px]"
              >
                {LANGUAGES.map((lang) => (
                  <option key={`src-${lang.code}`} value={lang.code}>
                    {lang.flag} {lang.name} ({lang.code})
                  </option>
                ))}
              </select>
              <span className="absolute right-3 text-neutral-500 pointer-events-none text-[8px] font-bold">▼</span>
            </div>

            <div className="h-7 w-7 rounded-full border border-white/5 bg-neutral-950/20 flex items-center justify-center text-neutral-500 shrink-0">
              <ArrowRight className="h-3.5 w-3.5" />
            </div>

            <div className="relative flex items-center">
              <select
                value={targetLanguage}
                onChange={(e) => onTargetLanguageChange(e.target.value)}
                className="bg-neutral-950/40 border border-white/5 hover:border-white/10 rounded-xl pl-3 pr-8 py-2 text-xs font-semibold text-neutral-200 outline-none focus:ring-1 focus:ring-violet-500/30 appearance-none cursor-pointer min-w-[130px]"
              >
                {LANGUAGES.map((lang) => (
                  <option key={`tgt-${lang.code}`} value={lang.code}>
                    {lang.flag} {lang.name} ({lang.code})
                  </option>
                ))}
              </select>
              <span className="absolute right-3 text-neutral-500 pointer-events-none text-[8px] font-bold">▼</span>
            </div>
          </div>

          {/* Divider 1 */}
          <div className="hidden lg:block h-5 w-px bg-white/10 mx-1 shrink-0" />

          {/* GROUP 2: AI & QA Operations */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Auto-Translate Button */}
            <button
              onClick={onTranslate}
              disabled={segmentsCount === 0 || isTranslating || !canTranslate}
              className={`border rounded-xl px-3.5 py-2 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                segmentsCount === 0 || isTranslating || !canTranslate
                  ? "border-white/5 bg-slate-400/5 text-slate-500 cursor-not-allowed opacity-50"
                  : "border-violet-500/35 bg-violet-950/40 text-violet-300 hover:bg-violet-900/30"
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTranslating ? 'animate-spin' : ''}`} />
              <span>{isTranslating ? "Translating..." : "Auto-Translate"}</span>
            </button>

            {/* QA Check Button */}
            <button
              onClick={onToggleQa}
              disabled={segmentsCount === 0}
              className={`border rounded-xl px-3.5 py-2 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                segmentsCount === 0
                  ? "border-white/5 bg-slate-400/5 text-slate-500 cursor-not-allowed opacity-50"
                  : "border-white/10 bg-neutral-900/40 text-neutral-300 hover:bg-white/5 hover:border-white/15"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>QA Check</span>
              {qaIssuesCount > 0 && (
                <span className="ml-1 rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[9px] text-rose-300 font-bold">
                  {qaIssuesCount}
                </span>
              )}
            </button>
          </div>

          {/* Divider 2 */}
          <div className="hidden lg:block h-5 w-px bg-white/10 mx-1 shrink-0" />

          {/* GROUP 3: Document & Session Operations (Dropdown + Export) */}
          <div className="flex items-center gap-2.5 shrink-0 ml-auto lg:ml-0">
            
            {/* Document Action Dropdown */}
            <div className="relative" ref={docMenuRef}>
              <button
                onClick={() => setShowDocMenu(!showDocMenu)}
                className="border border-white/10 bg-neutral-900/40 text-neutral-300 hover:bg-white/5 rounded-xl px-3.5 py-2 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer hover:border-white/15 active:scale-98"
              >
                <FileText className="w-3.5 h-3.5 text-neutral-400" />
                <span>Document</span>
                <ChevronDown className="w-3 h-3 text-neutral-500" />
              </button>
              
              {showDocMenu && (
                <div className="absolute right-0 mt-1.5 w-48 z-50 rounded-xl border border-white/10 bg-[#0d0e14] p-1 shadow-2xl flex flex-col gap-0.5 animate-fade-in">
                  
                  {/* Save Session */}
                  <button
                    onClick={() => {
                      onSaveProject();
                      setShowDocMenu(false);
                    }}
                    disabled={segmentsCount === 0}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-neutral-300 hover:bg-white/5 flex items-center gap-2.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Save className="h-3.5 w-3.5 text-neutral-400" />
                    <span>Save Session</span>
                  </button>

                  {/* Import XLIFF */}
                  <label className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-neutral-300 hover:bg-white/5 flex items-center gap-2.5 transition cursor-pointer ${segmentsCount === 0 ? 'opacity-40 pointer-events-none' : ''}`}>
                    <Upload className="h-3.5 w-3.5 text-neutral-400" />
                    <span>Import XLIFF</span>
                    <input
                      type="file"
                      accept=".xlf,.xliff"
                      onChange={(e) => {
                        onImportXliff(e);
                        setShowDocMenu(false);
                      }}
                      className="hidden"
                      disabled={segmentsCount === 0}
                    />
                  </label>

                  {/* Relink Original Template */}
                  <label className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-neutral-300 hover:bg-white/5 flex items-center gap-2.5 transition cursor-pointer ${segmentsCount === 0 ? 'opacity-40 pointer-events-none' : ''}`}>
                    <svg className="h-3.5 w-3.5 text-neutral-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <span>Relink Template</span>
                    <input
                      type="file"
                      accept=".html,.htm,.docx,.pptx,.xlsx,.txt"
                      onChange={(e) => {
                        onRelinkHtml(e);
                        setShowDocMenu(false);
                      }}
                      className="hidden"
                      disabled={segmentsCount === 0}
                    />
                  </label>

                  <div className="h-px bg-white/5 my-1" />

                  {/* Close Editor Session */}
                  <button
                    onClick={() => {
                      onCloseProject();
                      setShowDocMenu(false);
                    }}
                    disabled={segmentsCount === 0}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-950/20 flex items-center gap-2.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    <span>Close File</span>
                  </button>

                </div>
              )}
            </div>

            {/* Primary Export Button */}
            <button
              onClick={onExport}
              disabled={segmentsCount === 0}
              className={`py-2 px-4 font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-lg transition-all active:scale-98 cursor-pointer ${
                segmentsCount === 0
                  ? "bg-slate-400/5 text-slate-500 border border-white/5 cursor-not-allowed opacity-50"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/10"
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export</span>
            </button>
          </div>

        </div>
      </div>

      {/* ========================================================
          3. SEARCH & FILTERS BOTTOM BAR (Active filter)
          ======================================================== */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="flex items-center gap-3 bg-neutral-950/45 border border-white/5 rounded-xl px-4 py-2 focus-within:border-violet-500/25 focus-within:bg-neutral-950/70 transition-all duration-300">
          <Search className="h-4.5 w-4.5 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search source or target text..."
            className="w-full bg-transparent border-none outline-none text-white text-xs font-semibold placeholder-neutral-500"
          />
        </div>

        {/* Dynamic Status Filter Dropdown */}
        <div className="relative flex items-center shrink-0">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-neutral-900 border border-white/8 hover:border-white/12 text-neutral-300 rounded-xl pl-9 pr-8 py-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-violet-500/35 appearance-none cursor-pointer"
          >
            <option value="all">All Segments</option>
            <option value="translated">Translated</option>
            <option value="untranslated">Untranslated</option>
            <option value="verified">Verified</option>
          </select>
          <Filter className="absolute left-3.5 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
          <span className="absolute right-3.5 text-neutral-500 pointer-events-none text-[8px] font-bold">▼</span>
        </div>
      </div>

    </section>
  );
};
