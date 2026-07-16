import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useChatStore } from "../../services/chatStore.js";
import { useUserStore } from "../../services/userStore.js";
import {
  Send,
  Paperclip,
  X,
  Loader2,
  CheckCircle,
  FileText,
  MessageSquare,
  ArrowLeft,
  Settings,
  ChevronDown
} from "lucide-react";

const getFileUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  const baseUrl = import.meta.env.VITE_API_URL || window.location.origin;
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

export const FullChatScreen = ({ chatSocketRef, navigateTo, theme }) => {
  const { user } = useUserStore();
  const userId = user?.id;
  const isLinguist = user?.role === "linguist";

  const {
    queries,
    activeQueryId,
    messages,
    loading,
    messagesLoading,
    setView,
    setActiveQuery,
    goBack,
    fetchQueries,
    fetchQueryMessages,
    sendQueryMessage,
    uploadFile,
    resolveQuery
  } = useChatStore();

  const [messageInput, setMessageInput] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const scrollContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    // Fetch all queries globally on mount
    fetchQueries();
  }, []);

  const activeMessages = useMemo(() => {
    return activeQueryId ? (messages[activeQueryId] || []) : [];
  }, [activeQueryId, messages]);

  const activeQuery = useMemo(() => {
    return queries.find((q) => q.id === activeQueryId) || null;
  }, [queries, activeQueryId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (activeMessages.length > 0) {
      scrollToBottom();
    }
  }, [activeMessages, scrollToBottom]);

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
        textareaRef.current.style.height = "42px";
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

  const handleInputChange = (e) => {
    setMessageInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  return (
    <div className="flex-1 flex h-[calc(100vh-56px)] bg-[var(--bg-surface)] text-[var(--text-primary)] overflow-hidden">
      
      {/* Sidebar List */}
      <div className="w-[340px] border-r border-[var(--border-subtle)] flex flex-col bg-[var(--bg-elevated)] shrink-0">
        
        {/* Sidebar Header */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateTo("/")}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-sm font-bold">Support Inbox</h2>
              <p className="text-[10px] text-[var(--text-muted)]">File-based translation queries</p>
            </div>
          </div>
        </div>

        {/* Queries List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 chat-scroll">
          {loading && queries.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
            </div>
          ) : queries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <MessageSquare className="w-8 h-8 text-[var(--text-muted)] mb-2 opacity-35" />
              <p className="text-xs text-[var(--text-muted)]">No active queries found</p>
            </div>
          ) : (
            queries.map((q) => {
              const isActive = q.id === activeQueryId;
              const isClosed = q.status === "closed" || q.status === "resolved";

              return (
                <button
                  key={q.id}
                  onClick={() => setActiveQuery(q.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5
                    ${isActive 
                      ? "bg-[var(--accent-faint)] border-[var(--accent)]" 
                      : "bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]"
                    }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[12px] font-bold truncate max-w-[190px]">
                      {q.topic}
                    </span>
                    <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded border 
                      ${q.status === "open" 
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" 
                        : "bg-zinc-500/15 text-zinc-400 border-zinc-500/20"
                      }`}
                    >
                      {q.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5 truncate">
                    <span>{q.query_type === "segment" ? `Segment #${q.segment_index}` : "Whole File"}</span>
                    <span className="text-[var(--border-medium)]">•</span>
                    <span className="truncate">{q.document_name}</span>
                  </div>

                  {q.lastMessage && (
                    <div className="text-[11px] text-[var(--text-secondary)] truncate pt-1 border-t border-[var(--border-subtle)]/30">
                      <span className="font-semibold">{q.lastMessage.sender?.name || "User"}: </span>
                      {q.lastMessage.content}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Pane */}
      <div className="flex-1 flex flex-col bg-[var(--bg-surface)] min-w-0 h-full relative">
        {activeQuery ? (
          <>
            {/* Chat Pane Header */}
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] shrink-0 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  {activeQuery.topic}
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border 
                    ${activeQuery.status === "open" 
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" 
                      : "bg-zinc-500/15 text-zinc-400 border-zinc-500/20"
                    }`}
                  >
                    {activeQuery.status.toUpperCase()}
                  </span>
                </h2>
                <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2 mt-1">
                  <span>Scope: {activeQuery.query_type === "segment" ? `Segment #${activeQuery.segment_index}` : "Whole File"}</span>
                  <span>•</span>
                  <span>Document: {activeQuery.document_name}</span>
                  <span>•</span>
                  <span>Linguist: {activeQuery.linguist?.email}</span>
                </div>
              </div>

              {activeQuery.status === "open" && (
                <button
                  onClick={() => handleResolve("resolved")}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold text-rose-400 hover:text-rose-300 
                    bg-rose-500/10 border border-rose-500/20 transition-all cursor-pointer"
                >
                  Mark as Resolved
                </button>
              )}
            </div>

            {/* Scrollable messages area */}
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto px-6 py-4 space-y-3 chat-scroll bg-[var(--bg-surface)] min-h-0"
            >
              {messagesLoading && activeMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin" />
                </div>
              ) : (
                <>
                  {activeMessages.map((msg) => {
                    const isOwn = msg.sender_id === userId;
                    const isSystem = msg.content.startsWith("[System]");

                    if (isSystem) {
                      return (
                        <div key={msg.id} className="flex items-center justify-center my-4">
                          <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-3 py-1 rounded-full font-medium">
                            {msg.content.replace("[System] ", "")}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[70%] flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
                          
                          {/* Sender details */}
                          {!isOwn && (
                            <span className="text-[10px] font-bold text-[var(--text-muted)] mb-1 px-1.5">
                              {msg.sender?.name || "User"} ({msg.sender?.role || "linguist"})
                            </span>
                          )}

                          {/* Message bubble */}
                          <div className={`px-4 py-2.5 text-xs leading-relaxed rounded-2xl shadow-sm
                            ${isOwn 
                              ? "bg-gradient-to-br from-[var(--accent)] to-[color-mix(in_srgb,var(--accent),#000_20%)] text-white rounded-br-sm" 
                              : "bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-bl-sm"
                            }`}
                          >
                            {msg.attachment_url ? (
                              <div className="space-y-2">
                                {msg.attachment_type?.startsWith("image/") ? (
                                  <a href={getFileUrl(msg.attachment_url)} target="_blank" rel="noreferrer" className="block">
                                    <img 
                                      src={getFileUrl(msg.attachment_url)} 
                                      alt="Attachment" 
                                      className="max-w-[280px] rounded-lg max-h-[180px] object-cover hover:opacity-95 transition-opacity border border-white/5" 
                                    />
                                  </a>
                                ) : (
                                  <div className="flex items-center gap-2 px-3 py-2 rounded bg-black/10 border border-white/10">
                                    <FileText className="w-5 h-5 shrink-0" />
                                    <span className="text-[11px] truncate max-w-[180px]">{msg.attachment_name}</span>
                                  </div>
                                )}
                                <a 
                                  href={getFileUrl(msg.attachment_url)} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="text-[10px] font-semibold underline block hover:opacity-80 text-right mt-1"
                                  style={{ color: isOwn ? "white" : "var(--accent)" }}
                                >
                                  Download Attachment
                                </a>
                              </div>
                            ) : (
                              <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                            )}
                          </div>

                          {/* Message timestamp */}
                          <span className="text-[9px] mt-1 px-1.5 text-[var(--text-muted)]">
                            {formatMessageTime(msg.created_at)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* File attachment preview */}
            {imagePreview && (
              <div className="flex items-center gap-3 px-6 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] shrink-0 animate-[chatSlideUp_0.15s_ease-out]">
                <img src={imagePreview} alt="Preview" className="w-10 h-10 rounded object-cover border border-[var(--border-medium)]" />
                <span className="flex-1 text-[11px] text-[var(--text-secondary)] truncate">
                  {imageFile?.name}
                </span>
                <button
                  onClick={() => {
                    setImagePreview(null);
                    setImageFile(null);
                  }}
                  className="p-1 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Input form */}
            {activeQuery.status === "open" ? (
              <div className="flex items-end gap-3 px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0 mb-0.5"
                >
                  <Paperclip className="w-4.5 h-4.5" />
                </button>
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={messageInput}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your response..."
                  className="flex-1 resize-none rounded-xl px-4 py-2.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-subtle)]
                    text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                    focus:outline-none focus:border-[var(--border-focus)] transition-colors
                    max-h-32"
                  style={{ minHeight: "42px", height: "42px" }}
                />
                <button
                  onClick={handleSend}
                  disabled={!messageInput.trim() && !imageFile}
                  className="p-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-all cursor-pointer shrink-0 mb-0.5
                    disabled:opacity-30 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                >
                  <Send className="w-4.5 h-4.5" />
                </button>
              </div>
            ) : (
              <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 shrink-0 text-center flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)]">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <span>This query has been resolved/closed. No further responses are allowed.</span>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[var(--bg-surface)]">
            <MessageSquare className="w-12 h-12 text-[var(--text-muted)] mb-3 opacity-30 animate-pulse" />
            <h3 className="text-sm font-bold mb-1">Select a Support Query</h3>
            <p className="text-xs text-[var(--text-muted)] max-w-xs leading-relaxed">
              Choose a support query from the left sidebar to view the discussion, clarify translation context, or resolve open questions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
