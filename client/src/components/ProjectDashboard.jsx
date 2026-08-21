import React, { useState, useEffect } from "react";
import {
  Plus,
  Folder,
  Calendar,
  Trash2,
  Search,
  Settings,
  ChevronRight,
  LayoutDashboard,
  Users,
  MoreVertical,
  Copy,
  StickyNote,
  History,
  Check,
  Sparkles,
  Layers,
  FileText,
  CheckCircle2,
  LogOut,
  PauseCircle,
  Clock,
  ChevronDown,
  Archive,
  X,
  ArrowRight,
  ShieldCheck,
  Building2,
  Tag,
  Globe,
  SlidersHorizontal,
  ArrowUpRight,
  Command,
  HelpCircle,
  Bell
} from "lucide-react";
import { fetchProjects, deleteProject, duplicateProject, updateProjectDetails } from "../services/api";
import { LANGUAGES } from "../constants/languages";
import { getSocketUrl } from "../utils/socketUrl.js";
import { ShareModal } from "./ShareModal";
import { ProjectNotesModal } from "./ProjectNotesModal";
import { SettingsModal } from "./SettingsModal";
import { ProjectHistoryModal } from "./ProjectHistoryModal";
import { normalizeStatus, formatStatusLabel, getStatusColorClass, getStatusDotColor, STATUS_OPTIONS } from "../utils/projectStatusUtils";
import { DuplicateProjectModal } from "./DuplicateProjectModal";
import { SmartAIProjectBar } from "./SmartAIProjectBar";
import { CreateProjectModal } from "./CreateProjectModal";
import io from "socket.io-client";

export default function ProjectDashboard({
  onOpenProject,
  showToast,
  theme,
  userRole,
  onOpenAdmin,
  onOpenSettings,
  onLogout
}) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClient, setFilterClient] = useState("all");
  const [filterDomain, setFilterDomain] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [statusFilter, setStatusFilter] = useState("active");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSpotlightAI, setShowSpotlightAI] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [shareModalProject, setShareModalProject] = useState(null);
  const [notesModalProject, setNotesModalProject] = useState(null);
  const [settingsModalProjectId, setSettingsModalProjectId] = useState(null);
  const [showGlobalHistoryModal, setShowGlobalHistoryModal] = useState(false);
  const [openMenuProjectId, setOpenMenuProjectId] = useState(null);
  const [openStatusMenuProjectId, setOpenStatusMenuProjectId] = useState(null);
  const [duplicateModalProject, setDuplicateModalProject] = useState(null);

  useEffect(() => {
    loadProjects();

    const socketUrl = getSocketUrl();
    const socket = io(socketUrl, {
      auth: { token: localStorage.getItem("centroid_token") },
      transports: ["websocket", "polling"]
    });

    socket.on("global-job-update", () => {
      fetchProjects().then((data) => setProjects(data || [])).catch(() => {});
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleGlobalClick = () => {
      setOpenMenuProjectId(null);
      setOpenStatusMenuProjectId(null);
      setShowProfileMenu(false);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  // Global Keyboard Shortcuts (⌘N for Create Modal)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setShowCreateModal(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const loadProjects = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchProjects();
      setProjects(data || []);
    } catch (err) {
      console.error(err);
      if (!silent) showToast("Failed to load projects.", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleUpdateProjectStatus = async (projectId, newStatus) => {
    try {
      // Optimistic update
      setProjects((prev) => {
        const list = Array.isArray(prev) ? prev : prev?.projects || [];
        const updated = list.map((p) => {
          if (p.id === projectId) {
            return {
              ...p,
              status: newStatus,
              settings: { ...(p.settings || {}), status: newStatus }
            };
          }
          return p;
        });
        return Array.isArray(prev) ? updated : { ...prev, projects: updated };
      });
      setOpenStatusMenuProjectId(null);

      await updateProjectDetails(projectId, { status: newStatus });
      showToast(`Project status updated to "${formatStatusLabel(newStatus)}".`, "success");
      loadProjects(true);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Failed to update project status", "error");
      loadProjects(true);
    }
  };

  const handleDuplicateProject = async (id) => {
    try {
      const res = await duplicateProject(id);
      showToast(`Project duplicated as "${res.project?.name || "Duplicated Project"}"!`, "success");
      setOpenMenuProjectId(null);
      loadProjects();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Failed to duplicate project", "error");
    }
  };

  const handleDeleteProject = async (id, name) => {
    if (
      !window.confirm(
        `Are you sure you want to delete project "${name}"? This deletes all files, translation jobs, and segments.`
      )
    ) {
      return;
    }
    try {
      await deleteProject(id);
      showToast(`Project "${name}" deleted`, "success");
      loadProjects();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Failed to delete project", "error");
    }
  };

  const safeProjects = Array.isArray(projects)
    ? projects
    : projects?.projects && Array.isArray(projects.projects)
    ? projects.projects
    : [];

  const uniqueClients = Array.from(new Set(safeProjects.map((p) => p.client).filter(Boolean)));
  const uniqueDomains = Array.from(new Set(safeProjects.map((p) => p.settings?.domain).filter(Boolean)));

  const filteredProjects = safeProjects
    .filter((p) => {
      const pStatus = normalizeStatus(p.status || p.settings?.status);

      if (statusFilter === "active" && pStatus !== "active") return false;
      if (statusFilter === "completed" && pStatus !== "completed") return false;
      if (statusFilter === "on_hold" && pStatus !== "on_hold") return false;
      if (statusFilter === "archived" && pStatus !== "archived") return false;
      if (statusFilter === "shared" && !p.isShared) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (p.name || "").toLowerCase().includes(q);
        const matchDesc = (p.description || "").toLowerCase().includes(q);
        const matchClient = (p.client || "").toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchClient) return false;
      }

      if (filterClient !== "all") {
        if ((p.client || "").toLowerCase() !== filterClient.toLowerCase()) return false;
      }

      if (filterDomain !== "all") {
        const pDomain = p.settings?.domain || "General";
        if (pDomain !== filterDomain) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      if (sortBy === "oldest") {
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      }
      if (sortBy === "name_asc") {
        return (a.name || "").localeCompare(b.name || "");
      }
      if (sortBy === "name_desc") {
        return (b.name || "").localeCompare(a.name || "");
      }
      return 0;
    });

  const activeCount = safeProjects.filter((p) => normalizeStatus(p.status || p.settings?.status) === "active").length;
  const completedCount = safeProjects.filter((p) => normalizeStatus(p.status || p.settings?.status) === "completed").length;
  const onHoldCount = safeProjects.filter((p) => normalizeStatus(p.status || p.settings?.status) === "on_hold").length;
  const archivedCount = safeProjects.filter((p) => normalizeStatus(p.status || p.settings?.status) === "archived").length;
  const sharedCount = safeProjects.filter((p) => p.isShared).length;

  const formatRelativeDate = (dateStr) => {
    if (!dateStr) return null;
    const target = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return { label: "Due Today", isUrgent: true };
    if (diffDays === 1) return { label: "Due Tomorrow", isUrgent: true };
    if (diffDays > 1) return { label: `Due in ${diffDays}d`, isUrgent: false };
    if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, isUrgent: true };
    return null;
  };

  return (
    <div className="min-h-screen w-full flex-1 overflow-y-auto bg-[var(--bg-base)] text-[var(--text-primary)] font-sans antialiased flex flex-col selection:bg-indigo-500/20">
      
      {/* ── HIGH-PRECISION ENTERPRISE TOPBAR (56px) ── */}
      <header className="sticky top-0 z-30 h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-xl px-6 lg:px-8 flex items-center justify-between shadow-xs shrink-0 select-none">
        
        {/* Left: Brand Identity & Workspace Breadcrumb */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => (window.location.href = "/")}
            title="Centroid Translation Platform"
          >
            <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white font-bold text-xs shadow-xs">
              <Sparkles size={15} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-normal tracking-tight text-[var(--text-primary)]">
                Centroid
              </span>
              <span className="text-[var(--text-muted)] font-light text-xs">/</span>
              <span className="text-xs font-normal text-[var(--text-secondary)]">
                Workspace
              </span>
            </div>
          </div>
        </div>

        {/* Right: Executive Controls (Logos Only) */}
        <div className="flex items-center gap-1.5">
          {/* Activity Icon */}
          <button
            onClick={() => setShowGlobalHistoryModal(true)}
            className="h-8 w-8 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer border border-transparent hover:border-[var(--border-subtle)]"
            title="Activity Audit Log"
          >
            <History size={15} />
          </button>

          {/* Vendor Portal Button (Vendor, Admin, Super Admin) */}
          {["vendor", "admin", "super_admin"].includes(userRole) && (
            <button
              onClick={() => window.location.href = "/vendor/dashboard"}
              className="h-8 px-2.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 transition-colors cursor-pointer border border-indigo-500/20 text-xs font-semibold"
              title="Open Vendor Management Portal"
            >
              <Users size={14} className="text-indigo-400" />
              <span className="hidden sm:inline">Vendor Portal</span>
            </button>
          )}

          {/* Admin Panel Icon (if Admin) */}
          {(userRole === "admin" || userRole === "super_admin") && (
            <button
              onClick={onOpenAdmin}
              className="h-8 w-8 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer border border-transparent hover:border-[var(--border-subtle)]"
              title="Admin Console"
            >
              <LayoutDashboard size={15} />
            </button>
          )}
          {/* Settings Icon */}
          <button
            onClick={onOpenSettings}
            className="h-8 w-8 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer border border-transparent hover:border-[var(--border-subtle)]"
            title="Settings & Preferences"
          >
            <Settings size={15} />
          </button>

          {/* Logout Icon */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="h-8 w-8 rounded-lg hover:bg-rose-500/10 text-[var(--text-secondary)] hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer border border-transparent hover:border-rose-500/20"
              title="Sign Out"
            >
              <LogOut size={15} />
            </button>
          )}
        </div>
      </header>

      {/* ── MAIN WORKSPACE CONTENT ── */}
      <main className="flex-1 w-full px-6 lg:px-8 py-6 space-y-4">
        
        {/* ── SUBHEADER & NEW PROJECT BUTTON (PARALLEL TO PROJECTS COUNTER) ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
                Projects
              </h1>
              <span className="text-xs font-mono font-medium text-[var(--text-muted)]">
                {safeProjects.length}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Workspaces, multilingual routing, and translation pipelines.
            </p>
          </div>

          {/* New Project CTA */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="h-8 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3.5 rounded-lg shadow-xs cursor-pointer transition-all active:scale-95 self-start sm:self-auto"
            title="Create New Project"
          >
            <Plus size={14} className="stroke-[2.5]" />
            <span>New Project</span>
          </button>
        </div>

        {/* ── TOOLBAR: TABS & FILTERS ── */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3 shadow-xs space-y-2.5">
          
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
            {/* Table Search Input */}
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Filter by name, client, language..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--bg-panel)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-lg pl-8 pr-7 py-1.5 text-xs text-[var(--text-primary)] outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Dropdowns */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap text-xs">
              {uniqueClients.length > 0 && (
                <select
                  value={filterClient}
                  onChange={(e) => setFilterClient(e.target.value)}
                  className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-secondary)] outline-none cursor-pointer"
                >
                  <option value="all">All Clients</option>
                  {uniqueClients.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}

              {uniqueDomains.length > 0 && (
                <select
                  value={filterDomain}
                  onChange={(e) => setFilterDomain(e.target.value)}
                  className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-secondary)] outline-none cursor-pointer"
                >
                  <option value="all">All Domains</option>
                  {uniqueDomains.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-secondary)] outline-none cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="name_asc">Name (A-Z)</option>
              </select>
            </div>
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto text-xs font-medium pt-1 border-t border-[var(--border-subtle)]">
            {[
              { id: "active", label: "Active", count: activeCount },
              { id: "completed", label: "Completed", count: completedCount },
              { id: "on_hold", label: "On Hold", count: onHoldCount },
              { id: "archived", label: "Archived", count: archivedCount },
              { id: "shared", label: "Shared", count: sharedCount },
              { id: "all", label: "All Projects", count: safeProjects.length }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  statusFilter === tab.id
                    ? "bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-[10px] font-mono opacity-65 font-medium">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

        </div>

        {/* ── ENTERPRISE DATA TABLE ── */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-xs text-xs">
          {loading ? (
            <div className="py-20 text-center text-xs text-[var(--text-muted)]">Loading table...</div>
          ) : filteredProjects.length === 0 ? (
            <div className="py-16 px-6 text-center">
              <Folder size={28} className="mx-auto text-[var(--text-muted)] mb-2 opacity-50" />
              <div className="text-xs font-bold text-[var(--text-primary)]">No projects found</div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                {searchQuery || filterClient !== "all" || filterDomain !== "all"
                  ? "No projects match your active filters."
                  : "Create your first translation project to begin."}
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-3 inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-colors shadow-xs"
              >
                <Plus size={13} /> Create Project
              </button>
            </div>
          ) : (
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]/40 text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-5 font-bold w-[30%] rounded-tl-xl">Project</th>
                  <th className="py-3 px-4 font-bold w-[13%]">Domain</th>
                  <th className="py-3 px-4 font-bold w-[16%]">Languages</th>
                  <th className="py-3 px-4 font-bold w-[15%]">Progress</th>
                  <th className="py-3 px-4 font-bold w-[12%]">Status</th>
                  <th className="py-3 px-4 font-bold w-[10%]">Deadline</th>
                  <th className="py-3 px-5 text-right font-bold w-[4%] rounded-tr-xl">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredProjects.map((proj, idx) => {
                  const projStatus = proj.status || proj.settings?.status || "Active";
                  const projDomain = proj.settings?.domain || "General";
                  const rawDueDate = proj.dueDate || proj.deadline || proj.settings?.due_date;
                  const dueInfo = formatRelativeDate(rawDueDate);
                  const notesCount = proj.notesCount || 0;
                  const isNearBottom = filteredProjects.length > 2 && idx >= filteredProjects.length - 2;
                  const isRowActive = openStatusMenuProjectId === proj.id || openMenuProjectId === proj.id;

                  return (
                    <tr
                      key={proj.id}
                      onClick={() => onOpenProject(proj.id)}
                      className={`group hover:bg-[var(--bg-hover)] transition-colors cursor-pointer ${isRowActive ? "relative z-30" : ""}`}
                    >
                      {/* Project Name & Client */}
                      <td className="py-3.5 px-5 align-middle">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-7 w-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20">
                            <Folder size={13} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-bold text-xs text-[var(--text-primary)] group-hover:text-indigo-400 transition-colors truncate">
                                {proj.name}
                              </span>
                              {proj.isShared && (
                                <span className="px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[9px] font-bold shrink-0">
                                  Shared
                                </span>
                              )}
                            </div>
                            {proj.client && (
                              <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                                {proj.client}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Domain */}
                      <td className="py-3.5 px-4 align-middle">
                        <span className="text-xs text-[var(--text-secondary)] font-medium truncate block">
                          {projDomain}
                        </span>
                      </td>

                      {/* Languages */}
                      <td className="py-3.5 px-4 align-middle">
                        <div className="flex items-center gap-1.5 text-xs font-mono text-[var(--text-secondary)] truncate">
                          <span className="font-bold text-[var(--text-primary)]">{(proj.source_lang || "EN").toUpperCase()}</span>
                          <span className="text-[var(--text-muted)]">→</span>
                          <span>{proj.target_languages?.length || 0} targets</span>
                        </div>
                      </td>

                      {/* Translation Progress */}
                      <td className="py-3.5 px-4 align-middle">
                        <div className="flex flex-col gap-1 max-w-[130px]">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-mono text-[var(--text-muted)] text-[9px]">
                              {(proj.totalWords || 0).toLocaleString()} words
                            </span>
                            <span className="font-medium text-emerald-400">
                              {proj.progress || 0}%
                            </span>
                          </div>
                          <div className="w-full bg-[var(--bg-input)] h-1 rounded-full overflow-hidden border border-[var(--border-subtle)]">
                            <div 
                              className="bg-indigo-500 h-full rounded-full transition-all duration-300" 
                              style={{ width: `${proj.progress || 0}%` }} 
                            />
                          </div>
                        </div>
                      </td>

                      {/* Status (Direct Interactive Switcher) */}
                      <td className="py-3.5 px-4 align-middle" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() => setOpenStatusMenuProjectId(openStatusMenuProjectId === proj.id ? null : proj.id)}
                            className="-ml-1.5 flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-[var(--bg-panel)] text-xs font-medium transition-colors cursor-pointer border border-transparent hover:border-[var(--border-subtle)] group"
                            title="Click to change project status"
                          >
                            <span className={`w-1.5 h-1.5 rounded-xs ${getStatusDotColor(projStatus)} shrink-0`} />
                            <span className="text-[var(--text-primary)]">{formatStatusLabel(projStatus)}</span>
                            <ChevronDown size={11} className="text-[var(--text-muted)] opacity-60 group-hover:opacity-100 transition-opacity" />
                          </button>

                          {openStatusMenuProjectId === proj.id && (
                            <div className={`absolute left-0 ${isNearBottom ? "bottom-full mb-1.5" : "top-full mt-1.5"} w-36 bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-xl shadow-2xl z-50 py-1 text-xs select-none text-left animate-in fade-in zoom-in-95 duration-100`}>
                              <div className="px-2.5 py-1 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)] mb-0.5">
                                Change Status
                              </div>
                              {STATUS_OPTIONS.map((opt) => {
                                const isCurrent = normalizeStatus(projStatus) === opt.value;
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => handleUpdateProjectStatus(proj.id, opt.value)}
                                    className={`w-full text-left px-2.5 py-1.5 hover:bg-[var(--bg-hover)] flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                      isCurrent ? "font-bold text-indigo-400 bg-indigo-500/5" : "text-[var(--text-primary)]"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={`w-1.5 h-1.5 rounded-xs ${opt.dotColor}`} />
                                      <span>{opt.label}</span>
                                    </div>
                                    {isCurrent && <Check size={12} className="text-indigo-400" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Deadline */}
                      <td className="py-3.5 px-4 align-middle">
                        {dueInfo ? (
                          <span className={`text-[11px] font-medium block truncate ${dueInfo.isUrgent ? "text-rose-400 font-bold" : "text-[var(--text-muted)]"}`}>
                            {dueInfo.label}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)] font-mono text-[11px] block">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end">
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setOpenMenuProjectId(openMenuProjectId === proj.id ? null : proj.id)}
                              className="p-1 -mr-1 rounded-md hover:bg-[var(--bg-panel)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                            >
                              <MoreVertical size={14} />
                            </button>

                            {openMenuProjectId === proj.id && (
                              <div className={`absolute right-0 ${isNearBottom ? "bottom-full mb-1.5" : "top-full mt-1.5"} w-44 bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-xl shadow-2xl z-50 py-1 text-xs select-none text-left animate-in fade-in zoom-in-95 duration-100`}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSettingsModalProjectId(proj.id);
                                    setOpenMenuProjectId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-hover)] flex items-center gap-2 text-[var(--text-primary)]"
                                >
                                  <Settings size={13} /> Settings
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShareModalProject(proj);
                                    setOpenMenuProjectId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-hover)] flex items-center gap-2 text-[var(--text-primary)]"
                                >
                                  <Users size={13} /> Share Project
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNotesModalProject(proj);
                                    setOpenMenuProjectId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-hover)] flex items-center gap-2 text-[var(--text-primary)]"
                                >
                                  <StickyNote size={13} /> Project Notes {notesCount > 0 && `(${notesCount})`}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDuplicateModalProject(proj);
                                    setOpenMenuProjectId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-hover)] flex items-center gap-2 text-[var(--text-primary)]"
                                >
                                  <Copy size={13} /> Duplicate
                                </button>
                                {!proj.isShared && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuProjectId(null);
                                      handleDeleteProject(proj.id, proj.name);
                                    }}
                                    className="w-full text-left px-3 py-1.5 hover:bg-rose-500/10 text-rose-400 flex items-center gap-2 border-t border-[var(--border-subtle)] mt-1"
                                  >
                                    <Trash2 size={13} /> Delete
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </main>

      {/* ── FLOATING AI COMMAND BAR ── */}
      <SmartAIProjectBar
        onSuccess={() => loadProjects(true)}
        showToast={showToast}
        onOpenDuplicateModal={(projId) => {
          const found = projects.find((p) => String(p.id) === String(projId));
          setDuplicateModalProject(found || { id: projId, name: "Selected Project", target_lang: ["hi"] });
        }}
      />

      {/* ── MODALS ── */}
      <CreateProjectModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => loadProjects()}
        showToast={showToast}
      />

      {shareModalProject && (
        <ShareModal
          isOpen={!!shareModalProject}
          onClose={() => setShareModalProject(null)}
          projectId={shareModalProject.id}
          docName={shareModalProject.name}
          isOwner={!shareModalProject.isShared}
          mode="project"
        />
      )}

      {notesModalProject && (
        <ProjectNotesModal
          isOpen={!!notesModalProject}
          onClose={() => setNotesModalProject(null)}
          projectId={notesModalProject.id}
          projectName={notesModalProject.name}
          isOwner={!notesModalProject.isShared}
        />
      )}

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

      {showGlobalHistoryModal && (
        <ProjectHistoryModal
          isOpen={showGlobalHistoryModal}
          onClose={() => setShowGlobalHistoryModal(false)}
          projectId={null}
          projectName="Global Workspace"
          showToast={showToast}
        />
      )}

      {duplicateModalProject && (
        <DuplicateProjectModal
          project={duplicateModalProject}
          onClose={() => setDuplicateModalProject(null)}
          onSuccess={() => loadProjects()}
          showToast={showToast}
        />
      )}

    </div>
  );
}
