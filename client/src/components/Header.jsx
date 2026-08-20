import { useState } from "react";
import { LANGUAGES } from "../constants/languages.js";
import { LanguageFlag } from "./LanguageFlag.jsx";
import { CollaboratorsList } from "./CollaboratorsList.jsx";
import { fetchMySpaces, joinSpace } from "../services/api.js";
import {
  BookOpen, Users, Settings as SettingsIcon,
  Plus, LockKeyhole, Sliders, ChevronDown, Check,
  ChevronRight, FileText, LayoutDashboard, Sparkles, LogOut,
  RefreshCw, CheckCircle2, AlertCircle
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
  collaborators, onOpenShare, onTeleport, dbSaveStatus = "saved"
}) => {
  const [showSpaceMenu, setShowSpaceMenu] = useState(false);
  const [joinedSpaces, setJoinedSpaces] = useState([]);
  const [joinSlug, setJoinSlug] = useState("");
  const [joining, setJoining] = useState(false);

  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const hasFile = segmentsCount > 0;
  const srcLang = LANGUAGES.find(l => l.code === sourceLanguage);
  const tgtLang = LANGUAGES.find(l => l.code === targetLanguage);

  return (
    <header className="topbar shadow-xs">

      {/* Brand Logo & Name */}
      <div 
        className="topbar-brand cursor-pointer hover:opacity-90 transition-opacity flex items-center gap-2"
        onClick={() => window.location.href = "/"}
        title="Go to Home"
      >
        <div className="h-7 w-7 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-indigo-400 flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
          <Sparkles className="h-4 w-4 text-white animate-pulse" />
        </div>
        <div className="flex flex-col">
          <span className="topbar-brand-name font-normal tracking-tight text-sm bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent leading-none">
            Centroid
          </span>
          <span className="text-[9px] font-normal text-indigo-300/80 tracking-normal mt-0.5">
            Next-Gen Enterprise Language Intelligence Platform
          </span>
        </div>
        {(() => {
          const spaceParam = new URLSearchParams(window.location.search).get("space");
          let subdomain = spaceParam || "";
          if (!subdomain) {
            const hostname = window.location.hostname;
            const parts = hostname.split(".");
            if (parts.length >= 4) subdomain = parts[0];
            else if (parts.length === 3 && parts[1] === "lvh" && parts[2] === "me") subdomain = parts[0];
            else if (parts.length === 2 && parts[1] === "localhost") subdomain = parts[0];
          }

          const isCustomSpace = subdomain && !["www", "app", "centroid", "verbolabs", "localhost"].includes(subdomain.toLowerCase());

          return (
            <div className="ml-2 select-none">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-[10px] font-black uppercase text-indigo-300 tracking-wider font-mono">
                {isCustomSpace ? `${subdomain} workspace` : "VerboLabs Root"}
              </span>
            </div>
          );
        })()}
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
                <span className="flex items-center gap-1.5"><LanguageFlag code={srcLang.code} /> <span>{srcLang.code.toUpperCase()}</span></span>
                <ChevronRight style={{ width: 11, height: 11, opacity: 0.5, flexShrink: 0 }} />
                <span className="flex items-center gap-1.5"><LanguageFlag code={tgtLang.code} /> <span>{tgtLang.code.toUpperCase()}</span></span>
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
            <input type="file" accept=".pdf,.docx,.pptx,.xlsx,.txt,.html,.htm,.xlf,.xliff,.sdlxliff,.srt" onChange={onUpload} className="hidden" />
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

        {/* Logout */}
        {onLogout && (
          <button
            onClick={onLogout}
            title="Log Out"
            className="p-1.5 rounded-xl text-[var(--text-secondary)] hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
          >
            <LogOut style={{ width: 15, height: 15 }} />
          </button>
        )}

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

