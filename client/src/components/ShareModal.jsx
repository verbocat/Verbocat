import React, { useState, useEffect, useRef } from "react";
import { X, Copy, Check, Lock, Globe, Shield, Link, Users, ChevronDown, Plus, FileText, Sparkles, UserCheck, AlertCircle, ExternalLink } from "lucide-react";
import { 
  fetchDocumentAccess, grantDocumentAccess, revokeDocumentAccess, 
  fetchProjectShares, shareProject, revokeProjectShare,
  searchUsers, fetchLinguists, bulkShareDocuments, fetchPublicAccess, updatePublicAccess,
  fetchProjectPublicAccess, updateProjectPublicAccess
} from "../services/api.js";
import { LANGUAGES } from "../constants/languages";

export function ShareModal({ 
  isOpen, 
  onClose, 
  documentId, 
  docName, 
  projectId, 
  targetLang, 
  isOwner = true,
  mode = null, // 'project' | 'file' | 'bulk_files' | 'language'
  selectedDocumentIds = [],
  selectedDocNames = [],
  languageName = null,
  documentCount = 0,
  targetLanguages = [],
  selectedJobItems = []
}) {
  const [emailInput, setEmailInput] = useState("");
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [permission, setPermission] = useState("write");
  const [accessList, setAccessList] = useState([]);
  const [availableLinguists, setAvailableLinguists] = useState([]);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedSingleCode, setCopiedSingleCode] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  
  const [publicAccess, setPublicAccess] = useState("none");

  // Suggestion states
  const [emailSuggestions, setEmailSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const dropdownRef = useRef(null);

  const activeMode = mode || (projectId && !documentId ? "project" : "file");
  const isProjectMode = activeMode === "project";

  // Build space-aware base URL so share links always carry the correct tenant
  const getSpaceSuffix = () => {
    const spaceParam = new URLSearchParams(window.location.search).get("space");
    if (spaceParam && !["centroid", "verbolabs"].includes(spaceParam.toLowerCase())) {
      return `?space=${spaceParam}`;
    }
    return "";
  };

  const getLanguageName = (code) => {
    if (!code) return "";
    const found = LANGUAGES.find(l => l.code === code.toLowerCase());
    return found ? found.name : code.toUpperCase();
  };

  const getLanguageFlag = (code) => {
    if (!code) return "🌐";
    const found = LANGUAGES.find(l => l.code === code.toLowerCase());
    return found?.flag || "🌐";
  };

  // Generate All Direct Links (Project Workspace + Specific Job / File Editor Links)
  const generateAllDirectLinks = () => {
    const spaceSuffix = getSpaceSuffix();
    const origin = window.location.origin;
    const links = [];

    // 1. If explicit selected job items are provided (e.g. 6 French jobs across 6 files)
    if (selectedJobItems && selectedJobItems.length > 0) {
      selectedJobItems.forEach((jobItem, idx) => {
        const lName = jobItem.langName || getLanguageName(jobItem.targetLang);
        const flag = getLanguageFlag(jobItem.targetLang);
        const dName = jobItem.docName || `Document ${idx + 1}`;
        const url = `${origin}/project/${projectId}/file/${jobItem.fileId}/lang/${jobItem.targetLang}${spaceSuffix}`;
        links.push({
          label: `${dName} (${lName})`,
          code: `${jobItem.fileId}_${jobItem.targetLang}`,
          flag,
          url
        });
      });
      return links;
    }

    // 2. If multiple document IDs are selected for a target language (e.g. 6 files for French)
    if (selectedDocumentIds && selectedDocumentIds.length > 1 && targetLang) {
      const lName = languageName || getLanguageName(targetLang);
      const flag = getLanguageFlag(targetLang);
      selectedDocumentIds.forEach((docId, idx) => {
        const dName = selectedDocNames[idx] || `Document ${idx + 1}`;
        const url = `${origin}/project/${projectId}/file/${docId}/lang/${targetLang}${spaceSuffix}`;
        links.push({
          label: `${dName} (${lName})`,
          code: `${docId}_${targetLang}`,
          flag,
          url
        });
      });
      return links;
    }

    // 3. Single file or project workspace links
    if (projectId && documentId && targetLang) {
      const lName = languageName || getLanguageName(targetLang);
      const flag = getLanguageFlag(targetLang);
      links.push({
        label: `${docName || 'Document'} (${lName}) Editor`,
        code: `${documentId}_${targetLang}`,
        flag,
        url: `${origin}/project/${projectId}/file/${documentId}/lang/${targetLang}${spaceSuffix}`
      });
      return links;
    }

    if (projectId && documentId && targetLanguages && targetLanguages.length > 0) {
      targetLanguages.forEach((tCode) => {
        const lName = getLanguageName(tCode);
        const flag = getLanguageFlag(tCode);
        links.push({
          label: `${docName || 'Document'} (${lName}) Editor`,
          code: `${documentId}_${tCode}`,
          flag,
          url: `${origin}/project/${projectId}/file/${documentId}/lang/${tCode}${spaceSuffix}`
        });
      });
      return links;
    }

    // Fallback Project Workspace Link
    if (projectId) {
      links.push({
        label: "Project Workspace",
        code: "project",
        flag: "📁",
        url: `${origin}/project/${projectId}${spaceSuffix}`
      });
    }

    return links;
  };

  const allDirectLinks = generateAllDirectLinks();

  const copyAllLinksToClipboard = () => {
    if (allDirectLinks.length === 0) return;
    const formattedText = allDirectLinks
      .map(l => `${l.label} (${l.code}): ${l.url}`)
      .join("\n");
    navigator.clipboard.writeText(formattedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const copySingleLinkToClipboard = (url, code) => {
    navigator.clipboard.writeText(url);
    setCopiedSingleCode(code);
    setTimeout(() => setCopiedSingleCode(null), 2000);
  };

  // Fetch access list & available linguists when modal is opened
  useEffect(() => {
    if (isOpen) {
      setEmailInput("");
      setSelectedEmails([]);
      setError("");
      setSuccessMsg("");
      loadAccessList();
      loadAvailableLinguists();
    }
  }, [isOpen, documentId, projectId, activeMode]);

  // Click outside listener for suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadAvailableLinguists = async () => {
    try {
      const data = await fetchLinguists();
      setAvailableLinguists(data.linguists || []);
    } catch (err) {
      console.error("Failed to load linguists:", err);
    }
  };

  const loadAccessList = async () => {
    setLoading(true);
    try {
      if (isProjectMode && projectId) {
        const data = await fetchProjectShares(projectId);
        setAccessList(data.shares || []);
        setOwner(data.owner || null);
        const pubData = await fetchProjectPublicAccess(projectId);
        setPublicAccess(pubData.publicAccess || "none");
      } else if (documentId) {
        const data = await fetchDocumentAccess(documentId);
        setAccessList(data.access || []);
        setOwner(data.owner || null);
        const pubData = await fetchPublicAccess(documentId);
        setPublicAccess(pubData.publicAccess || "none");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load access list.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailInputChange = async (val) => {
    setEmailInput(val);
    if (val.trim().length > 1) {
      try {
        const res = await searchUsers(val.trim());
        setEmailSuggestions(res.users || []);
        setShowSuggestions(true);
      } catch (err) {
        console.error(err);
      }
    } else {
      setEmailSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const addEmailTag = (emailToUse) => {
    const emailToAdd = emailToUse || emailInput.trim();
    if (!emailToAdd) return;
    if (!emailToAdd.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!selectedEmails.includes(emailToAdd.toLowerCase())) {
      setSelectedEmails(prev => [...prev, emailToAdd.toLowerCase()]);
    }
    setEmailInput("");
    setShowSuggestions(false);
    setError("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      addEmailTag();
    }
  };

  const removeEmailTag = (emailToRemove) => {
    setSelectedEmails(prev => prev.filter(e => e !== emailToRemove));
  };

  const handleGrantAccess = async (e) => {
    e.preventDefault();
    const emailsToProcess = [...selectedEmails];
    if (emailInput.trim()) {
      const pendingEmail = emailInput.trim();
      if (pendingEmail.includes("@") && !emailsToProcess.includes(pendingEmail.toLowerCase())) {
        emailsToProcess.push(pendingEmail.toLowerCase());
      }
    }

    if (emailsToProcess.length === 0) {
      setError("Please select or type at least one user email.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccessMsg("");

    try {
      if (isProjectMode && projectId) {
        await shareProject(projectId, emailsToProcess, permission);
        setSuccessMsg(`Project access granted to ${emailsToProcess.length} user(s)!`);
      } else if (activeMode === "bulk_files" || activeMode === "language" || selectedDocumentIds.length > 1) {
        await bulkShareDocuments(selectedDocumentIds, emailsToProcess, permission, targetLang);
        setSuccessMsg(`Access granted to ${emailsToProcess.length} user(s) for ${selectedDocumentIds.length} document(s)!`);
      } else if (documentId) {
        await grantDocumentAccess(documentId, emailsToProcess, permission, targetLang);
        setSuccessMsg(`Access granted to ${emailsToProcess.length} user(s)!`);
      }

      setSelectedEmails([]);
      setEmailInput("");
      loadAccessList();
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || err.message || "Failed to grant access.";
      setError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (identifier) => {
    try {
      if (isProjectMode && projectId) {
        await revokeProjectShare(projectId, identifier);
      } else if (documentId) {
        await revokeDocumentAccess(documentId, identifier);
      }
      setSuccessMsg("Access revoked.");
      loadAccessList();
    } catch (err) {
      console.error(err);
      setError("Failed to revoke access.");
    }
  };

  const handlePublicAccessChange = async (newAccess) => {
    setPublicAccess(newAccess);
    try {
      if (isProjectMode && projectId) {
        await updateProjectPublicAccess(projectId, newAccess);
      } else if (documentId) {
        await updatePublicAccess(documentId, newAccess);
      }
      setSuccessMsg(`Public link access updated to: ${newAccess}`);
    } catch (err) {
      console.error(err);
      setError("Failed to update link access settings.");
    }
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
      <div className="modal-card max-w-2xl select-text text-left p-5 flex flex-col gap-4 border border-indigo-500/30 shadow-2xl rounded-xl">
        
        {/* Modal Header Banner */}
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                isProjectMode 
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30" 
                  : activeMode === "language"
                    ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                    : "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
              }`}>
                {isProjectMode ? "Project Coordinator Access" : activeMode === "language" ? "Language Package Assignment" : activeMode === "bulk_files" ? "Bulk Assignment" : "File Share & Assignment"}
              </span>
            </div>

            <h3 className="text-base font-black text-[var(--text-primary)] leading-snug">
              {isProjectMode && `Share Project "${docName || "Untitled Project"}"`}
              {activeMode === "language" && `Assign ${languageName || targetLang?.toUpperCase() || "Target Language"} Files`}
              {activeMode === "bulk_files" && `Assign ${selectedDocumentIds.length} Selected Items`}
              {activeMode === "file" && `Assign Document "${docName || "Untitled Document"}"`}
            </h3>

            <p className="text-xs text-[var(--text-secondary)] font-medium">
              {isProjectMode && "Grant workspace access to Project Coordinators and VerbiLabs Staff."}
              {activeMode === "language" && `Assigning all file(s) for ${languageName || targetLang} to linguists.`}
              {activeMode === "bulk_files" && `Assigning selected files/jobs to linguists simultaneously.`}
              {activeMode === "file" && "Assign this file to linguists or collaborators."}
            </p>
          </div>

          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Items Summary Pill List */}
        {!isProjectMode && selectedDocNames.length > 0 && (
          <div className="bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg p-2.5 max-h-20 overflow-y-auto space-y-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
              Included Items ({selectedDocNames.length}):
            </span>
            <div className="flex flex-wrap gap-1">
              {selectedDocNames.map((name, i) => (
                <span key={i} className="text-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-2 py-0.5 rounded font-mono text-indigo-300">
                  📄 {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Multi-Email Assignment Form */}
        <form onSubmit={handleGrantAccess} className="space-y-3">
          
          <div className="space-y-1.5 relative" ref={dropdownRef}>
            <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center justify-between">
              <span>Enter Email Addresses or Pick Linguist(s)</span>
              {availableLinguists.length > 0 && (
                <span className="text-[10px] text-indigo-400 font-normal">
                  {availableLinguists.length} Linguists Available
                </span>
              )}
            </label>

            {/* Quick Linguist Pills Selection */}
            {availableLinguists.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                <span className="text-[10px] font-bold text-[var(--text-muted)] shrink-0">Quick Add:</span>
                {availableLinguists.slice(0, 6).map((ling) => {
                  const isAdded = selectedEmails.includes(ling.email.toLowerCase());
                  return (
                    <button
                      type="button"
                      key={ling.id}
                      onClick={() => {
                        if (isAdded) removeEmailTag(ling.email.toLowerCase());
                        else addEmailTag(ling.email.toLowerCase());
                      }}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                        isAdded
                          ? "bg-indigo-600 text-white border-indigo-500"
                          : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white"
                      }`}
                    >
                      <UserCheck size={10} />
                      <span>{ling.full_name || ling.email.split("@")[0]}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Chips Multi-Email Tag Container */}
            <div className="min-h-[42px] bg-[var(--bg-input)] border border-[var(--border-medium)] focus-within:border-indigo-500 rounded-lg p-2 flex flex-wrap items-center gap-1.5 transition-all">
              {selectedEmails.map((email) => (
                <span key={email} className="inline-flex items-center gap-1 bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded text-xs font-semibold">
                  <span>{email}</span>
                  <button
                    type="button"
                    onClick={() => removeEmailTag(email)}
                    className="hover:text-rose-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}

              <input
                type="email"
                placeholder={selectedEmails.length === 0 ? "Type email and press Enter or comma..." : "Add another email..."}
                value={emailInput}
                onChange={(e) => handleEmailInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent text-xs font-semibold text-[var(--text-primary)] outline-none min-w-[160px] placeholder-[var(--text-muted)]"
              />
            </div>

            {/* Auto-complete Dropdown */}
            {showSuggestions && emailSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-lg shadow-2xl z-50 max-h-48 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                {emailSuggestions.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => addEmailTag(u.email)}
                    className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span className="text-[var(--text-primary)] font-bold">{u.email}</span>
                    <span className="text-[10px] text-indigo-400 uppercase font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">{u.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
              className="bg-[var(--bg-input)] border border-[var(--border-medium)] rounded-lg px-3 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none cursor-pointer"
            >
              <option value="write">Translator / Editor (Can Translate & Edit)</option>
              <option value="read">Reviewer / Viewer (Read-only Access)</option>
              <option value="admin">Project Manager (Full Access)</option>
            </select>

            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-black py-2 rounded-lg transition-all shadow-md cursor-pointer active:scale-[0.98]"
            >
              {submitting ? "Granting Access..." : "Grant Access & Assign"}
            </button>
          </div>
        </form>

        {/* Feedback Messages */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5 text-xs text-rose-400 font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5 text-xs text-emerald-400 font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* DIRECT LINKS BREAKDOWN SECTION (ALL TARGET LANGUAGE LINKS) */}
        {allDirectLinks.length > 0 && (
          <div className="bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <Link className="w-3 h-3 text-indigo-400" />
                <span>Direct Access Links Breakdown ({allDirectLinks.length}):</span>
              </span>
              
              <button
                type="button"
                onClick={copyAllLinksToClipboard}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 px-2 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1"
              >
                {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                <span>{copied ? "All 4 Links Copied!" : "Copy All Direct Links"}</span>
              </button>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {allDirectLinks.map((item) => {
                const isItemCopied = copiedSingleCode === item.code;
                return (
                  <div key={item.code} className="flex items-center justify-between gap-2 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded px-2.5 py-1 text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm">{item.flag}</span>
                      <span className="font-extrabold text-[var(--text-primary)] shrink-0">{item.label}:</span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)] truncate select-all">{item.url}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => copySingleLinkToClipboard(item.url, item.code)}
                      className="p-1 text-[var(--text-muted)] hover:text-indigo-400 transition-colors shrink-0 cursor-pointer"
                      title={`Copy ${item.label} URL`}
                    >
                      {isItemCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Existing Access List Section */}
        <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
          <h4 className="text-xs font-bold text-[var(--text-secondary)]">People with Access</h4>

          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-[var(--text-muted)] italic animate-pulse">Loading access records...</p>
            ) : (
              <>
                {owner && (
                  <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-xs font-bold">
                        {getAvatarInitials(owner.email)}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[var(--text-primary)]">{owner.email}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">Project Creator</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      Owner
                    </span>
                  </div>
                )}

                {accessList.map((item) => (
                  <div key={item.shareId || item.accessId} className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${getAvatarColor(item.email)}`}>
                        {getAvatarInitials(item.email)}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[var(--text-primary)]">{item.email}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {item.role ? `Role: ${item.role}` : "Collaborator"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded uppercase border border-indigo-500/20">
                        {item.permission || "write"}
                      </span>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(item.userId || item.shareId)}
                          className="text-xs font-bold text-rose-400 hover:text-red-300 cursor-pointer transition-colors"
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

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 mt-1">
          <button
            type="button"
            onClick={copyAllLinksToClipboard}
            className={`flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold border transition-all cursor-pointer ${
              copied 
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                : "bg-transparent border-[var(--border-medium)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>All Links Copied!</span>
              </>
            ) : (
              <>
                <Link className="w-3.5 h-3.5" />
                <span>Copy Direct Links (All {allDirectLinks.length})</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black px-5 py-1.5 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
