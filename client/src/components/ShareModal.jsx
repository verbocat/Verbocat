import React, { useState, useEffect, useRef } from "react";
import { 
  X, Copy, Check, Lock, Globe, Share2, Link2, Users, ChevronDown, 
  ChevronUp, FileText, AlertCircle, ExternalLink, Mail, UserPlus, 
  Trash2, ArrowUpRight, Search, CheckCheck, Languages, Edit3, Eye
} from "lucide-react";
import { 
  fetchDocumentAccess, grantDocumentAccess, revokeDocumentAccess, 
  fetchProjectShares, shareProject, revokeProjectShare,
  searchUsers, fetchLinguists, bulkShareDocuments, fetchPublicAccess, updatePublicAccess,
  fetchProjectPublicAccess, updateProjectPublicAccess
} from "../services/api.js";
import { LANGUAGES } from "../constants/languages";
import { LanguageFlag } from "./LanguageFlag.jsx";

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
  const [selectedTargetLang, setSelectedTargetLang] = useState(targetLang || (targetLanguages && targetLanguages.length > 0 ? targetLanguages[0] : ""));
  const [permission, setPermission] = useState("write"); // 'write' | 'read'
  const [accessList, setAccessList] = useState([]);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  
  const [publicAccess, setPublicAccess] = useState("none");
  const [emailSuggestions, setEmailSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const activeMode = mode || (projectId && !documentId ? "project" : "file");
  const isProjectMode = activeMode === "project";

  // Keep selectedTargetLang in sync
  useEffect(() => {
    if (targetLang) {
      setSelectedTargetLang(targetLang);
    } else if (targetLanguages && targetLanguages.length > 0) {
      setSelectedTargetLang(prev => prev || targetLanguages[0]);
    }
  }, [targetLang, targetLanguages]);

  // Space-aware URL suffix
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

  // Generate All Direct Links
  const generateAllDirectLinks = () => {
    const spaceSuffix = getSpaceSuffix();
    const origin = window.location.origin;
    const links = [];

    if (selectedJobItems && selectedJobItems.length > 0) {
      selectedJobItems.forEach((jobItem, idx) => {
        const lName = jobItem.langName || getLanguageName(jobItem.targetLang);
        const dName = jobItem.docName || `Document ${idx + 1}`;
        const url = `${origin}/project/${projectId}/file/${jobItem.fileId}/lang/${jobItem.targetLang}${spaceSuffix}`;
        links.push({
          label: `${dName} (${lName})`,
          code: `${jobItem.fileId}_${jobItem.targetLang}`,
          langCode: jobItem.targetLang,
          langName: lName,
          url
        });
      });
      return links;
    }

    if (selectedDocumentIds && selectedDocumentIds.length > 1 && targetLang) {
      const lName = languageName || getLanguageName(targetLang);
      selectedDocumentIds.forEach((docId, idx) => {
        const dName = selectedDocNames[idx] || `Document ${idx + 1}`;
        const url = `${origin}/project/${projectId}/file/${docId}/lang/${targetLang}${spaceSuffix}`;
        links.push({
          label: `${dName} (${lName})`,
          code: `${docId}_${targetLang}`,
          langCode: targetLang,
          langName: lName,
          url
        });
      });
      return links;
    }

    if (projectId && documentId && targetLang) {
      const lName = languageName || getLanguageName(targetLang);
      links.push({
        label: `${docName || 'Document'} (${lName})`,
        code: `${documentId}_${targetLang}`,
        langCode: targetLang,
        langName: lName,
        url: `${origin}/project/${projectId}/file/${documentId}/lang/${targetLang}${spaceSuffix}`
      });
      return links;
    }

    if (projectId && documentId && targetLanguages && targetLanguages.length > 0) {
      targetLanguages.forEach((tCode) => {
        const lName = getLanguageName(tCode);
        links.push({
          label: `${docName || 'Document'} (${lName})`,
          code: `${documentId}_${tCode}`,
          langCode: tCode,
          langName: lName,
          url: `${origin}/project/${projectId}/file/${documentId}/lang/${tCode}${spaceSuffix}`
        });
      });
      return links;
    }

    if (projectId && targetLanguages && targetLanguages.length > 0) {
      targetLanguages.forEach((tCode) => {
        const lName = getLanguageName(tCode);
        links.push({
          label: `${lName} Translation Workspace`,
          code: `proj_${tCode}`,
          langCode: tCode,
          langName: lName,
          url: `${origin}/project/${projectId}${spaceSuffix}`
        });
      });
      return links;
    }

    if (projectId) {
      links.push({
        label: "Project Workspace",
        code: "project",
        langCode: null,
        langName: "Workspace",
        url: `${origin}/project/${projectId}${spaceSuffix}`
      });
    }

    return links;
  };

  const allDirectLinks = generateAllDirectLinks();
  
  // Primary Share Link
  const primaryLink = (() => {
    const spaceSuffix = getSpaceSuffix();
    const origin = window.location.origin;
    if (projectId && documentId && (targetLang || selectedTargetLang)) {
      return `${origin}/project/${projectId}/file/${documentId}/lang/${targetLang || selectedTargetLang}${spaceSuffix}`;
    }
    if (projectId && documentId) {
      return `${origin}/project/${projectId}${spaceSuffix}`;
    }
    if (projectId) {
      return `${origin}/project/${projectId}${spaceSuffix}`;
    }
    if (documentId) {
      return `${origin}/editor/${documentId}${spaceSuffix}`;
    }
    return window.location.href;
  })();

  const copyLinkToClipboard = (url, code = "primary") => {
    navigator.clipboard.writeText(url);
    if (code === "primary") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const copyAllLinks = () => {
    if (allDirectLinks.length === 0) return;
    const formatted = allDirectLinks
      .map(l => `${l.label}: ${l.url}`)
      .join("\n");
    navigator.clipboard.writeText(formatted);
    setCopiedCode("all");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Load access list on open
  useEffect(() => {
    if (isOpen) {
      setEmailInput("");
      setSelectedEmails([]);
      setError("");
      setSuccessMsg("");
      setMemberSearch("");
      loadAccessList();
    }
  }, [isOpen, documentId, projectId, activeMode, targetLang]);

  // Click outside listener for suggestions
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        const data = await fetchDocumentAccess(documentId, targetLang || selectedTargetLang);
        setAccessList(data.access || []);
        setOwner(data.owner || null);
        const pubData = await fetchPublicAccess(documentId);
        setPublicAccess(pubData.publicAccess || "none");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load access permissions.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailInputChange = async (val) => {
    setEmailInput(val);
    const query = val.trim();
    if (query.length > 0) {
      try {
        const res = await searchUsers(query);
        const list = Array.isArray(res) ? res : (res?.users || []);
        setEmailSuggestions(list);
        setShowSuggestions(list.length > 0);
      } catch (err) {
        console.error("User search error:", err);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const addEmailTag = (emailToUse) => {
    const emailToAdd = (emailToUse || emailInput).trim().toLowerCase();
    if (!emailToAdd) return;
    if (!emailToAdd.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!selectedEmails.includes(emailToAdd)) {
      setSelectedEmails(prev => [...prev, emailToAdd]);
    }
    setEmailInput("");
    setShowSuggestions(false);
    setError("");
    if (inputRef.current) inputRef.current.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      addEmailTag();
    } else if (e.key === "Backspace" && !emailInput && selectedEmails.length > 0) {
      setSelectedEmails(prev => prev.slice(0, -1));
    }
  };

  const removeEmailTag = (emailToRemove) => {
    setSelectedEmails(prev => prev.filter(e => e !== emailToRemove));
  };

  const handleGrantAccess = async (e) => {
    if (e) e.preventDefault();
    const emailsToProcess = [...selectedEmails];
    if (emailInput.trim()) {
      const rawInput = emailInput.trim();
      const splitInputs = rawInput.split(/[\s,]+/);
      for (const item of splitInputs) {
        const clean = item.trim().toLowerCase();
        if (clean && clean.includes("@") && !emailsToProcess.includes(clean)) {
          emailsToProcess.push(clean);
        }
      }
    }

    if (emailsToProcess.length === 0) {
      setError("Please add at least one email address to invite.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccessMsg("");

    const effectiveTargetLang = targetLang || selectedTargetLang || null;

    try {
      if (isProjectMode && projectId) {
        await shareProject(projectId, emailsToProcess, permission);
        setSuccessMsg(`Access granted to ${emailsToProcess.length} user(s).`);
      } else if (activeMode === "bulk_files" || activeMode === "language" || selectedDocumentIds.length > 1) {
        await bulkShareDocuments(selectedDocumentIds, emailsToProcess, permission, effectiveTargetLang);
        setSuccessMsg(`Access granted to ${emailsToProcess.length} user(s).`);
      } else if (documentId) {
        await grantDocumentAccess(documentId, emailsToProcess, permission, effectiveTargetLang);
        setSuccessMsg(`Access granted to ${emailsToProcess.length} user(s).`);
      }

      setSelectedEmails([]);
      setEmailInput("");
      loadAccessList();
      setTimeout(() => setSuccessMsg(""), 3500);
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
        await revokeDocumentAccess(documentId, identifier, targetLang || selectedTargetLang);
      }
      setSuccessMsg("Access removed.");
      loadAccessList();
      setTimeout(() => setSuccessMsg(""), 2500);
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
      setSuccessMsg(newAccess === "none" ? "Restricted to invited collaborators." : "Public link access updated.");
      setTimeout(() => setSuccessMsg(""), 2500);
    } catch (err) {
      console.error(err);
      setError("Failed to update link settings.");
    }
  };

  const getInitials = (emailStr) => {
    if (!emailStr) return "?";
    return emailStr.substring(0, 2).toUpperCase();
  };

  if (!isOpen) return null;

  // Filtered members list
  const filteredAccessList = accessList.filter(item => {
    const userEmail = item.email || item.profiles?.email || "";
    if (memberSearch && !userEmail.toLowerCase().includes(memberSearch.toLowerCase())) {
      return false;
    }
    return true;
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
          maxWidth: "640px",
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
            alignItems: "flex-start",
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
                background: "var(--accent-faint)",
                border: "1px solid var(--border-medium)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <Share2 size={18} />
            </div>

            <div style={{ minWidth: 0 }}>
              <h3 
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  margin: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                Share "{docName || "Project Workspace"}"
              </h3>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "2px 0 0" }}>
                {isProjectMode && "Manage access permissions and direct workspace links"}
                {activeMode === "language" && `Assign access for ${languageName || targetLang?.toUpperCase()}`}
                {activeMode === "bulk_files" && `Assign ${selectedDocumentIds.length} selected documents`}
                {activeMode === "file" && "Manage access and direct editor links for this document"}
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

        {/* Modal Body */}
        <div 
          style={{
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            maxHeight: "75vh",
            overflowY: "auto"
          }}
        >
          {/* Notifications */}
          {error && (
            <div 
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                background: "rgba(244, 63, 94, 0.1)",
                border: "1px solid rgba(244, 63, 94, 0.25)",
                color: "var(--rose)",
                fontSize: "12.5px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
              <X size={14} style={{ cursor: "pointer" }} onClick={() => setError("")} />
            </div>
          )}

          {successMsg && (
            <div 
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                background: "rgba(34, 197, 94, 0.1)",
                border: "1px solid rgba(34, 197, 94, 0.25)",
                color: "var(--emerald)",
                fontSize: "12.5px",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <Check size={15} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Section 1: Invite Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", position: "relative" }} ref={dropdownRef}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Add Collaborators</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 400 }}>
                Press enter to add multiple emails
              </span>
            </label>

            {/* Email Chips Input Container */}
            <div 
              style={{
                minHeight: "44px",
                background: "var(--bg-input)",
                border: "1px solid var(--border-medium)",
                borderRadius: "10px",
                padding: "6px 10px",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "6px",
                cursor: "text",
                transition: "border-color 0.15s"
              }}
              onClick={() => inputRef.current?.focus()}
            >
              {selectedEmails.map((email) => (
                <span 
                  key={email}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-medium)",
                    borderRadius: "6px",
                    padding: "3px 8px",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <span>{email}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeEmailTag(email); }}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center"
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}

              <input
                ref={inputRef}
                type="text"
                placeholder={selectedEmails.length === 0 ? "Enter email address or name..." : "Add another..."}
                value={emailInput}
                onChange={(e) => handleEmailInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{
                  flex: 1,
                  minWidth: "160px",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text-primary)",
                  fontSize: "13px"
                }}
              />
            </div>

            {/* Controls Bar: Target Language + Permission (Write / Read) + Submit Button */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
              
              {/* Target Language Selector (if multi-language project) */}
              {!isProjectMode && targetLanguages && targetLanguages.length > 1 && !targetLang ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px" }}>
                  <select
                    value={selectedTargetLang}
                    onChange={(e) => setSelectedTargetLang(e.target.value)}
                    style={{
                      width: "100%",
                      height: "36px",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-medium)",
                      borderRadius: "8px",
                      padding: "0 10px",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      outline: "none",
                      cursor: "pointer"
                    }}
                  >
                    <option value="">All Target Languages</option>
                    {targetLanguages.map((tCode) => (
                      <option key={tCode} value={tCode}>
                        {getLanguageName(tCode)} ({tCode.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Permission Dropdown: Write (Can Edit) / Read (View Only) */}
              <div style={{ flex: (!isProjectMode && targetLanguages && targetLanguages.length > 1 && !targetLang) ? 1 : 2 }}>
                <select
                  value={permission}
                  onChange={(e) => setPermission(e.target.value)}
                  style={{
                    width: "100%",
                    height: "36px",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-medium)",
                    borderRadius: "8px",
                    padding: "0 10px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    outline: "none",
                    cursor: "pointer"
                  }}
                >
                  <option value="write">Write</option>
                  <option value="read">Read</option>
                </select>
              </div>

              {/* Invite Button */}
              <button
                type="button"
                onClick={handleGrantAccess}
                disabled={submitting || (selectedEmails.length === 0 && !emailInput.trim())}
                style={{
                  height: "36px",
                  background: "var(--accent)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "0 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: (submitting || (selectedEmails.length === 0 && !emailInput.trim())) ? "not-allowed" : "pointer",
                  opacity: (submitting || (selectedEmails.length === 0 && !emailInput.trim())) ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  whiteSpace: "nowrap",
                  transition: "opacity 0.15s"
                }}
              >
                {submitting ? (
                  <span>Inviting...</span>
                ) : (
                  <>
                    <UserPlus size={14} />
                    <span>{selectedEmails.length > 1 ? `Invite (${selectedEmails.length})` : "Invite"}</span>
                  </>
                )}
              </button>
            </div>

            {/* Autocomplete Dropdown */}
            {showSuggestions && emailSuggestions.length > 0 && (
              <div 
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "100%",
                  marginTop: "6px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-medium)",
                  borderRadius: "10px",
                  boxShadow: "0 12px 35px rgba(0, 0, 0, 0.45)",
                  zIndex: 100,
                  maxHeight: "200px",
                  overflowY: "auto"
                }}
              >
                {emailSuggestions.map((u) => {
                  const emailStr = u.email || "";
                  const displayName = u.full_name || u.name || (emailStr ? emailStr.split("@")[0] : "User");
                  return (
                    <button
                      key={u.id || emailStr}
                      type="button"
                      onClick={() => addEmailTag(emailStr)}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        borderBottom: "1px solid var(--border-subtle)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        transition: "background 0.1s"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div 
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            background: "var(--bg-panel)",
                            border: "1px solid var(--border-subtle)",
                            color: "var(--text-primary)",
                            fontSize: "11px",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                        >
                          {getInitials(emailStr)}
                        </div>
                        <div>
                          <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>{displayName}</div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{emailStr}</div>
                        </div>
                      </div>
                      {u.role && (
                        <span 
                          style={{
                            fontSize: "10px",
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: "4px",
                            background: "var(--bg-panel)",
                            color: "var(--text-secondary)",
                            textTransform: "uppercase"
                          }}
                        >
                          {u.role}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Direct Shareable Links */}
          <div 
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              paddingTop: "14px",
              borderTop: "1px solid var(--border-subtle)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Link2 size={14} style={{ color: "var(--accent)" }} />
                <span>Direct Access Links</span>
              </span>
              {allDirectLinks.length > 1 && (
                <button
                  type="button"
                  onClick={copyAllLinks}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: copiedCode === "all" ? "var(--emerald)" : "var(--accent)",
                    fontSize: "11.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  {copiedCode === "all" ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedCode === "all" ? "All Links Copied!" : "Copy All Direct Links"}</span>
                </button>
              )}
            </div>

            {/* Primary Workspace Link Box */}
            <div 
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "var(--bg-panel)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                padding: "8px 12px"
              }}
            >
              <div 
                style={{
                  flex: 1,
                  fontSize: "12px",
                  fontFamily: "var(--font-mono, monospace)",
                  color: "var(--text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  userSelect: "all"
                }}
              >
                {primaryLink}
              </div>

              <button
                type="button"
                onClick={() => copyLinkToClipboard(primaryLink, "primary")}
                style={{
                  background: copied ? "rgba(34, 197, 94, 0.15)" : "var(--bg-surface)",
                  border: "1px solid " + (copied ? "rgba(34, 197, 94, 0.3)" : "var(--border-medium)"),
                  color: copied ? "var(--emerald)" : "var(--text-primary)",
                  borderRadius: "8px",
                  padding: "5px 12px",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flexShrink: 0,
                  transition: "all 0.15s"
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>

              <a
                href={primaryLink}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-medium)",
                  color: "var(--text-muted)",
                  borderRadius: "8px",
                  width: "28px",
                  height: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "color 0.15s"
                }}
                title="Open in new tab"
              >
                <ArrowUpRight size={13} />
              </a>
            </div>

            {/* Multiple Target Language Links Breakdown (if multi-language) */}
            {allDirectLinks.length > 1 && (
              <div 
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  maxHeight: "140px",
                  overflowY: "auto",
                  paddingRight: "2px"
                }}
              >
                {allDirectLinks.map((item) => {
                  const isItemCopied = copiedCode === item.code;
                  return (
                    <div 
                      key={item.code}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 10px",
                        borderRadius: "8px",
                        background: "var(--bg-panel)",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "12px"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                        {item.langCode ? <LanguageFlag code={item.langCode} /> : <span>📁</span>}
                        <span style={{ fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.label}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => copyLinkToClipboard(item.url, item.code)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: isItemCopied ? "var(--emerald)" : "var(--text-muted)",
                            cursor: "pointer",
                            padding: "3px 6px",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "11px",
                            fontWeight: 600
                          }}
                        >
                          {isItemCopied ? (
                            <>
                              <Check size={12} /> Copied
                            </>
                          ) : (
                            <>
                              <Copy size={12} /> Copy
                            </>
                          )}
                        </button>

                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "var(--text-muted)",
                            display: "flex",
                            alignItems: "center"
                          }}
                          title="Open editor"
                        >
                          <ArrowUpRight size={12} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3: People with Access List */}
          <div 
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              paddingTop: "14px",
              borderTop: "1px solid var(--border-subtle)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                People with access ({accessList.length + (owner ? 1 : 0)})
              </span>

              {accessList.length > 2 && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <input
                    type="text"
                    placeholder="Filter members..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "6px",
                      padding: "2px 8px",
                      fontSize: "11px",
                      color: "var(--text-primary)",
                      outline: "none",
                      width: "120px"
                    }}
                  />
                </div>
              )}
            </div>

            {/* Member Cards List */}
            <div 
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                maxHeight: "180px",
                overflowY: "auto",
                paddingRight: "2px"
              }}
            >
              {loading ? (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "14px 0", textAlign: "center" }}>
                  Loading member permissions...
                </div>
              ) : (
                <>
                  {/* Owner Card */}
                  {owner && (
                    <div 
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        borderRadius: "10px",
                        background: "var(--bg-panel)",
                        border: "1px solid var(--border-subtle)"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                        <div 
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "50%",
                            background: "rgba(245, 158, 11, 0.15)",
                            border: "1px solid rgba(245, 158, 11, 0.3)",
                            color: "var(--amber)",
                            fontSize: "11.5px",
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0
                          }}
                        >
                          {getInitials(owner.email)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {owner.email}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Project Owner</div>
                        </div>
                      </div>
                      <span 
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "var(--amber)",
                          background: "rgba(245, 158, 11, 0.1)",
                          padding: "2px 8px",
                          borderRadius: "20px",
                          border: "1px solid rgba(245, 158, 11, 0.25)"
                        }}
                      >
                        Owner
                      </span>
                    </div>
                  )}

                  {/* Collaborator Cards */}
                  {filteredAccessList.map((item) => {
                    const userEmail = item.email || item.profiles?.email || "";
                    const assignedLanguage = item.targetLang || item.target_lang;
                    const langName = assignedLanguage ? getLanguageName(assignedLanguage) : null;
                    const isWrite = (item.permission || item.accessLevel || "write") === "write";
                    const roleLabel = isWrite ? "Write" : "Read";

                    return (
                      <div 
                        key={item.shareId || item.accessId || item.id || userEmail}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 10px",
                          borderRadius: "10px",
                          background: "var(--bg-panel)",
                          border: "1px solid var(--border-subtle)",
                          transition: "background 0.1s"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                          <div 
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "50%",
                              background: "var(--bg-surface)",
                              border: "1px solid var(--border-medium)",
                              color: "var(--accent)",
                              fontSize: "11.5px",
                              fontWeight: 600,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0
                            }}
                          >
                            {getInitials(userEmail)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {userEmail}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px", marginTop: "1px" }}>
                              {assignedLanguage && (
                                <>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: "var(--text-secondary)", fontWeight: 500 }}>
                                    <LanguageFlag code={assignedLanguage} /> {langName || assignedLanguage.toUpperCase()}
                                  </span>
                                  <span>•</span>
                                </>
                              )}
                              {item.isGlobalAccess && (
                                <>
                                  <span style={{ color: "var(--text-secondary)" }}>All Languages</span>
                                  <span>•</span>
                                </>
                              )}
                              <span 
                                style={{ 
                                  fontWeight: 600,
                                  color: isWrite ? "var(--accent)" : "var(--text-secondary)",
                                  background: isWrite ? "var(--accent-faint)" : "var(--bg-surface)",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  border: "1px solid var(--border-subtle)",
                                  fontSize: "10px"
                                }}
                              >
                                {roleLabel}
                              </span>
                            </div>
                          </div>
                        </div>

                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => handleRevoke(item.userId || item.shareId)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              padding: "6px",
                              borderRadius: "6px",
                              display: "flex",
                              alignItems: "center",
                              transition: "color 0.15s, background 0.15s"
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--rose)"; e.currentTarget.style.background = "rgba(244, 63, 94, 0.1)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                            title="Remove collaborator"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {filteredAccessList.length === 0 && !owner && (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "12px 0", textAlign: "center" }}>
                      No collaborators added yet. Add collaborators above to grant access.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Section 4: General Access Privacy Settings */}
          <div 
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              paddingTop: "14px",
              borderTop: "1px solid var(--border-subtle)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div 
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: publicAccess === "none" ? "var(--bg-panel)" : "rgba(34, 197, 94, 0.15)",
                  border: "1px solid " + (publicAccess === "none" ? "var(--border-subtle)" : "rgba(34, 197, 94, 0.3)"),
                  color: publicAccess === "none" ? "var(--text-muted)" : "var(--emerald)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                {publicAccess === "none" ? <Lock size={14} /> : <Globe size={14} />}
              </div>

              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                  General access
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                  {publicAccess === "none" 
                    ? "Only people with access can open" 
                    : publicAccess === "view"
                      ? "Anyone with the link (Read)"
                      : "Anyone with the link (Write)"}
                </div>
              </div>
            </div>

            {isOwner ? (
              <select
                value={publicAccess}
                onChange={(e) => handlePublicAccessChange(e.target.value)}
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-medium)",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  outline: "none",
                  cursor: "pointer"
                }}
              >
                <option value="none">🔒 Restricted</option>
                <option value="view">🌐 Anyone with link (Read)</option>
                <option value="edit">🌐 Anyone with link (Write)</option>
              </select>
            ) : (
              <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 500 }}>
                {publicAccess === "none" ? "Restricted" : "Public"}
              </span>
            )}
          </div>

        </div>

        {/* Footer */}
        <div 
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--bg-panel)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <button
            type="button"
            onClick={() => copyLinkToClipboard(primaryLink, "primary")}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-medium)",
              color: copied ? "var(--emerald)" : "var(--text-primary)",
              borderRadius: "8px",
              padding: "7px 14px",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.15s"
            }}
          >
            {copied ? <Check size={14} /> : <Link2 size={14} />}
            <span>{copied ? "Link copied!" : "Copy link"}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "var(--accent)",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "7px 22px",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "opacity 0.15s"
            }}
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
