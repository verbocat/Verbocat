import { useState } from "react";
import { X, Sun, Moon, LogOut, Sliders, User, ShieldCheck, HelpCircle } from "lucide-react";

export const SettingsModal = ({
  show,
  onClose,
  darkMode,
  onToggleDarkMode,
  onLogout,
  userRole,
  userEmail,
  theme
}) => {
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true);
  const [fontSize, setFontSize] = useState("medium"); // small, medium, large
  const [autoPropagate, setAutoPropagate] = useState(true);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
      
      {/* Settings Dialog Card */}
      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0c12]/95 p-6 md:p-8 shadow-2xl text-white">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/5 select-none">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-violet-600/10 border border-violet-500/25 flex items-center justify-center text-violet-400">
              <Sliders className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold tracking-wide">Workspace Settings</h3>
              <p className="text-[10px] text-neutral-400 font-mono mt-0.5">VERBOCAT_CONFIG_v1.2</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Tabs / Sections */}
        <div className="mt-6 space-y-6">
          
          {/* Section 1: Appearance */}
          <div className="space-y-3">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-neutral-500 font-mono block select-none">
              Appearance
            </span>
            <div className="bg-neutral-950/40 border border-white/5 rounded-xl p-4 flex items-center justify-between">
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-white">Interface Theme</h4>
                <p className="text-[10px] text-neutral-400 mt-1">Switch between clean light mode and deep space dark mode.</p>
              </div>
              <button
                type="button"
                onClick={onToggleDarkMode}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-neutral-900/60 px-3.5 py-2 text-xs font-bold text-neutral-200 hover:text-white hover:bg-white/5 transition-all cursor-pointer active:scale-95 shadow-sm"
              >
                {darkMode ? (
                  <>
                    <Sun className="h-4 w-4 text-amber-400" />
                    <span>Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4 text-violet-400" />
                    <span>Dark Mode</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Section 2: Editor Preferences */}
          <div className="space-y-3">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-neutral-500 font-mono block select-none">
              Editor Preferences
            </span>
            <div className="bg-neutral-950/40 border border-white/5 rounded-xl p-4 space-y-4">
              
              {/* Option: Autocomplete */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Glossary Autocomplete</h4>
                  <p className="text-[9px] text-neutral-400 mt-0.5">Show terminology suggestions while typing.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutocompleteEnabled(!autocompleteEnabled)}
                  className={`w-10 h-6 rounded-full p-1 transition-all duration-300 cursor-pointer ${
                    autocompleteEnabled ? 'bg-violet-600' : 'bg-neutral-800'
                  }`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transition-transform duration-300 ${
                    autocompleteEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Option: Auto Propagate */}
              <div className="flex items-center justify-between border-t border-white/5 pt-3">
                <div>
                  <h4 className="text-xs font-bold text-white">Auto-Propagate Segments</h4>
                  <p className="text-[9px] text-neutral-400 mt-0.5">Automatically apply duplicates across identical source texts.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoPropagate(!autoPropagate)}
                  className={`w-10 h-6 rounded-full p-1 transition-all duration-300 cursor-pointer ${
                    autoPropagate ? 'bg-violet-600' : 'bg-neutral-800'
                  }`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transition-transform duration-300 ${
                    autoPropagate ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Option: Font Size */}
              <div className="flex items-center justify-between border-t border-white/5 pt-3">
                <div>
                  <h4 className="text-xs font-bold text-white">Editor Font Size</h4>
                  <p className="text-[9px] text-neutral-400 mt-0.5">Set the default text size for translation cards.</p>
                </div>
                <div className="flex bg-neutral-900 border border-white/5 rounded-lg p-0.5">
                  {["small", "medium", "large"].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setFontSize(size)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold capitalize transition-all cursor-pointer ${
                        fontSize === size 
                          ? "bg-violet-600 text-white shadow-sm" 
                          : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* Section 3: Profile & Session Account */}
          <div className="space-y-3">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-neutral-500 font-mono block select-none">
              Account Session
            </span>
            <div className="bg-neutral-950/40 border border-white/5 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-neutral-900 border border-white/5 flex items-center justify-center text-neutral-400 shrink-0">
                  <User className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-extrabold text-white block truncate">
                    {userEmail || "anonymous@verbolabs.com"}
                  </span>
                  <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-wider block mt-0.5">
                    Role: {userRole || "translator"}
                  </span>
                </div>
              </div>
              
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-rose-700/10 border border-rose-500/20 px-4 py-2.5 text-xs font-bold text-rose-400 hover:bg-rose-600 hover:text-white transition-all cursor-pointer active:scale-95 shadow-md shadow-rose-950/5 shrink-0"
              >
                <LogOut className="h-4 w-4" />
                <span>Log Out</span>
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-white/5 flex items-center justify-between text-[8px] font-mono text-neutral-500 select-none">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            <span>SESSION_ENCRYPTED_SSL</span>
          </span>
          <span>SYSTEM_STABLE</span>
        </div>

      </div>

    </div>
  );
};
