import React, { useState, useEffect, useRef } from "react";
import { X, Copy, Check, Lock, Globe, Shield, Link, Users, ChevronDown } from "lucide-react";
import { 
  fetchDocumentAccess, grantDocumentAccess, revokeDocumentAccess, 
  fetchProjectShares, shareProject, revokeProjectShare,
  searchUsers, fetchPublicAccess, updatePublicAccess 
} from "../services/api.js";

export function ShareModal({ isOpen, onClose, documentId, docName, projectId, targetLang, isOwner = true }) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("write");
  const [accessList, setAccessList] = useState([]);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  
  const [publicAccess, setPublicAccess] = useState("none");

  // Suggestion states
  const [emailSuggestions, setEmailSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const dropdownRef = useRef(null);

  const getShareUrl = () => {
    if (projectId && documentId && targetLang) {
      return `${window.location.origin}/project/${projectId}/file/${documentId}/lang/${targetLang}`;
    }
    if (projectId) {
      return `${window.location.origin}/project/${projectId}`;
    }
    if (documentId) {
      return `${window.location.origin}/?doc=${documentId}`;
    }
    return window.location.origin;
  };

  const shareUrl = getShareUrl();

  // Fetch access list when modal is opened
  useEffect(() => {
    if (isOpen && (documentId || projectId)) {
      loadAccessList();
    }
  }, [isOpen, documentId, projectId]);

  // Click outside listener for suggestions dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const loadAccessList = async () => {
    setLoading(true);
    setError("");
    try {
      if (projectId && !documentId) {
        const res = await fetchProjectShares(projectId);
        if (res && res.owner) {
          setOwner(res.owner);
          setAccessList(res.collaborators || []);
        } else {
          setAccessList(res || []);
          setOwner(null);
        }
      } else if (documentId) {
        const res = await fetchDocumentAccess(documentId);
        if (res && res.owner) {
          setOwner(res.owner);
          setAccessList(res.collaborators || []);
        } else {
          setAccessList(res || []);
          setOwner(null);
        }

        const pubRes = await fetchPublicAccess(documentId);
        setPublicAccess(pubRes.publicAccess || "none");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load access list.");
    } finally {
      setLoading(false);
    }
  };

  const handlePublicAccessChange = async (value) => {
    if (!documentId) return;
    setError("");
    try {
      const res = await updatePublicAccess(documentId, value);
      setPublicAccess(res.publicAccess);
    } catch (err) {
      console.error(err);
      setError("Failed to update link sharing settings.");
    }
  };

  const handleEmailChange = async (e) => {
    const value = e.target.value;
    setEmail(value);
    
    if (value.trim().length >= 2) {
      try {
        const results = await searchUsers(value.trim());
        setEmailSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch (err) {
        console.error("Suggestions fetch error:", err);
      }
    } else {
      setEmailSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (userEmail) => {
    setEmail(userEmail);
    setEmailSuggestions([]);
    setShowSuggestions(false);
  };

  const handleGrant = async (e) => {
    e.preventDefault();
    if (!email) return;
    if (!isOwner) {
      setError("Only the project owner can invite users.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (projectId && !documentId) {
        await shareProject(projectId, email, "editor");
      } else if (documentId) {
        await grantDocumentAccess(documentId, email, "write");
      }
      setEmail("");
      setEmailSuggestions([]);
      setShowSuggestions(false);
      loadAccessList();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to grant access. Double check user email.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (targetId) => {
    if (!isOwner) {
      setError("Only the project owner can revoke access.");
      return;
    }
    setError("");
    try {
      if (projectId && !documentId) {
        await revokeProjectShare(projectId, targetId);
      } else if (documentId) {
        await revokeDocumentAccess(documentId, targetId);
      }
      loadAccessList();
    } catch (err) {
      console.error(err);
      setError("Failed to revoke access.");
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getAvatarInitials = (emailStr) => {
    if (!emailStr) return "?";
    return emailStr.substring(0, 2).toUpperCase();
  };

  const getAvatarColor = (emailStr) => {
    const colors = [
      "bg-blue-600/20 text-blue-400 border border-blue-500/30",
      "bg-purple-600/20 text-purple-400 border border-purple-500/30",
      "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30",
      "bg-amber-600/20 text-amber-400 border border-amber-500/30",
      "bg-pink-600/20 text-pink-400 border border-pink-500/30",
      "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30",
      "bg-rose-600/20 text-rose-400 border border-rose-500/30"
    ];
    const code = emailStr ? emailStr.charCodeAt(0) : 0;
    return colors[code % colors.length];
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-2xl select-none text-left p-6 flex flex-col gap-6" style={{ borderRadius: "6px" }}>
        
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)] leading-snug">
              Share {projectId && !documentId ? "Project" : "Document"} "{docName || (projectId ? "Project" : "Untitled Document")}"
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form to Add Collaborators (Only visible to Owner) */}
        {isOwner ? (
          <form onSubmit={handleGrant} className="flex gap-2 relative z-50 h-[42px]">
            <div className="flex-1 relative h-full" ref={dropdownRef}>
              <input
                type="email"
                required
                placeholder="Add people by email..."
                value={email}
                onChange={handleEmailChange}
                className="w-full h-full rounded-xl border border-[var(--border-medium)] bg-[var(--bg-input)] px-4 text-[var(--text-primary)] outline-none transition-all focus:border-[var(--accent)] text-xs font-semibold placeholder-[var(--text-muted)]"
              />
              
              {/* Email Suggestions Dropdown */}
              {showSuggestions && emailSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-2 z-50 max-h-[160px] overflow-y-auto bg-[var(--bg-elevated)] border border-[var(--border-medium)] rounded-xl shadow-2xl divide-y divide-[var(--border-subtle)]">
                  {emailSuggestions.map((user) => (
                    <button
                      key={user.email}
                      type="button"
                      onClick={() => selectSuggestion(user.email)}
                      className="w-full text-left px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors flex flex-col justify-center cursor-pointer"
                    >
                      <span className="text-xs font-bold text-[var(--text-primary)] truncate">{user.email.split("@")[0]}</span>
                      <span className="text-[10px] text-[var(--text-secondary)] truncate mt-0.5">{user.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || !email}
              className="flex items-center justify-center bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold px-6 rounded-xl transition-all cursor-pointer shadow-sm disabled:opacity-50 h-full"
            >
              Add
            </button>
          </form>
        ) : (
          <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl p-3 font-medium">
            Only the project owner can invite new collaborators or manage sharing access.
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="text-xs font-semibold text-[var(--text-rose)] bg-[var(--rose)]/10 border border-[var(--rose)]/20 rounded-xl p-3">
            {error}
          </div>
        )}

        {/* People with Access */}
        <div className="flex flex-col gap-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            People with access
          </span>
          <div className="flex flex-col gap-3 max-h-[190px] overflow-y-auto pr-1">
            {loading ? (
              <div className="py-4 text-center text-xs text-[var(--text-muted)] font-bold">Loading members...</div>
            ) : (
              <>
                {/* Render Owner - Permanent access, no remove button */}
                {owner && (
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${getAvatarColor(owner.email)}`}>
                        {getAvatarInitials(owner.email)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--text-primary)] truncate">{owner.name}</p>
                        <p className="text-[10px] text-[var(--text-secondary)] truncate mt-0.5">{owner.email}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md select-none">
                      Owner
                    </span>
                  </div>
                )}

                {/* Render Collaborators */}
                {accessList.map((item) => (
                  <div key={item.userId || item.shareId || item.email} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${getAvatarColor(item.email)}`}>
                        {getAvatarInitials(item.email)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--text-primary)] truncate">{item.name}</p>
                        <p className="text-[10px] text-[var(--text-secondary)] truncate mt-0.5">{item.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md">
                        Editor
                      </span>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(item.userId || item.shareId)}
                          className="text-xs font-bold text-[var(--text-rose)] hover:text-red-400 cursor-pointer transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* General Access */}
        <div className="flex flex-col gap-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            General access
          </span>
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-full bg-[var(--bg-input)] border border-[var(--border-medium)] flex items-center justify-center text-[var(--text-secondary)] flex-shrink-0 mt-0.5">
              {publicAccess === "none" ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4 text-[var(--text-accent)]" />}
            </div>
            <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <select
                    value={publicAccess === "none" ? "none" : "link"}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "none") {
                        handlePublicAccessChange("none");
                      } else {
                        handlePublicAccessChange("read"); // defaults to viewer
                      }
                    }}
                    className="bg-transparent border-none outline-none text-xs font-bold text-[var(--text-primary)] cursor-pointer py-0.5 rounded transition-colors"
                  >
                    <option value="none">Restricted</option>
                    <option value="link">Anyone with the link</option>
                  </select>
                </div>
                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                  {publicAccess === "none" 
                    ? "Only people added can open with this link" 
                    : publicAccess === "write"
                      ? "Anyone on the Internet with this link can edit"
                      : publicAccess === "comment"
                        ? "Anyone on the Internet with this link can comment"
                        : "Anyone on the Internet with this link can view"
                  }
                </p>
              </div>

              {publicAccess !== "none" && (
                <div>
                  <select
                    value={publicAccess}
                    onChange={(e) => handlePublicAccessChange(e.target.value)}
                    className="bg-transparent border-none outline-none text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer py-0.5 rounded transition-colors"
                  >
                    <option value="read">Viewer</option>
                    <option value="comment">Commenter</option>
                    <option value="write">Editor</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-4 mt-2">
          <button
            type="button"
            onClick={copyToClipboard}
            className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-all cursor-pointer ${
              copied 
                ? "bg-[var(--emerald-glow)] border-[var(--emerald-glow)] text-[var(--text-emerald)]" 
                : "bg-transparent border-[var(--border-medium)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Link copied
              </>
            ) : (
              <>
                <Link className="w-3.5 h-3.5" />
                Copy link
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-black px-6 py-2 transition-all cursor-pointer shadow-sm"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
