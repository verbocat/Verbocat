import React, { useState, useEffect, useRef } from "react";
import { Camera, Upload, Trash2, X, Link, Check, Image as ImageIcon, Loader2 } from "lucide-react";
import {
  fetchDocumentScreenshots,
  uploadDocumentScreenshot,
  linkSegmentScreenshot,
  deleteScreenshot
} from "../services/api";

export function ScreenshotContextModal({
  show,
  onClose,
  documentId,
  currentSegment = null,
  showToast
}) {
  const [screenshots, setScreenshots] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeShot, setActiveShot] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (show && documentId) {
      loadData();
    }
  }, [show, documentId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchDocumentScreenshots(documentId);
      setScreenshots(data.screenshots || []);
      setLinks(data.links || []);
      if (data.screenshots && data.screenshots.length > 0) {
        setActiveShot(data.screenshots[0]);
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Failed to load screenshots.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      for (const f of files) {
        await uploadDocumentScreenshot(documentId, f, f.name);
      }
      if (showToast) showToast(`Uploaded ${files.length} screenshot(s).`, "success");
      await loadData();
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Failed to upload screenshot.", "error");
    } finally {
      setUploading(false);
    }
  };

  const isSegmentLinked = (shotId) => {
    if (!currentSegment) return false;
    return links.some((l) => l.screenshot_id === shotId && l.segment_id === currentSegment.id);
  };

  const toggleLink = async (shotId) => {
    if (!currentSegment) return;
    const linked = isSegmentLinked(shotId);

    try {
      await linkSegmentScreenshot(currentSegment.id, documentId, shotId, null, linked);
      if (showToast) showToast(linked ? "Unlinked screenshot." : "Linked screenshot to segment!", "success");
      await loadData();
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Failed to update screenshot link.", "error");
    }
  };

  const handleDelete = async (shotId) => {
    if (!window.confirm("Are you sure you want to delete this screenshot?")) return;

    try {
      await deleteScreenshot(shotId);
      if (showToast) showToast("Screenshot deleted.", "info");
      if (activeShot?.id === shotId) setActiveShot(null);
      await loadData();
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Failed to delete screenshot.", "error");
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Visual Context & Screenshots
                {currentSegment && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                    Segment #{currentSegment.id}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Upload and link visual UI screenshots to translation segments.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUpload}
              accept="image/*"
              multiple
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>Upload Screenshots</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Split Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Thumbnails List */}
          <div className="w-72 border-r border-slate-800 bg-slate-950/40 p-4 overflow-y-auto space-y-3 shrink-0">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">
              <span>Screenshots ({screenshots.length})</span>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center p-8 text-slate-500 text-xs gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <span>Loading gallery...</span>
              </div>
            ) : screenshots.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl space-y-2">
                <ImageIcon className="w-8 h-8 text-slate-600 mx-auto" />
                <p>No screenshots uploaded yet.</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-indigo-400 hover:underline text-xs font-medium"
                >
                  Upload your first image
                </button>
              </div>
            ) : (
              screenshots.map((shot) => {
                const isActive = activeShot?.id === shot.id;
                const isLinked = isSegmentLinked(shot.id);

                return (
                  <div
                    key={shot.id}
                    onClick={() => setActiveShot(shot)}
                    className={`relative p-2 rounded-2xl border transition-all cursor-pointer group ${
                      isActive
                        ? "bg-indigo-950/40 border-indigo-500/60 shadow-lg shadow-indigo-950/50"
                        : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="aspect-video bg-slate-950 rounded-xl overflow-hidden mb-2 relative">
                      <img
                        src={shot.image_url}
                        alt={shot.caption}
                        className="w-full h-full object-cover"
                      />
                      {isLinked && (
                        <span className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-[10px] font-bold shadow-md flex items-center gap-1">
                          <Check className="w-3 h-3" /> Linked
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200 truncate max-w-[140px]">
                        {shot.caption || shot.filename}
                      </span>

                      <div className="flex items-center gap-1">
                        {currentSegment && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLink(shot.id);
                            }}
                            className={`p-1.5 rounded-lg border transition-all ${
                              isLinked
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
                                : "bg-slate-800 text-slate-400 hover:text-white border-slate-700"
                            }`}
                            title={isLinked ? "Unlink from current segment" : "Link to current segment"}
                          >
                            <Link className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(shot.id);
                          }}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Delete screenshot"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Main Viewer */}
          <div className="flex-1 bg-slate-950 p-6 flex flex-col items-center justify-center relative overflow-hidden">
            {activeShot ? (
              <div className="w-full h-full flex flex-col items-center justify-center space-y-4">
                <div className="relative max-w-full max-h-[90%] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-black/40 flex items-center justify-center p-2">
                  <img
                    src={activeShot.image_url}
                    alt={activeShot.caption}
                    className="max-w-full max-h-[65vh] object-contain rounded-xl"
                  />
                </div>

                <div className="flex items-center gap-4 bg-slate-900/90 border border-slate-800 px-5 py-2.5 rounded-2xl shadow-xl backdrop-blur-md">
                  <span className="text-xs font-semibold text-slate-300">
                    {activeShot.caption || activeShot.filename}
                  </span>

                  {currentSegment && (
                    <button
                      onClick={() => toggleLink(activeShot.id)}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md ${
                        isSegmentLinked(activeShot.id)
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white"
                      }`}
                    >
                      <Link className="w-3.5 h-3.5" />
                      <span>
                        {isSegmentLinked(activeShot.id)
                          ? `Linked to Segment #${currentSegment.id} (Click to Unlink)`
                          : `Link to Segment #${currentSegment.id}`}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center space-y-3 text-slate-500">
                <Camera className="w-12 h-12 stroke-1 text-slate-700 mx-auto" />
                <p className="text-sm font-medium">Select a screenshot from the sidebar to view visual context.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
