import React, { useState, useEffect, useRef } from "react";
import { 
  ArrowLeft, FileText, Globe, Play, Pause, XCircle, RotateCcw, 
  Download, Upload, CheckCircle2, AlertCircle, Eye, Database, BarChart3, TrendingUp, Folder, Plus, Trash2, 
  Settings, List, Activity, Calendar, User, Clock, ChevronDown, Check, Edit2, Copy, FileCode, CheckSquare, Square, RefreshCw
} from "lucide-react";
import io from "socket.io-client";
import { 
  fetchProjectDetails, uploadFileToProject, updateProjectLanguages, 
  controlJobQueue, downloadJobFile, downloadLanguageZip, downloadProjectZip, fetchProjectAnalytics, deleteDocument,
  updateProjectDetails, fetchProjectActivities, renameDocument, duplicateDocument, deleteProject
} from "../services/api";
import { LANGUAGES } from "../constants/languages";

export default function ProjectDetails({ projectId, onBack, onOpenEditor, showToast, theme, token }) {
  const [project, setProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [activities, setActivities] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showAddLangModal, setShowAddLangModal] = useState(false);
  const [selectedAddLangs, setSelectedAddLangs] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [replacingFileId, setReplacingFileId] = useState(null);
  
  // Navigation Tabs state: "overview", "files", "languages", "analytics", "activity", "settings"
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
  const [editAiModel, setEditAiModel] = useState("gemini-1.5-flash");
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
    loadActivities();

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
      // reload analytics and activities on completion or failure updates
      if (status === "completed" || status === "failed") {
        loadAnalytics();
        loadActivities();
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
        setEditAiModel(settings.aiModel || "gemini-1.5-flash");
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

  const loadActivities = async () => {
    try {
      const data = await fetchProjectActivities(projectId);
      setActivities(data || []);
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
      loadActivities();
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
      loadActivities();
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
      loadActivities();
    } catch (err) {
      console.error(err);
      showToast("Failed to update project target languages", "error");
    }
  };

  const handleQueueAction = async (jobId, action) => {
    try {
      const result = await controlJobQueue(jobId, action);
      showToast(`Job ${action} command sent successfully.`);
      
      // Update local state temporarily
      setJobs(prevJobs => 
        prevJobs.map(job => 
          job.id === jobId ? { ...job, status: result.status } : job
        )
      );
      loadActivities();
    } catch (err) {
      console.error(err);
      showToast("Failed to execute queue command", "error");
    }
  };

  const handleDownloadJob = async (job) => {
    try {
      showToast(`Exporting translated file (${job.target_lang.toUpperCase()})...`);
      const extIndex = job.documents.name.lastIndexOf(".");
      const ext = extIndex !== -1 ? job.documents.name.substring(extIndex) : ".html";
      await downloadJobFile(job.id, job.documents.name.replace(/\.[^/.]+$/, ""), job.target_lang, ext);
      showToast("Download started!");
      loadActivities();
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
      loadActivities();
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
      loadActivities();
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
      loadActivities();
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
      loadActivities();
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
      loadActivities();
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
          aiModel: editAiModel,
          translationPrompt: editTranslationPrompt,
          autoSave: editAutoSave,
          notifications: editNotifications
        }
      });
      setProject(updated);
      showToast("Settings updated successfully!");
      loadProjectDetails();
      loadAnalytics();
      loadActivities();
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
      loadActivities();
    } catch (err) {
      console.error(err);
      showToast("Failed to remove language", "error");
    }
  };

  const handleRetranslateLanguage = async (langCode) => {
    showToast(`Restarting all jobs for target language ${getLanguageName(langCode)}...`);
    try {
      const langJobs = jobs.filter(j => j.target_lang === langCode);
      for (const job of langJobs) {
        await controlJobQueue(job.id, "start");
      }
      showToast(`All jobs in ${getLanguageName(langCode)} restarted!`);
      loadProjectDetails();
      loadActivities();
    } catch (err) {
      console.error(err);
      showToast("Failed to restart translation jobs", "error");
    }
  };

  // Global actions queue controllers
  const handleGlobalPause = async () => {
    const activeJobs = jobs.filter(j => j.status === "running");
    if (activeJobs.length === 0) {
      showToast("No active running jobs to pause.", "warning");
      return;
    }
    showToast(`Pausing ${activeJobs.length} active jobs...`);
    try {
      for (const job of activeJobs) {
        await controlJobQueue(job.id, "pause");
      }
      showToast("All active translation jobs paused.");
      loadProjectDetails();
      loadActivities();
    } catch (err) {
      console.error(err);
      showToast("Failed to pause some jobs", "error");
    }
  };

  const handleGlobalResume = async () => {
    const resumableJobs = jobs.filter(j => ["paused", "pending", "failed"].includes(j.status));
    if (resumableJobs.length === 0) {
      showToast("No paused or pending jobs to resume.", "warning");
      return;
    }
    showToast(`Resuming ${resumableJobs.length} translation jobs...`);
    try {
      for (const job of resumableJobs) {
        await controlJobQueue(job.id, job.status === "paused" ? "resume" : "start");
      }
      showToast("All translation jobs resumed!");
      loadProjectDetails();
      loadActivities();
    } catch (err) {
      console.error(err);
      showToast("Failed to resume some jobs", "error");
    }
  };

  const handleGlobalTranslate = async () => {
    const startableJobs = jobs.filter(j => ["pending", "paused", "failed", "cancelled"].includes(j.status));
    if (startableJobs.length === 0) {
      showToast("No pending jobs to translate.", "warning");
      return;
    }
    showToast(`Starting translation for ${startableJobs.length} jobs...`);
    try {
      for (const job of startableJobs) {
        await controlJobQueue(job.id, "start");
      }
      showToast("Translation started successfully!");
      loadProjectDetails();
      loadActivities();
    } catch (err) {
      console.error(err);
      showToast("Failed to start translation jobs", "error");
    }
  };

  // Bulk actions handlers for Files tab
  const handleBulkTranslate = async () => {
    if (selectedFiles.length === 0) return;
    showToast("Starting translation for selected files...");
    let startedCount = 0;
    try {
      for (const fileId of selectedFiles) {
        const fileJobs = jobs.filter(j => j.document_id === fileId && ["pending", "paused", "failed", "cancelled"].includes(j.status));
        for (const job of fileJobs) {
          await controlJobQueue(job.id, job.status === "paused" ? "resume" : "start");
          startedCount++;
        }
      }
      showToast(`Started translation for ${startedCount} jobs!`);
      loadProjectDetails();
      loadActivities();
    } catch (err) {
      console.error(err);
      showToast("Failed to start translation for some files.", "error");
    }
  };

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
      loadActivities();
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
      await updateProjectDetails(projectId, { status: "Archived" }); // optionally archive
      // We perform direct deletion API
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
      case "active": return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      case "completed": return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
      case "archived": return "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30";
      default: return "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20";
    }
  };

  const getJobStatusBadge = (status) => {
    switch (status) {
      case "completed": return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20";
      case "running": return "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 animate-pulse";
      case "paused": return "bg-amber-500/15 text-amber-400 border border-amber-500/20";
      case "failed": return "bg-rose-500/15 text-rose-400 border border-rose-500/20";
      default: return "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20";
    }
  };

  const handleOpenLanguageSelection = (fileId, action) => {
    setOpenLangSelectFileId(fileId);
    setOpenLangAction(action);
  };

  const handleOpenEditorWithLang = (fileId, langCode) => {
    // Find job for this file and target language
    const foundJob = jobs.find(j => j.document_id === fileId && j.target_lang === langCode);
    setOpenLangSelectFileId(null);
    if (foundJob) {
      onOpenEditor(foundJob.id, fileId, langCode);
    } else {
      showToast(`No translation job found for ${getLanguageName(langCode)}`, "error");
    }
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
  
  // Overall Project progress average across jobs
  const overallProgressPercent = jobs.length > 0 
    ? Math.round(jobs.reduce((sum, j) => sum + (j.progress || 0), 0) / jobs.length) 
    : 0;

  const projectStatus = project?.status || project?.settings?.status || "Active";

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center p-6 text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent mb-4"></div>
        <p className="text-xs text-[var(--text-secondary)]">Loading project files and translation jobs...</p>
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
            className="flex items-center justify-center h-8 w-8 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white transition-colors cursor-pointer"
            title="Back to Dashboard"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
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
                        className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-elevated)] flex items-center justify-between"
                      >
                        <span>{st}</span>
                        {projectStatus === st && <Check size={10} className="text-indigo-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {project.client && (
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5 font-medium">
                Client: <strong className="text-[var(--text-secondary)]">{project.client}</strong>
              </p>
            )}
          </div>
        </div>

        {/* Global Action Buttons (Top-Right Corner) */}
        <div className="flex items-center gap-2">
          
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
            className="flex items-center gap-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl cursor-pointer shadow-md transition-all shrink-0"
            title="Upload Files"
          >
            <Upload size={14} />
            <span>Upload Files</span>
          </button>

          <button
            onClick={() => {
              setSelectedAddLangs(project.target_languages || []);
              setShowAddLangModal(true);
            }}
            className="flex items-center gap-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-medium)] text-xs font-bold px-3.5 py-2 rounded-xl cursor-pointer transition-all shrink-0"
            title="Add Languages"
          >
            <Plus size={14} />
            <span>Add Languages</span>
          </button>

          <div className="h-6 w-px bg-[var(--border-subtle)] mx-1 shrink-0"></div>

          <button
            onClick={handleGlobalTranslate}
            className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 text-xs font-bold px-3.5 py-2 rounded-xl cursor-pointer transition-all shrink-0"
            title="Translate All Jobs"
          >
            <Play size={14} />
            <span>Translate</span>
          </button>

          <button
            onClick={handleGlobalPause}
            className="flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-amber-400 p-2 rounded-xl cursor-pointer transition-all shrink-0"
            title="Pause Translation"
          >
            <Pause size={14} />
          </button>

          <button
            onClick={handleGlobalResume}
            className="flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-emerald-400 p-2 rounded-xl cursor-pointer transition-all shrink-0"
            title="Resume Translation"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={handleDownloadZipAll}
            disabled={jobs.length === 0}
            className="flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed p-2 rounded-xl cursor-pointer transition-all shrink-0"
            title="Download ZIP"
          >
            <Download size={14} />
          </button>

          <button
            onClick={handleExportReports}
            className="flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-blue-400 p-2 rounded-xl cursor-pointer transition-all shrink-0"
            title="Export Reports"
          >
            <FileCode size={14} />
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className="flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-[var(--text-secondary)] hover:text-white p-2 rounded-xl cursor-pointer transition-all shrink-0"
            title="Project Settings"
          >
            <Settings size={14} />
          </button>

        </div>
      </header>

      {/* ── PROJECT SUMMARY MINI-BANNER ── */}
      <section className="bg-[var(--bg-panel)]/40 border-b border-[var(--border-subtle)] px-8 py-3 flex flex-wrap gap-x-8 gap-y-2 text-xs text-[var(--text-secondary)] shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          <Globe size={13} className="text-indigo-400" />
          <span>Source: <strong className="text-[var(--text-primary)]">{project.source_lang.toUpperCase()}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar size={13} className="text-purple-400" />
          <span>Created: <strong className="text-[var(--text-primary)]">{new Date(project.created_at).toLocaleDateString()}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock size={13} className="text-blue-400" />
          <span>Updated: <strong className="text-[var(--text-primary)]">{new Date(project.updated_at || project.created_at).toLocaleDateString()}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <Database size={13} className="text-amber-400" />
          <span>Words: <strong className="text-[var(--text-primary)]">{analytics?.totalWordCount?.toLocaleString() || 0}</strong></span>
        </div>
        
        {/* Overall Progress Mini Bar */}
        <div className="flex items-center gap-3 ml-auto flex-1 max-w-xs min-w-[150px]">
          <span className="font-semibold text-[var(--text-primary)]">{overallProgressPercent}% Progress</span>
          <div className="flex-1 bg-[var(--bg-input)] h-1.5 rounded-full overflow-hidden border border-[var(--border-subtle)]">
            <div 
              className="bg-indigo-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${overallProgressPercent}%` }}
            ></div>
          </div>
        </div>
      </section>

      {/* ── INTERIOR NAVIGATION TABS ── */}
      <nav className="bg-[var(--bg-panel)]/80 px-8 flex border-b border-[var(--border-subtle)] shrink-0 select-none">
        {[
          { id: "overview", label: "Overview", icon: BarChart3 },
          { id: "files", label: "Files", icon: FileText },
          { id: "languages", label: "Languages", icon: Globe },
          { id: "analytics", label: "Analytics", icon: TrendingUp },
          { id: "activity", label: "Activity", icon: Activity },
          { id: "settings", label: "Settings", icon: Settings }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                isActive 
                  ? "border-indigo-500 text-white bg-indigo-500/5" 
                  : "border-transparent text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)]"
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
            <button className="flex items-center gap-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer transition-all">
              <span>Header Actions</span> <ChevronDown size={10} />
            </button>
            <div className="absolute right-0 mt-1 w-44 bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-xl py-1 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <button onClick={() => fileInputRef.current?.click()} className="w-full text-left px-4 py-2 text-xs hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-white flex items-center gap-2">
                <Upload size={12} /> Upload Files
              </button>
              <button onClick={() => { setSelectedAddLangs(project.target_languages || []); setShowAddLangModal(true); }} className="w-full text-left px-4 py-2 text-xs hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-white flex items-center gap-2">
                <Plus size={12} /> Add Languages
              </button>
              <button onClick={handleGlobalTranslate} className="w-full text-left px-4 py-2 text-xs hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-white flex items-center gap-2">
                <Play size={12} /> Translate
              </button>
              <button onClick={handleDownloadZipAll} className="w-full text-left px-4 py-2 text-xs hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-white flex items-center gap-2">
                <Download size={12} /> Download ZIP
              </button>
              <button onClick={() => setActiveTab("settings")} className="w-full text-left px-4 py-2 text-xs hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-white flex items-center gap-2">
                <Settings size={12} /> Settings
              </button>
              <div className="h-px bg-[var(--border-subtle)] my-1"></div>
              <button onClick={handleDeleteProjectClick} className="w-full text-left px-4 py-2 text-xs hover:bg-[var(--bg-elevated)] text-rose-400 flex items-center gap-2">
                <Trash2 size={12} /> Delete Project
              </button>
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
                  { label: "Total Files", val: totalFiles, color: "text-white" },
                  { label: "Total Languages", val: totalLanguages, color: "text-indigo-400" },
                  { label: "Total Jobs", val: totalTranslationJobs, color: "text-blue-400" },
                  { label: "Completed", val: completedJobs, color: "text-emerald-400" },
                  { label: "In Progress", val: inProgressJobs, color: "text-purple-400" },
                  { label: "Pending", val: pendingJobs, color: "text-amber-400" },
                  { label: "Failed", val: failedJobs, color: "text-rose-400" },
                  { label: "Total Words", val: totalWordsCount?.toLocaleString(), color: "text-teal-400" }
                ].map((card, i) => (
                  <div key={i} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">{card.label}</span>
                    <span className={`text-lg font-black mt-2 ${card.color}`}>{card.val}</span>
                  </div>
                ))}

              </div>

              {/* Progress Summary and Recent Activity Splits */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Left Column: Progress summary & stats */}
                <div className="lg:col-span-2 space-y-6">
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
                                <span className="font-bold text-indigo-400">{metrics.progress}%</span>
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

                {/* Right Column: Recent Activities Timeline */}
                <div className="lg:col-span-1 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-md flex flex-col h-[400px]">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-4 flex items-center justify-between">
                    <span>Recent Activity</span>
                    <button 
                      onClick={() => setActiveTab("activity")}
                      className="text-[10px] font-bold text-indigo-400 hover:underline"
                    >
                      View All
                    </button>
                  </h3>
                  
                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    {activities.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)] text-center py-20">No recent events logged.</p>
                    ) : (
                      activities.slice(0, 5).map((act, i) => (
                        <div key={act.id || i} className="flex gap-3 text-xs leading-relaxed">
                          <div className="mt-1 shrink-0 w-2 h-2 rounded-full bg-indigo-500"></div>
                          <div className="flex-1">
                            <p className="text-[var(--text-primary)] font-medium">
                              <strong className="text-white">{act.user_name}</strong> {act.event_type.replace("_", " ")}
                            </p>
                            {act.details?.fileName && (
                              <p className="text-[10px] text-[var(--text-muted)] truncate max-w-[200px]">{act.details.fileName}</p>
                            )}
                            <span className="text-[9px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                              <Clock size={10} /> {new Date(act.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
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
                    className="text-[var(--text-secondary)] hover:text-white mr-2"
                  >
                    {selectedFiles.length === files.length && files.length > 0 ? (
                      <CheckSquare size={18} className="text-indigo-400" />
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
                    onClick={handleBulkTranslate}
                    className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all"
                  >
                    <Play size={12} /> Translate Selected
                  </button>
                  <button
                    disabled={selectedFiles.length === 0}
                    onClick={handleBulkDownload}
                    className="flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all"
                  >
                    <Download size={12} /> Download Selected
                  </button>
                  <button
                    disabled={selectedFiles.length === 0}
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all"
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
                      className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-xl"
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
                          
                          // File Status
                          const hasRunning = fileJobs.some(j => j.status === "running");
                          const allCompleted = fileJobs.length > 0 && fileJobs.every(j => j.status === "completed");
                          const fileStatus = hasRunning ? "translating" : (allCompleted ? "completed" : "pending");

                          // File Progress average
                          const avgProgress = fileJobs.length > 0
                            ? Math.round(fileJobs.reduce((sum, j) => sum + (j.progress || 0), 0) / fileJobs.length)
                            : 0;

                          const extIndex = file.name.lastIndexOf(".");
                          const ext = extIndex !== -1 ? file.name.substring(extIndex).toUpperCase() : "UNKNOWN";

                          return (
                            <tr key={file.id} className="hover:bg-[var(--bg-surface)]/40 transition-colors">
                              
                              {/* Checkbox selector */}
                              <td className="py-4 px-5">
                                <button onClick={() => toggleSelectFile(file.id)} className="text-[var(--text-secondary)] hover:text-white">
                                  {isSelected ? <CheckSquare size={16} className="text-indigo-400" /> : <Square size={16} />}
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
                                      className="bg-[var(--bg-input)] border border-indigo-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
                                      onKeyDown={(e) => e.key === "Enter" && handleRenameFileSubmit(file.id)}
                                      autoFocus
                                    />
                                    <button onClick={() => handleRenameFileSubmit(file.id)} className="text-emerald-400 p-1">
                                      <Check size={14} />
                                    </button>
                                    <button onClick={() => setRenamingFileId(null)} className="text-rose-400 p-1">
                                      <XCircle size={14} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 max-w-xs truncate" title={file.name}>
                                    <span>{file.name}</span>
                                    <button 
                                      onClick={() => { setRenamingFileId(file.id); setRenamingFileName(file.name); }}
                                      className="opacity-0 hover:opacity-100 group-hover:opacity-100 p-1 hover:text-white text-[var(--text-muted)] cursor-pointer"
                                      title="Rename"
                                    >
                                      <Edit2 size={11} />
                                    </button>
                                  </div>
                                )}
                              </td>

                              {/* File Type */}
                              <td className="py-4 px-4 text-[var(--text-secondary)]">
                                <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700/60 font-black text-[9px]">
                                  {ext.replace(".", "")}
                                </span>
                              </td>

                              {/* Word Count */}
                              <td className="py-4 px-4 text-right font-medium text-[var(--text-secondary)]">
                                {file.word_count?.toLocaleString() || 0}
                              </td>

                              {/* Target Languages */}
                              <td className="py-4 px-4">
                                <div className="flex flex-wrap gap-1 max-w-[140px]">
                                  {fileJobs.map(j => (
                                    <span 
                                      key={j.id} 
                                      className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase border ${
                                        j.status === "completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-zinc-800 text-zinc-400 border-zinc-700"
                                      }`}
                                      title={`${getLanguageName(j.target_lang)}: ${j.progress}%`}
                                    >
                                      {j.target_lang}
                                    </span>
                                  ))}
                                </div>
                              </td>

                              {/* File Progress bar */}
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-[11px] w-8 shrink-0">{avgProgress}%</span>
                                  <div className="w-16 bg-[var(--bg-input)] h-1 rounded-full overflow-hidden">
                                    <div className="bg-indigo-500 h-full" style={{ width: `${avgProgress}%` }}></div>
                                  </div>
                                </div>
                              </td>

                              {/* File Status Badge */}
                              <td className="py-4 px-4 capitalize">
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                                  fileStatus === "completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                  fileStatus === "translating" ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 animate-pulse" :
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
                                      className="bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-all"
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
                                            className="w-full px-3 py-1.5 hover:bg-[var(--bg-elevated)] text-xs text-left text-[var(--text-secondary)] hover:text-white flex items-center justify-between"
                                          >
                                            <span>{getLanguageName(job.target_lang)}</span>
                                            <span className="text-[10px] text-indigo-400 font-bold">{job.progress}%</span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* View Translations Dropdown trigger */}
                                  <div className="relative">
                                    <button
                                      onClick={() => handleOpenLanguageSelection(file.id, "view")}
                                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-all"
                                    >
                                      View
                                    </button>
                                    
                                    {openLangSelectFileId === file.id && openLangAction === "view" && (
                                      <div className="absolute right-0 mt-1.5 w-44 bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-xl py-1 shadow-2xl z-50 text-left">
                                        <div className="px-3 py-1.5 text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)]">Export Translation</div>
                                        {fileJobs.map(job => (
                                          <button
                                            key={job.id}
                                            onClick={() => { setOpenLangSelectFileId(null); handleDownloadJob(job); }}
                                            className="w-full px-3 py-1.5 hover:bg-[var(--bg-elevated)] text-xs text-left text-[var(--text-secondary)] hover:text-white flex items-center justify-between"
                                          >
                                            <span>{getLanguageName(job.target_lang)}</span>
                                            <Download size={10} className="text-zinc-400" />
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Action Options Dropdown */}
                                  <div className="relative group">
                                    <button className="text-[var(--text-muted)] hover:text-white p-1 hover:bg-[var(--bg-hover)] rounded-lg transition-all cursor-pointer">
                                      <ChevronDown size={14} />
                                    </button>
                                    <div className="absolute right-0 mt-1 w-44 bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-xl py-1 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-left">
                                      <button 
                                        onClick={() => handleDuplicateFileSubmit(file.id)}
                                        className="w-full px-4 py-2 hover:bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)] hover:text-white flex items-center gap-2"
                                      >
                                        <Copy size={12} /> Duplicate File
                                      </button>
                                      <button 
                                        onClick={() => handleUploadNewVersion(file.id)}
                                        className="w-full px-4 py-2 hover:bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)] hover:text-white flex items-center gap-2"
                                      >
                                        <Upload size={12} /> Upload New Version
                                      </button>
                                      <div className="h-px bg-[var(--border-subtle)] my-1"></div>
                                      <button 
                                        onClick={() => handleDeleteFile(file.id, file.name)}
                                        className="w-full px-4 py-2 hover:bg-[var(--bg-elevated)] text-xs text-rose-400 flex items-center gap-2"
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
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
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
                              <h4 className="text-sm font-bold text-white">{getLanguageName(lang)}</h4>
                              <span className="text-[10px] uppercase font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/10 px-2 py-0.5 rounded mt-1.5 inline-block">
                                {lang}
                              </span>
                            </div>
                            
                            {/* Actions options menu */}
                            <div className="relative group/actions">
                              <button className="text-[var(--text-secondary)] hover:text-white p-1 rounded hover:bg-[var(--bg-hover)] transition-all">
                                <ChevronDown size={14} />
                              </button>
                              <div className="absolute right-0 mt-1 w-40 bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-xl py-1 shadow-2xl opacity-0 invisible group-hover/actions:opacity-100 group-hover/actions:visible transition-all z-50 text-left">
                                <button 
                                  onClick={() => handleRetranslateLanguage(lang)}
                                  className="w-full px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-elevated)] flex items-center gap-2"
                                >
                                  <RefreshCw size={12} /> Re-translate
                                </button>
                                <button 
                                  onClick={() => handleDownloadZipLanguage(lang)}
                                  className="w-full px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-elevated)] flex items-center gap-2"
                                >
                                  <Download size={12} /> Download ZIP
                                </button>
                                <div className="h-px bg-[var(--border-subtle)] my-1"></div>
                                <button 
                                  onClick={() => handleRemoveLanguage(lang)}
                                  className="w-full px-4 py-2 text-xs text-rose-400 hover:bg-[var(--bg-elevated)] flex items-center gap-2"
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
                              <p className="text-sm font-black text-white mt-0.5">{metrics.totalFiles}</p>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Completed</span>
                              <p className="text-sm font-black text-emerald-400 mt-0.5">{metrics.completedFiles}</p>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Pending</span>
                              <p className="text-sm font-black text-amber-400 mt-0.5">{metrics.pendingFiles}</p>
                            </div>
                          </div>
                        </div>

                        {/* Progress Bar footer */}
                        <div className="pt-2 border-t border-[var(--border-subtle)]">
                          <div className="flex justify-between items-center text-xs mb-1.5 font-semibold">
                            <span className="text-[var(--text-secondary)]">Translation Progress</span>
                            <span className="text-indigo-400">{metrics.progress}%</span>
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
                            <span className="text-indigo-400">{metrics.progress}% Complete</span>
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
                      <strong className="text-white text-sm">{totalWordsCount?.toLocaleString() || 0}</strong>
                    </div>
                    
                    {project?.target_languages?.length > 0 && (
                      <div className="space-y-3">
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Estimated Translated Words</span>
                        {project.target_languages.map(lang => (
                          <div key={lang} className="flex justify-between text-xs">
                            <span className="text-[var(--text-secondary)]">{getLanguageName(lang)}</span>
                            <span className="font-semibold text-white">{totalWordsCount?.toLocaleString() || 0}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Queue status breakdown */}
                <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-md space-y-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] font-bold">Queue status</h3>
                  
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
                          <span className="font-bold text-white w-10 text-right">{st.count}</span>
                          <span className="text-[var(--text-muted)] w-12 text-right">{percent}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ── TAB 5: ACTIVITY timeline ── */}
          {activeTab === "activity" && (
            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-md space-y-6 animate-[fadeIn_0.15s_ease-out]">
              <div className="flex justify-between items-center pb-4 border-b border-[var(--border-subtle)]">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Project Event Activity Timeline</h3>
                <button 
                  onClick={loadActivities}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw size={12} /> Refresh Timeline
                </button>
              </div>

              {activities.length === 0 ? (
                <div className="text-center py-20 text-[var(--text-muted)] text-xs">
                  <Activity size={48} className="mx-auto mb-4 text-zinc-600" />
                  <p>No activity logs recorded for this project yet.</p>
                </div>
              ) : (
                <div className="relative pl-6 border-l border-zinc-700/60 space-y-8 max-h-[500px] overflow-y-auto pr-2">
                  {activities.map((act) => {
                    const actDate = new Date(act.created_at);
                    
                    return (
                      <div key={act.id} className="relative text-xs">
                        
                        {/* Bullet point locator */}
                        <div className="absolute -left-[30px] top-1 h-4.5 w-4.5 bg-[var(--bg-panel)] border-2 border-indigo-500 rounded-full flex items-center justify-center shrink-0">
                          <div className="h-1.5 w-1.5 bg-indigo-500 rounded-full"></div>
                        </div>

                        {/* Activity details card */}
                        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)]/75 rounded-xl p-3.5 shadow-sm space-y-2">
                          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                            <span className="flex items-center gap-1 font-semibold text-indigo-400 uppercase tracking-wider">
                              {act.event_type.replace("_", " ")}
                            </span>
                            <span className="flex items-center gap-1 font-medium">
                              <Clock size={11} /> {actDate.toLocaleString()}
                            </span>
                          </div>

                          <p className="text-[var(--text-primary)] leading-relaxed">
                            User <strong className="text-white font-bold">{act.user_name}</strong> performed this action.
                          </p>

                          {act.details && Object.keys(act.details).length > 0 && (
                            <div className="bg-black/15 border border-[var(--border-subtle)]/30 rounded-lg p-2 mt-2 text-[10px] font-mono text-zinc-400 space-y-0.5">
                              {Object.entries(act.details).map(([key, val]) => (
                                <div key={key} className="truncate">
                                  <strong className="text-zinc-500 uppercase">{key}:</strong> {String(val)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          )}

          {/* ── TAB 6: CONFIGURATION SETTINGS ── */}
          {activeTab === "settings" && (
            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-md space-y-8 animate-[fadeIn_0.15s_ease-out]">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Project Configuration & Settings</h3>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Configure project metadata, translation instructions, model, and automatic saves.</p>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-6 max-w-2xl">
                
                {/* Name & Client */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Project Name</label>
                    <input 
                      type="text"
                      required
                      value={editProjectName}
                      onChange={(e) => setEditProjectName(e.target.value)}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Client Name</label>
                    <input 
                      type="text"
                      value={editClientName}
                      onChange={(e) => setEditClientName(e.target.value)}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Project Description</label>
                  <textarea 
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={4}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all resize-none"
                  />
                </div>

                {/* Source Language */}
                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Source Language</label>
                  <select
                    value={editSourceLang}
                    onChange={(e) => setEditSourceLang(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all"
                  >
                    {LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.code}>{lang.flag} {lang.name} ({lang.code.toUpperCase()})</option>
                    ))}
                  </select>
                </div>



                {/* System Translation Prompt */}
                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">AI Translation Instructions / Prompt</label>
                  <textarea 
                    value={editTranslationPrompt}
                    onChange={(e) => setEditTranslationPrompt(e.target.value)}
                    placeholder="Specify constraints, style guidelines, target audience, or specific translation rules..."
                    rows={5}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all resize-none"
                  />
                </div>

                {/* Toggles */}
                <div className="space-y-4 pt-2 select-none">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={editAutoSave}
                      onChange={(e) => setEditAutoSave(e.target.checked)}
                      className="rounded border-[var(--border-subtle)] text-indigo-600 focus:ring-0"
                    />
                    <div className="text-xs">
                      <span className="block font-semibold text-white">Auto Save Session</span>
                      <span className="block text-[10px] text-[var(--text-muted)] mt-0.5">Automatically save translation segments in progress.</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={editNotifications}
                      onChange={(e) => setEditNotifications(e.target.checked)}
                      className="rounded border-[var(--border-subtle)] text-indigo-600 focus:ring-0"
                    />
                    <div className="text-xs">
                      <span className="block font-semibold text-white">Notifications Enabled</span>
                      <span className="block text-[10px] text-[var(--text-muted)] mt-0.5">Receive email or browser updates on job queue completion status.</span>
                    </div>
                  </label>
                </div>

                {/* Form Buttons */}
                <div className="flex gap-3 pt-6 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setActiveTab("overview")}
                    className="bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-medium)] text-xs font-bold px-5 py-2.5 rounded-xl cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold px-6 py-2.5 rounded-xl cursor-pointer shadow-md transition-all"
                  >
                    Save Configuration
                  </button>
                </div>

              </form>
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
                className="text-[var(--text-secondary)] hover:text-white cursor-pointer text-xl font-bold"
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
                    className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)] hover:text-white cursor-pointer select-none py-1.5"
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
                  className="bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-medium)] text-xs font-bold px-4 py-2 rounded-xl cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLanguages}
                  className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold px-5 py-2 rounded-xl cursor-pointer shadow-md transition-all"
                >
                  Save Languages
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
