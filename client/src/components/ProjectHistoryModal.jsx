import React, { useState, useEffect } from "react";
import { X, History, Search, Filter, Clock, User, FileText, Globe, Users, Trash2, CheckCircle2, Sparkles, Plus, Copy, Download } from "lucide-react";
import { fetchGlobalHistory, fetchProjectActivities } from "../services/api.js";

export function ProjectHistoryModal({ isOpen, onClose, projectId = null, projectName = null, showToast }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all"); // "all", "files", "translations", "access", "projects"

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, projectId]);

  const loadHistory = async () => {
    setLoading(true);
    setError("");
    try {
      let data = [];
      if (projectId) {
        data = await fetchProjectActivities(projectId);
      } else {
        data = await fetchGlobalHistory();
      }
      setActivities(data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load audit history.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Filter activities
  const filteredActivities = activities.filter(act => {
    const eventType = (act.event_type || "").toLowerCase();
    const userName = (act.user_name || "").toLowerCase();
    const projName = (act.projectName || "").toLowerCase();
    const detailsStr = JSON.stringify(act.details || {}).toLowerCase();
    const query = searchQuery.toLowerCase();

    const matchesSearch = !query || userName.includes(query) || projName.includes(query) || detailsStr.includes(query) || eventType.includes(query);

    if (!matchesSearch) return false;

    if (categoryFilter === "files") {
      return eventType.includes("file") || eventType.includes("upload") || eventType.includes("document");
    }
    if (categoryFilter === "translations") {
      return eventType.includes("translate") || eventType.includes("segment") || eventType.includes("job");
    }
    if (categoryFilter === "access") {
      return eventType.includes("share") || eventType.includes("access") || eventType.includes("role");
    }
    if (categoryFilter === "projects") {
      return eventType.includes("project") || eventType.includes("language") || eventType.includes("context");
    }

    return true;
  });

  const getEventBadge = (eventType) => {
    const type = (eventType || "").toUpperCase();
    if (type.includes("FILE_UPLOAD") || type.includes("FILE_UPLOADED")) {
      return { icon: <FileText className="w-3.5 h-3.5 text-indigo-400" />, label: "File Upload", color: "bg-indigo-500/10 border-indigo-500/20 text-indigo-300" };
    }
    if (type.includes("FILE_DELETE") || type.includes("FILE_DELETED")) {
      return { icon: <Trash2 className="w-3.5 h-3.5 text-rose-400" />, label: "File Deleted", color: "bg-rose-500/10 border-rose-500/20 text-rose-300" };
    }
    if (type.includes("TRANSLAT")) {
      return { icon: <Sparkles className="w-3.5 h-3.5 text-purple-400" />, label: "Translation", color: "bg-purple-500/10 border-purple-500/20 text-purple-300" };
    }
    if (type.includes("SHARE") || type.includes("ACCESS")) {
      return { icon: <Users className="w-3.5 h-3.5 text-blue-400" />, label: "Access Shared", color: "bg-blue-500/10 border-blue-500/20 text-blue-300" };
    }
    if (type.includes("LANGUAGE")) {
      return { icon: <Globe className="w-3.5 h-3.5 text-emerald-400" />, label: "Language Added", color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" };
    }
    if (type.includes("PROJECT")) {
      return { icon: <Plus className="w-3.5 h-3.5 text-amber-400" />, label: "Project Event", color: "bg-amber-500/10 border-amber-500/20 text-amber-300" };
    }
    return { icon: <Clock className="w-3.5 h-3.5 text-[var(--text-secondary)]" />, label: "Activity", color: "bg-zinc-500/10 border-zinc-500/20 text-[var(--text-secondary)]" };
  };

  const formatDetailsText = (act) => {
    const details = act.details || {};
    const type = (act.event_type || "").toUpperCase();

    if (type === "PROJECT_CREATED") {
      return `Created project "${details.projectName || act.projectName || 'New Project'}"`;
    }
    if (type === "PROJECT_DUPLICATED") {
      return `Duplicated project from "${details.originalProject || 'Source'}" as "${details.newProject || 'Copy'}"`;
    }
    if (type === "PROJECT_SHARED") {
      return `Granted ${details.accessLevel || 'edit'} access to ${details.sharedWith || 'collaborator'}`;
    }
    if (type === "ACCESS_REVOKED") {
      return `Revoked project access from ${details.targetId || 'user'}`;
    }
    if (type === "FILE_UPLOADED" || type === "FILE_UPLOAD") {
      return `Uploaded file "${details.fileName || details.filename || 'document'}" ${details.wordCount ? `(${details.wordCount.toLocaleString()} words)` : ''}`;
    }
    if (type === "FILE_DELETED") {
      return `Deleted file "${details.fileName || details.filename || 'document'}"`;
    }
    if (type === "LANGUAGE_ADDED") {
      const langs = Array.isArray(details.languages) ? details.languages.join(", ").toUpperCase() : (details.language || 'target language');
      return `Added target language variant: ${langs}`;
    }
    if (type === "SEGMENT_TRANSLATED") {
      return `Updated segment translation in "${details.fileName || 'document'}" (${(details.targetLang || 'target').toUpperCase()})`;
    }
    if (type === "AUTO_TRANSLATE_STARTED" || type === "TRANSLATION_STARTED") {
      return `Triggered pre-translation for ${(details.targetLang || 'target').toUpperCase()} (${details.wordCount || 0} words)`;
    }

    // Generic details string builder
    if (typeof details === "string") return details;
    if (details.action) return `Executed action: ${details.action}`;
    return act.description || "Performed project update";
  };

  const handleExportHistory = () => {
    if (filteredActivities.length === 0) return;
    const exportText = filteredActivities.map(act => {
      const time = new Date(act.created_at || Date.now()).toLocaleString();
      const user = act.user_name || "User";
      const projectStr = act.projectName ? ` [Project: ${act.projectName}]` : '';
      const summary = formatDetailsText(act);
      return `[${time}] ${user}${projectStr} - ${summary}`;
    }).join("\n");

    navigator.clipboard.writeText(exportText);
    if (showToast) showToast("Audit history copied to clipboard!");
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-4xl select-none text-left p-6 flex flex-col gap-5 max-h-[90vh] overflow-hidden" style={{ borderRadius: "16px" }}>
        
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 shadow-inner">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)] leading-snug">
                {projectId ? `Audit History — ${projectName || "Project"}` : "Workspace Audit History"}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] font-medium">
                {projectId ? "Track file uploads, translations, access changes, and language updates" : "Activity trail across all workspace projects"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportHistory}
              disabled={filteredActivities.length === 0}
              className="px-3 py-1.5 rounded-xl border border-[var(--border-medium)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
              title="Copy history to clipboard"
            >
              <Copy className="w-3.5 h-3.5" /> Copy Log
            </button>

            <button 
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search history by user, file, or action..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl pl-9 pr-3.5 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-all font-medium"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1 bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-1 rounded-xl text-xs font-bold w-full sm:w-auto overflow-x-auto">
            {[
              { id: "all", label: "All" },
              { id: "files", label: "Files" },
              { id: "translations", label: "Translations" },
              { id: "access", label: "Access" },
              { id: "projects", label: "Projects" }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  categoryFilter === tab.id ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="text-xs font-semibold text-[var(--text-rose)] bg-[var(--rose)]/10 border border-[var(--rose)]/20 rounded-xl p-3">
            {error}
          </div>
        )}

        {/* Activity Timeline List */}
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 min-h-[300px]">
          {loading ? (
            <div className="py-12 space-y-3 animate-pulse">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl p-3 flex items-center justify-between">
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 w-40 bg-[var(--bg-surface)] rounded" />
                    <div className="h-2 w-64 bg-[var(--bg-surface)] rounded" />
                  </div>
                  <div className="h-3 w-16 bg-[var(--bg-surface)] rounded" />
                </div>
              ))}
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="py-20 text-center text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl">
              <Clock className="w-8 h-8 mx-auto mb-2 text-indigo-400 opacity-40" />
              No activity logs match your selected filter.
            </div>
          ) : (
            filteredActivities.map(act => {
              const badge = getEventBadge(act.event_type);
              const summaryText = formatDetailsText(act);
              const formattedTime = new Date(act.created_at || Date.now()).toLocaleString(undefined, {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
              });

              return (
                <div 
                  key={act.id || Math.random()}
                  className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-zinc-700/80 p-3.5 rounded-xl flex items-start gap-3.5 transition-all shadow-sm group"
                >
                  <div className={`p-2 rounded-xl border flex-shrink-0 mt-0.5 ${badge.color}`}>
                    {badge.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                          {act.user_name || "System User"}
                        </span>
                        {!projectId && act.projectName && (
                          <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold px-2 py-0.5 rounded-md truncate">
                            {act.projectName}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badge.color}`}>
                          {badge.label}
                        </span>
                      </div>

                      <span className="text-[10px] font-semibold text-[var(--text-muted)] flex-shrink-0 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                        {formattedTime}
                      </span>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed">
                      {summaryText}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t border-[var(--border-subtle)] flex justify-between items-center text-[11px] text-[var(--text-muted)] font-semibold">
          <span>Showing {filteredActivities.length} audit entry(s)</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
