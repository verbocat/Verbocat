import React, { useState, useEffect } from "react";
import { Plus, Folder, User, Calendar, Trash2, Search, Filter, Globe, BookOpen, Settings, ChevronRight, LayoutDashboard, Users, Share2, MoreVertical, Copy, StickyNote } from "lucide-react";
import { fetchProjects, createProject, deleteProject, duplicateProject } from "../services/api";
import { LANGUAGES } from "../constants/languages";
import { ShareModal } from "./ShareModal";
import { ProjectNotesModal } from "./ProjectNotesModal";
import { SettingsModal } from "./SettingsModal";

export default function ProjectDashboard({ onOpenProject, showToast, theme, userRole, onOpenAdmin, onOpenSettings }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState("all"); // "all", "my", "shared"
  const [shareModalProject, setShareModalProject] = useState(null);
  const [notesModalProject, setNotesModalProject] = useState(null);
  const [settingsModalProjectId, setSettingsModalProjectId] = useState(null);
  const [openMenuProjectId, setOpenMenuProjectId] = useState(null);

  // Form states
  const [projName, setProjName] = useState("");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceLang, setSourceLang] = useState("en");
  const [selectedLangs, setSelectedLangs] = useState([]);
  const [langSearch, setLangSearch] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    loadProjects();
  }, []);

  // Click outside to close 3-dots dropdown
  useEffect(() => {
    const handleGlobalClick = () => setOpenMenuProjectId(null);
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
      showToast("Project deleted successfully");
      loadProjects();
    } catch (err) {
      console.error(err);
      showToast("Failed to delete project", "error");
    }
  };

  const toggleLanguage = (code) => {
    setSelectedLangs(prev => 
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const filteredProjects = projects.filter(proj => {
    const matchesSearch = proj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (proj.description && proj.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesClient = !filterClient || (proj.client && proj.client.toLowerCase().includes(filterClient.toLowerCase()));
    const matchesTab = activeTab === "all" ||
                       (activeTab === "my" && !proj.isShared) ||
                       (activeTab === "shared" && proj.isShared);
    return matchesSearch && matchesClient && matchesTab;
  });

  const myProjectsCount = projects.filter(p => !p.isShared).length;
  const sharedProjectsCount = projects.filter(p => p.isShared).length;

  return (
    <div className="h-screen overflow-y-auto bg-[var(--bg-base)] text-[var(--text-primary)] p-8">
      {/* Dashboard Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Project Dashboard
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Manage your translations with collaborative project workflows.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {userRole === "admin" && (
            <button
              onClick={onOpenAdmin}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 36, height: 36, borderRadius: 12,
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
                cursor: "pointer", transition: "all 0.2s ease"
              }}
              onMouseOver={(e) => e.currentTarget.style.background = "var(--bg-elevated)"}
              onMouseOut={(e) => e.currentTarget.style.background = "var(--bg-surface)"}
              title="Admin Panel"
            >
              <LayoutDashboard size={15} />
            </button>
          )}

          <button
            onClick={onOpenSettings}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: 12,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
              cursor: "pointer", transition: "all 0.2s ease"
            }}
            onMouseOver={(e) => e.currentTarget.style.background = "var(--bg-elevated)"}
            onMouseOut={(e) => e.currentTarget.style.background = "var(--bg-surface)"}
            title="Settings"
          >
            <Settings size={15} />
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer shadow-md transition-all"
          >
            <Plus size={16} /> Create Project
          </button>
        </div>
      </div>

      {/* Tabs & Search Bar */}
      <div className="max-w-7xl mx-auto flex flex-col gap-4 mb-8">
        <div className="flex items-center gap-2 bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-1.5 rounded-2xl w-fit">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "all"
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            All Projects ({projects.length})
          </button>
          <button
            onClick={() => setActiveTab("my")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "my"
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            My Projects ({myProjectsCount})
          </button>
          <button
            onClick={() => setActiveTab("shared")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "shared"
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Users size={13} />
            Shared with Me ({sharedProjectsCount})
          </button>
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-4 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3.5 top-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search projects by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-all"
            />
          </div>
          <div className="w-full md:w-64 relative">
            <Filter size={16} className="absolute left-3.5 top-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Filter by Client..."
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-all"
            />
          </div>
        </div>
      </div>

      {/* Projects List Grid */}
      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent mx-auto"></div>
            <p className="text-xs text-[var(--text-secondary)] mt-4">Loading your workspace projects...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl py-20 text-center">
            <Folder size={48} className="mx-auto text-[var(--text-muted)] mb-4" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">No projects found</h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto mt-2">
              {searchQuery || filterClient 
                ? "Try adjusting your search queries or filters." 
                : activeTab === "shared"
                  ? "No projects have been shared with you yet."
                  : "Get started by creating your first localization project."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((proj) => {
              const totalJobs = proj.jobStats?.total || 0;
              const completedJobs = proj.jobStats?.completed || 0;
              const completionPercent = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;
              const notesCount = proj.settings?.notes?.length || 0;

              return (
                <div 
                  key={proj.id}
                  className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-zinc-700/80 rounded-2xl p-5 flex flex-col justify-between shadow-lg transition-all group relative"
                >
                  <div>
                    {/* Card Header with 3-Dots Menu */}
                    <div className="flex justify-between items-start gap-2 relative">
                      <div className="flex items-center gap-2 min-w-0">
                        <Folder size={18} className="text-indigo-400 flex-shrink-0" />
                        <h3 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-indigo-400 transition-colors truncate">
                          {proj.name}
                        </h3>
                      </div>

                      {/* 3 Dots Menu Button */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuProjectId(openMenuProjectId === proj.id ? null : proj.id);
                          }}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all cursor-pointer"
                          title="Project Options"
                        >
                          <MoreVertical size={16} />
                        </button>

                        {/* Dropdown Popover */}
                        {openMenuProjectId === proj.id && (
                          <div 
                            className="absolute right-0 mt-1 w-48 bg-[var(--bg-elevated)] border border-[var(--border-medium)] rounded-xl shadow-2xl z-50 py-1 flex flex-col divide-y divide-[var(--border-subtle)] text-xs select-none"
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
                                  className="w-full text-left px-3.5 py-2 hover:bg-[var(--rose)]/10 text-[var(--text-rose)] hover:text-rose-400 flex items-center gap-2.5 font-bold cursor-pointer"
                                >
                                  <Trash2 size={14} /> Delete Project
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Shared / Client / Due Date Badges */}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {proj.isShared ? (
                        <span className="inline-flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-bold px-2 py-0.5 rounded-md">
                          <Users size={11} /> Shared by {proj.sharedBy || "Owner"}
                        </span>
                      ) : (
                        proj.client && (
                          <span className="inline-block bg-indigo-500/10 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            Client: {proj.client}
                          </span>
                        )
                      )}

                      {(() => {
                        const rawDueDate = proj.dueDate || proj.deadline || proj.settings?.dueDate;
                        if (!rawDueDate) return null;
                        const dueDateFormatted = new Date(rawDueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
                        return (
                          <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold px-2 py-0.5 rounded-md" title="Project Due Date">
                            <Calendar size={11} /> Due: {dueDateFormatted}
                          </span>
                        );
                      })()}

                      {notesCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setNotesModalProject(proj)}
                          className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold px-2 py-0.5 rounded-md hover:bg-amber-500/20 transition-all cursor-pointer"
                          title="Open Project Notes"
                        >
                          <StickyNote size={10} /> {notesCount} Note(s)
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] mt-3 line-clamp-2 leading-relaxed">
                      {proj.description || "No project description provided."}
                    </p>

                    {/* Target Languages Badges */}
                    <div className="flex flex-wrap gap-1 mt-4">
                      <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-input)] px-2 py-0.5 rounded-md border border-[var(--border-subtle)] font-semibold">
                        Source: {proj.source_lang.toUpperCase()}
                      </span>
                      {proj.target_languages && proj.target_languages.map(lang => (
                        <span 
                          key={lang} 
                          className="text-[10px] text-indigo-300 bg-indigo-500/5 px-2 py-0.5 rounded-md border border-indigo-500/10 font-semibold"
                        >
                          {lang.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Progress and Footer */}
                  <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
                    <div className="flex justify-between items-center text-[10px] text-[var(--text-secondary)] mb-2">
                      <span className="font-medium">{proj.fileCount} File(s)</span>
                      <span className="font-semibold">{completedJobs}/{totalJobs} Jobs Completed ({completionPercent}%)</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-[var(--bg-input)] h-1.5 rounded-full overflow-hidden mb-4">
                      <div 
                        className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${completionPercent}%` }}
                      ></div>
                    </div>

                    <button
                      onClick={() => onOpenProject(proj.id)}
                      className="w-full flex items-center justify-center gap-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-medium)] text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer"
                    >
                      Open Project <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Share Project Modal */}
      {shareModalProject && (
        <ShareModal
          isOpen={!!shareModalProject}
          onClose={() => setShareModalProject(null)}
          projectId={shareModalProject.id}
          docName={shareModalProject.name}
          isOwner={!shareModalProject.isShared}
        />
      )}

      {/* Collaborative Project Notes Modal */}
      {notesModalProject && (
        <ProjectNotesModal
          isOpen={!!notesModalProject}
          onClose={() => setNotesModalProject(null)}
          projectId={notesModalProject.id}
          projectName={notesModalProject.name}
          isOwner={!notesModalProject.isShared}
        />
      )}

      {/* Existing Settings Modal (Opened on Project Settings tab) */}
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

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl animate-[fadeIn_0.15s_ease-out]">
            <div className="p-6 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--bg-panel)]">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Create Localization Project</h2>
                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Initialize a collaborative space for document translations</p>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-[var(--text-secondary)] hover:text-white cursor-pointer text-xl font-bold"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleCreateProject}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
                
                {/* Left Column: Metadata */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                      Project Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Mobile Application v2"
                      value={projName}
                      onChange={(e) => setProjName(e.target.value)}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                        Client Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. VerboLabs"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                        Source Lang
                      </label>
                      <select
                        value={sourceLang}
                        onChange={(e) => setSourceLang(e.target.value)}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-all"
                      >
                        {LANGUAGES.map(lang => (
                          <option key={lang.code} value={lang.code}>
                            {lang.flag} {lang.name} ({lang.code.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                        Due Date
                      </label>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-all cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                      Description
                    </label>
                    <textarea
                      placeholder="Describe the scope, terminology rules, or client specifics..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-all resize-none"
                    />
                  </div>
                </div>

                {/* Right Column: Searchable Target Languages Panel */}
                <div className="flex flex-col h-full min-h-[300px]">
                  <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                    Target Language(s) ({selectedLangs.length} selected)
                  </label>
                  
                  <input
                    type="text"
                    placeholder="Search languages..."
                    value={langSearch}
                    onChange={(e) => setLangSearch(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] mb-3 focus:outline-none focus:border-[var(--accent)] transition-all"
                  />
                  
                  <div className="flex-1 min-h-0 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl p-3 overflow-y-auto grid grid-cols-2 gap-2 max-h-56">
                    {LANGUAGES.filter(lang => 
                      lang.name.toLowerCase().includes(langSearch.toLowerCase()) || 
                      lang.code.toLowerCase().includes(langSearch.toLowerCase())
                    ).map((lang) => {
                      const isSelected = selectedLangs.includes(lang.code);
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => toggleLanguage(lang.code)}
                          className={`flex items-center justify-between text-xs p-2.5 rounded-lg border transition-all cursor-pointer ${
                            isSelected 
                              ? "bg-indigo-500/20 border-indigo-500 text-indigo-300 font-semibold" 
                              : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white hover:border-zinc-700"
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <span className="text-base flex-shrink-0">{lang.flag}</span>
                            <span className="truncate">{lang.name}</span>
                          </span>
                          {isSelected && <span className="text-[10px] text-indigo-400 font-bold">✓</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected Languages Pills List */}
                  {selectedLangs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3 max-h-20 overflow-y-auto p-2 border border-[var(--border-subtle)]/50 rounded-xl bg-black/15">
                      {selectedLangs.map(code => {
                        const lang = LANGUAGES.find(l => l.code === code);
                        return (
                          <span key={code} className="inline-flex items-center gap-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            {lang?.flag} {lang?.name}
                            <button
                              type="button"
                              onClick={() => toggleLanguage(code)}
                              className="hover:text-rose-400 font-bold ml-1 cursor-pointer"
                            >
                              &times;
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 p-6 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-medium)] text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold px-5 py-2.5 rounded-xl cursor-pointer shadow-md transition-all"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
