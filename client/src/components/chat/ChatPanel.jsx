import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useChatStore } from "../../services/chatStore";
import { useUserStore } from "../../services/userStore";
import * as chatApi from "../../services/chatApi";
import {
  ArrowLeft,
  Send,
  Paperclip,
  X,
  ChevronDown,
  Loader2,
  AlertCircle,
  CheckCircle,
  FileText,
  MessageSquare,
  Plus,
  Navigation,
  MoreVertical
} from "lucide-react";

/* Helper to map attachment URLs */
const getFileUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  
  let baseUrl = import.meta.env.VITE_API_URL;
  if (!baseUrl) {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname; // e.g. "192.168.1.100" or "localhost"
    baseUrl = `${protocol}//${hostname}:5000`;
  }
  
  return `${baseUrl.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
};

function formatMessageTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function relativeTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ChatPanel({ chatSocketRef, panelPosition, onTeleport }) {
  const { user } = useUserStore();
  const userId = user?.id;
  const isLinguist = user?.role === "linguist";

  const {
    queries,
    activeQueryId,
    messages,
    loading,
    messagesLoading,
    isOpen,
    view,
    unreadQueries,
    setView,
    setActiveQuery,
    goBack,
    fetchQueries,
    fetchQueryMessages,
    createQuery,
    sendQueryMessage,
    uploadFile,
    resolveQuery,
    deleteQueryMessage,
    editQueryMessage,
    creationDefaults,
    setCreationDefaults
  } = useChatStore();

  /* Local states */
  const [queryType, setQueryType] = useState("file"); // "file" | "segment"
  const [segmentIndex, setSegmentIndex] = useState("");
  const [topic, setTopic] = useState("Context Clarification");
  const [messageInput, setMessageInput] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [submittingQuery, setSubmittingQuery] = useState(false);

  /* Pre-populate from creationDefaults if set */
  useEffect(() => {
    if (creationDefaults) {
      if (creationDefaults.queryType) {
        setQueryType(creationDefaults.queryType);
      }
      if (creationDefaults.segmentIndex !== undefined && creationDefaults.segmentIndex !== null) {
        setSegmentIndex(String(creationDefaults.segmentIndex));
      }
      setView("create");
      setCreationDefaults(null); // Clear defaults
    }
  }, [creationDefaults, setCreationDefaults, setView]);

  /* Message Actions and Edit states */
  const [activeMenuMessageId, setActiveMenuMessageId] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editInput, setEditInput] = useState("");
  const [isEditingSubmit, setIsEditingSubmit] = useState(false);

  /* Staff query initiation states */
  const [assignedLinguists, setAssignedLinguists] = useState([]);
  const [selectedLinguistId, setSelectedLinguistId] = useState("");
  const [loadingLinguists, setLoadingLinguists] = useState(false);

  /* Refs */
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  /* Detect active document from URL path */
  const activeDocumentId = useMemo(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/project\/([^\/]+)\/file\/([^\/]+)\/lang\/([^\/]+)/);
    return match ? match[2] : null;
  }, [window.location.pathname]);

  /* Pre-fill segment index if we are currently editing one */
  useEffect(() => {
    if (activeDocumentId && queryType === "segment") {
      // 1. Try currently focused segment editor
      const activeEl = document.activeElement;
      if (activeEl && activeEl.classList.contains("seg-editor")) {
        const container = activeEl.closest(".seg-card-container");
        const numLabel = container?.querySelector(".seg-num-label");
        if (numLabel && numLabel.textContent) {
          const segNum = parseInt(numLabel.textContent.trim());
          if (!isNaN(segNum)) {
            setSegmentIndex(String(segNum));
            return;
          }
        }
      }

      // 2. Fallback to selectors
      const activeSegCard = document.querySelector(".seg-card-active, [data-active-segment='true']");
      if (activeSegCard) {
        const indexAttr = activeSegCard.getAttribute("data-segment-index") || activeSegCard.getAttribute("id")?.replace(/\D/g, "");
        if (indexAttr) {
          setSegmentIndex(indexAttr);
          return;
        }
      }
    }
  }, [activeDocumentId, queryType]);

  /* Fetch queries when component mounts or activeDocumentId changes */
  useEffect(() => {
    fetchQueries(activeDocumentId);
  }, [activeDocumentId]);

  /* Fetch queries periodically to ensure up-to-date query states */
  useEffect(() => {
    const interval = setInterval(() => {
      fetchQueries(activeDocumentId);
    }, 15000);
    return () => clearInterval(interval);
  }, [activeDocumentId]);

  /* Fetch active query messages periodically for robust live updates fallback */
  useEffect(() => {
    if (!activeQueryId || view !== "chat") return;
    const interval = setInterval(() => {
      fetchQueryMessages(activeQueryId);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeQueryId, view, fetchQueryMessages]);

  /* Close message action menus on window click */
  useEffect(() => {
    const closeMenus = () => setActiveMenuMessageId(null);
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
  }, []);

  /* Fetch assigned linguists for the document if user is staff and opens create view */
  const fetchLinguists = async () => {
    if (!activeDocumentId) return;
    setLoadingLinguists(true);
    try {
      const list = await chatApi.fetchDocumentLinguists(activeDocumentId);
      setAssignedLinguists(list || []);
      if (list && list.length > 0) {
        setSelectedLinguistId(list[0].id);
      } else {
        setSelectedLinguistId("");
      }
    } catch (err) {
      console.error("Failed to load assigned linguists:", err);
    } finally {
      setLoadingLinguists(false);
    }
  };

  /* Scroll messages to bottom when active messages load/update */
  const activeMessages = useMemo(() => {
    return activeQueryId ? (messages[activeQueryId] || []) : [];
  }, [activeQueryId, messages]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (activeMessages.length > 0) {
      scrollToBottom();
    }
  }, [activeMessages, scrollToBottom]);

  const displayQueries = useMemo(() => {
    return queries;
  }, [queries]);

  const activeQuery = useMemo(() => {
    return queries.find((q) => q.id === activeQueryId) || null;
  }, [queries, activeQueryId]);

  /* Actions */
  const handleCreateQuery = async (e) => {
    e.preventDefault();
    if (!firstMessage.trim()) return;
    if (!isLinguist && !selectedLinguistId) return;
    
    setSubmittingQuery(true);
    try {
      await createQuery(
        activeDocumentId,
        queryType,
        queryType === "segment" ? parseInt(segmentIndex) || 0 : null,
        topic,
        firstMessage.trim(),
        isLinguist ? null : selectedLinguistId
      );
      setFirstMessage("");
      setSegmentIndex("");
      setView("list");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingQuery(false);
    }
  };

  const handleSend = async () => {
    if (!messageInput.trim() && !imageFile) return;
    try {
      if (imageFile) {
        await uploadFile(activeQueryId, imageFile);
        setImageFile(null);
        setImagePreview(null);
      }
      if (messageInput.trim()) {
        await sendQueryMessage(activeQueryId, messageInput.trim());
        setMessageInput("");
      }
      if (textareaRef.current) {
        textareaRef.current.style.height = "36px";
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleResolve = async (status = "resolved") => {
    try {
      await resolveQuery(activeQueryId, status);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm("Are you sure you want to delete this message for everyone?")) {
      return;
    }
    try {
      await deleteQueryMessage(messageId);
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  };

  const handleUpdateMessage = async (messageId) => {
    if (!editInput.trim()) return;
    setIsEditingSubmit(true);
    try {
      await editQueryMessage(messageId, editInput.trim());
      setEditingMessageId(null);
      setEditInput("");
    } catch (err) {
      console.error("Failed to edit message:", err);
    } finally {
      setIsEditingSubmit(false);
    }
  };

  const handleInputChange = (e) => {
    setMessageInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 96)}px`;
    }
  };

  return (
    <div
      className="fixed z-[500] w-[480px] h-[680px] rounded-2xl border border-[var(--border-medium)]
        bg-[var(--bg-surface)] shadow-2xl flex flex-col overflow-hidden animate-[chatScaleIn_0.2s_ease-out]"
      style={{
        left: Math.max(20, Math.min(window.innerWidth - 500, panelPosition.x - 424)),
        top: Math.max(20, Math.min(window.innerHeight - 710, panelPosition.y - 695)),
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] shrink-0">
        <div className="flex items-center gap-2">
          {view !== "list" && (
            <button
              type="button"
              onClick={goBack}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              Support Chat
            </h1>
            <p className="text-[10px] text-[var(--text-muted)]">
              {view === "list" ? "File Queries & Topics" : view === "create" ? "Raise New Support Query" : "Conversation"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => useChatStore.getState().setOpen(false)}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content views */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-[var(--bg-surface)]">
        
        {/* LIST VIEW */}
        {view === "list" && (
          <div className="flex-1 flex flex-col min-h-0">
            {loading && displayQueries.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin" />
              </div>
            ) : displayQueries.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <MessageSquare className="w-10 h-10 text-[var(--text-muted)] mb-3 opacity-40 animate-pulse" />
                <h3 className="text-xs font-bold text-[var(--text-primary)] mb-1">No support queries raised yet</h3>
                <p className="text-[11px] text-[var(--text-muted)] max-w-[280px] leading-relaxed">
                  {isLinguist
                    ? "If you have questions about translations, tags, or terminology for this file, raise a support query."
                    : "Linguists will raise queries here when they need context. You can also start direct contact with assigned linguists below."}
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-3 space-y-2 chat-scroll">
                {displayQueries.map((q) => {
                  const isUnread = unreadQueries.has(q.id);
                  
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setActiveQuery(q.id)}
                      className={`w-full flex flex-col gap-1.5 p-3.5 rounded-xl border text-left transition-all cursor-pointer
                        ${isUnread 
                          ? "bg-[var(--accent-glow)] border-[var(--accent)]/30 hover:bg-[var(--accent-glow)]" 
                          : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]"
                        }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[12.5px] font-bold text-[var(--text-primary)] truncate max-w-[260px]">
                          {q.topic}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border 
                          ${q.status === "open" 
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" 
                            : "bg-zinc-500/15 text-zinc-400 border-zinc-500/20"
                          }`}
                        >
                          {q.status.toUpperCase()}
                        </span>
                      </div>
                      
                      <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5 truncate">
                        <span className="shrink-0">{q.query_type === "segment" ? `Segment #${q.segment_index}` : "Whole File"}</span>
                        <span className="text-[var(--border-medium)]">•</span>
                        <span className="truncate">{q.document_name}</span>
                        {!isLinguist && q.linguist && (
                          <>
                            <span className="text-[var(--border-medium)]">•</span>
                            <span className="text-[var(--text-accent)] shrink-0 font-medium">Linguist: {q.linguist.name}</span>
                          </>
                        )}
                      </div>

                      {q.lastMessage && (
                        <div className="text-[11.5px] text-[var(--text-secondary)] truncate mt-1 border-t border-[var(--border-subtle)]/40 pt-2">
                          <span className="font-semibold">{q.lastMessage.sender?.name || "User"}: </span>
                          <span>{q.lastMessage.content}</span>
                        </div>
                      )}

                      <div className="text-[9px] text-[var(--text-muted)] text-right w-full mt-1">
                        {relativeTime(q.updated_at || q.created_at)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Bottom Actions based on Role */}
            {activeDocumentId && (
              <div className="p-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] shrink-0">
                {isLinguist ? (
                  <button
                    type="button"
                    onClick={() => setView("create")}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold
                      bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-all cursor-pointer
                      shadow-md hover:shadow-lg"
                  >
                    <Plus className="w-4 h-4" />
                    Raise Support Query
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      fetchLinguists();
                      setView("create");
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold
                      bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-all cursor-pointer
                      shadow-md hover:shadow-lg"
                  >
                    <Plus className="w-4 h-4" />
                    Contact Assigned Linguist
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* CREATE QUERY VIEW */}
        {view === "create" && (
          <form onSubmit={handleCreateQuery} className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
            {/* Staff only: Select Linguist dropdown */}
            {!isLinguist && (
              <div className="space-y-1.5 animate-[chatFadeIn_0.15s_ease-out]">
                <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Contact Linguist
                </label>
                {loadingLinguists ? (
                  <div className="flex items-center gap-2 py-1 text-xs text-[var(--text-muted)]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading assigned linguists...</span>
                  </div>
                ) : assignedLinguists.length === 0 ? (
                  <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>No linguists assigned to this document yet. Please share/assign it first.</span>
                  </div>
                ) : (
                  <select
                    value={selectedLinguistId}
                    onChange={(e) => setSelectedLinguistId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-[var(--bg-elevated)] border border-[var(--border-subtle)]
                      text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] cursor-pointer"
                  >
                    {assignedLinguists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Topic Category
              </label>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs bg-[var(--bg-elevated)] border border-[var(--border-subtle)]
                  text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] cursor-pointer"
              >
                <option value="Context Clarification">Context Clarification</option>
                <option value="Tag Issue / Placeholder">Tag Issue / Placeholder</option>
                <option value="Terminology Query">Terminology Query</option>
                <option value="Source Error / Typing error">Source Text Error</option>
                <option value="Other support request">Other Query</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Query Scope
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setQueryType("file")}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer
                    ${queryType === "file" 
                      ? "bg-[var(--accent-glow)] border-[var(--accent)] text-[var(--text-accent)]" 
                      : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    }`}
                >
                  Whole File
                </button>
                <button
                  type="button"
                  onClick={() => setQueryType("segment")}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer
                    ${queryType === "segment" 
                      ? "bg-[var(--accent-glow)] border-[var(--accent)] text-[var(--text-accent)]" 
                      : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    }`}
                >
                  Particular Segment
                </button>
              </div>
            </div>

            {queryType === "segment" && (
              <div className="space-y-1.5 animate-[chatFadeIn_0.15s_ease-out]">
                <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Segment Index / Number
                </label>
                <input
                  type="number"
                  min="0"
                  value={segmentIndex}
                  onChange={(e) => setSegmentIndex(e.target.value)}
                  placeholder="e.g. 5"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-[var(--bg-elevated)] border border-[var(--border-subtle)]
                    text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                    focus:outline-none focus:border-[var(--border-focus)]"
                  required
                />
              </div>
            )}

            <div className="space-y-1.5 flex-1 flex flex-col">
              <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Explain your query
              </label>
              <textarea
                value={firstMessage}
                onChange={(e) => setFirstMessage(e.target.value)}
                placeholder="Type your question or query here. Be as detailed as possible..."
                className="w-full flex-1 min-h-[100px] resize-none rounded-xl px-3 py-2 text-xs bg-[var(--bg-elevated)] border border-[var(--border-subtle)]
                  text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                  focus:outline-none focus:border-[var(--border-focus)]"
                required
              />
            </div>

            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setView("list")}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-[var(--border-medium)]
                  text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingQuery || (!isLinguist && !selectedLinguistId)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)]
                  text-white transition-all cursor-pointer disabled:opacity-30"
              >
                {submittingQuery ? "Creating..." : "Submit Query"}
              </button>
            </div>
          </form>
        )}

        {/* CHAT / CONVERSATION VIEW */}
        {view === "chat" && activeQuery && (
          <div className="flex-1 flex flex-col min-h-0 relative">
            {/* Query context card */}
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 text-[11px] shrink-0">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[12.5px] text-[var(--text-primary)]">{activeQuery.topic}</span>
                <span className="text-[var(--text-muted)] font-semibold">
                  {activeQuery.query_type === "segment" ? `Segment #${activeQuery.segment_index}` : "Whole File"}
                </span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] truncate mt-1 flex justify-between items-center">
                <span className="truncate max-w-[200px]">{activeQuery.document_name}</span>
                
                {/* Teleport Button (Shown when in editor context and activeDocumentId matches query document_id) */}
                {activeQuery.query_type === "segment" && 
                  activeQuery.segment_index !== null && 
                  activeDocumentId === activeQuery.document_id && (
                  <button
                    type="button"
                    onClick={() => onTeleport && onTeleport(activeQuery.segment_index)}
                    className="flex items-center gap-1 text-[9.5px] font-bold text-[var(--text-accent)] 
                      hover:underline cursor-pointer bg-[var(--accent-glow)] border border-[var(--accent)]/30 
                      px-2 py-0.5 rounded transition-all"
                  >
                    <Navigation className="w-2.5 h-2.5" />
                    Teleport to Segment
                  </button>
                )}
                
                {/* Resolve button (Only shown to owner/creator/admin) */}
                {activeQuery.status === "open" && (userId === activeQuery.project_creator_id || user?.role === "admin") && (
                  <button
                    type="button"
                    onClick={() => handleResolve("resolved")}
                    className="text-[10px] font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded cursor-pointer transition-colors"
                  >
                    Resolve Query
                  </button>
                )}
              </div>
            </div>

            {/* Messages box */}
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 chat-scroll min-h-0"
            >
              {messagesLoading && activeMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
                </div>
              ) : (
                <>
                  {activeMessages.map((msg) => {
                    const isOwn = msg.sender_id === userId;
                    const isSystem = msg.content.startsWith("[System]");
                    
                    if (isSystem) {
                      return (
                        <div key={msg.id} className="flex items-center justify-center my-3">
                          <span className="text-[9.5px] text-[var(--text-muted)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2.5 py-0.5 rounded-full font-medium">
                            {msg.content.replace("[System] ", "")}
                          </span>
                        </div>
                      );
                    }

                    const isDeletable = msg.sender_id === userId || activeQuery.project_creator_id === userId || user?.role === "admin";
                    const isEditable = msg.sender_id === userId && !msg.attachment_url;

                    return (
                      <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"} group relative`}>
                        <div className={`max-w-[80%] flex flex-col ${isOwn ? "items-end" : "items-start"} relative`}>
                          
                          {/* Sender label */}
                          {!isOwn && (
                            <span className="text-[9px] font-bold text-[var(--text-muted)] mb-0.5 px-1.5">
                              {msg.sender?.name || "User"}
                            </span>
                          )}

                          {/* Message container wrapping body and dropdown dots */}
                          <div className="flex items-center gap-1 relative">
                            {/* Hover Options Button (three dots) */}
                            {isOwn && (isDeletable || isEditable) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuMessageId(activeMenuMessageId === msg.id ? null : msg.id);
                                }}
                                className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all opacity-0 group-hover:opacity-100 self-center cursor-pointer shrink-0"
                                title="Message Actions"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Message Body or Editing block */}
                            <div className={`px-3.5 py-2 text-xs leading-relaxed rounded-2xl shadow-sm
                              ${isOwn 
                                ? "bg-gradient-to-br from-[var(--accent)] to-[color-mix(in_srgb,var(--accent),#000_20%)] text-white rounded-br-sm" 
                                : "bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-bl-sm"
                              }`}
                            >
                              {editingMessageId === msg.id ? (
                                <div className="space-y-2 py-1 min-w-[200px]" onClick={(e) => e.stopPropagation()}>
                                  <textarea
                                    value={editInput}
                                    onChange={(e) => setEditInput(e.target.value)}
                                    className="w-full text-xs p-2 rounded-lg bg-black/10 border border-white/20 text-white focus:outline-none resize-none"
                                    rows={2}
                                  />
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setEditingMessageId(null)}
                                      className="px-2 py-1 text-[10px] bg-white/10 hover:bg-white/15 rounded text-white font-semibold transition-all cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateMessage(msg.id)}
                                      disabled={isEditingSubmit || !editInput.trim()}
                                      className="px-2.5 py-1 text-[10px] bg-white hover:bg-white/90 text-black rounded font-bold transition-all cursor-pointer disabled:opacity-40"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : msg.attachment_url ? (
                                <div className="space-y-1.5">
                                  {msg.attachment_type?.startsWith("image/") ? (
                                    <a href={getFileUrl(msg.attachment_url)} target="_blank" rel="noreferrer">
                                      <img 
                                        src={getFileUrl(msg.attachment_url)} 
                                        alt="Attachment" 
                                        className="max-w-[280px] rounded-lg max-h-[160px] object-cover hover:opacity-90 transition-opacity" 
                                      />
                                    </a>
                                  ) : (
                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/10 border border-white/10">
                                      <FileText className="w-4 h-4" />
                                      <span className="text-[10px] truncate max-w-[160px]">{msg.attachment_name}</span>
                                    </div>
                                  )}
                                  <a 
                                    href={getFileUrl(msg.attachment_url)} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-[9px] underline block hover:opacity-85 text-right font-medium"
                                    style={{ color: isOwn ? "white" : "var(--accent)" }}
                                  >
                                    Download File
                                  </a>
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                                  {msg.updated_at && msg.updated_at !== msg.created_at && (
                                    <span className="text-[8px] opacity-60 italic block text-right select-none mt-0.5">edited</span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Hover Options Button for incoming messages (three dots) */}
                            {!isOwn && (isDeletable || isEditable) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuMessageId(activeMenuMessageId === msg.id ? null : msg.id);
                                }}
                                className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all opacity-0 group-hover:opacity-100 self-center cursor-pointer shrink-0"
                                title="Message Actions"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Message Actions Dropdown Menu */}
                          {activeMenuMessageId === msg.id && (
                            <div 
                              className={`absolute z-[600] w-32 bg-[var(--bg-elevated)] border border-[var(--border-medium)] rounded-xl shadow-xl py-1 text-[11px] animate-[chatFadeIn_0.1s_ease-out]
                                ${isOwn ? "right-[42px] top-6" : "left-[42px] top-6"}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(msg.content);
                                  setActiveMenuMessageId(null);
                                }}
                                className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition-colors cursor-pointer"
                              >
                                Copy Text
                              </button>
                              
                              {/* Edit Option (Only own text messages) */}
                              {isEditable && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMessageId(msg.id);
                                    setEditInput(msg.content);
                                    setActiveMenuMessageId(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition-colors cursor-pointer"
                                >
                                  Edit Message
                                </button>
                              )}

                              {/* Delete Option (Deletable messages) */}
                              {isDeletable && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleDeleteMessage(msg.id);
                                    setActiveMenuMessageId(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] text-rose-400 hover:text-rose-300 font-semibold transition-colors cursor-pointer"
                                >
                                  Delete message
                                </button>
                              )}
                            </div>
                          )}

                          {/* Timestamp */}
                          <span className="text-[8.5px] mt-0.5 px-1 text-[var(--text-muted)] flex items-center gap-1.5">
                            <span>{formatMessageTime(msg.created_at)}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Image attachment preview */}
            {imagePreview && (
              <div className="flex items-center gap-2 px-3 py-1.5 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] shrink-0 animate-[chatSlideUp_0.15s_ease-out]">
                <img src={imagePreview} alt="Preview" className="w-8 h-8 rounded object-cover border border-[var(--border-medium)]" />
                <span className="flex-1 text-[10px] text-[var(--text-secondary)] truncate">
                  {imageFile?.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setImagePreview(null);
                    setImageFile(null);
                  }}
                  className="p-1 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Input area */}
            {activeQuery.status === "open" ? (
              <div className="flex items-end gap-2 px-3.5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0 mb-0.5"
                >
                  <Paperclip className="w-4.5 h-4.5" />
                </button>
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={messageInput}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="flex-1 resize-none rounded-xl px-3.5 py-2 text-xs bg-[var(--bg-surface)] border border-[var(--border-subtle)]
                    text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                    focus:outline-none focus:border-[var(--border-focus)] transition-colors
                    max-h-24"
                  style={{ minHeight: "36px" }}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!messageInput.trim() && !imageFile}
                  className="p-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-all cursor-pointer shrink-0 mb-0.5
                    disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="p-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 shrink-0 text-center flex items-center justify-center gap-1 text-[11px] text-[var(--text-muted)]">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>This query has been resolved/closed.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
