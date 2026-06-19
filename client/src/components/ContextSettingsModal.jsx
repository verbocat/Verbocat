import { useState } from "react";
import { X, Sliders, Check } from "lucide-react";

const DOMAINS = ["General", "Marketing", "Legal", "Medical", "Pharmaceutical", "Financial", "Banking", "Insurance", "Technical", "Software", "IT & Cybersecurity", "E-commerce", "Automotive", "Manufacturing", "Engineering", "Telecommunications", "Gaming", "Education", "Government", "HR & Recruitment", "Travel & Tourism", "Hospitality", "Retail", "Energy & Utilities", "Real Estate", "Life Sciences", "Healthcare", "Aerospace", "Agriculture", "Media & Entertainment"];

const CONTENT_TYPES = ["General", "Landing Page", "Product Page", "Advertisement", "Email Campaign", "Sales Brochure", "Social Media Post", "UI Strings", "Help Center", "User Guide", "Documentation", "Release Notes", "Knowledge Base", "Contract", "NDA", "Terms of Service", "Privacy Policy", "Compliance Document", "Clinical Trial", "IFU", "Patient Information", "Medical Report", "Website", "Blog", "Article", "Presentation", "Training Material", "Internal Communication"];

const AUDIENCES = ["General", "Consumers", "Small Business Owners", "Enterprise Buyers", "Patients", "Caregivers", "End Users", "Developers", "Administrators"];

const PURPOSES = ["General", "Generate Leads", "Drive Purchases", "Build Trust", "Increase Signups", "Inform", "Educate", "Train", "Comply", "Protect Rights", "Resolve Issues", "Reduce Support Tickets"];

const TONES = ["General", "Persuasive", "Professional", "Friendly", "Formal", "Precise", "Reassuring", "Clear", "Concise", "Casual", "Engaging"];

const PROFILES = {
  "Custom": {},
  "Marketing Website": { domain: "Marketing", contentType: "Landing Page", purpose: "Generate Leads", tone: "Persuasive" },
  "Software Localization": { domain: "Software", contentType: "UI Strings", purpose: "Inform", tone: "Clear", terminologyStrictness: "Strict" },
  "Legal": { domain: "Legal", contentType: "Contract", purpose: "Comply", tone: "Formal", terminologyStrictness: "Strict", formality: "Very Formal" },
  "Medical": { domain: "Medical", contentType: "Patient Information", purpose: "Educate", tone: "Professional", terminologyStrictness: "Strict" },
  "E-commerce": { domain: "E-commerce", contentType: "Product Page", purpose: "Drive Purchases", tone: "Persuasive" }
};

export const ContextSettingsModal = ({ show, onClose, contextSettings, setContextSettings, theme }) => {
  if (!show) return null;

  const [activeProfile, setActiveProfile] = useState("Custom");
  
  const handleChange = (field, value) => {
    setContextSettings(prev => ({ ...prev, [field]: value }));
    setActiveProfile("Custom");
  };

  const handleProfileSelect = (profileName) => {
    setActiveProfile(profileName);
    if (profileName !== "Custom") {
      setContextSettings(prev => ({ ...prev, ...PROFILES[profileName] }));
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: 720 }}>

        {/* Header */}
        <div className="modal-header">
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
              <div className="modal-title">Translation Context Engine</div>
              <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-muted)", marginTop: 1 }}>
                CONTEXT_AWARE_MT_TUNING
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          
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

          {/* Context Options Grid */}
          <div>
            <span className="settings-section-label">Context Variables</span>
            <div className="context-grid" style={{ marginTop: 8 }}>
              
              <div className="context-select-wrap">
                <span className="context-label">Domain</span>
                <select value={contextSettings.domain || "General"} onChange={e => handleChange('domain', e.target.value)} className="context-select">
                  {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="context-select-wrap">
                <span className="context-label">Content Type</span>
                <select value={contextSettings.contentType || "General"} onChange={e => handleChange('contentType', e.target.value)} className="context-select">
                  {CONTENT_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="context-select-wrap">
                <span className="context-label">Target Audience</span>
                <select value={contextSettings.audience || "General"} onChange={e => handleChange('audience', e.target.value)} className="context-select">
                  {AUDIENCES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="context-select-wrap">
                <span className="context-label">Purpose</span>
                <select value={contextSettings.purpose || "General"} onChange={e => handleChange('purpose', e.target.value)} className="context-select">
                  {PURPOSES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="context-select-wrap">
                <span className="context-label">Tone</span>
                <select value={contextSettings.tone || "General"} onChange={e => handleChange('tone', e.target.value)} className="context-select">
                  {TONES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="context-select-wrap">
                <span className="context-label">Formality</span>
                <select value={contextSettings.formality || "Neutral"} onChange={e => handleChange('formality', e.target.value)} className="context-select">
                  {["Very Formal", "Formal", "Neutral", "Informal", "Very Informal"].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="context-select-wrap">
                <span className="context-label">Terminology Strictness</span>
                <select value={contextSettings.terminologyStrictness || "Flexible"} onChange={e => handleChange('terminologyStrictness', e.target.value)} className="context-select">
                  {["Flexible", "Balanced", "Strict"].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 22px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          gap: 12
        }}>
          <button onClick={onClose} className="ab ab-export" style={{ height: 32, padding: "0 18px", borderRadius: "var(--radius-md)" }}>
            <Check style={{ width: 14, height: 14, marginRight: 4 }} />
            Apply Context
          </button>
        </div>

      </div>
    </div>
  );
};
