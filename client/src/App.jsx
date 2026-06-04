import { useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { Header } from "./components/Header.jsx";
import { ScreenLock } from "./components/ScreenLock.jsx";
import { DragOverlay } from "./components/DragOverlay.jsx";
import { Toast } from "./components/Toast.jsx";
import { GlossaryModal } from "./components/GlossaryModal.jsx";
import { QAPanel } from "./components/QAPanel.jsx";
import { SegmentCard } from "./components/SegmentCard.jsx";
import { WorkspaceToolbar } from "./components/WorkspaceToolbar.jsx";
import { EmptyWorkspace } from "./components/EmptyWorkspace.jsx";
import { SegmentBoard } from "./components/SegmentBoard.jsx";
import { LoadingOverlay } from "./components/LoadingOverlay.jsx";
import { ContextSettingsModal } from "./components/ContextSettingsModal.jsx";
import { LANGUAGES } from "./constants/languages.js";
import { useGlossaryManager } from "./hooks/useGlossaryManager.js";
import {
  exportFile,
  translateBatch,
  uploadFile
} from "./services/api.js";
import { applyGlossaryTerms } from "./utils/glossary.js";
import { getTheme } from "./utils/theme.js";

export default function App() {
  const [segments, setSegments] = useState([]);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [fileId, setFileId] = useState(null);
  const [fileExtension, setFileExtension] = useState(".html");
  const [currentProvider, setCurrentProvider] = useState("");
  const [progress, setProgress] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("hi");
  const [darkMode, setDarkMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState(null);
  const [showQaPanel, setShowQaPanel] = useState(false);
  const [fileName, setFileName] = useState("document");
  const [isUploading, setIsUploading] = useState(false);
  const [locked, setLocked] = useState(true);
  const [userRole, setUserRole] = useState(null);
  
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [contextSettings, setContextSettings] = useState({
    domain: "General",
    contentType: "General",
    audience: "General",
    purpose: "General",
    tone: "General",
    formality: "Neutral",
    terminologyStrictness: "Flexible",
    seoOptimization: "Off"
  });

  const glossaryManager = useGlossaryManager({
    defaultSourceLang: "en",
    defaultTargetLang: "hi"
  });

  const {
    glossaryMap,
    glossaryKey,
    glossary,
    glossaryLanguagePairs,
    glossarySourceLang,
    setGlossarySourceLang,
    glossaryTargetLang,
    setGlossaryTargetLang,
    showGlossary,
    setShowGlossary,
    selectedGlossaryRows,
    addGlossaryRow,
    updateGlossary,
    toggleGlossaryRow,
    deleteSelectedGlossaryRows,
    selectAllGlossaryRows,
    clearGlossarySelection,
    clearCurrentGlossary,
    deleteLanguagePairGlossary,
    pasteGlossary
  } = glossaryManager;

  const translationGlossary = useMemo(
    () => glossaryMap[`en-${targetLanguage}`] || [],
    [glossaryMap, targetLanguage]
  );

  const stats = useMemo(() => {
    const sourceText = segments.map((segment) => segment.source).join(" ");
    const targetText = segments.map((segment) => segment.target || "").join(" ");
    const countWords = (text) =>
      text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

    return {
      segments: segments.length,
      words: countWords(sourceText),
      characters: sourceText.length,
      translatedWords: countWords(targetText),
      progress:
        segments.length > 0
          ? Math.round(
              (segments.filter((segment) => segment.verified).length /
                segments.length) *
                100
            )
          : 0
    };
  }, [segments]);

  const filteredSegments = useMemo(
    () =>
      segments.filter(
        (segment) =>
          segment.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (segment.target || "")
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      ),
    [searchQuery, segments]
  );

  const qaIssuesList = useMemo(
    () =>
      segments.flatMap((segment) =>
        (segment.qaIssues || []).map((issue) => ({
          id: segment.id,
          issue,
          source: segment.source
        }))
      ),
    [segments]
  );

  const theme = getTheme(darkMode);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  };

  const handleUnlock = (role) => {
    setUserRole(role);
    setLocked(false);
    showToast(`Unlocked as ${role}`);
  };

  const updateSegmentsWithHistory = (updater) => {
    setSegments((previous) => {
      const newSegments = typeof updater === "function" ? updater(previous) : updater;
      setHistory((h) => [...h.slice(-20), previous]);
      setFuture([]);
      return newSegments;
    });
  };

  const undo = () => {
    if (history.length === 0) return;
    setSegments((current) => {
      setFuture((f) => [current, ...f]);
      const previous = history[history.length - 1];
      setHistory((h) => h.slice(0, -1));
      return previous;
    });
    showToast("Undo successful");
  };

  const redo = () => {
    if (future.length === 0) return;
    setSegments((current) => {
      setHistory((h) => [...h, current]);
      const next = future[0];
      setFuture((f) => f.slice(1));
      return next;
    });
    showToast("Redo successful");
  };

  const handleFileProcessing = async (file) => {
    if (!file) {
      return;
    }

    try {
      setProgress(0);
      setIsUploading(true);
      const data = await uploadFile(file);
      const newSegments = data.segments.map((segment) => ({
        ...segment,
        target: "",
        verified: false
      }));
      setSegments(newSegments);
      setHistory([]);
      setFuture([]);
      setFileId(data.fileId || null);
      setFileExtension(`.${data.type}` || ".html");
      setFileName(data.originalName || file.name.replace(/\.[^/.]+$/, ""));
      setCurrentProvider("");
      setShowQaPanel(false);
      showToast(`File uploaded: ${file.name}`);
    } catch (error) {
      console.log(error);
      showToast("Upload failed. Is the backend running?", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRelinkHtml = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      showToast(`Relinking template...`);
      const data = await uploadFile(file);
      setFileId(data.fileId || null);
      showToast(`HTML Template relinked successfully! You can now Export.`);
    } catch (error) {
      console.log(error);
      showToast("Relink failed.", "error");
    }
  };

  const handleUpload = (event) => {
    handleFileProcessing(event.target.files[0]);
  };

  useEffect(() => {
    const handleDragOver = (event) => {
      event.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = () => setIsDragging(false);

    const handleDrop = (event) => {
      event.preventDefault();
      setIsDragging(false);
      if (event.dataTransfer.files && event.dataTransfer.files[0]) {
        handleFileProcessing(event.dataTransfer.files[0]);
      }
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey) {
        const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
        if (event.key === "z" && !isInput) {
          event.preventDefault();
          undo();
        } else if (event.key === "y" && !isInput) {
          event.preventDefault();
          redo();
        } else if (event.key === "s") {
          event.preventDefault();
          if (segments.length > 0) saveProject();
        } else if (event.key === "e") {
          event.preventDefault();
          if (segments.length > 0) handleExportFile();
        }
      }
    };
    
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [segments, fileId, fileName, targetLanguage, currentProvider, glossaryMap, contextSettings, history, future]);

  const handleTranslateSegments = async () => {
    if (segments.length === 0 || isTranslating) {
      return;
    }

    setIsTranslating(true);
    setProgress(0);

    const segmentsToTranslate = segments.filter(
      (s) => !s.target || s.target.trim() === ""
    );

    if (segmentsToTranslate.length === 0) {
      setIsTranslating(false);
      showToast("Everything is already translated!");
      return;
    }

    try {
      const BATCH_SIZE = 40;
      let completedCount = 0;

      for (let i = 0; i < segmentsToTranslate.length; i += BATCH_SIZE) {
        const batch = segmentsToTranslate.slice(i, i + BATCH_SIZE);
        const data = await translateBatch(batch, targetLanguage, sourceLanguage, contextSettings);
        const results = data.results || [];

        if (results.length > 0 && i === 0) {
          setCurrentProvider(results[0].provider);
        }

        setSegments((previous) => {
          const newSegments = [...previous];
          results.forEach((item) => {
            const index = newSegments.findIndex((s) => s.id === item.id);
            if (index !== -1) {
              newSegments[index] = {
                ...newSegments[index],
                target: applyGlossaryTerms(
                  newSegments[index].source,
                  item.translated,
                  translationGlossary
                ),
                provider: item.provider,
                qaIssues: item.qaIssues || [],
                fuzzyScore: item.fuzzyScore || null
              };
            }
          });
          return newSegments;
        });

        completedCount += batch.length;
        setProgress(Math.round((completedCount / segmentsToTranslate.length) * 100));
      }

      setIsTranslating(false);
      showToast("Translation completed!");
    } catch (error) {
      console.log(error);
      setIsTranslating(false);
      showToast("Translation error.", "error");
    }
  };

  const handleApplyGlossary = () => {
    if (segments.length === 0) {
      showToast("Open a file before applying glossary", "error");
      return;
    }

    updateSegmentsWithHistory((previous) =>
      previous.map((segment) => ({
        ...segment,
        target: applyGlossaryTerms(
          segment.source,
          segment.target || "",
          translationGlossary
        )
      }))
    );

    showToast("Glossary applied to current translation");
  };

  const updateTranslation = (id, value) => {
    setSegments((previous) =>
      previous.map((segment) =>
        segment.id === id ? { ...segment, target: value, verified: false } : segment
      )
    );
  };

  const toggleVerify = (id) => {
    updateSegmentsWithHistory((previous) =>
      previous.map((segment) =>
        segment.id === id ? { ...segment, verified: !segment.verified } : segment
      )
    );
  };

  const verifyAndNextSegment = (id) => {
    updateSegmentsWithHistory((previous) => {
      const newSegments = previous.map((segment) =>
        segment.id === id ? { ...segment, verified: true } : segment
      );
      
      const currentIndex = newSegments.findIndex((s) => s.id === id);
      let nextIndex = currentIndex + 1;
      
      while (nextIndex < newSegments.length) {
        if (!newSegments[nextIndex].verified) {
          const nextId = newSegments[nextIndex].id;
          
          setTimeout(() => {
            const nextElement = document.getElementById(`segment-${nextId}`);
            if (nextElement) {
              nextElement.scrollIntoView({ behavior: "smooth", block: "center" });
              nextElement.classList.add("ring-2", "ring-teal-500");
              setTimeout(() => nextElement.classList.remove("ring-2", "ring-teal-500"), 1000);
            }
            const nextTa = document.getElementById(`target-${nextId}`);
            if (nextTa) nextTa.focus();
          }, 50);
          break;
        }
        nextIndex++;
      }
      
      return newSegments;
    });
  };

  const copyAllSourceToTarget = () => {
    updateSegmentsWithHistory((previous) =>
      previous.map((segment) => ({
        ...segment,
        target: segment.target || segment.source
      }))
    );
    showToast("Copied all source to empty targets!");
  };

  const saveProject = () => {
    const projectData = {
      fileId,
      fileName,
      fileExtension,
      sourceLanguage,
      targetLanguage,
      currentProvider,
      segments,
      glossaryMap,
      contextSettings
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], {
      type: "application/json"
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${fileName}_${targetLanguage}.json`);
    document.body.appendChild(link);
    link.click();
    showToast("Project saved!");
  };

  const loadProject = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const text = await file.text();

    try {
      const project = JSON.parse(text);
      setFileId(project.fileId || null);
      setFileExtension(project.fileExtension || ".html");
      setFileName(project.fileName || file.name.replace(".json", ""));
      setSegments(project.segments || []);
      setHistory([]);
      setFuture([]);
      setSourceLanguage(project.sourceLanguage || "en");
      setTargetLanguage(project.targetLanguage || "hi");
      setCurrentProvider(project.currentProvider || "");
      setShowQaPanel(false);
      glossaryManager.setGlossaryMap(project.glossaryMap || {});
      
      if (project.contextSettings) {
        setContextSettings(project.contextSettings);
      }
      
      showToast("Project loaded!");
    } catch (error) {
      showToast("Invalid project file", "error");
    }
  };

  const handleExportFile = async () => {
    try {
      const blob = await exportFile(fileId, segments, fileExtension);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${fileName}_${targetLanguage}${fileExtension}`);
      document.body.appendChild(link);
      link.click();
      showToast("File exported successfully!");
    } catch (error) {
      console.log(error);
      showToast("Export failed", "error");
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!");
  };

  const closeProject = () => {
    setSegments([]);
    setHistory([]);
    setFuture([]);
    setFileId(null);
    setCurrentProvider("");
    setProgress(0);
    setIsTranslating(false);
    setSearchQuery("");
    showToast("Project closed");
  };

  const goToSegment = (id) => {
    const element = document.getElementById(`segment-${id}`);
    if (!element) {
      return;
    }

    element.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    element.classList.add("ring-2", "ring-red-500");

    window.setTimeout(() => {
      element.classList.remove("ring-2", "ring-red-500");
    }, 2000);
  };

  return (
    <div
      className={`h-screen flex flex-col overflow-hidden ${theme.bg} ${theme.text} font-sans transition-colors duration-300`}
    >
      <DragOverlay isDragging={isDragging} />
      <LoadingOverlay isUploading={isUploading} theme={theme} />
      <Toast toast={toast} />

      <Header
        currentProvider={currentProvider}
        darkMode={darkMode}
        onOpenGlossary={() => setShowGlossary(true)}
        onLoadProject={loadProject}
        onToggleDarkMode={() => setDarkMode((value) => !value)}
        onLock={() => setLocked(true)}
        qaIssuesCount={qaIssuesList.length}
        segmentsCount={segments.length}
        progress={stats.progress}
        theme={theme}
      />

      {locked && <ScreenLock onUnlock={handleUnlock} />}

      <GlossaryModal
        darkMode={darkMode}
        glossary={glossary}
        glossaryKey={glossaryKey}
        glossaryLanguagePairs={glossaryLanguagePairs}
        glossarySourceLang={glossarySourceLang}
        glossaryTargetLang={glossaryTargetLang}
        languages={LANGUAGES}
        onAddRow={addGlossaryRow}
        onClearCurrentGlossary={clearCurrentGlossary}
        onClearSelection={clearGlossarySelection}
        onClose={() => setShowGlossary(false)}
        onDeleteLanguagePair={deleteLanguagePairGlossary}
        onDeleteSelected={deleteSelectedGlossaryRows}
        onPasteGlossary={pasteGlossary}
        onApplyGlossary={handleApplyGlossary}
        onSelectAll={selectAllGlossaryRows}
        onSelectPair={(source, target) => {
          setGlossarySourceLang(source);
          setGlossaryTargetLang(target);
        }}
        onToggleRow={toggleGlossaryRow}
        onUpdateGlossary={updateGlossary}
        selectedGlossaryRows={selectedGlossaryRows}
        setGlossarySourceLang={setGlossarySourceLang}
        setGlossaryTargetLang={setGlossaryTargetLang}
        show={showGlossary}
        canApplyGlossary={segments.length > 0}
        theme={theme}
      />

      <ContextSettingsModal
        show={showContextPanel}
        onClose={() => setShowContextPanel(false)}
        contextSettings={contextSettings}
        setContextSettings={setContextSettings}
        theme={theme}
      />

      <div className="w-full flex-1 overflow-hidden flex flex-col px-2 pb-4 pt-2 sm:px-4">
        {isTranslating && (
          <div className="fixed bottom-8 right-8 z-50 w-80 overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 p-4 text-white shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200">
                Translating
              </span>
              <span className="font-mono text-sm">{progress}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 to-slate-300 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {segments.length === 0 ? (
          <main className="mx-auto max-w-4xl">
            <EmptyWorkspace
              darkMode={darkMode}
              onLoadProject={loadProject}
              onOpenGlossary={() => setShowGlossary(true)}
              onUpload={handleUpload}
              theme={theme}
            />
          </main>
        ) : (
          <main className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="shrink-0">
              <WorkspaceToolbar
                onCloseProject={closeProject}
                onExport={handleExportFile}
                onLoadProject={loadProject}
                onOpenGlossary={() => setShowGlossary(true)}
                onOpenContext={() => setShowContextPanel(true)}
                onSaveProject={saveProject}
                onRelinkHtml={handleRelinkHtml}
                onTranslate={handleTranslateSegments}
                onToggleQa={() => setShowQaPanel((value) => !value)}
                onCopyAllSource={copyAllSourceToTarget}
                isTranslating={isTranslating}
                qaIssuesCount={qaIssuesList.length}
                searchQuery={searchQuery}
                segmentsCount={segments.length}
                setSearchQuery={setSearchQuery}
                stats={stats}
                sourceLanguage={sourceLanguage}
                onSourceLanguageChange={setSourceLanguage}
                targetLanguage={targetLanguage}
                onTargetLanguageChange={setTargetLanguage}
                fileName={fileName}
                theme={theme}
                canTranslate={userRole === "office"}
              />
            </div>

            <QAPanel
              qaIssuesList={qaIssuesList}
              showQaPanel={showQaPanel}
              theme={theme}
              onGoToSegment={goToSegment}
            />

            <SegmentBoard theme={theme}>
              <Virtuoso
                style={{ height: "100%" }}
                data={filteredSegments}
                itemContent={(index, segment) => (
                  <SegmentCard
                    key={segment.id}
                    darkMode={darkMode}
                    index={index}
                    segment={segment}
                    theme={theme}
                    onCopy={copyToClipboard}
                    onUpdateTranslation={updateTranslation}
                    onToggleVerify={() => toggleVerify(segment.id)}
                    onVerifyAndNext={() => verifyAndNextSegment(segment.id)}
                  />
                )}
              />
            </SegmentBoard>
          </main>
        )}
      </div>
    </div>
  );
}
