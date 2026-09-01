import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, LogOut, FileText, Lock, CheckCircle2, 
  Sparkles, RefreshCw, Mail, ArrowRight, User, Clock, 
  ExternalLink, Layers, Headphones, Cpu, BookOpen, Key, Globe, Folder, Play,
  Download, AlertCircle, X, Check, XCircle, RotateCcw
} from "lucide-react";
import { fetchAssignedDocuments, fetchDocument, exportFile, exportGlobalTm, updateAssignmentStatus } from "../services/api.js";
import { ExportModal } from "./ExportModal.jsx";
import { exportLinguistReviewTableDocx } from "../utils/exportReviewTable.js";

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

  // Status Filter Tabs: "active" | "completed" | "declined" | "all"
  const [activeTab, setActiveTab] = useState("active");
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [declineModalItem, setDeclineModalItem] = useState(null);
  const [declineReason, setDeclineReason] = useState("");

  // Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportModalData, setExportModalData] = useState(null);
  const [exportingDocId, setExportingDocId] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Derive User Name and Email
  const userName = user?.name || user?.full_name || user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Linguist";
  const userEmail = user?.email || "linguist@verbolabs.com";

  const loadAssignments = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      console.log(`[RADAR_UI] Fetching assignments (background: ${isBackground})...`);
      const data = await fetchAssignedDocuments();
      console.log("[RADAR_UI] Received assignments count:", Array.isArray(data) ? data.length : "NOT AN ARRAY", data);
      setAssignments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[RADAR_UI_ERROR] Failed to load linguist assignments:", err);
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

  const handleUpdateStatus = async (item, newStatus, reason = "") => {
    const docKey = item.id || item.documentId;
    setActionLoadingId(`${docKey}_${newStatus}`);
    try {
      await updateAssignmentStatus(item.documentId, item.targetLang, newStatus, reason);
      if (newStatus === "completed") {
        showToast("🎉 Task marked as completed successfully!", "success");
      } else if (newStatus === "declined") {
        showToast("Task declined and moved to Declined tab.", "success");
      } else {
        showToast("Task reopened and moved to Active tab.", "success");
      }
      await loadAssignments(true);
    } catch (err) {
      console.error("Update assignment status error:", err);
      showToast(err.response?.data?.error || err.message || "Failed to update status", "error");
    } finally {
      setActionLoadingId(null);
      setDeclineModalItem(null);
      setDeclineReason("");
    }
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

  const getExtensionFromName = (name) => {
    if (!name) return ".html";
    const lastDot = name.lastIndexOf(".");
    return lastDot !== -1 ? name.slice(lastDot).toLowerCase() : ".html";
  };

  const handleOpenExport = async (item) => {
    const docKey = item.id || item.documentId;
    setExportingDocId(docKey);
    try {
      const docData = await fetchDocument(item.documentId, item.targetLang);
      const segs = docData?.segments || [];
      const ext = getExtensionFromName(item.documentName);
      
      setExportModalData({
        item,
        segments: segs,
        fileName: item.documentName?.replace(/\.[^/.]+$/, "") || "document",
        fileExtension: ext,
        sourceLanguage: item.sourceLang || docData?.document?.source_lang || "en",
        targetLanguage: item.targetLang || "hi"
      });
      setShowExportModal(true);
    } catch (err) {
      console.error("Failed to load document for export:", err);
      showToast(`Export preparation failed: ${err.message || "Could not fetch document"}`, "error");
    } finally {
      setExportingDocId(null);
    }
  };

  const handleExportDocument = async (overrideExt) => {
    if (!exportModalData) return;
    try {
      const { item, segments, fileName, fileExtension, sourceLanguage, targetLanguage } = exportModalData;
      const ext = overrideExt || fileExtension;
      const targetId = item.fileId || item.documentId;
      const blob = await exportFile(targetId, segments, ext, sourceLanguage, targetLanguage, fileName);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${fileName}_${targetLanguage}${ext}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast("Document exported successfully!");
    } catch (error) {
      console.error(error);
      showToast(`Export failed: ${error.message}`, "error");
    }
  };

  const handleExportSourceDocument = async (overrideExt) => {
    if (!exportModalData) return;
    try {
      const { item, segments, fileName, fileExtension, sourceLanguage, targetLanguage } = exportModalData;
      const ext = overrideExt || fileExtension;
      const targetId = item.fileId || item.documentId;
      const blob = await exportFile(targetId, segments, ext, sourceLanguage, targetLanguage, fileName, true);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${fileName}_source${ext}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast("Source document exported successfully!");
    } catch (error) {
      console.error(error);
      showToast(`Export failed: ${error.message}`, "error");
    }
  };

  const handleExportXliff = async (isSourceOnly = false) => {
    if (!exportModalData) return;
    try {
      const { item, segments, fileName, sourceLanguage, targetLanguage } = exportModalData;
      const targetId = item.fileId || item.documentId;
      const blob = await exportFile(targetId, segments, ".xlf", sourceLanguage, targetLanguage, fileName, isSourceOnly);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${fileName}_${isSourceOnly ? "source" : targetLanguage}.xlf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast("XLIFF exported successfully!");
    } catch (error) {
      console.error(error);
      showToast(`XLIFF export failed: ${error.message}`, "error");
    }
  };

  const handleExportTmx = async () => {
    if (!exportModalData) return;
    try {
      const { item, segments, fileName, sourceLanguage, targetLanguage } = exportModalData;
      const targetId = item.fileId || item.documentId;
      const blob = await exportFile(targetId, segments, ".tmx", sourceLanguage, targetLanguage, fileName);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${fileName}_${targetLanguage}.tmx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast("TMX memory exported successfully!");
    } catch (error) {
      console.error(error);
      showToast(`TMX export failed: ${error.message}`, "error");
    }
  };

  const handleExportGlobalTmx = async () => {
    if (!exportModalData) return;
    try {
      const { sourceLanguage, targetLanguage } = exportModalData;
      const blob = await exportGlobalTm(sourceLanguage, targetLanguage);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `global_tm_${sourceLanguage}_${targetLanguage}.tmx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast("Global database TM exported successfully!");
    } catch (error) {
      console.error(error);
      showToast(`Global TM export failed: ${error.message}`, "error");
    }
  };

  const handleExportLinguistTable = async () => {
    if (!exportModalData) return;
    try {
      showToast("Generating Linguist Review Table...");
      const { segments, fileName, sourceLanguage, targetLanguage } = exportModalData;
      await exportLinguistReviewTableDocx(segments, fileName, sourceLanguage, targetLanguage);
      showToast("Linguist review table exported successfully!");
    } catch (error) {
      console.error(error);
      showToast(`Review table export failed: ${error.message}`, "error");
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

  // Filter categorized assignments
  const activeAssignments = assignments.filter(a => (a.status || "active") === "active");
  const completedAssignments = assignments.filter(a => a.status === "completed");
  const declinedAssignments = assignments.filter(a => a.status === "declined");

  const filteredAssignments = activeTab === "active" 
    ? activeAssignments 
    : activeTab === "completed" 
    ? completedAssignments 
    : activeTab === "declined" 
    ? declinedAssignments 
    : assignments;

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
              Your account (<strong className="text-slate-900">{userEmail}</strong>) is active. Manage your assigned tasks below, complete reviews, or decline tasks with a single click.
            </p>
          </div>

          {/* Quick Metrics Badge */}
          <div className="flex items-center shrink-0 gap-3">
            <div className="bg-white/80 border border-slate-200/80 rounded-2xl px-5 py-3 text-center space-y-0.5 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">Active Tasks</span>
              <span className="text-sm font-extrabold text-indigo-600 flex items-center justify-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-500" /> {activeAssignments.length} Active
              </span>
            </div>
            <div className="bg-white/80 border border-slate-200/80 rounded-2xl px-5 py-3 text-center space-y-0.5 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">Completed</span>
              <span className="text-xs font-extrabold text-emerald-600 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> {completedAssignments.length} Done
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
                  <span>Task Management Guidelines</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  • <strong>Active Tasks</strong>: Ready for translation in CAT Editor.<br/>
                  • <strong>Mark as Done</strong>: Finalizes task & syncs with WordPress.<br/>
                  • <strong>Decline</strong>: Returns task to coordinator radar.
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
                        {filteredAssignments.length} {filteredAssignments.length === 1 ? "Job" : "Jobs"}
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

              {/* RADAR STATUS FILTER TABS */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {[
                  { id: "active", label: "Active Jobs", count: activeAssignments.length, activeClass: "bg-indigo-600 text-white shadow-sm font-extrabold" },
                  { id: "completed", label: "Completed", count: completedAssignments.length, activeClass: "bg-emerald-600 text-white shadow-sm font-extrabold" },
                  { id: "declined", label: "Declined", count: declinedAssignments.length, activeClass: "bg-rose-600 text-white shadow-sm font-extrabold" },
                  { id: "all", label: "All Assigned", count: assignments.length, activeClass: "bg-slate-800 text-white shadow-sm font-extrabold" }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 text-xs font-bold ${
                      activeTab === tab.id
                        ? tab.activeClass
                        : "bg-white/80 border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-white"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-extrabold ${
                      activeTab === tab.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* ASSIGNMENT CARDS LIST */}
              {loading ? (
                <div className="py-12 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                  <p className="text-xs font-bold text-slate-600">Scanning Assignment Radar for assigned files...</p>
                </div>
              ) : filteredAssignments.length > 0 ? (
                <div className="space-y-4">
                  {filteredAssignments.map((item) => {
                    const isWp = item.sourceType === "wordpress" || 
                      item.documentName?.startsWith("WP:") || 
                      item.metadata?.source_type === "wordpress" ||
                      item.projectName?.includes("WP");

                    const itemStatus = item.status || "active";
                    const docKey = item.id || item.documentId;
                    const isDoneLoading = actionLoadingId === `${docKey}_completed`;
                    const isReopenLoading = actionLoadingId === `${docKey}_active`;

                    // Clean page title for display
                    let displayTitle = item.documentName;
                    let wpPostId = item.metadata?.wp_post_id;
                    if (isWp) {
                      const match = item.documentName?.match(/WP:\s*(.*?)(?:\s*\(ID:\s*(\d+|N\/A)\))?$/i);
                      if (match) {
                        displayTitle = match[1] || item.documentName;
                        if (!wpPostId && match[2] && match[2] !== "N/A") {
                          wpPostId = match[2];
                        }
                      }
                    }

                    if (isWp) {
                      return (
                        <div 
                          key={item.id || item.documentId}
                          className={`border-2 rounded-2xl p-5 shadow-xs transition-all duration-200 hover:shadow-md space-y-4 relative overflow-hidden group border-l-4 ${
                            itemStatus === "completed"
                              ? "bg-emerald-50/40 border-emerald-200 border-l-emerald-600"
                              : itemStatus === "declined"
                              ? "bg-rose-50/40 border-rose-200 border-l-rose-600 opacity-80"
                              : "bg-gradient-to-r from-blue-50/90 via-sky-50/40 to-white border-blue-200/90 hover:border-blue-500 border-l-blue-600"
                          }`}
                        >
                          {/* WordPress Brand Banner */}
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/70">
                            <div className="flex items-center gap-2">
                              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-600 text-white text-[11px] font-bold shadow-xs">
                                <Globe className="w-3.5 h-3.5" />
                                <span>WordPress Live CMS Task</span>
                                {itemStatus === "active" && (
                                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-ping ml-0.5" />
                                )}
                              </div>

                              {itemStatus === "completed" && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Done & Synced
                                </span>
                              )}

                              {itemStatus === "declined" && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-rose-800 bg-rose-100 border border-rose-200 px-2.5 py-0.5 rounded-full">
                                  <XCircle className="w-3.5 h-3.5 text-rose-600" /> Declined
                                </span>
                              )}
                            </div>

                            {wpPostId && (
                              <span className="text-[11px] font-mono font-bold text-blue-800 bg-blue-100/80 px-2.5 py-0.5 rounded-md border border-blue-200">
                                Post ID #{wpPostId}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            {/* Title & Origin */}
                            <div className="flex items-start gap-3 min-w-0">
                              <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs mt-0.5 ${
                                itemStatus === "completed" ? "bg-emerald-600" : itemStatus === "declined" ? "bg-rose-600" : "bg-blue-600"
                              }`}>
                                <Globe className="w-6 h-6 text-white" />
                              </div>
                              <div className="min-w-0 space-y-1">
                                <h4 className="text-base font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                                  {displayTitle}
                                </h4>
                                <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                                  <span className="flex items-center gap-1 text-blue-700 font-semibold">
                                    <Folder className="w-3.5 h-3.5 text-blue-600" />
                                    <span className="truncate">{item.projectName}</span>
                                  </span>
                                  {item.metadata?.wp_site_url && (
                                    <span className="text-slate-400 text-[11px] truncate font-mono">
                                      · {item.metadata.wp_site_url.replace(/^https?:\/\//, '')}
                                    </span>
                                  )}
                                </div>

                                {itemStatus === "declined" && item.declinedReason && (
                                  <div className="text-xs text-rose-700 font-semibold bg-rose-50 p-2 rounded-lg border border-rose-200/80 mt-1">
                                    <strong>Decline Reason:</strong> {item.declinedReason}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto shrink-0">
                              
                              {/* Open Editor Button */}
                              <button
                                onClick={() => openEditor(item)}
                                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-[0.98]"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>{itemStatus === "completed" ? "Review In Editor" : "⚡ Open WP Editor"}</span>
                                <ExternalLink className="w-3 h-3 ml-0.5" />
                              </button>

                              {/* Mark as Done Button (Active only) */}
                              {itemStatus === "active" && (
                                <button
                                  onClick={() => handleUpdateStatus(item, "completed")}
                                  disabled={isDoneLoading}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow-md active:scale-[0.98]"
                                  title="Mark this translation as done and post updates to WordPress"
                                >
                                  {isDoneLoading ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Check className="w-4 h-4" />
                                  )}
                                  <span>Mark Done</span>
                                </button>
                              )}

                              {/* Decline Button (Active only) */}
                              {itemStatus === "active" && (
                                <button
                                  onClick={() => setDeclineModalItem(item)}
                                  className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-bold text-xs px-3 py-2.5 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs hover:shadow-sm active:scale-[0.98]"
                                  title="Decline / Reject this assignment"
                                >
                                  <X className="w-4 h-4 text-rose-600" />
                                  <span>Decline</span>
                                </button>
                              )}

                              {/* Reopen Button (Completed or Declined) */}
                              {(itemStatus === "completed" || itemStatus === "declined") && (
                                <button
                                  onClick={() => handleUpdateStatus(item, "active")}
                                  disabled={isReopenLoading}
                                  className="bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-300 font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                                  title="Reopen and move task back to Active Radar"
                                >
                                  <RotateCcw className={`w-3.5 h-3.5 ${isReopenLoading ? "animate-spin" : ""}`} />
                                  <span>Reactivate</span>
                                </button>
                              )}

                              {/* Export Button */}
                              <button
                                onClick={() => handleOpenExport(item)}
                                disabled={exportingDocId === docKey}
                                className="bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs px-3 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-slate-300 shadow-xs hover:shadow-sm active:scale-[0.98]"
                                title="Export WordPress page translation"
                              >
                                {exportingDocId === docKey ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                                ) : (
                                  <Download className="w-3.5 h-3.5 text-blue-600" />
                                )}
                                <span>Export</span>
                              </button>

                            </div>
                          </div>

                          {/* Details Row */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-200/70 text-xs">
                            <div className="bg-white/80 border border-slate-200 rounded-xl px-3.5 py-2 flex items-center gap-2.5 shadow-2xs">
                              <Globe className="w-4 h-4 text-blue-600 shrink-0" />
                              <div className="min-w-0">
                                <span className="text-[9px] font-bold text-blue-700 uppercase tracking-wider block">Target Language</span>
                                <span className="font-extrabold text-slate-900 truncate block">
                                  {getLanguageLabel(item.targetLang)}
                                </span>
                              </div>
                            </div>

                            <div className="bg-white/80 border border-slate-200 rounded-xl px-3.5 py-2 flex items-center gap-2.5 shadow-2xs">
                              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                              <div className="min-w-0">
                                <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider block">Visual Live Sync</span>
                                <span className="font-bold text-slate-900 truncate block">
                                  Real-Time WYSIWYG
                                </span>
                              </div>
                            </div>

                            <div className="bg-white/80 border border-slate-200 rounded-xl px-3.5 py-2 flex items-center gap-2.5 shadow-2xs">
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
                      );
                    }

                    // Generic Document Card
                    return (
                      <div 
                        key={item.id || item.documentId}
                        className={`border rounded-2xl p-5 shadow-xs transition-all duration-200 hover:shadow-md space-y-4 relative overflow-hidden group ${
                          itemStatus === "completed"
                            ? "bg-emerald-50/30 border-emerald-200"
                            : itemStatus === "declined"
                            ? "bg-rose-50/30 border-rose-200 opacity-80"
                            : "bg-white border-slate-200/90 hover:border-indigo-300"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          
                          {/* File & Project Title */}
                          <div className="flex items-start gap-3 min-w-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 mt-0.5 ${
                              itemStatus === "completed" ? "bg-emerald-600" : itemStatus === "declined" ? "bg-rose-600" : "bg-indigo-600"
                            }`}>
                              <FileText className="w-5 h-5 text-white" />
                            </div>
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                                  {item.documentName}
                                </h4>
                                {itemStatus === "completed" && (
                                  <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.2 rounded-full">
                                    Done
                                  </span>
                                )}
                                {itemStatus === "declined" && (
                                  <span className="text-[10px] font-extrabold text-rose-700 bg-rose-100 border border-rose-200 px-2 py-0.2 rounded-full">
                                    Declined
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                <span className="flex items-center gap-1 text-slate-600 font-semibold">
                                  <Folder className="w-3.5 h-3.5 text-indigo-500" />
                                  <span className="truncate">{item.projectName}</span>
                                </span>
                              </div>

                              {itemStatus === "declined" && item.declinedReason && (
                                <div className="text-xs text-rose-700 font-semibold bg-rose-50 p-2 rounded-lg border border-rose-200/80 mt-1">
                                  <strong>Decline Reason:</strong> {item.declinedReason}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons: Export & CAT Editor & Status */}
                          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto shrink-0">
                            
                            {/* Open CAT Editor */}
                            <button
                              onClick={() => openEditor(item)}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow-md active:scale-[0.98]"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>{itemStatus === "completed" ? "Review In Editor" : "Open CAT Editor"}</span>
                              <ExternalLink className="w-3 h-3 ml-0.5" />
                            </button>

                            {/* Mark as Done (Active only) */}
                            {itemStatus === "active" && (
                              <button
                                onClick={() => handleUpdateStatus(item, "completed")}
                                disabled={isDoneLoading}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow-md active:scale-[0.98]"
                                title="Mark task as completed"
                              >
                                {isDoneLoading ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4" />
                                )}
                                <span>Mark Done</span>
                              </button>
                            )}

                            {/* Decline (Active only) */}
                            {itemStatus === "active" && (
                              <button
                                onClick={() => setDeclineModalItem(item)}
                                className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-bold text-xs px-3 py-2.5 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                                title="Decline this task"
                              >
                                <X className="w-4 h-4 text-rose-600" />
                                <span>Decline</span>
                              </button>
                            )}

                            {/* Reopen (Completed or Declined) */}
                            {(itemStatus === "completed" || itemStatus === "declined") && (
                              <button
                                onClick={() => handleUpdateStatus(item, "active")}
                                disabled={isReopenLoading}
                                className="bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-300 font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                                title="Reactivate task back to Active Radar"
                              >
                                <RotateCcw className={`w-3.5 h-3.5 ${isReopenLoading ? "animate-spin" : ""}`} />
                                <span>Reactivate</span>
                              </button>
                            )}

                            {/* Export */}
                            <button
                              onClick={() => handleOpenExport(item)}
                              disabled={exportingDocId === docKey}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-slate-300 shadow-xs hover:shadow-sm active:scale-[0.98]"
                              title="Export translated document"
                            >
                              {exportingDocId === docKey ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                              ) : (
                                <Download className="w-3.5 h-3.5 text-indigo-600" />
                              )}
                              <span>Export</span>
                            </button>

                          </div>
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
                    );
                  })}
                </div>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 mx-auto">
                    <Clock className="w-6 h-6 text-indigo-500" />
                  </div>
                  <div className="space-y-1 max-w-md mx-auto">
                    <h4 className="text-sm font-bold text-slate-900">
                      {activeTab === "completed"
                        ? "No Completed Tasks Yet"
                        : activeTab === "declined"
                        ? "No Declined Tasks"
                        : "No Active Tasks Available"}
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">
                      {activeTab === "active"
                        ? `When new tasks are assigned to ${userEmail}, they will instantly appear here on your Active Radar!`
                        : `Switch back to the Active Jobs tab to view current tasks assigned to you.`}
                    </p>
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>

      </main>

      {/* Decline Task Modal */}
      {declineModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shadow-xs">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Decline Assignment</h3>
                  <p className="text-xs text-slate-500 font-medium">Return task to coordinator pool</p>
                </div>
              </div>
              <button
                onClick={() => setDeclineModalItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-600">
                Are you sure you want to decline <strong>{declineModalItem.documentName}</strong> ({getLanguageLabel(declineModalItem.targetLang)})?
              </p>
              <label className="text-[11px] font-bold text-slate-700 block mt-2">
                Reason for declining (optional):
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g., Unavailable schedule, domain mismatch, technical constraints..."
                rows={3}
                className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeclineModalItem(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUpdateStatus(declineModalItem, "declined", declineReason)}
                disabled={actionLoadingId !== null}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer shadow-md flex items-center gap-1.5"
              >
                {actionLoadingId ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                <span>Confirm Decline</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && exportModalData && (
        <ExportModal
          show={showExportModal}
          onClose={() => {
            setShowExportModal(false);
            setExportModalData(null);
          }}
          onExportDocument={handleExportDocument}
          onExportSourceDocument={handleExportSourceDocument}
          onExportXliff={handleExportXliff}
          onExportTmx={handleExportTmx}
          onExportGlobalTmx={handleExportGlobalTmx}
          onExportLinguistTable={handleExportLinguistTable}
          fileExtension={exportModalData.fileExtension}
          sourceLanguage={exportModalData.sourceLanguage}
          targetLanguage={exportModalData.targetLanguage}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border animate-in slide-in-from-bottom-3 duration-200 backdrop-blur-md bg-white/95 border-slate-200/90 text-slate-900">
          {toast.type === "error" ? (
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          )}
          <span className="text-xs font-semibold">{toast.message}</span>
          <button 
            onClick={() => setToast(null)}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
