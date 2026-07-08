import { useEffect, useMemo, useState, useRef, useCallback } from "react";
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
  updateSegment,
  fetchRequestStatus,
  requestAccess,
  fetchAccessRequests,
  respondToAccessRequest,
  translateSegmentWithContext,
  auditDocument,
  getAuditEstimate,
  startAudit,
  cancelAudit,
  getAuditStatus,
  updateDocumentLanguages,
  toggleTrackChanges,
  acceptTrackedChange,
  rejectTrackedChange,
  acceptAllTrackedChanges
} from "./services/api.js";
import { ExportModal } from "./components/ExportModal.jsx";
import { ShareModal } from "./components/ShareModal.jsx";
import { io } from "socket.io-client";
import { applyGlossaryTerms } from "./utils/glossary.js";
import { getTheme } from "./utils/theme.js";
import { Globe } from "lucide-react";

export default function App() {
  const virtuosoRef = useRef(null);
  
  // Zustand Session Store hook
  const { isAuth, fetchProfile, token, logout, user, loading } = useUserStore();
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const [segments, setSegments] = useState([]);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [fileId, setFileId] = useState(null);
  const [fileExtension, setFileExtension] = useState(".html");
  const [currentProvider, setCurrentProvider] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("hi");
  const [darkMode, setDarkMode] = useState(true);
  const [editorFontSize, setEditorFontSize] = useState("medium");
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true);
  const [autoPropagateEnabled, setAutoPropagateEnabled] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState(null);
  const [showQaPanel, setShowQaPanel] = useState(false);
  const [fileName, setFileName] = useState("document");
  const [isUploading, setIsUploading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);

  const [collaborators, setCollaborators] = useState([]);
  const [cellLocks, setCellLocks] = useState(new Map());
  const [showShareModal, setShowShareModal] = useState(false);
  const [documentId, setDocumentId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("doc") || null;
  });
  const [permission, setPermission] = useState("write");
  const [ownerId, setOwnerId] = useState(null);
  const [trackChangesEnabled, setTrackChangesEnabled] = useState(false);
  const [hasNoAccess, setHasNoAccess] = useState(false);
  const [hasPendingAccessRequest, setHasPendingAccessRequest] = useState(false);
  const [accessRequestMessage, setAccessRequestMessage] = useState("");
  const [pendingAccessRequests, setPendingAccessRequests] = useState([]);

  const [showEstimateModal, setShowEstimateModal] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateData, setEstimateData] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [translationQueuePosition, setTranslationQueuePosition] = useState(0);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.remove("light-mode");
    } else {
      document.documentElement.classList.add("light-mode");
    }
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.classList.remove(
      "font-very-small",
      "font-small",
      "font-medium",
      "font-large",
      "font-very-large"
    );
    document.documentElement.classList.add(`font-${editorFontSize.replace(" ", "-")}`);
  }, [editorFontSize]);

  useEffect(() => {
    if (isAuth) {
      fetchProfile();
    }
  }, [isAuth]);

  // Poll background audit job status if a job is active
  useEffect(() => {
    if (!activeJob || ["completed", "failed", "cancelled"].includes(activeJob.status)) return;

    const interval = setInterval(async () => {
      try {
        const job = await getAuditStatus(documentId, activeJob.id);
        setActiveJob(job);
        
        if (job.status === "completed") {
          setIsAuditing(false);
          showToast("Quality Control Audit Completed!", "success");
        } else if (job.status === "failed") {
          setIsAuditing(false);
          showToast(`Audit failed: ${job.error_message || "Unknown error"}`, "error");
        } else if (job.status === "cancelled") {
          setIsAuditing(false);
          showToast("Audit cancelled.", "info");
        }
      } catch (e) {
        console.error("Failed to fetch job status", e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJob, documentId]);

  // Load collaborative document from DB on startup/change
  const loadCollaborativeDocument = useCallback(async () => {
    if (!documentId || !token) return;
    setIsUploading(true);
    setHasNoAccess(false);
    setAccessRequestMessage("");
    try {
      const doc = await fetchDocument(documentId);
      setSegments(doc.segments);
      setFileName(doc.name);
      setFileId(doc.fileId);
      setSourceLanguage(doc.sourceLang === "pt" ? "pt-BR" : doc.sourceLang);
      setTargetLanguage(doc.targetLang === "pt" ? "pt-BR" : doc.targetLang);
      setPermission(doc.permission || "write");
      setOwnerId(doc.ownerId);
      setTrackChangesEnabled(doc.trackChangesEnabled || false);
      showToast(`Loaded collaborative document: ${doc.name}`);

      // Fetch pending requests if the user is owner or staff
      const isOwnerOrStaff = doc.ownerId === userRef.current?.id || ["admin", "verbolabs_staff"].includes(userRef.current?.role);
      if (isOwnerOrStaff) {
        try {
          const reqs = await fetchAccessRequests(documentId);
          setPendingAccessRequests(reqs);
        } catch (reqErr) {
          console.error("Failed to load access requests:", reqErr);
        }
      }
    } catch (err) {
      console.error("Failed to load document:", err);
      setSegments([]);
      setPermission("read"); // set to read-only temporarily
      
      const isAccessDenied = err.response?.status === 403;
      if (isAccessDenied) {
        setHasNoAccess(true);
        // Check if there is already a pending request
        try {
          const status = await fetchRequestStatus(documentId);
          setHasPendingAccessRequest(status.hasPendingRequest);
        } catch (statusErr) {
          console.error(statusErr);
        }
      } else {
        showToast(err.response?.data?.error || "Access denied or document not found.", "error");
        // Clear document ID from URL if load fails completely (like 404)
        const newUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.pushState({ path: newUrl }, '', newUrl);
        setDocumentId(null);
      }
    } finally {
      setIsUploading(false);
    }
  }, [documentId, token]);

  useEffect(() => {
    if (isAuth && token) {
      loadCollaborativeDocument();
    }
  }, [documentId, isAuth, token, loadCollaborativeDocument]);

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

    socket.on("translation-queue-update", ({ position }) => {
      setTranslationQueuePosition(position);
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

    socket.on("segment-updated", ({ segmentIndex, targetText, status, contextJira, contextDescription, mqmAccuracyScore, mqmReport, originalTargetText, trackedBy }) => {
      setSegments((prev) =>
        prev.map((seg, idx) => {
          if (idx === segmentIndex) {
            const updatedSeg = { ...seg };
            if (targetText !== undefined) {
              updatedSeg.target = targetText;
              updatedSeg.status = status;
              updatedSeg.verified = status === "approved";
            }
            if (contextJira !== undefined) updatedSeg.contextJira = contextJira;
            if (contextDescription !== undefined) updatedSeg.contextDescription = contextDescription;
            if (mqmAccuracyScore !== undefined) updatedSeg.mqmAccuracyScore = mqmAccuracyScore;
            if (mqmReport !== undefined) updatedSeg.mqmReport = mqmReport;
            if (originalTargetText !== undefined) updatedSeg.originalTargetText = originalTargetText;
            if (trackedBy !== undefined) updatedSeg.trackedBy = trackedBy;
            return updatedSeg;
          }
          return seg;
        })
      );
    });

    socket.on("track-changes-toggled", ({ enabled }) => {
      setTrackChangesEnabled(enabled);
      showToast(`Track Changes was toggled ${enabled ? "ON" : "OFF"} by the creator.`, "info");
    });

    socket.on("typing-update", ({ segmentIndex, targetText, originalTargetText, trackedBy }) => {
      setSegments((prev) => {
        const sourceSeg = prev[segmentIndex];
        if (!sourceSeg) return prev;

        const cleanString = (str) => {
          if (!str) return "";
          return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        };

        const propagateTranslation = (targetA, sourceB) => {
          if (!targetA) return "";
          const tagsInSourceB = sourceB.match(/<[^>]+>/g) || [];
          let tagIdx = 0;
          let propagated = targetA.replace(/<[^>]+>/g, () => {
            if (tagIdx < tagsInSourceB.length) {
              return tagsInSourceB[tagIdx++];
            }
            return "";
          });
          while (tagIdx < tagsInSourceB.length) {
            propagated += tagsInSourceB[tagIdx++];
          }
          return propagated;
        };

        const cleanedSource = cleanString(sourceSeg.source);

        return prev.map((seg, idx) => {
          if (idx === segmentIndex) {
            const updated = { ...seg, target: targetText };
            if (originalTargetText !== undefined) updated.originalTargetText = originalTargetText;
            if (trackedBy !== undefined) updated.trackedBy = trackedBy;
            return updated;
          }
          if (autoPropagateEnabled && cleanedSource && cleanString(seg.source) === cleanedSource) {
            const updated = { ...seg, target: propagateTranslation(targetText, seg.source) };
            if (originalTargetText !== undefined) {
              if (originalTargetText === null) {
                updated.originalTargetText = null;
              } else if (!seg.originalTargetText) {
                updated.originalTargetText = seg.target || "";
              }
            }
            if (trackedBy !== undefined) updated.trackedBy = trackedBy;
            return updated;
          }
          return seg;
        });
      });
    });

    socket.on("all-changes-accepted", () => {
      setSegments((prev) =>
        prev.map((seg) => ({ ...seg, originalTargetText: null, trackedBy: null }))
      );
      showToast("All changes accepted by the creator.", "info");
    });

    socket.on("access-request-received", (data) => {
      if (document.hidden) {
        if (Notification.permission === "granted") {
          new Notification("Access Request Received", {
            body: `${data.userName} (${data.userEmail}) is requesting Edit Access to ${data.docName}.`
          });
        }
      }
      setPendingAccessRequests((prev) => {
        if (prev.some((r) => r.id === data.id)) return prev;
        return [...prev, {
          id: data.id,
          document_id: data.documentId,
          user_id: data.userId,
          profiles: { email: data.userEmail }
        }];
      });
    });

    socket.on("access-request-responded", ({ documentId: docId, action, userId }) => {
      if (userId === userRef.current?.id && docId === documentId) {
        showToast(`Your edit access request has been ${action === "approve" ? "approved" : "declined"}.`);
        if (action === "approve") {
          setPermission("write");
          setHasNoAccess(false);
          setHasPendingAccessRequest(false);
          loadCollaborativeDocument();
        }
      }
    });

    socket.on("access-request-processed", ({ requestId }) => {
      setPendingAccessRequests((prev) => prev.filter((r) => r.id !== requestId));
    });

    socket.on("access-revoked", ({ userId, documentId: docId }) => {
      if (userId === userRef.current?.id && docId === documentId) {
        showToast("Your access to this workspace has been revoked.");
        setPermission("read");
        setHasNoAccess(true);
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      }
    });



    socket.on("document-audit-completed", ({ documentId: docId }) => {
      if (docId === documentId) {
        setIsAuditing(false);
        showToast("Quality Control Audit Completed!", "success");
      }
    });

    socket.on("error", (err) => {
      showToast(err.message || "Collaboration error.", "error");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [documentId, token, loadCollaborativeDocument]);

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

  const handleRequestEditAccess = async () => {
    try {
      await requestAccess(documentId);
      setHasPendingAccessRequest(true);
      setAccessRequestMessage("Access request submitted successfully!");
      showToast("Access request submitted successfully!");
    } catch (err) {
      console.error("Failed to request access:", err);
      showToast(`Failed to request access: ${err.response?.data?.error || err.message}`, "error");
    }
  };

  const handleRespondToAccessRequest = async (requestId, action) => {
    try {
      await respondToAccessRequest(documentId, requestId, action);
      setPendingAccessRequests(prev => prev.filter(r => r.id !== requestId));
      showToast(`Access request ${action === "approve" ? "approved" : "declined"}.`);
    } catch (err) {
      console.error("Failed to respond to access request:", err);
      showToast(`Failed to respond to request: ${err.response?.data?.error || err.message}`, "error");
    }
  };

  const handleTeleport = (segmentIndex) => {
    const elements = document.querySelectorAll(".seg-row");
    if (elements && elements[segmentIndex]) {
      elements[segmentIndex].scrollIntoView({ behavior: "smooth", block: "center" });
      elements[segmentIndex].classList.add("teleport-highlight");
      setTimeout(() => {
        elements[segmentIndex].classList.remove("teleport-highlight");
      }, 2000);
    }
  };

  // Request notification permission on mount
  useEffect(() => {
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }, []);

  // Intercept hashes in URL redirect (Supabase password recovery / registration)
  useEffect(() => {
    const hash = window.location.hash;
    const path = window.location.pathname;

    if (hash && hash.includes("access_token=") && (hash.includes("type=recovery") || hash.includes("type=signup"))) {
      const params = new URLSearchParams(hash.replace("#", "?"));
      const accessToken = params.get("access_token");
      
      if (accessToken) {
        localStorage.setItem("centroid_token", accessToken);
        const refreshToken = params.get("refresh_token");
        if (refreshToken) {
          localStorage.setItem("centroid_refresh_token", refreshToken);
        }
        const expiresIn = params.get("expires_in");
        if (expiresIn) {
          localStorage.setItem("centroid_expires_at", String(Date.now() + parseInt(expiresIn, 10) * 1000));
        }

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
    // Purely numbers and punctuation (Unicode-aware)
    if (/^\P{L}*$/u.test(clean)) return true;
    // Raw CSS like @page { ... }
    if (/^\s*@(?:page|media|import|font-face)\s*\{/i.test(clean)) return true;
    if (/(?:margin|padding|position|text-align)\s*:\s*[^;]+;/i.test(clean) && clean.includes("{") && clean.includes("}")) return true;
    // Specific hardcoded junk
    const lower = clean.toLowerCase();
    if (lower === "waiting for translation") return true;
    return false;
  };

  const filteredSegments = useMemo(
    () => {
      const cleanString = (str) => {
        if (!str) return "";
        return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      };

      const sourceCounts = {};
      if (filterStatus === "duplicate") {
        segments.forEach((seg) => {
          if (seg.isMerged || isJunkSegment(seg.source)) return;
          const cleaned = cleanString(seg.source);
          if (cleaned) {
            sourceCounts[cleaned] = (sourceCounts[cleaned] || 0) + 1;
          }
        });
      }

      const filtered = segments.filter(
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
          } else if (filterStatus === "duplicate") {
            const cleaned = cleanString(segment.source);
            return cleaned && sourceCounts[cleaned] > 1;
          }
          return true;
        }
      );

      if (filterStatus === "duplicate") {
        const firstOccurrence = {};
        segments.forEach((seg, idx) => {
          const cleaned = cleanString(seg.source);
          if (cleaned && firstOccurrence[cleaned] === undefined) {
            firstOccurrence[cleaned] = idx;
          }
        });

        filtered.sort((a, b) => {
          const cleanA = cleanString(a.source);
          const cleanB = cleanString(b.source);
          const firstA = firstOccurrence[cleanA] ?? 0;
          const firstB = firstOccurrence[cleanB] ?? 0;
          if (firstA !== firstB) {
            return firstA - firstB;
          }
          return a.id - b.id;
        });
      }

      return filtered;
    },
    [searchQuery, filterStatus, segments]
  );

  const filteredSegmentsRef = useRef([]);
  filteredSegmentsRef.current = filteredSegments;

  const qaIssuesList = useMemo(
    () =>
      segments.flatMap((segment) => {
        const list = [];
        
        
        
        // MQM issues
        let mqm = segment.mqmReport;
        if (typeof mqm === "string") {
          try {
            mqm = JSON.parse(mqm);
          } catch (e) {
            mqm = null;
          }
        }
        
        if (mqm && mqm.errors) {
          mqm.errors.forEach((err) => {
            list.push({
              id: segment.id,
              type: "mqm",
              category: err.category,
              severity: err.severity || "Minor",
              snippet: err.snippet,
              correction: err.correction,
              explanation: err.explanation,
              issue: `${err.category} (${err.severity || "Minor"}): ${err.explanation}`,
              source: segment.source,
              target: segment.target
            });
          });
        }
        
        return list;
      }),
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
      console.error(error);
      const errMsg = error.response?.data?.error || error.message || "Is the backend running?";
      showToast(`Upload failed: ${errMsg}`, "error");
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

    const segmentsToTranslate = segments.filter((s) => {
      if (isJunkSegment(s.source)) return false;
      const cleanTarget = (s.target || "").replace(/<\/?\d+>/g, "").trim();
      if (cleanTarget === "") return true;

      // If target is identical to source, and we are translating to a different language, it's a failed fallback
      const cleanSource = s.source.replace(/<\/?\d+>/g, "").trim();
      const hasLetters = /\p{L}/u.test(cleanSource);
      const isListPointer = /^\(?[a-zA-Z0-9]+\)?\.?$/i.test(cleanSource) || /^\d+(\.\d+)*$/i.test(cleanSource);
      const isUrl = /https?:\/\/[^\s]+/i.test(cleanSource);

      if (
        targetLanguage !== sourceLanguage &&
        cleanSource.toLowerCase() === cleanTarget.toLowerCase() &&
        hasLetters &&
        !isListPointer &&
        !isUrl
      ) {
        return true;
      }
      return false;
    });

    if (segmentsToTranslate.length === 0) {
      setIsTranslating(false);
      showToast("Everything is already translated!");
      return;
    }

    try {
      const BATCH_SIZE = 25;
      let completedCount = 0;

      for (let i = 0; i < segmentsToTranslate.length; i += BATCH_SIZE) {
        const batch = segmentsToTranslate.slice(i, i + BATCH_SIZE);
        const data = await translateBatch(batch, targetLanguage, sourceLanguage, { ...contextSettings, glossary: translationGlossary }, documentId);
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
                fuzzyScore: item.fuzzyScore || null,
                mqmAccuracyScore: item.mqmAccuracyScore !== undefined ? item.mqmAccuracyScore : 100,
                mqmReport: item.mqmReport || null
              };
            }
          });
          return newSegments;
        });

        completedCount += batch.length;
        setProgress(Math.round((completedCount / segmentsToTranslate.length) * 100));
      }

      // ── Post-translation completeness check ──
      // Scan for any segments that are still untranslated and retry them
      setProgress(99);
      let stillUntranslatedCount = 0;
      const stillUntranslated = [];
      setSegments((prev) => {
        prev.forEach((seg) => {
          if (isJunkSegment(seg.source)) return;
          const cleanTarget = (seg.target || "").replace(/<\/?\d+>/g, "").trim();
          const cleanSource = seg.source.replace(/<\/?\d+>/g, "").trim();
          const hasLetters = /\p{L}/u.test(cleanSource);
          const isListPointer = /^\(?[a-zA-Z0-9]+\)?\\.?$/i.test(cleanSource) || /^\d+(\.\d+)*$/i.test(cleanSource);
          const isUrl = /https?:\/\/[^\s]+/i.test(cleanSource);
          const isAbbrev = /^[A-Z0-9][A-Z0-9.\-\/\s]*$/.test(cleanSource) && cleanSource.length <= 40;
          const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanSource);
          const isPhone = /^[+]?[\d\s\-().]+$/.test(cleanSource) && cleanSource.replace(/\D/g, "").length >= 7;
          const isRomanPointer = /^\(?[ivxlcdm]+\)\.?$/i.test(cleanSource);

          if (
            targetLanguage !== sourceLanguage &&
            hasLetters &&
            !isListPointer &&
            !isUrl &&
            !isAbbrev &&
            !isEmail &&
            !isPhone &&
            !isRomanPointer &&
            (cleanTarget === "" || cleanSource.toLowerCase() === cleanTarget.toLowerCase())
          ) {
            stillUntranslated.push(seg);
          }
        });
        return prev;
      });

      stillUntranslatedCount = stillUntranslated.length;

      if (stillUntranslatedCount > 0) {
        console.log(`[Post-Translation Check] ${stillUntranslatedCount} segments still untranslated. Retrying...`);
        const RETRY_BATCH = 5;
        for (let ri = 0; ri < stillUntranslated.length; ri += RETRY_BATCH) {
          const retryBatch = stillUntranslated.slice(ri, ri + RETRY_BATCH);
          try {
            const retryData = await translateBatch(retryBatch, targetLanguage, sourceLanguage, { ...contextSettings, glossary: translationGlossary }, documentId);
            const retryResults = retryData.results || [];
            setSegments((previous) => {
              const newSegments = [...previous];
              retryResults.forEach((item) => {
                const index = newSegments.findIndex((s) => s.id === item.id);
                if (index !== -1 && item.translated) {
                  newSegments[index] = {
                    ...newSegments[index],
                    target: applyGlossaryTerms(
                      newSegments[index].source,
                      item.translated,
                      translationGlossary
                    ),
                    provider: item.provider,
                    mqmAccuracyScore: item.mqmAccuracyScore !== undefined ? item.mqmAccuracyScore : 100,
                    mqmReport: item.mqmReport || null
                  };
                }
              });
              return newSegments;
            });
          } catch (retryErr) {
            console.warn(`[Post-Translation Retry] Batch retry failed:`, retryErr.message);
          }
        }
      }

      setIsTranslating(false);
      if (stillUntranslatedCount > 0) {
        showToast(`Translation completed! ${stillUntranslatedCount} segments were retried for completeness.`);
      } else {
        showToast("Translation completed!");
      }
    } catch (error) {
      console.error("Translation error:", error);
      setIsTranslating(false);
      showToast(`Translation failed: ${error.message || error}`, "error");
    }
  };

  const handleSourceLanguageChange = async (lang) => {
    setSourceLanguage(lang);
    if (documentId) {
      try {
        await updateDocumentLanguages(documentId, lang, targetLanguage);
        showToast(`Document source language updated to ${lang}`);
      } catch (err) {
        console.error("Failed to sync source language to DB:", err);
      }
    }
  };

  const handleTargetLanguageChange = async (lang) => {
    setTargetLanguage(lang);
    if (documentId) {
      try {
        await updateDocumentLanguages(documentId, sourceLanguage, lang);
        showToast(`Document target language updated to ${lang}`);
      } catch (err) {
        console.error("Failed to sync target language to DB:", err);
      }
    }
  };

  const handleRunQc = async () => {
    if (!documentId) return;
    setIsEstimating(true);
    setShowEstimateModal(true);
    setEstimateData(null);
    try {
      const data = await getAuditEstimate(documentId, { ...contextSettings, glossary: translationGlossary });
      setEstimateData(data);
    } catch (err) {
      console.error("Failed to fetch pre-flight audit estimate:", err);
      showToast("Failed to fetch pre-flight estimate.", "error");
      setShowEstimateModal(false);
    } finally {
      setIsEstimating(false);
    }
  };

  const handleConfirmStartAudit = async () => {
    if (!documentId) return;
    setIsAuditing(true);
    setShowEstimateModal(false);
    showToast("Starting background Quality Control Audit...", "info");
    try {
      const result = await startAudit(documentId, { ...contextSettings, glossary: translationGlossary });
      if (result.success && result.jobId) {
        const job = await getAuditStatus(documentId, result.jobId);
        setActiveJob(job);
      }
    } catch (err) {
      console.error("Failed to start document audit:", err);
      showToast(`Audit failed to start: ${err.response?.data?.error || err.message || err}`, "error");
      setIsAuditing(false);
    }
  };

  const handleCancelAudit = async () => {
    if (!documentId || !activeJob) return;
    showToast("Cancelling audit...", "info");
    try {
      await cancelAudit(documentId, activeJob.id);
      setIsAuditing(false);
      setActiveJob(null);
    } catch (err) {
      console.error("Failed to cancel audit:", err);
      showToast("Failed to cancel audit.", "error");
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

  const handleToggleTrackChanges = async () => {
    if (!documentId) return;
    const nextVal = !trackChangesEnabled;
    try {
      await toggleTrackChanges(documentId, nextVal);
      setTrackChangesEnabled(nextVal);
      showToast(`Track Changes ${nextVal ? "enabled" : "disabled"}.`);
    } catch (err) {
      console.error("Failed to toggle Track Changes:", err);
      showToast(err.response?.data?.error || "Failed to toggle Track Changes.", "error");
    }
  };

  const handleAcceptChange = async (id) => {
    if (!documentId) return;
    const segmentIndex = segments.findIndex((s) => s.id === id);
    if (segmentIndex === -1) return;
    try {
      await acceptTrackedChange(documentId, segmentIndex);
      const cleanString = (str) => {
        if (!str) return "";
        return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      };
      const cleanedSource = cleanString(segments[segmentIndex].source);
      setSegments((prev) =>
        prev.map((seg) => {
          if (seg.id === id || (cleanedSource && cleanString(seg.source) === cleanedSource)) {
            return { ...seg, originalTargetText: null, trackedBy: null };
          }
          return seg;
        })
      );
      showToast("Change accepted.");
    } catch (err) {
      console.error("Failed to accept tracked change:", err);
      showToast(err.response?.data?.error || "Failed to accept change.", "error");
    }
  };

  const handleRejectChange = async (id) => {
    if (!documentId) return;
    const segmentIndex = segments.findIndex((s) => s.id === id);
    if (segmentIndex === -1) return;
    try {
      const seg = segments[segmentIndex];
      await rejectTrackedChange(documentId, segmentIndex);
      const cleanString = (str) => {
        if (!str) return "";
        return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      };
      const cleanedSource = cleanString(seg.source);
      setSegments((prev) =>
        prev.map((s) => {
          if (s.id === id || (cleanedSource && cleanString(s.source) === cleanedSource)) {
            const hasOrig = s.originalTargetText !== null && s.originalTargetText !== undefined;
            return {
              ...s,
              target: hasOrig ? s.originalTargetText : s.target,
              originalTargetText: null,
              trackedBy: null
            };
          }
          return s;
        })
      );
      showToast("Change rejected and reverted.");
    } catch (err) {
      console.error("Failed to reject tracked change:", err);
      showToast(err.response?.data?.error || "Failed to reject change.", "error");
    }
  };

  const handleAcceptAllChanges = async () => {
    if (!documentId) return;
    try {
      await acceptAllTrackedChanges(documentId);
      setSegments((prev) =>
        prev.map((seg) => ({ ...seg, originalTargetText: null, trackedBy: null }))
      );
      showToast("All changes accepted successfully.");
    } catch (err) {
      console.error("Failed to accept all changes:", err);
      showToast(err.response?.data?.error || "Failed to accept all changes.", "error");
    }
  };

  const handleSegmentTyping = (id, value) => {
    let sourceText = "";
    let isTrackInit = false;
    let trackOrig = null;

    const targetSeg = segments.find((s) => s.id === id);
    const isOwnerLocal = ownerId === user?.id;

    let originalTargetTextToSend = undefined;
    let trackedByToSend = undefined;

    if (targetSeg && trackChangesEnabled && !isOwnerLocal) {
      const orig = targetSeg.originalTargetText !== null && targetSeg.originalTargetText !== undefined
        ? targetSeg.originalTargetText
        : (targetSeg.target || "");
      
      if (value === orig) {
        originalTargetTextToSend = null;
        trackedByToSend = null;
      } else {
        originalTargetTextToSend = orig;
        trackedByToSend = user?.email;
      }
    }

    setSegments((previous) => {
      const targetSegLocal = previous.find((s) => s.id === id);
      if (targetSegLocal) {
        sourceText = targetSegLocal.source;
        if (trackChangesEnabled && !isOwnerLocal && !targetSegLocal.originalTargetText) {
          isTrackInit = true;
          trackOrig = targetSegLocal.target || "";
        }
      }

      const cleanString = (str) => {
        if (!str) return "";
        return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      };

      const propagateTranslation = (targetA, sourceB) => {
        if (!targetA) return "";
        const tagsInSourceB = sourceB.match(/<[^>]+>/g) || [];
        let tagIdx = 0;
        let propagated = targetA.replace(/<[^>]+>/g, () => {
          if (tagIdx < tagsInSourceB.length) {
            return tagsInSourceB[tagIdx++];
          }
          return "";
        });
        while (tagIdx < tagsInSourceB.length) {
          propagated += tagsInSourceB[tagIdx++];
        }
        return propagated;
      };

      const cleanedSource = cleanString(sourceText);

      return previous.map((segment) => {
        let updated = { ...segment };
        if (segment.id === id) {
          updated.target = value;
          if (trackChangesEnabled && !isOwnerLocal) {
            const orig = segment.originalTargetText !== null && segment.originalTargetText !== undefined
              ? segment.originalTargetText
              : (isTrackInit ? trackOrig : null);
            if (orig !== null) {
              if (value === orig) {
                updated.originalTargetText = null;
                updated.trackedBy = null;
              } else {
                updated.originalTargetText = orig;
                updated.trackedBy = user?.email;
              }
            }
          }
        } else if (autoPropagateEnabled && cleanedSource && cleanString(segment.source) === cleanedSource) {
          const propagatedVal = propagateTranslation(value, segment.source);
          updated.target = propagatedVal;
          if (trackChangesEnabled && !isOwnerLocal) {
            const orig = segment.originalTargetText !== null && segment.originalTargetText !== undefined
              ? segment.originalTargetText
              : (isTrackInit ? segment.target || "" : null);
            if (orig !== null) {
              if (propagatedVal === orig) {
                updated.originalTargetText = null;
                updated.trackedBy = null;
              } else {
                updated.originalTargetText = orig;
                updated.trackedBy = user?.email;
              }
            }
          }
        }
        return updated;
      });
    });

    if (socketRef.current) {
      socketRef.current.emit("typing-update", {
        segmentIndex: id - 1,
        targetText: value,
        originalTargetText: originalTargetTextToSend,
        trackedBy: trackedByToSend
      });
    }
  };

  const updateTranslation = async (id, value) => {
    let sourceText = "";
    setSegments((previous) => {
      const targetSeg = previous.find((s) => s.id === id);
      if (targetSeg) {
        sourceText = targetSeg.source;
      }

      const cleanString = (str) => {
        if (!str) return "";
        return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      };

      const propagateTranslation = (targetA, sourceB) => {
        if (!targetA) return "";
        const tagsInSourceB = sourceB.match(/<[^>]+>/g) || [];
        let tagIdx = 0;
        let propagated = targetA.replace(/<[^>]+>/g, () => {
          if (tagIdx < tagsInSourceB.length) {
            return tagsInSourceB[tagIdx++];
          }
          return "";
        });
        while (tagIdx < tagsInSourceB.length) {
          propagated += tagsInSourceB[tagIdx++];
        }
        return propagated;
      };

      const cleanedSource = cleanString(sourceText);

      return previous.map((segment) => {
        if (segment.id === id) {
          return { ...segment, target: value, verified: false };
        }
        if (autoPropagateEnabled && cleanedSource && cleanString(segment.source) === cleanedSource) {
          return { ...segment, target: propagateTranslation(value, segment.source), verified: false };
        }
        return segment;
      });
    });

    if (documentId) {
      const segmentIndex = segments.findIndex((s) => s.id === id);
      if (segmentIndex !== -1) {
        try {
          await updateSegment(documentId, segmentIndex, value, "draft", undefined, undefined, autoPropagateEnabled);
        } catch (err) {
          console.error("Failed to update segment in database:", err);
          showToast(`Failed to save translation to database: ${err.message || err}`, "error");
        }
      }
    }
  };

  const toggleVerify = async (id) => {
    let nextVerified = false;
    let sourceText = "";
    setSegments((previous) => {
      const targetSeg = previous.find((s) => s.id === id);
      if (targetSeg) {
        sourceText = targetSeg.source;
        nextVerified = !targetSeg.verified;
      }
      
      const cleanString = (str) => {
        if (!str) return "";
        return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      };

      const cleanedSource = cleanString(sourceText);

      return previous.map((segment) => {
        if (segment.id === id || (autoPropagateEnabled && cleanedSource && cleanString(segment.source) === cleanedSource)) {
          return { ...segment, verified: nextVerified };
        }
        return segment;
      });
    });

    if (documentId) {
      const segmentIndex = segments.findIndex((s) => s.id === id);
      if (segmentIndex !== -1) {
        try {
          const targetText = segments[segmentIndex].target;
          await updateSegment(documentId, segmentIndex, targetText, nextVerified ? "approved" : "draft", undefined, undefined, autoPropagateEnabled);
        } catch (err) {
          console.error("Failed to update verification in database:", err);
          showToast(`Failed to save verification state: ${err.message || err}`, "error");
        }
      }
    }
  };

  const verifyAndNextSegment = async (id) => {
    let sourceText = "";
    setSegments((previous) => {
      const targetSeg = previous.find((s) => s.id === id);
      if (targetSeg) {
        sourceText = targetSeg.source;
      }

      const cleanString = (str) => {
        if (!str) return "";
        return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      };

      const cleanedSource = cleanString(sourceText);

      return previous.map((segment) =>
        (segment.id === id || (autoPropagateEnabled && cleanedSource && cleanString(segment.source) === cleanedSource))
          ? { ...segment, verified: true }
          : segment
      );
    });

    if (documentId) {
      const segmentIndex = segments.findIndex((s) => s.id === id);
      if (segmentIndex !== -1) {
        try {
          const targetText = segments[segmentIndex].target;
          await updateSegment(documentId, segmentIndex, targetText, "approved", undefined, undefined, autoPropagateEnabled);
        } catch (err) {
          console.error("Failed to verify in database:", err);
          showToast(`Failed to save verification state: ${err.message || err}`, "error");
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

  const saveSegmentContext = async (id, contextData) => {
    const segmentIndex = segments.findIndex((s) => s.id === id);
    if (segmentIndex === -1) return;

    setSegments((previous) =>
      previous.map((segment) =>
        segment.id === id
          ? { ...segment, contextJira: contextData.contextJira, contextDescription: contextData.contextDescription }
          : segment
      )
    );

    if (documentId) {
      try {
        await updateSegment(
          documentId,
          segmentIndex,
          undefined,
          undefined,
          contextData.contextJira,
          contextData.contextDescription
        );
        showToast("Context saved successfully!");
      } catch (err) {
        console.error("Failed to save segment context to database:", err);
        showToast(`Failed to save segment context: ${err.message || err}`, "error");
      }
    }
  };

  const handleTranslateSegmentWithContext = async (id, { contextJira, contextDescription, screenshot }) => {
    const segmentIndex = segments.findIndex((s) => s.id === id);
    if (segmentIndex === -1) return;

    try {
      showToast("Translating segment with smart context...");
      const result = await translateSegmentWithContext(documentId, segmentIndex, {
        contextJira,
        contextDescription,
        screenshot,
        contextSettings: { ...contextSettings, glossary: translationGlossary },
        sourceLang: sourceLanguage,
        targetLang: targetLanguage
      });

      if (result.success) {
        setSegments((previous) =>
          previous.map((segment) =>
            segment.id === id
              ? {
                  ...segment,
                  target: result.translated,
                  contextJira,
                  contextDescription,
                  status: "translated",
                  verified: false,
                  qaIssues: result.qaIssues || [],
                  mqmAccuracyScore: result.mqmAccuracyScore !== undefined ? result.mqmAccuracyScore : 100,
                  mqmReport: result.mqmReport || null
                }
              : segment
          )
        );
        showToast("Segment re-translated successfully!");
      }
    } catch (err) {
      console.error("Failed to translate segment with context:", err);
      const errMsg = err.response?.data?.error || err.message || "Verify your context/screenshot.";
      showToast(`Translation failed: ${errMsg}`, "error");
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
      setSourceLanguage((project.sourceLanguage || "en") === "pt" ? "pt-BR" : (project.sourceLanguage || "en"));
      setTargetLanguage((project.targetLanguage || "hi") === "pt" ? "pt-BR" : (project.targetLanguage || "hi"));
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
      showToast(`Export failed: ${error.message}`, "error");
    }
  };

  const handleExportSourceDocument = async () => {
    try {
      const blob = await exportFile(fileId, segments, fileExtension, sourceLanguage, targetLanguage, fileName, true);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${fileName}_source${fileExtension}`);
      document.body.appendChild(link);
      link.click();
      showToast("Source document exported successfully!");
    } catch (error) {
      console.log(error);
      showToast(`Export failed: ${error.message}`, "error");
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
      showToast(`XLIFF export failed: ${error.message}`, "error");
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
      showToast(`TMX export failed: ${error.message}`, "error");
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
      showToast(`Global TM export failed: ${error.message}`, "error");
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
      showToast(`Review table export failed: ${error.message}`, "error");
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
      showToast(`XLIFF import failed: ${error.response?.data?.error || error.message}`, "error");
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
      showToast(`TMX import failed: ${error.response?.data?.error || error.message}`, "error");
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
    // Close QA Panel
    setShowQaPanel(false);

    // Clear filters to ensure the target segment is visible
    setSearchQuery("");
    setFilterStatus("all");

    // Wait for the render cycle to update filteredSegmentsRef.current
    const startTime = Date.now();
    const pollInterval = window.setInterval(() => {
      const currentList = filteredSegmentsRef.current || [];
      const index = currentList.findIndex((s) => s.id === id);

      if (index !== -1 && virtuosoRef.current) {
        window.clearInterval(pollInterval);

        // Jump instantly to the correct index in the updated list
        virtuosoRef.current.scrollToIndex({
          index,
          align: "center",
          behavior: "auto"
        });

        // Poll the DOM until Virtuoso has rendered the items at the new scroll offset
        const startDomTime = Date.now();
        const domInterval = window.setInterval(() => {
          const element = document.getElementById(`segment-${id}`);
          const editor = document.getElementById(`target-${id}`);

          if (element && editor) {
            window.clearInterval(domInterval);

            // Apply highlight
            element.classList.add("ring-4", "ring-indigo-500", "scale-[1.01]", "transition-all", "duration-300");
            window.setTimeout(() => {
              element.classList.remove("ring-4", "ring-indigo-500", "scale-[1.01]");
            }, 2000);

            // Focus
            editor.focus();

            // Set cursor to the end
            try {
              const range = document.createRange();
              const sel = window.getSelection();
              range.selectNodeContents(editor);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            } catch (e) {
              console.error("Failed to position cursor at end:", e);
            }
          } else if (Date.now() - startDomTime > 1500) {
            window.clearInterval(domInterval);
          }
        }, 30);
      } else if (Date.now() - startTime > 1500) {
        window.clearInterval(pollInterval);
      }
    }, 30);
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

  if (hasNoAccess) {
    return (
      <div className={`h-screen w-screen flex flex-col items-center justify-center bg-[#08090e] text-white p-6`}>
        <Toast toast={toast} />
        <div className="max-w-md w-full bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-2xl p-8 text-center space-y-6 shadow-2xl animate-[fadeIn_0.2s_ease]">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto text-[var(--text-rose)] shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Private Workspace</h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              You do not have permission to access this document workspace. Please request access from the owner or administrator to participate.
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={handleRequestEditAccess}
              disabled={hasPendingAccessRequest}
              className={`w-full rounded-xl py-3 text-xs font-bold transition-all border cursor-pointer shadow-md ${
                hasPendingAccessRequest
                  ? "bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed"
                  : "bg-[var(--accent)] border-[var(--accent)] hover:bg-[var(--accent-hover)] text-white"
              }`}
            >
              {hasPendingAccessRequest ? "Access Request Pending" : "Request Access"}
            </button>
          </div>
          {accessRequestMessage && (
            <div className="text-[11px] text-[var(--text-emerald)] bg-[var(--emerald-glow)] border border-[var(--emerald-glow)] rounded-xl p-2.5 font-bold">
              {accessRequestMessage}
            </div>
          )}
        </div>
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
        onExportSourceDocument={handleExportSourceDocument}
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
        editorFontSize={editorFontSize}
        autocompleteEnabled={autocompleteEnabled}
        autoPropagateEnabled={autoPropagateEnabled}
        onApplySettings={({ darkMode, editorFontSize, autocompleteEnabled, autoPropagateEnabled }) => {
          setDarkMode(darkMode);
          setEditorFontSize(editorFontSize);
          setAutocompleteEnabled(autocompleteEnabled);
          setAutoPropagateEnabled(autoPropagateEnabled);
        }}
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
        onSourceLanguageChange={handleSourceLanguageChange}
        targetLanguage={targetLanguage}
        onTargetLanguageChange={handleTargetLanguageChange}
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
        onOpenShare={ownerId && (ownerId === user?.id || ["admin", "verbolabs_staff"].includes(user?.role)) ? () => setShowShareModal(true) : null}
        onTeleport={handleTeleport}
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
            onRelinkHtml={permission === "write" ? handleRelinkHtml : null}
            onImportXliff={permission === "write" ? handleImportXliff : null}
            onTranslate={permission === "write" ? handleTranslateSegments : null}
            onToggleQa={() => setShowQaPanel((value) => !value)}
            onRunQc={permission === "write" ? handleRunQc : null}
            isTranslating={isTranslating}
            isAuditing={isAuditing}
            qaIssuesCount={qaIssuesList.length}
            segmentsCount={segments.length}
            searchQuery={searchQuery}
            fileExtension={fileExtension}
            setSearchQuery={setSearchQuery}
            stats={stats}
            sourceLanguage={sourceLanguage}
            onSourceLanguageChange={handleSourceLanguageChange}
            targetLanguage={targetLanguage}
            onTargetLanguageChange={handleTargetLanguageChange}
            fileName={fileName}
            theme={theme}
            canTranslate={permission === "write" && user ? (user.hasTranslateAccess && user.status === "active") : false}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            onUpload={handleUpload}
            onOpenContext={() => setShowContextPanel(true)}
            trackChangesEnabled={trackChangesEnabled}
            onToggleTrackChanges={handleToggleTrackChanges}
            isOwner={ownerId === user?.id}
            onAcceptAllChanges={handleAcceptAllChanges}
            hasTrackedChanges={segments.some(s => s.originalTargetText && s.originalTargetText !== s.target)}
          />

          {/* QA panel (collapsible modal) */}
          <QAPanel
            qaIssuesList={qaIssuesList}
            segments={segments}
            showQaPanel={showQaPanel}
            theme={theme}
            onGoToSegment={goToSegment}
            onClose={() => setShowQaPanel(false)}
          />

          {/* Zone 3: Segment editor */}
          <div className="segment-table">

            {permission === "read" && (
              <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl px-4 py-3 text-xs font-bold mb-3 shadow-lg mx-1 select-none">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 flex-shrink-0">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>Read-Only Mode: You are viewing this workspace in read-only mode.</span>
                </div>
                <button
                  onClick={handleRequestEditAccess}
                  disabled={hasPendingAccessRequest}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider border cursor-pointer transition-all shadow-md ${
                    hasPendingAccessRequest
                      ? "bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed"
                      : "bg-amber-500 text-slate-950 border-amber-400 hover:bg-amber-400"
                  }`}
                >
                  {hasPendingAccessRequest ? "Request Pending" : "Request Edit Access"}
                </button>
              </div>
            )}

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
                    {translationQueuePosition > 0 ? `Queued (Position #${translationQueuePosition})` : "Translating"}
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
              style={{ flex: 1 }}
              data={filteredSegments}
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
                  lockInfo={
                    cellLocks.has(segment.id - 1) && cellLocks.get(segment.id - 1).userId !== user?.id
                      ? cellLocks.get(segment.id - 1)
                      : null
                  }
                  onFocusSegment={handleFocusSegment}
                  onBlurSegment={handleBlurSegment}
                  readOnly={permission === "read"}
                  onSaveContext={saveSegmentContext}
                  onTranslateWithContext={handleTranslateSegmentWithContext}
                  onTyping={handleSegmentTyping}
                  isOwner={ownerId === user?.id}
                  onAcceptChange={handleAcceptChange}
                  onRejectChange={handleRejectChange}
                  autocompleteEnabled={autocompleteEnabled}
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
        theme={theme}
      />

      {/* Access Requests Dialog Overlay */}
      {pendingAccessRequests.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[200] w-96 bg-[var(--bg-surface)] border border-[var(--border-medium)] rounded-2xl shadow-2xl p-5 space-y-4 animate-[slideUp_0.2s_ease] select-none text-left">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-[var(--accent)]" />
              <h4 className="text-sm font-bold text-[var(--text-primary)]">Access Request</h4>
            </div>
            <span className="text-[9px] bg-[var(--accent-glow)] text-[var(--text-accent)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 font-bold uppercase tracking-wider">
              Pending
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            <strong>{pendingAccessRequests[0].profiles?.email.split("@")[0]}</strong> ({pendingAccessRequests[0].profiles?.email}) is requesting <strong>Edit Access</strong> to this document workspace.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => handleRespondToAccessRequest(pendingAccessRequests[0].id, "reject")}
              className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent transition-all cursor-pointer"
            >
              Decline
            </button>
            <button
              onClick={() => handleRespondToAccessRequest(pendingAccessRequests[0].id, "approve")}
              className="rounded-xl px-4 py-2 text-xs font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white border border-[var(--accent)] transition-all cursor-pointer shadow-md"
            >
              Grant Edit Access
            </button>
          </div>
        </div>
      )}

      {/* ── Pre-flight Estimate Modal ── */}
      {showEstimateModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: 20
        }}>
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-medium)",
            borderRadius: 16, width: "100%", maxWidth: 450,
            padding: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
            display: "flex", flexDirection: "column", gap: 16,
            textAlign: "left"
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0 }}>
              QC Audit Pre-Flight Check
            </h3>
            
            {isEstimating || !estimateData ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "20px 0" }}>
                <div className="animate-spin" style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "var(--accent)" }} />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Calculating estimate...</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                  We will perform a deterministically scored MQM analysis using <strong>gpt-4o-mini</strong> with strict schemas, sliding window context, and self-check verification passes to eliminate noise.
                </p>
                
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
                  background: "rgba(0,0,0,0.15)", border: "1px solid var(--border-subtle)",
                  borderRadius: 10, padding: 12
                }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Total Segments</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{estimateData.segmentCount}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Total Words</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{estimateData.totalWordCount}</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setShowEstimateModal(false)}
                    style={{
                      height: 36, padding: "0 16px", borderRadius: 8,
                      background: "transparent", border: "1px solid var(--border-medium)",
                      color: "var(--text-secondary)", fontSize: 12, fontWeight: 700,
                      cursor: "pointer", transition: "all 0.2s"
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmStartAudit}
                    style={{
                      height: 36, padding: "0 16px", borderRadius: 8,
                      background: "var(--accent)", border: "1px solid var(--accent)",
                      color: "#fff", fontSize: 12, fontWeight: 700,
                      cursor: "pointer", transition: "all 0.2s",
                      boxShadow: "0 4px 12px var(--accent-glow)"
                    }}
                  >
                    Confirm & Start Audit
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Active Background Audit Progress Bar Overlay ── */}
      {activeJob && ["pending", "in_progress"].includes(activeJob.status) && (
        <div style={{
          position: "fixed", bottom: 24, left: 24, zIndex: 199,
          background: "var(--bg-surface)", border: "1px solid var(--border-medium)",
          borderRadius: 14, padding: "14px 18px", width: 340,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", gap: 8,
          textAlign: "left", transition: "all 0.3s ease"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>
              {activeJob.status === "pending" && activeJob.queuePosition > 0
                ? `QC Audit Queued (Pos #${activeJob.queuePosition})`
                : "QC Audit in Progress..."}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)" }}>
              {activeJob.completed_segments}/{activeJob.total_segments}
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              width: `${(activeJob.completed_segments / (activeJob.total_segments || 1)) * 100}%`,
              height: "100%", background: "var(--accent)", borderRadius: 3,
              transition: "width 0.4s ease"
            }} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <span style={{ fontSize: 10, color: "var(--text-rose)", fontWeight: 600 }}>
              {activeJob.failed_segments > 0 ? `${activeJob.failed_segments} failed` : ""}
            </span>
            <button
              type="button"
              onClick={handleCancelAudit}
              style={{
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
                color: "#f87171", fontSize: 9.5, fontWeight: 700,
                borderRadius: 6, padding: "3px 8px", cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              Cancel Audit
            </button>
          </div>
        </div>
      )}

      {/* ── Failed Background Audit Alert ── */}
      {activeJob && activeJob.status === "failed" && (
        <div style={{
          position: "fixed", bottom: 24, left: 24, zIndex: 199,
          background: "var(--bg-surface)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 14, padding: "14px 18px", width: 340,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", gap: 10,
          textAlign: "left", transition: "all 0.3s ease",
          backdropFilter: "blur(8px)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: "#f87171" }}>
              QC Audit Failed
            </span>
            <button 
              onClick={() => setActiveJob(null)}
              style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: 14, fontWeight: "bold" }}
            >
              ×
            </button>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
            {activeJob.error_message || "An unexpected error occurred during execution."}
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => {
                setActiveJob(null);
                handleRunQc();
              }}
              style={{
                background: "rgba(255,255,255,0.08)", border: "1px solid var(--border-medium)",
                color: "#fff", fontSize: 9.5, fontWeight: 700,
                borderRadius: 6, padding: "4px 10px", cursor: "pointer"
              }}
            >
              Retry Audit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
