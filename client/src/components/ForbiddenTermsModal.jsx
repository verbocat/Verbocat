import { useState, useRef, useEffect } from "react";
import { X, ShieldAlert, Plus, Trash2, Search, Upload, Download, Check, Sliders, AlertTriangle } from "lucide-react";

export const ForbiddenTermsModal = ({
  show,
  onClose,
  forbiddenTerms = [],
  setForbiddenTerms,
  forbiddenTermsEnabled = true,
  setForbiddenTermsEnabled,
  theme
}) => {
  const [activeTab, setActiveTab] = useState("list"); // 'list' | 'bulk'
  const [searchQuery, setSearchQuery] = useState("");
  const [newTerm, setNewTerm] = useState("");
  const [newScope, setNewScope] = useState("both"); // 'both' | 'source' | 'target'
  const [newMatchCase, setNewMatchCase] = useState(false);
  const [newCategory, setNewCategory] = useState("General");
  const [bulkText, setBulkText] = useState("");
  const fileInputRef = useRef(null);

  if (!show) return null;

  const handleAddTerm = () => {
    if (!newTerm.trim()) return;
    const exists = forbiddenTerms.some(
      (t) => t.term.toLowerCase() === newTerm.trim().toLowerCase()
    );
    if (exists) return;

    const item = {
      id: "ft_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      term: newTerm.trim(),
      scope: newScope,
      matchCase: newMatchCase,
      category: newCategory.trim() || "General",
      enabled: true
    };

    setForbiddenTerms([...forbiddenTerms, item]);
    setNewTerm("");
  };

  const handleDeleteTerm = (id) => {
    setForbiddenTerms(forbiddenTerms.filter((t) => t.id !== id));
  };

  const handleToggleTermEnabled = (id) => {
    setForbiddenTerms(
      forbiddenTerms.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t))
    );
  };

  const handleBulkAdd = () => {
    if (!bulkText.trim()) return;
    const rawLines = bulkText.split(/[\n,;]+/);
    const newItems = [];
    const existingSet = new Set(forbiddenTerms.map((t) => t.term.toLowerCase()));

    rawLines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !existingSet.has(trimmed.toLowerCase())) {
        existingSet.add(trimmed.toLowerCase());
        newItems.push({
          id: "ft_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
          term: trimmed,
          scope: "both",
          matchCase: false,
          category: "General",
          enabled: true
        });
      }
    });

    if (newItems.length > 0) {
      setForbiddenTerms([...forbiddenTerms, ...newItems]);
      setBulkText("");
      setActiveTab("list");
    }
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(forbiddenTerms, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "forbidden_terms.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (Array.isArray(parsed)) {
          const validated = parsed.filter((t) => t && typeof t.term === "string").map((t, idx) => ({
            id: t.id || `ft_imp_${Date.now()}_${idx}`,
            term: t.term,
            scope: t.scope || "both",
            matchCase: !!t.matchCase,
            category: t.category || "General",
            enabled: t.enabled !== false
          }));
          setForbiddenTerms(validated);
        }
      } catch (err) {
        console.error("Import forbidden terms error:", err);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file, "UTF-8");
  };

  const filteredTerms = forbiddenTerms.filter(
    (t) =>
      t.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div
        className="w-full max-w-3xl rounded-2xl border border-[var(--border-medium,#334155)] bg-[var(--bg-surface,#0f172a)] text-[var(--text-primary,#f8fafc)] shadow-2xl overflow-hidden flex flex-col"
        style={{ height: "80vh", maxHeight: "680px" }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle,#1e293b)] flex items-center justify-between bg-[var(--bg-panel,#1e293b)]/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                Forbidden Terms Guard
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Prevent restricted or prohibited words in translation sources and targets
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Master Toggle */}
            <label className="flex items-center gap-2 cursor-pointer bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="text-xs font-semibold text-slate-300">
                Guard: <strong className={forbiddenTermsEnabled ? "text-emerald-400" : "text-slate-400"}>
                  {forbiddenTermsEnabled ? "ACTIVE" : "OFF"}
                </strong>
              </span>
              <input
                type="checkbox"
                checked={forbiddenTermsEnabled}
                onChange={(e) => setForbiddenTermsEnabled(e.target.checked)}
                className="w-4 h-4 accent-indigo-500 cursor-pointer"
              />
            </label>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toolbar & Tabs */}
        <div className="px-5 py-3 border-b border-[var(--border-subtle,#1e293b)] flex flex-wrap items-center justify-between gap-3 shrink-0 bg-[var(--bg-surface,#0f172a)]">
          <div className="flex gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab("list")}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                activeTab === "list"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Terms List ({forbiddenTerms.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("bulk")}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                activeTab === "bulk"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Bulk Import
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === "list" && (
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter terms..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent outline-none w-32 text-slate-100 placeholder-slate-500 font-medium"
                />
              </div>
            )}

            <input
              type="file"
              accept=".json"
              ref={fileInputRef}
              className="hidden"
              onChange={handleImportJson}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-bold flex items-center gap-1 transition"
              title="Import Forbidden Terms JSON"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleExportJson}
              disabled={forbiddenTerms.length === 0}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-bold flex items-center gap-1 transition disabled:opacity-40"
              title="Export Forbidden Terms JSON"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content Viewport */}
        <div className="flex-1 overflow-hidden flex flex-col p-5 bg-[var(--bg-surface,#0f172a)]">
          {activeTab === "bulk" ? (
            /* Bulk Import View */
            <div className="flex flex-col flex-1 gap-3 p-4 rounded-xl border border-slate-800 bg-slate-950/60">
              <div>
                <h4 className="text-xs font-bold text-slate-200">Bulk Paste Forbidden Terms</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Paste multiple forbidden words or phrases separated by commas, semicolons, or newlines.
                </p>
              </div>

              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="Example:&#10;confidential&#10;do_not_translate&#10;restricted_brand&#10;unverified_claim"
                className="flex-1 w-full p-3 rounded-lg border border-slate-800 bg-slate-900 text-slate-100 placeholder-slate-600 outline-none font-mono text-xs resize-none focus:border-rose-500"
              />

              <div className="flex justify-end gap-2 shrink-0">
                <button
                  onClick={() => setBulkText("")}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Clear
                </button>
                <button
                  onClick={handleBulkAdd}
                  disabled={!bulkText.trim()}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition"
                >
                  Add Terms
                </button>
              </div>
            </div>
          ) : (
            /* Main Terms List View */
            <div className="flex flex-col flex-1 min-h-0">
              {/* Quick Add Form */}
              <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl border border-slate-800 bg-slate-900/70 shrink-0">
                <input
                  type="text"
                  placeholder="Enter forbidden word/phrase..."
                  value={newTerm}
                  onChange={(e) => setNewTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddTerm();
                  }}
                  className="flex-1 min-w-[180px] bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-rose-500 font-semibold"
                />

                <select
                  value={newScope}
                  onChange={(e) => setNewScope(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-semibold outline-none cursor-pointer"
                  title="Where to check for forbidden term"
                >
                  <option value="both">Both Source & Target</option>
                  <option value="source">Source Only</option>
                  <option value="target">Target Only</option>
                </select>

                <label className="flex items-center gap-1.5 px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-semibold text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newMatchCase}
                    onChange={(e) => setNewMatchCase(e.target.checked)}
                    className="accent-rose-500 cursor-pointer"
                  />
                  <span>Match Case</span>
                </label>

                <button
                  type="button"
                  onClick={handleAddTerm}
                  disabled={!newTerm.trim()}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>

              {/* Terms Table */}
              <div className="flex-1 flex flex-col min-h-0 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                <div className="grid grid-cols-[40px_1fr_110px_90px_60px] border-b border-slate-800 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-900/80 shrink-0">
                  <div className="text-center">Active</div>
                  <div>Forbidden Word / Phrase</div>
                  <div>Scope</div>
                  <div>Match Case</div>
                  <div className="text-center">Action</div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 bg-slate-900/20">
                  {filteredTerms.length === 0 ? (
                    <div className="p-10 text-center text-xs text-slate-500 font-medium">
                      No forbidden terms defined yet. Add words above to start guarding your translations.
                    </div>
                  ) : (
                    filteredTerms.map((t) => (
                      <div
                        key={t.id}
                        className={`grid grid-cols-[40px_1fr_110px_90px_60px] items-center px-3 py-2 text-xs transition ${
                          !t.enabled ? "opacity-50 bg-slate-950/40" : "hover:bg-slate-800/40"
                        }`}
                      >
                        <div className="text-center">
                          <input
                            type="checkbox"
                            checked={t.enabled !== false}
                            onChange={() => handleToggleTermEnabled(t.id)}
                            className="accent-rose-500 cursor-pointer"
                          />
                        </div>

                        <div className="font-bold text-rose-300 font-mono tracking-tight break-all pr-2">
                          {t.term}
                        </div>

                        <div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300">
                            {t.scope === "both" ? "Source & Target" : t.scope === "source" ? "Source Only" : "Target Only"}
                          </span>
                        </div>

                        <div className="text-[11px] font-semibold text-slate-400">
                          {t.matchCase ? "Yes (Exact)" : "No (Any)"}
                        </div>

                        <div className="text-center">
                          <button
                            onClick={() => handleDeleteTerm(t.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                            title="Remove forbidden term"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-900/60 border-t border-[var(--border-subtle,#1e293b)] flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>
              {forbiddenTerms.filter((t) => t.enabled !== false).length} active guard rules configured
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
