import { LANGUAGES } from "../constants/languages.js";
import { CollaboratorsList } from "./CollaboratorsList.jsx";
import { useChatStore } from "../services/chatStore.js";
import {
  BookOpen, Users, Settings as SettingsIcon,
  LogOut, Plus, LockKeyhole, Sliders,
  ChevronRight, FileText, LayoutDashboard, BarChart3,
  MessageCircle, Layers
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
  onRelinkHtml, onImportXliff, onOpenContext, onOpenSettings, onOpenAnalysis,
  userRole, onOpenAdmin, creditsAllowed, creditsConsumed, onLogout, onUpload,
  collaborators, onOpenShare, onTeleport
}) => {
  const isAdmin = userRole === "admin";
  const hasFile = segmentsCount > 0;
  const srcLang = LANGUAGES.find(l => l.code === sourceLanguage);
  const tgtLang = LANGUAGES.find(l => l.code === targetLanguage);
  const { totalUnread } = useChatStore();

  return (
    <header className="topbar">

      {/* Brand */}
      <div className="topbar-brand" onClick={() => onNavigate && onNavigate("/")} style={{ cursor: "pointer" }}>
        <img 
          src={darkMode ? "/centroid_final_LOGO_dark.png" : "/centroid_final_LOGO_light.png"} 
          alt="Centroid" 
          style={{ height: 26, width: "auto", objectFit: "contain" }} 
        />
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

        {/* Chat */}
        <NavBtn onClick={() => onNavigate && onNavigate("/chat")} title="Chat Workspace">
          <div className="relative flex items-center gap-1">
            <MessageCircle style={{ width: 13, height: 13 }} />
            <span>Chat</span>
            {totalUnread > 0 && (
              <span className="absolute -top-1.5 -right-2.5 w-2 h-2 rounded-full bg-rose-500 shadow-sm animate-pulse" />
            )}
          </div>
        </NavBtn>

        {/* Relink Page */}
        <NavBtn onClick={() => onNavigate && onNavigate("/relink")} title="Relinking Page">
          <div className="flex items-center gap-1">
            <Layers style={{ width: 13, height: 13, color: "#6366f1" }} />
            <span>Relink Page</span>
          </div>
        </NavBtn>

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

        {/* Analysis */}
        {hasFile && onOpenAnalysis && (
          <NavBtn onClick={onOpenAnalysis} title="TM Analysis">
            <BarChart3 style={{ width: 13, height: 13 }} />
            <span>Analysis</span>
          </NavBtn>
        )}

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
