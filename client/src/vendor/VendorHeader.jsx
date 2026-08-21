import { useState } from "react";
import {
  LayoutDashboard, Users, ClipboardList, LogOut, Menu, X, ChevronRight, Sparkles, User, Settings
} from "lucide-react";
import { useUserStore } from "../services/userStore";

const NAV_ITEMS = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard, path: "/vendor/dashboard" },
  { id: "onboarding", label: "Onboarding Requests", icon: ClipboardList, path: "/vendor/onboarding" },
  { id: "linguists", label: "Linguist Database", icon: Users, path: "/vendor/linguists" },
];

export function VendorHeader({ currentScreen, onNavigate, onOpenSettings }) {
  const { user, logout } = useUserStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    onNavigate("/vendor/login");
  };

  const handleNav = (path) => {
    onNavigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-xl px-6 lg:px-8 flex items-center justify-between shadow-xs shrink-0 select-none">
      
      {/* Left: Brand Identity & Breadcrumb */}
      <div className="flex items-center gap-6">
        <div 
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => handleNav("/vendor/dashboard")}
          title="Centroid Vendor Portal"
        >
          <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
            <Users size={15} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-normal tracking-tight text-[var(--text-primary)]">
              Centroid
            </span>
            <span className="text-[var(--text-muted)] font-light text-xs">/</span>
            <span className="text-xs font-semibold text-indigo-400">
              Vendor Portal
            </span>
          </div>
        </div>

        {/* Desktop Nav Items */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.path)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent"
                }`}
              >
                <Icon size={14} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2">
        {/* Quick Link back to CAT Workspace */}
        <a
          href="/"
          className="h-8 px-2.5 rounded-lg bg-[var(--bg-hover)] hover:bg-indigo-600/10 text-[var(--text-secondary)] hover:text-indigo-400 flex items-center gap-1.5 transition-colors border border-[var(--border-subtle)] hover:border-indigo-500/20 text-xs font-medium"
          title="Open Translation Workspace"
        >
          <Sparkles size={13} className="text-indigo-400" />
          <span className="hidden sm:inline">CAT Editor</span>
        </a>

        <div className="h-4 w-px bg-[var(--border-subtle)] mx-1 hidden sm:block" />

        {/* User profile tag */}
        <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]">
          <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold">
            {(user?.name || user?.email || "V")[0].toUpperCase()}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-[var(--text-primary)] max-w-[120px] truncate">
              {user?.name || user?.email?.split("@")[0]}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase">
              {user?.role || "vendor"}
            </span>
          </div>
        </div>

        {/* General Settings Button */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="h-8 w-8 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer border border-transparent hover:border-[var(--border-subtle)]"
            title="General Workspace Settings"
          >
            <Settings size={15} />
          </button>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="h-8 w-8 rounded-lg hover:bg-rose-500/10 text-[var(--text-secondary)] hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer border border-transparent hover:border-rose-500/20"
          title="Sign Out"
        >
          <LogOut size={15} />
        </button>

        {/* Mobile menu trigger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden h-8 w-8 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors border border-[var(--border-subtle)]"
        >
          {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-14 left-0 right-0 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl p-3 space-y-1 z-40">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.path)}
                className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon size={14} />
                  <span>{item.label}</span>
                </div>
                <ChevronRight size={13} className="text-[var(--text-muted)]" />
              </button>
            );
          })}
          <div className="border-t border-[var(--border-subtle)] pt-2 mt-2 space-y-1">
            {onOpenSettings && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenSettings();
                }}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <Settings size={14} />
                <span>General Settings</span>
              </button>
            )}
            <a
              href="/"
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium text-indigo-400 hover:bg-indigo-600/10 transition-colors"
            >
              <Sparkles size={14} />
              <span>Go to CAT Workspace</span>
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
