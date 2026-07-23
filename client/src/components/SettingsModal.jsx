import { useState, useEffect } from "react";
import {
  X, LogOut, User, ShieldCheck, Sliders, Check,
  Monitor, Sparkles, Keyboard, Activity, Folder
} from "lucide-react";
import { fetchProjectDetails, updateProjectDetails } from "../services/api.js";
import { LANGUAGES } from "../constants/languages.js";

const Toggle = ({ on, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className={`toggle ${on ? "on" : "off"}`}
    style={{ transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }}
  >
    <div
      className="toggle-knob"
      style={{
        transform: on ? "translateX(16px)" : "translateX(0)",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
      }}
    />
  </button>
);

export const SettingsModal = ({
  show,
  onClose,
  darkMode,
  editorFontSize,
  autocompleteEnabled,
  autoPropagateEnabled,
  onApplySettings,
  onLogout,
  userRole,
  userEmail,
  theme,
  projectId,
  onProjectUpdated,
  userId
}) => {
  const [localDarkMode, setLocalDarkMode] = useState(darkMode);
  const [localFontSize, setLocalFontSize] = useState(editorFontSize);
  const [localAutocomplete, setLocalAutocomplete] = useState(autocompleteEnabled);
  const [localAutoPropagate, setLocalAutoPropagate] = useState(autoPropagateEnabled);
  const [activeTab, setActiveTab] = useState("preferences");

  const [projectSettings, setProjectSettings] = useState(null);
  const [localProjectName, setLocalProjectName] = useState("");
  const [localClientName, setLocalClientName] = useState("");
  const [localDescription, setLocalDescription] = useState("");
  const [localSourceLang, setLocalSourceLang] = useState("");
  const [localDeadline, setLocalDeadline] = useState("");
  const [localTranslationPrompt, setLocalTranslationPrompt] = useState("");
  const [localAutoSave, setLocalAutoSave] = useState(true);
  const [localNotifications, setLocalNotifications] = useState(true);
  const [loadingProject, setLoadingProject] = useState(false);
  const [savingProject, setSavingProject] = useState(false);

  useEffect(() => {
    if (show) {
      setLocalDarkMode(darkMode);
      setLocalFontSize(editorFontSize);
      setLocalAutocomplete(autocompleteEnabled);
      setLocalAutoPropagate(autoPropagateEnabled);
      setActiveTab(projectId ? "project" : "preferences");
    }
  }, [show, darkMode, editorFontSize, autocompleteEnabled, autoPropagateEnabled, projectId]);

  useEffect(() => {
    if (show && projectId) {
      loadProjectData();
    }
  }, [show, projectId]);

  useEffect(() => {
    if (show && projectId && projectSettings) {
      const isOwner = !projectSettings.isShared || projectSettings.owner_id === userId || !userId;
      if (!isOwner && activeTab === "project") {
        setActiveTab("preferences");
      }
    }
  }, [show, projectId, projectSettings, userId, activeTab]);

  const loadProjectData = async () => {
    try {
      setLoadingProject(true);
      const data = await fetchProjectDetails(projectId);
      if (data && data.project) {
        setProjectSettings(data.project);
        setLocalProjectName(data.project.name || "");
        setLocalClientName(data.project.client || "");
        setLocalDescription(data.project.description || "");
        setLocalSourceLang(data.project.source_lang || data.project.source_language || "en");
        setLocalDeadline(data.project.dueDate || data.project.deadline || data.project.settings?.dueDate || data.project.settings?.deadline || "");
        const settings = data.project.settings || {};
        setLocalTranslationPrompt(settings.translationPrompt || "");
        setLocalAutoSave(settings.autoSave !== undefined ? settings.autoSave : true);
        setLocalNotifications(settings.notifications !== undefined ? settings.notifications : true);
      }
    } catch (err) {
      console.error("Failed to load project details in settings modal:", err);
    } finally {
      setLoadingProject(false);
    }
  };

  if (!show) return null;

  const handleApply = async () => {
    onApplySettings({
      darkMode: localDarkMode,
      editorFontSize: localFontSize,
      autocompleteEnabled: localAutocomplete,
      autoPropagateEnabled: localAutoPropagate
    });

    if (projectId && projectSettings) {
      try {
        setSavingProject(true);
        await updateProjectDetails(projectId, {
          name: localProjectName,
          client: localClientName,
          description: localDescription,
          sourceLanguage: localSourceLang,
          targetLanguages: projectSettings.target_languages || [],
          dueDate: localDeadline || null,
          deadline: localDeadline || null,
          settings: {
            translationPrompt: localTranslationPrompt,
            autoSave: localAutoSave,
            notifications: localNotifications,
            dueDate: localDeadline || null,
            deadline: localDeadline || null
          }
        });
        if (onProjectUpdated) {
          onProjectUpdated();
        }
      } catch (err) {
        console.error("Failed to save project settings in modal:", err);
      } finally {
        setSavingProject(false);
      }
    }
    onClose();
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "preferences":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <span className="settings-section-label">Interface Theme</span>
              <div className="theme-picker-grid">
                {/* Light Mode Card */}
                <div
                  className={`theme-card light-theme-card ${!localDarkMode ? "active" : ""}`}
                  onClick={() => setLocalDarkMode(false)}
                >
                  <div className="theme-card-title-wrap">
                    <span className="theme-card-label">Light Mode</span>
                    <span className="theme-check">
                      <Check style={{ width: 11, height: 11 }} />
                    </span>
                  </div>
                  <div className="theme-mock-ui">
                    <div className="theme-mock-bar" />
                    <div className="theme-mock-content">
                      <div className="theme-mock-sidebar" />
                      <div className="theme-mock-editor" />
                    </div>
                  </div>
                </div>

                {/* Dark Mode Card */}
                <div
                  className={`theme-card dark-theme-card ${localDarkMode ? "active" : ""}`}
                  onClick={() => setLocalDarkMode(true)}
                >
                  <div className="theme-card-title-wrap">
                    <span className="theme-card-label">Dark Mode</span>
                    <span className="theme-check">
                      <Check style={{ width: 11, height: 11 }} />
                    </span>
                  </div>
                  <div className="theme-mock-ui">
                    <div className="theme-mock-bar" />
                    <div className="theme-mock-content">
                      <div className="theme-mock-sidebar" />
                      <div className="theme-mock-editor" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <span className="settings-section-label">Editor Font Size</span>
              <div className="settings-card-row" style={{ display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Adjust text size</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Changes the size of editor translation rows</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="1"
                      value={localFontSize === "small" ? 1 : localFontSize === "large" ? 3 : 2}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setLocalFontSize(val === 1 ? "small" : val === 3 ? "large" : "medium");
                      }}
                      style={{
                        width: 100,
                        accentColor: "var(--accent)",
                        cursor: "pointer"
                      }}
                    />
                    <span style={{ fontSize: 11.5, fontWeight: 700, minWidth: 50, textTransform: "capitalize", color: "var(--text-primary)", textAlign: "right" }}>
                      {localFontSize}
                    </span>
                  </div>
                </div>

                {/* Dynamic Preview Box */}
                <div className="settings-preview-box">
                  <span className="preview-text-label">Live Sizing Preview</span>
                  <div
                    className="preview-text-content"
                    style={{
                      fontSize: localFontSize === "small" ? "11px" : localFontSize === "large" ? "14.5px" : "12.5px"
                    }}
                  >
                    The quick brown fox jumps over the lazy dog.
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case "translation":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <span className="settings-section-label">Linguist Automations</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                <div className="settings-card-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Glossary Autocomplete</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 }}>
                      Provides real-time term suggestions from your target glossary as you compose segment translations.
                    </div>
                  </div>
                  <Toggle on={localAutocomplete} onToggle={() => setLocalAutocomplete(v => !v)} />
                </div>

                <div className="settings-card-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Auto-Propagate Segments</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 }}>
                      Instantly populates matching source segments across the entire document when you confirm a translation.
                    </div>
                  </div>
                  <Toggle on={localAutoPropagate} onToggle={() => setLocalAutoPropagate(v => !v)} />
                </div>
              </div>
            </div>
          </div>
        );

      case "shortcuts":
        return (
          <div>
            <span className="settings-section-label">Keyboard Shortcuts cheatsheet</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <div className="settings-card-row" style={{ padding: "12px 16px" }}>
                <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500 }}>Confirm translation & advance</span>
                <div>
                  <span className="keycap">Ctrl</span>
                  <span style={{ color: "var(--text-muted)", margin: "0 2px" }}>+</span>
                  <span className="keycap">Enter</span>
                </div>
              </div>

              <div className="settings-card-row" style={{ padding: "12px 16px" }}>
                <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500 }}>Undo / Redo action</span>
                <div>
                  <span className="keycap">Ctrl</span>
                  <span style={{ color: "var(--text-muted)", margin: "0 2px" }}>+</span>
                  <span className="keycap">Z</span>
                  <span style={{ color: "var(--text-muted)", margin: "0 4px" }}>/</span>
                  <span className="keycap">Y</span>
                </div>
              </div>

              <div className="settings-card-row" style={{ padding: "12px 16px" }}>
                <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500 }}>Open Search & Replace</span>
                <div>
                  <span className="keycap">Ctrl</span>
                  <span style={{ color: "var(--text-muted)", margin: "0 2px" }}>+</span>
                  <span className="keycap">F</span>
                </div>
              </div>

              <div className="settings-card-row" style={{ padding: "12px 16px" }}>
                <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500 }}>Navigate segments</span>
                <div>
                  <span className="keycap">Alt</span>
                  <span style={{ color: "var(--text-muted)", margin: "0 2px" }}>+</span>
                  <span className="keycap">↑</span>
                  <span style={{ color: "var(--text-muted)", margin: "0 2px" }}>/</span>
                  <span className="keycap">↓</span>
                </div>
              </div>

              <div className="settings-card-row" style={{ padding: "12px 16px" }}>
                <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500 }}>Cancel editing / close editor</span>
                <div>
                  <span className="keycap">Esc</span>
                </div>
              </div>
            </div>
          </div>
        );

      case "account":
        return (
          <div>
            <span className="settings-section-label">Account Session</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
              <div className="account-profile-card">
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div className="profile-avatar-gradient">
                    {(userEmail || "A")[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                      {userEmail || "anonymous@verbolabs.com"}
                    </div>
                    <div style={{ fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace", color: "var(--accent)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      ROLE: {userRole || "linguist"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { onClose(); onLogout(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 16px", borderRadius: "var(--radius-md)",
                    background: "rgba(244,63,94,0.08)",
                    border: "1px solid rgba(244,63,94,0.2)",
                    color: "var(--text-rose)", fontSize: 12.5, fontWeight: 600,
                    cursor: "pointer", transition: "all 0.2s ease"
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = "rgba(244,63,94,0.15)"}
                  onMouseOut={(e) => e.currentTarget.style.background = "rgba(244,63,94,0.08)"}
                >
                  <LogOut style={{ width: 14, height: 14 }} />
                  Log Out Session
                </button>
              </div>

              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "12px 16px", background: "var(--bg-active)",
                border: "1px solid rgba(34,197,94,0.2)", borderRadius: "var(--radius-lg)",
                color: "var(--text-emerald)", fontSize: 11.5, fontWeight: 500
              }}>
                <ShieldCheck style={{ width: 16, height: 16 }} />
                <span>Your session is protected with secure SSL 256-bit encryption. All edits propagate to the server in real-time.</span>
              </div>
            </div>
          </div>
        );

      case "diagnostics":
        return (
          <div>
            <span className="settings-section-label">System Performance</span>
            <div className="diagnostics-grid">
              <div className="diag-card">
                <span className="diag-label">API Latency</span>
                <span className="diag-value">
                  <span className="pulse-dot" />
                  18 ms
                </span>
              </div>

              <div className="diag-card">
                <span className="diag-label">Active Connection</span>
                <span className="diag-value" style={{ color: "var(--text-emerald)" }}>
                  Stable (WebSocket)
                </span>
              </div>

              <div className="diag-card">
                <span className="diag-label">Server Cluster</span>
                <span className="diag-value">
                  US-West (Oregon)
                </span>
              </div>

              <div className="diag-card">
                <span className="diag-label">DB Connection Pool</span>
                <span className="diag-value">
                  Active (4/10)
                </span>
              </div>

              <div className="diag-card">
                <span className="diag-label">SSL Verification</span>
                <span className="diag-value">
                  TLS 1.3 Secure
                </span>
              </div>

              <div className="diag-card">
                <span className="diag-label">Workspace Uptime</span>
                <span className="diag-value">
                  100% Reliable
                </span>
              </div>
            </div>
          </div>
        );

      case "project":
        if (loadingProject) {
          return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", color: "var(--text-muted)", fontSize: 13 }}>
              Loading project settings...
            </div>
          );
        }
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <span className="settings-section-label">Project Details</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", tracking: "0.05em", color: "var(--text-muted)", marginBottom: 6 }}>
                      Project Name
                    </label>
                    <input 
                      type="text"
                      value={localProjectName}
                      onChange={(e) => setLocalProjectName(e.target.value)}
                      style={{
                        width: "100%",
                        background: "var(--bg-active)",
                        border: "1px solid var(--border-medium)",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 12.5,
                        color: "var(--text-primary)",
                        outline: "none"
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", tracking: "0.05em", color: "var(--text-muted)", marginBottom: 6 }}>
                      Client Name
                    </label>
                    <input 
                      type="text"
                      value={localClientName}
                      onChange={(e) => setLocalClientName(e.target.value)}
                      style={{
                        width: "100%",
                        background: "var(--bg-active)",
                        border: "1px solid var(--border-medium)",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 12.5,
                        color: "var(--text-primary)",
                        outline: "none"
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", tracking: "0.05em", color: "var(--text-muted)", marginBottom: 6 }}>
                    Project Description
                  </label>
                  <textarea 
                    value={localDescription}
                    onChange={(e) => setLocalDescription(e.target.value)}
                    rows={3}
                    style={{
                      width: "100%",
                      background: "var(--bg-active)",
                      border: "1px solid var(--border-medium)",
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 12.5,
                      color: "var(--text-primary)",
                      outline: "none",
                      resize: "none"
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", tracking: "0.05em", color: "var(--text-muted)", marginBottom: 6 }}>
                    Project Deadline / Due Date
                  </label>
                  <input
                    type="datetime-local"
                    value={localDeadline}
                    onChange={(e) => setLocalDeadline(e.target.value)}
                    style={{
                      width: "100%",
                      background: "var(--bg-active)",
                      border: "1px solid var(--border-medium)",
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 12.5,
                      color: "var(--text-primary)",
                      outline: "none"
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", tracking: "0.05em", color: "var(--text-muted)", marginBottom: 6 }}>
                    Source Language
                  </label>
                  <select
                    value={localSourceLang}
                    onChange={(e) => setLocalSourceLang(e.target.value)}
                    style={{
                      width: "100%",
                      background: "var(--bg-active)",
                      border: "1px solid var(--border-medium)",
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 12.5,
                      color: "var(--text-primary)",
                      outline: "none"
                    }}
                  >
                    {LANGUAGES.filter(lang => !lang.hidden).map(lang => (
                      <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", tracking: "0.05em", color: "var(--text-muted)", marginBottom: 6 }}>
                    AI Translation Instructions / Prompt
                  </label>
                  <textarea 
                    value={localTranslationPrompt}
                    onChange={(e) => setLocalTranslationPrompt(e.target.value)}
                    placeholder="Specify constraints, target audience, style guidelines..."
                    rows={3}
                    style={{
                      width: "100%",
                      background: "var(--bg-active)",
                      border: "1px solid var(--border-medium)",
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 12.5,
                      color: "var(--text-primary)",
                      outline: "none",
                      resize: "none"
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--border-subtle)", paddingTop: 14 }}>
                  <div className="settings-card-row">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Auto Save Session</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        Automatically save translation segments in progress.
                      </div>
                    </div>
                    <Toggle on={localAutoSave} onToggle={() => setLocalAutoSave(v => !v)} />
                  </div>

                  <div className="settings-card-row">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Notifications Enabled</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        Receive updates on job queue completion status.
                      </div>
                    </div>
                    <Toggle on={localNotifications} onToggle={() => setLocalNotifications(v => !v)} />
                  </div>
                </div>

              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card settings-modal-card">

        {/* Header */}
        <div className="modal-header" style={{ flexShrink: 0 }}>
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
              <div className="modal-title">Workspace Settings</div>
              <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-muted)", marginTop: 1 }}>
                CENTROID v1.2
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Body Split */}
        <div className="settings-body-split">
          {/* Sidebar Tabs */}
          <div className="settings-sidebar">
            {projectId && (!projectSettings || projectSettings.owner_id === userId) && (
              <button
                type="button"
                className={`settings-tab-btn ${activeTab === "project" ? "active" : ""}`}
                onClick={() => setActiveTab("project")}
              >
                <Folder style={{ width: 14, height: 14 }} />
                <span>Project Settings</span>
              </button>
            )}
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === "preferences" ? "active" : ""}`}
              onClick={() => setActiveTab("preferences")}
            >
              <Monitor style={{ width: 14, height: 14 }} />
              <span>Preferences</span>
            </button>
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === "translation" ? "active" : ""}`}
              onClick={() => setActiveTab("translation")}
            >
              <Sparkles style={{ width: 14, height: 14 }} />
              <span>Translation</span>
            </button>
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === "shortcuts" ? "active" : ""}`}
              onClick={() => setActiveTab("shortcuts")}
            >
              <Keyboard style={{ width: 14, height: 14 }} />
              <span>Shortcuts</span>
            </button>
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === "account" ? "active" : ""}`}
              onClick={() => setActiveTab("account")}
            >
              <User style={{ width: 14, height: 14 }} />
              <span>Account</span>
            </button>
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === "diagnostics" ? "active" : ""}`}
              onClick={() => setActiveTab("diagnostics")}
            >
              <Activity style={{ width: 14, height: 14 }} />
              <span>Diagnostics</span>
            </button>
          </div>

          {/* Tab Content viewport */}
          <div className="settings-content-pane">
            {renderTabContent()}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{
          flexShrink: 0,
          padding: "16px 24px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--bg-surface)"
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            fontSize: 9.5, fontFamily: "'IBM Plex Mono', monospace",
            color: "var(--text-muted)", userSelect: "none"
          }}>
            <ShieldCheck style={{ width: 11, height: 11, color: "var(--text-emerald)" }} />
            SESSION_ENCRYPTED_SSL
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-md)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                background: "transparent",
                border: "1px solid var(--border-medium)",
                color: "var(--text-secondary)",
                transition: "all 0.15s ease"
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.borderColor = "var(--border-strong)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "var(--border-medium)";
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              style={{
                padding: "8px 18px",
                borderRadius: "var(--radius-md)",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                background: "var(--accent)",
                border: "1px solid var(--accent)",
                color: "#ffffff",
                boxShadow: "0 4px 12px var(--accent-glow)",
                transition: "all 0.15s ease"
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "var(--accent-hover)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(91,106,240,0.3)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "var(--accent)";
                e.currentTarget.style.boxShadow = "0 4px 12px var(--accent-glow)";
              }}
            >
              Apply Settings
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
