import { LANGUAGES } from "../constants/languages.js";
import { 
  FileText, 
  ArrowRight, 
  Search, 
  Filter, 
  Settings as SettingsIcon, 
  BookOpen, 
  Sparkles, 
  Save, 
  Upload, 
  Download, 
  Trash2, 
  RefreshCw
} from "lucide-react";

const ActionButton = ({ children, className = "", ...props }) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-200 cursor-pointer ${className}`}
  >
    {children}
  </button>
);

const UtilityIconButton = ({ children, className = "", ...props }) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center rounded-xl p-2.5 border border-white/5 bg-neutral-900/40 text-neutral-400 hover:text-white hover:bg-white/5 transition-all duration-200 cursor-pointer active:scale-95 ${className}`}
  >
    {children}
  </button>
);

export const WorkspaceToolbar = ({
  onCloseProject,
  onExport,
  onLoadProject,
  onOpenGlossary,
  onOpenContext,
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
  fileExtension
}) => {
  return (
    <section className="space-y-5 select-none">
      
      {/* ========================================================
          1. STATS DASHBOARD HEADER ROW
          ======================================================== */}
      {segmentsCount > 0 && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Active File Details Card */}
          <div className="bg-[#0b0c11]/40 border border-white/5 rounded-2xl p-4 flex items-center gap-3.5 shadow-lg">
            <div className="h-10 w-10 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block select-none">Active File</span>
              <h4 className="text-xs font-extrabold text-white truncate mt-0.5" title={fileName}>
                {fileName.toUpperCase()}
              </h4>
              <div className="flex items-center gap-1.5 text-[9px] text-neutral-400 font-mono mt-0.5">
                <span>Auto-saved</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </div>
          </div>

          {/* Stats Card 1: Total Words */}
          <div className="bg-[#0b0c11]/40 border border-white/5 rounded-2xl p-4 flex items-center gap-3.5 shadow-lg">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </div>
            <div>
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block select-none">Total Words</span>
              <span className="text-xl font-black text-white mt-0.5 block leading-none">
                {stats.words}
              </span>
            </div>
          </div>

          {/* Stats Card 2: Unique Words */}
          <div className="bg-[#0b0c11]/40 border border-white/5 rounded-2xl p-4 flex items-center gap-3.5 shadow-lg">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9.09 9 1.24 5.12c.07.29.35.48.64.48h2.06c.29 0 .57-.19.64-.48L14.91 9"/></svg>
            </div>
            <div>
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block select-none">Unique Words</span>
              <span className="text-xl font-black text-white mt-0.5 block leading-none">
                {stats.uniqueWords}
              </span>
            </div>
          </div>

          {/* Stats Card 3: Duplicate Words */}
          <div className="bg-[#0b0c11]/40 border border-white/5 rounded-2xl p-4 flex items-center gap-3.5 shadow-lg">
            <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <div>
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block select-none">Duplicate Words</span>
              <span className="text-xl font-black text-white mt-0.5 block leading-none">
                {stats.duplicateWords}
              </span>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================
          2. TOOLBAR MIDDLE ROW (Grouped with Dividers)
          ======================================================== */}
      <div className="bg-[#0b0c11]/25 border border-white/5 rounded-2xl p-4 flex flex-col lg:flex-row items-center justify-between gap-4 shadow-md">
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-4 w-full">
          
          {/* GROUP 1: Language Pair Selectors */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative flex items-center">
              <select
                value={sourceLanguage}
                onChange={(e) => onSourceLanguageChange(e.target.value)}
                className="bg-neutral-950/40 border border-white/5 rounded-xl pl-3 pr-8 py-2.5 text-xs font-bold text-neutral-200 outline-none focus:ring-1 focus:ring-violet-500/30 appearance-none cursor-pointer min-w-[130px]"
              >
                {LANGUAGES.map((lang) => (
                  <option key={`src-${lang.code}`} value={lang.code}>
                    {lang.name.substring(0, 10)} ({lang.code})
                  </option>
                ))}
              </select>
              <span className="absolute right-3 text-neutral-500 pointer-events-none text-[8px] font-bold">▼</span>
            </div>

            <div className="h-8 w-8 rounded-full border border-white/5 bg-neutral-950/20 flex items-center justify-center text-neutral-500 shrink-0">
              <ArrowRight className="h-4 w-4" />
            </div>

            <div className="relative flex items-center">
              <select
                value={targetLanguage}
                onChange={(e) => onTargetLanguageChange(e.target.value)}
                className="bg-neutral-950/40 border border-white/5 rounded-xl pl-3 pr-8 py-2.5 text-xs font-bold text-neutral-200 outline-none focus:ring-1 focus:ring-violet-500/30 appearance-none cursor-pointer min-w-[130px]"
              >
                {LANGUAGES.map((lang) => (
                  <option key={`tgt-${lang.code}`} value={lang.code}>
                    {lang.name.substring(0, 10)} ({lang.code})
                  </option>
                ))}
              </select>
              <span className="absolute right-3 text-neutral-500 pointer-events-none text-[8px] font-bold">▼</span>
            </div>
          </div>

          {/* Divider 1 */}
          <div className="hidden lg:block h-6 w-px bg-white/10 mx-1 shrink-0" />

          {/* GROUP 2: Mode Switches (Context, Glossary, Translate, QA) */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={onOpenContext}
              className="bg-violet-950/40 border border-violet-500/35 text-violet-300 rounded-xl px-4 py-2.5 text-xs font-bold flex items-center gap-2 hover:bg-violet-900/30 transition-all cursor-pointer"
            >
              <SettingsIcon className="w-3.5 h-3.5 text-violet-400" />
              <span>Context</span>
            </button>

            <button
              onClick={onOpenGlossary}
              className="bg-neutral-950/25 border border-white/8 text-neutral-300 rounded-xl px-4 py-2.5 text-xs font-bold flex items-center gap-2 hover:bg-white/5 transition-all cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-neutral-500" />
              <span>Glossary</span>
            </button>

            <button
              onClick={onTranslate}
              disabled={segmentsCount === 0 || isTranslating || !canTranslate}
              className={`border rounded-xl px-4 py-2.5 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                segmentsCount === 0 || isTranslating || !canTranslate
                  ? "border-white/5 bg-slate-400/5 text-slate-500 cursor-not-allowed opacity-50"
                  : "border-white/8 bg-neutral-950/25 text-neutral-300 hover:bg-white/5"
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTranslating ? 'animate-spin' : ''}`} />
              <span>{isTranslating ? "Translating" : "Translate"}</span>
            </button>

            <button
              onClick={onToggleQa}
              disabled={segmentsCount === 0}
              className={`border rounded-xl px-4 py-2.5 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                segmentsCount === 0
                  ? "border-white/5 bg-slate-400/5 text-slate-500 cursor-not-allowed opacity-50"
                  : "border-white/8 bg-neutral-950/25 text-neutral-300 hover:bg-white/5"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>QA</span>
              {qaIssuesCount > 0 && (
                <span className="ml-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-300 font-bold">
                  {qaIssuesCount}
                </span>
              )}
            </button>
          </div>

          {/* Divider 2 */}
          <div className="hidden lg:block h-6 w-px bg-white/10 mx-1 shrink-0" />

          {/* GROUP 3: Project Actions (Save, Import, Relink) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Save icon button */}
            <UtilityIconButton onClick={onSaveProject} disabled={segmentsCount === 0} title="Save project session">
              <Save className="h-4 w-4" />
            </UtilityIconButton>

            {/* Import XLIFF icon button */}
            <label className={`inline-flex items-center justify-center rounded-xl p-2.5 border border-white/5 bg-neutral-900/40 text-neutral-400 hover:text-white hover:bg-white/5 transition-all duration-200 cursor-pointer ${segmentsCount === 0 ? 'opacity-50 pointer-events-none' : ''}`} title="Import XLIFF file">
              <Upload className="h-4 w-4" />
              <input
                type="file"
                accept=".xlf,.xliff"
                onChange={onImportXliff}
                className="hidden"
                disabled={segmentsCount === 0}
              />
            </label>

            {/* Relink Document template */}
            <label className={`inline-flex items-center justify-center rounded-xl p-2.5 border border-white/5 bg-neutral-900/40 text-neutral-400 hover:text-white hover:bg-white/5 transition-all duration-200 cursor-pointer ${segmentsCount === 0 ? 'opacity-50 pointer-events-none' : ''}`} title="Upload source template to relink">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <input
                type="file"
                accept=".html,.htm,.docx,.pptx,.xlsx,.txt"
                onChange={onRelinkHtml}
                className="hidden"
                disabled={segmentsCount === 0}
              />
            </label>
          </div>

          {/* Divider 3 */}
          <div className="hidden lg:block h-6 w-px bg-white/10 mx-1 shrink-0" />

          {/* GROUP 4: Outputs (Export & Session Closing) */}
          <div className="flex items-center gap-2 shrink-0 ml-auto lg:ml-0">
            {/* Export File (Green Gradient Button) */}
            <ActionButton
              onClick={onExport}
              disabled={segmentsCount === 0}
              className={`py-2.5 px-4 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-lg transition-all ${
                segmentsCount === 0
                  ? "bg-slate-400/5 text-slate-500 border border-white/5 cursor-not-allowed opacity-50"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/10 hover:scale-[1.01] active:scale-[0.98]"
              }`}
            >
              <Download className="h-4 w-4" />
              <span>Export</span>
            </ActionButton>

            {/* Close Project (Red Close Icon Button) */}
            <UtilityIconButton
              onClick={onCloseProject}
              disabled={segmentsCount === 0}
              title="Close project database session"
              className={`bg-rose-700/10 border border-rose-500/20 text-rose-400 hover:bg-rose-600 hover:text-white ${
                segmentsCount === 0 ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <Trash2 className="h-4 w-4" />
            </UtilityIconButton>
          </div>

        </div>
      </div>

      {/* ========================================================
          3. SEARCH & FILTERS BOTTOM BAR
          ======================================================== */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="flex items-center gap-3 bg-neutral-950/45 border border-white/5 rounded-xl px-4 py-2.5 focus-within:border-violet-500/25 focus-within:bg-neutral-950/70 transition-all duration-300">
          <Search className="h-4.5 w-4.5 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search source or target text..."
            className="w-full bg-transparent border-none outline-none text-white text-xs font-semibold placeholder-neutral-500"
          />
        </div>

        <button className="bg-neutral-900 border border-white/8 hover:bg-white/5 hover:border-white/12 text-neutral-300 rounded-xl px-4 py-2.5 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all duration-200 active:scale-95">
          <Filter className="h-4 w-4 text-neutral-400" />
          <span>Filters</span>
        </button>
      </div>

    </section>
  );
};
