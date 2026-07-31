import React, { useState, useEffect } from "react";
import { Plus, Folder, User, Calendar, Trash2, Search, Filter, Globe, BookOpen, Settings, ChevronRight, LayoutDashboard, Users, Share2, MoreVertical, Copy, StickyNote, History, Check, XCircle, Sparkles, Layers, FileText, CheckCircle2, TrendingUp, LogOut, PauseCircle, Clock, ChevronDown, Archive } from "lucide-react";
import { fetchProjects, createProject, deleteProject, duplicateProject, updateProjectDetails } from "../services/api";
import { LANGUAGES } from "../constants/languages";
import { ShareModal } from "./ShareModal";
import { ProjectNotesModal } from "./ProjectNotesModal";
import { SettingsModal } from "./SettingsModal";
import { ProjectHistoryModal } from "./ProjectHistoryModal";
import { CardGridSkeleton } from "./SkeletonLoader";
import { normalizeStatus, formatStatusLabel, getStatusColorClass, getStatusDotColor, STATUS_OPTIONS } from "../utils/projectStatusUtils";

import io from "socket.io-client";

export default function ProjectDashboard({ onOpenProject, showToast, theme, userRole, onOpenAdmin, onOpenSettings, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState("active"); // default to "active" projects
  const [shareModalProject, setShareModalProject] = useState(null);
  const [notesModalProject, setNotesModalProject] = useState(null);
  const [settingsModalProjectId, setSettingsModalProjectId] = useState(null);
  const [showGlobalHistoryModal, setShowGlobalHistoryModal] = useState(false);
  const [openMenuProjectId, setOpenMenuProjectId] = useState(null);
  const [openStatusMenuProjectId, setOpenStatusMenuProjectId] = useState(null);

  // Form states for Create Project
  const [projName, setProjName] = useState("");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceLang, setSourceLang] = useState("en");
  const [selectedLangs, setSelectedLangs] = useState([]);
  const [langSearch, setLangSearch] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    loadProjects();

    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const socket = io(socketUrl, { auth: { token: localStorage.getItem("centroid_token") } });

    socket.on("global-job-update", () => {
      fetchProjects().then(data => setProjects(data || [])).catch(() => {});
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Click outside to close dropdown menus
  useEffect(() => {
    const handleGlobalClick = () => {
      setOpenMenuProjectId(null);
      setOpenStatusMenuProjectId(null);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await fetchProjects();
      setProjects(data || []);
    } catch (err) {
      console.error(err);
      showToast("Failed to load projects.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!projName.trim()) {
      showToast("Project name is required", "error");
      return;
    }

    try {
      await createProject(
        projName,
        clientName,
        description,
        sourceLang,
        selectedLangs,
        dueDate || null
      );
      showToast("Project created successfully!");
      setShowCreateModal(false);
      setProjName("");
      setClientName("");
      setDescription("");
      setSourceLang("en");
      setSelectedLangs([]);
      setDueDate("");
      loadProjects();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Failed to create project", "error");
    }
  };

  const handleDuplicateProject = async (id) => {
    try {
      const res = await duplicateProject(id);
      showToast(`Project duplicated as "${res.project.name}"!`);
      setOpenMenuProjectId(null);
      loadProjects();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Failed to duplicate project", "error");
    }
  };

  const handleDeleteProject = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete project "${name}"? This deletes all files, translation jobs, and segments.`)) {
      return;
    }
    try {
      await deleteProject(id);
      showToast(`Project "${name}" deleted`);
      loadProjects();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Failed to delete project", "error");
    }
  };

  const handleUpdateProjectStatus = async (id, newStatus) => {
    try {
      showToast(`Updating status to ${formatStatusLabel(newStatus)}...`);
      await updateProjectDetails(id, { status: newStatus });
      showToast(`Project status set to ${formatStatusLabel(newStatus)}`);
      loadProjects();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Failed to update project status", "error");
    }
  };

  const toggleLanguageSelection = (langCode) => {
    if (selectedLangs.includes(langCode)) {
      setSelectedLangs(selectedLangs.filter((l) => l !== langCode));
    } else {
      setSelectedLangs([...selectedLangs, langCode]);
    }
  };

  const filteredLanguages = LANGUAGES.filter(
    (l) =>
      l.name.toLowerCase().includes(langSearch.toLowerCase()) ||
      l.code.toLowerCase().includes(langSearch.toLowerCase())
  );

  // Filter projects by Status/Tab and Search/Client queries
  const filteredProjects = projects.filter((p) => {
    const pStatus = normalizeStatus(p.status || p.settings?.status);
    
    if (activeTab === "active" && pStatus !== "active") return false;
    if (activeTab === "completed" && pStatus !== "completed") return false;
    if (activeTab === "on_hold" && pStatus !== "on_hold") return false;
    if (activeTab === "archived" && pStatus !== "archived") return false;
    if (activeTab === "my" && p.isShared) return false;
    if (activeTab === "shared" && !p.isShared) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchDesc = (p.description || "").toLowerCase().includes(q);
      if (!matchName && !matchDesc) return false;
    }

    if (filterClient.trim()) {
      const c = filterClient.toLowerCase();
      const matchClient = (p.client || "").toLowerCase().includes(c);
      if (!matchClient) return false;
    }

    return true;
  });

  const activeProjectsCount = projects.filter((p) => normalizeStatus(p.status || p.settings?.status) === "active").length;
  const completedProjectsCount = projects.filter((p) => normalizeStatus(p.status || p.settings?.status) === "completed").length;
  const onHoldProjectsCount = projects.filter((p) => normalizeStatus(p.status || p.settings?.status) === "on_hold").length;
  const archivedProjectsCount = projects.filter((p) => normalizeStatus(p.status || p.settings?.status) === "archived").length;
  const myProjectsCount = projects.filter((p) => !p.isShared).length;
  const sharedProjectsCount = projects.filter((p) => p.isShared).length;
  const totalFilesCount = projects.reduce((sum, p) => sum + (p.fileCount || (p.documents?.length || 0)), 0);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans antialiased flex flex-col">
      
      {/* ── TOP HEADER NAVBAR ── */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]/90 backdrop-blur-md px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-extrabold bg-gradient-to-r from-indigo-400 via-purple-300 to-emerald-400 bg-clip-text text-transparent leading-none">
              Centroid Studio
            </h1>
            <p className="text-[11px] font-semibold text-[var(--text-muted)] mt-1 tracking-wide">
              Enterprise Translation Workspace
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowGlobalHistoryModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-xs"
            title="Global Workspace Activity Log"
          >
            <History size={14} className="text-indigo-400" />
            <span>Activity Log</span>
          </button>

          {userRole === "admin" && (
            <button
              onClick={onOpenAdmin}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-xs font-bold text-indigo-400 transition-all cursor-pointer shadow-xs"
              title="Admin Panel"
            >
              <LayoutDashboard size={14} />
              <span>Admin Panel</span>
            </button>
          )}

          <button
            onClick={onOpenSettings}
            className="h-9 w-9 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-all cursor-pointer shadow-xs"
            title="Workspace Settings"
          >
            <Settings size={15} />
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="h-9 w-9 rounded-xl bg-[var(--bg-surface)] hover:bg-rose-500/10 border border-[var(--border-subtle)] hover:border-rose-500/30 text-[var(--text-secondary)] hover:text-rose-400 flex items-center justify-center transition-all cursor-pointer shadow-xs"
              title="Log Out"
            >
              <LogOut size={15} />
            </button>
          )}

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer shadow-lg shadow-indigo-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={16} /> New Project
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT CONTAINER ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-8 space-y-8">
        
        {/* ── STATS HERO BANNER ── */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <div 
            onClick={() => setActiveTab("active")}
            className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-emerald-500/40 rounded-2xl p-5 shadow-sm flex items-center gap-4 relative overflow-hidden group cursor-pointer transition-all"
          >
            <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all" />
            <div className="h-11 w-11 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0 group-hover:scale-110 transition-transform">
              <Folder size={20} />
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase text-[var(--text-muted)] tracking-wider">Active Projects</span>
              <h4 className="text-xl font-black text-emerald-400 mt-1">{activeProjectsCount}</h4>
            </div>
          </div>

          <div 
            onClick={() => setActiveTab("completed")}
            className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-blue-500/40 rounded-2xl p-5 shadow-sm flex items-center gap-4 relative overflow-hidden group cursor-pointer transition-all"
          >
            <div className="absolute right-0 top-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all" />
            <div className="h-11 w-11 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20 shrink-0 group-hover:scale-110 transition-transform">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase text-[var(--text-muted)] tracking-wider">Completed</span>
              <h4 className="text-xl font-black text-blue-400 mt-1">{completedProjectsCount}</h4>
            </div>
          </div>

          <div 
            onClick={() => setActiveTab("on_hold")}
            className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-amber-500/40 rounded-2xl p-5 shadow-sm flex items-center gap-4 relative overflow-hidden group cursor-pointer transition-all"
          >
            <div className="absolute right-0 top-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all" />
            <div className="h-11 w-11 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 shrink-0 group-hover:scale-110 transition-transform">
              <PauseCircle size={20} />
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase text-[var(--text-muted)] tracking-wider">On Hold</span>
              <h4 className="text-xl font-black text-amber-400 mt-1">{onHoldProjectsCount}</h4>
            </div>
          </div>

          <div 
            onClick={() => setActiveTab("archived")}
            className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-zinc-500/40 rounded-2xl p-5 shadow-sm flex items-center gap-4 relative overflow-hidden group cursor-pointer transition-all"
          >
            <div className="absolute right-0 top-0 w-24 h-24 bg-zinc-500/5 rounded-full blur-2xl group-hover:bg-zinc-500/10 transition-all" />
            <div className="h-11 w-11 rounded-2xl bg-zinc-500/10 text-zinc-400 flex items-center justify-center border border-zinc-500/20 shrink-0 group-hover:scale-110 transition-transform">
              <Archive size={20} />
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase text-[var(--text-muted)] tracking-wider">Archived</span>
              <h4 className="text-xl font-black text-zinc-400 mt-1">{archivedProjectsCount}</h4>
            </div>
          </div>
        </section>

        {/* ── TOOLBAR: TABS & FILTERS ── */}
        <section className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          
          {/* Tab Selector */}
          <div className="flex items-center gap-1.5 bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-1.5 rounded-2xl shadow-xs overflow-x-auto">
            <button
              onClick={() => setActiveTab("active")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === "active"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Active ({activeProjectsCount})
            </button>

            <button
              onClick={() => setActiveTab("completed")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === "completed"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              <CheckCircle2 size={13} />
              Completed ({completedProjectsCount})
            </button>

            <button
              onClick={() => setActiveTab("on_hold")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === "on_hold"
                  ? "bg-amber-600 text-white shadow-md shadow-amber-600/20"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              <PauseCircle size={13} />
              On Hold ({onHoldProjectsCount})
            </button>

            <button
              onClick={() => setActiveTab("archived")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === "archived"
                  ? "bg-zinc-600 text-white shadow-md shadow-zinc-600/20"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              <Archive size={13} />
              Archived ({archivedProjectsCount})
            </button>

            <button
              onClick={() => setActiveTab("all")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "all"
                  ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/20"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              All ({projects.length})
            </button>

            <button
              onClick={() => setActiveTab("shared")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === "shared"
                  ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/20"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              <Users size={13} />
              Shared ({sharedProjectsCount})
            </button>
          </div>

          {/* Search Inputs */}
          <div className="flex flex-1 max-w-xl gap-3">
            <div className="flex-1 relative">
              <Search size={15} className="absolute left-3.5 top-3 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--bg-panel)] border border-[var(--border-subtle)] focus:border-indigo-500/50 rounded-2xl pl-10 pr-4 py-2 text-xs text-[var(--text-primary)] outline-none transition-all"
              />
            </div>
            <div className="w-48 relative">
              <Filter size={15} className="absolute left-3.5 top-3 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Filter client..."
                value={filterClient}
                onChange={(e) => setFilterClient(e.target.value)}
                className="w-full bg-[var(--bg-panel)] border border-[var(--border-subtle)] focus:border-indigo-500/50 rounded-2xl pl-10 pr-4 py-2 text-xs text-[var(--text-primary)] outline-none transition-all"
              />
            </div>
          </div>

        </section>


        {/* ── PROJECTS CARDS GRID ── */}
        <section>
          {loading ? (
            <CardGridSkeleton count={6} />
          ) : filteredProjects.length === 0 ? (
            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl py-24 text-center">
              <Folder size={44} className="mx-auto text-[var(--text-muted)] mb-3" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">No projects found</h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Try adjusting search filters or create a new project.</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-5 inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer shadow-md transition-all"
              >
                <Plus size={15} /> Create Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((proj) => {
                const totalJobs = proj.jobs?.length || 0;
                const completedJobs = proj.jobs?.filter(j => j.status === "completed" || j.progress === 100).length || 0;
                
                const avgProgress = totalJobs > 0 
                  ? Math.round(proj.jobs.reduce((sum, j) => sum + (j.progress || 0), 0) / totalJobs) 
                  : 0;

                const avgVerified = totalJobs > 0
                  ? Math.round(proj.jobs.reduce((sum, j) => sum + (j.verifiedProgress || 0), 0) / totalJobs)
                  : 0;

                const notesCount = proj.notesCount || 0;
                const projStatus = proj.status || proj.settings?.status || "Active";

                return (
                  <div
                    key={proj.id}
                    className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-indigo-500/40 rounded-3xl p-6 flex flex-col justify-between shadow-md hover:shadow-2xl transition-all duration-300 group relative"
                  >
                    <div>
                      {/* Card Header & Popover Menu */}
                      <div className="flex justify-between items-start gap-3 relative">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 shrink-0 group-hover:scale-105 transition-transform">
                            <Folder size={18} />
                          </div>
                          <h3 className="text-sm font-extrabold text-[var(--text-primary)] group-hover:text-indigo-400 transition-colors truncate">
                            {proj.name}
                          </h3>
                        </div>

                        {/* 3-Dots Options Button */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuProjectId(openMenuProjectId === proj.id ? null : proj.id);
                            }}
                            className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all cursor-pointer"
                            title="Project Options"
                          >
                            <MoreVertical size={16} />
                          </button>

                          {openMenuProjectId === proj.id && (
                            <div 
                              className="absolute right-0 mt-1 w-48 bg-[var(--bg-elevated)] border border-[var(--border-medium)] rounded-2xl shadow-2xl z-50 py-1.5 flex flex-col divide-y divide-[var(--border-subtle)] text-xs select-none"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="py-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSettingsModalProjectId(proj.id);
                                    setOpenMenuProjectId(null);
                                  }}
                                  className="w-full text-left px-3.5 py-2 hover:bg-[var(--bg-hover)] flex items-center gap-2.5 font-bold text-[var(--text-primary)] cursor-pointer"
                                >
                                  <Settings size={14} className="text-blue-400" /> Project Settings
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setShareModalProject(proj);
                                    setOpenMenuProjectId(null);
                                  }}
                                  className="w-full text-left px-3.5 py-2 hover:bg-[var(--bg-hover)] flex items-center gap-2.5 font-bold text-[var(--text-primary)] cursor-pointer"
                                >
                                  <Users size={14} className="text-indigo-400" /> Share Project
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setNotesModalProject(proj);
                                    setOpenMenuProjectId(null);
                                  }}
                                  className="w-full text-left px-3.5 py-2 hover:bg-[var(--bg-hover)] flex items-center gap-2.5 font-bold text-[var(--text-primary)] cursor-pointer"
                                >
                                  <StickyNote size={14} className="text-amber-400" /> Project Notes
                                  {notesCount > 0 && (
                                    <span className="ml-auto bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.5 rounded-full font-extrabold">
                                      {notesCount}
                                    </span>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDuplicateProject(proj.id)}
                                  className="w-full text-left px-3.5 py-2 hover:bg-[var(--bg-hover)] flex items-center gap-2.5 font-bold text-[var(--text-primary)] cursor-pointer"
                                >
                                  <Copy size={14} className="text-emerald-400" /> Duplicate Project
                                </button>
                              </div>

                              {!proj.isShared && (
                                <div className="py-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuProjectId(null);
                                      handleDeleteProject(proj.id, proj.name);
                                    }}
                                    className="w-full text-left px-3.5 py-2 hover:bg-rose-500/10 text-rose-400 flex items-center gap-2.5 font-bold cursor-pointer"
                                  >
                                    <Trash2 size={14} /> Delete Project
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status Selector & Client / Due Badges */}
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {/* Dynamic Interactive Status Badge */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenStatusMenuProjectId(openStatusMenuProjectId === proj.id ? null : proj.id);
                            }}
                            className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-xl select-none cursor-pointer transition-all ${getStatusColorClass(projStatus)}`}
                            title="Click to change project status"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${getStatusDotColor(projStatus)}`} />
                            <span>{formatStatusLabel(projStatus)}</span>
                            <ChevronDown size={11} className="text-[var(--text-muted)]" />
                          </button>

                          {openStatusMenuProjectId === proj.id && (
                            <div 
                              className="absolute left-0 mt-1.5 w-36 bg-[var(--bg-elevated)] border border-[var(--border-medium)] rounded-2xl shadow-2xl z-50 py-1 flex flex-col text-xs select-none"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {STATUS_OPTIONS.map((st) => (
                                <button
                                  key={st.value}
                                  type="button"
                                  onClick={() => {
                                    setOpenStatusMenuProjectId(null);
                                    handleUpdateProjectStatus(proj.id, st.value);
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-hover)] flex items-center justify-between font-bold text-[var(--text-primary)] cursor-pointer"
                                >
                                  <span className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${st.dotColor}`} />
                                    {st.label}
                                  </span>
                                  {normalizeStatus(projStatus) === st.value && (
                                    <Check size={12} className="text-indigo-400" />
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {proj.isShared ? (
                          <span className="inline-flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-bold px-2.5 py-0.5 rounded-lg">
                            <Users size={11} /> Shared ({proj.sharedBy || "Owner"})
                          </span>
                        ) : (
                          proj.client && (
                            <span className="inline-block bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold px-2.5 py-0.5 rounded-lg">
                              Client: {proj.client}
                            </span>
                          )
                        )}


                        {(() => {
                          const rawDueDate = proj.dueDate || proj.deadline || proj.settings?.dueDate;
                          if (!rawDueDate) return null;
                          const dueDateFormatted = new Date(rawDueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
                          return (
                            <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold px-2.5 py-0.5 rounded-lg">
                              <Calendar size= {11} /> Due: {dueDateFormatted}
                            </span>
                          );
                        })()}
                      </div>

                      <p className="text-xs text-[var(--text-secondary)] mt-3 line-clamp-2 leading-relaxed font-medium">
                        {proj.description || "No description provided."}
                      </p>

                      {/* Language Badges */}
                      <div className="flex flex-wrap gap-1.5 mt-4">
                        <span className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-surface)] px-2 py-0.5 rounded-md border border-[var(--border-subtle)] uppercase">
                          Src: {proj.source_lang}
                        </span>
                        {proj.target_languages && proj.target_languages.map(lang => (
                          <span 
                            key={lang} 
                            className="text-[10px] font-bold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20 uppercase"
                          >
                            {lang}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Progress Metrics & Action */}
                    <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] space-y-3">
                      <div className="space-y-1.5 text-[10px]">
                        <div className="flex justify-between items-center font-bold">
                          <span className="text-indigo-400">Translated</span>
                          <span className="text-[var(--text-primary)]">{avgProgress}%</span>
                        </div>
                        <div className="w-full bg-[var(--bg-input)] h-1.5 rounded-full overflow-hidden border border-[var(--border-subtle)]">
                          <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${avgProgress}%` }} />
                        </div>

                        <div className="flex justify-between items-center font-bold pt-1">
                          <span className="text-emerald-400">Verified</span>
                          <span className="text-[var(--text-primary)]">{avgVerified}%</span>
                        </div>
                        <div className="w-full bg-[var(--bg-input)] h-1.5 rounded-full overflow-hidden border border-[var(--border-subtle)]">
                          <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${avgVerified}%` }} />
                        </div>
                      </div>

                      <button
                        onClick={() => onOpenProject(proj.id)}
                        className="w-full flex items-center justify-center gap-2 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-medium)] text-xs font-bold py-2.5 rounded-2xl transition-all cursor-pointer group-hover:border-indigo-500/40"
                      >
                        <span>Open Workspace</span>
                        <ChevronRight size={14} className="text-indigo-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </main>

      {/* ── CREATE NEW PROJECT MODAL ── */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-card max-w-xl select-none text-left p-6 flex flex-col gap-5 max-h-[90vh] overflow-hidden" style={{ borderRadius: "20px" }}>
            
            <div className="flex justify-between items-center pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)] leading-snug">
                    Create New Project
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] font-medium">
                    Configure project languages and settings
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-full hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">Project Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Annual Legal Loan Agreement 2026"
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">Client / Organization</label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Corp"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief summary of project scope..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">Source Language</label>
                  <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs text-[var(--text-primary)] outline-none"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.flag} {l.name} ({l.code.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">
                    Target Languages ({selectedLangs.length})
                  </label>
                  <input
                    type="text"
                    placeholder="Search languages..."
                    value={langSearch}
                    onChange={(e) => setLangSearch(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] outline-none mb-2"
                  />
                </div>
              </div>

              {/* Target Languages Multi-select Pills */}
              <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl p-3 max-h-36 overflow-y-auto flex flex-wrap gap-1.5">
                {filteredLanguages.map((l) => {
                  const isSelected = selectedLangs.includes(l.code);
                  return (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => toggleLanguageSelection(l.code)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                        isSelected
                          ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                          : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-zinc-600"
                      }`}
                    >
                      <span>{l.flag} {l.name}</span>
                      {isSelected && <Check size={12} className="text-indigo-400 ml-1" />}
                    </button>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/20 cursor-pointer"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareModalProject && (
        <ShareModal
          isOpen={!!shareModalProject}
          onClose={() => setShareModalProject(null)}
          projectId={shareModalProject.id}
          docName={shareModalProject.name}
          isOwner={!shareModalProject.isShared}
        />
      )}

      {/* Project Notes Modal */}
      {notesModalProject && (
        <ProjectNotesModal
          isOpen={!!notesModalProject}
          onClose={() => setNotesModalProject(null)}
          projectId={notesModalProject.id}
          projectName={notesModalProject.name}
          isOwner={!notesModalProject.isShared}
        />
      )}

      {/* Settings Modal */}
      {settingsModalProjectId && (
        <SettingsModal
          show={!!settingsModalProjectId}
          onClose={() => setSettingsModalProjectId(null)}
          projectId={settingsModalProjectId}
          userRole={userRole}
          theme={theme}
          onApplySettings={() => {}}
          onProjectUpdated={loadProjects}
        />
      )}

      {/* Workspace History Modal */}
      {showGlobalHistoryModal && (
        <ProjectHistoryModal
          isOpen={showGlobalHistoryModal}
          onClose={() => setShowGlobalHistoryModal(false)}
          projectId={null}
          projectName="Global Workspace"
          showToast={showToast}
        />
      )}

    </div>
  );
}
