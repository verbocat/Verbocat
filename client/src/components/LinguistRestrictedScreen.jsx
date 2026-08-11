import React, { useState } from "react";
import { 
  ShieldCheck, LogOut, FileText, Lock, CheckCircle2, 
  Sparkles, RefreshCw, Mail, ArrowRight, User, Clock, 
  ExternalLink, Layers, Headphones, Cpu, BookOpen, Key
} from "lucide-react";

export function LinguistRestrictedScreen({ user, onLogout }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState("Just now");

  // Derive User Name and Email
  const userName = user?.name || user?.full_name || user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Linguist";
  const userEmail = user?.email || "linguist@verbolabs.com";

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastRefreshed(`Refreshed at ${time}`);
    }, 1000);
  };

  return (
    <div className="min-h-dvh h-auto w-full skeuo-matte-bg text-slate-900 flex flex-col justify-between items-center p-4 sm:p-6 lg:p-10 font-sans selection:bg-indigo-500/20 selection:text-indigo-900 relative overflow-x-hidden">
      
      {/* Soft Ambient Light Aura */}
      <div 
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[700px] rounded-full blur-[160px] opacity-40 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(99, 102, 241, 0.14) 0%, rgba(16, 185, 129, 0.06) 50%, transparent 70%)"
        }}
      />

      {/* TOP HEADER - FULL WIDTH */}
      <header className="w-full max-w-[1400px] shrink-0 flex items-center justify-between py-3 border-b border-slate-200/80 mb-6 z-20">
        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <img 
            src="/centroid_final_LOGO_light.png" 
            alt="Centroid Logo" 
            className="h-8 sm:h-10 w-auto object-contain drop-shadow-xs"
          />
          <span className="hidden sm:inline-block text-xs font-semibold uppercase tracking-wider text-slate-400 border-l border-slate-300 pl-3">
            Linguist Workspace Portal
          </span>
        </div>

        {/* User Identity & Logout Button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full skeuo-metal-panel text-xs">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-slate-800">{userName}</span>
            <span className="text-slate-400 hidden sm:inline">({userEmail})</span>
          </div>

          <button
            onClick={onLogout}
            className="skeuo-metal-panel hover:bg-slate-200/60 text-slate-700 hover:text-slate-900 text-xs font-semibold px-4 py-2 rounded-2xl flex items-center gap-2 cursor-pointer transition-all duration-200"
          >
            <LogOut className="h-4 w-4 text-rose-500" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* MAIN CONTENT HERO & FULL-WIDTH GRID */}
      <main className="w-full max-w-[1400px] my-auto py-2 flex-1 flex flex-col justify-center items-center z-20 space-y-6">
        
        {/* FULL-WIDTH HERO HEADER BANNER */}
        <div className="w-full skeuo-metal-panel rounded-3xl p-6 sm:p-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative overflow-hidden">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-200/80 text-xs font-semibold text-indigo-700">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Account Created & Activated</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Welcome to your Linguist Workspace, <span className="text-indigo-600">{userName}</span>!
            </h1>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
              Your account (<strong className="text-slate-900">{userEmail}</strong>) is active and ready. You have direct access to your assigned translation projects, specialized terminology, and dedicated workspace links provided by your Project Manager.
            </p>
          </div>

          {/* Quick Metrics Badge */}
          <div className="flex items-center shrink-0">
            <div className="bg-white/80 border border-slate-200/80 rounded-2xl px-5 py-3 text-center space-y-0.5 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">Status</span>
              <span className="text-xs font-extrabold text-emerald-600 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Active & Ready
              </span>
            </div>
          </div>

        </div>

        {/* FULL-WIDTH 4-COLUMN GRID LAYOUT */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* COLUMN 1: ACCOUNT & SECURITY PROFILE */}
          <div className="skeuo-metal-panel rounded-3xl p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                <Key className="w-6 h-6 text-indigo-600" />
              </div>
              
              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  Account Credentials
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Verified security profile.
                </p>
              </div>

              <div className="space-y-2.5 text-xs pt-1">
                <div className="bg-slate-100/70 border border-slate-200/80 rounded-2xl p-3 space-y-1">
                  <span className="text-[10px] text-slate-400 font-semibold block uppercase">User Identifier</span>
                  <span className="font-bold text-slate-800 block truncate">{userName}</span>
                </div>

                <div className="bg-slate-100/70 border border-slate-200/80 rounded-2xl p-3 space-y-1">
                  <span className="text-[10px] text-slate-400 font-semibold block uppercase">Email Address</span>
                  <span className="font-bold text-slate-800 block truncate">{userEmail}</span>
                </div>

                <div className="bg-slate-100/70 border border-slate-200/80 rounded-2xl p-3 space-y-1">
                  <span className="text-[10px] text-slate-400 font-semibold block uppercase">Access Scope</span>
                  <span className="font-semibold text-indigo-700 block">Dedicated Project Workspace</span>
                </div>
              </div>
            </div>


            <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Session Status</span>
              <span className="font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                Authenticated
              </span>
            </div>
          </div>

          {/* COLUMN 2 & 3 (WIDE CENTER): HOW TO START WORKING INSTRUCTION GUIDE */}
          <div className="skeuo-metal-panel rounded-3xl p-6 sm:p-8 flex flex-col justify-between space-y-6 md:col-span-2 lg:col-span-2 bg-gradient-to-br from-white via-indigo-50/20 to-slate-50 border-indigo-200/90">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-xs">
                  <FileText className="w-6 h-6 text-emerald-600" />
                </div>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-100/70 px-3.5 py-1 rounded-full border border-emerald-200">
                  Step-by-Step Instructions
                </span>
              </div>

              <div>
                <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  How to Start Working
                </h3>
                <p className="text-xs sm:text-sm text-slate-700 font-medium mt-1.5 leading-relaxed bg-emerald-50/70 border border-emerald-200/80 p-3.5 rounded-2xl">
                  <strong className="text-emerald-800">Direct Access Requirement:</strong> Please open the specific document or job link sent by your Project Manager to enter your dedicated translation editor.
                </p>
              </div>

              {/* 3-STEP PROCESS CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 space-y-1.5 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">1</span>
                    <span>Check Email</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    Your Project Manager dispatches direct job assignment URLs to your inbox.
                  </p>
                </div>

                <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 space-y-1.5 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">2</span>
                    <span>Click Job Link</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    Opens your assigned document workspace inside Centroid's CAT Editor.
                  </p>
                </div>

                <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 space-y-1.5 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">3</span>
                    <span>Translate & Deliver</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    Leverage real-time TM matches, Glossaries, and AI auto-suggest.
                  </p>
                </div>
              </div>

              {/* EDITOR CAPABILITIES FOOTER PILLS */}
              <div className="flex flex-wrap items-center gap-2 pt-2 text-[11px] font-semibold text-slate-600">
                <span className="text-slate-400 font-normal">Included Tools:</span>
                <span className="bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-indigo-600" /> Translation Memory
                </span>
                <span className="bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 flex items-center gap-1">
                  <BookOpen className="w-3 h-3 text-emerald-600" /> Glossaries
                </span>
                <span className="bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-purple-600" /> AI Suggestions
                </span>
              </div>
            </div>
          </div>

          {/* COLUMN 4: LIVE ASSIGNMENT RADAR & SUPPORT */}
          <div className="skeuo-metal-panel rounded-3xl p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="relative flex items-center justify-center shrink-0">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center text-indigo-600">
                    <Clock className="w-6 h-6 text-indigo-600" />
                  </div>
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600"></span>
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{lastRefreshed}</span>
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  Assignment Radar
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                  Awaiting active job link dispatch from your Project Manager.
                </p>
              </div>

              <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                  <Headphones className="w-4 h-4 text-indigo-600" />
                  <span>Need Support?</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                  If you haven't received your assignment link, contact your Project Manager directly.
                </p>
              </div>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full skeuo-push-btn text-white font-bold rounded-2xl py-3 px-5 text-xs flex items-center justify-center gap-2 cursor-pointer transition-all duration-200"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              <span>{isRefreshing ? "Checking..." : "Refresh Assignment Status"}</span>
            </button>
          </div>

        </div>

      </main>

      {/* FOOTER - FULL WIDTH */}
      <footer className="w-full max-w-[1400px] shrink-0 pt-6 pb-2 text-center text-xs text-slate-400 border-t border-slate-200/60 z-20 flex flex-col sm:flex-row items-center justify-between gap-2 font-medium">
        <span>VerboLabs CAT Platform · Enterprise Linguist Engine v2.4</span>
        <span className="flex items-center gap-1.5 text-slate-500">
          <Lock className="w-3.5 h-3.5 text-indigo-500" />
          <span>Encrypted Session: <strong className="text-slate-700">{userEmail}</strong></span>
        </span>
      </footer>

    </div>
  );
}
