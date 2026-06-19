import { LANGUAGES } from "../constants/languages.js";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Settings as SettingsIcon,
  Sun,
  Moon,
  LogOut,
  Plus,
  LockKeyhole,
  Sliders,
  ChevronRight,
  FileText
} from "lucide-react";

// Tiny icon button for topbar right-side nav
const NavBtn = ({ children, onClick, disabled = false, title = "" }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      height: 28,
      padding: "0 9px",
      borderRadius: 7,
      fontSize: 11,
      fontWeight: 600,
      border: "1px solid transparent",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.35 : 1,
      transition: "background 0.15s, border-color 0.15s, color 0.15s",
      color: "var(--text-secondary)",
      background: "transparent",
      whiteSpace: "nowrap"
    }}
    onMouseEnter={e => {
      if (!disabled) {
        e.currentTarget.style.background = "var(--bg-hover)";
        e.currentTarget.style.borderColor = "var(--border-subtle)";
        e.currentTarget.style.color = "var(--text-primary)";
      }
    }}
    onMouseLeave={e => {
      e.currentTarget.style.background = "transparent";
      e.currentTarget.style.borderColor = "transparent";
      e.currentTarget.style.color = "var(--text-secondary)";
    }}
  >
    {children}
  </button>
);

export const Header = ({
  currentProvider,
  darkMode,
  onLoadProject,
  onOpenGlossary,
  onToggleDarkMode,
  qaIssuesCount,
  segmentsCount,
  progress,
  theme,
  onLock,
  isSidebar = false,        // kept for compat, ignored — always topbar now
  fileName,
  fileExtension,
  sourceLanguage,
  onSourceLanguageChange,
  targetLanguage,
  onTargetLanguageChange,
  stats,
  onCloseProject,
  onSaveProject,
  onRelinkHtml,
  onImportXliff,
  onOpenContext,
  onOpenSettings,
  userRole,
  onOpenAdmin,
  creditsAllowed,
  creditsConsumed,
  onLogout,
  onUpload
}) => {
  const isManager = userRole === "admin" || userRole === "manager";

  const srcLang = LANGUAGES.find(l => l.code === sourceLanguage);
  const tgtLang = LANGUAGES.find(l => l.code === targetLanguage);

  const hasFile = segmentsCount > 0;

  return (
    <header className="topbar">

      {/* ─── Brand ─── */}
      <div className="topbar-brand">
        <svg viewBox="0 0 100 100" style={{ width: 22, height: 22, color: "#6366f1", flexShrink: 0 }}
          fill="none" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 22,38 L 22,12 L 48,28" />
          <path d="M 78,38 L 78,12 L 52,28" />
          <path d="M 22,38 C 22,64 32,80 50,80 C 68,80 78,64 78,38" />
          <ellipse cx="38" cy="48" rx="4.5" ry="5.5" fill="currentColor" />
          <ellipse cx="62" cy="48" rx="4.5" ry="5.5" fill="currentColor" />
          <polygon points="46,58 54,58 50,62" fill="currentColor" />
          <path d="M 44,68 C 47,72 50,72 50,68 Q 50,72 56,68" strokeWidth="4" />
        </svg>
        <span className="topbar-brand-name">VerboCat</span>
      </div>

      <div className="topbar-divider" />

      {/* ─── Live breadcrumb (only when file loaded) ─── */}
      {hasFile ? (
        <div className="topbar-breadcrumb">
          <FileText style={{ width: 12, height: 12, color: "var(--text-muted)", flexShrink: 0 }} />
          <span className="topbar-filename" title={fileName}>{fileName}</span>
          {fileExtension && (
            <span className="topbar-ext">{fileExtension.toUpperCase()}</span>
          )}
          {srcLang && tgtLang && (
            <>
              <span className="topbar-divider" style={{ margin: "0 4px" }} />
              <div className="topbar-lang-pair">
                <span>{srcLang.flag} {srcLang.code.toUpperCase()}</span>
                <ChevronRight style={{ width: 10, height: 10, opacity: 0.4 }} />
                <span>{tgtLang.flag} {tgtLang.code.toUpperCase()}</span>
              </div>
            </>
          )}
          {progress !== undefined && (
            <span className="topbar-progress-badge">{progress}% done</span>
          )}
        </div>
      ) : (
        <div style={{ flex: 1 }} />
      )}

      {/* ─── Right nav actions ─── */}
      <div className="topbar-actions">

        {/* Upload new file (when no file loaded — primary CTA) */}
        {!hasFile && (
          <label style={{ cursor: "pointer" }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 28,
              padding: "0 12px",
              borderRadius: 7,
              fontSize: 11,
              fontWeight: 700,
              background: "var(--accent-primary)",
              color: "#fff",
              border: "1px solid rgba(99,102,241,0.5)",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(99,102,241,0.22)"
            }}>
              <Plus style={{ width: 12, height: 12 }} />
              Open File
            </span>
            <input type="file" onChange={onUpload} className="hidden" />
          </label>
        )}

        {/* Glossary */}
        <NavBtn onClick={onOpenGlossary} title="Glossary">
          <BookOpen style={{ width: 13, height: 13 }} />
          <span>Glossary</span>
        </NavBtn>

        {/* Context Settings */}
        <NavBtn onClick={onOpenContext} title="Translation Context">
          <Sliders style={{ width: 13, height: 13 }} />
          <span>Context</span>
        </NavBtn>

        {/* Team / Admin */}
        {isManager && onOpenAdmin && (
          <NavBtn onClick={onOpenAdmin} title="Admin Dashboard">
            <Users style={{ width: 13, height: 13 }} />
            <span>Team</span>
          </NavBtn>
        )}

        <div className="topbar-divider" />

        {/* Dark / light mode */}
        <NavBtn onClick={onToggleDarkMode} title={darkMode ? "Switch to Light" : "Switch to Dark"}>
          {darkMode
            ? <Sun style={{ width: 13, height: 13 }} />
            : <Moon style={{ width: 13, height: 13 }} />
          }
        </NavBtn>

        {/* Settings */}
        <NavBtn onClick={onOpenSettings} title="Settings">
          <SettingsIcon style={{ width: 13, height: 13 }} />
        </NavBtn>

        {/* Lock screen */}
        {onLock && (
          <NavBtn onClick={onLock} title="Lock Screen">
            <LockKeyhole style={{ width: 13, height: 13 }} />
          </NavBtn>
        )}

        <div className="topbar-divider" />

        {/* Logout */}
        <NavBtn onClick={onLogout} title="Log Out">
          <LogOut style={{ width: 13, height: 13 }} />
          <span>Log Out</span>
        </NavBtn>

      </div>
    </header>
  );
};
