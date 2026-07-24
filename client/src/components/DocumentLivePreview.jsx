import React, { useEffect, useRef, useState } from "react";
import { renderAsync as renderDocx } from "docx-preview";
import JSZip from "jszip";
import { 
  Eye, RefreshCw, ZoomIn, ZoomOut, Maximize2, Minimize2, Download, 
  ChevronLeft, ChevronRight, FileText, Presentation, AlertCircle, Sparkles, X 
} from "lucide-react";

export const DocumentLivePreview = ({
  documentId,
  fileName = "",
  arrayBuffer = null,
  documentType = "docx",
  isLoading = false,
  onRefresh = () => {},
  onClose = () => {},
  darkMode = true,
  isSplitView = true
}) => {
  const containerRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [renderError, setRenderError] = useState(null);
  const [htmlContent, setHtmlContent] = useState("");

  // PPTX specific states
  const [slides, setSlides] = useState([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [parsingSlides, setParsingSlides] = useState(false);

  // Robust File Extension Extractor
  const getFileExtension = () => {
    if (fileName && fileName.includes(".")) {
      const ext = fileName.split('.').pop().toLowerCase();
      if (["docx", "doc", "pptx", "ppt", "html", "htm", "txt", "pdf"].includes(ext)) {
        return ext;
      }
    }
    if (documentType) {
      const cleanType = documentType.replace(".", "").toLowerCase();
      if (["docx", "doc", "pptx", "ppt", "html", "htm", "txt", "pdf"].includes(cleanType)) {
        return cleanType;
      }
    }
    return "docx"; // Default to docx
  };

  const fileExt = getFileExtension();
  const isPptx = fileExt === "pptx" || fileExt === "ppt";
  const isDocx = fileExt === "docx" || fileExt === "doc" || !isPptx;

  // Handle DOCX & Fallback Text Rendering
  useEffect(() => {
    if (!arrayBuffer || isPptx) return;

    let isMounted = true;
    setRenderError(null);
    setHtmlContent("");

    const renderWordDocument = async () => {
      try {
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }

        // 1. Try rendering via docx-preview first
        await renderDocx(arrayBuffer, containerRef.current, null, {
          className: "docx-rendered-page",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          experimental: true,
          useHTML5: true
        });
      } catch (err) {
        console.warn("DOCX Preview parse warning, falling back to text decoder:", err);
        try {
          // 2. Fallback text/HTML decoder
          const textDecoder = new TextDecoder("utf-8");
          const decodedText = textDecoder.decode(arrayBuffer);
          if (isMounted) {
            setHtmlContent(decodedText);
          }
        } catch (fallbackErr) {
          if (isMounted) {
            setRenderError("Could not render visual preview for this document.");
          }
        }
      }
    };

    renderWordDocument();

    return () => {
      isMounted = false;
    };
  }, [arrayBuffer, isDocx, isPptx]);

  // Handle PPTX Slide Extraction & Parsing
  useEffect(() => {
    if (!arrayBuffer || !isPptx) return;

    let isMounted = true;
    setParsingSlides(true);
    setRenderError(null);

    const parsePptxSlides = async () => {
      try {
        const zip = await JSZip.loadAsync(arrayBuffer);
        const slideFiles = Object.keys(zip.files)
          .filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/i))
          .sort((a, b) => {
            const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || "0", 10);
            const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || "0", 10);
            return numA - numB;
          });

        const parsedSlidesList = [];

        for (let i = 0; i < slideFiles.length; i++) {
          const slidePath = slideFiles[i];
          const xmlText = await zip.file(slidePath).async("string");
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, "text/xml");

          // Extract text paragraphs inside <a:p> tags
          const pElements = xmlDoc.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "p");
          const paragraphs = [];

          for (let j = 0; j < pElements.length; j++) {
            const p = pElements[j];
            const textContent = p.textContent ? p.textContent.trim() : "";
            if (textContent) {
              const isTitle = j === 0 || textContent.length < 40;
              paragraphs.push({ text: textContent, isTitle });
            }
          }

          parsedSlidesList.push({
            slideNumber: i + 1,
            title: paragraphs.find(p => p.isTitle)?.text || `Slide ${i + 1}`,
            paragraphs
          });
        }

        if (isMounted) {
          setSlides(parsedSlidesList);
          if (parsedSlidesList.length > 0 && activeSlideIndex >= parsedSlidesList.length) {
            setActiveSlideIndex(0);
          }
        }
      } catch (err) {
        console.error("PPTX Parsing Error:", err);
        if (isMounted) {
          setRenderError("Failed to parse presentation slides.");
        }
      } finally {
        if (isMounted) setParsingSlides(false);
      }
    };

    parsePptxSlides();

    return () => {
      isMounted = false;
    };
  }, [arrayBuffer, isPptx]);

  const handleDownload = () => {
    if (!arrayBuffer) return;
    const blob = new Blob([arrayBuffer], { 
      type: isDocx 
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
        : "application/vnd.openxmlformats-officedocument.presentationml.presentation" 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `preview_${fileName || (isDocx ? "document.docx" : "presentation.pptx")}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`flex flex-col h-full bg-slate-900 border-l border-slate-800 text-slate-100 shadow-2xl relative select-none ${isSplitView ? 'w-full' : 'fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md'}`}>
      
      {/* ── Header Bar ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800 backdrop-blur">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            {isPptx ? <Presentation size={16} /> : <FileText size={16} />}
          </div>
          <div className="flex flex-col truncate">
            <span className="text-xs font-bold text-slate-200 truncate flex items-center gap-1.5">
              Live Document Preview
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase font-semibold">
                {fileExt}
              </span>
            </span>
            <span className="text-[11px] text-slate-400 truncate">{fileName || "Untitled Document"}</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Zoom controls */}
          <div className="flex items-center bg-slate-800/80 rounded-lg border border-slate-700/60 p-0.5 mr-1">
            <button
              onClick={() => setZoomLevel(prev => Math.max(50, prev - 10))}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded transition-colors"
              title="Zoom Out"
            >
              <ZoomOut size={13} />
            </button>
            <span className="text-[11px] font-mono font-medium text-slate-300 px-1.5 min-w-[36px] text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={() => setZoomLevel(prev => Math.min(175, prev + 10))}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded transition-colors"
              title="Zoom In"
            >
              <ZoomIn size={13} />
            </button>
          </div>

          {/* Refresh preview */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 rounded-lg transition-all cursor-pointer"
            title="Refresh Preview"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin text-indigo-400" : ""} />
          </button>

          {/* Download file */}
          <button
            onClick={handleDownload}
            disabled={!arrayBuffer}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 rounded-lg transition-all cursor-pointer"
            title="Download Live Export Buffer"
          >
            <Download size={14} />
          </button>

          {/* Close preview button */}
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-lg transition-all ml-1 cursor-pointer"
            title="Close Preview"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── Main Preview Workspace ── */}
      <div className="flex-1 overflow-auto bg-slate-950 p-4 relative flex flex-col items-center justify-start">
        
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-3">
            <RefreshCw size={24} className="animate-spin text-indigo-400" />
            <span className="text-xs font-medium text-slate-300">Rendering live document output…</span>
          </div>
        )}

        {/* Error Notice */}
        {renderError && (
          <div className="w-full max-w-lg mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-xs flex items-start gap-2.5">
            <AlertCircle size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">Preview Render Notice</p>
              <p className="text-[11px] text-rose-300/80">{renderError}</p>
            </div>
          </div>
        )}

        {/* DOCX Live View */}
        {isDocx && (
          <div 
            className="w-full flex flex-col items-center transition-transform duration-200 origin-top"
            style={{ transform: `scale(${zoomLevel / 100})` }}
          >
            {/* DOCX Render Container */}
            <div 
              ref={containerRef} 
              className="docx-preview-container bg-white text-slate-900 rounded-lg shadow-2xl overflow-hidden min-h-[600px] w-full max-w-[800px] p-8 text-sm leading-relaxed"
            />

            {/* Fallback Decoded HTML Content if docx-preview is empty */}
            {htmlContent && (
              <div 
                className="bg-white text-slate-900 rounded-lg shadow-2xl overflow-hidden min-h-[600px] w-full max-w-[800px] p-8 text-sm leading-relaxed border border-slate-200 mt-4"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            )}
          </div>
        )}

        {/* PPTX Presentation Live View */}
        {isPptx && (
          <div className="w-full max-w-4xl flex flex-col items-center gap-4">
            
            {/* Slide Carousel Navigation Bar */}
            {slides.length > 0 && (
              <div className="flex items-center justify-between w-full bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveSlideIndex(prev => Math.max(0, prev - 1))}
                    disabled={activeSlideIndex === 0}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="font-mono text-indigo-400 font-semibold">
                    Slide {activeSlideIndex + 1} of {slides.length}
                  </span>
                  <button
                    onClick={() => setActiveSlideIndex(prev => Math.min(slides.length - 1, prev + 1))}
                    disabled={activeSlideIndex === slides.length - 1}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Thumbnails preview strip */}
                <div className="flex items-center gap-1.5 overflow-x-auto max-w-[320px] py-1 no-scrollbar">
                  {slides.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveSlideIndex(idx)}
                      className={`px-2 py-1 text-[10px] font-mono rounded border transition-all cursor-pointer ${
                        idx === activeSlideIndex 
                          ? 'bg-indigo-600 text-white border-indigo-400 font-bold' 
                          : 'bg-slate-800/90 text-slate-400 border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Active Slide Canvas Card (16:9 Aspect Ratio) */}
            {slides.length > 0 && slides[activeSlideIndex] ? (
              <div 
                className="w-full aspect-[16/9] bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl flex flex-col justify-between relative overflow-hidden transition-all"
                style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
              >
                {/* Slide Decorative Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <h2 className="text-lg font-bold text-indigo-300 truncate max-w-[80%]">
                    {slides[activeSlideIndex].title}
                  </h2>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    Slide {activeSlideIndex + 1}
                  </span>
                </div>

                {/* Slide Body Paragraph Blocks */}
                <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-2">
                  {slides[activeSlideIndex].paragraphs.map((p, pIdx) => (
                    <div 
                      key={pIdx} 
                      className={`p-3 rounded-xl transition-all ${
                        p.isTitle 
                          ? 'text-sm font-semibold text-slate-100 bg-slate-800/60 border border-slate-700/50' 
                          : 'text-xs text-slate-300 bg-slate-800/30 border border-slate-800/60 pl-4 border-l-2 border-l-indigo-500'
                      }`}
                    >
                      {p.text}
                    </div>
                  ))}
                </div>

                {/* Slide Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-800/60 text-[10px] text-slate-500 mt-4 font-mono">
                  <span>Verbocat Live PPTX Preview</span>
                  <span>{activeSlideIndex + 1} / {slides.length}</span>
                </div>
              </div>
            ) : !parsingSlides && (
              <div className="py-16 text-center text-slate-500 text-xs">
                No slide content available to preview.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
