import { useEffect, useMemo, useState, useRef } from "react";
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
import { SearchReplaceModal } from "./components/SearchReplaceModal.jsx";
import { LANGUAGES } from "./constants/languages.js";
import { useGlossaryManager } from "./hooks/useGlossaryManager.js";
import {
  exportFile,
  translateBatch,
  uploadFile,
  importXliff,
  importTmx,
  exportGlobalTm
} from "./services/api.js";
import { ExportModal } from "./components/ExportModal.jsx";
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
  const [locked, setLocked] = useState(true);
  const [userRole, setUserRole] = useState(null);
  
  const [showSearchReplace, setShowSearchReplace] = useState(false);
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
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
    const stripTags = (text) => (text || "").replace(/<\/?\d+>/g, "");
    
    const sourceText = segments.map((segment) => stripTags(segment.source)).join(" ");
    const targetText = segments.map((segment) => stripTags(segment.target)).join(" ");
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
        (segment) =>
          !segment.isMerged &&
          !isJunkSegment(segment.source) &&
          (segment.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (segment.target || "")
            .toLowerCase()
            .includes(searchQuery.toLowerCase()))
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
      
      const isHtmlUpload = file.name.endsWith(".html") || file.name.endsWith(".htm");
      const isCurrentXlf = fileExtension === ".xlf" || fileExtension === ".xliff" || fileExtension === ".sdlxliff";
      const isAutoRelink = segments.length > 0 && isCurrentXlf && isHtmlUpload;
      
      if (isAutoRelink) {
        showToast(`Auto-relinking HTML template...`);
      }

      const data = await uploadFile(file);
      
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
      setFileId(data.fileId || null);
      
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
      
      showToast("Project loaded!");
    } catch (error) {
      showToast("Invalid project file", "error");
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

      // Header cell shading & borders
      const headerShading = { fill: "0F172A" }; // Deep Slate
      const headerBorder = { style: BorderStyle.SINGLE, size: 8, color: "1E293B" };
      const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };

      // Helper function to create styled Paragraphs inside cells
      const createTextParagraph = (text, options = {}) => {
        return new Paragraph({
          spacing: { before: 100, after: 100, line: 240 },
          children: [
            new TextRun({
              text: text || "",
              font: "Segoe UI",
              size: options.size || 21, // 10.5 pt
              bold: !!options.bold,
              italic: !!options.italic,
              color: options.color || "334155" // Slate
            })
          ],
          alignment: options.alignment || AlignmentType.LEFT
        });
      };

      // 1. Build Bilingual Rows
      const bilingualRows = [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: headerShading,
              borders: { top: headerBorder, bottom: headerBorder, left: headerBorder, right: headerBorder },
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
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: headerShading,
              borders: { top: headerBorder, bottom: headerBorder, left: headerBorder, right: headerBorder },
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

      // Add segment rows
      segments.forEach((seg, idx) => {
        const isEven = idx % 2 === 0;
        const rowBg = isEven ? "FFFFFF" : "F8FAFC"; // Alternating white/gray shading
        
        bilingualRows.push(
          new TableRow({
            children: [
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                shading: { fill: rowBg },
                borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
                children: [
                  createTextParagraph(seg.source)
                ]
              }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                shading: { fill: rowBg },
                borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
                children: [
                  createTextParagraph(seg.target || seg.translation || "")
                ]
              })
            ]
          })
        );
      });

      const bilingualTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: bilingualRows
      });

      // 2. Build feedback form rows
      const feedbackFields = [
        { label: "Content Type", description: "Select: [ ] Marketing | [ ] Technical | [ ] Legal | [ ] General | [ ] Medical | [ ] Other" },
        { label: "Accuracy", description: "Rating: [ ] Excellent | [ ] Good | [ ] Fair | [ ] Poor\nComments/Errors found:" },
        { label: "Stylistic Fluency", description: "Rating: [ ] Excellent | [ ] Good | [ ] Fair | [ ] Poor\nComments on naturalness/flow:" },
        { label: "Consistency", description: "Rating: [ ] Excellent | [ ] Good | [ ] Fair | [ ] Poor\nComments on terminology consistency:" },
        { label: "Tone and Cultural Appropriateness", description: "Rating: [ ] Excellent | [ ] Good | [ ] Fair | [ ] Poor\nComments on tone suitability:" },
        { label: "Spelling", description: "Rating: [ ] Excellent | [ ] Good | [ ] Fair | [ ] Poor\nComments on orthography/spelling:" },
        { label: "Sentence Formation and Punctuation", description: "Rating: [ ] Excellent | [ ] Good | [ ] Fair | [ ] Poor\nComments on grammar and punctuation syntax:" },
        { label: "Quality Level", description: "Overall Grade: [ ] Excellent | [ ] Good | [ ] Fair | [ ] Poor" },
        { label: "Rating (out of 10)", description: "Score: ______ / 10" },
        { label: "Overall Comment", description: "General summary of the quality evaluation:" },
        { label: "Additional Comments", description: "Any other details or notes from the evaluation:" },
        { label: "Qualitative Comment", description: "Describe the strengths and primary weaknesses of this MT output:" },
        { label: "Suggestion or Improvement", description: "Specific ideas/rules to improve future translations:" }
      ];

      const feedbackRows = [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              shading: { fill: "E2E8F0" },
              borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
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
              width: { size: 70, type: WidthType.PERCENTAGE },
              shading: { fill: "E2E8F0" },
              borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
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
                width: { size: 30, type: WidthType.PERCENTAGE },
                shading: { fill: "F1F5F9" },
                borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
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
                width: { size: 70, type: WidthType.PERCENTAGE },
                shading: { fill: "FFFFFF" },
                borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
                children: field.description.split("\n").map((line) => new Paragraph({
                  spacing: { before: 80, after: 80 },
                  children: [
                    new TextRun({ text: line, font: "Segoe UI", size: 20, color: "475569" })
                  ]
                }))
              })
            ]
          })
        );
      });

      const feedbackTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: feedbackRows
      });

      // 3. Document Metadata Table (Top of Document)
      const metadataTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 25, type: WidthType.PERCENTAGE },
                shading: { fill: "F8FAFC" },
                borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
                children: [new Paragraph({ children: [new TextRun({ text: "Document Name", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
              }),
              new TableCell({
                width: { size: 75, type: WidthType.PERCENTAGE },
                borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
                children: [new Paragraph({ children: [new TextRun({ text: fileName || "Unnamed", font: "Segoe UI", size: 18, color: "1E293B" })] })]
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: "F8FAFC" },
                borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
                children: [new Paragraph({ children: [new TextRun({ text: "Language Pair", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
              }),
              new TableCell({
                borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
                children: [new Paragraph({ children: [new TextRun({ text: `${sourceLanguage.toUpperCase()} → ${targetLanguage.toUpperCase()}`, font: "Segoe UI", size: 18, color: "1E293B" })] })]
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: "F8FAFC" },
                borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
                children: [new Paragraph({ children: [new TextRun({ text: "Evaluation Date", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
              }),
              new TableCell({
                borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
                children: [new Paragraph({ children: [new TextRun({ text: new Date().toLocaleDateString(), font: "Segoe UI", size: 18, color: "1E293B" })] })]
              })
            ]
          }),
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: "F8FAFC" },
                borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
                children: [new Paragraph({ children: [new TextRun({ text: "Linguist Name", bold: true, font: "Segoe UI", size: 18, color: "475569" })] })]
              }),
              new TableCell({
                borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
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
            properties: {},
            children: [
              // Main title with elegant pink/blue styling
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
                onExport={() => setShowExportModal(true)}
                onLoadProject={loadProject}
                onOpenGlossary={() => setShowGlossary(true)}
                onOpenContext={() => setShowContextPanel(true)}
                onSaveProject={saveProject}
                onRelinkHtml={handleRelinkHtml}
                onImportXliff={handleImportXliff}
                onTranslate={handleTranslateSegments}
                onToggleQa={() => setShowQaPanel((value) => !value)}
                onCopyAllSource={copyAllSourceToTarget}
                isTranslating={isTranslating}
                qaIssuesCount={qaIssuesList.length}
                searchQuery={searchQuery}
                segmentsCount={segments.length}
                fileExtension={fileExtension}
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
                ref={virtuosoRef}
                style={{ height: "100%" }}
                data={filteredSegments}
                components={{ Footer: () => <div className="h-32" /> }}
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
