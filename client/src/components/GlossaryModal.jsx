import { useMemo } from "react";

export const GlossaryModal = ({
  darkMode,
  glossary,
  glossaryKey,
  glossaryLanguagePairs,
  glossarySourceLang,
  glossaryTargetLang,
  languages,
  onAddRow,
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
  show,
  theme
}) => {
  const languageNameMap = useMemo(
    () =>
      Object.fromEntries(
        languages.map((language) => [language.code, language.name])
      ),
    [languages]
  );

  if (!show) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
      <div
        className={`w-full max-w-6xl overflow-hidden rounded-2xl border shadow-[0_30px_120px_rgba(2,6,23,0.35)] ${theme.cardStrong}`}
      >
        <div className="grid max-h-[88vh] lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside
            className={`border-b p-5 lg:border-b-0 lg:border-r ${
              darkMode ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-100/80"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-xs uppercase tracking-[0.25em] ${theme.muted}`}>
                  Glossary
                </div>
                <h2 className="mt-1 text-xl font-bold">Language Pairs</h2>
              </div>
              <button
                onClick={onClose}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${theme.buttonSecondary}`}
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block space-y-2">
                <span className={`text-xs uppercase tracking-[0.2em] ${theme.muted}`}>
                  Source
                </span>
                <select
                  value={glossarySourceLang}
                  onChange={(event) => setGlossarySourceLang(event.target.value)}
                  className={`w-full rounded-xl border px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-sky-300 ${theme.input}`}
                >
                  {languages.map((language) => (
                    <option key={`source-${language.code}`} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className={`text-xs uppercase tracking-[0.2em] ${theme.muted}`}>
                  Target
                </span>
                <select
                  value={glossaryTargetLang}
                  onChange={(event) => setGlossaryTargetLang(event.target.value)}
                  className={`w-full rounded-xl border px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-sky-300 ${theme.input}`}
                >
                  {languages.map((language) => (
                    <option key={`target-${language.code}`} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.accentSoft}`}>
                {glossary.length} terms
              </span>
              <span className="rounded-lg bg-slate-500/12 px-3 py-1 text-xs font-semibold text-slate-300 ring-1 ring-slate-400/20">
                {selectedGlossaryRows.length} selected
              </span>
            </div>

            <div className="mt-6 space-y-2">
              {glossaryLanguagePairs.length > 0 ? (
                glossaryLanguagePairs.map((pair) => (
                  <div
                    key={pair.key}
                    className={`flex items-center gap-2 rounded-2xl border p-3 ${
                      pair.key === glossaryKey
                        ? "border-sky-300/30 bg-sky-400/10"
                        : darkMode
                          ? "border-white/10 bg-white/[0.02]"
                          : "border-slate-200 bg-white"
                    }`}
                  >
                    <button
                      onClick={() => onSelectPair(pair.source, pair.target)}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm font-semibold">{pair.label}</div>
                      <div className={`mt-1 text-xs ${theme.muted}`}>
                        {pair.count} terms
                      </div>
                    </button>
                    <button
                      onClick={() => onDeleteLanguagePair(pair.key)}
                      className="rounded-lg px-2 py-1 text-xs font-bold text-rose-300 transition hover:bg-rose-500/10"
                    >
                      x
                    </button>
                  </div>
                ))
              ) : (
                <div className={`rounded-2xl border p-4 text-sm ${theme.card}`}>
                  No saved glossary pairs yet.
                </div>
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col">
            <div className="border-b border-white/10 p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <div className={`text-xs uppercase tracking-[0.22em] ${theme.muted}`}>
                    Active Pair
                  </div>
                  <h3 className="mt-1 text-2xl font-bold">
                    {languageNameMap[glossarySourceLang] || glossarySourceLang} to{" "}
                    {languageNameMap[glossaryTargetLang] || glossaryTargetLang}
                  </h3>
                  <p className={`mt-2 text-sm ${theme.muted}`}>
                    Paste `source = target` or tab-separated pairs. Shortcuts:
                    Ctrl/Cmd+A select all, Ctrl/Cmd+Shift+A clear selection,
                    Delete remove selected.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={onSelectAll}
                    disabled={glossary.length === 0}
                    className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Select All
                  </button>
                  <button
                    onClick={onClearSelection}
                    disabled={selectedGlossaryRows.length === 0}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${theme.buttonSecondary}`}
                  >
                    Clear
                  </button>
                  <button
                    onClick={onDeleteSelected}
                    disabled={selectedGlossaryRows.length === 0}
                    className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove Selected
                  </button>
                  <button
                    onClick={onClearCurrentGlossary}
                    disabled={glossary.length === 0}
                    className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove All
                  </button>
                  <button
                    onClick={onAddRow}
                    className="rounded-xl bg-gradient-to-r from-sky-400 to-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:from-sky-300 hover:to-slate-200"
                  >
                    Add Term
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              <div className="overflow-hidden rounded-[24px] border border-white/10">
                <div
                  className={`grid grid-cols-[64px_1fr_1fr] border-b px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] ${
                    darkMode ? "border-white/10 bg-white/[0.04] text-slate-300" : "border-slate-200 bg-slate-100 text-slate-500"
                  }`}
                >
                  <div className="text-center">Sel</div>
                  <div>Source</div>
                  <div>Target</div>
                </div>

                {glossary.length === 0 ? (
                  <div className={`p-10 text-center text-sm ${theme.muted}`}>
                    No glossary rows in this pair yet.
                  </div>
                ) : (
                  glossary.map((item, index) => {
                    const selected = selectedGlossaryRows.includes(index);

                    return (
                      <div
                        key={`${glossaryKey}-${index}`}
                        onClick={(event) => onToggleRow(index, event)}
                        className={`grid grid-cols-[64px_1fr_1fr] border-t border-white/10 ${
                          selected
                            ? darkMode
                              ? "bg-sky-400/10"
                              : "bg-sky-50"
                            : ""
                        }`}
                      >
                        <label
                          className="flex items-center justify-center border-r border-white/10"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(event) => onToggleRow(index, event.nativeEvent)}
                            className="h-4 w-4 accent-sky-500"
                          />
                        </label>

                        <input
                          value={item.source}
                          onClick={(event) => event.stopPropagation()}
                          onPaste={onPasteGlossary}
                          onChange={(event) =>
                            onUpdateGlossary(index, "source", event.target.value)
                          }
                          placeholder="Source term"
                          className={`border-r border-white/10 px-4 py-3 outline-none ${theme.inputSoft}`}
                        />

                        <input
                          value={item.target}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            onUpdateGlossary(index, "target", event.target.value)
                          }
                          placeholder="Target term"
                          className={`px-4 py-3 outline-none ${theme.inputSoft}`}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
