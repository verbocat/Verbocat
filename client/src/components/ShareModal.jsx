import React, { useState, useEffect, useRef } from "react";
import { X, UserPlus, Trash2, Copy, Check, Lock, Globe, Shield } from "lucide-react";
import { fetchDocumentAccess, grantDocumentAccess, revokeDocumentAccess, searchUsers, fetchPublicAccess, updatePublicAccess } from "../services/api.js";

export function ShareModal({ isOpen, onClose, documentId, docName }) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("read");
  const [accessList, setAccessList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  
  const [publicAccess, setPublicAccess] = useState("none");

  // Suggestion states
  const [emailSuggestions, setEmailSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const dropdownRef = useRef(null);

  const shareUrl = `${window.location.origin}/?doc=${documentId}`;

  // Fetch access list when modal is opened
  useEffect(() => {
    if (isOpen && documentId) {
      loadAccessList();
    }
  }, [isOpen, documentId]);

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
      const data = await fetchDocumentAccess(documentId);
      setAccessList(data);

      const pubRes = await fetchPublicAccess(documentId);
      setPublicAccess(pubRes.publicAccess || "none");
    } catch (err) {
      console.error(err);
      setError("Failed to load access list.");
    } finally {
      setLoading(false);
    }
  };

  const togglePublicAccess = async () => {
    setError("");
    const nextAccessVal = publicAccess === "write" ? "none" : "write";
    try {
      const res = await updatePublicAccess(documentId, nextAccessVal);
      setPublicAccess(res.publicAccess);
    } catch (err) {
      console.error(err);
      setError("Failed to update public access link sharing settings.");
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
    setSubmitting(true);
    setError("");
    try {
      await grantDocumentAccess(documentId, email, permission);
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

  const handleRevoke = async (userId) => {
    setError("");
    try {
      await revokeDocumentAccess(documentId, userId);
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

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-2xl select-none">
        
        {/* Header */}
        <div className="modal-header">
          <div>
            <h3 className="modal-title flex items-center gap-2">
              <Globe className="w-4 h-4 text-[var(--text-accent)]" />
              Share Document Workspace
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-[450px] truncate font-bold">
              {docName || "Untitled Document"}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="modal-close"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="modal-body space-y-6">
          
          {/* Share Link Row */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Workspace link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 rounded-xl border border-[var(--border-medium)] bg-[var(--bg-input)] px-3.5 py-3 text-[var(--text-primary)] outline-none select-all text-xs font-semibold"
              />
              <button
                type="button"
                onClick={copyToClipboard}
                className={`flex h-[42px] items-center justify-center gap-1.5 px-5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-md ${
                  copied 
                    ? "bg-[var(--emerald-glow)] border-[var(--emerald-glow)] text-[var(--text-emerald)] hover:bg-[var(--emerald-glow)]" 
                    : "bg-[var(--accent)] border-[var(--accent)] hover:bg-[var(--accent-hover)] hover:border-[var(--accent-hover)] text-white"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Link
                  </>
                )}
              </button>
            </div>

            {/* Public Link Sharing toggle card */}
            <div className="flex items-center justify-between p-3.5 bg-[var(--bg-input)] border border-[var(--border-medium)] rounded-xl mt-3 select-none">
              <div className="space-y-1">
                <span className="text-xs font-bold text-[var(--text-primary)]">Public Link Sharing</span>
                <p className="text-[10px] text-[var(--text-secondary)] font-bold">
                  {publicAccess === "write" ? "Anyone with the link can edit" : "Restricted: Only invited people can access"}
                </p>
              </div>
              <button
                type="button"
                onClick={togglePublicAccess}
                className={`rounded-xl px-4 py-2 text-[10px] font-bold border transition-all cursor-pointer shadow-md ${
                  publicAccess === "write"
                    ? "bg-[var(--emerald-glow)] border-[var(--emerald-glow)] text-[var(--text-emerald)] hover:bg-[var(--emerald-glow)]"
                    : "bg-[var(--accent)] border-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
                }`}
              >
                {publicAccess === "write" ? "Restrict Access" : "Share with Anyone to Edit"}
              </button>
            </div>

          </div>

          <hr className="border-[var(--border-subtle)]" />

          {/* Add collaborator form */}
          <form onSubmit={handleGrant} className="space-y-4">
            
            {/* Row 1: Email Input (Full Width) */}
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Add user by email
              </label>
              <div className="relative" ref={dropdownRef}>
                <input
                  type="email"
                  required
                  placeholder="collaborator@verbolabs.com"
                  value={email}
                  onChange={handleEmailChange}
                  className="w-full rounded-xl border border-[var(--border-medium)] bg-[var(--bg-input)] px-3.5 py-3 text-[var(--text-primary)] outline-none transition-all focus:border-[var(--border-focus)] text-xs"
                />
                
                {/* Email Suggestions Dropdown */}
                {showSuggestions && emailSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1.5 z-50 max-h-[160px] overflow-y-auto bg-[var(--bg-elevated)] border border-[var(--border-medium)] rounded-xl shadow-2xl divide-y divide-[var(--border-subtle)]">
                    {emailSuggestions.map((user) => (
                      <button
                        key={user.email}
                        type="button"
                        onClick={() => selectSuggestion(user.email)}
                        className="w-full text-left px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors flex flex-col justify-center cursor-pointer"
                      >
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate">{user.full_name || "Linguist"}</span>
                        <span className="text-[10px] text-[var(--text-secondary)] truncate mt-0.5">{user.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Select permission and Grant button */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <select
                  value={permission}
                  onChange={(e) => setPermission(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-medium)] bg-[var(--bg-input)] px-3.5 py-3 text-[var(--text-primary)] outline-none transition-all focus:border-[var(--border-focus)] text-xs cursor-pointer h-[44px]"
                >
                  <option value="read">Can view (Read-only)</option>
                  <option value="write">Can edit (Read/Write)</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="flex h-[44px] items-center justify-center gap-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white border border-[var(--accent)] text-xs font-bold px-6 rounded-xl transition-all cursor-pointer shadow-md disabled:opacity-50 min-w-[140px]"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Grant Access
              </button>
            </div>

          </form>

          {/* Error Message */}
          {error && (
            <div className="text-xs font-bold text-[var(--text-rose)] bg-[var(--rose)]/10 border border-[var(--rose)]/20 rounded-xl p-3.5">
              {error}
            </div>
          )}

          {/* Access List */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              People with access
            </label>
            <div className="max-h-[200px] overflow-y-auto border border-[var(--border-medium)] rounded-xl divide-y divide-[var(--border-subtle)] bg-[var(--bg-input)] pr-1">
              {loading ? (
                <div className="p-5 text-center text-xs text-[var(--text-muted)] font-bold">Loading access list...</div>
              ) : accessList.length === 0 ? (
                <div className="p-6 text-center text-xs text-[var(--text-secondary)] flex flex-col items-center gap-1.5 font-bold">
                  <Lock className="w-4 h-4 text-[var(--text-muted)] mb-1" />
                  Only the Owner & VerboLabs staff currently have access
                </div>
              ) : (
                accessList.map((item) => (
                  <div key={item.userId} className="flex items-center justify-between p-3.5 hover:bg-[var(--bg-hover)] transition-colors">
                    <div className="min-w-0 pr-3">
                      <p className="text-xs font-bold text-[var(--text-primary)] truncate">{item.name}</p>
                      <p className="text-[10px] text-[var(--text-secondary)] font-bold mt-0.5 truncate">{item.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black uppercase tracking-wider bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded px-2 py-0.5">
                        {item.permission}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRevoke(item.userId)}
                        className="rounded-lg p-1.5 bg-[var(--bg-hover)] hover:bg-[var(--rose)]/15 text-[var(--text-secondary)] hover:text-[var(--text-rose)] transition-all border border-[var(--border-subtle)] cursor-pointer"
                        title="Revoke access"
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

        {/* Footer */}
        <div className="p-5 bg-[var(--bg-base)] border-t border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] font-bold">
            <Shield className="w-3.5 h-3.5 text-[var(--text-emerald)]" />
            VerboLabs staff bypass all restrictions.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent transition-all cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
