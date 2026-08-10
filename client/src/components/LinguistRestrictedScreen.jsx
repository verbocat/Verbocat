import React from "react";
import { ShieldCheck, ExternalLink, LogOut, FileText, Lock } from "lucide-react";

export function LinguistRestrictedScreen({ user, onLogout }) {
  const userEmail = user?.email || "Linguist Account";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Dynamic Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg bg-slate-900/80 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-2xl text-center space-y-6">
        {/* Status Badge */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-500/10">
          <ShieldCheck className="w-8 h-8 text-indigo-400 animate-pulse" />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-white via-slate-200 to-indigo-200 bg-clip-text text-transparent">
            Account Created & Activated
          </h2>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
            Linguist Portal — VerboLabs CAT Platform
          </p>
        </div>

        {/* Message Container */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-5 text-left space-y-3 shadow-inner">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              Your account (<span className="text-indigo-300 font-semibold">{userEmail}</span>) is active. As a assigned Linguist, your access is restricted to specific translation workspaces assigned to you.
            </p>
          </div>
          <div className="border-t border-slate-800/60 pt-3 flex items-start gap-3">
            <FileText className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              <span className="text-emerald-400 font-semibold">How to start working:</span> Please open the specific document or job link sent by your Project Manager to enter your dedicated translation editor.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onLogout}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
