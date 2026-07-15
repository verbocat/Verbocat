import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useChatStore } from "../../services/chatStore";
import { useUserStore } from "../../services/userStore";
import { searchChatUsers, addParticipants, removeParticipant, leaveGroup, updateGroup } from "../../services/chatApi";
import {
  ArrowLeft,
  Send,
  Paperclip,
  Search,
  X,
  MessageSquarePlus,
  Users,
  Reply,
  Copy,
  Trash2,
  ChevronDown,
  Loader2,
  MessageCircle,
  UserPlus,
  LogOut,
  Check,
  Image as ImageIcon,
  Maximize2
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────────
   HELPERS
   ──────────────────────────────────────────────────────────────────── */

const getFileUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  const baseUrl = import.meta.env.VITE_API_URL || window.location.origin;
  return `${baseUrl.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
};


const roleColors = {
  admin: "#f43f5e",
  verbolabs_staff: "#8b5cf6",
  linguist: "#22c55e",
};

const roleBadgeClass = {
  admin: "bg-rose-500/15 text-rose-400 border-rose-500/20",
  verbolabs_staff: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  linguist: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
};

const roleLabel = {
  admin: "Admin",
  verbolabs_staff: "Staff",
  linguist: "Linguist",
};

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name) {
  if (!name) return "#5b6af0";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    "#5b6af0", "#8b5cf6", "#ec4899", "#f43f5e",
    "#f97316", "#eab308", "#22c55e", "#14b8a6",
    "#06b6d4", "#3b82f6",
  ];
  return colors[Math.abs(hash) % colors.length];
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

function formatMessageTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function dateSeparatorLabel(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function needsDateSeparator(msg, prevMsg) {
  if (!prevMsg) return true;
  const d1 = new Date(msg.created_at).toDateString();
  const d2 = new Date(prevMsg.created_at).toDateString();
  return d1 !== d2;
}

function getOtherParticipant(conversation, currentUserId) {
  if (!conversation?.participants) return null;
  return conversation.participants.find((p) => p.user_id !== currentUserId) || conversation.participants[0];
}

function getConversationName(conversation, currentUserId) {
  if (conversation.type === "group") return conversation.name || "Group";
  const other = getOtherParticipant(conversation, currentUserId);
  return other?.user_name || other?.user_email?.split("@")[0] || "Chat";
}

function getConversationAvatar(conversation, currentUserId) {
  if (conversation.type === "group") return { name: conversation.name || "G", role: null };
  const other = getOtherParticipant(conversation, currentUserId);
  return { name: other?.user_name || other?.user_email || "?", role: other?.user_role };
}

function truncate(str, len = 40) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

/* ────────────────────────────────────────────────────────────────────
   SUB-COMPONENTS
   ──────────────────────────────────────────────────────────────────── */

/* Avatar */
function Avatar({ name, role, size = 40, online, className = "" }) {
  const bg = role ? roleColors[role] || getAvatarColor(name) : getAvatarColor(name);
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-full flex items-center justify-center text-white font-semibold select-none"
        style={{
          background: `linear-gradient(135deg, ${bg}, color-mix(in srgb, ${bg}, #000 25%))`,
          fontSize: size * 0.38,
        }}
      >
        {getInitials(name)}
      </div>
      {online && (
        <div
          className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[var(--bg-surface)]"
          style={{ boxShadow: "0 0 6px rgba(34,197,94,0.5)" }}
        />
      )}
    </div>
  );
}

/* Typing dots */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]"
          style={{
            animation: `chatBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* Image Lightbox */
function Lightbox({ src, onClose }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors z-[601] cursor-pointer"
      >
        <X className="w-6 h-6" />
      </button>
      <img
        src={src}
        alt="Preview"
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

/* Context menu */
function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    window.addEventListener("mousedown", handler);
    window.addEventListener("contextmenu", handler);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("contextmenu", handler);
    };
  }, [onClose]);

  // Adjust position so it doesn't overflow the panel
  const style = {
    position: "fixed",
    left: x,
    top: y,
    zIndex: 700,
  };

  return (
    <div
      ref={ref}
      className="bg-[var(--bg-elevated)] border border-[var(--border-medium)] rounded-xl shadow-2xl py-1 min-w-[140px] animate-[chatScaleIn_0.12s_ease]"
      style={style}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="h-px bg-[var(--border-subtle)] my-1" />
        ) : (
          <button
            key={i}
            onClick={() => { item.onClick(); onClose(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-colors ${
              item.danger
                ? "text-[var(--text-rose)] hover:bg-rose-500/10"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

/* Group Info View */
function GroupInfoView({ activeConv, userId, isStaff, goBack, onLeave }) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(activeConv.name || "");
  const [memberSearch, setMemberSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [submittingName, setSubmittingName] = useState(false);
  const fetchConversations = useChatStore((s) => s.fetchConversations);

  // Search for users to add
  useEffect(() => {
    if (!isStaff || !memberSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await searchChatUsers(memberSearch);
        const users = Array.isArray(results) ? results : results.users || [];
        // Filter out users who are already in the group
        const existingIds = new Set(activeConv.participants.map(p => p.id));
        setSearchResults(users.filter(u => !existingIds.has(u.id)));
      } catch {
        setSearchResults([]);
      }
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearch, isStaff, activeConv.participants]);

  const handleSaveName = async () => {
    if (!nameInput.trim() || nameInput.trim() === activeConv.name) {
      setEditingName(false);
      return;
    }
    setSubmittingName(true);
    try {
      await updateGroup(activeConv.id, nameInput.trim());
      setEditingName(false);
      fetchConversations();
    } catch (err) {
      console.error("Failed to rename group:", err);
    }
    setSubmittingName(false);
  };

  const handleAddMember = async (userToAdd) => {
    try {
      await addParticipants(activeConv.id, [userToAdd.id]);
      setMemberSearch("");
      setSearchResults([]);
      fetchConversations();
    } catch (err) {
      console.error("Failed to add member:", err);
    }
  };

  const handleRemoveMember = async (memberId) => {
    try {
      await removeParticipant(activeConv.id, memberId);
      fetchConversations();
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--border-subtle)]">
        <button
          onClick={goBack}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-sm font-bold text-[var(--text-primary)]">Group Details</h2>
      </div>

      <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-4">
        {/* Group Name Editing */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
            Group Name
          </label>
          {editingName && isStaff ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-xl text-xs bg-[var(--bg-elevated)] border border-[var(--border-focus)] text-[var(--text-primary)] focus:outline-none"
                disabled={submittingName}
              />
              <button
                onClick={handleSaveName}
                className="px-3 py-1.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold transition-all cursor-pointer"
                disabled={submittingName}
              >
                {submittingName ? "..." : "Save"}
              </button>
              <button
                onClick={() => { setEditingName(false); setNameInput(activeConv.name); }}
                className="px-3 py-1.5 rounded-xl bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs font-semibold transition-all cursor-pointer"
                disabled={submittingName}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                {activeConv.name}
              </span>
              {isStaff && (
                <button
                  onClick={() => setEditingName(true)}
                  className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)] font-bold cursor-pointer transition-colors"
                >
                  Rename
                </button>
              )}
            </div>
          )}
        </div>

        {/* Add Members Section (Staff Only) */}
        {isStaff && (
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
              Add Member
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search user by email or name..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-xl text-xs bg-[var(--bg-elevated)] border border-[var(--border-subtle)]
                  text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                  focus:outline-none focus:border-[var(--border-focus)] transition-colors"
              />
            </div>
            {/* Add results */}
            {memberSearch.trim() && (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden max-h-32 overflow-y-auto chat-scroll divide-y divide-[var(--border-subtle)]">
                {searchLoading ? (
                  <div className="flex justify-center p-3">
                    <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin" />
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-3 text-center text-[10px] text-[var(--text-muted)]">
                    No users found or already added
                  </div>
                ) : (
                  searchResults.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-2 hover:bg-[var(--bg-hover)]">
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="text-[11px] font-semibold text-[var(--text-primary)] truncate">{u.name || u.email?.split("@")[0]}</p>
                        <p className="text-[9px] text-[var(--text-muted)] truncate">{u.email}</p>
                      </div>
                      <button
                        onClick={() => handleAddMember(u)}
                        className="px-2.5 py-1 rounded-lg bg-[var(--accent)] text-white text-[10px] font-bold cursor-pointer hover:bg-[var(--accent-hover)] transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Member List */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
            Members ({activeConv.participants?.length || 0})
          </label>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] divide-y divide-[var(--border-subtle)]">
            {activeConv.participants?.map((member) => (
              <div key={member.id} className="flex items-center gap-2.5 p-2.5">
                <Avatar name={member.user_name || member.user_email} role={member.user_role} size={30} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
                    {member.user_name || member.user_email?.split("@")[0]}
                  </p>
                  <p className="text-[9px] text-[var(--text-muted)] truncate">{member.user_email}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {member.user_role && (
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${roleBadgeClass[member.user_role] || ""}`}>
                      {roleLabel[member.user_role] || member.user_role}
                    </span>
                  )}
                  {isStaff && member.id !== userId && (
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="p-1 rounded hover:bg-rose-500/10 text-[var(--text-rose)] transition-colors cursor-pointer"
                      title="Remove Member"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer / Leave group */}
      <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <button
          onClick={() => {
            if (confirm("Are you sure you want to leave this group?")) {
              onLeave();
            }
          }}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white transition-all cursor-pointer border border-rose-500/20"
        >
          <LogOut className="w-4 h-4" />
          Leave Group
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   MAIN PANEL
   ──────────────────────────────────────────────────────────────────── */

export function ChatPanel({ chatSocketRef, panelPosition }) {
  const user = useUserStore((s) => s.user);
  const userId = user?.id;
  const userRole = user?.role;
  const isStaff = userRole === "admin" || userRole === "verbolabs_staff";

  const {
    conversations,
    activeConversationId,
    messages,
    unreadCounts,
    totalUnread,
    typingUsers,
    view,
    loading,
    messagesLoading,
    hasMore,
    onlineUsers,
    setView,
    setActiveConversation,
    fetchMessages,
    sendMessage,
    uploadFile,
    unsendMessage,
    markAsRead,
    createDirectChat,
    createGroup,
    goBack,
  } = useChatStore();

  /* ── Conversation list state ──────────── */
  const [searchFilter, setSearchFilter] = useState("");

  /* ── Chat room state ──────────────────── */
  const [messageInput, setMessageInput] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isAtBottomRef = useRef(true);

  /* ── New chat state ───────────────────── */
  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  /* ── New group state ──────────────────── */
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [groupUserSearch, setGroupUserSearch] = useState("");
  const [groupSearchResults, setGroupSearchResults] = useState([]);
  const [groupSearchLoading, setGroupSearchLoading] = useState(false);

  /* ── Active conversation ──────────────── */
  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [conversations, activeConversationId]
  );
  const activeMessages = messages[activeConversationId] || [];
  const activeTyping = typingUsers[activeConversationId] || [];

  /* ── Filtered conversations ───────────── */
  const filteredConversations = useMemo(() => {
    if (!searchFilter.trim()) return conversations;
    const q = searchFilter.toLowerCase();
    return conversations.filter((c) => {
      const name = getConversationName(c, userId)?.toLowerCase() || "";
      return name.includes(q);
    });
  }, [conversations, searchFilter, userId]);

  /* ── Auto-scroll messages ─────────────── */
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "instant",
    });
  }, []);

  useEffect(() => {
    if (isAtBottomRef.current && view === "chat") {
      // small delay to ensure DOM has rendered
      requestAnimationFrame(() => scrollToBottom(false));
    }
  }, [activeMessages.length, scrollToBottom, view]);

  // After initial message load, scroll to bottom
  useEffect(() => {
    if (view === "chat" && activeMessages.length > 0) {
      setTimeout(() => scrollToBottom(false), 50);
    }
  }, [activeConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const atBottom = scrollHeight - scrollTop - clientHeight < 60;
    isAtBottomRef.current = atBottom;
    setShowScrollBtn(!atBottom);

    // Load older messages when scrolled to top
    if (scrollTop < 40 && hasMore[activeConversationId] && !messagesLoading) {
      const oldest = activeMessages[0];
      if (oldest) {
        const prevHeight = scrollHeight;
        fetchMessages(activeConversationId, oldest.id).then(() => {
          // Preserve scroll position after prepending
          requestAnimationFrame(() => {
            if (el) {
              el.scrollTop = el.scrollHeight - prevHeight;
            }
          });
        });
      }
    }
  }, [activeConversationId, activeMessages, hasMore, messagesLoading, fetchMessages]);

  /* ── Sending messages ─────────────────── */
  const handleSend = useCallback(async () => {
    if (imageFile) {
      await uploadFile(activeConversationId, imageFile);
      setImagePreview(null);
      setImageFile(null);
      setReplyTo(null);
      return;
    }
    const text = messageInput.trim();
    if (!text) return;
    await sendMessage(activeConversationId, text, replyTo?.id || null);
    setMessageInput("");
    setReplyTo(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    // Emit stop-typing
    if (chatSocketRef?.current) {
      chatSocketRef.current.emit("chat:stop-typing", {
        conversationId: activeConversationId,
      });
    }
  }, [messageInput, activeConversationId, replyTo, imageFile, sendMessage, uploadFile, chatSocketRef]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  /* ── Typing indicator ─────────────────── */
  const handleInputChange = useCallback(
    (e) => {
      setMessageInput(e.target.value);
      // Auto-resize
      const ta = e.target;
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 96) + "px";

      // Emit typing
      if (chatSocketRef?.current && activeConversationId) {
        chatSocketRef.current.emit("chat:typing", {
          conversationId: activeConversationId,
        });
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          chatSocketRef.current?.emit("chat:stop-typing", {
            conversationId: activeConversationId,
          });
        }, 2000);
      }
    },
    [chatSocketRef, activeConversationId]
  );

  /* ── File picker ──────────────────────── */
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  }, []);

  /* ── User search (new chat) ───────────── */
  useEffect(() => {
    if (view !== "new") return;
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await searchChatUsers(userSearch);
        setSearchResults(Array.isArray(results) ? results : results.users || []);
      } catch { setSearchResults([]); }
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, view]);

  /* ── Group user search ────────────────── */
  useEffect(() => {
    if (view !== "new-group") return;
    const timer = setTimeout(async () => {
      setGroupSearchLoading(true);
      try {
        const results = await searchChatUsers(groupUserSearch);
        setGroupSearchResults(Array.isArray(results) ? results : results.users || []);
      } catch { setGroupSearchResults([]); }
      setGroupSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [groupUserSearch, view]);

  /* ── Context menu actions ─────────────── */
  const handleContextMenu = useCallback(
    (e, msg) => {
      e.preventDefault();
      const items = [];

      if (!msg.is_unsent) {
        items.push({
          label: "Reply",
          icon: <Reply className="w-3.5 h-3.5" />,
          onClick: () => setReplyTo(msg),
        });
        items.push({
          label: "Copy",
          icon: <Copy className="w-3.5 h-3.5" />,
          onClick: () => navigator.clipboard.writeText(msg.content || ""),
        });
      }

      if (msg.sender_id === userId && !msg.is_unsent) {
        items.push({ separator: true });
        items.push({
          label: "Unsend",
          icon: <Trash2 className="w-3.5 h-3.5" />,
          danger: true,
          onClick: () => unsendMessage(msg.id, activeConversationId),
        });
      }

      if (items.length > 0) {
        setContextMenu({ x: e.clientX, y: e.clientY, items });
      }
    },
    [userId, activeConversationId, unsendMessage]
  );

  /* ── Handle new direct chat click ────── */
  const handleStartDirectChat = useCallback(
    async (targetUser) => {
      try {
        await createDirectChat(targetUser.id);
      } catch (err) {
        console.error("Failed to start direct chat:", err);
      }
    },
    [createDirectChat]
  );

  /* ── Handle create group ──────────────── */
  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    try {
      await createGroup(
        groupName.trim(),
        selectedMembers.map((m) => m.id)
      );
      setGroupName("");
      setSelectedMembers([]);
      setGroupUserSearch("");
    } catch (err) {
      console.error("Failed to create group:", err);
    }
  }, [groupName, selectedMembers, createGroup]);

  /* ── Reset state on view change ───────── */
  useEffect(() => {
    if (view === "list") {
      setSearchFilter("");
    } else if (view === "new") {
      setUserSearch("");
      setSearchResults([]);
    } else if (view === "new-group") {
      setGroupName("");
      setSelectedMembers([]);
      setGroupUserSearch("");
      setGroupSearchResults([]);
    } else if (view === "chat") {
      setMessageInput("");
      setReplyTo(null);
      setImagePreview(null);
      setImageFile(null);
      setContextMenu(null);
    }
  }, [view]);

  /* ── Compute panel position ───────────── */
  const panelStyle = useMemo(() => {
    const bubble = panelPosition || { x: window.innerWidth - 80, y: window.innerHeight - 80 };
    // Position panel to the left/above the bubble
    let left = bubble.x - 390;
    let top = bubble.y - 530;

    // Clamp to viewport
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    if (left + 380 > window.innerWidth - 8) left = window.innerWidth - 388;
    if (top + 520 > window.innerHeight - 8) top = window.innerHeight - 528;

    return { left, top };
  }, [panelPosition]);

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════ */
  return (
    <>
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      <div
        className="fixed z-[500] w-[380px] h-[520px] max-sm:w-full max-sm:h-full max-sm:inset-0 max-sm:rounded-none
          flex flex-col rounded-2xl overflow-hidden
          bg-[var(--bg-surface)]/95 backdrop-blur-xl
          border border-[var(--border-medium)]
          shadow-[0_25px_60px_rgba(0,0,0,0.4),0_8px_20px_rgba(0,0,0,0.2)]
          animate-[chatPanelIn_0.25s_ease]"
        style={{
          left: panelStyle.left,
          top: panelStyle.top,
        }}
      >
        {/* ── CONVERSATION LIST VIEW ──────────────── */}
        {view === "list" && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
              <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">Messages</h2>
              <div className="flex items-center gap-1">
                {isStaff && (
                  <button
                    onClick={() => setView("new-group")}
                    className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    title="New Group"
                  >
                    <Users className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setView("new")}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                  title="New Chat"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search conversations…"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-xs bg-[var(--bg-elevated)] border border-[var(--border-subtle)]
                    text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                    focus:outline-none focus:border-[var(--border-focus)] transition-colors"
                />
              </div>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto chat-scroll">
              {loading && conversations.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--accent-faint)] flex items-center justify-center mb-3">
                    <MessageCircle className="w-6 h-6 text-[var(--accent)]" />
                  </div>
                  <p className="text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {searchFilter ? "No conversations found" : "No messages yet"}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {searchFilter ? "Try a different search" : "Start a conversation to begin chatting"}
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const name = getConversationName(conv, userId);
                  const avatar = getConversationAvatar(conv, userId);
                  const other = getOtherParticipant(conv, userId);
                  const isOnline = other && onlineUsers.has(other.user_id);
                  const unread = unreadCounts[conv.id] || 0;
                  const lastMsg = conv.last_message;
                  let preview = "";
                  if (lastMsg) {
                    if (lastMsg.is_unsent) preview = "Message unsent";
                    else if (lastMsg.file_url) preview = "📎 Image";
                    else preview = lastMsg.content || "";
                  }

                  return (
                    <button
                      key={conv.id}
                      onClick={() => setActiveConversation(conv.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group text-left"
                    >
                      <Avatar
                        name={avatar.name}
                        role={avatar.role}
                        size={42}
                        online={conv.type === "direct" && isOnline}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                            {name}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] shrink-0 ml-2">
                            {relativeTime(conv.updated_at || lastMsg?.created_at)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p
                            className={`text-[11px] truncate ${
                              lastMsg?.is_unsent ? "italic text-[var(--text-muted)]" : "text-[var(--text-secondary)]"
                            }`}
                          >
                            {truncate(preview, 38)}
                          </p>
                          {unread > 0 && (
                            <span className="ml-2 shrink-0 min-w-[18px] h-[18px] rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center px-1 animate-[chatPulse_2s_ease_infinite]">
                              {unread > 99 ? "99+" : unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* ── CHAT ROOM VIEW ─────────────────────── */}
        {view === "chat" && activeConv && (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--border-subtle)]">
              <button
                onClick={goBack}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <Avatar
                name={getConversationAvatar(activeConv, userId).name}
                role={getConversationAvatar(activeConv, userId).role}
                size={32}
                online={
                  activeConv.type === "direct" &&
                  onlineUsers.has(getOtherParticipant(activeConv, userId)?.user_id)
                }
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate leading-tight">
                  {getConversationName(activeConv, userId)}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] leading-tight">
                  {activeConv.type === "group"
                    ? `${activeConv.participants?.length || 0} members`
                    : onlineUsers.has(getOtherParticipant(activeConv, userId)?.user_id)
                    ? "Online"
                    : "Offline"}
                </p>
              </div>
              <button
                onClick={() => {
                  window.history.pushState({}, "", "/chat");
                  window.dispatchEvent(new PopStateEvent("popstate"));
                  // Close the floating widget
                  useChatStore.getState().setOpen(false);
                }}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                title="Expand to Fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              {activeConv.type === "group" && (
                <button
                  onClick={() => setView("group-info")}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  title="Group Info"
                >
                  <Users className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Messages */}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-3 py-2 chat-scroll"
            >
              {messagesLoading && activeMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
                </div>
              ) : activeMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="w-10 h-10 rounded-2xl bg-[var(--accent-faint)] flex items-center justify-center mb-3">
                    <Send className="w-5 h-5 text-[var(--accent)]" />
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    No messages yet. Say hello! 👋
                  </p>
                </div>
              ) : (
                <>
                  {messagesLoading && (
                    <div className="flex justify-center py-2">
                      <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin" />
                    </div>
                  )}
                  {activeMessages.map((msg, i) => {
                    const prev = activeMessages[i - 1];
                    const isOwn = msg.sender_id === userId;
                    const showDateSep = needsDateSeparator(msg, prev);
                    const showSender =
                      activeConv.type === "group" &&
                      !isOwn &&
                      (!prev || prev.sender_id !== msg.sender_id || showDateSep);
                    const replyMsg = msg.reply_to_id
                      ? (activeMessages.find((m) => m.id === msg.reply_to_id) || msg.replyToMessage)
                      : null;

                    return (
                      <div key={msg.id}>
                        {showDateSep && (
                          <div className="flex items-center justify-center my-3">
                            <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-elevated)] px-3 py-1 rounded-full font-medium">
                              {dateSeparatorLabel(msg.created_at)}
                            </span>
                          </div>
                        )}
                        <div
                          className={`flex mb-1 ${isOwn ? "justify-end" : "justify-start"}`}
                          onContextMenu={(e) => handleContextMenu(e, msg)}
                        >
                          <div className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                            {showSender && (
                              <span className="text-[10px] font-medium text-[var(--text-muted)] mb-0.5 px-2">
                                {msg.sender_name || msg.sender_email?.split("@")[0] || "User"}
                              </span>
                            )}

                            {/* Reply preview */}
                            {replyMsg && !msg.is_unsent && (
                              <div
                                className={`text-[10px] px-2.5 py-1.5 mb-0.5 rounded-lg border-l-2 ${
                                  isOwn
                                    ? "bg-white/10 border-white/30 text-white/70"
                                    : "bg-[var(--bg-hover)] border-[var(--accent)] text-[var(--text-muted)]"
                                }`}
                              >
                                <span className="font-medium">
                                  {replyMsg.sender_name || replyMsg.sender_email?.split("@")[0]}
                                </span>
                                <p className="truncate opacity-80">
                                  {replyMsg.is_unsent ? "Message unsent" : truncate(replyMsg.content || "📎 Image", 50)}
                                </p>
                              </div>
                            )}

                            {/* Message bubble */}
                            <div
                              className={`group/msg relative px-3 py-2 text-[12.5px] leading-relaxed
                                ${
                                  msg.is_unsent
                                    ? "italic text-[var(--text-muted)] text-[11px]"
                                    : isOwn
                                    ? "text-white rounded-2xl rounded-br-sm"
                                    : "text-[var(--text-primary)] rounded-2xl rounded-bl-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                                }
                                ${
                                  msg.is_unsent
                                    ? ""
                                    : isOwn
                                    ? "bg-gradient-to-br from-[var(--accent)] to-[color-mix(in_srgb,var(--accent),#000_25%)]"
                                    : ""
                                }
                                transition-shadow hover:shadow-md
                              `}
                            >
                              {msg.is_unsent ? (
                                <span className="opacity-60">This message was unsent</span>
                              ) : msg.file_url ? (
                                <img
                                  src={getFileUrl(msg.file_url)}
                                  alt="Shared image"
                                  className="max-w-[240px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => setLightboxSrc(getFileUrl(msg.file_url))}
                                  loading="lazy"
                                />
                              ) : (
                                <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                              )}
                            </div>

                            {/* Timestamp */}
                            <span
                              className={`text-[9px] mt-0.5 px-1 ${
                                isOwn ? "text-right text-[var(--text-muted)]" : "text-[var(--text-muted)]"
                              }`}
                            >
                              {formatMessageTime(msg.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Typing indicator */}
                  {activeTyping.length > 0 && (
                    <div className="flex items-center gap-2 py-1 pl-1">
                      <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-2xl rounded-bl-sm">
                        <TypingIndicator />
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {activeTyping.map((t) => t.userName).join(", ")}
                      </span>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Scroll-to-bottom */}
            {showScrollBtn && (
              <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2 z-10">
                <button
                  onClick={() => scrollToBottom()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-medium)]
                    text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] shadow-lg transition-all cursor-pointer
                    hover:bg-[var(--bg-hover)]"
                >
                  <ChevronDown className="w-3 h-3" />
                  New messages
                </button>
              </div>
            )}

            {/* Reply preview */}
            {replyTo && (
              <div className="flex items-center gap-2 px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50">
                <Reply className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-[var(--accent)]">
                    Replying to {replyTo.sender_name || replyTo.sender_email?.split("@")[0]}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">
                    {truncate(replyTo.content || "📎 Image", 50)}
                  </p>
                </div>
                <button
                  onClick={() => setReplyTo(null)}
                  className="p-1 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Image preview */}
            {imagePreview && (
              <div className="flex items-center gap-2 px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50">
                <img src={imagePreview} alt="Preview" className="w-12 h-12 rounded-lg object-cover" />
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
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Input area */}
            <div className="flex items-end gap-2 px-3 py-2.5 border-t border-[var(--border-subtle)]">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0 mb-0.5"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <textarea
                ref={textareaRef}
                rows={1}
                value={messageInput}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                className="flex-1 resize-none rounded-xl px-3 py-2 text-xs bg-[var(--bg-elevated)] border border-[var(--border-subtle)]
                  text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                  focus:outline-none focus:border-[var(--border-focus)] transition-colors
                  max-h-24"
                style={{ minHeight: "36px" }}
              />
              <button
                onClick={handleSend}
                disabled={!messageInput.trim() && !imageFile}
                className="p-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-all cursor-pointer shrink-0 mb-0.5
                  disabled:opacity-30 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* ── GROUP INFO VIEW ─────────────────────── */}
        {view === "group-info" && activeConv && (
          <GroupInfoView
            activeConv={activeConv}
            userId={userId}
            isStaff={isStaff}
            goBack={() => setView("chat")}
            onLeave={async () => {
              try {
                await leaveGroup(activeConv.id);
                goBack();
              } catch (err) {
                console.error("Failed to leave group:", err);
              }
            }}
          />
        )}

        {/* ── NEW CHAT VIEW ──────────────────────── */}
        {view === "new" && (
          <>
            <div className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--border-subtle)]">
              <button
                onClick={goBack}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">New Chat</h2>
            </div>

            <div className="px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  autoFocus
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-xs bg-[var(--bg-elevated)] border border-[var(--border-subtle)]
                    text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                    focus:outline-none focus:border-[var(--border-focus)] transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto chat-scroll">
              {searchLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
                </div>
              ) : !userSearch.trim() ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <Search className="w-8 h-8 text-[var(--text-muted)] mb-2 opacity-40" />
                  <p className="text-xs text-[var(--text-muted)]">Search for a user to start chatting</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                  <p className="text-xs text-[var(--text-muted)]">No users found</p>
                </div>
              ) : (
                searchResults
                  .filter((u) => u.id !== userId)
                  .map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleStartDirectChat(u)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer text-left"
                    >
                      <Avatar name={u.name || u.email} role={u.role} size={38} online={onlineUsers.has(u.id)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                          {u.name || u.email?.split("@")[0]}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] truncate">{u.email}</p>
                      </div>
                      {u.role && (
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${roleBadgeClass[u.role] || ""}`}
                        >
                          {roleLabel[u.role] || u.role}
                        </span>
                      )}
                    </button>
                  ))
              )}
            </div>
          </>
        )}

        {/* ── NEW GROUP VIEW ─────────────────────── */}
        {view === "new-group" && (
          <>
            <div className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--border-subtle)]">
              <button
                onClick={goBack}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">New Group</h2>
            </div>

            <div className="px-3 pt-2 space-y-2">
              {/* Group name */}
              <input
                type="text"
                placeholder="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 rounded-xl text-xs bg-[var(--bg-elevated)] border border-[var(--border-subtle)]
                  text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                  focus:outline-none focus:border-[var(--border-focus)] transition-colors"
              />

              {/* Selected members chips */}
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {selectedMembers.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--accent-glow)] text-[var(--text-accent)] text-[10px] font-medium border border-[var(--accent)]/20"
                    >
                      {m.name || m.email?.split("@")[0]}
                      <button
                        onClick={() => setSelectedMembers((prev) => prev.filter((p) => p.id !== m.id))}
                        className="hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search users to add…"
                  value={groupUserSearch}
                  onChange={(e) => setGroupUserSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-xs bg-[var(--bg-elevated)] border border-[var(--border-subtle)]
                    text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                    focus:outline-none focus:border-[var(--border-focus)] transition-colors"
                />
              </div>
            </div>

            {/* Search results */}
            <div className="flex-1 overflow-y-auto chat-scroll px-1">
              {groupSearchLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
                </div>
              ) : (
                groupSearchResults
                  .filter((u) => u.id !== userId)
                  .map((u) => {
                    const isSelected = selectedMembers.some((m) => m.id === u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedMembers((prev) => prev.filter((p) => p.id !== u.id));
                          } else {
                            setSelectedMembers((prev) => [...prev, u]);
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left
                          ${isSelected ? "bg-[var(--accent-faint)]" : "hover:bg-[var(--bg-hover)]"}`}
                      >
                        <Avatar name={u.name || u.email} role={u.role} size={34} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                            {u.name || u.email?.split("@")[0]}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)] truncate">{u.email}</p>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all
                            ${
                              isSelected
                                ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                                : "border-[var(--border-medium)] text-transparent"
                            }`}
                        >
                          <Check className="w-3 h-3" />
                        </div>
                      </button>
                    );
                  })
              )}
            </div>

            {/* Create button */}
            <div className="px-3 py-2.5 border-t border-[var(--border-subtle)]">
              <button
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || selectedMembers.length === 0}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white
                  transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                Create Group ({selectedMembers.length} member{selectedMembers.length !== 1 ? "s" : ""})
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
