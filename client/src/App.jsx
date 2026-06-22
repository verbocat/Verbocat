import { useEffect, useMemo, useState, useRef } from "react";
import { Virtuoso } from "react-virtuoso";
import { Header } from "./components/Header.jsx";
import { LoginScreen } from "./components/LoginScreen.jsx";
import { AdminDashboard } from "./components/AdminDashboard.jsx";
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
import { SearchReplaceModal } from "./components/SearchReplaceModal.jsx";
import { SettingsModal } from "./components/SettingsModal.jsx";
import { LANGUAGES } from "./constants/languages.js";
import { useGlossaryManager } from "./hooks/useGlossaryManager.js";
import { useUserStore } from "./services/userStore.js";
import {
  exportFile,
  translateBatch,
  uploadFile,
  importXliff,
  importTmx,
  exportGlobalTm,
  fetchDocument,
  updateSegment
} from "./services/api.js";
import { ExportModal } from "./components/ExportModal.jsx";
import { ShareModal } from "./components/ShareModal.jsx";
import { io } from "socket.io-client";
import { applyGlossaryTerms } from "./utils/glossary.js";
import { getTheme } from "./utils/theme.js";

export default function App() {
  const virtuosoRef = useRef(null);
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

  // Zustand Session Store hook
  const { isAuth, fetchProfile, token, logout, user, loading } = useUserStore();
  const [resetMode, setResetMode] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);

  const [collaborators, setCollaborators] = useState([]);
  const [cellLocks, setCellLocks] = useState(new Map());
  const [showShareModal, setShowShareModal] = useState(false);
  const [documentId, setDocumentId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("doc") || null;
  });

  // Sync profile details on start if session token is cached
  useEffect(() => {
    if (isAuth) {
      fetchProfile();
    }
  }, [isAuth]);

  // Load collaborative document from DB on startup/change
  useEffect(() => {
    const loadCollaborativeDocument = async () => {
      if (!documentId || !token) return;
      setIsUploading(true);
      try {
        const doc = await fetchDocument(documentId);
        setSegments(doc.segments);
        setFileName(doc.name);
        setFileId(doc.fileId);
        setSourceLanguage(doc.sourceLang);
        setTargetLanguage(doc.targetLang);
        showToast(`Loaded collaborative document: ${doc.name}`);
      } catch (err) {
        console.error("Failed to load document:", err);
        showToast(err.response?.data?.error || "Access denied or document not found.");
        // Clear document ID from URL if load fails
        const newUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.pushState({ path: newUrl }, '', newUrl);
        setDocumentId(null);
      } finally {
        setIsUploading(false);
      }
    };

    if (isAuth && token) {
      loadCollaborativeDocument();
    }
  }, [documentId, isAuth, token]);

  const socketRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    if (!documentId || !token) return;

    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const socket = io(socketUrl, {
      auth: { token }
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to collaborative workspace socket");
      socket.emit("join-document", { documentId });
    });

    socket.on("room-state", ({ users, locks }) => {
      setCollaborators(users.filter(u => u.socketId !== socket.id));
      setCellLocks(new Map(locks));
    });

    socket.on("presence-update", (users) => {
      setCollaborators(users.filter(u => u.socketId !== socket.id));
    });

    socket.on("lock-update", (locks) => {
      setCellLocks(new Map(locks));
    });

    socket.on("segment-updated", ({ segmentIndex, targetText, status }) => {
      setSegments((prev) =>
        prev.map((seg, idx) => {
          if (idx === segmentIndex) {
            return { ...seg, target: targetText, status, verified: status === "approved" };
          }
          return seg;
        })
      );
    });

    socket.on("error", (err) => {
      showToast(err.message || "Collaboration error.");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [documentId, token]);

  const handleFocusSegment = (index) => {
    if (socketRef.current) {
      socketRef.current.emit("acquire-lock", { segmentIndex: index });
    }
  };

  const handleBlurSegment = (index) => {
    if (socketRef.current) {
      socketRef.current.emit("release-lock", { segmentIndex: index });
    }
  };

  // Intercept hashes in URL redirect (Supabase password recovery / registration)
  useEffect(() => {
    const hash = window.location.hash;
    const path = window.location.pathname;

    if (hash && hash.includes("access_token=") && (hash.includes("type=recovery") || hash.includes("type=signup"))) {
      const params = new URLSearchParams(hash.replace("#", "?"));
      const accessToken = params.get("access_token");
      
      if (accessToken) {
        localStorage.setItem("verbocat_token", accessToken);
        if (hash.includes("type=recovery")) {
          setResetMode(true);
        } else {
          fetchProfile(); // signup confirmation redirect
        }
      }
      window.location.hash = "";
    }
    
    const cleanPath = path.replace(/\/$/, "");
    if (
      cleanPath === "/reset-password" ||
      cleanPath === "/reset_password" ||
      cleanPath === "/client/reset-password" ||
      cleanPath === "/client/reset_password"
    ) {
      setResetMode(true);
    }
  }, []);

  const [showSearchReplace, setShowSearchReplace] = useState(false);
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
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
    const cleanString = (str) => {
      if (!str) return "";
      return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    };

    let words = 0;
    let uniqueWords = 0;
    let duplicateWords = 0;
    const seenSourceTexts = new Set();

    segments.forEach((seg) => {
      const cleanedSource = cleanString(seg.source);
      if (!cleanedSource) return;

      const wordList = cleanedSource.split(" ").filter((w) => w.length > 0);
      const segmentWordCount = wordList.length;

      words += segmentWordCount;

      if (seenSourceTexts.has(cleanedSource)) {
        duplicateWords += segmentWordCount;
      } else {
        seenSourceTexts.add(cleanedSource);
        uniqueWords += segmentWordCount;
      }
    });

    const targetText = segments.map((segment) => cleanString(segment.target || segment.translation)).join(" ");
    const countWords = (text) =>
      text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

    return {
      segments: segments.length,
      words,
      uniqueWords,
      duplicateWords,
      characters: segments.map((seg) => cleanString(seg.source)).join(" ").length,
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

  const isJunkSegment = (text) => {
    if (!text) return true;
    const clean = text.replace(/__TAG_\d+__/g, "").replace(/<[^>]+>/g, "").trim();
    // Purely numbers and punctuation
    if (/^[^a-zA-Z]*$/.test(clean)) return true;
    // Raw CSS like @page { ... }
    if (/^\s*@(?:page|media|import|font-face)\s*\{/i.test(clean)) return true;
    if (/(?:margin|padding|position|text-align)\s*:\s*[^;]+;/i.test(clean) && clean.includes("{") && clean.includes("}")) return true;
    // Specific hardcoded junk
    const lower = clean.toLowerCase();
    if (lower === "waiting for translation") return true;
    return false;
  };

  const filteredSegments = useMemo(
    () =>
      segments.filter(
        (segment) => {
          if (segment.isMerged || isJunkSegment(segment.source)) return false;
          
          const matchesSearch = segment.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (segment.target || "").toLowerCase().includes(searchQuery.toLowerCase());
            
          if (!matchesSearch) return false;
          
          if (filterStatus === "translated") {
            return !!segment.target;
          } else if (filterStatus === "untranslated") {
            return !segment.target;
          } else if (filterStatus === "verified") {
            return !!segment.verified;
          }
          return true;
        }
      ),
    [searchQuery, filterStatus, segments]
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
      
      const isHtmlUpload = file.name.endsWith(".html") || file.name.endsWith(".htm");
      const isCurrentXlf = fileExtension === ".xlf" || fileExtension === ".xliff" || fileExtension === ".sdlxliff";
      const isAutoRelink = segments.length > 0 && isCurrentXlf && isHtmlUpload;
      
      if (isAutoRelink) {
        showToast(`Auto-relinking HTML template...`);
      }

      const data = await uploadFile(file, sourceLanguage, targetLanguage);
      
      const extractTagsOnly = (str) => {
        return (str.match(/<\/?\d+>/g) || []).join(" ");
      };
      
      const cleanText = (text) => {
        let decoded = (text || "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&apos;/g, "'")
          .replace(/&nbsp;/g, " ");

        return decoded
          .replace(/<[^>]+>/g, "") // Strip ALL HTML tags including <mrk>, <g>, <1>
          .replace(/__TAG_\d+__/g, "") 
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      };
      
      // Build source map from current segments
      const sourceMap = new Map();
      segments.forEach(seg => {
        const key = cleanText(seg.source);
        if (key && seg.target && seg.target.trim() !== "") {
          if (!sourceMap.has(key)) {
            sourceMap.set(key, seg.target);
          }
        }
      });

      let mappedCount = 0;
      const mappedTargets = new Array(data.segments.length).fill(null);
      const isVerifiedArr = new Array(data.segments.length).fill(false);
      const isMergedArr = new Array(data.segments.length).fill(false);
      
      for (let i = 0; i < data.segments.length; i++) {
        if (mappedTargets[i] !== null) continue;
        
        let currentKey = cleanText(data.segments[i].source);
        
        if (sourceMap.has(currentKey)) {
          mappedTargets[i] = sourceMap.get(currentKey);
          isVerifiedArr[i] = false;
          mappedCount++;
          continue;
        }
        
        // Advanced mapping: Try concatenating up to 5 adjacent segments to handle Trados merged segments
        let combinedKey = currentKey;
        let foundMatch = false;
        
        for (let j = 1; j <= 5 && i + j < data.segments.length; j++) {
          combinedKey += " " + cleanText(data.segments[i + j].source);
          if (sourceMap.has(combinedKey)) {
            mappedTargets[i] = sourceMap.get(combinedKey);
            isVerifiedArr[i] = false;
            
            // Set the merged adjacent segments to their tags or zero-width space to prevent fallback to english
            for (let k = 1; k <= j; k++) {
              let tags = extractTagsOnly(data.segments[i + k].source);
              if (tags === "") tags = "\u200B"; // zero-width space
              mappedTargets[i + k] = tags;
              isVerifiedArr[i + k] = false;
              isMergedArr[i + k] = true;
            }
            
            mappedCount += (j + 1);
            foundMatch = true;
            break;
          }
        }
        
        if (!foundMatch) {
          mappedTargets[i] = data.segments[i].target || extractTagsOnly(data.segments[i].source);
          isVerifiedArr[i] = false;
        }
      }
      
      const newSegments = data.segments.map((newSeg, i) => {
        return {
          ...newSeg,
          target: mappedTargets[i],
          verified: isVerifiedArr[i],
          isMerged: isMergedArr[i]
        };
      });

      setSegments(newSegments);
      setHistory([]);
      setFuture([]);
      const docId = data.documentId || data.fileId;
      setFileId(data.fileId || null);
      setDocumentId(docId);

      if (docId) {
        const newUrl = `${window.location.origin}${window.location.pathname}?doc=${docId}`;
        window.history.pushState({ path: newUrl }, '', newUrl);
      }
      
      if (isAutoRelink) {
        setFileExtension(".html");
        setFileName(data.originalName || file.name.replace(/\.[^/.]+$/, ""));
        showToast(`Auto-Relinked successfully! Mapped ${mappedCount} segments.`);
      } else {
        setFileExtension(`.${data.type}` || ".html");
        setFileName(data.originalName || file.name.replace(/\.[^/.]+$/, ""));
        setCurrentProvider("");
        setShowQaPanel(false);
        showToast(`File uploaded: ${file.name}`);
      }
    } catch (error) {
      console.log(error);
      showToast("Upload failed. Is the backend running?", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRelinkHtml = async (event) => {
    handleFileProcessing(event.target.files[0]);
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
        const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
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
        } else if (event.key === "h") {
          event.preventDefault();
          setShowSearchReplace(true);
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
      (s) => !isJunkSegment(s.source) && (!s.target || s.target.replace(/<\/?\d+>/g, "").trim() === "")
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

  const updateTranslation = async (id, value) => {
    setSegments((previous) =>
      previous.map((segment) =>
        segment.id === id ? { ...segment, target: value, verified: false } : segment
      )
    );

    if (documentId) {
      const segmentIndex = segments.findIndex((s) => s.id === id);
      if (segmentIndex !== -1) {
        try {
          await updateSegment(documentId, segmentIndex, value, "draft");
        } catch (err) {
          console.error("Failed to update segment in database:", err);
          showToast("Failed to save translation to database.");
        }
      }
    }
  };

  const toggleVerify = async (id) => {
    let nextVerified = false;
    setSegments((previous) =>
      previous.map((segment) => {
        if (segment.id === id) {
          nextVerified = !segment.verified;
          return { ...segment, verified: nextVerified };
        }
        return segment;
      })
    );

    if (documentId) {
      const segmentIndex = segments.findIndex((s) => s.id === id);
      if (segmentIndex !== -1) {
        try {
          const targetText = segments[segmentIndex].target;
          await updateSegment(documentId, segmentIndex, targetText, nextVerified ? "approved" : "draft");
        } catch (err) {
          console.error("Failed to update verification in database:", err);
          showToast("Failed to save verification state.");
        }
      }
    }
  };

  const verifyAndNextSegment = async (id) => {
    setSegments((previous) =>
      previous.map((segment) =>
        segment.id === id ? { ...segment, verified: true } : segment
      )
    );

    if (documentId) {
      const segmentIndex = segments.findIndex((s) => s.id === id);
      if (segmentIndex !== -1) {
        try {
          const targetText = segments[segmentIndex].target;
          await updateSegment(documentId, segmentIndex, targetText, "approved");
        } catch (err) {
          console.error("Failed to verify in database:", err);
          showToast("Failed to save verification state.");
        }
      }
    }

    // Move focus to next segment
    const currentIndex = filteredSegments.findIndex((s) => s.id === id);
    if (currentIndex !== -1) {
      let nextIndex = currentIndex + 1;
      
      while (nextIndex < filteredSegments.length) {
        if (!filteredSegments[nextIndex].verified) {
          const nextId = filteredSegments[nextIndex].id;
          
          setTimeout(() => {
            if (virtuosoRef.current) {
              virtuosoRef.current.scrollToIndex({ index: nextIndex, align: 'center', behavior: 'smooth' });
            }
            setTimeout(() => {
              const nextElement = document.getElementById(`segment-${nextId}`);
              if (nextElement) {
                nextElement.classList.add("ring-2", "ring-teal-500");
                setTimeout(() => nextElement.classList.remove("ring-2", "ring-teal-500"), 1000);
              }
              const nextTa = document.getElementById(`target-${nextId}`);
              if (nextTa) nextTa.focus();
            }, 300);
          }, 50);
          break;
        }
        nextIndex++;
      }
    }
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
    showToast("Session saved!");
  };

  const handleReplaceAll = (findStr, replaceStr) => {
    let replacedCount = 0;
    updateSegmentsWithHistory((previous) =>
      previous.map((segment) => {
        if (!segment.target) return segment;
        // Simple global case-insensitive replace, or exact match if preferred. Let's do exact match or case-insensitive?
        // Let's do exact text replacement but global
        const regex = new RegExp(findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        if (regex.test(segment.target)) {
          replacedCount++;
          return {
            ...segment,
            target: segment.target.replace(regex, replaceStr),
            verified: false
          };
        }
        return segment;
      })
    );
    showToast(`Replaced in ${replacedCount} segments`);
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
      
      showToast("File loaded!");
    } catch (error) {
      showToast("Invalid file format", "error");
    }
  };

  const handleExportDocument = async () => {
    try {
      const blob = await exportFile(fileId, segments, fileExtension, sourceLanguage, targetLanguage, fileName);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${fileName}_${targetLanguage}${fileExtension}`);
      document.body.appendChild(link);
      link.click();
      showToast("Document exported successfully!");
    } catch (error) {
      console.log(error);
      showToast("Export failed", "error");
    }
  };

  const handleExportXliff = async () => {
    try {
      const blob = await exportFile(fileId, segments, ".xlf", sourceLanguage, targetLanguage, fileName);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${fileName}_${targetLanguage}.xlf`);
      document.body.appendChild(link);
      link.click();
      showToast("XLIFF exported successfully!");
    } catch (error) {
      console.log(error);
      showToast("XLIFF export failed", "error");
    }
  };

  const handleExportTmx = async () => {
    try {
      const blob = await exportFile(fileId, segments, ".tmx", sourceLanguage, targetLanguage, fileName);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${fileName}_${targetLanguage}.tmx`);
      document.body.appendChild(link);
      link.click();
      showToast("TMX memory exported successfully!");
    } catch (error) {
      console.log(error);
      showToast("TMX export failed", "error");
    }
  };

  const handleExportGlobalTmx = async () => {
    try {
      const blob = await exportGlobalTm(sourceLanguage, targetLanguage);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `global_tm_${sourceLanguage}_${targetLanguage}.tmx`);
      document.body.appendChild(link);
      link.click();
      showToast("Global database TM exported successfully!");
    } catch (error) {
      console.log(error);
      showToast("Global TM export failed", "error");
    }
  };

  const handleExportLinguistTable = async () => {
    try {
      showToast("Generating Linguist Review Table...");
      const docx = await import("docx");
      const {
        Document,
        Packer,
        Paragraph,
        Table,
        TableRow,
        TableCell,
        WidthType,
        HeadingLevel,
        TextRun,
        AlignmentType,
        BorderStyle
      } = docx;

      // Helper function to strip XML/HTML tags and normalize spaces
      const cleanString = (str) => {
        if (!str) return "";
        return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      };

      // Calculate word counts
      let totalWordCount = 0;
      let uniqueWordCount = 0;
      let duplicateWordCount = 0;
      const seenSourceTexts = new Set();

      segments.forEach((seg) => {
        const cleanedSource = cleanString(seg.source);
        if (!cleanedSource) return;

        const wordList = cleanedSource.split(" ").filter((w) => w.length > 0);
        const segmentWordCount = wordList.length;

        totalWordCount += segmentWordCount;

        if (seenSourceTexts.has(cleanedSource)) {
          duplicateWordCount += segmentWordCount;
        } else {
          seenSourceTexts.add(cleanedSource);
          uniqueWordCount += segmentWordCount;
        }
      });

      // Cell borders
      const cellBorders = {
        top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" }
      };

      // Header borders
      const headerBorders = {
        top: { style: BorderStyle.SINGLE, size: 8, color: "1E293B" },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: "1E293B" },
        left: { style: BorderStyle.SINGLE, size: 8, color: "1E293B" },
        right: { style: BorderStyle.SINGLE, size: 8, color: "1E293B" }
      };

      // Helper function to create styled Paragraphs inside cells
      const createTextParagraph = (text, options = {}) => {
        return new Paragraph({
          spacing: { before: 80, after: 80, line: 240 },
          children: [
            new TextRun({
              text: text || "",
              font: "Segoe UI",
              size: options.size || 20, // 10 pt
              bold: !!options.bold,
              italic: !!options.italic,
              color: options.color || "334155" // Slate-700
            })
          ],
          alignment: options.alignment || AlignmentType.LEFT
        });
      };

      // 1. Build Bilingual Table Rows
      const bilingualRows = [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 2500, type: WidthType.PERCENTAGE }, // 50%
              shading: { fill: "0F172A" },
              borders: headerBorders,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 120, after: 120 },
                  children: [
                    new TextRun({
                      text: `Source Text (${sourceLanguage.toUpperCase()})`,
                      bold: true,
                      color: "FFFFFF",
                      font: "Segoe UI",
                      size: 22
                    })
                  ]
                })
              ]
            }),
            new TableCell({
              width: { size: 2500, type: WidthType.PERCENTAGE }, // 50%
              shading: { fill: "0F172A" },
              borders: headerBorders,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 120, after: 120 },
                  children: [
                    new TextRun({
                      text: `Machine Translation (${targetLanguage.toUpperCase()})`,
                      bold: true,
                      color: "FFFFFF",
                      font: "Segoe UI",
                      size: 22
                    })
                  ]
                })
              ]
            })
          ]
        })
      ];

      // Add cleaned segment rows
      segments.forEach((seg, idx) => {
        const isEven = idx % 2 === 0;
        const rowBg = isEven ? "FFFFFF" : "F8FAFC"; // Alternating white/gray shading
        
        bilingualRows.push(
          new TableRow({
            children: [
              new TableCell({
                width: { size: 2500, type: WidthType.PERCENTAGE },
                shading: { fill: rowBg },
                borders: cellBorders,
                children: [
                  createTextParagraph(cleanString(seg.source))
                ]
              }),
              new TableCell({
                width: { size: 2500, type: WidthType.PERCENTAGE },
                shading: { fill: rowBg },
                borders: cellBorders,
                children: [
                  createTextParagraph(cleanString(seg.target || seg.translation || ""))
                ]
              })
            ]
          })
        );
      });

      const bilingualTable = new Table({
        width: { size: 5000, type: WidthType.PERCENTAGE }, // 100%
        margins: { top: 120, bottom: 120, left: 180, right: 180 },
        rows: bilingualRows
      });

      // 2. Build Feedback Form Rows
      const feedbackFields = [
        { label: "Content Type" },
        { label: "Accuracy" },
        { label: "Stylistic Fluency" },
        { label: "Consistency" },
        { label: "Tone and Cultural Appropriateness" },
        { label: "Spelling" },
        { label: "Sentence Formation and Punctuation" },
        { label: "Quality Level" },
        { label: "Rating (out of 10)" },
        { label: "Overall Comment" },
        { label: "Additional Comments" },
        { label: "Qualitative Comment" },
        { label: "Suggestion or Improvement" },
        { label: "Would you like to work on this type of MT?" }
      ];

      const feedbackRows = [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 1500, type: WidthType.PERCENTAGE }, // 30%
              shading: { fill: "E2E8F0" },
              borders: cellBorders,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 100, after: 100 },
                  children: [
                    new TextRun({ text: "Evaluation Field", bold: true, font: "Segoe UI", size: 20, color: "0F172A" })
                  ]
                })
              ]
            }),
            new TableCell({
              width: { size: 3500, type: WidthType.PERCENTAGE }, // 70%
              shading: { fill: "E2E8F0" },
              borders: cellBorders,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 100, after: 100 },
                  children: [
                    new TextRun({ text: "Linguist Feedback & Scoring", bold: true, font: "Segoe UI", size: 20, color: "0F172A" })
                  ]
                })
              ]
            })
          ]
        })
      ];

      feedbackFields.forEach((field) => {
        feedbackRows.push(
          new TableRow({
            children: [
              new TableCell({
                width: { size: 1500, type: WidthType.PERCENTAGE },
                shading: { fill: "F1F5F9" },
                borders: cellBorders,
                children: [
                  new Paragraph({
                    spacing: { before: 120, after: 120 },
                    children: [
                      new TextRun({ text: field.label, bold: true, font: "Segoe UI", size: 20, color: "1E293B" })
                    ]
                  })
                ]
              }),
              new TableCell({
                width: { size: 3500, type: WidthType.PERCENTAGE },
                shading: { fill: "FFFFFF" },
                borders: cellBorders,
                children: [
                  new Paragraph({
                    spacing: { before: 120, after: 120 },
                    children: [
                      new TextRun({ text: "", font: "Segoe UI", size: 20, color: "475569" })
                    ]
                  })
                ]
              })
            ]
          })
        );
      });

      const feedbackTable = new Table({
        width: { size: 5000, type: WidthType.PERCENTAGE },
        margins: { top: 120, bottom: 120, left: 180, right: 180 },
        rows: feedbackRows
      });

      // 3. Document Metadata Table (Top of Document)
      const metadataTable = new Table({
        width: { size: 5000, type: WidthType.PERCENTAGE },
        margins: { top: 100, bottom: 100, left: 150, right: 150 },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 1500, type: WidthType.PERCENTAGE }, // 30%
                shading: { fill: "F8FAFC" },
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: "Document Name", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
              }),
              new TableCell({
                width: { size: 3500, type: WidthType.PERCENTAGE }, // 70%
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: fileName || "Unnamed", font: "Segoe UI", size: 18, color: "1E293B" })] })]
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: "F8FAFC" },
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: "Language Pair", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: `${sourceLanguage.toUpperCase()} → ${targetLanguage.toUpperCase()}`, font: "Segoe UI", size: 18, color: "1E293B" })] })]
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: "F8FAFC" },
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: "Evaluation Date", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: new Date().toLocaleDateString(), font: "Segoe UI", size: 18, color: "1E293B" })] })]
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: "F8FAFC" },
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: "Total Word Count", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: `${totalWordCount} words`, font: "Segoe UI", size: 18, color: "1E293B" })] })]
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: "F8FAFC" },
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: "Unique Segments Word Count", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: `${uniqueWordCount} words`, font: "Segoe UI", size: 18, color: "1E293B" })] })]
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: "F8FAFC" },
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: "Duplicate Segments Word Count", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: `${duplicateWordCount} words`, font: "Segoe UI", size: 18, color: "1E293B" })] })]
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: "F8FAFC" },
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: "Linguist Name", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: "____________________________________", font: "Segoe UI", size: 18, color: "94A3B8" })] })]
              })
            ]
          })
        ]
      });

      // 4. Create Document structure
      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1440,    // 1 inch
                  bottom: 1440,
                  left: 1440,
                  right: 1440
                }
              }
            },
            children: [
              // Main title with elegant styling
              new Paragraph({
                spacing: { before: 200, after: 100 },
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "Linguist Review & Quality Evaluation Report",
                    bold: true,
                    size: 32, // 16 pt
                    color: "0F172A",
                    font: "Segoe UI"
                  })
                ]
              }),
              new Paragraph({
                spacing: { after: 300 },
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "Review and evaluate translations side-by-side. Please complete the review form at the end.",
                    italic: true,
                    size: 18, // 9 pt
                    color: "64748B",
                    font: "Segoe UI"
                  })
                ]
              }),
              
              // Metadata
              new Paragraph({ text: "Document Information", heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }),
              metadataTable,
              
              // Section spacer
              new Paragraph({ text: "", spacing: { after: 200 } }),

              // Section: Translations
              new Paragraph({
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 },
                children: [
                  new TextRun({
                    text: "Translations Board",
                    bold: true,
                    size: 26,
                    color: "0F172A",
                    font: "Segoe UI"
                  })
                ]
              }),
              bilingualTable,

              // Section spacer
              new Paragraph({ text: "", spacing: { after: 300 } }),

              // Section: Evaluation Feedback Form
              new Paragraph({
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 },
                children: [
                  new TextRun({
                    text: "Linguist Feedback & Review Form",
                    bold: true,
                    size: 28,
                    color: "DB2777", // Pink-600
                    font: "Segoe UI"
                  })
                ]
              }),
              new Paragraph({
                spacing: { after: 200 },
                children: [
                  new TextRun({
                    text: "Complete all sections below to submit your quality evaluation. Your feedback helps fine-tune translation models and processes.",
                    italic: true,
                    size: 18,
                    color: "475569",
                    font: "Segoe UI"
                  })
                ]
              }),
              feedbackTable
            ]
          }
        ]
      });

      // 5. Build and save
      const blob = await Packer.toBlob(doc);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${fileName || "document"}_review_table.docx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showToast("Linguist review table exported successfully!");
    } catch (error) {
      console.error(error);
      showToast("Review table export failed", "error");
    }
  };

  const handleImportXliff = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      showToast("Importing XLIFF...");
      const data = await importXliff(file);
      const cleanText = (text) => {
        return (text || "")
          .replace(/<[^>]+>/g, "") 
          .replace(/__TAG_\d+__/g, "") 
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      };

      if (data.segments && data.segments.length > 0) {
        let mergedCount = 0;
        const newSegments = segments.map((seg) => {
          const match = data.segments.find(
            (xs) => cleanText(xs.source) === cleanText(seg.source)
          );
          if (match && match.target) {
            mergedCount++;
            return {
              ...seg,
              target: match.target,
              verified: true
            };
          }
          return seg;
        });
        setSegments(newSegments);
        showToast(`Successfully imported ${mergedCount} segments from XLIFF!`);
      } else {
        showToast("No translated segments found in XLIFF", "warn");
      }
    } catch (error) {
      console.error(error);
      showToast("XLIFF import failed", "error");
    } finally {
      if (event.target) event.target.value = "";
    }
  };

  const handleImportTmx = async (file) => {
    try {
      showToast("Importing TMX to database...");
      const data = await importTmx(file);
      showToast(`Imported ${data.count} TM pairs to database!`);
    } catch (error) {
      console.error(error);
      showToast("TMX import failed", "error");
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
    showToast("File closed");
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

  // Guard screens for authentication & password resets
  if (resetMode) {
    return (
      <div className={`h-screen w-screen flex items-center justify-center ${theme.bg} overflow-hidden`}>
        <Toast toast={toast} />
        <LoginScreen key="reset" mode="reset" onResetSuccess={() => setResetMode(false)} />
      </div>
    );
  }

  if (isAuth && (!user || loading)) {
    return (
      <div className={`h-screen w-screen flex flex-col items-center justify-center ${theme.bg} overflow-hidden gap-4`}>
        <LoadingOverlay message="Verifying secure session..." />
      </div>
    );
  }

  if (!isAuth) {
    return (
      <div className={`h-screen w-screen flex items-center justify-center ${theme.bg} overflow-hidden`}>
        <Toast toast={toast} />
        <LoginScreen key="login" mode="login" />
      </div>
    );
  }

  return (
    <div className="workspace-shell" style={{ color: "var(--text-primary)" }}>

      {/* ── Global overlays & modals ── */}
      <DragOverlay isDragging={isDragging} />
      <LoadingOverlay isUploading={isUploading} theme={theme} />
      <Toast toast={toast} />

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
        setGlossary={glossaryManager.setGlossary}
        show={showGlossary}
        canApplyGlossary={segments.length > 0}
        theme={theme}
        onImportTmx={handleImportTmx}
      />

      <ExportModal
        show={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExportDocument={handleExportDocument}
        onExportXliff={handleExportXliff}
        onExportTmx={handleExportTmx}
        onExportGlobalTmx={handleExportGlobalTmx}
        onExportLinguistTable={handleExportLinguistTable}
        onRelinkHtml={handleRelinkHtml}
        fileExtension={fileExtension}
        theme={theme}
        sourceLanguage={sourceLanguage}
        targetLanguage={targetLanguage}
      />

      <ContextSettingsModal
        show={showContextPanel}
        onClose={() => setShowContextPanel(false)}
        contextSettings={contextSettings}
        setContextSettings={setContextSettings}
        theme={theme}
      />

      <SearchReplaceModal
        show={showSearchReplace}
        onClose={() => setShowSearchReplace(false)}
        onReplaceAll={handleReplaceAll}
        theme={theme}
      />

      <SettingsModal
        show={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((value) => !value)}
        onLogout={logout}
        userRole={user ? user.role : ""}
        userEmail={user ? user.email : ""}
        theme={theme}
      />

      {showAdminDashboard && (
        <AdminDashboard
          onClose={() => {
            setShowAdminDashboard(false);
            fetchProfile();
          }}
          theme={theme}
        />
      )}

      {/* ── Zone 1: Topbar (always visible) ── */}
      <Header
        currentProvider={currentProvider}
        darkMode={darkMode}
        onOpenGlossary={() => setShowGlossary(true)}
        onLoadProject={loadProject}
        onToggleDarkMode={() => setDarkMode((value) => !value)}
        qaIssuesCount={qaIssuesList.length}
        segmentsCount={segments.length}
        progress={stats.progress}
        theme={theme}
        fileName={fileName}
        fileExtension={fileExtension}
        sourceLanguage={sourceLanguage}
        onSourceLanguageChange={setSourceLanguage}
        targetLanguage={targetLanguage}
        onTargetLanguageChange={setTargetLanguage}
        stats={stats}
        onCloseProject={closeProject}
        onSaveProject={saveProject}
        onRelinkHtml={handleRelinkHtml}
        onImportXliff={handleImportXliff}
        onOpenContext={() => setShowContextPanel(true)}
        userRole={user ? user.role : ""}
        creditsAllowed={user ? user.creditsAllowed : 50000}
        creditsConsumed={user ? user.creditsConsumed : 0}
        onLogout={logout}
        onOpenAdmin={() => setShowAdminDashboard(true)}
        onUpload={handleUpload}
        onOpenSettings={() => setShowSettingsModal(true)}
        collaborators={collaborators}
        onOpenShare={() => setShowShareModal(true)}
      />

      {/* ── Zone 2+3: Action bar + Editor (or empty state) ── */}
      {segments.length === 0 ? (
        <EmptyWorkspace
          darkMode={darkMode}
          onLoadProject={loadProject}
          onOpenGlossary={() => setShowGlossary(true)}
          onUpload={handleUpload}
          theme={theme}
        />
      ) : (
        <>
          {/* Zone 2: Action bar */}
          <WorkspaceToolbar
            onCloseProject={closeProject}
            onExport={() => setShowExportModal(true)}
            onLoadProject={loadProject}
            onSaveProject={saveProject}
            onRelinkHtml={handleRelinkHtml}
            onImportXliff={handleImportXliff}
            onTranslate={handleTranslateSegments}
            onToggleQa={() => setShowQaPanel((value) => !value)}
            isTranslating={isTranslating}
            qaIssuesCount={qaIssuesList.length}
            segmentsCount={segments.length}
            searchQuery={searchQuery}
            fileExtension={fileExtension}
            setSearchQuery={setSearchQuery}
            stats={stats}
            sourceLanguage={sourceLanguage}
            onSourceLanguageChange={setSourceLanguage}
            targetLanguage={targetLanguage}
            onTargetLanguageChange={setTargetLanguage}
            fileName={fileName}
            theme={theme}
            canTranslate={user ? (user.hasTranslateAccess && user.status === "active") : false}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            onUpload={handleUpload}
            onOpenContext={() => setShowContextPanel(true)}
          />

          {/* QA panel (collapsible) */}
          <QAPanel
            qaIssuesList={qaIssuesList}
            showQaPanel={showQaPanel}
            theme={theme}
            onGoToSegment={goToSegment}
          />

          {/* Zone 3: Segment editor */}
          <div className="segment-table">

            {/* Column headers */}
            <div className="seg-header">
              <div className="seg-header-cell">#</div>
              <div className="seg-header-cell">Source</div>
              <div className="seg-header-cell" style={{ justifyContent: "center" }}>→</div>
              <div className="seg-header-cell">Translation</div>
              <div className="seg-header-cell" style={{ borderRight: "none", justifyContent: "center" }}>Act.</div>
            </div>

            {/* Translation progress toast */}
            {isTranslating && (
              <div className="progress-toast">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--sky)" }}>
                    Translating
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "var(--text-primary)" }}>
                    {progress}%
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            <Virtuoso
              ref={virtuosoRef}
              style={{ height: "100%" }}
              data={filteredSegments}
              components={{ Footer: () => <div style={{ height: 80 }} /> }}
              itemContent={(index, segment) => (
                <SegmentCard
                  key={segment.id}
                  darkMode={darkMode}
                  index={index}
                  segment={segment}
                  theme={theme}
                  translationGlossary={translationGlossary}
                  onCopy={copyToClipboard}
                  onUpdateTranslation={updateTranslation}
                  onToggleVerify={() => toggleVerify(segment.id)}
                  onVerifyAndNext={() => verifyAndNextSegment(segment.id)}
                  lockInfo={cellLocks.get(index)}
                  onFocusSegment={handleFocusSegment}
                  onBlurSegment={handleBlurSegment}
                />
              )}
            />
          </div>
        </>
      )}

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        documentId={documentId}
        docName={fileName}
      />
    </div>
  );
}
