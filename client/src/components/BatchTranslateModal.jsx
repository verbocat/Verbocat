import React, { useState, useEffect, useRef } from "react";
import { X, Play, CheckSquare, Square, ChevronDown, ChevronRight, FileText, Globe, CheckCircle2, Clock, AlertCircle, Sparkles, Loader2, StopCircle } from "lucide-react";
import { controlJobQueue, fetchJobStatus } from "../services/api.js";
import { LANGUAGES } from "../constants/languages.js";

export function BatchTranslateModal({ isOpen, onClose, files = [], jobs = [], project = {}, showToast, onReloadProject }) {
  const [expandedFileIds, setExpandedFileIds] = useState([]);
  const [selectedJobIds, setSelectedJobIds] = useState([]);
  const [showPendingOnly, setShowPendingOnly] = useState(true);
  
  // Translation progress execution states
  const [isTranslating, setIsTranslating] = useState(false);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [jobProgressMap, setJobProgressMap] = useState({});
  const [completedJobIds, setCompletedJobIds] = useState([]);
  const [failedJobIds, setFailedJobIds] = useState([]);
  const [progressIndex, setProgressIndex] = useState(0);

  const isCancelledRef = useRef(false);

  const sourceLang = project?.source_lang || "en";

  // Filter out target jobs where target language equals project source language
  const validJobs = jobs.filter(j => j.target_lang !== sourceLang);

  // Initialize expanded files and empty selections so user explicitly picks file(s)
  useEffect(() => {
    if (isOpen && files.length > 0) {
      setExpandedFileIds(files.map(f => f.id));
      setSelectedJobIds([]);
      setCompletedJobIds([]);
      setFailedJobIds([]);
      setJobProgressMap({});
    }
  }, [isOpen, files]);

  if (!isOpen) return null;

  // Toggle file expansion dropdown
  const toggleExpandFile = (fileId) => {
    setExpandedFileIds(prev => 
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    );
  };

  // Get jobs belonging to a file
  const getJobsForFile = (fileId) => {
    return validJobs.filter(j => {
      const isFileMatch = String(j.document_id) === String(fileId) || String(j.file_id) === String(fileId);
      if (!isFileMatch) return false;
      if (showPendingOnly && (j.status === "completed" || completedJobIds.includes(j.id))) return false;
      return true;
    });
  };

  // Toggle single job selection
  const toggleSelectJob = (jobId) => {
    if (isTranslating) return;
    setSelectedJobIds(prev => 
      prev.includes(jobId) ? prev.filter(id => id !== jobId) : [...prev, jobId]
    );
  };

  // Toggle all jobs for a file
  const toggleSelectFile = (fileId) => {
    if (isTranslating) return;
    const fileJobs = getJobsForFile(fileId);
    const fileJobIds = fileJobs.map(j => j.id);
    const allSelected = fileJobIds.length > 0 && fileJobIds.every(id => selectedJobIds.includes(id));

    if (allSelected) {
      setSelectedJobIds(prev => prev.filter(id => !fileJobIds.includes(id)));
    } else {
      setSelectedJobIds(prev => Array.from(new Set([...prev, ...fileJobIds])));
    }
  };

  // Select / Deselect All jobs across all files
  const toggleSelectAll = () => {
    if (isTranslating) return;
    const allEligibleJobs = validJobs.filter(j => !showPendingOnly || (j.status !== "completed" && !completedJobIds.includes(j.id)));
    const allEligibleJobIds = allEligibleJobs.map(j => j.id);
    const isAllSelected = allEligibleJobIds.length > 0 && allEligibleJobIds.every(id => selectedJobIds.includes(id));

    if (isAllSelected) {
      setSelectedJobIds([]);
    } else {
      setSelectedJobIds(allEligibleJobIds);
    }
  };

  // Cancel / Stop Translation Execution
  const handleCancelTranslation = async () => {
    isCancelledRef.current = true;
    if (currentJobId) {
      try {
        await controlJobQueue(currentJobId, "cancel");
      } catch (e) {
        console.error("Error cancelling current job:", e);
      }
    }
    setIsTranslating(false);
    setCurrentJobId(null);
    if (showToast) showToast("Batch translation stopped.", "info");
    if (onReloadProject) onReloadProject();
  };

  // Execute sequential translation one by one
  const handleStartBatchTranslation = async () => {
    if (selectedJobIds.length === 0 || isTranslating) return;

    isCancelledRef.current = false;
    setIsTranslating(true);
    setCompletedJobIds([]);
    setFailedJobIds([]);
    setProgressIndex(0);
    setCurrentProgress(0);

    const jobsToRun = validJobs.filter(j => selectedJobIds.includes(j.id));
    let completedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < jobsToRun.length; i++) {
      if (isCancelledRef.current) break;

      const job = jobsToRun[i];
      setCurrentJobId(job.id);
      setProgressIndex(i + 1);
      setCurrentProgress(0);

      try {
        await controlJobQueue(job.id, "start");

        // Poll job status until completion or failure (up to 40 attempts x 1s)
        let isDone = false;
        let attempts = 0;
        while (!isDone && attempts < 40) {
          if (isCancelledRef.current) {
            try { await controlJobQueue(job.id, "cancel"); } catch (e) {}
            break;
          }

          await new Promise(r => setTimeout(r, 1000));
          try {
            const statusData = await fetchJobStatus(job.id);
            if (statusData) {
              const liveProg = statusData.progress || 0;
              setCurrentProgress(liveProg);
              setJobProgressMap(prev => ({ ...prev, [job.id]: liveProg }));

              if (statusData.status === "completed" || liveProg === 100) {
                setCompletedJobIds(prev => [...prev, job.id]);
                completedCount++;
                isDone = true;
              } else if (statusData.status === "failed") {
                console.error(`Job ${job.id} failed:`, statusData.error_message);
                setFailedJobIds(prev => [...prev, job.id]);
                failedCount++;
                isDone = true;
              } else if (statusData.status === "cancelled") {
                isDone = true;
              }
            }
          } catch (statusErr) {
            // Non-fatal status fetch error
          }
          attempts++;
        }

        if (!isDone && !isCancelledRef.current) {
          setCompletedJobIds(prev => [...prev, job.id]);
          setJobProgressMap(prev => ({ ...prev, [job.id]: 100 }));
          completedCount++;
        }
      } catch (err) {
        if (!isCancelledRef.current) {
          console.error(`Failed to start translate job ${job.id}:`, err);
          setFailedJobIds(prev => [...prev, job.id]);
          failedCount++;
        }
      }
    }

    setCurrentJobId(null);
    setIsTranslating(false);

    if (!isCancelledRef.current) {
      if (showToast) {
        showToast(`Batch translation complete! ${completedCount} target language(s) translated.`, completedCount > 0 ? "success" : "error");
      }
      if (onReloadProject) {
        onReloadProject();
      }
    }
  };

  const getLanguageName = (code) => {
    const lang = LANGUAGES.find(l => l.code === code);
    return lang ? `${lang.flag} ${lang.name}` : (code || "").toUpperCase();
  };

  // Helper counts
  const allEligibleJobs = validJobs.filter(j => !showPendingOnly || (j.status !== "completed" && !completedJobIds.includes(j.id)));
  const allEligibleJobIds = allEligibleJobs.map(j => j.id);
  const isAllSelected = allEligibleJobIds.length > 0 && allEligibleJobIds.every(id => selectedJobIds.includes(id));
  
  const selectedJobsList = validJobs.filter(j => selectedJobIds.includes(j.id));
  const uniqueSelectedFileIds = new Set(selectedJobsList.map(j => j.document_id || j.file_id)).size;
  const totalWordsToTranslate = selectedJobsList.reduce((sum, j) => sum + (j.word_count || 0), 0);

  const activeJobObject = validJobs.find(j => j.id === currentJobId);
  const activeFileName = files.find(f => String(f.id) === String(activeJobObject?.document_id || activeJobObject?.file_id))?.name || "Document";

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-3xl select-none text-left p-6 flex flex-col gap-5 max-h-[90vh] overflow-hidden" style={{ borderRadius: "18px" }}>
        
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)] leading-snug">
                Batch Auto-Translate Files
              </h3>
              <p className="text-xs text-[var(--text-secondary)] font-medium">
                Select specific file(s) and target language jobs to auto-translate
              </p>
            </div>
          </div>

          <button 
            onClick={isTranslating ? handleCancelTranslation : onClose}
            className="p-1.5 rounded-full hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
            title={isTranslating ? "Stop Translation" : "Close modal"}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3 rounded-2xl text-xs font-bold">
          
          <button
            type="button"
            onClick={toggleSelectAll}
            disabled={isTranslating}
            className="flex items-center gap-2 hover:text-[var(--accent)] text-[var(--text-primary)] transition-all cursor-pointer disabled:opacity-40"
          >
            {isAllSelected ? (
              <CheckSquare className="w-4 h-4 text-indigo-400" />
            ) : (
              <Square className="w-4 h-4 text-[var(--text-muted)]" />
            )}
            <span>Select All Eligible Jobs</span>
          </button>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={showPendingOnly}
                onChange={(e) => setShowPendingOnly(e.target.checked)}
                disabled={isTranslating}
                className="w-3.5 h-3.5 rounded border-[var(--border-medium)] bg-[var(--bg-input)] text-indigo-500 cursor-pointer"
              />
              <span className="text-xs font-medium">Hide Completed Jobs</span>
            </label>

            <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[11px] font-bold px-3 py-1 rounded-xl">
              {uniqueSelectedFileIds} File(s) / {selectedJobIds.length} Target Lang(s) ({totalWordsToTranslate.toLocaleString()} Words)
            </span>
          </div>
        </div>

        {/* Translation Progress Active Banner */}
        {isTranslating && (
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-4 flex flex-col gap-2 shadow-inner">
            <div className="flex justify-between items-center text-xs font-bold text-indigo-300">
              <span className="flex items-center gap-2 truncate max-w-md">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
                <span>Translating {activeFileName} ({getLanguageName(activeJobObject?.target_lang)}) ({progressIndex}/{selectedJobIds.length})</span>
              </span>
              <span className="font-extrabold text-indigo-400">{currentProgress}%</span>
            </div>
            <div className="w-full bg-[var(--bg-input)] h-2 rounded-full overflow-hidden border border-indigo-500/20">
              <div 
                className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${currentProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* File & Language Jobs Hierarchy */}
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 min-h-[300px] max-h-[420px]">
          {files.length === 0 ? (
            <div className="py-20 text-center text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl">
              No files found in this project. Upload files first to enable batch translation.
            </div>
          ) : (
            files.map(file => {
              const fileJobs = getJobsForFile(file.id);
              if (fileJobs.length === 0 && showPendingOnly) return null;

              const isExpanded = expandedFileIds.includes(file.id);
              const fileJobIds = fileJobs.map(j => j.id);
              const selectedInFileCount = fileJobIds.filter(id => selectedJobIds.includes(id)).length;
              const isFileAllSelected = fileJobIds.length > 0 && selectedInFileCount === fileJobIds.length;
              const isFilePartiallySelected = selectedInFileCount > 0 && !isFileAllSelected;
              const fileTotalWords = fileJobs.reduce((sum, j) => sum + (j.word_count || 0), 0);

              return (
                <div 
                  key={file.id}
                  className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-sm transition-all"
                >
                  {/* File Header */}
                  <div className="p-3.5 flex items-center justify-between bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border-b border-[var(--border-subtle)] transition-all">
                    
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => toggleSelectFile(file.id)}
                        disabled={isTranslating || fileJobs.length === 0}
                        className="text-[var(--text-primary)] hover:text-indigo-400 transition-colors cursor-pointer disabled:opacity-30"
                      >
                        {isFileAllSelected ? (
                          <CheckSquare className="w-4 h-4 text-indigo-400" />
                        ) : isFilePartiallySelected ? (
                          <div className="w-4 h-4 rounded border border-indigo-400 bg-indigo-500/20 flex items-center justify-center">
                            <div className="w-2 h-2 bg-indigo-400 rounded-sm" />
                          </div>
                        ) : (
                          <Square className="w-4 h-4 text-[var(--text-muted)]" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleExpandFile(file.id)}
                        className="flex items-center gap-2 text-left truncate cursor-pointer group"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" />
                        )}

                        <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate group-hover:text-indigo-300 transition-colors">
                          {file.name}
                        </span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 ml-3 text-[11px] font-semibold">
                      <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 rounded-md">
                        {selectedInFileCount}/{fileJobs.length} Target Langs
                      </span>
                      <span className="text-[var(--text-muted)]">
                        {fileTotalWords.toLocaleString()} words
                      </span>
                    </div>
                  </div>

                  {/* Language Jobs */}
                  {isExpanded && (
                    <div className="p-2 space-y-1.5 bg-[var(--bg-panel)] divide-y divide-[var(--border-subtle)]/50">
                      {fileJobs.length === 0 ? (
                        <div className="py-3 text-center text-xs text-[var(--text-muted)] font-medium">
                          No target language jobs available for this file.
                        </div>
                      ) : (
                        fileJobs.map(job => {
                          const isSelected = selectedJobIds.includes(job.id);
                          const isCurrentlyExecuting = isTranslating && currentJobId === job.id;
                          const isDone = completedJobIds.includes(job.id) || job.status === "completed";
                          const isFailed = failedJobIds.includes(job.id) || job.status === "failed";
                          const liveJobProg = isCurrentlyExecuting ? currentProgress : (jobProgressMap[job.id] !== undefined ? jobProgressMap[job.id] : (job.progress || 0));

                          return (
                            <div 
                              key={job.id}
                              className={`p-2.5 rounded-xl flex items-center justify-between gap-3 text-xs transition-all ${
                                isCurrentlyExecuting 
                                  ? "bg-indigo-500/15 border border-indigo-500/40 shadow-sm" 
                                  : isDone 
                                  ? "bg-emerald-500/5" 
                                  : "hover:bg-[var(--bg-hover)]"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => toggleSelectJob(job.id)}
                                  disabled={isTranslating}
                                  className="text-[var(--text-primary)] hover:text-indigo-400 transition-colors cursor-pointer disabled:opacity-40"
                                >
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-indigo-400" />
                                  ) : (
                                    <Square className="w-4 h-4 text-[var(--text-muted)]" />
                                  )}
                                </button>

                                <Globe className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                                <span className="font-bold text-[var(--text-primary)] truncate">
                                  {getLanguageName(job.target_lang)}
                                </span>
                              </div>

                              <div className="flex items-center gap-3 flex-shrink-0">
                                <span className="text-[10px] text-[var(--text-muted)] font-medium">
                                  {(job.word_count || 0).toLocaleString()} words
                                </span>

                                {isCurrentlyExecuting ? (
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold px-2.5 py-0.5 rounded-md animate-pulse">
                                      <Loader2 className="w-3 h-3 animate-spin text-blue-400" /> Translating ({liveJobProg}%)
                                    </span>
                                  </div>
                                ) : isDone ? (
                                  <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-2.5 py-0.5 rounded-md">
                                    <CheckCircle2 className="w-3 h-3" /> Completed (100%)
                                  </span>
                                ) : isFailed ? (
                                  <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold px-2.5 py-0.5 rounded-md">
                                    <AlertCircle className="w-3 h-3" /> Failed
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold px-2.5 py-0.5 rounded-md">
                                    <Clock className="w-3 h-3" /> Queued
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[var(--border-subtle)] flex justify-between items-center">
          <span className="text-xs font-semibold text-[var(--text-muted)]">
            {selectedJobIds.length === 0 ? "Select file(s) above to translate" : `${selectedJobIds.length} Target language job(s) ready to translate`}
          </span>

          <div className="flex gap-3">
            {isTranslating ? (
              <button
                type="button"
                onClick={handleCancelTranslation}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white shadow-md flex items-center gap-2 transition-all cursor-pointer"
              >
                <StopCircle className="w-4 h-4 fill-white" />
                <span>Stop Translation</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleStartBatchTranslation}
                  disabled={selectedJobIds.length === 0}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Start Batch Translation ({selectedJobIds.length})</span>
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
