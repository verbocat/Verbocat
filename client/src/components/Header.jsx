import { Icons } from "./Icons.jsx";

export const Header = ({
  currentProvider,
  darkMode,
  onLoadProject,
  onOpenGlossary,
  onToggleDarkMode,
  qaIssuesCount,
  segmentsCount,
  theme
}) => (
  <header className="sticky top-0 z-40 px-4 pt-3 sm:px-6 lg:px-8">
    <div
      className={`mx-auto max-w-7xl rounded-2xl border backdrop-blur-xl ${theme.shell}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-extrabold tracking-tight">
            VerboCat
          </div>

          {currentProvider && (
            <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${theme.accentSoft}`}>
              {currentProvider}
            </span>
          )}

          {segmentsCount > 0 && (
            <div className="hidden items-center gap-2 md:flex">
              <span className="rounded-lg bg-white/6 px-2.5 py-1 text-xs font-medium text-slate-200 ring-1 ring-white/10">
                {segmentsCount} segments
              </span>
              <span className="rounded-lg bg-white/6 px-2.5 py-1 text-xs font-medium text-slate-200 ring-1 ring-white/10">
                {qaIssuesCount} QA
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {segmentsCount === 0 && (
            <>
              <button
                onClick={onOpenGlossary}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${theme.buttonSecondary}`}
              >
                Glossary
              </button>
              <label
                className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${theme.buttonSecondary}`}
              >
                <Icons.FileJson />
                Load Project
                <input
                  type="file"
                  accept=".json"
                  onChange={onLoadProject}
                  className="hidden"
                />
              </label>
            </>
          )}

          <button
            onClick={onToggleDarkMode}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 transition ${theme.buttonSecondary}`}
          >
            {darkMode ? <Icons.Sun /> : <Icons.Moon />}
            <span className="text-sm font-semibold">{darkMode ? "Light" : "Dark"}</span>
          </button>
        </div>
      </div>
    </div>
  </header>
);
