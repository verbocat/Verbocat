import React, { useState } from "react";
import { Mail, Send, X, CheckCircle2, AlertCircle, Terminal, ExternalLink, Copy, Check, RefreshCw } from "lucide-react";
import { api } from "../services/api";
import { useUserStore } from "../services/userStore";

export const TestEmailModal = ({ isOpen, onClose, showToast }) => {
  const currentUser = useUserStore((state) => state.user);
  const [emailTarget, setEmailTarget] = useState(currentUser?.email || "");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const addLog = (msg, type = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { timestamp, msg, type }]);
  };

  const handleSendTestEmail = async (e) => {
    e.preventDefault();
    if (!emailTarget || !emailTarget.trim()) {
      showToast("Please enter a valid target email address.", "error");
      return;
    }

    setLoading(true);
    const cleanEmail = emailTarget.trim();

    addLog(`Initiating test email dispatch to: ${cleanEmail}`, "info");
    const token = localStorage.getItem("centroid_token");
    if (token) {
      addLog(`Attached Authorization token: Bearer ${token.substring(0, 16)}...`, "info");
    } else {
      addLog(`Warning: No Authorization token found in localStorage. Request will be unauthenticated.`, "warn");
    }

    try {
      addLog(`POST /api/auth/test-email sending payload...`, "info");
      let response;
      try {
        response = await api.post("/api/auth/test-email", { email: cleanEmail });
      } catch (pathErr) {
        if (pathErr.response && pathErr.response.status === 404) {
          addLog(`Endpoint /api/auth/test-email returned 404, retrying with /auth/test-email...`, "warn");
          response = await api.post("/auth/test-email", { email: cleanEmail });
        } else {
          throw pathErr;
        }
      }
      
      addLog(`HTTP ${response.status} OK: ${response.data.message || "Email sent!"}`, "success");
      if (response.data.provider) {
        addLog(`Mail Provider: ${response.data.provider}`, "success");
      }

      if (showToast) showToast(`Test email sent to ${cleanEmail}!`, "success");
    } catch (err) {
      console.error("[Test Email Error]", err);
      const serverErr = err.response?.data?.error || err.message || "Failed to send test email";
      const statusCode = err.response?.status || 500;
      
      addLog(`HTTP ${statusCode} Error: ${serverErr}`, "error");
      addLog(`Request URL: ${err.config?.baseURL || ""}${err.config?.url || ""}`, "error");

      if (err.response?.data) {
        addLog(`Server Response Data: ${JSON.stringify(err.response.data)}`, "error");
      }

      if (statusCode === 404) {
        addLog(`[DIAGNOSTIC 404] The Node process running on port 5000 was started before new routes were compiled. Restarting backend server resolves this.`, "warn");
      }

      if (err.response?.data?.details) {
        addLog(`Diagnostics: ${err.response.data.details}`, "warn");
      }

      if (showToast) showToast(`Email dispatch error: ${serverErr}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLogs = () => {
    const logText = logs.map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.msg}`).join("\n");
    navigator.clipboard.writeText(logText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in font-sans">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Mail Delivery & Debug Console</span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Live Diagnostics
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Dispatch test emails & inspect live SMTP server transport logs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          
          {/* Dispatch Input Form */}
          <form onSubmit={handleSendTestEmail} className="space-y-3">
            <label className="text-xs font-semibold text-slate-300 block">
              Recipient Email Address
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={emailTarget}
                  onChange={(e) => setEmailTarget(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !emailTarget.trim()}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50 transition shadow-lg shadow-indigo-600/20 shrink-0"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Dispatching...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Send Test Email</span>
                  </>
                )}
              </button>
            </div>
          </form>



          {/* Terminal Debug Logs Console */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Terminal className="h-4 w-4 text-indigo-400" />
                Real-Time Diagnostics Console Log ({logs.length} entries)
              </span>
              <div className="flex items-center gap-2">
                {logs.length > 0 && (
                  <button
                    onClick={handleCopyLogs}
                    className="text-[11px] font-semibold text-slate-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copied ? "Copied" : "Copy Log"}</span>
                  </button>
                )}
                <button
                  onClick={() => setLogs([])}
                  className="text-[11px] font-semibold text-slate-400 hover:text-rose-400 px-2 py-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="h-56 bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs overflow-y-auto space-y-1.5 shadow-inner select-text">
              {logs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-600 italic">
                  No log entries yet. Enter an email address above and click "Send Test Email".
                </div>
              ) : (
                logs.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-slate-600 shrink-0">[{item.timestamp}]</span>
                    <span
                      className={`break-all ${
                        item.type === "error"
                          ? "text-rose-400 font-semibold"
                          : item.type === "success"
                          ? "text-emerald-400 font-semibold"
                          : item.type === "warn"
                          ? "text-amber-400"
                          : "text-slate-300"
                      }`}
                    >
                      {item.msg}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between text-xs text-slate-500">
          <span>Logged-in Workspace Session Active</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition cursor-pointer"
          >
            Close Debugger
          </button>
        </div>

      </div>
    </div>
  );
};
