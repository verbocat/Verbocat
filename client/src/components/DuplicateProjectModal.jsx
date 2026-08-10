import React, { useState } from "react";
import { Copy, X, Layers, FileText, CheckCircle2, Globe, Sparkles } from "lucide-react";
import { duplicateProject } from "../services/api";

export function DuplicateProjectModal({ project, onClose, onSuccess, showToast }) {
  const [scope, setScope] = useState("source_only");
  const [newName, setNewName] = useState(project?.name ? `${project.name} (Copy)` : "");
  const [extraLangs, setExtraLangs] = useState("");
  const [loading, setLoading] = useState(false);

  if (!project) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const addTargetLangs = extraLangs
        .split(/[, ]+/)
        .map((l) => l.trim())
        .filter(Boolean);

      const res = await duplicateProject(project.id, scope, newName.trim() || undefined, addTargetLangs);

      showToast(res.message || `Project duplicated successfully as "${res.duplicatedProject?.name}"!`, "success");
      if (onSuccess) onSuccess(res.duplicatedProject);
      onClose();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || err.message || "Failed to duplicate project", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Copy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-white">Duplicate Project</h3>
              <p className="text-xs text-slate-400">Choose duplication scope and settings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* New Project Name */}
          <div>
            <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
              New Project Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter duplicated project name..."
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-sm"
              required
            />
          </div>

          {/* Scope Options */}
          <div>
            <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-3">
              Select Duplication Scope
            </label>
            <div className="space-y-3">
              {/* Option A: Source Only */}
              <label
                onClick={() => setScope("source_only")}
                className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                  scope === "source_only"
                    ? "bg-indigo-500/10 border-indigo-500/50 ring-1 ring-indigo-500/30"
                    : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  value="source_only"
                  checked={scope === "source_only"}
                  onChange={() => setScope("source_only")}
                  className="mt-1 accent-indigo-500"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-white">Settings + Source Files Only</span>
                    <span className="px-2 py-0.5 text-[10px] uppercase font-semibold bg-indigo-500/20 text-indigo-300 rounded-md">
                      Fresh State
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Copies project settings, guidelines, and original source files with blank target segments ready for fresh translation.
                  </p>
                </div>
              </label>

              {/* Option B: Full with Translations */}
              <label
                onClick={() => setScope("full_with_translations")}
                className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                  scope === "full_with_translations"
                    ? "bg-indigo-500/10 border-indigo-500/50 ring-1 ring-indigo-500/30"
                    : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  value="full_with_translations"
                  checked={scope === "full_with_translations"}
                  onChange={() => setScope("full_with_translations")}
                  className="mt-1 accent-indigo-500"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-white">Full Snapshot with Existing Translations</span>
                    <span className="px-2 py-0.5 text-[10px] uppercase font-semibold bg-emerald-500/20 text-emerald-300 rounded-md">
                      Complete Clone
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Clones project settings, source files, AND all existing target segment translations, statuses, and quality scores.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Optional Additional Target Languages */}
          <div>
            <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
              Add Extra Target Languages (Optional)
            </label>
            <div className="relative">
              <input
                type="text"
                value={extraLangs}
                onChange={(e) => setExtraLangs(e.target.value)}
                placeholder="e.g. fr, de, ja (comma separated)"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
              />
              <Globe className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              Leave blank to keep existing target language(s):{" "}
              <span className="text-indigo-400 font-medium">
                {Array.isArray(project.target_lang) ? project.target_lang.join(", ") : project.target_lang || "hi"}
              </span>
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Duplicating...</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Confirm Duplication</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
