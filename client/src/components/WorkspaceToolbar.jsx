import { LANGUAGES } from "../constants/languages.js";
import { Icons } from "./Icons.jsx";

const ActionButton = ({ children, className = "", ...props }) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${className}`}
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
  onTranslate,
  onToggleQa,
  onCopyAllSource,
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
  canTranslate = true
}) => (
  <section className={`rounded-2xl border p-4 ${theme.cardStrong}`}>
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <h2 className="text-sm font-semibold tracking-wide text-sky-200 uppercase truncate">
          File: {fileName}
        </h2>
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${theme.muted}`}>
              Source
            </span>
            <select
              value={sourceLanguage}
              onChange={(e) => onSourceLanguageChange(e.target.value)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-500/50 ${theme.inputSoft}`}
            >
              {LANGUAGES.map((lang) => (
                <option key={`src-${lang.code}`} value={lang.code}>
                  {lang.name} ({lang.code})
                </option>
              ))}
            </select>
            <Icons.ArrowRight />
            <span className={`text-xs font-semibold ${theme.muted}`}>
              Target
            </span>
            <select
              value={targetLanguage}
              onChange={(e) => onTargetLanguageChange(e.target.value)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-500/50 ${theme.inputSoft}`}
            >
              {LANGUAGES.map((lang) => (
                <option key={`tgt-${lang.code}`} value={lang.code}>
                  {lang.name} ({lang.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <div className="flex items-center gap-2 border-r border-white/10 pr-3">
            <ActionButton onClick={onOpenContext} className={theme.accentSolid}>
              <Icons.Settings /> Context
            </ActionButton>
            <ActionButton onClick={onOpenGlossary} className={theme.accentSolid}>
              Glossary
            </ActionButton>
            <ActionButton
              onClick={onTranslate}
              disabled={segmentsCount === 0 || isTranslating || !canTranslate}
              className={
                segmentsCount === 0 || isTranslating || !canTranslate
                  ? "cursor-not-allowed bg-slate-400/30 text-slate-300"
                  : "bg-sky-700 text-white hover:bg-sky-600"
              }
              title={canTranslate ? "" : "You do not have permission to translate"}
            >
              {isTranslating ? "Translating..." : "Translate"}
            </ActionButton>
          </div>

          <div className="flex items-center gap-2 border-r border-white/10 pr-3">
            <ActionButton
              onClick={onToggleQa}
              disabled={segmentsCount === 0}
              className={
                segmentsCount === 0
                  ? "cursor-not-allowed bg-slate-400/30 text-slate-300"
                  : "bg-amber-700 text-white hover:bg-amber-600"
              }
            >
              QA {qaIssuesCount > 0 ? `(${qaIssuesCount})` : ""}
            </ActionButton>
            <ActionButton
              onClick={onCopyAllSource}
              disabled={segmentsCount === 0}
              title="Copy All Source to Target"
              className={
                segmentsCount === 0
                  ? "cursor-not-allowed bg-slate-400/30 text-slate-300"
                  : theme.buttonSecondary
              }
            >
              <Icons.CopyAll />
            </ActionButton>
          </div>

          <div className="flex items-center gap-2 pr-3">
            <ActionButton
              onClick={onSaveProject}
              disabled={segmentsCount === 0}
              title="Save Project"
              className={
                segmentsCount === 0
                  ? "cursor-not-allowed bg-slate-400/30 text-slate-300"
                  : theme.buttonSecondary
              }
            >
              <Icons.Save />
            </ActionButton>
            
            <label
              title="Load Project"
              className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${theme.buttonSecondary}`}
            >
              <Icons.FileJson />
              <input
                type="file"
                accept=".json"
                onChange={onLoadProject}
                className="hidden"
              />
            </label>

            <label
              title="Relink Template"
              className={
                segmentsCount === 0
                  ? "inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition bg-slate-400/30 text-slate-300"
                  : `inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${theme.buttonSecondary}`
              }
            >
              <Icons.Upload />
              <input
                type="file"
                accept=".html,.docx,.pptx,.xlsx,.txt"
                onChange={onRelinkHtml}
                className="hidden"
                disabled={segmentsCount === 0}
              />
            </label>

            <ActionButton
              onClick={onExport}
              disabled={segmentsCount === 0}
              title="Export File"
              className={
                segmentsCount === 0
                  ? "cursor-not-allowed bg-slate-400/30 text-slate-300"
                  : theme.buttonSecondary
              }
            >
              <Icons.Download />
            </ActionButton>
          </div>

          <ActionButton
            onClick={onCloseProject}
            disabled={segmentsCount === 0}
            className={
              segmentsCount === 0
                ? "cursor-not-allowed bg-slate-400/30 text-slate-300"
                : "bg-rose-700 text-white hover:bg-rose-600"
            }
          >
            <Icons.X />
            Close
          </ActionButton>
        </div>
      </div>

      <div>
        <label className="space-y-2 block">
          <span className={`text-xs uppercase tracking-[0.22em] ${theme.muted}`}>
            Search
          </span>
          <div className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${theme.inputSoft}`}>
            <span className={theme.muted}>
              <Icons.Search />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search source or target text..."
              className="w-full bg-transparent outline-none"
            />
          </div>
        </label>
      </div>

    </div>
  </section>
);
