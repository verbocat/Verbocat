import React, { useState } from "react";
import { Sparkles, Send, Paperclip, Loader2, CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";
import { executeAIProjectCommand } from "../services/api";

const SUGGESTIONS = [
  "Create single project named 'Q3 Marketing' for Hindi & Spanish",
  "Duplicate project with clean source files only",
  "Add French and German target languages to project",
  "Set project guidelines to Medical / ISO 13485"
];

export function SmartAIProjectBar({
  projectId = null,
  fileIds = [],
  onSuccess,
  showToast,
  onOpenDuplicateModal
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState(null);

  const handleExecute = async (commandPrompt) => {
    const textToRun = commandPrompt || prompt;
    if (!textToRun.trim()) {
      showToast("Please enter an AI command or request.", "error");
      return;
    }

    setLoading(true);
    setAiStatus(null);

    try {
      const res = await executeAIProjectCommand(textToRun, fileIds, projectId);

      if (res.requiresClarification && res.clarificationType === "duplication_scope") {
        showToast("Please select duplication scope in the popup modal.", "info");
        if (onOpenDuplicateModal) {
          onOpenDuplicateModal(res.projectId || projectId);
        }
        setAiStatus({ type: "info", text: "Scope clarification requested." });
        return;
      }

      if (res.success) {
        const msg = res.message || "AI Project action completed successfully!";
        setAiStatus({ type: "success", text: msg });
        showToast(msg, "success");
        setPrompt("");
        if (onSuccess) onSuccess(res);
      } else {
        setAiStatus({ type: "error", text: res.error || "Failed to execute AI command." });
        showToast(res.error || "Failed to execute AI command", "error");
      }
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || err.message || "AI Command execution failed";
      setAiStatus({ type: "error", text: errMsg });
      showToast(errMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/20 rounded-2xl p-4 shadow-xl backdrop-blur-md mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
          <Sparkles className="w-4 h-4 animate-pulse" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
          Smart AI Project Assistant
        </span>
        <span className="text-[11px] text-slate-400 font-medium">
          — Natural Language Project Orchestrator (Powered by OpenAI)
        </span>
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleExecute();
        }}
        className="flex items-center gap-3 bg-slate-950 border border-slate-800 focus-within:border-indigo-500/60 focus-within:ring-1 focus-within:ring-indigo-500/30 rounded-xl p-2 transition-all"
      >
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask AI e.g. 'Create single project for Hindi & Spanish', 'Duplicate project with clean state', 'Add French language'..."
          className="flex-1 bg-transparent px-3 text-sm text-white placeholder-slate-500 focus:outline-none"
          disabled={loading}
        />

        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium shadow-md shadow-indigo-600/20 transition-all"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <span>Run Command</span>
              <Send className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </form>

      {/* Suggestions */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span className="text-[11px] text-slate-500 font-medium mr-1">Quick Prompts:</span>
        {SUGGESTIONS.map((s, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              setPrompt(s);
              handleExecute(s);
            }}
            disabled={loading}
            className="text-[11px] px-2.5 py-1 bg-slate-800/60 hover:bg-indigo-900/40 text-slate-300 hover:text-indigo-200 border border-slate-700/60 hover:border-indigo-500/40 rounded-lg transition-all"
          >
            {s}
          </button>
        ))}
      </div>

      {/* AI Status Feedback */}
      {aiStatus && (
        <div
          className={`mt-3 p-2.5 rounded-lg text-xs flex items-center gap-2 border ${
            aiStatus.type === "success"
              ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/30"
              : aiStatus.type === "info"
              ? "bg-indigo-950/40 text-indigo-300 border-indigo-500/30"
              : "bg-rose-950/40 text-rose-300 border-rose-500/30"
          }`}
        >
          {aiStatus.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          {aiStatus.type === "info" && <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />}
          {aiStatus.type === "error" && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
          <span>{aiStatus.text}</span>
        </div>
      )}
    </div>
  );
}
