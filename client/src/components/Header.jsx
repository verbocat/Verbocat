import { LANGUAGES } from "../constants/languages.js";
import { CollaboratorsList } from "./CollaboratorsList.jsx";
import {
  BookOpen, Users, Settings as SettingsIcon,
  LogOut, Plus, LockKeyhole, Sliders,
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
  projectId, projectName, onNavigate,
  currentProvider, darkMode, onLoadProject, onOpenGlossary, onToggleDarkMode,
  qaIssuesCount, segmentsCount, progress, theme, onLock, isSidebar = false,
  fileName, fileExtension, sourceLanguage, onSourceLanguageChange,
  targetLanguage, onTargetLanguageChange, stats, onDeleteProject, onSaveProject,
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
          fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 50,15 L 80,32 L 80,68 L 50,85 L 20,68 L 20,32 Z" opacity="0.4" />
          <path d="M 50,15 L 50,42" />
          <path d="M 80,68 L 57,55" />
          <path d="M 20,68 L 43,55" />
          <circle cx="50" cy="50" r="8" fill="currentColor" />
          <circle cx="50" cy="50" r="16" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
        </svg>
        <span className="topbar-brand-name">Centroid</span>
      </div>

      <div className="topbar-divider" />

      {/* Live breadcrumb */}
      {hasFile ? (
        <div className="topbar-crumb" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          <button 
            onClick={() => onNavigate && onNavigate("/")} 
            style={{ background: "none", border: "none", padding: 0, margin: 0, color: "var(--text-secondary)", cursor: "pointer", transition: "color 0.2s" }}
            onMouseOver={(e) => e.currentTarget.style.color = "var(--accent)"}
            onMouseOut={(e) => e.currentTarget.style.color = "var(--text-secondary)"}
          >
            Dashboard
          </button>
          <ChevronRight style={{ width: 10, height: 10, opacity: 0.4 }} />

          {projectName && projectId ? (
            <>
              <button 
                onClick={() => onNavigate && onNavigate(`/project/${projectId}`)} 
                style={{ background: "none", border: "none", padding: 0, margin: 0, color: "var(--text-secondary)", cursor: "pointer", transition: "color 0.2s" }}
                onMouseOver={(e) => e.currentTarget.style.color = "var(--accent)"}
                onMouseOut={(e) => e.currentTarget.style.color = "var(--text-secondary)"}
              >
                {projectName}
              </button>
              <ChevronRight style={{ width: 10, height: 10, opacity: 0.4 }} />
            </>
          ) : null}

          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)", fontWeight: 600 }}>
            <FileText style={{ width: 12, height: 12, color: "var(--text-muted)", flexShrink: 0 }} />
            <span className="topbar-filename" title={fileName}>{fileName}</span>
            {fileExtension && <span className="topbar-badge">{fileExtension.replace(".", "")}</span>}
          </div>

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


        {/* Primary upload CTA when no file */}
        {!hasFile && (
          <label className="btn-cta btn-cta-premium" style={{ cursor: "pointer" }}>
            <span className="project-action-icon">
              <Plus style={{ width: 13, height: 13 }} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1 }}>
              <span>Open File</span>
              <span className="btn-cta-meta">Import a document into the workspace</span>
            </span>
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
        <button
          onClick={onOpenSettings}
          title="Workspace Settings"
          className="settings-btn-premium"
        >
          <SettingsIcon style={{ width: 15, height: 15 }} />
        </button>


        {/* Lock */}
        {onLock && (
          <NavBtn onClick={onLock} title="Lock Screen" iconOnly>
            <LockKeyhole style={{ width: 14, height: 14 }} />
          </NavBtn>
        )}

      </div>
    </header>
  );
};
