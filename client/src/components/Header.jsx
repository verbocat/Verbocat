import { LANGUAGES } from "../constants/languages.js";
import { Icons } from "./Icons.jsx";

const SidebarButton = ({ children, className = "", ...props }) => (
  <button
    {...props}
    className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
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
  userRole,
  onOpenAdmin,
  creditsAllowed,
  creditsConsumed,
  onLogout
}) => {
  
  // Render as LEFT-ORIENTED SIDEBAR Control Panel
  if (isSidebar) {
    const isOffice = userRole === "office";
    const isAdmin = userRole === "admin" || userRole === "manager";
    
    return (
      <aside className={`w-64 border-r flex flex-col justify-between shrink-0 p-4 min-h-0 backdrop-blur-xl transition-all duration-300 ${theme.shell}`}>
        <div className="space-y-5 flex-1 flex flex-col min-h-0 overflow-y-auto pr-0.5">
          
          {/* Logo & Connection State */}
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1.5 rounded-xl text-white font-black text-xs tracking-wider shadow-md shadow-indigo-500/15">
              <span>VerboCat</span>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
            </div>
            
            {currentProvider && (
              <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-400 animate-pulse">
                {currentProvider}
              </span>
            )}
          </div>

          {/* Active File Details */}
          <div>
            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-500 select-none block">Active File</span>
            <div className="text-xs font-black text-slate-200 mt-1 truncate" title={fileName}>
              {fileName}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 font-mono select-none">{fileExtension} format</div>
          </div>

          {/* User Role Badge */}
          <div className="bg-slate-950/35 border border-white/5 rounded-xl p-2.5 flex items-center justify-between gap-2">
            <div>
              <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 block select-none">Role</span>
              <span className="text-[10px] font-bold text-indigo-400 capitalize">
                {userRole?.replace("_", " ")}
              </span>
            </div>
            {onLock && (
              <button
                onClick={onLock}
                className="rounded-lg p-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all active:scale-95"
                title="Lock Workspace"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </button>
            )}
          </div>

          {/* Admin Control Button (visible only in sidebar if Admin/Manager) */}
          {isAdmin && onOpenAdmin && (
            <div className="pt-3 border-t border-white/5">
              <SidebarButton onClick={onOpenAdmin} className="bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-600/25">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                Admin Control
              </SidebarButton>
            </div>
          )}

        </div>

        {/* Sidebar Footer: Mode Toggle, Close Project */}
        <div className="pt-3 border-t border-white/5 space-y-2 shrink-0">
          <SidebarButton onClick={onToggleDarkMode} className={theme.buttonSecondary}>
            {darkMode ? <Icons.Sun className="w-3.5 h-3.5" /> : <Icons.Moon className="w-3.5 h-3.5" />}
            {darkMode ? "Switch to Light" : "Switch to Dark"}
          </SidebarButton>

          <SidebarButton onClick={onLogout} className={theme.buttonSecondary}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Log Out
          </SidebarButton>
        </div>
      </aside>
    );
  }

  // Render as COMPACT HORIZONTAL TOP NAVBAR (when empty state)
  return (
    <header className="sticky top-0 z-40 px-4 pt-4 sm:px-6 lg:px-8">
      <div
        className={`mx-auto w-full rounded-[24px] border backdrop-blur-xl overflow-hidden transition-all duration-300 ${theme.shell}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 rounded-xl text-white font-black text-sm tracking-wider shadow-md shadow-indigo-500/15">
              <span>VerboCat</span>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            
          </div>

          <div className="flex items-center gap-2">
            
            {/* Admin Dashboard trigger link */}
            {(userRole === "admin" || userRole === "manager") && onOpenAdmin && (
              <button
                onClick={onOpenAdmin}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-600/25 px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5"
              >
                Admin Control
              </button>
            )}

            <button
              onClick={onOpenGlossary}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 ${theme.buttonSecondary}`}
            >
              Glossary
            </button>
            <label
              className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 ${theme.buttonSecondary}`}
            >
              <Icons.FileJson />
              Load Project
              <input
                type="file"
                accept=".json"
                onChange={onLoadProject}
                className="hidden"
              />
            </label>

            <button
              onClick={onToggleDarkMode}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 transition-all duration-200 hover:-translate-y-0.5 ${theme.buttonSecondary}`}
            >
              {darkMode ? <Icons.Sun /> : <Icons.Moon />}
              <span className="text-sm font-semibold hidden sm:inline">{darkMode ? "Light" : "Dark"}</span>
            </button>

            <button
              onClick={onLogout}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 transition-all duration-200 hover:-translate-y-0.5 ${theme.buttonSecondary}`}
            >
              Log Out
            </button>
            
            {onLock && (
              <button
                onClick={onLock}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950/20 hover:bg-slate-950/40 border border-white/5 text-slate-300 hover:text-white px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5"
              >
                Lock
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
