import React, { useEffect, useRef, useState, useCallback } from "react";
import { renderAsync } from "docx-preview";
import { fetchDocumentPreview } from "../services/api";
import { isRtlLanguage } from "../constants/languages.js";
import { 
  FileText, Globe, RefreshCw, ZoomIn, ZoomOut, Download, AlertTriangle, X, CheckCircle2,
  Maximize2, Minimize2, Monitor, Tablet, Smartphone
} from "lucide-react";

export const LiveDocumentViewer = ({
  documentId,
  fileName = "Document",
  fileExtension = ".html",
  segments = [],
  targetLang = "hi",
  darkMode = true,
  documentMetadata = null,
  onClose = () => {},
}) => {
  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const viewportRef = useRef(null);

  const [zoom, setZoom] = useState(100);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isSizeLimitError, setIsSizeLimitError] = useState(false);
  const [previewBuffer, setPreviewBuffer] = useState(null);
  const [docType, setDocType] = useState(null); // "html" | "docx" | "pptx" etc.
  const [htmlContent, setHtmlContent] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(new Date());
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [viewportMode, setViewportMode] = useState("desktop"); // "desktop" (100%) | "tablet" (768px) | "mobile" (375px)

  // Derive rendering mode: HTML iframe vs DOCX/binary canvas
  const isWordPress = documentMetadata?.source_type === "wordpress";
  const rawWpUrl = isWordPress 
    ? (documentMetadata.wp_preview_url || `${documentMetadata.wp_site_url || 'http://testing-learning.local'}/?page_id=${documentMetadata.wp_post_id}&preview=true&verbocat_live_preview=1&post_id=${documentMetadata.wp_post_id}`)
    : null;

  // If WordPress URL is a local private domain (.local or localhost) and client is remote, fallback to server snapshot
  const isLocalDomain = rawWpUrl && (rawWpUrl.includes('.local') || rawWpUrl.includes('localhost') || rawWpUrl.includes('127.0.0.1'));
  const isClientLocal = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' || 
    window.location.hostname.endsWith('.local')
  );

  const liveWpUrl = (isWordPress && rawWpUrl && (!isLocalDomain || isClientLocal)) ? rawWpUrl : null;

  const isHtmlMode = isWordPress || docType === "html" || docType === "htm" ||
    (!docType && (fileExtension === ".html" || fileExtension === ".htm"));

  // 1. Fetch preview buffer/content from backend
  const loadPreviewBuffer = useCallback(async () => {
    if (!documentId) return;
    setIsLoading(true);
    setErrorMsg(null);
    setIsSizeLimitError(false);

    try {
      const res = await fetchDocumentPreview(documentId, segments, targetLang);
      const data = res.data;
      const detectedType = (res.documentType || "").toLowerCase();

      setDocType(detectedType);

      if (!data || data.byteLength === 0) {
        throw new Error("Received empty response from preview generator.");
      }

      // HTML preview: decode bytes as UTF-8 text and render in iframe
      const resolvedIsHtml = isWordPress || detectedType === "html" || detectedType === "htm" ||
        (!detectedType && (fileExtension === ".html" || fileExtension === ".htm"));

      if (resolvedIsHtml) {
        const text = new TextDecoder("utf-8").decode(data);
        setHtmlContent(text);
        setPreviewBuffer(null);
        setLastSyncTime(new Date());
        return;
      }

      // DOCX / PPTX / binary: validate PK ZIP magic bytes
      const bytes = new Uint8Array(data);
      if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
        const rawText = new TextDecoder("utf-8").decode(data);
        let parsedError = "The generated document is not a valid archive.";
        try {
          const errObj = JSON.parse(rawText);
          if (errObj && errObj.error) parsedError = errObj.error;
        } catch (_) {}
        throw new Error(parsedError);
      }

      setPreviewBuffer(data);
      setHtmlContent(null);
      setLastSyncTime(new Date());
    } catch (err) {
      console.error("LiveDocumentViewer load error:", err);
      const isSize = err.status === 413 || (err.message && err.message.includes("larger than"));
      setIsSizeLimitError(isSize);
      setErrorMsg(err.message || "Failed to load live document preview.");
    } finally {
      setIsLoading(false);
    }
  }, [documentId, segments, targetLang, fileExtension]);

  // Initial load & debounced update when segments or targetLang change
  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) loadPreviewBuffer();
    }, 400);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [loadPreviewBuffer]);

  const isRtl = isRtlLanguage(targetLang);

  // 2a. Render DOCX using docx-preview into unmanaged DOM container
  useEffect(() => {
    if (!previewBuffer || !containerRef.current || isHtmlMode) return;

    let isCancelled = false;

    const renderDocument = async () => {
      try {
        const targetElement = containerRef.current;
        targetElement.innerHTML = "";

        await renderAsync(previewBuffer, targetElement, null, {
          className: "docx-paper-page",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          experimental: true,
          useHTML5: true
        });

        if (!isCancelled) {
          const renderedElements = targetElement.querySelectorAll(
            ".docx-wrapper, .docx-paper-page, section.docx, p, span, td, th, h1, h2, h3, h4, h5, h6"
          );
          renderedElements.forEach(el => {
            if (!el.style.color) el.style.color = "#0f172a";
            if (isRtl) {
              el.setAttribute("dir", "rtl");
              if (["P", "SECTION", "TD", "TH", "H1", "H2", "H3", "H4", "H5", "H6"].includes(el.tagName)) {
                el.style.direction = "rtl";
                el.style.textAlign = "right";
                el.style.fontFamily = "'Noto Naskh Arabic', 'Noto Nastaliq Urdu', 'Segoe UI', Tahoma, Arial, sans-serif";
              }
            }
          });
        }
      } catch (renderErr) {
        console.error("docx-preview rendering error:", renderErr);
        if (!isCancelled) setErrorMsg("Could not render document layout formatting.");
      }
    };

    renderDocument();
    return () => { isCancelled = true; };
  }, [previewBuffer, isHtmlMode, isRtl]);

  // 2b. Write HTML content into sandboxed iframe (for non-live URL documents)
  useEffect(() => {
    if (liveWpUrl || !htmlContent || !iframeRef.current) return;
    try {
      const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        let contentToWrite = htmlContent;
        if (isRtl && !contentToWrite.includes('dir="rtl"') && !contentToWrite.includes("dir='rtl'")) {
          if (contentToWrite.includes("<html")) {
            contentToWrite = contentToWrite.replace(/<html/i, '<html dir="rtl"');
          } else {
            contentToWrite = `<div dir="rtl" style="direction:rtl;text-align:right;font-family:'Noto Naskh Arabic','Noto Nastaliq Urdu',sans-serif;">${contentToWrite}</div>`;
          }
        }
        iframeDoc.write(contentToWrite);
        iframeDoc.close();
      }
    } catch (e) {
      console.error("HTML iframe write error:", e);
    }
  }, [htmlContent, isRtl, liveWpUrl]);

  // Escape key listener for exiting full screen mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullScreen]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 15, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 15, 50));
  const handleResetZoom = () => setZoom(100);

  const handleDownload = () => {
    if (isHtmlMode && htmlContent) {
      const blob = new Blob([htmlContent], { type: "text/html; charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (fileName || "Document") + ".html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (previewBuffer) {
      const ext = docType ? `.${docType}` : fileExtension || ".docx";
      const mimeMap = {
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".doc": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
      const mime = mimeMap[ext] || "application/octet-stream";
      const blob = new Blob([previewBuffer], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (fileName || "Document") + ext;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Send real-time segment updates to live WordPress iframe via postMessage
  useEffect(() => {
    if (!isWordPress || !iframeRef.current?.contentWindow) return;
    try {
      const payload = {
        type: "VERBOCAT_UPDATE_SEGMENTS",
        segments: segments.map((s, idx) => ({
          id: s.id !== undefined && s.id !== null ? Number(s.id) : (s.segment_index || idx + 1),
          source: s.source || s.source_text || "",
          target: s.target !== undefined && s.target !== null ? s.target : (s.target_text || s.source || s.source_text || "")
        }))
      };
      iframeRef.current.contentWindow.postMessage(payload, "*");
    } catch (e) {
      console.error("[LiveDocumentViewer] postMessage error:", e);
    }
  }, [segments, isWordPress]);

  const hasContent = isHtmlMode ? (isWordPress ? true : !!htmlContent) : !!previewBuffer;
  const docTypeLabel = isWordPress ? "WordPress Live Native Site" : (isHtmlMode ? "Live HTML Document" : "Live Word Document");
  const exportLabel = isHtmlMode ? "Export HTML" : "Export DOCX";

  return (
    <div 
      className={`flex flex-col overflow-hidden font-sans transition-all duration-200 ${
        isFullScreen
          ? "fixed inset-0 z-[9999] w-screen h-screen bg-slate-950 text-slate-100 shadow-2xl"
          : `h-full w-full border-l border-[var(--border-subtle)] ${
              darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-800"
            }`
      }`}
    >
      {/* Viewer Header Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] shrink-0 select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-1.5 rounded-lg border shrink-0 ${
            isWordPress
              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
              : (isHtmlMode
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20")
          }`}>
            {isWordPress ? <Globe size={16} /> : (isHtmlMode ? <Globe size={16} /> : <FileText size={16} />)}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold truncate text-[var(--text-primary)] flex items-center gap-1.5">
              <span>{fileName}</span>
              {isWordPress && documentMetadata?.wp_post_id && (
                <span className="bg-blue-500/10 text-blue-400 text-[9px] px-1.5 py-0.5 rounded font-mono border border-blue-500/20">
                  WP #{documentMetadata.wp_post_id}
                </span>
              )}
              {isFullScreen && (
                <span className="bg-indigo-500/20 text-indigo-300 text-[9px] px-1.5 py-0.5 rounded font-semibold border border-indigo-500/30">
                  FULL SCREEN
                </span>
              )}
            </h4>
            <p className="text-[10px] text-[var(--text-muted)] font-medium flex items-center gap-1.5 mt-0.5">
              <span>{docTypeLabel}</span>
              <span>•</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 size={10} />
                Synced {lastSyncTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </p>
          </div>
        </div>

        {/* Toolbar Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Responsive Viewport Mode Selector for HTML previews */}
          {isHtmlMode && (
            <div className="flex items-center gap-0.5 bg-[var(--bg-input)] p-0.5 rounded-lg border border-[var(--border-subtle)] mr-1">
              <button
                onClick={() => setViewportMode("desktop")}
                className={`p-1.5 rounded transition cursor-pointer ${
                  viewportMode === "desktop"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
                title="Desktop View (100% Width)"
              >
                <Monitor size={13} />
              </button>
              <button
                onClick={() => setViewportMode("tablet")}
                className={`p-1.5 rounded transition cursor-pointer ${
                  viewportMode === "tablet"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
                title="Tablet View (768px)"
              >
                <Tablet size={13} />
              </button>
              <button
                onClick={() => setViewportMode("mobile")}
                className={`p-1.5 rounded transition cursor-pointer ${
                  viewportMode === "mobile"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
                title="Mobile View (375px)"
              >
                <Smartphone size={13} />
              </button>
            </div>
          )}

          {/* Zoom Buttons — only for DOCX (HTML iframe scrolls natively) */}
          {!isHtmlMode && (
            <div className="flex items-center gap-1 bg-[var(--bg-input)] p-1 rounded-lg border border-[var(--border-subtle)] mr-1">
              <button
                onClick={handleZoomOut}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut size={13} />
              </button>
              <button
                onClick={handleResetZoom}
                className="text-[10px] font-mono font-bold w-10 text-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                title="Reset Zoom (100%)"
              >
                {zoom}%
              </button>
              <button
                onClick={handleZoomIn}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn size={13} />
              </button>
            </div>
          )}

          {/* Export Download Button */}
          <button
            onClick={handleDownload}
            disabled={!hasContent}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer shadow-xs ${
              isHtmlMode
                ? "bg-emerald-600 hover:bg-emerald-500"
                : "bg-indigo-600 hover:bg-indigo-500"
            }`}
            title={`Download ${exportLabel}`}
          >
            <Download size={13} />
            <span className="hidden sm:inline">{exportLabel}</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={loadPreviewBuffer}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
            title="Refresh Live Preview"
          >
            <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
          </button>

          {/* Full Screen Mode Toggle Button */}
          <button
            onClick={() => setIsFullScreen(prev => !prev)}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              isFullScreen
                ? "bg-indigo-600 text-white border-indigo-500"
                : "bg-[var(--bg-surface)] hover:bg-indigo-500/20 border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-indigo-400"
            }`}
            title={isFullScreen ? "Exit Full Screen Mode (Esc)" : "Full Screen Mode"}
          >
            {isFullScreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          {/* Close Panel Button */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-rose-500/20 border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-rose-400 transition cursor-pointer ml-0.5"
            title="Close Preview"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Main Document Viewport */}
      <div
        ref={viewportRef}
        className="flex-1 overflow-hidden relative bg-slate-950 flex items-center justify-center"
      >
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center gap-3 z-30">
            <RefreshCw size={26} className="animate-spin text-indigo-400" />
            <p className="text-xs font-bold text-slate-200">Rendering Live Formatted Document...</p>
          </div>
        )}

        {/* Error Card */}
        {errorMsg ? (
          <div className="h-full w-full flex items-center justify-center p-6">
            <div className="max-w-md text-center p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-2xl">
              <AlertTriangle size={36} className={`mx-auto ${isSizeLimitError ? "text-orange-400" : "text-amber-400"}`} />
              <h4 className="text-sm font-bold text-slate-100">
                {isSizeLimitError ? "Document Too Large for Preview" : "Live Preview Unavailable"}
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">{errorMsg}</p>
              {!isSizeLimitError && (
                <button
                  onClick={loadPreviewBuffer}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer"
                >
                  Retry Sync
                </button>
              )}
            </div>
          </div>
        ) : isHtmlMode ? (
          /* ── HTML Preview: Responsive Container & Sandboxed iframe ── */
          <div className={`h-full transition-all duration-300 flex items-center justify-center ${
            viewportMode === "mobile"
              ? "w-[375px] max-w-full my-auto shadow-2xl border-x border-slate-800"
              : viewportMode === "tablet"
                ? "w-[768px] max-w-full my-auto shadow-2xl border-x border-slate-800"
                : "w-full"
          }`}>
            <iframe
              ref={iframeRef}
              src={liveWpUrl || undefined}
              title="HTML Live Preview"
              className="w-full h-full border-0 shadow-lg"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              style={{ backgroundColor: "white" }}
            />
          </div>
        ) : (
          /* ── DOCX / Binary Preview: docx-preview canvas ── */
          <div className="w-full h-full overflow-y-auto overflow-x-auto scroll-smooth p-6">
            <div
              className="w-full flex justify-center origin-top transition-transform duration-150 py-4 min-h-full"
              style={{ transform: `scale(${zoom / 100})` }}
            >
              <div
                ref={containerRef}
                className="live-docx-render-container w-full max-w-4xl"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
