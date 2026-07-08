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
  theme,
  onImportTmx
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
  const [newRowIndex, setNewRowIndex] = useState(null);
  const [activeView, setActiveView] = useState("list");
  const [pasteText, setPasteText] = useState("");
  const fileInputRef = useRef(null);

  const handleAddRow = () => {
    onAddRow();
    setNewRowIndex(glossary.length);
  };

  const handleBlur = (event) => {
    const relatedTarget = event.relatedTarget;
    if (
      !relatedTarget ||
      typeof relatedTarget.closest !== "function" ||
      relatedTarget.closest(".glossary-row") !== event.currentTarget.closest(".glossary-row")
    ) {
      setNewRowIndex(null);
    }
  };

  const handleDeleteRow = (index, event) => {
    event.stopPropagation();
    setGlossary(glossary.filter((_, idx) => idx !== index));
    if (selectedGlossaryRows.includes(index)) {
      onClearSelection();
    }
  };

  const handleImportSpreadsheet = () => {
    if (!pasteText.trim()) return;
    const rows = pasteText
      .split("\n")
      .map((row) => {
        let cols;
        if (row.includes("\t")) {
          cols = row.split("\t");
        } else if (row.includes("=")) {
          cols = row.split("=");
        } else {
          cols = [row, ""];
        }
        
        const src = cols[0]?.trim();
        const tgt = cols[1]?.trim();
        if (src || tgt) {
          return { source: src || "", target: tgt || "" };
        }
        return null;
      })
      .filter(Boolean);

    if (rows.length > 0) {
      setGlossary([...glossary, ...rows]);
      setPasteText("");
      setActiveView("list");
      setTimeout(() => {
        onApplyGlossary();
      }, 100);
    }
  };

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
    <div className={`fixed inset-0 z-[9999] flex flex-col bg-slate-950 ${theme.text}`}>
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col lg:flex-row">
          <aside
            className={`w-full lg:w-[320px] flex flex-col border-b lg:border-b-0 lg:border-r ${
              darkMode ? "border-white/10 bg-slate-950" : "border-slate-200 bg-slate-50"
            }`}
          >
            <div className="p-5 flex items-center justify-between border-b border-white/10">
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

            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-4">
                <label className="block space-y-2">
                <span className={`text-xs uppercase tracking-[0.2em] ${theme.muted}`}>
                  Source
                </span>
                <select
                  value={glossarySourceLang}
                  onChange={(event) => setGlossarySourceLang(event.target.value)}
                  className={`w-full rounded-xl border px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-sky-300 ${theme.input}`}
                >
                  {languages.filter((l) => !l.hidden).map((language) => (
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
                  {languages.filter((l) => !l.hidden).map((language) => (
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
          </div>
        </aside>

          <section className={`flex-1 flex flex-col min-w-0 ${darkMode ? "bg-slate-900" : "bg-white"}`}>
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

                  {/* View Tabs */}
                  <div className="flex gap-4 mt-3">
                    <button
                      onClick={() => setActiveView("list")}
                      className={`pb-1 text-xs font-semibold border-b-2 transition ${
                        activeView === "list"
                          ? "border-sky-400 text-sky-400 font-bold"
                          : "border-transparent text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Term List
                    </button>
                    <button
                      onClick={() => setActiveView("spreadsheet")}
                      className={`pb-1 text-xs font-semibold border-b-2 transition ${
                        activeView === "spreadsheet"
                          ? "border-sky-400 text-sky-400 font-bold"
                          : "border-transparent text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Spreadsheet Importer
                    </button>
                  </div>
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
                    className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-emerald-400 hover:to-teal-500 shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 disabled:from-slate-800 disabled:to-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={canApplyGlossary ? "Apply glossary terms to segment translations" : "Open a file first to apply glossary terms"}
                  >
                    Apply to Project
                  </button>
                  
                  <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${theme.buttonSecondary}`}
                  >
                    Upload CSV
                  </button>
                  
                  <input
                    type="file"
                    accept=".tmx"
                    id="tmx-import-file-input"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        onImportTmx(file);
                      }
                      e.target.value = "";
                    }}
                  />
                  <button
                    onClick={() => document.getElementById("tmx-import-file-input")?.click()}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${theme.buttonSecondary}`}
                    title="Import Translation Memory TMX file into database"
                  >
                    Import TMX
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
                    onClick={handleAddRow}
                    className="rounded-xl bg-gradient-to-r from-sky-400 to-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:from-sky-300 hover:to-slate-200"
                  >
                    Add Field
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 p-5 flex flex-col">
              {activeView === "spreadsheet" ? (
                <div className="flex flex-col flex-1 gap-4 p-6 rounded-[24px] border border-white/10 bg-slate-900/40 backdrop-blur-sm">
                  <div>
                    <h4 className="text-lg font-bold text-white mb-1">Spreadsheet Paste Importer</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Copy rows from Google Sheets or Excel (with Source term in the first column and Target term in the second column) and paste them below. Tab separators will be parsed automatically.
                    </p>
                  </div>

                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="Paste Excel/Google Sheets cells here...&#10;Example:&#10;hello&#9;नमस्ते&#10;world&#9;दुनिया"
                    className="flex-1 w-full p-4 rounded-xl outline-none border border-white/10 font-mono text-xs bg-slate-950/60 text-slate-200 resize-none focus:ring-2 focus:ring-sky-500"
                  />

                  <div className="flex items-center justify-between mt-2">
                    <button
                      onClick={() => setPasteText("")}
                      className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white transition"
                    >
                      Clear
                    </button>
                    <button
                      onClick={handleImportSpreadsheet}
                      disabled={!pasteText.trim()}
                      className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Import & Apply
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-[24px] border border-white/10">
                  <div
                    className={`grid grid-cols-[64px_1fr_1fr_48px] border-b px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] shrink-0 ${
                      darkMode ? "border-white/10 bg-white/[0.04] text-slate-300" : "border-slate-200 bg-slate-100 text-slate-500"
                    }`}
                  >
                    <div className="text-center">No.</div>
                    <div>Source</div>
                    <div>Target</div>
                    <div className="text-center">Delete</div>
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
                          className={`glossary-row grid grid-cols-[64px_1fr_1fr_48px] border-t border-white/10 ${
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
                            disabled={!isEditing && newRowIndex !== index}
                            onClick={(event) => event.stopPropagation()}
                            onBlur={handleBlur}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                setNewRowIndex(null);
                                e.target.blur();
                              }
                            }}
                            onChange={(event) =>
                              onUpdateGlossary(index, "source", event.target.value)
                            }
                            placeholder="Source term"
                            className={`border-r border-white/10 px-4 py-3 outline-none disabled:opacity-70 disabled:cursor-not-allowed ${theme.inputSoft}`}
                          />

                          <input
                            value={item.target}
                            disabled={!isEditing && newRowIndex !== index}
                            onClick={(event) => event.stopPropagation()}
                            onBlur={handleBlur}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                setNewRowIndex(null);
                                e.target.blur();
                              }
                            }}
                            onChange={(event) =>
                              onUpdateGlossary(index, "target", event.target.value)
                            }
                            placeholder="Target term"
                            className={`px-4 py-3 outline-none disabled:opacity-70 disabled:cursor-not-allowed ${theme.inputSoft}`}
                          />

                          <div className="flex items-center justify-center px-2 py-1.5 border-l border-white/10">
                            <button
                              onClick={(e) => handleDeleteRow(index, e)}
                              className="flex items-center justify-center text-rose-400 hover:text-rose-600 transition hover:bg-rose-500/10 rounded-lg p-1.5"
                              title="Delete term"
                            >
                              <Icons.Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
