import React, { useState, useEffect, useRef } from "react";
import { X, UserPlus, Trash2, Copy, Check, Lock, Globe, Shield } from "lucide-react";
import { fetchDocumentAccess, grantDocumentAccess, revokeDocumentAccess, searchUsers } from "../services/api.js";

export function ShareModal({ isOpen, onClose, documentId, docName }) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("read");
  const [accessList, setAccessList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  
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
    } catch (err) {
      console.error(err);
      setError("Failed to load access list.");
    } finally {
      setLoading(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2 select-none">
              <Globe className="w-5 h-5 text-indigo-400" />
              Share Document Workspace
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-[450px] truncate font-bold">
              {docName || "Untitled Document"}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="rounded-lg p-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          
          {/* Share Link Row */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 select-none">
              Workspace link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-slate-100 outline-none select-all text-xs font-semibold"
              />
              <button
                onClick={copyToClipboard}
                className={`flex h-[42px] items-center justify-center gap-1.5 px-5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-md ${
                  copied 
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20" 
                    : "bg-indigo-600 border-indigo-500 hover:bg-indigo-500 hover:border-indigo-400 text-white"
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
          </div>

          <hr className="border-white/5" />

          {/* Add collaborator form */}
          <form onSubmit={handleGrant} className="space-y-2.5">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 select-none">
              Add user by email
            </label>
            <div className="flex flex-col sm:flex-row gap-3 relative">
              <div className="flex-1 relative" ref={dropdownRef}>
                <input
                  type="email"
                  required
                  placeholder="collaborator@verbolabs.com"
                  value={email}
                  onChange={handleEmailChange}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-slate-100 outline-none transition-all focus:border-indigo-500/50 text-xs"
                />
                
                {/* Email Suggestions Dropdown */}
                {showSuggestions && emailSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1.5 z-55 max-h-[160px] overflow-y-auto bg-zinc-900 border border-white/10 rounded-xl shadow-2xl divide-y divide-white/5">
                    {emailSuggestions.map((user) => (
                      <button
                        key={user.email}
                        type="button"
                        onClick={() => selectSuggestion(user.email)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-white/5 transition-colors flex flex-col justify-center cursor-pointer"
                      >
                        <span className="text-xs font-semibold text-white truncate">{user.full_name || "Linguist"}</span>
                        <span className="text-[10px] text-slate-400 truncate mt-0.5">{user.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <select
                  value={permission}
                  onChange={(e) => setPermission(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-slate-100 outline-none transition-all focus:border-indigo-500/50 text-xs cursor-pointer min-w-[150px]"
                >
                  <option value="read">Can view (Read-only)</option>
                  <option value="write">Can edit (Read/Write)</option>
                </select>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex h-[42px] items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 hover:border-indigo-400 text-white border border-indigo-500 text-xs font-bold px-5 rounded-xl transition-all cursor-pointer shadow-md disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Grant Access
                </button>
              </div>
            </div>
          </form>

          {/* Error Message */}
          {error && (
            <div className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5 animate-fade-in">
              {error}
            </div>
          )}

          {/* Access List */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 select-none">
              People with access
            </label>
            <div className="max-h-[220px] overflow-y-auto border border-white/10 rounded-xl divide-y divide-white/5 bg-black/40 pr-1">
              {loading ? (
                <div className="p-5 text-center text-xs text-slate-500 font-bold">Loading access list...</div>
              ) : accessList.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5 font-bold">
                  <Lock className="w-5 h-5 text-slate-600 mb-1" />
                  Only the Owner & VerboLabs staff currently have access
                </div>
              ) : (
                accessList.map((item) => (
                  <div key={item.userId} className="flex items-center justify-between p-3.5 hover:bg-white/[0.01] transition-colors">
                    <div className="min-w-0 pr-3">
                      <p className="text-xs font-bold text-white truncate">{item.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5 truncate">{item.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black uppercase tracking-wider bg-white/5 text-slate-400 border border-white/10 rounded px-2 py-0.5">
                        {item.permission}
                      </span>
                      <button
                        onClick={() => handleRevoke(item.userId)}
                        className="rounded-lg p-1.5 bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-all border border-white/5 cursor-pointer"
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
        <div className="p-5 bg-zinc-900/30 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold select-none">
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            VerboLabs staff bypass all restrictions.
          </div>
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 border border-transparent transition-all cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
