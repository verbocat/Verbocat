import React, { useState, useEffect } from "react";
import { X, StickyNote, Plus, Trash2, Edit2, Pin, Check, Copy, Download, User, Calendar } from "lucide-react";
import { fetchProjectNotes, createProjectNote, updateProjectNote, deleteProjectNote } from "../services/api.js";

export function ProjectNotesModal({ isOpen, onClose, projectId, projectName, isOwner }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && projectId) {
      loadNotes();
    }
  }, [isOpen, projectId]);

  const loadNotes = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchProjectNotes(projectId);
      setNotes(res.notes || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load project notes.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await createProjectNote(projectId, newContent.trim(), isPinned);
      setNotes(res.notes || []);
      setNewContent("");
      setIsPinned(false);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to create note.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (note) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
  };

  const handleSaveEdit = async (noteId) => {
    if (!editContent.trim()) return;
    setError("");
    try {
      const res = await updateProjectNote(projectId, noteId, { content: editContent.trim() });
      setNotes(res.notes || []);
      setEditingNoteId(null);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to edit note.");
    }
  };

  const handleTogglePin = async (note) => {
    setError("");
    try {
      const res = await updateProjectNote(projectId, note.id, { isPinned: !note.is_pinned });
      setNotes(res.notes || []);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to update pin state.");
    }
  };

  const handleDelete = async (noteId) => {
    if (!window.confirm("Are you sure you want to delete this note?")) return;
    setError("");
    try {
      const res = await deleteProjectNote(projectId, noteId);
      setNotes(res.notes || []);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to delete note.");
    }
  };

  const handleExportNotes = () => {
    if (notes.length === 0) return;
    const formatted = notes
      .map(n => `[${new Date(n.created_at).toLocaleString()}] ${n.author_name} (${n.author_email}):\n${n.content}\n`)
      .join("\n---\n\n");
    
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  if (!isOpen) return null;

  const sortedNotes = [...notes].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-2xl select-none text-left p-6 flex flex-col gap-5 max-h-[90vh] overflow-hidden" style={{ borderRadius: "12px" }}>
        
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <StickyNote className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] leading-snug">
                Project Notes ({notes.length})
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)] font-medium">
                {projectName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {notes.length > 0 && (
              <button
                type="button"
                onClick={handleExportNotes}
                className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                title="Copy all notes to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Export Notes"}
              </button>
            )}
            <button 
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Add Note Input Box */}
        <form onSubmit={handleCreate} className="flex flex-col gap-2.5 bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5 rounded-xl">
          <textarea
            required
            rows={2}
            placeholder="Add a collaborative project note or update..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg p-3 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-all resize-none font-medium placeholder-[var(--text-muted)]"
          />
          <div className="flex justify-between items-center">
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="rounded border-[var(--border-medium)] bg-[var(--bg-input)] text-indigo-500 focus:ring-0 cursor-pointer"
              />
              <Pin className="w-3.5 h-3.5 text-amber-400" />
              Pin note to top
            </label>

            <button
              type="submit"
              disabled={submitting || !newContent.trim()}
              className="flex items-center gap-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold px-4 py-2 rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" /> Add Note
            </button>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="text-xs font-semibold text-[var(--text-rose)] bg-[var(--rose)]/10 border border-[var(--rose)]/20 rounded-xl p-3">
            {error}
          </div>
        )}

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 max-h-[360px]">
          {loading ? (
            <div className="py-8 text-center text-xs font-bold text-[var(--text-muted)]">Loading notes...</div>
          ) : sortedNotes.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl font-medium">
              No notes added to this project yet. Start the conversation!
            </div>
          ) : (
            sortedNotes.map((note) => (
              <div 
                key={note.id}
                className={`bg-[var(--bg-panel)] border ${
                  note.is_pinned ? "border-amber-500/40 bg-amber-500/5" : "border-[var(--border-subtle)]"
                } rounded-xl p-3.5 flex flex-col gap-2 transition-all relative group`}
              >
                {/* Note Header */}
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {note.author_name ? note.author_name.charAt(0).toUpperCase() : "U"}
                    </div>
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--text-primary)] truncate">{note.author_name}</span>
                      <span className="text-[10px] text-[var(--text-muted)] truncate">({note.author_email})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {note.is_pinned && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                        <Pin className="w-3 h-3 fill-amber-400" /> Pinned
                      </span>
                    )}

                    <span className="text-[10px] text-[var(--text-muted)]">
                      {formatDate(note.created_at)}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleTogglePin(note)}
                      className={`p-1 rounded hover:bg-[var(--bg-hover)] transition-colors ${
                        note.is_pinned ? "text-amber-400" : "text-[var(--text-muted)] hover:text-amber-400"
                      }`}
                      title={note.is_pinned ? "Unpin Note" : "Pin Note"}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStartEdit(note)}
                      className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      title="Edit Note"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(note.id)}
                      className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-rose)] transition-colors"
                      title="Delete Note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Note Content / Editing form */}
                {editingNoteId === note.id ? (
                  <div className="flex flex-col gap-2 mt-1">
                    <textarea
                      rows={3}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-medium)] rounded-lg p-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-medium"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingNoteId(null)}
                        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] font-bold px-3 py-1 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(note.id)}
                        className="text-xs bg-[var(--accent)] text-white font-bold px-3 py-1 rounded-lg cursor-pointer shadow-sm"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed font-medium">
                    {note.content}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
