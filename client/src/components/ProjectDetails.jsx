import React, { useState, useEffect, useRef } from "react";
import { 
  ArrowLeft, FileText, Globe, Play, Pause, XCircle, RotateCcw, 
  Download, Upload, CheckCircle2, AlertCircle, Eye, Database, BarChart3, TrendingUp, Folder, Plus, Trash2, 
  Settings, List, Activity, Calendar, User, Clock, ChevronDown, Check, Edit2, Copy, FileCode, CheckSquare, Square, RefreshCw, Users, LayoutDashboard, StickyNote, History, Sparkles
} from "lucide-react";
import io from "socket.io-client";
import { 
  fetchProjectDetails, uploadFileToProject, updateProjectLanguages, 
  controlJobQueue, downloadJobFile, downloadLanguageZip, downloadProjectZip, fetchProjectAnalytics, deleteDocument,
  updateProjectDetails, renameDocument, duplicateDocument, deleteProject
} from "../services/api";
import { LANGUAGES } from "../constants/languages";
import { ShareModal } from "./ShareModal";
import { ProjectNotesModal } from "./ProjectNotesModal";
import { ProjectHistoryModal } from "./ProjectHistoryModal";
import { BatchTranslateModal } from "./BatchTranslateModal";

export default function ProjectDetails({ projectId, onBack, onOpenEditor, showToast, theme, token, onOpenSettings, userId, userRole, onOpenAdmin }) {
  const [project, setProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showAddLangModal, setShowAddLangModal] = useState(false);
  const [selectedAddLangs, setSelectedAddLangs] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [replacingFileId, setReplacingFileId] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showBatchTranslateModal, setShowBatchTranslateModal] = useState(false);
  
  // Navigation Tabs state: "overview", "files", "languages", "analytics", "settings"
  const [activeTab, setActiveTab] = useState("overview");

  // Selection state for Files bulk actions
  const [selectedFiles, setSelectedFiles] = useState([]);

  // File Renaming state
  const [renamingFileId, setRenamingFileId] = useState(null);
  const [renamingFileName, setRenamingFileName] = useState("");

  // Editor language selection popup
  const [openLangSelectFileId, setOpenLangSelectFileId] = useState(null);
  const [openLangAction, setOpenLangAction] = useState("open"); // "open" or "view"

  // Settings Edit states
  const [editProjectName, setEditProjectName] = useState("");
  const [editClientName, setEditClientName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSourceLang, setEditSourceLang] = useState("en");
  const [editTargetLangs, setEditTargetLangs] = useState([]);
  const [editTranslationPrompt, setEditTranslationPrompt] = useState("");
  const [editAutoSave, setEditAutoSave] = useState(true);
  const [editNotifications, setEditNotifications] = useState(true);

  // Status dropdown in header
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const fileInputRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    loadProjectDetails();
    loadAnalytics();

    // Setup real-time socket updates for queue progress
    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const socket = io(socketUrl, { auth: { token } });
    socketRef.current = socket;

    socket.on("global-job-update", ({ jobId, status, progress, errorMessage }) => {
      setJobs(prevJobs => 
        prevJobs.map(job => 
          job.id === jobId 
            ? { ...job, status, progress, error_message: errorMessage } 
            : job
        )
      );
      if (status === "completed" || status === "failed") {
        loadAnalytics();
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [projectId]);

  const loadProjectDetails = async () => {
    try {
      const data = await fetchProjectDetails(projectId);
      setProject(data.project);
      setFiles(data.files || []);
      setJobs(data.jobs || []);

      // Prepopulate edit forms
      if (data.project) {
        setEditProjectName(data.project.name || "");
        setEditClientName(data.project.client || "");
        setEditDescription(data.project.description || "");
        setEditSourceLang(data.project.source_lang || "en");
        setEditTargetLangs(data.project.target_languages || []);
        
        const settings = data.project.settings || {};
        setEditTranslationPrompt(settings.translationPrompt || "");
        setEditAutoSave(settings.autoSave !== undefined ? settings.autoSave : true);
        setEditNotifications(settings.notifications !== undefined ? settings.notifications : true);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch project details.", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const data = await fetchProjectAnalytics(projectId);
      setAnalytics(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e) => {
    const filesList = Array.from(e.target.files);
    if (filesList.length === 0) return;

    setIsUploading(true);
    setUploadProgress({ current: 0, total: filesList.length });
    try {
      if (replacingFileId) {
        showToast("Replacing document version...");
        await deleteDocument(replacingFileId);
        setReplacingFileId(null);
      }

      let current = 0;
      for (const file of filesList) {
        current++;
        setUploadProgress({ current, total: filesList.length });
        await uploadFileToProject(projectId, file);
      }
      showToast("All files uploaded and segments parsed successfully!");
      loadProjectDetails();
      loadAnalytics();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Failed to upload one or more files.", "error");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      setReplacingFileId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteFile = async (fileId, name) => {
    if (!window.confirm(`Are you sure you want to delete file "${name}"? This deletes all associated translation jobs and segments.`)) {
      return;
    }

    try {
      showToast("Deleting file...");
      await deleteDocument(fileId);
      showToast("File deleted successfully!");
      setSelectedFiles(prev => prev.filter(id => id !== fileId));
      loadProjectDetails();
      loadAnalytics();
    } catch (err) {
      console.error(err);
      showToast("Failed to delete file", "error");
    }
  };

  const handleAddLanguages = async () => {
    if (selectedAddLangs.length === 0) {
      showToast("Please select at least one language", "error");
      return;
    }

    try {
      await updateProjectLanguages(projectId, selectedAddLangs);
      showToast("Languages updated and missing translation jobs generated.");
      setShowAddLangModal(false);
      loadProjectDetails();
      loadAnalytics();
    } catch (err) {
      console.error(err);
      showToast("Failed to update project target languages", "error");
    }
  };

  const handleDownloadJob = async (job) => {
    try {
      showToast(`Exporting translated file (${job.target_lang.toUpperCase()})...`);
      const extIndex = job.documents.name.lastIndexOf(".");
      const ext = extIndex !== -1 ? job.documents.name.substring(extIndex) : ".html";
      await downloadJobFile(job.id, job.documents.name.replace(/\.[^/.]+$/, ""), job.target_lang, ext);
      showToast("Download started!");
    } catch (err) {
      console.error(err);
      showToast("Export download failed", "error");
    }
  };

  const handleDownloadZipAll = async () => {
    if (jobs.length === 0) return;
    try {
      showToast("Generating project package ZIP...");
      await downloadProjectZip(projectId);
      showToast("ZIP download started!");
    } catch (err) {
      console.error(err);
      showToast("Failed to download project ZIP package", "error");
    }
  };

  const handleDownloadZipLanguage = async (lang) => {
    try {
      showToast(`Generating ZIP package for language: ${lang.toUpperCase()}...`);
      await downloadLanguageZip(projectId, lang);
      showToast("ZIP download started!");
    } catch (err) {
      console.error(err);
      showToast("Failed to download language ZIP package", "error");
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      showToast(`Updating status to ${newStatus}...`);
      const updated = await updateProjectDetails(projectId, { status: newStatus });
      setProject(updated);
      setShowStatusDropdown(false);
      showToast(`Project is now ${newStatus}`);
      loadProjectDetails();
    } catch (err) {
      console.error(err);
      showToast("Failed to update status", "error");
    }
  };

  const handleRenameFileSubmit = async (fileId) => {
    if (!renamingFileName.trim()) {
      setRenamingFileId(null);
      return;
    }
    try {
      await renameDocument(fileId, renamingFileName.trim());
      showToast("File renamed successfully!");
      setRenamingFileId(null);
      loadProjectDetails();
    } catch (err) {
      console.error(err);
      showToast("Failed to rename file", "error");
    }
  };

  const handleDuplicateFileSubmit = async (fileId) => {
    try {
      showToast("Duplicating document...");
      await duplicateDocument(fileId);
      showToast("Document duplicated successfully!");
      loadProjectDetails();
      loadAnalytics();
    } catch (err) {
      console.error(err);
      showToast("Failed to duplicate document", "error");
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      showToast("Saving project settings...");
      const updated = await updateProjectDetails(projectId, {
        name: editProjectName,
        client: editClientName,
        description: editDescription,
        sourceLanguage: editSourceLang,
        targetLanguages: editTargetLangs,
        settings: {
          translationPrompt: editTranslationPrompt,
          autoSave: editAutoSave,
          notifications: editNotifications
        }
      });
      setProject(updated);
      showToast("Settings updated successfully!");
      loadProjectDetails();
      loadAnalytics();
    } catch (err) {
      console.error(err);
      showToast("Failed to save settings", "error");
    }
  };

  const handleRemoveLanguage = async (langCode) => {
    if (!window.confirm(`Are you sure you want to remove target language "${getLanguageName(langCode)}"? This deletes all jobs and segments for this language.`)) {
      return;
    }
    try {
      const updatedLangs = project.target_languages.filter(l => l !== langCode);
      await updateProjectLanguages(projectId, updatedLangs);
      showToast(`Language ${getLanguageName(langCode)} removed successfully.`);
      loadProjectDetails();
      loadAnalytics();
    } catch (err) {
      console.error(err);
      showToast("Failed to remove language", "error");
    }
  };

  // Bulk actions handlers for Files tab
  const handleBulkDelete = async () => {
    if (selectedFiles.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete the ${selectedFiles.length} selected files?`)) return;
    showToast("Deleting selected files...");
    try {
      for (const fileId of selectedFiles) {
        await deleteDocument(fileId);
      }
      showToast("Selected files deleted successfully!");
      setSelectedFiles([]);
      loadProjectDetails();
      loadAnalytics();
    } catch (err) {
      console.error(err);
      showToast("Failed to delete some files.", "error");
    }
  };

  const handleBulkDownload = async () => {
    if (selectedFiles.length === 0) return;
    showToast("Exporting selected files...");
    try {
      for (const fileId of selectedFiles) {
        const fileJobs = jobs.filter(j => j.document_id === fileId && j.progress > 0);
        for (const job of fileJobs) {
          await handleDownloadJob(job);
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to download some files.", "error");
    }
  };

  const handleExportReports = () => {
    showToast("Generating project report CSV...");
    try {
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Report for Project: " + project.name + "\n";
      csvContent += "Client: " + (project.client || "N/A") + "\n";
      csvContent += "Status: " + (project.status || project.settings?.status || "Active") + "\n";
      csvContent += "Source Language: " + project.source_lang.toUpperCase() + "\n";
      csvContent += "Target Languages: " + project.target_languages.join(", ").toUpperCase() + "\n";
      csvContent += "Total Word Count: " + (analytics?.totalWordCount || 0) + "\n\n";
      
      csvContent += "Files Summary:\n";
      csvContent += "File Name,Word Count,Size (KB),Status\n";
      files.forEach(f => {
        csvContent += `"${f.name}",${f.word_count},${Math.round(f.file_size / 1024)},"${f.status}"\n`;
      });
      
      csvContent += "\nJobs Summary:\n";
      csvContent += "Document Name,Target Language,Progress,Status\n";
      jobs.forEach(j => {
        csvContent += `"${j.documents?.name || 'Document'}",${j.target_lang.toUpperCase()},${j.progress || 0}%,${j.status}\n`;
      });
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `project_${project.name.replace(/\s+/g, "_")}_report.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Report exported!");
    } catch (err) {
      console.error(err);
      showToast("Failed to export report", "error");
    }
  };

  const handleDeleteProjectClick = async () => {
    if (!window.confirm(`Are you sure you want to delete project "${project.name}"? This deletes all files and translations. This action CANNOT be undone.`)) {
      return;
    }
    try {
      showToast("Deleting project...");
      await deleteProject(projectId);
      showToast("Project deleted successfully");
      onBack();
    } catch (err) {
      console.error(err);
      showToast("Failed to delete project", "error");
    }
  };

  const toggleSelectFile = (fileId) => {
    setSelectedFiles(prev => 
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    );
  };

  const toggleSelectAllFiles = () => {
    if (selectedFiles.length === files.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(files.map(f => f.id));
    }
  };

  const getLanguageMetrics = (langCode) => {
    const langJobs = jobs.filter(j => j.target_lang === langCode);
    const totalFilesCount = files.length;
    const completedFilesCount = langJobs.filter(j => j.status === "completed").length;
    const pendingFilesCount = totalFilesCount - completedFilesCount;
    
    const totalProgress = langJobs.reduce((sum, j) => sum + (j.progress || 0), 0);
    const progress = langJobs.length > 0 ? Math.round(totalProgress / langJobs.length) : 0;
    
    return { progress, totalFiles: totalFilesCount, completedFiles: completedFilesCount, pendingFiles: pendingFilesCount };
  };

  const getLanguageName = (code) => {
    const found = LANGUAGES.find(l => l.code === code);
    return found ? found.name : code.toUpperCase();
  };

  const getStatusColorClass = (status) => {
    const cleanStatus = String(status || "").toLowerCase();
    switch (cleanStatus) {
      case "active": return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
      case "completed": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20";
      case "archived": return "bg-zinc-500/20 text-zinc-600 dark:text-zinc-400 border border-zinc-500/30";
      default: return "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20";
    }
  };

  const handleOpenLanguageSelection = (fileId, action) => {
    setOpenLangSelectFileId(fileId);
    setOpenLangAction(action);
  };

  const handleOpenEditorWithLang = (fileId, langCode) => {
    const foundJob = jobs.find(j => j.document_id === fileId && j.target_lang === langCode);
    setOpenLangSelectFileId(null);
    if (foundJob) {
      onOpenEditor(foundJob.id, fileId, langCode);
    } else {
      showToast(`No translation job found for ${getLanguageName(langCode)}`, "error");
    }
  };

  const handleUploadNewVersion = (fileId) => {
    setReplacingFileId(fileId);
    fileInputRef.current?.click();
  };

  // Calculations for Overview dashboard
  const totalFiles = files.length;
  const totalLanguages = project?.target_languages?.length || 0;
  const totalTranslationJobs = jobs.length;
  const completedJobs = jobs.filter(j => j.status === "completed").length;
  const inProgressJobs = jobs.filter(j => j.status === "running").length;
  const pendingJobs = jobs.filter(j => j.status === "pending").length;
  const failedJobs = jobs.filter(j => j.status === "failed").length;
  const totalWordsCount = files.reduce((sum, f) => sum + (f.word_count || 0), 0);
  
  const overallProgressPercent = jobs.length > 0 
    ? Math.round(jobs.reduce((sum, j) => sum + (j.progress || 0), 0) / jobs.length) 
    : 0;

  const overallVerifiedPercent = jobs.length > 0
    ? Math.round(jobs.reduce((sum, j) => sum + (j.verifiedProgress || 0), 0) / jobs.length)
    : 0;

  const projectStatus = project?.status || project?.settings?.status || "Active";
  const isProjectOwner = project && project.owner_id === userId;

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center p-6 text-[var(--text-primary)]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent mb-4"></div>
        <p className="text-xs text-[var(--text-secondary)]">Loading project files and translation details...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      
      {/* ── TOP NAV BAR & GLOBAL ACTIONS ── */}
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] px-8 py-4 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center justify-center h-8 w-8 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="Back to Dashboard"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                {project.name}
              </h1>
              
              {/* Dynamic Status Dropdown Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowStatusDropdown(prev => !prev)}
                  className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full select-none cursor-pointer transition-all ${getStatusColorClass(projectStatus)}`}
                >
                  Status: {projectStatus} <ChevronDown size={10} />
                </button>
                {showStatusDropdown && (
                  <div className="absolute left-0 mt-1.5 w-32 bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-xl py-1 shadow-2xl z-50">
                    {["Active", "Completed", "Archived"].map((st) => (
                      <button
                        key={st}
                        onClick={() => handleStatusChange(st)}
                        className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] flex items-center justify-between cursor-pointer"
                      >
                        <span>{st}</span>
                        {projectStatus === st && <Check size={10} className="text-indigo-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)] mt-1 font-medium flex-wrap">
              {project.client && (
                <span>
                  Client: <strong className="text-[var(--text-secondary)]">{project.client}</strong>
                </span>
              )}
              {(() => {
                const rawDueDate = project.dueDate || project.deadline || project.settings?.dueDate || project.settings?.deadline;
                if (!rawDueDate) return null;
                const formattedDueDate = new Date(rawDueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
                return (
                  <span className="inline-flex items-center gap-1.5 text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-md font-bold text-[10px]">
                    <Calendar size={11} /> Due: {formattedDueDate}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>

      {/* Global Action Buttons (Top-Right Corner) */}
        <div className="project-actions-shell">
          
          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="project-primary-action"
            title="Upload Files"
          >
            <span className="project-action-icon">
              <Upload size={14} />
            </span>
            <span className="flex flex-col items-start leading-none">
              <span className="text-[11px] font-black tracking-wide uppercase">Upload Files</span>
              <span className="text-[10px] font-medium text-white/70">Add documents to this project</span>
            </span>
          </button>

          <button
            onClick={() => setShowBatchTranslateModal(true)}
            className="project-primary-action bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500"
            title="Batch Auto-Translate Files & Languages"
          >
            <span className="project-action-icon">
              <Sparkles size={14} />
            </span>
            <span className="flex flex-col items-start leading-none">
              <span className="text-[11px] font-black tracking-wide uppercase">Translate Files</span>
              <span className="text-[10px] font-medium text-white/70">Auto-translate selected jobs</span>
            </span>
          </button>

          <button
            onClick={() => {
              setSelectedAddLangs(project.target_languages || []);
              setShowAddLangModal(true);
            }}
            className="project-secondary-action"
            title="Add Languages"
          >
            <span className="project-action-icon subtle">
              <Plus size={14} />
            </span>
            <span className="flex flex-col items-start leading-none">
              <span className="text-[11px] font-bold tracking-wide uppercase">Add Language</span>
              <span className="text-[10px] font-medium text-[var(--text-muted)]">Create more target variants</span>
            </span>
          </button>

          <button
            onClick={() => setShowHistoryModal(true)}
            className="project-secondary-action"
            title="Project Audit History"
          >
            <span className="project-action-icon subtle">
              <History size={14} className="text-indigo-400" />
            </span>
            <span className="flex flex-col items-start leading-none">
              <span className="text-[11px] font-bold tracking-wide uppercase">History</span>
              <span className="text-[10px] font-medium text-[var(--text-muted)]">Audit trail & logs</span>
            </span>
          </button>

          <div className="project-divider"></div>

          <div className="project-icon-actions">
            <button
              onClick={handleDownloadZipAll}
              disabled={jobs.length === 0}
              className="project-icon-action"
              title="Download ZIP"
            >
              <Download size={14} />
            </button>

            <button
              onClick={handleExportReports}
              className="project-icon-action"
              title="Export Reports"
            >
              <FileCode size={14} />
            </button>

            <button
              onClick={() => setShowShareModal(true)}
              className="project-icon-action"
              title="Share Project"
            >
              <Users size={14} />
            </button>

            <button
              onClick={() => setShowNotesModal(true)}
              className="project-icon-action"
              title="Project Notes"
            >
              <StickyNote size={14} />
            </button>

            {userRole === "admin" && (
              <button
                onClick={onOpenAdmin}
                className="project-icon-action"
                title="Admin Panel"
              >
                <LayoutDashboard size={14} />
              </button>
            )}

            {isProjectOwner && (
              <button
                onClick={onOpenSettings}
                className="project-icon-action"
                title="Project Settings"
              >
                <Settings size={14} />
              </button>
            )}
          </div>

        </div>
      </header>

      {/* ── PROJECT SUMMARY MINI-BANNER ── */}
      <section className="bg-[var(--bg-panel)]/40 border-b border-[var(--border-subtle)] px-8 py-3 flex flex-wrap gap-x-8 gap-y-2 text-xs text-[var(--text-secondary)] shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          <Globe size={13} className="text-indigo-500" />
          <span>Source: <strong className="text-[var(--text-primary)]">{project.source_lang.toUpperCase()}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar size={13} className="text-purple-500" />
          <span>Created: <strong className="text-[var(--text-primary)]">{new Date(project.created_at).toLocaleDateString()}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock size={13} className="text-blue-500" />
          <span>Updated: <strong className="text-[var(--text-primary)]">{new Date(project.updated_at || project.created_at).toLocaleDateString()}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <Database size={13} className="text-amber-500" />
          <span>Words: <strong className="text-[var(--text-primary)]">{analytics?.totalWordCount?.toLocaleString() || 0}</strong></span>
        </div>
        
        {/* Overall Progress Dual Bars */}
        <div className="flex items-center gap-6 ml-auto">
          <div className="flex items-center gap-2 min-w-[130px]">
            <span className="text-[11px] font-bold text-indigo-500">Translated {overallProgressPercent}%</span>
            <div className="w-20 bg-[var(--bg-input)] h-2 rounded-full overflow-hidden border border-[var(--border-subtle)]">
              <div 
                className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${overallProgressPercent}%` }}
              ></div>
            </div>
          </div>

          <div className="flex items-center gap-2 min-w-[130px]">
            <span className="text-[11px] font-bold text-emerald-500">Verified {overallVerifiedPercent}%</span>
            <div className="w-20 bg-[var(--bg-input)] h-2 rounded-full overflow-hidden border border-[var(--border-subtle)]">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${overallVerifiedPercent}%` }}
              ></div>
            </div>
          </div>
        </div>
      </section>

      {/* ── INTERIOR NAVIGATION TABS ── */}
      <nav className="bg-[var(--bg-panel)]/80 px-8 flex border-b border-[var(--border-subtle)] shrink-0 select-none">
        {[
          { id: "overview", label: "Overview", icon: BarChart3 },
          { id: "files", label: "Files", icon: FileText },
          { id: "languages", label: "Languages", icon: Globe },
          { id: "analytics", label: "Analytics", icon: TrendingUp }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                isActive 
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5" 
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
        
        {/* Header Action Dropdown at the far right of tabs */}
        <div className="ml-auto flex items-center pr-2">
          <div className="relative group">
            <button className="project-utility-trigger">
              <span className="flex items-center gap-2">
                <span className="project-utility-trigger-dot" />
                Quick Actions
              </span>
              <ChevronDown size={10} />
            </button>
            <div className="project-quick-menu">
              <div className="project-quick-menu-header">
                <span>Workspace Actions</span>
                <span>Everything in one place</span>
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="project-quick-item">
                <span className="project-quick-item-icon"><Upload size={12} /></span>
                <span>
                  <strong>Upload files</strong>
                  <small>Bring more documents into the project</small>
                </span>
              </button>
              <button onClick={() => { setSelectedAddLangs(project.target_languages || []); setShowAddLangModal(true); }} className="project-quick-item">
                <span className="project-quick-item-icon"><Plus size={12} /></span>
                <span>
                  <strong>Add language</strong>
                  <small>Create a new target locale version</small>
                </span>
              </button>
              <button onClick={handleDownloadZipAll} className="project-quick-item">
                <span className="project-quick-item-icon"><Download size={12} /></span>
                <span>
                  <strong>Download ZIP</strong>
                  <small>Export every translated file</small>
                </span>
              </button>
              {isProjectOwner && (
                <>
                  <button onClick={onOpenSettings} className="project-quick-item">
                    <span className="project-quick-item-icon"><Settings size={12} /></span>
                    <span>
                      <strong>Project settings</strong>
                      <small>Change metadata and workflow rules</small>
                    </span>
                  </button>
                  <div className="project-quick-menu-sep"></div>
                  <button onClick={handleDeleteProjectClick} className="project-quick-item danger">
                    <span className="project-quick-item-icon danger"><Trash2 size={12} /></span>
                    <span>
                      <strong>Delete project</strong>
                      <small>Permanently remove files and jobs</small>
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── CONTENT BODY AREA (SCROLLABLE) ── */}
      <main className="flex-1 overflow-y-auto p-8 bg-[var(--bg-base)]">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* ── UPLOADING OVERLAY INDICATOR ── */}
          {isUploading && uploadProgress && (
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 flex items-center justify-between gap-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-4 w-4 border border-indigo-500 border-t-transparent"></div>
                <span className="text-xs font-bold text-indigo-400">Uploading Document ({uploadProgress.current}/{uploadProgress.total})</span>
              </div>
              <div className="flex-1 max-w-md bg-[var(--bg-input)] h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* ── TAB 1: OVERVIEW DASHBOARD ── */}
          {activeTab === "overview" && (
            <div className="space-y-8 animate-[fadeIn_0.15s_ease-out]">
              
              {/* Summary Metrics Cards Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                
                {[
                  { label: "Total Files", val: totalFiles, color: "text-[var(--text-primary)]" },
                  { label: "Total Languages", val: totalLanguages, color: "text-indigo-600 dark:text-indigo-400" },
                  { label: "Total Jobs", val: totalTranslationJobs, color: "text-blue-600 dark:text-blue-400" },
                  { label: "Completed", val: completedJobs, color: "text-emerald-600 dark:text-emerald-400" },
                  { label: "In Progress", val: inProgressJobs, color: "text-purple-600 dark:text-purple-400" },
                  { label: "Pending", val: pendingJobs, color: "text-amber-600 dark:text-amber-400" },
                  { label: "Failed", val: failedJobs, color: "text-rose-600 dark:text-rose-400" },
                  { label: "Total Words", val: totalWordsCount?.toLocaleString(), color: "text-teal-600 dark:text-teal-400" }
                ].map((card, i) => (
                  <div key={i} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">{card.label}</span>
                    <span className={`text-lg font-black mt-2 ${card.color}`}>{card.val}</span>
                  </div>
                ))}

              </div>

              {/* Progress Summary full width without timeline */}
              <div className="grid grid-cols-1 gap-8">
                <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-md space-y-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Translation Progress Breakdown</h3>
                  
                  {project?.target_languages?.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] py-6 text-center">Configure target languages to see progress metrics.</p>
                  ) : (
                    <div className="space-y-4">
                      {project.target_languages.map(lang => {
                        const metrics = getLanguageMetrics(lang);
                        return (
                          <div key={lang} className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-[var(--text-primary)]">{getLanguageName(lang)} ({lang.toUpperCase()})</span>
                              <span className="font-bold text-indigo-500">{metrics.progress}%</span>
                            </div>
                            <div className="bg-[var(--bg-input)] h-2 rounded-full overflow-hidden border border-[var(--border-subtle)]">
                              <div 
                                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500"
                                style={{ width: `${metrics.progress}%` }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ── TAB 2: FILES MANAGEMENT ── */}
          {activeTab === "files" && (
            <div className="space-y-6 animate-[fadeIn_0.15s_ease-out]">
              
              {/* Bulk Actions Header Toolbar */}
              <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={toggleSelectAllFiles}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] mr-2 cursor-pointer"
                  >
                    {selectedFiles.length === files.length && files.length > 0 ? (
                      <CheckSquare size={18} className="text-indigo-500" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                  <span className="text-xs text-[var(--text-secondary)] font-semibold">
                    {selectedFiles.length} Selected
                  </span>
                </div>
                
                {/* Bulk operation buttons */}
                <div className="flex items-center gap-2">
                  <button
                    disabled={selectedFiles.length === 0}
                    onClick={handleBulkDownload}
                    className="flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                  >
                    <Download size={12} /> Download Selected
                  </button>
                  <button
                    disabled={selectedFiles.length === 0}
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                  >
                    <Trash2 size={12} /> Delete Selected
                  </button>
                </div>
              </div>

              {/* Files Table Container */}
              <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-lg">
                {files.length === 0 ? (
                  <div className="text-center py-24 text-[var(--text-muted)] text-xs">
                    <FileText size={48} className="mx-auto mb-4 text-zinc-600" />
                    <p>No documents uploaded to this project yet.</p>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl cursor-pointer"
                    >
                      Upload First File
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto lg:overflow-x-visible min-h-[280px]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border-subtle)] text-[10px] uppercase font-bold text-[var(--text-muted)] bg-[var(--bg-surface)] select-none">
                          <th className="py-4 px-5 w-10"></th>
                          <th className="py-4 px-4">File Name</th>
                          <th className="py-4 px-4 w-28">File Type</th>
                          <th className="py-4 px-4 w-28 text-right">Word Count</th>
                          <th className="py-4 px-4 w-40">Languages</th>
                          <th className="py-4 px-4 w-32">Progress</th>
                          <th className="py-4 px-4 w-32">Status</th>
                          <th className="py-4 px-4 w-36">Last Modified</th>
                          <th className="py-4 px-5 text-right w-44">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                        {files.map(file => {
                          const isSelected = selectedFiles.includes(file.id);
                          const fileJobs = jobs.filter(j => j.document_id === file.id);
                          
                          // File Progress average (Translated & Verified)
                          const avgProgress = fileJobs.length > 0
                            ? Math.round(fileJobs.reduce((sum, j) => sum + (j.progress || 0), 0) / fileJobs.length)
                            : 0;

                          const avgVerified = fileJobs.length > 0
                            ? Math.round(fileJobs.reduce((sum, j) => sum + (j.verifiedProgress || 0), 0) / fileJobs.length)
                            : 0;

                          // File Status accurate logic
                          const hasRunning = fileJobs.some(j => j.status === "running");
                          const allCompleted = fileJobs.length > 0 && fileJobs.every(j => j.status === "completed" || j.progress === 100 || avgProgress === 100);
                          const hasCancelled = fileJobs.some(j => j.status === "cancelled");
                          const hasFailed = fileJobs.some(j => j.status === "failed");

                          const fileStatus = hasRunning 
                            ? "translating" 
                            : (allCompleted 
                              ? "completed" 
                              : (hasCancelled 
                                ? "cancelled" 
                                : (hasFailed 
                                  ? "failed" 
                                  : (avgProgress > 0 ? "in progress" : "pending"))));

                          const extIndex = file.name.lastIndexOf(".");
                          const ext = extIndex !== -1 ? file.name.substring(extIndex).toUpperCase() : "UNKNOWN";

                          return (
                            <tr key={file.id} className="hover:bg-[var(--bg-surface)]/40 transition-colors">
                              
                              {/* Checkbox selector */}
                              <td className="py-4 px-5">
                                <button onClick={() => toggleSelectFile(file.id)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer">
                                  {isSelected ? <CheckSquare size={16} className="text-indigo-500" /> : <Square size={16} />}
                                </button>
                              </td>

                              {/* Document Name / Inline Rename Input */}
                              <td className="py-4 px-4 font-semibold text-[var(--text-primary)]">
                                {renamingFileId === file.id ? (
                                  <div className="flex items-center gap-2 max-w-xs">
                                    <input
                                      type="text"
                                      value={renamingFileName}
                                      onChange={(e) => setRenamingFileName(e.target.value)}
                                      className="bg-[var(--bg-input)] border border-indigo-500 rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none"
                                      onKeyDown={(e) => e.key === "Enter" && handleRenameFileSubmit(file.id)}
                                      autoFocus
                                    />
                                    <button onClick={() => handleRenameFileSubmit(file.id)} className="text-emerald-500 p-1 cursor-pointer">
                                      <Check size={14} />
                                    </button>
                                    <button onClick={() => setRenamingFileId(null)} className="text-rose-500 p-1 cursor-pointer">
                                      <XCircle size={14} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 max-w-xs truncate" title={file.name}>
                                    <span>{file.name}</span>
                                    <button 
                                      onClick={() => { setRenamingFileId(file.id); setRenamingFileName(file.name); }}
                                      className="opacity-0 hover:opacity-100 group-hover:opacity-100 p-1 hover:text-[var(--text-primary)] text-[var(--text-muted)] cursor-pointer"
                                      title="Rename"
                                    >
                                      <Edit2 size={11} />
                                    </button>
                                  </div>
                                )}
                              </td>

                              {/* File Type */}
                              <td className="py-4 px-4 text-[var(--text-secondary)] font-semibold">
                                <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700/60 font-black text-[9px]">
                                  {ext.replace(".", "")}
                                </span>
                              </td>

                              {/* Word Count */}
                              <td className="py-4 px-4 text-right font-semibold text-[var(--text-secondary)]">
                                {file.word_count?.toLocaleString() || 0}
                              </td>

                              {/* Target Languages */}
                              <td className="py-4 px-4">
                                <div className="flex flex-wrap gap-1 max-w-[140px]">
                                  {fileJobs.map(j => (
                                    <span 
                                      key={j.id} 
                                      className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase border ${
                                        j.status === "completed" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-zinc-800 text-zinc-400 border-zinc-700"
                                      }`}
                                      title={`${getLanguageName(j.target_lang)}: Translated ${j.progress}%, Verified ${j.verifiedProgress || 0}%`}
                                    >
                                      {j.target_lang}
                                    </span>
                                  ))}
                                </div>
                              </td>

                              {/* File Progress bars (Translated & Verified) */}
                              <td className="py-4 px-4">
                                <div className="flex flex-col gap-1 text-[10px]">
                                  <div className="flex items-center gap-1.5" title={`Translated: ${avgProgress}%`}>
                                    <span className="font-bold text-indigo-500 text-[9px] w-6 shrink-0">{avgProgress}%</span>
                                    <div className="w-14 bg-[var(--bg-input)] h-1.5 rounded-full overflow-hidden border border-[var(--border-subtle)]">
                                      <div className="bg-indigo-500 h-full rounded-full transition-all duration-300" style={{ width: `${avgProgress}%` }}></div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5" title={`Verified: ${avgVerified}%`}>
                                    <span className="font-bold text-emerald-500 text-[9px] w-6 shrink-0">{avgVerified}%</span>
                                    <div className="w-14 bg-[var(--bg-input)] h-1.5 rounded-full overflow-hidden border border-[var(--border-subtle)]">
                                      <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: `${avgVerified}%` }}></div>
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* File Status Badge */}
                              <td className="py-4 px-4 capitalize">
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                                  fileStatus === "completed" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                  fileStatus === "translating" ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/20 animate-pulse" :
                                  fileStatus === "in progress" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                                  fileStatus === "cancelled" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                                  fileStatus === "failed" ? "bg-rose-500/10 text-rose-500 border-rose-500/20" :
                                  "bg-zinc-800 text-zinc-400 border-zinc-700"
                                }`}>
                                  {fileStatus}
                                </span>
                              </td>

                              {/* Last Modified Date */}
                              <td className="py-4 px-4 text-[var(--text-secondary)] font-medium">
                                {new Date(file.created_at).toLocaleDateString()}
                              </td>

                              {/* Action buttons dropdown / options */}
                              <td className="py-4 px-5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  
                                  {/* Open Dropdown trigger */}
                                  <div className="relative">
                                    <button
                                      onClick={() => handleOpenLanguageSelection(file.id, "open")}
                                      className="bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-medium)] text-[var(--text-primary)] text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-all shadow-sm active:scale-[0.95]"
                                    >
                                      Open
                                    </button>
                                    
                                    {openLangSelectFileId === file.id && openLangAction === "open" && (
                                      <div className="absolute right-0 mt-1.5 w-44 bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-xl py-1 shadow-2xl z-50 text-left">
                                        <div className="px-3 py-1.5 text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)]">Open in Editor</div>
                                        {fileJobs.map(job => (
                                          <button
                                            key={job.id}
                                            onClick={() => handleOpenEditorWithLang(file.id, job.target_lang)}
                                            className="w-full px-3 py-1.5 hover:bg-[var(--bg-elevated)] text-xs text-left text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-between cursor-pointer"
                                          >
                                            <span>{getLanguageName(job.target_lang)}</span>
                                            <span className="text-[10px] text-indigo-500 font-bold">{job.progress}%</span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* View Translations Dropdown trigger */}
                                  <div className="relative">
                                    <button
                                      onClick={() => handleOpenLanguageSelection(file.id, "view")}
                                      className="bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-medium)] text-[var(--text-primary)] text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-all shadow-sm active:scale-[0.95]"
                                    >
                                      Download
                                    </button>
                                    
                                    {openLangSelectFileId === file.id && openLangAction === "view" && (
                                      <div className="absolute right-0 mt-1.5 w-44 bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-xl py-1 shadow-2xl z-50 text-left">
                                        <div className="px-3 py-1.5 text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)]">Export Translation</div>
                                        {fileJobs.map(job => (
                                          <button
                                            key={job.id}
                                            onClick={() => { setOpenLangSelectFileId(null); handleDownloadJob(job); }}
                                            className="w-full px-3 py-1.5 hover:bg-[var(--bg-elevated)] text-xs text-left text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-between cursor-pointer"
                                          >
                                            <span>{getLanguageName(job.target_lang)}</span>
                                            <Download size={10} className="text-zinc-500" />
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Action Options Dropdown */}
                                  <div className="relative group">
                                    <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 hover:bg-[var(--bg-hover)] rounded-lg transition-all cursor-pointer">
                                      <ChevronDown size={14} />
                                    </button>
                                    <div className="absolute right-0 mt-1 w-44 bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-xl py-1 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-left">
                                      <button 
                                        onClick={() => handleDuplicateFileSubmit(file.id)}
                                        className="w-full px-4 py-2 hover:bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-2 cursor-pointer"
                                      >
                                        <Copy size={12} /> Duplicate File
                                      </button>
                                      <button 
                                        onClick={() => handleUploadNewVersion(file.id)}
                                        className="w-full px-4 py-2 hover:bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-2 cursor-pointer"
                                      >
                                        <Upload size={12} /> Upload New Version
                                      </button>
                                      <div className="h-px bg-[var(--border-subtle)] my-1"></div>
                                      <button 
                                        onClick={() => handleDeleteFile(file.id, file.name)}
                                        className="w-full px-4 py-2 hover:bg-[var(--bg-elevated)] text-xs text-rose-500 flex items-center gap-2 cursor-pointer"
                                      >
                                        <Trash2 size={12} /> Delete File
                                      </button>
                                    </div>
                                  </div>

                                </div>
                              </td>

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ── TAB 3: LANGUAGES LIST ── */}
          {activeTab === "languages" && (
            <div className="space-y-6 animate-[fadeIn_0.15s_ease-out]">
              
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Target Translation Languages</h3>
                <button
                  onClick={() => {
                    setSelectedAddLangs(project.target_languages || []);
                    setShowAddLangModal(true);
                  }}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                >
                  <Plus size={14} /> Add Target Language
                </button>
              </div>

              {project?.target_languages?.length === 0 ? (
                <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl py-20 text-center text-xs text-[var(--text-muted)] shadow-md">
                  <Globe size={48} className="mx-auto text-zinc-600 mb-4" />
                  <p>No target languages configured for this project.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {project.target_languages.map(lang => {
                    const metrics = getLanguageMetrics(lang);
                    return (
                      <div key={lang} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-5 flex flex-col justify-between shadow-md group">
                        
                        <div>
                          {/* Card header */}
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <h4 className="text-sm font-bold text-[var(--text-primary)]">{getLanguageName(lang)}</h4>
                              <span className="text-[10px] uppercase font-black text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/10 px-2 py-0.5 rounded mt-1.5 inline-block">
                                {lang}
                              </span>
                            </div>
                            
                            {/* Actions options menu */}
                            <div className="relative group/actions">
                              <button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded hover:bg-[var(--bg-hover)] transition-all cursor-pointer">
                                <ChevronDown size={14} />
                              </button>
                              <div className="absolute right-0 mt-1 w-40 bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-xl py-1 shadow-2xl opacity-0 invisible group-hover/actions:opacity-100 group-hover/actions:visible transition-all z-50 text-left">
                                <button 
                                  onClick={() => handleDownloadZipLanguage(lang)}
                                  className="w-full px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] flex items-center gap-2 text-left cursor-pointer"
                                >
                                  <Download size={12} /> Download ZIP
                                </button>
                                <div className="h-px bg-[var(--border-subtle)] my-1"></div>
                                <button 
                                  onClick={() => handleRemoveLanguage(lang)}
                                  className="w-full px-4 py-2 text-xs text-rose-500 hover:bg-[var(--bg-elevated)] flex items-center gap-2 text-left cursor-pointer"
                                >
                                  <Trash2 size={12} /> Remove Language
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Stats Grid */}
                          <div className="grid grid-cols-3 gap-2.5 my-5 bg-black/15 p-3 rounded-xl border border-[var(--border-subtle)]/40 text-center select-none">
                            <div>
                              <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Files</span>
                              <p className="text-sm font-black text-[var(--text-primary)] mt-0.5">{metrics.totalFiles}</p>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Completed</span>
                              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{metrics.completedFiles}</p>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Pending</span>
                              <p className="text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5">{metrics.pendingFiles}</p>
                            </div>
                          </div>
                        </div>

                        {/* Progress Bar footer */}
                        <div className="pt-2 border-t border-[var(--border-subtle)]">
                          <div className="flex justify-between items-center text-xs mb-1.5 font-semibold">
                            <span className="text-[var(--text-secondary)]">Translation Progress</span>
                            <span className="text-indigo-500">{metrics.progress}%</span>
                          </div>
                          <div className="w-full bg-[var(--bg-input)] h-1.5 rounded-full overflow-hidden border border-[var(--border-subtle)]">
                            <div className="bg-indigo-500 h-full" style={{ width: `${metrics.progress}%` }}></div>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          )}

          {/* ── TAB 4: ANALYTICS & CHARTS ── */}
          {activeTab === "analytics" && (
            <div className="space-y-8 animate-[fadeIn_0.15s_ease-out]">
              
              {/* Main Progress Breakdown */}
              <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-md space-y-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Translation Progress</h3>
                
                {project?.target_languages?.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] text-center py-6">No languages configured yet.</p>
                ) : (
                  <div className="space-y-4">
                    {project.target_languages.map(lang => {
                      const metrics = getLanguageMetrics(lang);
                      return (
                        <div key={lang} className="space-y-2">
                          <div className="flex justify-between text-xs font-semibold">
                            <span>{getLanguageName(lang)} ({lang.toUpperCase()})</span>
                            <span className="text-indigo-500">{metrics.progress}% Complete</span>
                          </div>
                          <div className="relative w-full bg-[var(--bg-input)] h-4 rounded-full overflow-hidden border border-[var(--border-subtle)] text-[10px] text-center select-none flex items-center justify-center">
                            <div 
                              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 z-0"
                              style={{ width: `${metrics.progress}%` }}
                            ></div>
                            <span className="relative z-10 text-white font-bold">{metrics.progress}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Word Count & Queue Status Splits */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Word Count metrics */}
                <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-md space-y-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Word Count Breakdown</h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs border-b border-[var(--border-subtle)] pb-2.5">
                      <span className="text-[var(--text-secondary)]">Total Source Words</span>
                      <strong className="text-[var(--text-primary)] text-sm">{totalWordsCount?.toLocaleString() || 0}</strong>
                    </div>
                    
                    {project?.target_languages?.length > 0 && (
                      <div className="space-y-3">
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Estimated Translated Words</span>
                        {project.target_languages.map(lang => (
                          <div key={lang} className="flex justify-between text-xs">
                            <span className="text-[var(--text-secondary)]">{getLanguageName(lang)}</span>
                            <span className="font-semibold text-[var(--text-primary)]">{totalWordsCount?.toLocaleString() || 0}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Queue status breakdown */}
                <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-md space-y-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Queue Status</h3>
                  
                  <div className="space-y-4">
                    {[
                      { status: "Completed", count: completedJobs, color: "bg-emerald-500" },
                      { status: "In Progress", count: inProgressJobs, color: "bg-indigo-500" },
                      { status: "Pending / Paused", count: pendingJobs, color: "bg-amber-500" },
                      { status: "Failed", count: failedJobs, color: "bg-rose-500" }
                    ].map((st, i) => {
                      const total = jobs.length || 1;
                      const percent = Math.round((st.count / total) * 100);
                      return (
                        <div key={i} className="flex items-center gap-3 text-xs">
                          <span className={`h-3 w-3 rounded-full ${st.color} shrink-0`}></span>
                          <span className="text-[var(--text-secondary)] flex-1 font-semibold">{st.status}</span>
                          <span className="font-bold text-[var(--text-primary)] w-10 text-right">{st.count}</span>
                          <span className="text-[var(--text-muted)] w-12 text-right">{percent}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* TM match breakdown and source context analysis */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* TM & ICE & Fuzzy Match Distribution */}
                <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-md space-y-6">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Translation Memory Match Analysis</h3>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">Breakdown of segment matching sources within your TM database.</p>
                  </div>
                  
                  <div className="space-y-4">
                    {[
                      { label: "ICE Match (101%)", count: analytics?.tmMatchStats?.ice || 0, color: "bg-emerald-500" },
                      { label: "TM Match (100%)", count: analytics?.tmMatchStats?.tm || 0, color: "bg-blue-500" },
                      { label: "Fuzzy Match (>=90%)", count: analytics?.tmMatchStats?.fuzzy || 0, color: "bg-amber-500" },
                      { label: "Normal (MT/None)", count: analytics?.tmMatchStats?.normal || 0, color: "bg-zinc-500" }
                    ].map((st, i) => {
                      const total = analytics?.tmMatchStats?.total || 1;
                      const percent = Math.round((st.count / total) * 100);
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${st.color}`}></span>
                              <span className="text-[var(--text-secondary)] font-semibold">{st.label}</span>
                            </div>
                            <div>
                              <span className="font-bold text-[var(--text-primary)] mr-2">{st.count}</span>
                              <span className="text-[var(--text-muted)] text-[10px]">{percent}%</span>
                            </div>
                          </div>
                          <div className="w-full bg-[var(--bg-input)] h-1 rounded-full overflow-hidden">
                            <div className={`h-full ${st.color}`} style={{ width: `${percent}%` }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Source Context Analysis */}
                <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-md space-y-6">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Source Context Analysis</h3>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">Analysis of context fields associated with your translation source segments.</p>
                  </div>
                  
                  <div className="space-y-4">
                    {[
                      { label: "Segments with Jira Keys", count: analytics?.sourceContextStats?.jira || 0, color: "bg-indigo-500" },
                      { label: "Segments with Context Descriptions", count: analytics?.sourceContextStats?.description || 0, color: "bg-purple-500" },
                      { label: "Total Segments with Context", count: analytics?.sourceContextStats?.total || 0, color: "bg-sky-500" }
                    ].map((st, i) => {
                      const total = analytics?.sourceContextStats?.totalSegments || 1;
                      const percent = Math.round((st.count / total) * 100);
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${st.color}`}></span>
                              <span className="text-[var(--text-secondary)] font-semibold">{st.label}</span>
                            </div>
                            <div>
                              <span className="font-bold text-[var(--text-primary)] mr-2">{st.count}</span>
                              <span className="text-[var(--text-muted)] text-[10px]">{percent}%</span>
                            </div>
                          </div>
                          <div className="w-full bg-[var(--bg-input)] h-1 rounded-full overflow-hidden">
                            <div className={`h-full ${st.color}`} style={{ width: `${percent}%` }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

            </div>
          )}



        </div>
      </main>

      {/* ── TARGET LANGUAGES ADDING MODAL ── */}
      {showAddLangModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-[fadeIn_0.15s_ease-out]">
            <div className="p-5 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--bg-panel)]">
              <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Configure Target Languages</h2>
              <button 
                onClick={() => setShowAddLangModal(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer text-xl font-bold"
              >
                &times;
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Add target languages to this project. New target language versions will automatically generate independent translation jobs.
              </p>

              <div className="grid grid-cols-2 gap-2.5 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl p-4 max-h-56 overflow-y-auto">
                {LANGUAGES.map((lang) => (
                  <label 
                    key={lang.code} 
                    className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer select-none py-1.5"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAddLangs.includes(lang.code)}
                      onChange={() => {
                        setSelectedAddLangs(prev => 
                          prev.includes(lang.code) ? prev.filter(c => c !== lang.code) : [...prev, lang.code]
                        );
                      }}
                      className="rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-0"
                    />
                    <span>{lang.flag} {lang.name} ({lang.code.toUpperCase()})</span>
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowAddLangModal(false)}
                  className="bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-medium)] text-[var(--text-primary)] text-xs font-bold px-4 py-2 rounded-xl cursor-pointer transition-all active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLanguages}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 py-2 rounded-xl cursor-pointer shadow-md transition-all active:scale-[0.98]"
                >
                  Save Languages
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          projectId={projectId}
          docName={project?.name}
          isOwner={isProjectOwner}
          theme={theme}
        />
      )}

      {showNotesModal && (
        <ProjectNotesModal
          isOpen={showNotesModal}
          onClose={() => setShowNotesModal(false)}
          projectId={projectId}
          projectName={project?.name}
          isOwner={isProjectOwner}
        />
      )}

      {showHistoryModal && (
        <ProjectHistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          projectId={projectId}
          projectName={project?.name}
          showToast={showToast}
        />
      )}

      {showBatchTranslateModal && (
        <BatchTranslateModal
          isOpen={showBatchTranslateModal}
          onClose={() => setShowBatchTranslateModal(false)}
          files={files}
          jobs={jobs}
          project={project}
          showToast={showToast}
          onReloadProject={loadProjectDetails}
        />
      )}

    </div>
  );
}
