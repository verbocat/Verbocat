import { useState } from "react";
import { X, Sliders, Check, Sparkles, Loader, Upload, FileText, Trash2, ShieldCheck } from "lucide-react";
import { ProtectedContentPanel } from "./ProtectedContentPanel";

const DOMAINS = ["General", "Marketing", "Legal", "Medical", "Pharmaceutical", "Financial", "Banking", "Insurance", "Technical", "Software", "IT & Cybersecurity", "E-commerce", "Automotive", "Manufacturing", "Engineering", "Telecommunications", "Gaming", "Education", "Government", "HR & Recruitment", "Travel & Tourism", "Hospitality", "Retail", "Energy & Utilities", "Real Estate", "Life Sciences", "Healthcare", "Aerospace", "Agriculture", "Media & Entertainment"];

const CONTENT_TYPES = ["General", "Landing Page", "Product Page", "Advertisement", "Email Campaign", "Sales Brochure", "Social Media Post", "UI Strings", "Help Center", "User Guide", "Documentation", "Release Notes", "Knowledge Base", "Contract", "NDA", "Terms of Service", "Privacy Policy", "Compliance Document", "Clinical Trial", "IFU", "Patient Information", "Medical Report", "Website", "Blog", "Article", "Presentation", "Training Material", "Internal Communication"];

const AUDIENCES = ["General", "Consumers", "Small Business Owners", "Enterprise Buyers", "Patients", "Caregivers", "End Users", "Developers", "Administrators"];

const PURPOSES = ["General", "Generate Leads", "Drive Purchases", "Build Trust", "Increase Signups", "Inform", "Educate", "Train", "Comply", "Protect Rights", "Resolve Issues", "Reduce Support Tickets", "SEO"];

const TONES = ["General", "Persuasive", "Professional", "Friendly", "Formal", "Precise", "Reassuring", "Clear", "Concise", "Casual", "Engaging"];

const FORMALITIES = ["Very Formal", "Formal", "Neutral", "Informal", "Very Informal"];

const STRICTNESS = ["Flexible", "Balanced", "Strict"];

const DEPENDENCIES = {
  "Legal": {
    contentTypes: ["General", "Contract", "NDA", "Terms of Service", "Privacy Policy", "Compliance Document"],
    audiences: ["General", "Enterprise Buyers", "Small Business Owners"],
    purposes: ["General", "Comply", "Protect Rights"],
    tones: ["General", "Formal", "Precise", "Professional"],
    formalities: ["Very Formal", "Formal", "Neutral"],
    strictness: ["Strict", "Balanced"]
  },
  "Medical": {
    contentTypes: ["General", "Clinical Trial", "IFU", "Patient Information", "Medical Report", "Documentation", "User Guide"],
    audiences: ["General", "Patients", "Caregivers", "Consumers"],
    purposes: ["General", "Inform", "Educate", "Comply"],
    tones: ["General", "Professional", "Precise", "Reassuring", "Clear"],
    formalities: ["Very Formal", "Formal", "Neutral"],
    strictness: ["Strict", "Balanced"]
  },
  "Pharmaceutical": {
    contentTypes: ["General", "Clinical Trial", "IFU", "Patient Information", "Medical Report", "Documentation", "User Guide"],
    audiences: ["General", "Patients", "Caregivers", "Consumers"],
    purposes: ["General", "Inform", "Educate", "Comply"],
    tones: ["General", "Professional", "Precise", "Reassuring", "Clear"],
    formalities: ["Very Formal", "Formal", "Neutral"],
    strictness: ["Strict", "Balanced"]
  },
  "Life Sciences": {
    contentTypes: ["General", "Clinical Trial", "IFU", "Patient Information", "Medical Report", "Documentation", "User Guide"],
    audiences: ["General", "Patients", "Caregivers", "Consumers"],
    purposes: ["General", "Inform", "Educate", "Comply"],
    tones: ["General", "Professional", "Precise", "Reassuring", "Clear"],
    formalities: ["Very Formal", "Formal", "Neutral"],
    strictness: ["Strict", "Balanced"]
  },
  "Healthcare": {
    contentTypes: ["General", "Clinical Trial", "IFU", "Patient Information", "Medical Report", "Documentation", "User Guide"],
    audiences: ["General", "Patients", "Caregivers", "Consumers"],
    purposes: ["General", "Inform", "Educate", "Comply"],
    tones: ["General", "Professional", "Precise", "Reassuring", "Clear"],
    formalities: ["Very Formal", "Formal", "Neutral"],
    strictness: ["Strict", "Balanced"]
  },
  "Financial": {
    contentTypes: ["General", "Compliance Document", "Terms of Service", "Product Page", "Email Campaign", "Sales Brochure"],
    audiences: ["General", "Consumers", "Small Business Owners", "Enterprise Buyers"],
    purposes: ["General", "Comply", "Build Trust", "Inform"],
    tones: ["General", "Professional", "Precise", "Formal", "Reassuring"],
    formalities: ["Formal", "Neutral"],
    strictness: ["Strict", "Balanced", "Flexible"]
  },
  "Banking": {
    contentTypes: ["General", "Compliance Document", "Terms of Service", "Product Page", "Email Campaign", "Sales Brochure"],
    audiences: ["General", "Consumers", "Small Business Owners", "Enterprise Buyers"],
    purposes: ["General", "Comply", "Build Trust", "Inform"],
    tones: ["General", "Professional", "Precise", "Formal", "Reassuring"],
    formalities: ["Formal", "Neutral"],
    strictness: ["Strict", "Balanced", "Flexible"]
  },
  "Insurance": {
    contentTypes: ["General", "Compliance Document", "Terms of Service", "Product Page", "Email Campaign", "Sales Brochure"],
    audiences: ["General", "Consumers", "Small Business Owners", "Enterprise Buyers"],
    purposes: ["General", "Comply", "Build Trust", "Inform"],
    tones: ["General", "Professional", "Precise", "Formal", "Reassuring"],
    formalities: ["Formal", "Neutral"],
    strictness: ["Strict", "Balanced", "Flexible"]
  },
  "Marketing": {
    contentTypes: ["General", "Landing Page", "Product Page", "Advertisement", "Email Campaign", "Sales Brochure", "Social Media Post", "Blog", "Article"],
    audiences: ["General", "Consumers", "Small Business Owners"],
    purposes: ["General", "Generate Leads", "Drive Purchases", "Increase Signups", "Build Trust", "SEO"],
    tones: ["General", "Persuasive", "Friendly", "Casual", "Engaging"],
    formalities: ["Neutral", "Informal", "Very Informal"],
    strictness: ["Flexible", "Balanced"]
  },
  "E-commerce": {
    contentTypes: ["General", "Landing Page", "Product Page", "Advertisement", "Email Campaign", "Sales Brochure", "Social Media Post", "Blog", "Article"],
    audiences: ["General", "Consumers", "Small Business Owners"],
    purposes: ["General", "Generate Leads", "Drive Purchases", "Increase Signups", "Build Trust", "SEO"],
    tones: ["General", "Persuasive", "Friendly", "Casual", "Engaging"],
    formalities: ["Neutral", "Informal", "Very Informal"],
    strictness: ["Flexible", "Balanced"]
  },
  "Retail": {
    contentTypes: ["General", "Landing Page", "Product Page", "Advertisement", "Email Campaign", "Sales Brochure", "Social Media Post", "Blog", "Article"],
    audiences: ["General", "Consumers", "Small Business Owners"],
    purposes: ["General", "Generate Leads", "Drive Purchases", "Increase Signups", "Build Trust", "SEO"],
    tones: ["General", "Persuasive", "Friendly", "Casual", "Engaging"],
    formalities: ["Neutral", "Informal", "Very Informal"],
    strictness: ["Flexible", "Balanced"]
  },
  "Travel & Tourism": {
    contentTypes: ["General", "Landing Page", "Product Page", "Advertisement", "Email Campaign", "Sales Brochure", "Social Media Post", "Blog", "Article"],
    audiences: ["General", "Consumers", "Small Business Owners"],
    purposes: ["General", "Generate Leads", "Drive Purchases", "Increase Signups", "Build Trust", "SEO"],
    tones: ["General", "Persuasive", "Friendly", "Casual", "Engaging"],
    formalities: ["Neutral", "Informal", "Very Informal"],
    strictness: ["Flexible", "Balanced"]
  },
  "Hospitality": {
    contentTypes: ["General", "Landing Page", "Product Page", "Advertisement", "Email Campaign", "Sales Brochure", "Social Media Post", "Blog", "Article"],
    audiences: ["General", "Consumers", "Small Business Owners"],
    purposes: ["General", "Generate Leads", "Drive Purchases", "Increase Signups", "Build Trust", "SEO"],
    tones: ["General", "Persuasive", "Friendly", "Casual", "Engaging"],
    formalities: ["Neutral", "Informal", "Very Informal"],
    strictness: ["Flexible", "Balanced"]
  },
  "Software": {
    contentTypes: ["General", "UI Strings", "Help Center", "User Guide", "Documentation", "Release Notes", "Knowledge Base", "Training Material"],
    audiences: ["General", "End Users", "Developers", "Administrators"],
    purposes: ["General", "Inform", "Educate", "Train", "Resolve Issues", "Reduce Support Tickets"],
    tones: ["General", "Professional", "Clear", "Concise", "Precise"],
    formalities: ["Formal", "Neutral", "Informal"],
    strictness: ["Flexible", "Balanced", "Strict"]
  },
  "Technical": {
    contentTypes: ["General", "UI Strings", "Help Center", "User Guide", "Documentation", "Release Notes", "Knowledge Base", "Training Material"],
    audiences: ["General", "End Users", "Developers", "Administrators"],
    purposes: ["General", "Inform", "Educate", "Train", "Resolve Issues", "Reduce Support Tickets"],
    tones: ["General", "Professional", "Clear", "Concise", "Precise"],
    formalities: ["Formal", "Neutral", "Informal"],
    strictness: ["Flexible", "Balanced", "Strict"]
  },
  "IT & Cybersecurity": {
    contentTypes: ["General", "UI Strings", "Help Center", "User Guide", "Documentation", "Release Notes", "Knowledge Base", "Training Material"],
    audiences: ["General", "End Users", "Developers", "Administrators"],
    purposes: ["General", "Inform", "Educate", "Train", "Resolve Issues", "Reduce Support Tickets"],
    tones: ["General", "Professional", "Clear", "Concise", "Precise"],
    formalities: ["Formal", "Neutral", "Informal"],
    strictness: ["Flexible", "Balanced", "Strict"]
  },
  "Engineering": {
    contentTypes: ["General", "UI Strings", "Help Center", "User Guide", "Documentation", "Release Notes", "Knowledge Base", "Training Material"],
    audiences: ["General", "End Users", "Developers", "Administrators"],
    purposes: ["General", "Inform", "Educate", "Train", "Resolve Issues", "Reduce Support Tickets"],
    tones: ["General", "Professional", "Clear", "Concise", "Precise"],
    formalities: ["Formal", "Neutral", "Informal"],
    strictness: ["Flexible", "Balanced", "Strict"]
  },
  "Manufacturing": {
    contentTypes: ["General", "UI Strings", "Help Center", "User Guide", "Documentation", "Release Notes", "Knowledge Base", "Training Material"],
    audiences: ["General", "End Users", "Developers", "Administrators"],
    purposes: ["General", "Inform", "Educate", "Train", "Resolve Issues", "Reduce Support Tickets"],
    tones: ["General", "Professional", "Clear", "Concise", "Precise"],
    formalities: ["Formal", "Neutral", "Informal"],
    strictness: ["Flexible", "Balanced", "Strict"]
  },
  "Automotive": {
    contentTypes: ["General", "UI Strings", "Help Center", "User Guide", "Documentation", "Release Notes", "Knowledge Base", "Training Material"],
    audiences: ["General", "End Users", "Developers", "Administrators"],
    purposes: ["General", "Inform", "Educate", "Train", "Resolve Issues", "Reduce Support Tickets"],
    tones: ["General", "Professional", "Clear", "Concise", "Precise"],
    formalities: ["Formal", "Neutral", "Informal"],
    strictness: ["Flexible", "Balanced", "Strict"]
  },
  "Telecommunications": {
    contentTypes: ["General", "UI Strings", "Help Center", "User Guide", "Documentation", "Release Notes", "Knowledge Base", "Training Material"],
    audiences: ["General", "End Users", "Developers", "Administrators"],
    purposes: ["General", "Inform", "Educate", "Train", "Resolve Issues", "Reduce Support Tickets"],
    tones: ["General", "Professional", "Clear", "Concise", "Precise"],
    formalities: ["Formal", "Neutral", "Informal"],
    strictness: ["Flexible", "Balanced", "Strict"]
  },
  "Aerospace": {
    contentTypes: ["General", "UI Strings", "Help Center", "User Guide", "Documentation", "Release Notes", "Knowledge Base", "Training Material"],
    audiences: ["General", "End Users", "Developers", "Administrators"],
    purposes: ["General", "Inform", "Educate", "Train", "Resolve Issues", "Reduce Support Tickets"],
    tones: ["General", "Professional", "Clear", "Concise", "Precise"],
    formalities: ["Formal", "Neutral", "Informal"],
    strictness: ["Flexible", "Balanced", "Strict"]
  }
};

const getAvailableOptions = (domain, field) => {
  const dep = DEPENDENCIES[domain];
  if (!dep) {
    if (field === 'contentType') return CONTENT_TYPES;
    if (field === 'audience') return AUDIENCES;
    if (field === 'purpose') return PURPOSES;
    if (field === 'tone') return TONES;
    if (field === 'formality') return FORMALITIES;
    if (field === 'terminologyStrictness') return STRICTNESS;
    return [];
  }
  
  if (field === 'contentType') return dep.contentTypes;
  if (field === 'audience') return dep.audiences;
  if (field === 'purpose') return dep.purposes;
  if (field === 'tone') return dep.tones;
  if (field === 'formality') return dep.formalities;
  if (field === 'terminologyStrictness') return dep.strictness;
  return [];
};

const PROFILES = {
  "Custom": {},
  "Marketing Website": { domain: "Marketing", contentType: "Landing Page", purpose: "Generate Leads", tone: "Persuasive", audience: "Consumers", formality: "Neutral", terminologyStrictness: "Flexible" },
  "Software Localization": { domain: "Software", contentType: "UI Strings", purpose: "Inform", tone: "Clear", audience: "End Users", formality: "Neutral", terminologyStrictness: "Strict" },
  "Legal": { domain: "Legal", contentType: "Contract", purpose: "Comply", tone: "Formal", audience: "Enterprise Buyers", formality: "Formal", terminologyStrictness: "Strict" },
  "Medical": { domain: "Medical", contentType: "Patient Information", purpose: "Educate", tone: "Professional", audience: "Patients", formality: "Formal", terminologyStrictness: "Strict" },
  "E-commerce": { domain: "E-commerce", contentType: "Product Page", purpose: "Drive Purchases", tone: "Persuasive", audience: "Consumers", formality: "Neutral", terminologyStrictness: "Flexible" }
};

const MAX_CONTEXT_FILE_CHARS = 12000;
const CONTEXT_FILE_LABELS = {
  markdown: "Markdown",
  figma: "Figma"
};

const detectContextFileType = (file) => {
  const name = file.name.toLowerCase();
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";
  if (name.endsWith(".fig") || file.type.includes("figma")) return "figma";
  return "unknown";
};

const readContextFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(reader.error || new Error("Failed to read context file."));
  reader.readAsText(file);
});

const truncateContextContent = (content) => {
  if (!content) return "";
  if (content.length <= MAX_CONTEXT_FILE_CHARS) return content;
  return `${content.slice(0, MAX_CONTEXT_FILE_CHARS)}\n\n[Context file truncated to ${MAX_CONTEXT_FILE_CHARS} characters]`;
};

export const ContextSettingsModal = ({ show, onClose, contextSettings, setContextSettings, documentId }) => {
  const [activeProfile, setActiveProfile] = useState("Custom");
  const [isDetecting, setIsDetecting] = useState(false);
  const [fileError, setFileError] = useState("");
  
  const handleChange = (field, value) => {
    setContextSettings(prev => {
      const nextSettings = { ...prev, [field]: value };
      
      // Validate dependencies on domain change
      if (field === 'domain') {
        const checkAndAdjust = (f, list) => {
          if (!list.includes(nextSettings[f])) {
            nextSettings[f] = list[0];
          }
        };
        
        checkAndAdjust('contentType', getAvailableOptions(value, 'contentType'));
        checkAndAdjust('audience', getAvailableOptions(value, 'audience'));
        checkAndAdjust('purpose', getAvailableOptions(value, 'purpose'));
        checkAndAdjust('tone', getAvailableOptions(value, 'tone'));
        checkAndAdjust('formality', getAvailableOptions(value, 'formality'));
        checkAndAdjust('terminologyStrictness', getAvailableOptions(value, 'terminologyStrictness'));
      }
      
      return nextSettings;
    });
    setActiveProfile("Custom");
  };

  const handleProfileSelect = (profileName) => {
    setActiveProfile(profileName);
    if (profileName !== "Custom") {
      setContextSettings(prev => ({ ...prev, ...PROFILES[profileName] }));
    }
  };

  const handleCustomPromptChange = (value) => {
    setContextSettings(prev => ({ ...prev, customPrompt: value }));
    setActiveProfile("Custom");
  };

  const handleContextFileChange = async (event, expectedType) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const detectedType = detectContextFileType(file);
    if (detectedType !== expectedType) {
      setFileError(`Please upload a ${CONTEXT_FILE_LABELS[expectedType]} context file.`);
      return;
    }

    setFileError("");
    try {
      const rawContent = detectedType === "markdown" ? await readContextFile(file) : "";
      const nextFile = {
        id: `${Date.now()}-${file.name}`,
        name: file.name,
        type: detectedType,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        content: truncateContextContent(rawContent)
      };

      setContextSettings(prev => ({
        ...prev,
        contextFiles: [
          ...(prev.contextFiles || []).filter(existing => existing.type !== detectedType),
          nextFile
        ]
      }));
      setActiveProfile("Custom");
    } catch (err) {
      console.error(err);
      setFileError("Could not read this context file.");
    }
  };

  const handleRemoveContextFile = (fileId) => {
    setContextSettings(prev => ({
      ...prev,
      contextFiles: (prev.contextFiles || []).filter(file => file.id !== fileId)
    }));
    setActiveProfile("Custom");
  };

  const handleAutoDetect = async () => {
    if (!documentId) return;
    setIsDetecting(true);
    try {
      const token = localStorage.getItem("centroid_token") || "";
      const response = await fetch(`/api/documents/${documentId}/auto-detect-context`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok && data.success && data.contextSettings) {
        setContextSettings(prev => ({ ...prev, ...data.contextSettings }));
        setActiveProfile("Custom");
      } else {
        alert(data.error || "Failed to auto-detect context settings.");
      }
    } catch (err) {
      console.error(err);
      alert("Error occurred during context analysis.");
    } finally {
      setIsDetecting(false);
    }
  };

  const [activeModalTab, setActiveModalTab] = useState("context"); // "context", "protected"
  if (!show) return null;

  const currentDomain = contextSettings.domain || "General";

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: 840, maxHeight: "92vh", display: "flex", flexDirection: "column", borderRadius: "12px" }}>

        {/* Header */}
        <div className="modal-header" style={{ flexShrink: 0, flexDirection: "column", alignItems: "stretch", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyBetween: "space-between", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "rgba(91,106,240,0.1)",
                border: "1px solid rgba(91,106,240,0.22)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--accent)"
              }}>
                <Sliders style={{ width: 15, height: 15 }} />
              </div>
              <div>
                <div className="modal-title">Context & Protected Content Engine</div>
                <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-muted)", marginTop: 1 }}>
                  CONTEXT_AWARE_MT_TUNING & REGEX_PROTECTION
                </div>
              </div>
            </div>
            <button className="modal-close" onClick={onClose}>
              <X style={{ width: 15, height: 15 }} />
            </button>
          </div>

          {/* Modal Sub-Nav Tabs */}
          <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] pt-2.5">
            <button
              onClick={() => setActiveModalTab("context")}
              className={`flex items-center gap-2 text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                activeModalTab === "context"
                  ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Sliders size={13} />
              <span>Context & Translation Tuning</span>
            </button>

            <button
              onClick={() => setActiveModalTab("protected")}
              className={`flex items-center gap-2 text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                activeModalTab === "protected"
                  ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <ShieldCheck size={13} />
              <span>🔒 Protected Content & Regex Rules</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1, overflowY: "auto" }}>
          {activeModalTab === "protected" ? (
            <ProtectedContentPanel projectId={documentId} theme="dark" />
          ) : (
            <div className="space-y-5">
          {/* Preset profiles */}
          <div>
            <span className="settings-section-label">Translation Profiles (Presets)</span>
            <div style={{ marginTop: 8 }}>
              <div className="seg-control" style={{ display: "flex", flexWrap: "wrap", width: "100%", gap: 2, height: "auto", padding: 2 }}>
                {Object.keys(PROFILES).map(profile => (
                  <button 
                    key={profile}
                    type="button"
                    onClick={() => handleProfileSelect(profile)}
                    className={`seg-control-btn ${activeProfile === profile ? 'active' : ''}`}
                    style={{ flex: "1 1 auto", padding: "6px 12px", height: "auto" }}
                  >
                    {profile}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <span className="settings-section-label">Custom Translation Prompt</span>
            <div style={{ marginTop: 8 }}>
              <textarea
                className="context-textarea"
                value={contextSettings.customPrompt || ""}
                onChange={e => handleCustomPromptChange(e.target.value)}
                placeholder="Add project-specific translation instructions, terminology rules, tone requirements, product context, or do-not-translate guidance."
              />
            </div>
          </div>

          <div>
            <span className="settings-section-label">File-Based Context</span>
            <div className="context-upload-grid" style={{ marginTop: 8 }}>
              <label className="context-upload-card">
                <input
                  type="file"
                  accept=".md,.markdown,text/markdown,text/plain"
                  onChange={event => handleContextFileChange(event, "markdown")}
                  hidden
                />
                <FileText style={{ width: 17, height: 17 }} />
                <span>Upload Markdown</span>
              </label>

              <label className="context-upload-card">
                <input
                  type="file"
                  accept=".fig,application/octet-stream"
                  onChange={event => handleContextFileChange(event, "figma")}
                  hidden
                />
                <Upload style={{ width: 17, height: 17 }} />
                <span>Upload Figma</span>
              </label>
            </div>

            {fileError && (
              <div className="context-file-error">{fileError}</div>
            )}

            {(contextSettings.contextFiles || []).length > 0 && (
              <div className="context-file-list">
                {(contextSettings.contextFiles || []).map(file => (
                  <div key={file.id} className="context-file-row">
                    <div>
                      <div className="context-file-name">{file.name}</div>
                      <div className="context-file-meta">
                        {CONTEXT_FILE_LABELS[file.type] || "Context"} context - {Math.max(1, Math.round(file.size / 1024))} KB
                      </div>
                    </div>
                    <button
                      type="button"
                      className="context-file-remove"
                      onClick={() => handleRemoveContextFile(file.id)}
                      aria-label={`Remove ${file.name}`}
                    >
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Context Options Grid */}
          <div>
            <span className="settings-section-label">Context Variables</span>
            <div className="context-grid" style={{ marginTop: 8 }}>
              
              <div className="context-select-wrap">
                <span className="context-label">Domain</span>
                <select value={currentDomain} onChange={e => handleChange('domain', e.target.value)} className="context-select">
                  {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="context-select-wrap">
                <span className="context-label">Content Type</span>
                <select value={contextSettings.contentType || "General"} onChange={e => handleChange('contentType', e.target.value)} className="context-select">
                  {getAvailableOptions(currentDomain, 'contentType').map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="context-select-wrap">
                <span className="context-label">Target Audience</span>
                <select value={contextSettings.audience || "General"} onChange={e => handleChange('audience', e.target.value)} className="context-select">
                  {getAvailableOptions(currentDomain, 'audience').map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="context-select-wrap">
                <span className="context-label">Purpose</span>
                <select value={contextSettings.purpose || "General"} onChange={e => handleChange('purpose', e.target.value)} className="context-select">
                  {getAvailableOptions(currentDomain, 'purpose').map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="context-select-wrap">
                <span className="context-label">Tone</span>
                <select value={contextSettings.tone || "General"} onChange={e => handleChange('tone', e.target.value)} className="context-select">
                  {getAvailableOptions(currentDomain, 'tone').map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="context-select-wrap">
                <span className="context-label">Formality</span>
                <select value={contextSettings.formality || "Neutral"} onChange={e => handleChange('formality', e.target.value)} className="context-select">
                  {getAvailableOptions(currentDomain, 'formality').map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="context-select-wrap">
                <span className="context-label">Terminology Strictness</span>
                <select value={contextSettings.terminologyStrictness || "Flexible"} onChange={e => handleChange('terminologyStrictness', e.target.value)} className="context-select">
                  {getAvailableOptions(currentDomain, 'terminologyStrictness').map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

            </div>
          </div>
        </div>
      )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 22px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12
        }}>
          <div>
            <button 
              onClick={handleAutoDetect} 
              disabled={isDetecting || !documentId}
              className="ab" 
              style={{ 
                height: 32, 
                padding: "0 14px", 
                borderRadius: "var(--radius-md)",
                background: "rgba(16,185,129,0.06)",
                border: "1px solid rgba(16,185,129,0.22)",
                color: "var(--text-emerald)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: (isDetecting || !documentId) ? "not-allowed" : "pointer"
              }}
            >
              {isDetecting ? (
                <>
                  <Loader className="animate-spin" style={{ width: 14, height: 14 }} />
                  Analyzing Document...
                </>
              ) : (
                <>
                  <Sparkles style={{ width: 14, height: 14 }} />
                  Auto-Detect Context (AI)
                </>
              )}
            </button>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={onClose} className="ab ab-export" style={{ height: 32, padding: "0 18px", borderRadius: "var(--radius-md)" }}>
              <Check style={{ width: 14, height: 14, marginRight: 4 }} />
              Apply Context
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
