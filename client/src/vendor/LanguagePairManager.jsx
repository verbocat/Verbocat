import { useState } from "react";
import { addLanguagePair, updateLanguagePair, deleteLanguagePair } from "./vendorApi";
import {
  Plus, Trash2, CheckCircle2, XCircle, Clock, Languages, Edit3, Save, X, ArrowRight
} from "lucide-react";

const LANGUAGES = [
  "English", "Hindi", "Spanish", "French", "German", "Arabic", "Chinese",
  "Japanese", "Korean", "Portuguese", "Russian", "Italian", "Dutch",
  "Turkish", "Thai", "Vietnamese", "Polish", "Gujarati", "Tamil",
  "Telugu", "Bengali", "Marathi", "Kannada", "Malayalam", "Punjabi", "Urdu"
];

export function LanguagePairManager({ linguistId, pairs = [], onUpdate, readOnly = false }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // Add form state
  const [newSource, setNewSource] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newProficiency, setNewProficiency] = useState("professional");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit form state
  const [editProficiency, setEditProficiency] = useState("");

  const handleAdd = async () => {
    if (!newSource || !newTarget || !newProficiency) return;
    setIsSubmitting(true);
    try {
      await addLanguagePair(linguistId, {
        source_language: newSource,
        target_language: newTarget,
        proficiency: newProficiency,
      });
      setIsAdding(false);
      setNewSource("");
      setNewTarget("");
      setNewProficiency("professional");
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error adding language pair:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (id, updates) => {
    try {
      await updateLanguagePair(id, updates);
      setEditingId(null);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error updating language pair:", error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to remove this language pair?")) return;
    try {
      await deleteLanguagePair(id);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error deleting language pair:", error);
    }
  };

  const StatusBadge = ({ status }) => {
    if (status === "approved") {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 size={11} /> APPROVED</span>;
    }
    if (status === "rejected") {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20"><XCircle size={11} /> REJECTED</span>;
    }
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20"><Clock size={11} /> PENDING</span>;
  };

  const ProficiencyBadge = ({ level }) => {
    if (level === "native") return <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 uppercase font-mono">Native</span>;
    if (level === "professional") return <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20 uppercase font-mono">Professional</span>;
    return <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-500/10 text-slate-400 border border-white/5 uppercase font-mono">Intermediate</span>;
  };

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-xs overflow-hidden">
      <div className="p-5 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <Languages size={15} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                Approved Language Pairs
              </h3>
              <span className="px-2 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono text-[10px] font-bold">
                {pairs.length}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Per-pair qualification and approval status</p>
          </div>
        </div>

        {!readOnly && !isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="h-8 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs"
          >
            <Plus size={13} />
            <span>Add Pair</span>
          </button>
        )}
      </div>

      {/* Add Pair Form Drawer */}
      {isAdding && (
        <div className="p-4 bg-[var(--bg-base)] border-b border-[var(--border-subtle)] flex flex-wrap items-center gap-3">
          <select
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            className="px-3 py-1.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50"
          >
            <option value="">Source Language</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          <span className="text-[var(--text-muted)] text-xs">→</span>

          <select
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            className="px-3 py-1.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50"
          >
            <option value="">Target Language</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          <select
            value={newProficiency}
            onChange={(e) => setNewProficiency(e.target.value)}
            className="px-3 py-1.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 uppercase font-mono"
          >
            <option value="native">Native</option>
            <option value="professional">Professional</option>
            <option value="intermediate">Intermediate</option>
          </select>

          <button
            onClick={handleAdd}
            disabled={isSubmitting || !newSource || !newTarget}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Adding..." : "Save Pair"}
          </button>

          <button
            onClick={() => setIsAdding(false)}
            className="px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] text-xs font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Pairs Table */}
      {pairs.length === 0 ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">
          No language pairs assigned yet. Click "Add Pair" to configure.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-muted)] font-mono text-[10px] uppercase">
                <th className="py-3 px-5">Source</th>
                <th className="py-3 px-2 text-center">Direction</th>
                <th className="py-3 px-5">Target</th>
                <th className="py-3 px-4">Proficiency</th>
                <th className="py-3 px-4">Status</th>
                {!readOnly && <th className="py-3 px-5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {pairs.map((pair) => (
                <tr key={pair.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                  <td className="py-3 px-5 font-semibold text-[var(--text-primary)]">
                    {pair.source_language}
                  </td>
                  <td className="py-3 px-2 text-center text-indigo-400 font-bold">
                    →
                  </td>
                  <td className="py-3 px-5 font-semibold text-[var(--text-primary)]">
                    {pair.target_language}
                  </td>
                  <td className="py-3 px-4">
                    {editingId === pair.id ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={editProficiency}
                          onChange={(e) => setEditProficiency(e.target.value)}
                          className="px-2 py-1 text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none"
                        >
                          <option value="native">Native</option>
                          <option value="professional">Professional</option>
                          <option value="intermediate">Intermediate</option>
                        </select>
                        <button
                          onClick={() => handleUpdate(pair.id, { proficiency: editProficiency })}
                          className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded"
                        >
                          <Save size={13} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 text-slate-400 hover:bg-white/5 rounded"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <ProficiencyBadge level={pair.proficiency} />
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={pair.status} />
                  </td>
                  {!readOnly && (
                    <td className="py-3 px-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {pair.status !== "approved" && (
                          <button
                            onClick={() => handleUpdate(pair.id, { status: "approved" })}
                            className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/15 border border-emerald-500/20"
                            title="Approve Language Pair"
                          >
                            <CheckCircle2 size={13} />
                          </button>
                        )}
                        {pair.status !== "rejected" && (
                          <button
                            onClick={() => handleUpdate(pair.id, { status: "rejected" })}
                            className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 border border-rose-500/20"
                            title="Reject Language Pair"
                          >
                            <XCircle size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditingId(pair.id);
                            setEditProficiency(pair.proficiency);
                          }}
                          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)]"
                          title="Edit Proficiency"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(pair.id)}
                          className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 border border-rose-500/20"
                          title="Delete Language Pair"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
