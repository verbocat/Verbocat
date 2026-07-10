import React, { useState, useEffect, useRef } from "react";
import { 
  ArrowLeft, FileText, Globe, Play, Pause, XCircle, RotateCcw, 
  Download, Upload, CheckCircle2, AlertCircle, Eye, Percent, Database, BarChart3, TrendingUp, Sparkles, Folder, Plus, Trash2
} from "lucide-react";
import io from "socket.io-client";
import { 
  fetchProjectDetails, uploadFileToProject, updateProjectLanguages, 
  controlJobQueue, downloadJobFile, downloadLanguageZip, downloadProjectZip, fetchProjectAnalytics, deleteDocument 
} from "../services/api";
import { LANGUAGES } from "../constants/languages";

export default function ProjectDetails({ projectId, onBack, onOpenEditor, showToast, theme, token }) {
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileClick = (fileId) => {
    setSelectedFileId(prev => prev === fileId ? null : fileId);
  };

  const handleDeleteFile = async (fileId, name) => {
    if (!window.confirm(`Are you sure you want to delete file "${name}"? This deletes all associated translation jobs and segments.`)) {
      return;
    }

    try {
      showToast("Deleting file...");
      await deleteDocument(fileId);
      showToast("File deleted successfully!");
      if (selectedFileId === fileId) {
        setSelectedFileId(null);
      }
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
    } catch (err) {
      console.error(err);
      showToast("Failed to execute queue command", "error");
    }
  };

  const handleDownloadJob = async (job) => {
    try {
      showToast("Exporting translated file...");
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

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case "completed": return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      case "running": return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse";
      case "paused": return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      case "failed": return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
      default: return "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20";
    }
  };

  const getLanguageName = (code) => {
    const found = LANGUAGES.find(l => l.code === code);
    return found ? found.name : code.toUpperCase();
  };

  const filteredJobs = selectedFileId 
    ? jobs.filter(job => job.document_id === selectedFileId) 
    : jobs;

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center p-6 text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent mb-4"></div>
        <p className="text-xs text-[var(--text-secondary)]">Loading project files and translation jobs...</p>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-[var(--bg-base)] text-[var(--text-primary)] p-8">
      {/* Back Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>

      {/* Project Details Banner */}
      <div className="max-w-7xl mx-auto bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-6 mb-8 flex flex-col lg:flex-row justify-between gap-6 shadow-xl">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              {project.name}
            </h1>
            {project.client && (
              <span className="bg-indigo-500/15 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-md border border-indigo-500/10">
                Client: {project.client}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-2xl">
            {project.description || "No project description provided."}
          </p>
          <div className="flex gap-4 pt-1">
            <span className="text-[11px] text-[var(--text-muted)] font-medium">
              Source Language: <strong className="text-[var(--text-primary)]">{project.source_lang.toUpperCase()}</strong>
            </span>
            <span className="text-[11px] text-[var(--text-muted)] font-medium">
              Total Target Languages: <strong className="text-[var(--text-primary)]">{project.target_languages?.length || 0}</strong>
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3 self-end lg:self-center">
          <button
            onClick={() => {
              setSelectedAddLangs(project.target_languages || []);
              setShowAddLangModal(true);
            }}
            className="flex items-center gap-2 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-medium)] text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer shadow-md transition-all"
          >
            <Plus size={16} /> Target Languages
          </button>
          
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
            className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer shadow-md transition-all relative overflow-hidden"
          >
            {isUploading && uploadProgress ? (
              <>
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-indigo-600 transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                ></div>
                <span className="relative z-10 flex items-center gap-2">
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border border-white border-t-transparent"></div>
                  Uploading ({uploadProgress.current}/{uploadProgress.total})
                </span>
              </>
            ) : (
              <>
                <Upload size={16} /> Upload Document
              </>
            )}
          </button>
        </div>
      </div>

      {/* Analytics widgets */}
      {analytics && (
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Total Word Count</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-xl font-bold">{analytics.totalWordCount?.toLocaleString()}</span>
              <span className="text-[10px] text-[var(--text-muted)]">words</span>
            </div>
          </div>
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Average MQM Score</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-xl font-bold text-emerald-400">{analytics.averageMqm}%</span>
              <span className="text-[10px] text-emerald-500/80 font-bold flex items-center gap-0.5"><Sparkles size={10} /> Excellent</span>
            </div>
          </div>
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Jobs Completion</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-xl font-bold">{analytics.completedJobs} / {analytics.totalJobs}</span>
              <span className="text-[10px] text-[var(--text-muted)]">({analytics.totalJobs > 0 ? Math.round((analytics.completedJobs / analytics.totalJobs) * 100) : 0}%)</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Left Files, Right Translation Jobs */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Files & Downloads */}
        <div className="lg:col-span-1 space-y-8">
          
          {/* Documents Table */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-5 shadow-lg">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-4 flex items-center gap-2">
              <FileText size={16} className="text-indigo-400" /> Uploaded Documents ({files.length})
            </h3>
            
            {files.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-6 text-center">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {files.map(file => (
                  <div 
                    key={file.id} 
                    onClick={() => handleFileClick(file.id)}
                    className={`bg-[var(--bg-surface)] border p-3 rounded-xl flex items-center justify-between gap-3 group transition-all cursor-pointer ${
                      selectedFileId === file.id ? "border-indigo-500 bg-indigo-500/10" : "border-[var(--border-subtle)] hover:border-zinc-700/60"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        {file.word_count || 0} words • {Math.round(file.file_size / 1024)} KB
                      </p>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFile(file.id, file.name);
                      }}
                      className="text-[var(--text-muted)] hover:text-rose-400 p-1.5 rounded-lg hover:bg-[var(--bg-hover)] opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      title="Delete File"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Zipped Downloads Card */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-5 shadow-lg space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
              <Folder size={16} className="text-indigo-400" /> Export Packages
            </h3>

            <button
              onClick={handleDownloadZipAll}
              disabled={jobs.length === 0}
              className="w-full flex items-center justify-between bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-bold p-3 rounded-xl transition-all cursor-pointer shadow-md"
            >
              <span>Download Entire Project ZIP</span>
              <Download size={14} />
            </button>

            {project.target_languages && project.target_languages.length > 0 && (
              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-2">
                  Download ZIP by Target Language
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {project.target_languages.map(lang => (
                    <button
                      key={lang}
                      onClick={() => handleDownloadZipLanguage(lang)}
                      className="flex items-center justify-between bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-medium)] text-[11px] font-bold p-2.5 rounded-lg transition-all cursor-pointer"
                    >
                      <span>{getLanguageName(lang)}</span>
                      <Download size={12} className="text-[var(--text-secondary)]" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Translation Jobs Queue (2/3 width) */}
        <div className="lg:col-span-2">
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-5 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
                <Globe size={16} className="text-indigo-400" /> Translation Jobs & Queue Manager ({filteredJobs.length})
              </h3>
              {selectedFileId && (
                <button
                  onClick={() => setSelectedFileId(null)}
                  className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md cursor-pointer transition-all"
                >
                  Clear Filter (Show All)
                </button>
              )}
            </div>

            {filteredJobs.length === 0 ? (
              <div className="text-center py-20 text-[var(--text-muted)] text-xs">
                {selectedFileId 
                  ? "No translation jobs exist for the selected document." 
                  : "Upload a document and specify target languages to generate translation jobs."}
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                {filteredJobs.map(job => (
                  <div 
                    key={job.id} 
                    className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-zinc-700/80 p-4 rounded-xl flex flex-col md:flex-row justify-between gap-4 transition-all"
                  >
                    {/* Job Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-md ${getStatusBadgeClass(job.status)}`}>
                          {job.status}
                        </span>
                        <span className="text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/10 font-bold px-2 py-0.5 rounded-md">
                          {getLanguageName(job.target_lang)}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-[var(--text-primary)] mt-2 truncate" title={job.documents?.name}>
                        {job.documents?.name || "Loading Document..."}
                      </h4>
                      <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                        {job.word_count || 0} words • Progress: {job.progress || 0}%
                      </p>

                      {job.error_message && (
                        <div className="text-[10px] text-rose-400 bg-rose-500/5 border border-rose-500/10 p-2 rounded-lg mt-2 flex items-center gap-1.5 leading-relaxed">
                          <AlertCircle size={12} /> {job.error_message}
                        </div>
                      )}
                    </div>

                    {/* Progress Bar & Queue Actions */}
                    <div className="flex flex-col justify-between items-stretch md:items-end gap-3 w-full md:w-56">
                      <div className="w-full bg-[var(--bg-input)] h-1.5 rounded-full overflow-hidden self-center md:self-end">
                        <div 
                          className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${job.progress || 0}%` }}
                        ></div>
                      </div>

                      {/* Queue Actions Controller */}
                      <div className="flex items-center gap-2 justify-end">
                        {/* Play/Pause control */}
                        {job.status === "running" && (
                          <button
                            onClick={() => handleQueueAction(job.id, "pause")}
                            className="bg-zinc-800 hover:bg-zinc-700 text-amber-400 p-2 rounded-lg border border-zinc-700/60 cursor-pointer"
                            title="Pause Translation Queue"
                          >
                            <Pause size={12} />
                          </button>
                        )}
                        {(job.status === "pending" || job.status === "paused") && (
                          <button
                            onClick={() => handleQueueAction(job.id, job.status === "paused" ? "resume" : "start")}
                            className="bg-zinc-800 hover:bg-zinc-700 text-emerald-400 p-2 rounded-lg border border-zinc-700/60 cursor-pointer"
                            title={job.status === "paused" ? "Resume Job" : "Start Translation"}
                          >
                            <Play size={12} />
                          </button>
                        )}
                        {job.status === "failed" && (
                          <button
                            onClick={() => handleQueueAction(job.id, "retry")}
                            className="bg-zinc-800 hover:bg-zinc-700 text-indigo-400 p-2 rounded-lg border border-zinc-700/60 cursor-pointer"
                            title="Retry Failed Translation"
                          >
                            <RotateCcw size={12} />
                          </button>
                        )}
                        {(job.status === "running" || job.status === "pending" || job.status === "paused") && (
                          <button
                            onClick={() => handleQueueAction(job.id, "cancel")}
                            className="bg-zinc-800 hover:bg-zinc-700 text-rose-400 p-2 rounded-lg border border-zinc-700/60 cursor-pointer"
                            title="Cancel Job"
                          >
                            <XCircle size={12} />
                          </button>
                        )}

                        <div className="h-6 w-px bg-[var(--border-subtle)] mx-1"></div>

                        {/* Open editor & download */}
                        <button
                          onClick={() => onOpenEditor(job.id, job.document_id, job.target_lang)}
                          className="flex items-center gap-1 bg-[var(--bg-surface)] border border-[var(--border-medium)] hover:bg-[var(--bg-elevated)] text-[10px] font-bold px-2.5 py-2 rounded-lg cursor-pointer transition-all"
                        >
                          <Eye size={12} /> Editor
                        </button>
                        <button
                          onClick={() => handleDownloadJob(job)}
                          disabled={job.progress === 0}
                          className="flex items-center gap-1 bg-[var(--bg-surface)] border border-[var(--border-medium)] hover:bg-[var(--bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed text-[10px] font-bold px-2.5 py-2 rounded-lg cursor-pointer transition-all"
                        >
                          <Download size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Target Languages modal */}
      {showAddLangModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-[fadeIn_0.15s_ease-out]">
            <div className="p-5 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--bg-panel)]">
              <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Configure Target Languages</h2>
              <button 
                onClick={() => setShowAddLangModal(false)}
                className="text-[var(--text-secondary)] hover:text-white cursor-pointer"
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
