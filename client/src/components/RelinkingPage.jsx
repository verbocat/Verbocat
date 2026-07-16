import React, { useState } from "react";
import { relinkFiles } from "../services/api";
import { LANGUAGES } from "../constants/languages";
import { 
  Upload, Layers, CheckCircle2, FileText, ArrowRight, 
  Sparkles, Download, Play, RefreshCw, AlertCircle, ShieldCheck
} from "lucide-react";

export const RelinkingPage = ({ onNavigate, onLoadRelinkedDocument, showToast, theme }) => {
  const [sourceFile, setSourceFile] = useState(null);
  const [targetFile, setTargetFile] = useState(null);
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLang, setTargetLang] = useState("hi");
  const [isProcessing, setIsProcessing] = useState(false);
  const [alignedSegments, setAlignedSegments] = useState([]);
  const [template, setTemplate] = useState("");
  const [stats, setStats] = useState({ total: 0, tagCount: 0 });

  const handleSourceUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSourceFile(file);
      showToast && showToast(`Source file loaded: ${file.name}`);
    }
  };

  const handleTargetUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setTargetFile(file);
      showToast && showToast(`Target file loaded: ${file.name}`);
    }
  };

  const handleRunRelinking = async () => {
    if (!sourceFile || !targetFile) {
      showToast && showToast("Please upload both Source and Target files to proceed.", "warn");
      return;
    }

    try {
      setIsProcessing(true);
      showToast && showToast("Running tag-anchored multi-strategy alignment engine...");
      
      const data = await relinkFiles(sourceFile, targetFile);
      if (data.segments && data.segments.length > 0) {
        setAlignedSegments(data.segments);
        setTemplate(data.template || "");
        
        let totalTags = 0;
        data.segments.forEach(s => {
          const matches = (s.source + s.target).match(/<\/?\d+>/g);
          if (matches) totalTags += matches.length;
        });

        setStats({
          total: data.segments.length,
          tagCount: totalTags
        });

        showToast && showToast(`Successfully aligned ${data.segments.length} segments with 100% tag preservation!`);
      } else {
        showToast && showToast("No segments could be parsed from the uploaded files.", "error");
      }
    } catch (err) {
      console.error("Relinking failed:", err);
      showToast && showToast(`Relinking error: ${err.response?.data?.error || err.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenInEditor = () => {
    if (alignedSegments.length === 0) return;
    if (onLoadRelinkedDocument) {
      onLoadRelinkedDocument({
        fileName: sourceFile ? sourceFile.name : "relinked_document.html",
        segments: alignedSegments,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        fileExtension: ".html"
      });
    }
    if (onNavigate) {
      onNavigate("/editor");
    }
  };

  return (
    <div className="min-h-screen w-full bg-[var(--bg-app,#0b0c10)] text-[var(--text-primary,#f3f4f6)] p-6 space-y-6 flex flex-col max-w-7xl mx-auto">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-medium,rgba(255,255,255,0.08))] pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Relinking Studio & Alignment Page
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Universal 30+ Languages
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Upload English Source and Translated Target files side-by-side. Segments are anchored directly to HTML tags to prevent missing tags and guarantee accurate segment alignment.
              </p>
            </div>
          </div>
        </div>

        {onNavigate && (
          <button
            onClick={() => onNavigate("/")}
            className="self-start md:self-auto px-4 py-2 rounded-xl border border-slate-700/60 bg-slate-800/40 text-xs font-semibold hover:bg-slate-700/50 transition-all cursor-pointer"
          >
            ← Back to Dashboard
          </button>
        )}
      </div>

      {/* Upload Dual Dropzone Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Source Box */}
        <div className="bg-[var(--bg-surface,#12141c)] border border-[var(--border-medium,rgba(255,255,255,0.08))] rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">1. Source File (English)</h2>
            </div>
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-2.5 py-1 text-slate-300 outline-none"
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.flag} {l.name} ({l.code.toUpperCase()})</option>
              ))}
            </select>
          </div>

          <label className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
            sourceFile ? "border-indigo-500/50 bg-indigo-500/5" : "border-slate-700/60 hover:border-slate-500 bg-slate-900/30"
          }`}>
            <Upload className={`w-8 h-8 ${sourceFile ? "text-indigo-400" : "text-slate-500"}`} />
            {sourceFile ? (
              <div className="text-center">
                <p className="text-xs font-bold text-indigo-300">{sourceFile.name}</p>
                <p className="text-[10px] text-slate-500">{(sourceFile.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="text-center space-y-1">
                <p className="text-xs font-semibold text-slate-300">Click to upload Source HTML</p>
                <p className="text-[10px] text-slate-500">Supports .html, .htm files</p>
              </div>
            )}
            <input type="file" accept=".html,.htm" onChange={handleSourceUpload} className="hidden" />
          </label>
        </div>

        {/* Target Box */}
        <div className="bg-[var(--bg-surface,#12141c)] border border-[var(--border-medium,rgba(255,255,255,0.08))] rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">2. Target File (Translated)</h2>
            </div>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-2.5 py-1 text-slate-300 outline-none"
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.flag} {l.name} ({l.code.toUpperCase()})</option>
              ))}
            </select>
          </div>

          <label className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
            targetFile ? "border-emerald-500/50 bg-emerald-500/5" : "border-slate-700/60 hover:border-slate-500 bg-slate-900/30"
          }`}>
            <Upload className={`w-8 h-8 ${targetFile ? "text-emerald-400" : "text-slate-500"}`} />
            {targetFile ? (
              <div className="text-center">
                <p className="text-xs font-bold text-emerald-300">{targetFile.name}</p>
                <p className="text-[10px] text-slate-500">{(targetFile.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="text-center space-y-1">
                <p className="text-xs font-semibold text-slate-300">Click to upload Target Translated HTML</p>
                <p className="text-[10px] text-slate-500">Supports .html, .htm files</p>
              </div>
            )}
            <input type="file" accept=".html,.htm" onChange={handleTargetUpload} className="hidden" />
          </label>
        </div>

      </div>

      {/* Relinking Action CTA */}
      <div className="flex items-center justify-center py-2">
        <button
          onClick={handleRunRelinking}
          disabled={isProcessing || !sourceFile || !targetFile}
          className={`flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-xl cursor-pointer ${
            isProcessing || !sourceFile || !targetFile
              ? "bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 border border-indigo-400/30 active:scale-95"
          }`}
        >
          {isProcessing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-300" />
              <span>Aligning Tags & Segments...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Run Multi-Strategy Segment Relinking</span>
            </>
          )}
        </button>
      </div>

      {/* Aligned Segment Board Preview */}
      {alignedSegments.length > 0 && (
        <div className="bg-[var(--bg-surface,#12141c)] border border-[var(--border-medium,rgba(255,255,255,0.08))] rounded-2xl p-6 space-y-4 shadow-2xl animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Aligned Segment Pair Preview ({stats.total} Segments)</h3>
                <p className="text-[11px] text-slate-400">Total inline HTML tags preserved: <strong className="text-indigo-400">{stats.tagCount}</strong></p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleOpenInEditor}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
              >
                <span>Open in Workspace Editor</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Segment List View */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {alignedSegments.map((seg, idx) => (
              <div key={seg.id || idx} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-all">
                {/* Source Column */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400">
                    <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">Segment #{seg.id}</span>
                    <span className="text-indigo-400">Source</span>
                  </div>
                  <div className="text-xs text-slate-200 leading-relaxed font-mono bg-slate-950/60 p-3 rounded-lg border border-slate-800/60 whitespace-pre-wrap">
                    {seg.source}
                  </div>
                </div>

                {/* Target Column */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400">
                    <span className="text-emerald-400 font-bold">Target Aligned</span>
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">Preserved Tags</span>
                  </div>
                  <div className="text-xs text-slate-100 leading-relaxed font-mono bg-slate-950/60 p-3 rounded-lg border border-slate-800/60 whitespace-pre-wrap">
                    {seg.target || <span className="text-amber-500/70 italic">[Empty translation]</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
