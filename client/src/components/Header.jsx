import { LANGUAGES } from "../constants/languages.js";
import { CollaboratorsList } from "./CollaboratorsList.jsx";
import {
  BookOpen, Users, Settings as SettingsIcon,
  Plus, LockKeyhole, Sliders,
  ChevronRight, FileText, LayoutDashboard, Sparkles
} from "lucide-react";

const NavBtn = ({ children, onClick, disabled = false, title = "", iconOnly = false, active = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`${iconOnly ? "nav-btn-icon" : "nav-btn"} ${active ? "active" : ""}`}
  >
    {children}
  </button>
);

export const Header = ({
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
    <header className="topbar shadow-xs">

      {/* Brand Logo & Name */}
      <div className="topbar-brand cursor-pointer hover:opacity-90 transition-opacity">
        <div className="h-7 w-7 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-indigo-400 flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
          <Sparkles className="h-4 w-4 text-white animate-pulse" />
        </div>
        <span className="topbar-brand-name font-black tracking-tight text-sm bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
          Centroid
        </span>
      </div>

      <div className="topbar-divider" />

      {/* Live Breadcrumb & Language Context */}
      {hasFile ? (
        <div className="topbar-crumb">
          <FileText style={{ width: 13, height: 13, color: "var(--accent)", flexShrink: 0 }} />
          <span className="topbar-filename font-bold" title={fileName}>{fileName}</span>
          {fileExtension && (
            <span className="topbar-badge font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {fileExtension.replace(".", "").toUpperCase()}
            </span>
          )}
          {srcLang && tgtLang && (
            <>
              <span className="topbar-sep-dot">·</span>
              <div className="topbar-langpair px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-semibold">
                <span className="flex items-center gap-1">{srcLang.flag} {srcLang.code.toUpperCase()}</span>
                <ChevronRight style={{ width: 11, height: 11, opacity: 0.5, flexShrink: 0 }} />
                <span className="flex items-center gap-1">{tgtLang.flag} {tgtLang.code.toUpperCase()}</span>
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ flex: 1 }} />
      )}

      {/* Right Navigation Actions */}
      <div className="topbar-actions">

        {/* Active Collaborators */}
        {hasFile && collaborators && collaborators.length > 0 && (
          <CollaboratorsList collaborators={collaborators} onTeleport={onTeleport} />
        )}

        {/* Share Button */}
        {hasFile && onOpenShare && (
          <NavBtn onClick={onOpenShare} title="Share Workspace">
            <Users style={{ width: 13, height: 13 }} />
            <span>Share</span>
          </NavBtn>
        )}

        {/* Open File Button when in blank state */}
        {!hasFile && (
          <label className="btn-cta btn-cta-premium flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all cursor-pointer">
            <Plus style={{ width: 14, height: 14 }} />
            <span>Open Document</span>
            <input type="file" onChange={onUpload} className="hidden" />
          </label>
        )}

        {/* Glossary Tool */}
        <NavBtn onClick={onOpenGlossary} title="Glossary Database">
          <BookOpen style={{ width: 13, height: 13 }} />
          <span>Glossary</span>
        </NavBtn>

        {/* Context Settings */}
        <NavBtn onClick={onOpenContext} title="Translation Prompt Context">
          <Sliders style={{ width: 13, height: 13 }} />
          <span>Context</span>
        </NavBtn>

        {/* Admin Dashboard Pill */}
        {isAdmin && onOpenAdmin && (
          <NavBtn onClick={onOpenAdmin} title="Admin Control Panel">
            <LayoutDashboard style={{ width: 13, height: 13 }} className="text-indigo-400" />
            <span className="text-indigo-300 font-bold">Admin Panel</span>
          </NavBtn>
        )}

        <div className="topbar-divider" />

        {/* Global Settings */}
        <button
          onClick={onOpenSettings}
          title="Workspace Settings"
          className="p-1.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] border border-transparent hover:border-[var(--border-subtle)] transition-all cursor-pointer"
        >
          <SettingsIcon style={{ width: 15, height: 15 }} />
        </button>

        {/* Screen Lock */}
        {onLock && (
          <NavBtn onClick={onLock} title="Lock Screen" iconOnly>
            <LockKeyhole style={{ width: 14, height: 14 }} />
          </NavBtn>
        )}

      </div>
    </header>
  );
};

