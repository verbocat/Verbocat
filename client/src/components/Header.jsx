import { LANGUAGES } from "../constants/languages.js";
import { CollaboratorsList } from "./CollaboratorsList.jsx";
import {
  BookOpen, Users, Settings as SettingsIcon,
  Sun, Moon, LogOut, Plus, LockKeyhole, Sliders,
  ChevronRight, FileText, LayoutDashboard
} from "lucide-react";

const NavBtn = ({ children, onClick, disabled = false, title = "", iconOnly = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={iconOnly ? "nav-btn-icon" : "nav-btn"}
  >
    {children}
  </button>
);

export const Header = ({
  currentProvider, darkMode, onLoadProject, onOpenGlossary, onToggleDarkMode,
  qaIssuesCount, segmentsCount, progress, theme, onLock, isSidebar = false,
  fileName, fileExtension, sourceLanguage, onSourceLanguageChange,
  targetLanguage, onTargetLanguageChange, stats, onCloseProject, onSaveProject,
  onRelinkHtml, onImportXliff, onOpenContext, onOpenSettings,
  userRole, onOpenAdmin, creditsAllowed, creditsConsumed, onLogout, onUpload,
  collaborators, onOpenShare, onTeleport
}) => {
  const isAdmin = userRole === "admin";
  const hasFile = segmentsCount > 0;
  const srcLang = LANGUAGES.find(l => l.code === sourceLanguage);
  const tgtLang = LANGUAGES.find(l => l.code === targetLanguage);

  return (
    <header className="topbar">

      {/* Brand */}
      <div className="topbar-brand">
        <svg viewBox="0 0 100 100" style={{ width: 22, height: 22, color: "var(--accent)", flexShrink: 0 }}
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

      {/* Live breadcrumb */}
      {hasFile ? (
        <div className="topbar-crumb">
          <FileText style={{ width: 12, height: 12, color: "var(--text-muted)", flexShrink: 0 }} />
          <span className="topbar-filename" title={fileName}>{fileName}</span>
          {fileExtension && <span className="topbar-badge">{fileExtension.replace(".", "")}</span>}
          {srcLang && tgtLang && (
            <>
              <span className="topbar-sep-dot">·</span>
              <div className="topbar-langpair">
                <span>{srcLang.flag} {srcLang.code.toUpperCase()}</span>
                <ChevronRight style={{ width: 9, height: 9, opacity: 0.4, flexShrink: 0 }} />
                <span>{tgtLang.flag} {tgtLang.code.toUpperCase()}</span>
              </div>
            </>
          )}
          {progress !== undefined && (
            <span className="topbar-progress">{progress}% done</span>
          )}
        </div>
      ) : (
        <div style={{ flex: 1 }} />
      )}

      {/* Right nav */}
      <div className="topbar-actions">

        {/* Collaborators List */}
        {hasFile && collaborators && collaborators.length > 0 && (
          <CollaboratorsList collaborators={collaborators} onTeleport={onTeleport} />
        )}

        {/* Share Button */}
        {hasFile && onOpenShare && (
          <NavBtn onClick={onOpenShare} title="Share Document Workspace">
            <Users style={{ width: 13, height: 13 }} />
            <span>Share</span>
          </NavBtn>
        )}

        {/* Extreme Animated Theme Toggle Button */}
        {onToggleDarkMode && (
          <button
            onClick={onToggleDarkMode}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className={`theme-toggle-extreme ${darkMode ? "dark-active" : "light-active"}`}
            style={{ marginLeft: 4, marginRight: 4, flexShrink: 0 }}
          >
            <div className="theme-toggle-extreme-track">
              <div className="theme-toggle-extreme-ball">
                {darkMode ? (
                  <Moon className="theme-toggle-extreme-icon moon" />
                ) : (
                  <Sun className="theme-toggle-extreme-icon sun" />
                )}
              </div>
            </div>
          </button>
        )}

        {/* Primary upload CTA when no file */}
        {!hasFile && (
          <label className="btn-cta" style={{ cursor: "pointer" }}>
            <Plus style={{ width: 13, height: 13 }} />
            Open File
            <input type="file" onChange={onUpload} className="hidden" />
          </label>
        )}

        {/* Glossary */}
        <NavBtn onClick={onOpenGlossary} title="Glossary">
          <BookOpen style={{ width: 13, height: 13 }} />
          <span>Glossary</span>
        </NavBtn>

        {/* Context */}
        <NavBtn onClick={onOpenContext} title="Translation Context">
          <Sliders style={{ width: 13, height: 13 }} />
          <span>Context</span>
        </NavBtn>

        {/* Admin Panel — NOT "Team" */}
        {isAdmin && onOpenAdmin && (
          <NavBtn onClick={onOpenAdmin} title="Admin Panel">
            <LayoutDashboard style={{ width: 13, height: 13 }} />
            <span>Admin Panel</span>
          </NavBtn>
        )}

        <div className="topbar-divider" />

        {/* Settings */}
        <NavBtn onClick={onOpenSettings} title="Settings" iconOnly>
          <SettingsIcon style={{ width: 14, height: 14 }} />
        </NavBtn>

        {/* Lock */}
        {onLock && (
          <NavBtn onClick={onLock} title="Lock Screen" iconOnly>
            <LockKeyhole style={{ width: 14, height: 14 }} />
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
