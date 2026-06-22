import React, { useState, useEffect } from "react";
import { X, UserPlus, Trash2, Copy, Check, Lock, Globe, Shield } from "lucide-react";
import { fetchDocumentAccess, grantDocumentAccess, revokeDocumentAccess } from "../services/api.js";

export function ShareModal({ isOpen, onClose, documentId, docName }) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("read");
  const [accessList, setAccessList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const shareUrl = `${window.location.origin}/?doc=${documentId}`;

  // Fetch access list when modal is opened
  useEffect(() => {
    if (isOpen && documentId) {
      loadAccessList();
    }
  }, [isOpen, documentId]);

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

  const handleGrant = async (e) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    setError("");
    try {
      await grantDocumentAccess(documentId, email, permission);
      setEmail("");
      loadAccessList();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to grant access. Double check email.");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-400" />
              Share Document Workspace
            </h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-[350px] truncate">
              {docName || "Document"}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          
          {/* Share Link Row */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Workspace link</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-3 py-2.5 focus:outline-none select-all"
              />
              <button
                onClick={copyToClipboard}
                className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold border transition-all ${
                  copied 
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                    : "bg-indigo-600 border-indigo-500 hover:bg-indigo-500 text-white"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <hr className="border-zinc-800" />

          {/* Add collaborator form */}
          <form onSubmit={handleGrant} className="space-y-3">
            <label className="block text-xs font-semibold text-zinc-400">Add user by email</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <input
                  type="email"
                  required
                  placeholder="collaborator@verbolabs.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs rounded-lg pl-3 pr-10 py-2.5 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={permission}
                  onChange={(e) => setPermission(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-3 py-2.5 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="read">Can view (Read-only)</option>
                  <option value="write">Can edit (Read/Write)</option>
                </select>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg border border-zinc-700 transition-colors disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Grant
                </button>
              </div>
            </div>
          </form>

          {/* Error Message */}
          {error && (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
              {error}
            </div>
          )}

          {/* Access List */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2">People with access</label>
            <div className="max-h-[180px] overflow-y-auto border border-zinc-800 rounded-lg divide-y divide-zinc-900 bg-zinc-900/50 pr-1">
              {loading ? (
                <div className="p-4 text-center text-xs text-zinc-500">Loading access list...</div>
              ) : accessList.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500 flex flex-col items-center gap-1">
                  <Lock className="w-4 h-4 text-zinc-600" />
                  Only Owner & VerboLabs staff currently have access
                </div>
              ) : (
                accessList.map((item) => (
                  <div key={item.userId} className="flex items-center justify-between p-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">{item.name}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{item.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] bg-zinc-800/80 text-zinc-400 border border-zinc-700/50 rounded px-1.5 py-0.5 capitalize">
                        {item.permission}
                      </span>
                      <button
                        onClick={() => handleRevoke(item.userId)}
                        className="p-1 rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-rose-400 transition-all"
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
        <div className="p-4 bg-zinc-900/30 border-t border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <Shield className="w-3 h-3 text-emerald-500" />
            VerboLabs staff bypass all restrictions.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
