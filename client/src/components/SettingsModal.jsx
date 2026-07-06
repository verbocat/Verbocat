import { useState, useEffect } from "react";
import { X, LogOut, User, ShieldCheck, Sliders } from "lucide-react";

const Toggle = ({ on, onToggle }) => (
  <button type="button" onClick={onToggle} className={`toggle ${on ? "on" : "off"}`}>
    <div className="toggle-knob" />
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
  theme
}) => {
  const [localDarkMode, setLocalDarkMode] = useState(darkMode);
  const [localFontSize, setLocalFontSize] = useState(editorFontSize);
  const [localAutocomplete, setLocalAutocomplete] = useState(autocompleteEnabled);
  const [localAutoPropagate, setLocalAutoPropagate] = useState(autoPropagateEnabled);

  useEffect(() => {
    if (show) {
      setLocalDarkMode(darkMode);
      setLocalFontSize(editorFontSize);
      setLocalAutocomplete(autocompleteEnabled);
      setLocalAutoPropagate(autoPropagateEnabled);
    }
  }, [show, darkMode, editorFontSize, autocompleteEnabled, autoPropagateEnabled]);

  if (!show) return null;

  const handleApply = () => {
    onApplySettings({
      darkMode: localDarkMode,
      editorFontSize: localFontSize,
      autocompleteEnabled: localAutocomplete,
      autoPropagateEnabled: localAutoPropagate
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: 480 }}>

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
              <div className="modal-title">Workspace Settings</div>
              <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-muted)", marginTop: 1 }}>
                VERBOCAT v1.2
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Appearance Preference */}
          <div>
            <span className="settings-section-label">Appearance</span>
            <div>
              <div className="settings-row" style={{ borderRadius: "var(--radius-md) var(--radius-md) 0 0" }}>
                <div>
                  <span className="settings-label">Interface Theme</span>
                  <span className="settings-desc">Choose between dark mode and light mode</span>
                </div>
                <div className="seg-control">
                  <button type="button"
                    className={`seg-control-btn ${!localDarkMode ? "active" : ""}`}
                    onClick={() => setLocalDarkMode(false)}>
                    Light
                  </button>
                  <button type="button"
                    className={`seg-control-btn ${localDarkMode ? "active" : ""}`}
                    onClick={() => setLocalDarkMode(true)}>
                    Dark
                  </button>
                </div>
              </div>
              <div className="settings-row" style={{ borderTop: "none", borderRadius: "0 0 var(--radius-md) var(--radius-md)" }}>
                <div>
                  <span className="settings-label">Editor Font Size</span>
                  <span className="settings-desc">Default text size in translation rows</span>
                </div>
                <div className="seg-control">
                  {["small", "medium", "large"].map(s => (
                    <button key={s} type="button"
                      className={`seg-control-btn ${localFontSize === s ? "active" : ""}`}
                      onClick={() => setLocalFontSize(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Editor Preferences */}
          <div>
            <span className="settings-section-label">Translation Preferences</span>
            <div>
              <div className="settings-row" style={{ borderRadius: "var(--radius-md) var(--radius-md) 0 0" }}>
                <div>
                  <span className="settings-label">Glossary Autocomplete</span>
                  <span className="settings-desc">Show terminology suggestions while typing</span>
                </div>
                <Toggle on={localAutocomplete} onToggle={() => setLocalAutocomplete(v => !v)} />
              </div>
              <div className="settings-row" style={{ borderTop: "none", borderRadius: "0 0 var(--radius-md) var(--radius-md)" }}>
                <div>
                  <span className="settings-label">Auto-Propagate Segments</span>
                  <span className="settings-desc">Apply translations across identical source texts</span>
                </div>
                <Toggle on={localAutoPropagate} onToggle={() => setLocalAutoPropagate(v => !v)} />
              </div>
            </div>
          </div>

          {/* Account */}
          <div>
            <span className="settings-section-label">Account Session</span>
            <div className="settings-row" style={{
              borderRadius: "var(--radius-md)",
              flexWrap: "wrap", gap: 12
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--text-muted)", flexShrink: 0
                }}>
                  <User style={{ width: 15, height: 15 }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {userEmail || "anonymous@verbolabs.com"}
                  </div>
                  <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: "var(--accent)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {userRole || "linguist"}
                  </div>
                </div>
              </div>
              <button
                onClick={() => { onClose(); onLogout(); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 14px", borderRadius: "var(--radius-sm)",
                  background: "rgba(244,63,94,0.08)",
                  border: "1px solid rgba(244,63,94,0.2)",
                  color: "var(--text-rose)", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", transition: "background 0.12s", flexShrink: 0
                }}
              >
                <LogOut style={{ width: 13, height: 13 }} />
                Log Out
              </button>
            </div>
          </div>

          {/* Apply / Cancel Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-md)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-medium)",
                color: "var(--text-secondary)",
                transition: "all 0.15s ease"
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
            >
              Apply Settings
            </button>
          </div>

        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 22px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 9.5, fontFamily: "'IBM Plex Mono', monospace",
          color: "var(--text-muted)", userSelect: "none"
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <ShieldCheck style={{ width: 11, height: 11, color: "var(--text-emerald)" }} />
            SESSION_ENCRYPTED_SSL
          </span>
          <span>SYSTEM_STABLE</span>
        </div>

      </div>
    </div>
  );
};
