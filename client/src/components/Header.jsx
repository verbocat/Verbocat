import { LANGUAGES } from "../constants/languages.js";
import { 
  LayoutDashboard, 
  Folder, 
  BookOpen, 
  Users, 
  Settings as SettingsIcon, 
  Sun, 
  Moon, 
  LogOut, 
  Plus,
  Lock,
  LockKeyhole
} from "lucide-react";

const SidebarButton = ({ children, className = "", isActive = false, ...props }) => (
  <button
    {...props}
    className={`w-full flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
      isActive 
        ? "bg-violet-950/40 text-violet-300 border-l-2 border-violet-500/80 shadow-inner" 
        : "text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
    } ${className}`}
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
  isSidebar = false,
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
  onOpenSettings, // New Settings trigger callback
  userRole,
  onOpenAdmin,
  creditsAllowed,
  creditsConsumed,
  onLogout,
  onUpload // File uploader trigger
}) => {
  const isManager = userRole === "admin" || userRole === "manager";
  
  // ========================================================
  // 1. SIDEBAR MODE (Left-oriented navigation control panel)
  // ========================================================
  if (isSidebar) {
    return (
      <aside className="w-64 border-r border-white/5 flex flex-col justify-between shrink-0 p-5 min-h-0 bg-[#05060b] shadow-[4px_0_24px_rgba(0,0,0,0.3)] select-none">
        
        {/* Top Section */}
        <div className="space-y-6 flex-1 flex flex-col min-h-0 overflow-y-auto pr-0.5 custom-scrollbar">
          
          {/* Logo Brand Row */}
          <div className="flex items-center gap-3 pb-2 select-none">
            {/* Custom Outline Cat SVG */}
            <div className="h-8 w-8 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 100 100" className="w-7 h-7 text-violet-500" fill="none" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M 22,38 L 22,12 L 48,28" />
                <path d="M 78,38 L 78,12 L 52,28" />
                <path d="M 22,38 C 22,64 32,80 50,80 C 68,80 78,64 78,38" />
                <ellipse cx="38" cy="48" rx="4.5" ry="5.5" fill="currentColor" />
                <ellipse cx="62" cy="48" rx="4.5" ry="5.5" fill="currentColor" />
                <polygon points="46,58 54,58 50,62" fill="currentColor" />
                <path d="M 44,68 C 47,72 50,72 50,68 Q 50,72 56,68" strokeWidth="4" />
              </svg>
            </div>
            <span className="text-lg font-black tracking-tight text-white font-sans">
              VerboCat
            </span>
          </div>

          {/* New Project Upload Button */}
          <div>
            <label className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 py-3 px-4 text-xs font-bold text-white shadow-lg shadow-violet-500/10 hover:shadow-violet-500/20 cursor-pointer transition-all duration-300 hover:scale-[1.01] active:scale-[0.98]">
              <Plus className="w-4.5 h-4.5" />
              <span>New Project</span>
              <input type="file" onChange={onUpload} className="hidden" />
            </label>
          </div>

          {/* Navigation Items (WORKSPACE Section) */}
          <div className="space-y-1">
            <span className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-neutral-500 block mb-3 px-3">
              WORKSPACE
            </span>

            <SidebarButton isActive={true}>
              <Folder className="w-4 h-4 text-violet-400" />
              <span>Projects</span>
            </SidebarButton>

            <SidebarButton isActive={false} onClick={onOpenGlossary}>
              <BookOpen className="w-4 h-4 text-neutral-500" />
              <span>Glossary</span>
            </SidebarButton>

            <SidebarButton 
              isActive={false} 
              onClick={isManager && onOpenAdmin ? onOpenAdmin : undefined}
              disabled={!isManager}
            >
              <Users className="w-4 h-4 text-neutral-500" />
              <span>Team</span>
            </SidebarButton>

            <SidebarButton isActive={false} onClick={onOpenSettings}>
              <SettingsIcon className="w-4 h-4 text-neutral-500" />
              <span>Settings</span>
            </SidebarButton>
          </div>

        </div>

        {/* Sidebar Footer Operations */}
        <div className="pt-4 border-t border-white/5 space-y-1.5 shrink-0">
          
          {/* Workspace Lock Lockbox */}
          {onLock && (
            <SidebarButton onClick={onLock} className="text-neutral-500 hover:text-neutral-300">
              <LockKeyhole className="w-4 h-4 text-neutral-500" />
              <span>Lock Screen</span>
            </SidebarButton>
          )}

          {/* Theme Switcher Toggle */}
          <SidebarButton onClick={onToggleDarkMode}>
            {darkMode ? (
              <>
                <Sun className="w-4 h-4 text-neutral-500" />
                <span>Switch to Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-neutral-500" />
                <span>Switch to Dark</span>
              </>
            )}
          </SidebarButton>

          {/* Log Out */}
          <SidebarButton onClick={onLogout} className="hover:text-rose-400 hover:bg-rose-950/10">
            <LogOut className="w-4 h-4 text-neutral-500" />
            <span>Log Out</span>
          </SidebarButton>
        </div>
      </aside>
    );
  }

  // ========================================================
  // 2. HORIZONTAL COMPACT NAVBAR MODE (Empty workspace header)
  // ========================================================
  return (
    <header className="sticky top-0 z-45 px-4 pt-4 sm:px-6 lg:px-8 bg-transparent">
      <div className={`mx-auto w-full rounded-[24px] border backdrop-blur-xl overflow-hidden transition-all duration-300 ${theme.shell}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          
          {/* Logo */}
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 100 100" className="w-6.5 h-6.5 text-violet-500" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 22,38 L 22,12 L 48,28" />
              <path d="M 78,38 L 78,12 L 52,28" />
              <path d="M 22,38 C 22,64 32,80 50,80 C 68,80 78,64 78,38" />
              <ellipse cx="38" cy="48" rx="4.5" ry="5.5" fill="currentColor" />
              <ellipse cx="62" cy="48" rx="4.5" ry="5.5" fill="currentColor" />
              <polygon points="46,58 54,58 50,62" fill="currentColor" />
              <path d="M 44,68 C 47,72 50,72 50,68 C 50,72 53,72 56,68" strokeWidth="4" />
            </svg>
            <span className="text-md font-extrabold tracking-wider text-white">
              VerboCat
            </span>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-2">
            
            {/* Admin control panel link */}
            {isManager && onOpenAdmin && (
              <button
                onClick={onOpenAdmin}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-600/25 px-4 py-2.5 text-xs font-bold transition-all duration-200"
              >
                Admin Control
              </button>
            )}

            <button
              onClick={onOpenGlossary}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${theme.buttonSecondary}`}
            >
              Glossary
            </button>
            
            <label className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${theme.buttonSecondary}`}>
              <Plus className="w-3.5 h-3.5" />
              <span>Load Project</span>
              <input
                type="file"
                accept=".json"
                onChange={onLoadProject}
                className="hidden"
              />
            </label>

            <button
              onClick={onToggleDarkMode}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 transition ${theme.buttonSecondary}`}
            >
              {darkMode ? <Sun className="w-4 h-4 text-neutral-400" /> : <Moon className="w-4 h-4 text-neutral-400" />}
            </button>

            <button
              onClick={onLogout}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${theme.buttonSecondary}`}
            >
              Log Out
            </button>
          </div>
          
        </div>
      </div>
    </header>
  );
};
