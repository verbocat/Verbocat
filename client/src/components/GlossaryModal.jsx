import { useMemo, useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import { Icons } from "./Icons.jsx";

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
  theme
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
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!show) {
      setIsEditing(false);
    }
  }, [show]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

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

  const filteredGlossary = glossary.map((item, index) => ({...item, originalIndex: index}))
    .filter(item => 
      item.source.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.target.toLowerCase().includes(searchQuery.toLowerCase())
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
                className="rounded-xl px-4 py-2 text-sm font-semibold transition bg-rose-600 text-white hover:bg-rose-500"
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
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${theme.inputSoft}`}>
                    <Icons.Search className="w-4 h-4 opacity-50" />
                    <input 
                      type="text" 
                      placeholder="Search glossary..." 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="bg-transparent outline-none w-32"
                    />
                  </div>

                  <button
                    onClick={onApplyGlossary}
                    disabled={!canApplyGlossary}
                    className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Apply
                  </button>
                  
                  <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${theme.buttonSecondary}`}
                  >
                    Upload CSV
                  </button>
                  
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${isEditing ? 'bg-sky-600 text-white' : theme.buttonSecondary}`}
                  >
                    Edit
                  </button>
                  
                  {selectedGlossaryRows.length > 0 && (
                    <button
                      onClick={onDeleteSelected}
                      title="Remove Selected"
                      className="rounded-xl px-3 py-2.5 text-sm font-semibold transition bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                    >
                      <Icons.Trash />
                    </button>
                  )}

                  <button
                    onClick={onAddRow}
                    className="rounded-xl bg-gradient-to-r from-sky-400 to-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:from-sky-300 hover:to-slate-200"
                  >
                    Add Field
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 p-5 flex flex-col">
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-[24px] border border-white/10">
                <div
                  className={`grid grid-cols-[64px_1fr_1fr] border-b px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] shrink-0 ${
                    darkMode ? "border-white/10 bg-white/[0.04] text-slate-300" : "border-slate-200 bg-slate-100 text-slate-500"
                  }`}
                >
                  <div className="text-center">No.</div>
                  <div>Source</div>
                  <div>Target</div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {filteredGlossary.length === 0 ? (
                    <div className={`p-10 text-center text-sm ${theme.muted}`}>
                      No glossary rows found.
                    </div>
                  ) : (
                  filteredGlossary.map((item) => {
                    const index = item.originalIndex;
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
                        <div
                          className={`flex items-center justify-center border-r border-white/10 font-bold ${selected ? 'text-sky-500' : theme.muted}`}
                        >
                          {index + 1}
                        </div>

                        <input
                          value={item.source}
                          disabled={!isEditing}
                          onClick={(event) => event.stopPropagation()}
                          onPaste={onPasteGlossary}
                          onChange={(event) =>
                            onUpdateGlossary(index, "source", event.target.value)
                          }
                          placeholder="Source term"
                          className={`border-r border-white/10 px-4 py-3 outline-none disabled:opacity-70 disabled:cursor-not-allowed ${theme.inputSoft}`}
                        />

                        <input
                          value={item.target}
                          disabled={!isEditing}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            onUpdateGlossary(index, "target", event.target.value)
                          }
                          placeholder="Target term"
                          className={`px-4 py-3 outline-none disabled:opacity-70 disabled:cursor-not-allowed ${theme.inputSoft}`}
                        />
                      </div>
                    );
                  })
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
