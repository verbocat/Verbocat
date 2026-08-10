import React, { useState } from "react";
import { Sparkles, ArrowUp, Loader2, CheckCircle2, AlertCircle, HelpCircle, X } from "lucide-react";
import { executeAIProjectCommand } from "../services/api";

export function SmartAIProjectBar({
  projectId = null,
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
      showToast("Please enter an AI command.", "error");
      return;
    }

    setLoading(true);
    setAiStatus(null);

    try {
      const res = await executeAIProjectCommand(textToRun, [], projectId);

      if (res.requiresClarification && res.clarificationType === "duplication_scope") {
        showToast("Please select duplication scope in the popup modal.", "info");
        if (onOpenDuplicateModal) {
          onOpenDuplicateModal(res.projectId || projectId);
        }
        setAiStatus({ type: "info", text: "Please select duplication scope options." });
        return;
      }

      if (res.success) {
        const msg = res.message || "AI Project command completed successfully!";
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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-2xl pointer-events-auto">
      {/* Floating Status Feedback Tooltip above Gemini Pill Bar */}
      {aiStatus && (
        <div
          className={`mb-2.5 px-4 py-2 rounded-2xl text-xs flex items-center justify-between shadow-xl backdrop-blur-xl border animate-in slide-in-from-bottom-2 duration-200 ${
            aiStatus.type === "success"
              ? "bg-emerald-950/90 text-emerald-200 border-emerald-500/40 shadow-emerald-950/40"
              : aiStatus.type === "info"
              ? "bg-indigo-950/90 text-indigo-200 border-indigo-500/40 shadow-indigo-950/40"
              : "bg-rose-950/90 text-rose-200 border-rose-500/40 shadow-rose-950/40"
          }`}
        >
          <div className="flex items-center gap-2">
            {aiStatus.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {aiStatus.type === "info" && <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />}
            {aiStatus.type === "error" && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            <span className="font-medium truncate max-w-md">{aiStatus.text}</span>
          </div>
          <button
            onClick={() => setAiStatus(null)}
            className="text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-slate-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Google Gemini Fixed Bottom Capsule Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleExecute();
        }}
        className="relative flex items-center bg-slate-950/85 backdrop-blur-2xl border border-indigo-500/30 hover:border-indigo-500/50 focus-within:border-indigo-400 rounded-full p-2 pl-4 shadow-2xl shadow-indigo-950/60 ring-1 ring-white/10 transition-all duration-300 group"
      >
        {/* Gemini Sparkling Icon */}
        <div className="flex items-center justify-center p-2 rounded-full bg-gradient-to-tr from-indigo-500/20 via-purple-500/20 to-pink-500/20 text-indigo-300 shrink-0 border border-indigo-500/30">
          <Sparkles className="w-4 h-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 animate-pulse" />
        </div>

        {/* Gemini Input Field */}
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder=""
          className="flex-1 bg-transparent px-3 text-sm text-slate-100 placeholder-slate-400 focus:outline-none font-medium"
          disabled={loading}
        />

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 pr-1">
          {/* Send / Execute Button (Gemini Circular Send Button) */}
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ${
              prompt.trim()
                ? "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:opacity-90 text-white shadow-lg shadow-indigo-500/30 scale-100"
                : "bg-slate-800 text-slate-500 opacity-60 cursor-not-allowed"
            }`}
            title="Execute AI Project Command"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
