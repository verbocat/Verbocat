import React, { useState } from "react";
import { 
  X, Check, ShieldCheck, Globe, FileText, User, 
  Clock, AlertCircle, Search, UserCheck, UserX, ArrowRight
} from "lucide-react";
import { respondToProjectAccessRequest } from "../services/api.js";
import { LANGUAGES } from "../constants/languages";
import { LanguageFlag } from "./LanguageFlag.jsx";

export function ProjectAccessRequestsModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  requests = [],
  onRequestsUpdated,
  showToast
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [processingId, setProcessingId] = useState(null);

  if (!isOpen) return null;

  const getLanguageName = (code) => {
    if (!code) return "All Languages";
    const found = LANGUAGES.find(l => l.code === code.toLowerCase());
    return found ? found.name : code.toUpperCase();
  };

  const getInitials = (nameOrEmail) => {
    if (!nameOrEmail) return "?";
    return nameOrEmail.substring(0, 2).toUpperCase();
  };

  const formatDate = (isoString) => {
    if (!isoString) return "Recently";
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (_) {
      return "Recently";
    }
  };

  const handleAction = async (reqItem, action, permission = "write") => {
    setProcessingId(reqItem.id);
    try {
      await respondToProjectAccessRequest(
        projectId, 
        reqItem.id, 
        action, 
        permission, 
        reqItem.targetLang
      );

      const actionText = action === "approve" 
        ? `Approved ${permission === "write" ? "Write" : "Read"} access for ${reqItem.userName || reqItem.userEmail}` 
        : `Declined request from ${reqItem.userName || reqItem.userEmail}`;

      if (showToast) {
        showToast(actionText, action === "approve" ? "success" : "info");
      }

      if (onRequestsUpdated) {
        onRequestsUpdated();
      }
    } catch (err) {
      console.error("Failed to process request:", err);
      if (showToast) {
        showToast(`Failed: ${err.response?.data?.error || err.message}`, "error");
      }
    } finally {
      setProcessingId(null);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const email = (r.userEmail || "").toLowerCase();
    const name = (r.userName || "").toLowerCase();
    const doc = (r.documentName || "").toLowerCase();
    const lang = (r.targetLang || "").toLowerCase();
    return email.includes(term) || name.includes(term) || doc.includes(term) || lang.includes(term);
  });

  return (
    <div 
      className="modal-overlay" 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(8px)",
        padding: "20px"
      }}
    >
      <div 
        className="modal-card"
        style={{
          width: "100%",
          maxWidth: "680px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-medium)",
          borderRadius: "16px",
          boxShadow: "0 24px 70px rgba(0, 0, 0, 0.55)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column"
        }}
      >
        {/* Header */}
        <div 
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
            <div 
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                color: "var(--amber)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <ShieldCheck size={20} />
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    margin: 0
                  }}
                >
                  Access Requests
                </h3>
                {requests.length > 0 && (
                  <span 
                    style={{
                      background: "var(--amber)",
                      color: "#000000",
                      fontSize: "11px",
                      fontWeight: 800,
                      padding: "2px 7px",
                      borderRadius: "12px"
                    }}
                  >
                    {requests.length}
                  </span>
                )}
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "2px 0 0" }}>
                Review and respond to collaborator requests for "{projectName || "Project"}"
              </p>
            </div>
          </div>

          <button 
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.15s, background 0.15s"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filter Search (if multiple requests) */}
        {requests.length > 2 && (
          <div style={{ padding: "12px 24px 0" }}>
            <div 
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "var(--bg-input)",
                border: "1px solid var(--border-medium)",
                borderRadius: "8px",
                padding: "6px 12px"
              }}
            >
              <Search size={14} style={{ color: "var(--text-muted)" }} />
              <input
                type="text"
                placeholder="Search requests by name, email, file, or language..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: "12.5px",
                  color: "var(--text-primary)"
                }}
              />
              {searchTerm && (
                <X size={14} style={{ cursor: "pointer", color: "var(--text-muted)" }} onClick={() => setSearchTerm("")} />
              )}
            </div>
          </div>
        )}

        {/* Requests List Body */}
        <div 
          style={{
            padding: "16px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            maxHeight: "60vh",
            overflowY: "auto"
          }}
        >
          {requests.length === 0 ? (
            <div 
              style={{
                padding: "48px 24px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px"
              }}
            >
              <div 
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <ShieldCheck size={24} />
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                  No pending access requests
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", maxWidth: "340px" }}>
                  When collaborators or linguists request access to files or specific target languages, their requests will appear here.
                </div>
              </div>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)", fontSize: "12.5px" }}>
              No access requests match "{searchTerm}".
            </div>
          ) : (
            filteredRequests.map((req) => {
              const isProcessing = processingId === req.id;
              const langCode = req.targetLang;
              const langName = getLanguageName(langCode);

              return (
                <div 
                  key={req.id || `${req.documentId}_${req.userId}`}
                  style={{
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "12px",
                    padding: "14px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    transition: "border-color 0.15s"
                  }}
                >
                  {/* Top: User info + timestamp */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                      <div 
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          background: "var(--accent-faint)",
                          border: "1px solid var(--border-medium)",
                          color: "var(--accent)",
                          fontSize: "12px",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0
                        }}
                      >
                        {getInitials(req.userName || req.userEmail)}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {req.userName || req.userEmail}
                        </div>
                        <div style={{ fontSize: "11.5px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {req.userEmail}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--text-muted)", flexShrink: 0 }}>
                      <Clock size={12} />
                      <span>{formatDate(req.createdAt)}</span>
                    </div>
                  </div>

                  {/* Middle: Request Context Badges */}
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
                    {/* Document Badge */}
                    <div 
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-medium)",
                        fontSize: "11.5px",
                        color: "var(--text-primary)",
                        fontWeight: 500
                      }}
                      title="Requested Document"
                    >
                      <FileText size={12} style={{ color: "var(--accent)" }} />
                      <span style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {req.documentName || "Document"}
                      </span>
                    </div>

                    {/* Language Badge */}
                    <div 
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-medium)",
                        fontSize: "11.5px",
                        color: "var(--text-primary)",
                        fontWeight: 600
                      }}
                      title="Requested Target Language"
                    >
                      {langCode ? <LanguageFlag code={langCode} /> : <Globe size={12} style={{ color: "var(--emerald)" }} />}
                      <span>{langName} {langCode ? `(${langCode.toUpperCase()})` : ""}</span>
                    </div>

                    {/* Permission Request Badge */}
                    <div 
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: (req.permission || "write") === "write" ? "rgba(99, 102, 241, 0.12)" : "rgba(59, 130, 246, 0.12)",
                        border: "1px solid " + ((req.permission || "write") === "write" ? "rgba(99, 102, 241, 0.3)" : "rgba(59, 130, 246, 0.3)"),
                        fontSize: "11px",
                        color: (req.permission || "write") === "write" ? "var(--accent)" : "var(--blue)",
                        fontWeight: 600
                      }}
                    >
                      <span>Requested: {(req.permission || "write") === "write" ? "Write (Edit)" : "Read (View)"}</span>
                    </div>
                  </div>

                  {/* Bottom: Action Buttons */}
                  <div 
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: "8px",
                      paddingTop: "8px",
                      borderTop: "1px solid var(--border-subtle)"
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleAction(req, "reject")}
                      disabled={isProcessing}
                      style={{
                        background: "transparent",
                        border: "1px solid transparent",
                        color: "var(--text-secondary)",
                        borderRadius: "8px",
                        padding: "5px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: isProcessing ? "not-allowed" : "pointer",
                        opacity: isProcessing ? 0.6 : 1,
                        transition: "all 0.15s"
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--rose)"; e.currentTarget.style.background = "rgba(244, 63, 94, 0.1)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "transparent"; }}
                    >
                      Decline
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAction(req, "approve", "read")}
                      disabled={isProcessing}
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-medium)",
                        color: "var(--text-primary)",
                        borderRadius: "8px",
                        padding: "5px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: isProcessing ? "not-allowed" : "pointer",
                        opacity: isProcessing ? 0.6 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        transition: "all 0.15s"
                      }}
                      title="Approve with Read-only access"
                    >
                      <span>Approve (Read)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAction(req, "approve", "write")}
                      disabled={isProcessing}
                      style={{
                        background: "var(--accent)",
                        border: "none",
                        color: "#ffffff",
                        borderRadius: "8px",
                        padding: "5px 14px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: isProcessing ? "not-allowed" : "pointer",
                        opacity: isProcessing ? 0.6 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        boxShadow: "0 2px 8px rgba(99, 102, 241, 0.35)",
                        transition: "opacity 0.15s"
                      }}
                      title="Approve with Write (Edit) access"
                    >
                      <Check size={13} />
                      <span>{isProcessing ? "Processing..." : "Approve (Write)"}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div 
          style={{
            padding: "12px 24px",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--bg-panel)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            {requests.length > 0 ? `${requests.length} pending request(s)` : "All caught up"}
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-medium)",
              borderRadius: "8px",
              padding: "6px 18px",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
