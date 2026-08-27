import React, { useState, useEffect, useRef } from "react";
import { 
  ArrowLeft, FileText, Globe, Play, Pause, XCircle, RotateCcw, 
  Download, Upload, CheckCircle2, AlertCircle, Eye, Database, BarChart3, TrendingUp, Folder, Plus, Trash2, 
  Settings, List, Activity, Calendar, User, Clock, ChevronDown, ChevronRight, Check, Edit2, Copy, FileCode, CheckSquare, Square, RefreshCw, Users, LayoutDashboard, StickyNote, History, Sparkles, Search, LayoutGrid, ShieldCheck, LogOut, X, Tag, SlidersHorizontal, Layers, ArrowUpDown
} from "lucide-react";
import io from "socket.io-client";
import { 
  fetchProjectDetails, uploadFileToProject, updateProjectLanguages, 
  controlJobQueue, downloadJobFile, downloadLanguageZip, downloadProjectZip, fetchProjectAnalytics, deleteDocument,
  updateProjectDetails, renameDocument, duplicateDocument, deleteProject, uploadProjectReferenceFile,
  fetchProjectAccessRequests
} from "../services/api";
import { LANGUAGES } from "../constants/languages";
import { getSocketUrl } from "../utils/socketUrl.js";
import { ShareModal } from "./ShareModal";
import { ProjectNotesModal } from "./ProjectNotesModal";
import { ProjectHistoryModal } from "./ProjectHistoryModal";
import { BatchTranslateModal } from "./BatchTranslateModal";
import { TmAnalysisModal } from "./TmAnalysisModal";
import { ProjectAccessRequestsModal } from "./ProjectAccessRequestsModal";
import { 
  ProjectDetailsOverviewSkeleton, 
  ProjectDetailsFilesSkeleton, 
  ProjectDetailsLanguagesSkeleton, 
  ProjectDetailsAnalyticsSkeleton 
} from "./SkeletonLoader";
import { ProtectedContentPanel } from "./ProtectedContentPanel";
import { normalizeStatus, formatStatusLabel, getStatusColorClass, getStatusDotColor, STATUS_OPTIONS } from "../utils/projectStatusUtils";
import { LanguageFlag } from "./LanguageFlag";

export default function ProjectDetails({ projectId, onBack, onOpenEditor, showToast, theme, token, onOpenSettings, userId, userRole, onOpenAdmin, onLogout }) {
  const [project, setProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showAddLangModal, setShowAddLangModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProtectedModal, setShowProtectedModal] = useState(false);
  const [selectedAddLangs, setSelectedAddLangs] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [replacingFileId, setReplacingFileId] = useState(null);

  // Sharing Modal Config & States
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareModalConfig, setShareModalConfig] = useState({
    mode: "project",
    documentId: null,
    docName: "",
    selectedDocumentIds: [],
    selectedDocNames: [],
    targetLang: null,
    languageName: null,
    documentCount: 0
  });

  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showBatchTranslateModal, setShowBatchTranslateModal] = useState(false);
  const [showTmAnalysisModal, setShowTmAnalysisModal] = useState(false);
  const [showAccessRequestsModal, setShowAccessRequestsModal] = useState(false);
  const [pendingProjectRequests, setPendingProjectRequests] = useState([]);
  const [analysisTargetDocId, setAnalysisTargetDocId] = useState(null);
  const [analysisTargetDocName, setAnalysisTargetDocName] = useState("");
  
  // Navigation Tabs state: "studio" (default workspace), "analytics"
  const [activeTab, setActiveTab] = useState("studio");

  // Target Language Filter Tab inside Studio Workspace: "all" (default) or language code e.g. "fr", "ar"
  const [activeLangTab, setActiveLangTab] = useState("all");

  // Expanded file rows in Master Table View
  const [expandedFileIds, setExpandedFileIds] = useState([]);

  // Selection states for Files and Job-level bulk actions
  const [selectedFiles, setSelectedFiles] = useState([]);
  // Job selection items array: [{ fileId, targetLang, docName, langName }]
  const [selectedJobs, setSelectedJobs] = useState([]);

  // File Search & Sort
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [fileSortBy, setFileSortBy] = useState("newest"); // 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'words_desc' | 'words_asc'

  // File Renaming state
  const [renamingFileId, setRenamingFileId] = useState(null);
  const [renamingFileName, setRenamingFileName] = useState("");

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
  const statusDropdownRef = useRef(null);

  const fileInputRef = useRef(null);
  const socketRef = useRef(null);

  // Click outside listener for status dropdown
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target)) {
        setShowStatusDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const loadProjectRequests = async () => {
    if (!projectId) return;
    try {
      const res = await fetchProjectAccessRequests(projectId);
      setPendingProjectRequests(res.requests || []);
    } catch (err) {
      console.error("Failed to load project requests:", err);
    }
  };

  useEffect(() => {
    loadProjectDetails();
    loadAnalytics();
    loadProjectRequests();

    // Setup real-time socket updates for queue progress & access requests
    const socketUrl = getSocketUrl();
    const socket = io(socketUrl, { auth: { token }, transports: ["websocket", "polling"] });
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

    socket.on("access-request-received", (data) => {
      loadProjectRequests();
      if (showToast && data?.userName) {
        const langText = data.targetLang ? ` for ${data.targetLang.toUpperCase()}` : "";
        showToast(`New access request from ${data.userName}${langText}`, "info");
      }
    });

    socket.on("access-request-processed", () => {
      loadProjectRequests();
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

  // Modal Launcher Handlers for Sharing
  const openProjectShareModal = () => {
    setShareModalConfig({
      mode: "project",
      documentId: null,
      docName: project?.name,
      selectedDocumentIds: [],
      selectedDocNames: [],
      targetLang: null,
      languageName: null,
      documentCount: 0
    });
    setShowShareModal(true);
  };

  const openSingleFileShareModal = (fileId, fileName) => {
    setShareModalConfig({
      mode: "file",
      documentId: fileId,
      docName: fileName,
      selectedDocumentIds: [fileId],
      selectedDocNames: [fileName],
      targetLang: null,
      languageName: null,
      documentCount: 1
    });
    setShowShareModal(true);
  };

  const openLanguageJobShareModal = (fileId, fileName, targetLangCode, langName) => {
    setShareModalConfig({
      mode: "language_job",
      documentId: fileId,
      docName: `${fileName} (${langName})`,
      selectedDocumentIds: [fileId],
      selectedDocNames: [`${fileName} [${langName}]`],
      targetLang: targetLangCode,
      languageName: langName,
      documentCount: 1
    });
    setShowShareModal(true);
  };

  const openBulkFileShareModal = () => {
    const selectedDocs = files.filter(f => selectedFiles.includes(f.id));
    setShareModalConfig({
      mode: "bulk_files",
      documentId: null,
      docName: `${selectedFiles.length} Selected Files`,
      selectedDocumentIds: selectedFiles,
      selectedDocNames: selectedDocs.map(f => f.name),
      targetLang: null,
      languageName: null,
      documentCount: selectedFiles.length
    });
    setShowShareModal(true);
  };

  const openBulkJobsShareModal = () => {
    const docIds = Array.from(new Set(selectedJobs.map(j => j.fileId)));
    const docNames = selectedJobs.map(j => `${j.docName} [${j.langName}]`);
    setShareModalConfig({
      mode: "bulk_files",
      documentId: null,
      docName: `${selectedJobs.length} Selected Jobs`,
      selectedDocumentIds: docIds,
      selectedDocNames: docNames,
      selectedJobItems: selectedJobs,
      targetLang: selectedJobs.length === 1 ? selectedJobs[0].targetLang : null,
      languageName: selectedJobs.length === 1 ? selectedJobs[0].langName : null,
      documentCount: docIds.length
    });
    setShowShareModal(true);
  };

  const openLanguageShareModal = (langCode, langName) => {
    setShareModalConfig({
      mode: "language",
      documentId: null,
      docName: `${langName || langCode?.toUpperCase()} Package`,
      selectedDocumentIds: files.map(f => f.id),
      selectedDocNames: files.map(f => f.name),
      targetLang: langCode,
      languageName: langName,
      documentCount: files.length
    });
    setShowShareModal(true);
  };

  const toggleExpandFileRow = (fileId) => {
    setExpandedFileIds(prev => 
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    );
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
        setUploadProgress({ current, total: filesList.length, percent: 0, status: "Uploading file..." });
        
        const uploadRes = await uploadFileToProject(projectId, file, (percent) => {
          const statusText = percent === 100 
            ? "100% sent! Parsing document structure & saving segments into DB..." 
            : `Uploading (${percent}%)...`;
          setUploadProgress({ current, total: filesList.length, percent, status: statusText });
        });

        if (uploadRes && (uploadRes.document || uploadRes.fileId)) {
          const docObj = uploadRes.document || { id: uploadRes.fileId, name: file.name };
          setFiles(prev => [...prev.filter(f => f.id !== docObj.id), docObj]);
          if (uploadRes.jobs && uploadRes.jobs.length > 0) {
            const formattedJobs = uploadRes.jobs.map(j => ({
              ...j,
              fileName: j.documents?.name || docObj.name
            }));
            setJobs(prev => [...prev.filter(j => j.document_id !== docObj.id), ...formattedJobs]);
          }
        }
      }
      showToast("All files uploaded and parsed successfully!");
      loadProjectDetails();
      loadAnalytics();
    } catch (err) {
      console.error("[FRONTEND UPLOAD ERROR]", err);
      const errMsg = err.response?.data?.error || err.response?.statusText || err.message || "Failed to upload file.";
      showToast(errMsg, "error");
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
      setSelectedJobs(prev => prev.filter(j => j.fileId !== fileId));
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
      const docName = job.documents?.name || "translated_file.html";
      const extIndex = docName.lastIndexOf(".");
      const ext = extIndex !== -1 ? docName.substring(extIndex) : ".html";
      await downloadJobFile(job.id, docName.replace(/\.[^/.]+$/, ""), job.target_lang, ext);
      showToast("Download started!");
    } catch (err) {
      console.error(err);
      showToast("Export download failed", "error");
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
      showToast(`Updating status to ${formatStatusLabel(newStatus)}...`);
      const updated = await updateProjectDetails(projectId, { status: newStatus });
      setProject(prev => ({
        ...prev,
        ...updated,
        status: newStatus,
        settings: { ...(prev?.settings || {}), ...(updated?.settings || {}), status: newStatus }
      }));
      setShowStatusDropdown(false);
      showToast(`Project status set to ${formatStatusLabel(newStatus)}!`);
      loadProjectDetails();
    } catch (err) {
      console.error(err);
      showToast("Failed to update status", "error");
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
      setShowSettingsModal(false);
      loadProjectDetails();
      loadAnalytics();
    } catch (err) {
      console.error(err);
      showToast("Failed to save settings", "error");
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
    } catch (err) {
      console.error(err);
      showToast("Failed to delete some files.", "error");
    }
  };

  const handleBulkDownload = async () => {
    if (selectedFiles.length === 0 && selectedJobs.length === 0) return;
    showToast("Exporting selected translation files...");
    try {
      if (selectedFiles.length > 0) {
        for (const fileId of selectedFiles) {
          const fileJobs = jobs.filter(j => j.document_id === fileId && j.progress > 0);
          for (const job of fileJobs) {
            await handleDownloadJob(job);
          }
        }
      } else if (selectedJobs.length > 0) {
        for (const selJob of selectedJobs) {
          const foundJob = jobs.find(j => j.document_id === selJob.fileId && j.target_lang === selJob.targetLang);
          if (foundJob) await handleDownloadJob(foundJob);
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
      csvContent += "Report for Project: " + (project?.name || "") + "\n";
      csvContent += "Client: " + (project?.client || "N/A") + "\n";
      csvContent += "Status: " + (project?.status || project?.settings?.status || "Active") + "\n";
      csvContent += "Source Language: " + (project?.source_lang || "EN").toUpperCase() + "\n";
      csvContent += "Target Languages: " + (project?.target_languages || []).join(", ").toUpperCase() + "\n";
      csvContent += "Total Word Count: " + (analytics?.totalWordCount || 0) + "\n\n";
      
      csvContent += "Files Summary:\n";
      csvContent += "File Name,Word Count,Size (KB),Status\n";
      files.forEach(f => {
        csvContent += `"${f.name}",${f.word_count},${Math.round(f.file_size / 1024)},"${f.status}"\n`;
      });
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `project_${(project?.name || "report").replace(/\s+/g, "_")}_report.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Report exported!");
    } catch (err) {
      console.error(err);
      showToast("Failed to export report", "error");
    }
  };

  // Selection Checkbox Logic for Master Files
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

  // Selection Checkbox Logic for Target Language Jobs
  const isJobSelected = (fileId, targetLang) => {
    return selectedJobs.some(j => j.fileId === fileId && j.targetLang === targetLang);
  };

  const toggleSelectJob = (fileId, targetLang, docName, langName) => {
    setSelectedJobs(prev => {
      const exists = prev.some(j => j.fileId === fileId && j.targetLang === targetLang);
      if (exists) {
        return prev.filter(j => !(j.fileId === fileId && j.targetLang === targetLang));
      } else {
        return [...prev, { fileId, targetLang, docName, langName }];
      }
    });
  };

  const toggleSelectAllJobsForFile = (fileId, docName) => {
    const targetLangs = project?.target_languages || [];
    const allSelectedForFile = targetLangs.every(tCode => isJobSelected(fileId, tCode));
    
    setSelectedJobs(prev => {
      const filtered = prev.filter(j => j.fileId !== fileId);
      if (allSelectedForFile) {
        return filtered;
      } else {
        const fileJobsList = targetLangs.map(tCode => ({
          fileId,
          targetLang: tCode,
          docName,
          langName: getLanguageName(tCode)
        }));
        return [...filtered, ...fileJobsList];
      }
    });
  };

  const clearAllSelections = () => {
    setSelectedFiles([]);
    setSelectedJobs([]);
  };

  const getLanguageName = (code) => {
    if (!code) return "";
    const found = LANGUAGES.find(l => l.code === code.toLowerCase());
    return found ? found.name : code.toUpperCase();
  };

  const getLanguageFlag = (code) => {
    return <LanguageFlag code={code} />;
  };

  const handleOpenEditorWithLang = (fileId, langCode) => {
    const foundJob = jobs.find(j => j.document_id === fileId && j.target_lang === langCode);
    if (foundJob) {
      onOpenEditor(foundJob.id, fileId, langCode);
    } else {
      onOpenEditor(null, fileId, langCode);
    }
  };

  // Summary Metrics
  const totalFiles = files.length;
  const totalTargetLangs = project?.target_languages?.length || 0;
  const totalWordsCount = files.reduce((sum, f) => sum + (f.word_count || 0), 0);

  const overallTranslationProgress = jobs.length > 0 
    ? Math.round(jobs.reduce((sum, j) => sum + (j.progress || 0), 0) / jobs.length)
    : 0;

  const isProjectOwner = project?.owner_id ? (userId === project.owner_id || ["admin", "super_admin", "verbolabs_staff"].includes(userRole)) : true;
  const currentStatus = normalizeStatus(project?.status || project?.settings?.status);

  // Filtered & Sorted Files List
  const filteredFiles = files.filter(f => {
    if (fileSearchQuery && !f.name?.toLowerCase().includes(fileSearchQuery.toLowerCase())) return false;
    return true;
  });

  const sortedFiles = [...filteredFiles].sort((a, b) => {
    if (fileSortBy === "oldest") return new Date(a.created_at) - new Date(b.created_at);
    if (fileSortBy === "name_asc") return (a.name || "").localeCompare(b.name || "");
    if (fileSortBy === "name_desc") return (b.name || "").localeCompare(a.name || "");
    if (fileSortBy === "words_desc") return (b.word_count || 0) - (a.word_count || 0);
    if (fileSortBy === "words_asc") return (a.word_count || 0) - (b.word_count || 0);
    return new Date(b.created_at) - new Date(a.created_at); // default newest
  });

  const hiddenFileInput = (
    <input 
      type="file" 
      ref={fileInputRef} 
      onChange={handleFileUpload} 
      multiple 
      className="hidden" 
      accept=".docx,.xlsx,.pptx,.pdf,.html,.htm,.txt,.json,.srt,.vtt,.tmx,.xliff" 
    />
  );

  if (loading) {
    return (
      <div className="p-4 space-y-4 w-full">
        <ProjectDetailsOverviewSkeleton />
        <ProjectDetailsFilesSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans text-xs pb-20 w-full px-4 md:px-6 pt-3 space-y-3 select-text">
      {hiddenFileInput}

      {/* TOP COMMAND BAR */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 backdrop-blur-xl sticky top-0 z-40 py-2.5 -mx-4 md:-mx-6 px-4 md:px-6">
        <div className="w-full flex items-center justify-between gap-3">
          
          {/* Left: Breadcrumb, Project Name & Status Selector */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="h-8 w-8 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] transition-all cursor-pointer flex items-center justify-center shrink-0"
              title="Back to Dashboard"
            >
              <ArrowLeft size={14} />
            </button>

            <div className="flex items-center gap-2 text-xs truncate">
              <span className="text-sm font-normal tracking-tight text-[var(--text-primary)] cursor-pointer hover:text-indigo-400 transition-colors" onClick={onBack}>
                Centroid
              </span>
              <span className="text-[var(--text-muted)] font-light text-xs">/</span>
              <span className="text-xs font-normal text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] transition-colors" onClick={onBack}>
                Projects
              </span>
              <span className="text-[var(--text-muted)] font-light text-xs">/</span>
              <span className="text-xs font-normal text-[var(--text-primary)] truncate">
                {project?.name || "Project"}
              </span>
            </div>

            {/* Clean Status Dropdown */}
            <div className="relative shrink-0" ref={statusDropdownRef}>
              <button
                type="button"
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-[var(--bg-hover)] text-xs font-normal transition-colors cursor-pointer border border-transparent hover:border-[var(--border-subtle)] group"
                title="Click to change project status"
              >
                <span className={`w-1.5 h-1.5 rounded-xs ${getStatusDotColor(currentStatus)}`} />
                <span className="text-[var(--text-primary)] font-normal">{formatStatusLabel(currentStatus)}</span>
                <ChevronDown size={11} className="text-[var(--text-muted)] opacity-60 group-hover:opacity-100 transition-opacity" />
              </button>

              {showStatusDropdown && (
                <div className="absolute left-0 mt-1 w-36 bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-xl shadow-2xl z-50 py-1 text-xs select-none text-left animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2.5 py-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)] mb-0.5">
                    Change Status
                  </div>
                  {STATUS_OPTIONS.map((opt) => {
                    const isCurrent = normalizeStatus(currentStatus) === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleStatusChange(opt.value)}
                        className={`w-full text-left px-2.5 py-1.5 hover:bg-[var(--bg-hover)] flex items-center justify-between text-xs transition-colors cursor-pointer ${
                          isCurrent ? "font-semibold text-indigo-400 bg-indigo-500/5" : "text-[var(--text-primary)]"
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
          </div>

          {/* Right: Executive Action Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium h-8 px-3 rounded-lg shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <Upload size={13} />
              <span>Add Document</span>
            </button>

            {isProjectOwner && (
              <button
                onClick={() => setShowBatchTranslateModal(true)}
                className="btn-batch-translate flex items-center gap-1.5 text-xs font-medium h-8 px-2.5 rounded-lg transition-all cursor-pointer shadow-xs"
                title="Batch AI Translation"
              >
                <Sparkles size={13} />
                <span className="hidden sm:inline">Batch Translate</span>
              </button>
            )}

            <button
              onClick={() => {
                setAnalysisTargetDocId(null);
                setAnalysisTargetDocName("");
                setShowTmAnalysisModal(true);
              }}
              className="btn-batch-translate flex items-center gap-1.5 text-xs font-medium h-8 px-2.5 rounded-lg transition-all cursor-pointer shadow-xs"
              title="Exclusive Cross-File & Project TM Volume Analysis"
            >
              <BarChart3 size={13} className="text-cyan-400" />
              <span className="hidden sm:inline">Volume Analysis</span>
            </button>

            <button
              onClick={openProjectShareModal}
              className="btn-share-project flex items-center gap-1.5 text-xs font-medium h-8 px-2.5 rounded-lg transition-all cursor-pointer shadow-xs"
              title="Share Project Workspace"
            >
              <Users size={13} />
              <span className="hidden sm:inline">Share</span>
            </button>

            {isProjectOwner && (
              <button
                onClick={() => setShowAccessRequestsModal(true)}
                className="flex items-center gap-1.5 text-xs font-medium h-8 px-2.5 rounded-lg border transition-all cursor-pointer shadow-xs relative"
                style={{
                  background: pendingProjectRequests.length > 0 ? "rgba(245, 158, 11, 0.15)" : "var(--bg-panel)",
                  borderColor: pendingProjectRequests.length > 0 ? "rgba(245, 158, 11, 0.45)" : "var(--border-medium)",
                  color: pendingProjectRequests.length > 0 ? "var(--amber)" : "var(--text-primary)"
                }}
                title={pendingProjectRequests.length > 0 ? `${pendingProjectRequests.length} pending access request(s)` : "Access Requests"}
              >
                <ShieldCheck size={13} className={pendingProjectRequests.length > 0 ? "text-amber-400" : ""} />
                <span className="hidden sm:inline">Requests</span>
                {pendingProjectRequests.length > 0 && (
                  <span className="flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-extrabold bg-amber-500 text-black">
                    {pendingProjectRequests.length}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={handleExportReports}
              className="topbar-icon-action h-8 w-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer shadow-xs"
              title="Export CSV Report"
            >
              <FileCode size={15} />
            </button>

            <button
              onClick={() => setShowNotesModal(true)}
              className="topbar-icon-action h-8 w-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer shadow-xs"
              title="Project Notes"
            >
              <StickyNote size={15} />
            </button>

            <button
              onClick={() => setShowHistoryModal(true)}
              className="topbar-icon-action h-8 w-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer shadow-xs"
              title="Activity Audit Log"
            >
              <History size={15} />
            </button>

            {["vendor", "admin", "super_admin"].includes(userRole) && (
              <button
                onClick={() => window.location.href = "/vendor/dashboard"}
                className="topbar-icon-action h-8 px-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20"
                title="Open Vendor Management Portal"
              >
                <Users size={14} className="text-indigo-400" />
                <span className="hidden sm:inline">Vendor Portal</span>
              </button>
            )}

            {(userRole === "admin" || userRole === "super_admin") && (
              <button
                onClick={onOpenAdmin}
                className="topbar-icon-action h-8 w-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer shadow-xs"
                title="Admin Console"
              >
                <LayoutDashboard size={15} />
              </button>
            )}

            <button
              onClick={() => {
                if (onOpenSettings) onOpenSettings();
                else setShowSettingsModal(true);
              }}
              className="h-8 w-8 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer border border-transparent hover:border-[var(--border-subtle)]"
              title="Project Settings"
            >
              <Settings size={15} />
            </button>
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

        </div>
      </div>

      {/* WORKSPACE NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
        <button
          onClick={() => setActiveTab("studio")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
            activeTab === "studio"
              ? "bg-[var(--accent)] text-white shadow-xs"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          }`}
        >
          <Layers size={13} /> Studio Workspace
        </button>

        <button
          onClick={() => setActiveTab("analytics")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
            activeTab === "analytics"
              ? "bg-[var(--accent)] text-white shadow-xs"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          }`}
        >
          <BarChart3 size={13} /> Executive Analytics
        </button>
      </div>

      {/* TAB 1: STUDIO WORKSPACE */}
      {activeTab === "studio" && (
        <div className="space-y-3">
          
          {/* TARGET LANGUAGE FILTER PILLS & SORT DROP-DOWN */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            
            {/* Target Language Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
              <button
                onClick={() => setActiveLangTab("all")}
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-all cursor-pointer shrink-0 ${
                  activeLangTab === "all"
                    ? "tab-lang-all-active shadow-xs"
                    : "tab-lang-btn-inactive"
                }`}
              >
                <FileText size={12} />
                <span>All Files ({files.length})</span>
              </button>

              {project?.target_languages?.map((tLang) => {
                const langName = getLanguageName(tLang);
                const isSelected = activeLangTab === tLang;
                return (
                  <button
                    key={tLang}
                    onClick={() => setActiveLangTab(tLang)}
                    className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-all cursor-pointer shrink-0 ${
                      isSelected
                        ? "tab-lang-target-active shadow-xs"
                        : "tab-lang-btn-inactive"
                    }`}
                  >
                    <LanguageFlag code={tLang} />
                    <span>{langName}</span>
                  </button>
                );
              })}

              <button
                onClick={() => {
                  setSelectedAddLangs(project?.target_languages || []);
                  setShowAddLangModal(true);
                }}
                className="btn-add-locale flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md transition-all cursor-pointer shrink-0 shadow-xs"
              >
                <Plus size={11} /> Add Locale
              </button>
            </div>

            {/* Right: Search & Sort Dropdown */}
            <div className="flex items-center gap-2">
              <div className="relative min-w-[180px]">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search documents..."
                  value={fileSearchQuery}
                  onChange={(e) => setFileSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-2.5 py-1 rounded-md border border-[var(--border-medium)] bg-[var(--bg-input)] text-xs font-normal text-[var(--text-primary)] outline-none focus:border-indigo-500 transition-all placeholder-[var(--text-muted)]"
                />
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-1 bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-md px-2 py-1 text-xs font-normal">
                <ArrowUpDown size={12} className="text-[var(--text-muted)]" />
                <select
                  value={fileSortBy}
                  onChange={(e) => setFileSortBy(e.target.value)}
                  className="bg-transparent text-[var(--text-primary)] outline-none cursor-pointer text-xs font-normal"
                >
                  <option value="newest" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Newest First</option>
                  <option value="oldest" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Oldest First</option>
                  <option value="name_asc" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Name (A-Z)</option>
                  <option value="name_desc" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Name (Z-A)</option>
                  <option value="words_desc" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Highest Words</option>
                  <option value="words_asc" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Lowest Words</option>
                </select>
              </div>
            </div>

          </div>

          {/* Upload Progress Banner */}
          {isUploading && uploadProgress && (
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-md p-2.5 space-y-1 animate-pulse">
              <div className="flex justify-between items-center text-xs font-medium text-indigo-300">
                <span>{uploadProgress.status} ({uploadProgress.current}/{uploadProgress.total})</span>
                <span>{uploadProgress.percent || 0}%</span>
              </div>
              <div className="w-full bg-[var(--bg-input)] h-1 rounded-full overflow-hidden border border-indigo-500/20">
                <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress.percent || 0}%` }} />
              </div>
            </div>
          )}

          {/* SPECIFIC TARGET LANGUAGE TAB WORKSPACE */}
          {activeLangTab !== "all" ? (
            <div className="space-y-3">
              
              {/* Language Control Banner */}
              <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-md bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-lg shrink-0">
                    <LanguageFlag code={activeLangTab} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-primary)] select-text">
                      {getLanguageName(activeLangTab)} ({activeLangTab.toUpperCase()}) Workspace
                    </h3>
                    <p className="text-[10px] text-[var(--text-muted)] font-normal select-text">
                      Showing all {sortedFiles.length} file(s) for {getLanguageName(activeLangTab)} translation.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openLanguageShareModal(activeLangTab, getLanguageName(activeLangTab))}
                    className="flex items-center gap-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-medium h-6 px-2.5 rounded-md shadow-xs transition-all cursor-pointer active:scale-[0.98]"
                  >
                    <Users size={11} /> Assign All {getLanguageName(activeLangTab)} Files
                  </button>

                  <button
                    onClick={() => handleDownloadZipLanguage(activeLangTab)}
                    className="flex items-center gap-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs font-medium h-6 px-2 rounded-md transition-all cursor-pointer"
                  >
                    <Download size={11} /> Download ZIP
                  </button>
                </div>
              </div>

              {/* Data Table for this specific language */}
              <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 text-[10px] uppercase font-semibold tracking-wider text-[var(--text-muted)]">
                      <th className="py-2 px-3 font-semibold">Document Name</th>
                      <th className="py-2 px-3 font-semibold">Word Count</th>
                      <th className="py-2 px-3 font-semibold">Translation Progress</th>
                      <th className="py-2 px-3 font-semibold">Assignee</th>
                      <th className="py-2 px-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] font-normal select-text">
                    {sortedFiles.map((file) => {
                      const job = jobs.find(j => j.document_id === file.id && j.target_lang === activeLangTab);
                      const progress = job?.progress || 0;
                      const langName = getLanguageName(activeLangTab);

                      return (
                        <tr key={file.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <FileText size={14} className="text-indigo-400 shrink-0" />
                              <span className="font-medium text-[var(--text-primary)] select-text">{file.name}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-[var(--text-secondary)] select-text font-mono text-[11px]">
                            {file.word_count?.toLocaleString() || 0} words
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2 max-w-[140px]">
                              <div className="flex-1 bg-[var(--bg-input)] h-1 rounded-full overflow-hidden border border-[var(--border-subtle)]">
                                <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${progress}%` }} />
                              </div>
                              <span className="text-[10px] font-medium text-emerald-400">{progress}%</span>
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <button
                              onClick={() => openLanguageJobShareModal(file.id, file.name, activeLangTab, langName)}
                              className="btn-assign-linguist inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md transition-all cursor-pointer shadow-xs"
                            >
                              <Users size={10} /> Assign Linguist
                            </button>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => handleOpenEditorWithLang(file.id, activeLangTab)}
                              className="inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium h-6 px-2.5 rounded-md transition-all cursor-pointer active:scale-[0.98]"
                            >
                              <span>Editor</span>
                              <ChevronRight size={10} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          ) : (

            /* MASTER ALL FILES DATA TABLE WITH JOB-LEVEL SELECTION CHECKBOXES & SCROLLABLE MULTI-LANGUAGE MATRIX */
            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 text-[10px] uppercase font-semibold tracking-wider text-[var(--text-muted)]">
                    <th className="py-2 px-3 w-8"></th>
                    <th className="py-2 px-3 w-8">
                      <button onClick={toggleSelectAllFiles} className="cursor-pointer text-[var(--text-muted)] hover:text-white" title="Select/Deselect All Files">
                        {selectedFiles.length === files.length && files.length > 0 ? <CheckSquare size={14} className="text-indigo-400" /> : <Square size={14} />}
                      </button>
                    </th>
                    <th className="py-2 px-3 font-semibold">Document Name</th>
                    <th className="py-2 px-3 font-semibold">Words</th>
                    <th className="py-2 px-3 font-semibold">Configured Locales</th>
                    <th className="py-2 px-3 font-semibold">Overall Progress</th>
                    <th className="py-2 px-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-normal select-text">
                  {sortedFiles.map((file) => {
                    const isExpanded = expandedFileIds.includes(file.id);
                    const isSelected = selectedFiles.includes(file.id);
                    const fileJobs = jobs.filter(j => j.document_id === file.id);
                    const avgProgress = fileJobs.length > 0 
                      ? Math.round(fileJobs.reduce((sum, j) => sum + (j.progress || 0), 0) / fileJobs.length) 
                      : 0;
                    const allJobsSelectedForFile = project?.target_languages?.every(tCode => isJobSelected(file.id, tCode));

                    return (
                      <React.Fragment key={file.id}>
                        
                        {/* Master File Row */}
                        <tr className={`hover:bg-[var(--bg-hover)] transition-colors ${isExpanded ? "bg-indigo-500/5" : ""}`}>
                          <td className="py-2 px-3 text-center">
                            <button
                              onClick={() => toggleExpandFileRow(file.id)}
                              className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                              title="Expand target language jobs matrix"
                            >
                              <ChevronRight size={14} className={`transition-transform duration-200 ${isExpanded ? "rotate-90 text-indigo-400" : ""}`} />
                            </button>
                          </td>

                          <td className="py-2 px-3 text-center">
                            <button onClick={() => toggleSelectFile(file.id)} className="cursor-pointer text-[var(--text-muted)]">
                              {isSelected ? <CheckSquare size={14} className="text-indigo-400" /> : <Square size={14} />}
                            </button>
                          </td>

                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <FileText size={14} className="text-indigo-400 shrink-0" />
                              <span className="font-medium text-[var(--text-primary)] select-text">{file.name}</span>
                            </div>
                          </td>

                          <td className="py-2 px-3 text-[var(--text-secondary)] font-mono select-text text-xs">
                            {file.word_count?.toLocaleString() || 0}
                          </td>

                          <td className="py-2 px-3">
                            <div className="flex items-center gap-1 flex-wrap">
                              {project?.target_languages?.map(t => (
                                <span key={t} className="badge-locale-item text-[10px] px-1.5 py-0.5 rounded font-mono uppercase">
                                  <LanguageFlag code={t} /> {t}
                                </span>
                              ))}
                            </div>
                          </td>

                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2 max-w-[120px]">
                              <div className="flex-1 bg-[var(--bg-input)] h-1 rounded-full overflow-hidden border border-[var(--border-subtle)]">
                                <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${avgProgress}%` }} />
                              </div>
                              <span className="text-[10px] font-medium text-emerald-400">{avgProgress}%</span>
                            </div>
                          </td>

                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => {
                                  setAnalysisTargetDocId(file.id);
                                  setAnalysisTargetDocName(file.name);
                                  setShowTmAnalysisModal(true);
                                }}
                                className="p-1 rounded text-[var(--text-muted)] hover:text-cyan-400 cursor-pointer"
                                title="Run TM Volume Analysis for this file"
                              >
                                <BarChart3 size={13} />
                              </button>
                              <button
                                onClick={() => openSingleFileShareModal(file.id, file.name)}
                                className="p-1 rounded text-[var(--text-muted)] hover:text-indigo-400 cursor-pointer"
                                title="Share file"
                              >
                                <Users size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteFile(file.id, file.name)}
                                className="p-1 rounded text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                                title="Delete file"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* EXPANDED HIGH-DENSITY SCROLLABLE TARGET LANGUAGE MATRIX WITH JOB CHECKBOXES */}
                        {isExpanded && (
                          <tr className="bg-[var(--bg-surface)]/50">
                            <td colSpan={7} className="p-2.5 pl-8">
                              <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-md max-h-72 overflow-y-auto shadow-xs">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead className="sticky top-0 z-10 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] text-[9px] uppercase font-semibold tracking-wider text-[var(--text-muted)]">
                                    <tr>
                                      <th className="py-1.5 px-3 w-8 text-center">
                                        <button
                                          onClick={() => toggleSelectAllJobsForFile(file.id, file.name)}
                                          className="cursor-pointer text-[var(--text-muted)] hover:text-white"
                                          title="Select/Deselect All Language Jobs for this file"
                                        >
                                          {allJobsSelectedForFile ? <CheckSquare size={13} className="text-indigo-400" /> : <Square size={13} />}
                                        </button>
                                      </th>
                                      <th className="py-1.5 px-3 font-semibold">Target Locale</th>
                                      <th className="py-1.5 px-3 font-semibold">Translation Progress</th>
                                      <th className="py-1.5 px-3 font-semibold">Assigned Linguist</th>
                                      <th className="py-1.5 px-3 text-right font-semibold">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[var(--border-subtle)] font-normal select-text">
                                    {project?.target_languages?.map((tCode) => {
                                      const job = fileJobs.find(j => j.target_lang === tCode);
                                      const progress = job?.progress || 0;
                                      const langName = getLanguageName(tCode);
                                      const jobChecked = isJobSelected(file.id, tCode);

                                      return (
                                        <tr key={tCode} className={`hover:bg-[var(--bg-hover)] transition-colors ${jobChecked ? "bg-indigo-500/10" : ""}`}>
                                          <td className="py-1.5 px-3 text-center">
                                            <button
                                              onClick={() => toggleSelectJob(file.id, tCode, file.name, langName)}
                                              className="cursor-pointer text-[var(--text-muted)]"
                                            >
                                              {jobChecked ? <CheckSquare size={13} className="text-indigo-400" /> : <Square size={13} />}
                                            </button>
                                          </td>

                                          <td className="py-1.5 px-3">
                                            <div className="flex items-center gap-1.5">
                                              <LanguageFlag code={tCode} />
                                              <span className="font-medium text-[var(--text-primary)] select-text">{langName}</span>
                                              <span className="text-[9px] font-mono text-indigo-400 uppercase select-text">({tCode})</span>
                                            </div>
                                          </td>

                                          <td className="py-1.5 px-3">
                                            <div className="flex items-center gap-2 max-w-[120px]">
                                              <div className="flex-1 bg-[var(--bg-input)] h-1 rounded-full overflow-hidden border border-[var(--border-subtle)]">
                                                <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${progress}%` }} />
                                              </div>
                                              <span className="text-[10px] font-medium text-emerald-400">{progress}%</span>
                                            </div>
                                          </td>

                                          <td className="py-1.5 px-3">
                                            <button
                                              onClick={() => openLanguageJobShareModal(file.id, file.name, tCode, langName)}
                                              className="btn-assign-linguist inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded cursor-pointer shadow-xs"
                                              title={`Assign ${langName} job to linguist`}
                                            >
                                              <Users size={10} /> Assign {tCode.toUpperCase()}
                                            </button>
                                          </td>

                                          <td className="py-1.5 px-3 text-right">
                                            <button
                                              onClick={() => handleOpenEditorWithLang(file.id, tCode)}
                                              className="inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium h-5 px-2 rounded cursor-pointer active:scale-[0.98]"
                                            >
                                              <span>Editor</span>
                                              <ChevronRight size={10} />
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}

                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* DUAL FLOATING TOOLBAR FOR FILES AND INDIVIDUAL JOB SELECTIONS */}
          {(selectedFiles.length > 0 || selectedJobs.length > 0) && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[var(--bg-surface)]/95 border border-indigo-500/40 rounded-lg px-3.5 py-1.5 shadow-2xl backdrop-blur-xl flex items-center gap-3 animate-slide-up select-none">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-xs font-medium text-[var(--text-primary)]">
                  {selectedFiles.length > 0 ? `${selectedFiles.length} File(s)` : `${selectedJobs.length} Language Job(s)`} Selected
                </span>
              </div>

              <div className="h-3 w-px bg-[var(--border-subtle)]" />

              <div className="flex items-center gap-1.5">
                {selectedFiles.length > 0 ? (
                  <>
                    <button
                      onClick={openBulkFileShareModal}
                      className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium h-6 px-2 rounded-md cursor-pointer transition-all active:scale-[0.98]"
                    >
                      <Users size={11} /> Share Selected Files
                    </button>

                    {isProjectOwner && (
                      <button
                        onClick={() => setShowBatchTranslateModal(true)}
                        className="btn-batch-translate flex items-center gap-1 text-xs font-medium h-6 px-2 rounded-md cursor-pointer transition-all active:scale-[0.98] shadow-xs"
                      >
                        <Sparkles size={11} /> Batch Translate
                      </button>
                    )}

                    <button
                      onClick={handleBulkDownload}
                      className="flex items-center gap-1 bg-blue-600/15 hover:bg-blue-600/25 text-blue-700 dark:text-blue-400 border border-blue-500/30 dark:border-blue-500/20 text-xs font-medium h-6 px-2 rounded-md cursor-pointer transition-all active:scale-[0.98]"
                    >
                      <Download size={11} /> Download
                    </button>

                    <button
                      onClick={handleBulkDelete}
                      className="flex items-center gap-1 bg-rose-600/15 hover:bg-rose-600/25 text-rose-700 dark:text-rose-400 border border-rose-500/30 dark:border-rose-500/20 text-xs font-medium h-6 px-2 rounded-md cursor-pointer transition-all active:scale-[0.98]"
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={openBulkJobsShareModal}
                      className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium h-6 px-2.5 rounded-md cursor-pointer transition-all active:scale-[0.98]"
                    >
                      <Users size={11} /> Assign {selectedJobs.length} Selected Jobs to Linguist(s)
                    </button>

                    <button
                      onClick={handleBulkDownload}
                      className="flex items-center gap-1 bg-blue-600/15 hover:bg-blue-600/25 text-blue-700 dark:text-blue-400 border border-blue-500/30 dark:border-blue-500/20 text-xs font-medium h-6 px-2 rounded-md cursor-pointer transition-all active:scale-[0.98]"
                    >
                      <Download size={11} /> Download Jobs
                    </button>
                  </>
                )}
              </div>

              <div className="h-3 w-px bg-[var(--border-subtle)]" />

              <button
                onClick={clearAllSelections}
                className="p-0.5 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                title="Clear Selections"
              >
                <XCircle size={13} />
              </button>
            </div>
          )}

        </div>
      )}

      {/* TAB 2: EXECUTIVE ANALYTICS WORKSPACE */}
      {activeTab === "analytics" && (
        <div className="space-y-3">
          
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">Executive Translation Analytics & TM Leverage</h3>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5 font-normal">
                Breakdown of Translation Memory match rates, fuzzy leverage, cost savings, and QA pass rates.
              </p>
            </div>
            <button
              onClick={handleExportReports}
              className="flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-medium h-6 px-2.5 rounded-md transition-all cursor-pointer"
            >
              <BarChart3 size={12} /> Export CSV Report
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3 rounded-lg space-y-1">
              <span className="text-[10px] font-semibold uppercase text-[var(--text-muted)] tracking-wider">ICE Match (101%)</span>
              <h4 className="text-lg font-bold text-emerald-400">{analytics?.iceMatchPercent || 0}%</h4>
              <p className="text-[10px] text-[var(--text-secondary)] font-normal">In-Context Exact matches saved from pre-translation.</p>
            </div>

            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3 rounded-lg space-y-1">
              <span className="text-[10px] font-semibold uppercase text-[var(--text-muted)] tracking-wider">Exact Match (100%)</span>
              <h4 className="text-lg font-bold text-indigo-400">{analytics?.exactMatchPercent || 0}%</h4>
              <p className="text-[10px] text-[var(--text-secondary)] font-normal">Exact segment matches retrieved from global TM.</p>
            </div>

            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3 rounded-lg space-y-1">
              <span className="text-[10px] font-semibold uppercase text-[var(--text-muted)] tracking-wider">Fuzzy Match (75-99%)</span>
              <h4 className="text-lg font-bold text-purple-400">{analytics?.fuzzyMatchPercent || 0}%</h4>
              <p className="text-[10px] text-[var(--text-secondary)] font-normal">Partial matches leveraged during translation.</p>
            </div>

            <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3 rounded-lg space-y-1">
              <span className="text-[10px] font-semibold uppercase text-[var(--text-muted)] tracking-wider">MT Post-Edit</span>
              <h4 className="text-lg font-bold text-amber-400">{analytics?.mtPercent || 0}%</h4>
              <p className="text-[10px] text-[var(--text-secondary)] font-normal">AI Machine translation suggestions confirmed.</p>
            </div>
          </div>

        </div>
      )}

      {/* MODALS */}

      {/* Target Language Selection Modal */}
      {showAddLangModal && (
        <div className="modal-overlay">
          <div className="modal-card max-w-md p-4 select-none space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-[var(--text-primary)]">Manage Target Languages</h3>
              <button onClick={() => setShowAddLangModal(false)} className="text-[var(--text-muted)] hover:text-white">
                <X size={15} />
              </button>
            </div>

            <p className="text-[11px] text-[var(--text-secondary)]">Select target languages for translation jobs in this project:</p>

            <div className="max-h-52 overflow-y-auto grid grid-cols-2 gap-1 border border-[var(--border-subtle)] p-2 rounded-md bg-[var(--bg-input)]">
              {LANGUAGES.map(lang => {
                const isChecked = selectedAddLangs.includes(lang.code);
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      setSelectedAddLangs(prev => 
                        prev.includes(lang.code) ? prev.filter(c => c !== lang.code) : [...prev, lang.code]
                      );
                    }}
                    className={`flex items-center gap-1.5 p-1 rounded-md text-[11px] font-bold text-left transition-all cursor-pointer ${
                      isChecked ? "bg-indigo-600 text-white" : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                    }`}
                  >
                    <LanguageFlag code={lang.code} />
                    <span className="truncate">{lang.name} ({lang.code})</span>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowAddLangModal(false)} className="px-3 py-1 rounded-md text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
                Cancel
              </button>
              <button onClick={handleAddLanguages} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold px-3.5 py-1 rounded-md">
                Save Languages
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Project Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay">
          <div className="modal-card max-w-lg p-5 select-none space-y-4">
            <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">Project Configuration & Settings</h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-[var(--text-muted)] hover:text-white">
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-[var(--text-secondary)] block mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={editProjectName}
                  onChange={(e) => setEditProjectName(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-medium)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500 font-semibold"
                />
              </div>

              <div>
                <label className="font-bold text-[var(--text-secondary)] block mb-1">Client Name</label>
                <input
                  type="text"
                  placeholder="e.g. VerboLabs Global"
                  value={editClientName}
                  onChange={(e) => setEditClientName(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-medium)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500 font-semibold"
                />
              </div>

              <div>
                <label className="font-bold text-[var(--text-secondary)] block mb-1">Project Description</label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-medium)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500 font-semibold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black px-5 py-1.5 rounded-lg cursor-pointer shadow-xs transition-all active:scale-[0.98]"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upgraded Share & Assignment Modal */}
      {showShareModal && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          projectId={projectId}
          documentId={shareModalConfig.documentId}
          docName={shareModalConfig.docName || project?.name}
          targetLang={shareModalConfig.targetLang}
          isOwner={isProjectOwner}
          mode={shareModalConfig.mode}
          selectedDocumentIds={shareModalConfig.selectedDocumentIds}
          selectedDocNames={shareModalConfig.selectedDocNames}
          languageName={shareModalConfig.languageName}
          documentCount={shareModalConfig.documentCount}
          targetLanguages={project?.target_languages || []}
          selectedJobItems={shareModalConfig.selectedJobItems || []}
        />
      )}

      {/* Project Access Requests Modal */}
      {showAccessRequestsModal && (
        <ProjectAccessRequestsModal
          isOpen={showAccessRequestsModal}
          onClose={() => setShowAccessRequestsModal(false)}
          projectId={projectId}
          projectName={project?.name}
          requests={pendingProjectRequests}
          onRequestsUpdated={() => {
            loadProjectRequests();
            loadProjectDetails();
          }}
          showToast={showToast}
        />
      )}

      {/* Project Notes Modal */}
      {showNotesModal && (
        <ProjectNotesModal
          isOpen={showNotesModal}
          onClose={() => setShowNotesModal(false)}
          projectId={projectId}
          projectName={project?.name}
          isOwner={isProjectOwner}
        />
      )}

      {/* Audit History Modal */}
      {showHistoryModal && (
        <ProjectHistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          projectId={projectId}
          projectName={project?.name}
        />
      )}

      {/* Batch Translate Modal */}
      {showBatchTranslateModal && (
        <BatchTranslateModal
          isOpen={showBatchTranslateModal}
          onClose={() => setShowBatchTranslateModal(false)}
          projectId={projectId}
          selectedFileIds={selectedFiles}
          files={files}
          targetLanguages={project?.target_languages || []}
          sourceLang={project?.source_lang || "en"}
          onSuccess={() => {
            loadProjectDetails();
            loadAnalytics();
          }}
        />
      )}

      {/* TM & Cross-File Volume Analysis Modal */}
      {showTmAnalysisModal && (
        <TmAnalysisModal
          show={showTmAnalysisModal}
          onClose={() => setShowTmAnalysisModal(false)}
          projectId={analysisTargetDocId ? null : projectId}
          projectName={project?.name}
          documentId={analysisTargetDocId}
          targetLanguage={activeLangTab !== "all" ? activeLangTab : (project?.target_languages?.[0] || "hi")}
          availableLanguages={project?.target_languages || ["hi"]}
          showToast={showToast}
        />
      )}

      {/* ── WORKSPACE FOOTER STATUS BAR (INLINE METRICS & LOCALES) ── */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-[var(--bg-panel)]/95 backdrop-blur-xl border-t border-[var(--border-subtle)] px-6 py-2.5 flex items-center justify-between text-xs text-[var(--text-secondary)] shadow-lg select-none">
        {/* Left: Essential Project Metrics */}
        <div className="flex items-center gap-4 text-xs font-normal overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0" title="Total Files in Workspace">
            <FileText size={13} className="text-indigo-400" />
            <span className="font-semibold text-[var(--text-primary)]">{totalFiles}</span>
            <span className="text-[var(--text-muted)]">{totalFiles === 1 ? "File" : "Files"}</span>
          </div>

          <span className="text-[var(--border-medium)] shrink-0">·</span>

          <div className="flex items-center gap-1.5 shrink-0" title="Total Translatable Words">
            <FileCode size={13} className="text-purple-400" />
            <span className="font-semibold text-[var(--text-primary)]">{totalWordsCount.toLocaleString()}</span>
            <span className="text-[var(--text-muted)]">Words</span>
          </div>

          <span className="text-[var(--border-medium)] shrink-0">·</span>

          <div className="flex items-center gap-1.5 shrink-0" title="Configured Target Locales">
            <Globe size={13} className="text-sky-400" />
            <span className="font-semibold text-[var(--text-primary)]">{totalTargetLangs}</span>
            <span className="text-[var(--text-muted)]">{totalTargetLangs === 1 ? "Locale" : "Locales"}</span>
          </div>

          <span className="text-[var(--border-medium)] shrink-0">·</span>

          <div className="flex items-center gap-1.5 shrink-0" title="Overall Project Translation Progress">
            <TrendingUp size={13} className="text-emerald-400" />
            <span className="font-semibold text-emerald-400">{overallTranslationProgress}%</span>
            <span className="text-[var(--text-muted)]">Progress</span>
          </div>
        </div>

        {/* Right: Domain & Status Metadata */}
        <div className="hidden sm:flex items-center gap-3 text-[11px] text-[var(--text-muted)] shrink-0 font-mono">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-xs ${getStatusDotColor(currentStatus)}`} />
            <span className="text-[var(--text-secondary)] font-sans font-normal">{formatStatusLabel(currentStatus)}</span>
          </div>
          <span>·</span>
          <span className="truncate">{project?.settings?.domain || "General"}</span>
        </div>
      </footer>

    </div>
  );
}
