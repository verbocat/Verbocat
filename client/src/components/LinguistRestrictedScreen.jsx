import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, LogOut, FileText, Lock, CheckCircle2, 
  Sparkles, RefreshCw, Mail, ArrowRight, User, Clock, 
  ExternalLink, Layers, Headphones, Cpu, BookOpen, Key, Globe, Folder, Play
} from "lucide-react";
import { fetchAssignedDocuments } from "../services/api.js";

const LANGUAGE_NAMES = {
  ar: "Arabic (ar)",
  hi: "Hindi (hi)",
  es: "Spanish (es)",
  fr: "French (fr)",
  de: "German (de)",
  zh: "Chinese (zh)",
  ja: "Japanese (ja)",
  ru: "Russian (ru)",
  pt: "Portuguese (pt)",
  it: "Italian (it)",
  en: "English (en)",
  pa: "Punjabi (pa)",
  bn: "Bengali (bn)",
  ta: "Tamil (ta)",
  te: "Telugu (te)",
  mr: "Marathi (mr)",
  gu: "Gujarati (gu)",
  kn: "Kannada (kn)",
  ml: "Malayalam (ml)"
};

export function LinguistRestrictedScreen({ user, onLogout }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState("Just now");
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Derive User Name and Email
  const userName = user?.name || user?.full_name || user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Linguist";
  const userEmail = user?.email || "linguist@verbolabs.com";

  const loadAssignments = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const data = await fetchAssignedDocuments();
      setAssignments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load linguist assignments:", err);
      if (!isBackground) setAssignments([]);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    loadAssignments(false);
    const interval = setInterval(() => {
      loadAssignments(true);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAssignments();
    setIsRefreshing(false);
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setLastRefreshed(`Refreshed at ${time}`);
  };

  const getLanguageLabel = (code) => {
    if (!code) return "Hindi (hi)";
    const clean = String(code).toLowerCase().trim();
    return LANGUAGE_NAMES[clean] || `${clean.toUpperCase()} (${clean})`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "Just now";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch (_) {
      return "Just now";
    }
  };

  const openEditor = (item) => {
    const spaceParam = new URLSearchParams(window.location.search).get("space");
    const spaceSuffix = spaceParam ? `?space=${spaceParam}` : "";
    if (item.projectId && item.documentId && item.targetLang) {
      window.location.href = `/project/${item.projectId}/file/${item.documentId}/lang/${item.targetLang}${spaceSuffix}`;
    } else if (item.documentId) {
      window.location.href = `/?doc=${item.documentId}${spaceSuffix}`;
    }
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
              Your account (<strong className="text-slate-900">{userEmail}</strong>) is active and ready. Assigned files will appear directly in your <strong>Assignment Radar</strong> below with language details and direct editor launcher buttons.
            </p>
          </div>

          {/* Quick Metrics Badge */}
          <div className="flex items-center shrink-0 gap-3">
            <div className="bg-white/80 border border-slate-200/80 rounded-2xl px-5 py-3 text-center space-y-0.5 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">Assigned Jobs</span>
              <span className="text-sm font-extrabold text-indigo-600 flex items-center justify-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-500" /> {assignments.length} Files
              </span>
            </div>
            <div className="bg-white/80 border border-slate-200/80 rounded-2xl px-5 py-3 text-center space-y-0.5 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">Status</span>
              <span className="text-xs font-extrabold text-emerald-600 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Active & Ready
              </span>
            </div>
          </div> 

        </div>

        {/* FULL-WIDTH GRID LAYOUT: LEFT SIDEBAR + WIDE ASSIGNMENT RADAR HUB */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT SIDE PANEL (COL 1-4): CREDENTIALS & INSTRUCTIONS */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Account Credentials Card */}
            <div className="skeuo-metal-panel rounded-3xl p-6 flex flex-col justify-between space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs shrink-0">
                  <Key className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">Account Profile</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Verified Linguist Account</p>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="bg-slate-100/70 border border-slate-200/80 rounded-2xl p-3 space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">Identifier</span>
                  <span className="font-bold text-slate-800 truncate block">{userName}</span>
                </div>

                <div className="bg-slate-100/70 border border-slate-200/80 rounded-2xl p-3 space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">Email Address</span>
                  <span className="font-bold text-slate-800 truncate block">{userEmail}</span>
                </div>

                <div className="bg-slate-100/70 border border-slate-200/80 rounded-2xl p-3 space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">Access Scope</span>
                  <span className="font-semibold text-indigo-700 block">CAT Editor & Workspace</span>
                </div>
              </div>
            </div>

            {/* Support & Refresh Card */}
            <div className="skeuo-metal-panel rounded-3xl p-6 space-y-4">
              <div className="bg-indigo-50/70 border border-indigo-100/90 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                  <Headphones className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Project Coordinator Support</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  When a Project Coordinator grants you access to a file, it will appear live in your Assignment Radar. Click "Refresh" if a new job was recently assigned.
                </p>
              </div>

              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="w-full skeuo-push-btn text-white font-bold rounded-2xl py-3 px-5 text-xs flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 shadow-md"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>{isRefreshing ? "Scanning Radar..." : "Refresh Assignment Radar"}</span>
              </button>
            </div>

          </div>

          {/* RIGHT MAIN PANEL (COL 5-12): WIDE LIVE ASSIGNMENT RADAR HUB */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* ASSIGNMENT RADAR HEADER & HUB */}
            <div className="skeuo-metal-panel rounded-3xl p-6 sm:p-8 space-y-6 border-indigo-200/80 bg-gradient-to-br from-white via-slate-50 to-indigo-50/20">
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center shrink-0">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center text-indigo-600 shadow-xs">
                      <Clock className="w-6 h-6 text-indigo-600" />
                    </div>
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600"></span>
                    </span>
                  </div>

                  <div>
                    <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                      <span>Assignment Radar</span>
                      <span className="text-xs font-semibold px-3 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                        {assignments.length} {assignments.length === 1 ? "Job" : "Jobs"}
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Live dispatch radar for files assigned by Project Coordinators
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{lastRefreshed}</span>
                </div>
              </div>

              {/* ASSIGNMENT CARDS LIST */}
              {loading ? (
                <div className="py-12 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                  <p className="text-xs font-bold text-slate-600">Scanning Assignment Radar for assigned files...</p>
                </div>
              ) : assignments.length > 0 ? (
                <div className="space-y-4">
                  {assignments.map((item) => (
                    <div 
                      key={item.id || item.documentId}
                      className="bg-white border border-slate-200/90 hover:border-indigo-300 rounded-2xl p-5 shadow-xs transition-all duration-200 hover:shadow-md space-y-4 relative overflow-hidden group"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        
                        {/* File & Project Title */}
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5">
                            <FileText className="w-5 h-5 text-indigo-600" />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                              {item.documentName}
                            </h4>
                            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                              <span className="flex items-center gap-1 text-slate-600 font-semibold">
                                <Folder className="w-3.5 h-3.5 text-indigo-500" />
                                <span className="truncate">{item.projectName}</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Direct Editor Action Button */}
                        <button
                          onClick={() => openEditor(item)}
                          className="w-full sm:w-auto shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow-md"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Open CAT Editor</span>
                          <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
                        </button>
                      </div>

                      {/* BADGES & DETAILS ROW */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-xs">
                        
                        {/* Target Language Badge */}
                        <div className="bg-cyan-50/70 border border-cyan-200/80 rounded-xl px-3.5 py-2 flex items-center gap-2.5">
                          <Globe className="w-4 h-4 text-cyan-600 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[9px] font-bold text-cyan-700 uppercase tracking-wider block">Target Language</span>
                            <span className="font-extrabold text-slate-900 truncate block">
                              {getLanguageLabel(item.targetLang)}
                            </span>
                          </div>
                        </div>

                        {/* Project Coordinator (Assigner) Badge */}
                        <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl px-3.5 py-2 flex items-center gap-2.5">
                          <User className="w-4 h-4 text-amber-600 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[9px] font-bold text-amber-700 uppercase tracking-wider block">Project Coordinator</span>
                            <span className="font-bold text-slate-900 truncate block" title={item.assignerEmail}>
                              {item.assignerEmail}
                            </span>
                          </div>
                        </div>

                        {/* Date & Permission Badge */}
                        <div className="bg-slate-100/70 border border-slate-200/80 rounded-xl px-3.5 py-2 flex items-center gap-2.5">
                          <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Assigned Date & Access</span>
                            <span className="font-semibold text-slate-800 truncate block">
                              {formatDate(item.assignedAt)} · <strong className="text-emerald-700 font-bold uppercase">{item.permission === "read" ? "Viewer" : "Editor"}</strong>
                            </span>
                          </div>
                        </div>

                      </div>

                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 mx-auto">
                    <Clock className="w-6 h-6 text-indigo-500" />
                  </div>
                  <div className="space-y-1 max-w-md mx-auto">
                    <h4 className="text-sm font-bold text-slate-900">Awaiting Job Dispatch</h4>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">
                      No files assigned yet. When your Project Coordinator shares a document or project with your email address (<strong className="text-slate-800">{userEmail}</strong>), it will instantly populate here in your Assignment Radar!
                    </p>
                  </div>
                </div>
              )}

            </div>

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
