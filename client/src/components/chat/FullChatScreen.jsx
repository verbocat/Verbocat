import React, { useState, useEffect, useRef } from "react";
import { useChatStore } from "../../services/chatStore.js";
import {
  Send, Paperclip, Smile, MoreHorizontal, Reply, MessageSquare,
  Pin, Share2, Edit2, Trash2, Download, Search, Users, Settings,
  Plus, X, ChevronRight, ArrowLeft, FileText, Check, CheckCheck,
  User, Hash, Star, Info, MessageCircle, AlertCircle
} from "lucide-react";
function relativeTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const FullChatScreen = ({ user, chatSocketRef, navigateTo, theme }) => {
  const {
    conversations,
    activeConversationId,
    messages,
    unreadCounts,
    typingUsers,
    onlineUsers,
    threadMessages,
    activeThreadParentId,
    setActiveConversation,
    sendMessage,
    uploadChatFile,
    unsendMessage,
    editMessage,
    togglePin,
    toggleReaction,
    forwardMessage,
    fetchThreadReplies,
    sendThreadMessage,
    uploadThreadFile,
    setActiveThreadParentId,
    createConversation,
    createGroupConversation,
    addParticipants,
    removeParticipant,
    leaveGroup
  } = useChatStore();

  const userId = user?.id;
  const isStaff = ["admin", "verbolabs_staff"].includes(user?.role);

  // View States
  const [searchTerm, setSearchTerm] = useState("");
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [showPinsOnly, setShowPinsOnly] = useState(false);
  
  // Right sidebar content toggle: "info" | "thread" | null
  const [rightSidebar, setRightSidebar] = useState(null);
  
  // Input states
  const [textInput, setTextInput] = useState("");
  const [threadTextInput, setThreadTextInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedThreadFile, setSelectedThreadFile] = useState(null);
  const [replyToMsg, setReplyToMsg] = useState(null);
  
  // Modals & Popups
  const [activeMenuMsgId, setActiveMenuMsgId] = useState(null);
  const [showEmojiPickerId, setShowEmojiPickerId] = useState(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatType, setNewChatType] = useState("direct"); // "direct" | "group"
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [allUsersList, setAllUsersList] = useState([]);
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editText, setEditText] = useState("");

  // Mention autocomplete popup
  const [mentionSearch, setMentionSearch] = useState(null); // string query or null
  const [mentionAnchorIndex, setMentionAnchorIndex] = useState(-1);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  // Refs
  const messageEndRef = useRef(null);
  const threadEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const threadFileInputRef = useRef(null);
  const searchInputRef = useRef(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const activeMessages = messages[activeConversationId] || [];
  const activeThreadReplies = activeThreadParentId ? (threadMessages[activeThreadParentId] || []) : [];
  const activeThreadParent = activeMessages.find(m => m.id === activeThreadParentId) || 
    Object.values(messages).flat().find(m => m.id === activeThreadParentId);

  // Auto-scroll messages list on update
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages.length, activeConversationId]);

  // Auto-scroll thread list on update
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeThreadReplies.length, activeThreadParentId]);

  // Load all users list for new chats & DMs
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await fetch("/api/chat/users", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
        const data = await res.json();
        // filter out current user
        setAllUsersList(data.filter(u => u.id !== userId));
      } catch (err) {
        console.error("Failed to load users list:", err);
      }
    };
    if (userId) loadUsers();
  }, [userId]);

  // Fetch thread replies when thread opens
  useEffect(() => {
    if (activeThreadParentId) {
      fetchThreadReplies(activeThreadParentId);
      setRightSidebar("thread");
    }
  }, [activeThreadParentId]);

  // Send message typing status via socket
  const handleTyping = (text) => {
    setTextInput(text);
    const socket = useChatStore.getState().socket;
    if (!socket || !activeConversationId) return;

    if (text.trim().length > 0) {
      socket.emit("chat:typing", { conversationId: activeConversationId });
    } else {
      socket.emit("chat:stop-typing", { conversationId: activeConversationId });
    }

    // Check for mentions
    const lastCharIndex = text.lastIndexOf("@");
    if (lastCharIndex !== -1 && lastCharIndex >= text.length - 15) {
      const query = text.slice(lastCharIndex + 1);
      if (!query.includes(" ")) {
        setMentionSearch(query);
        setMentionAnchorIndex(lastCharIndex);
        // filter suggestions based on participants
        const participants = activeConv?.participants || [];
        const filtered = participants.filter(p => 
          (p.name || p.email).toLowerCase().includes(query.toLowerCase()) && p.user_id !== userId
        );
        setMentionSuggestions(filtered);
        setSelectedMentionIndex(0);
        return;
      }
    }
    setMentionSearch(null);
  };

  const handleMentionSelect = (participant) => {
    if (mentionAnchorIndex === -1) return;
    const name = participant.name || participant.email.split("@")[0];
    const before = textInput.slice(0, mentionAnchorIndex);
    const after = textInput.slice(mentionAnchorIndex + mentionSearch.length + 1);
    setTextInput(`${before}@${name} ${after}`);
    setMentionSearch(null);
  };

  // Helper to prepend backend API url for images/files
  const getFileUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
    return `${apiUrl}${url}`;
  };

  const handleSend = async () => {
    if (!textInput.trim() && !selectedFile) return;

    try {
      if (selectedFile) {
        await uploadChatFile(activeConversationId, selectedFile, replyToMsg?.id);
        setSelectedFile(null);
      } else {
        await sendMessage(activeConversationId, textInput, replyToMsg?.id);
      }
      setTextInput("");
      setReplyToMsg(null);
      
      const socket = useChatStore.getState().socket;
      if (socket) {
        socket.emit("chat:stop-typing", { conversationId: activeConversationId });
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  const handleSendThreadReply = async () => {
    if (!threadTextInput.trim() && !selectedThreadFile) return;

    try {
      if (selectedThreadFile) {
        await uploadThreadFile(activeConversationId, activeThreadParentId, selectedThreadFile);
        setSelectedThreadFile(null);
      } else {
        await sendThreadMessage(activeConversationId, activeThreadParentId, threadTextInput);
      }
      setThreadTextInput("");
    } catch (err) {
      console.error("Failed to send thread reply:", err);
    }
  };

  const handleCreateChat = async () => {
    if (selectedUsers.length === 0) return;

    try {
      if (newChatType === "direct") {
        const targetUserId = selectedUsers[0];
        const conv = await createConversation(targetUserId);
        setActiveConversation(conv.id);
      } else {
        if (!newGroupName.trim()) return;
        const conv = await createGroupConversation(newGroupName.trim(), selectedUsers);
        setActiveConversation(conv.id);
      }
      setShowNewChatModal(false);
      setSelectedUsers([]);
      setNewGroupName("");
    } catch (err) {
      console.error("Failed to initialize conversation:", err);
    }
  };

  // Format message text to support bold and styling
  const renderMessageContent = (content) => {
    if (!content) return null;
    
    // Simple parser for @mentions and formatting
    const parts = content.split(/(\s+)/);
    return parts.map((part, idx) => {
      if (part.startsWith("@")) {
        return (
          <span key={idx} className="font-semibold text-blue-400 bg-blue-500/10 px-1 rounded">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const startEdit = (msg) => {
    setEditingMsgId(msg.id);
    setEditText(msg.content || "");
    setActiveMenuMsgId(null);
  };

  const saveEdit = async () => {
    if (!editText.trim()) return;
    try {
      await editMessage(editingMsgId, editText);
      setEditingMsgId(null);
      setEditText("");
    } catch (err) {
      console.error("Edit failed:", err);
    }
  };

  const performUnsend = async (msgId) => {
    if (confirm("Are you sure you want to delete/unsend this message?")) {
      try {
        await unsendMessage(msgId);
        setActiveMenuMsgId(null);
      } catch (err) {
        console.error("Failed to delete message:", err);
      }
    }
  };

  const handleReact = async (msgId, emoji) => {
    try {
      await toggleReaction(msgId, emoji);
      setShowEmojiPickerId(null);
    } catch (err) {
      console.error("Reaction toggle failed:", err);
    }
  };

  const initiateForward = (msg) => {
    setForwardMsg(msg);
    setShowForwardModal(true);
    setActiveMenuMsgId(null);
  };

  const triggerForward = async (targetConvId) => {
    try {
      await forwardMessage(forwardMsg.id, targetConvId);
      setShowForwardModal(false);
      setForwardMsg(null);
      setActiveConversation(targetConvId);
    } catch (err) {
      console.error("Forwarding failed:", err);
    }
  };

  // Filters messages based on search query or pins toggle
  const filteredMessages = activeMessages.filter(m => {
    if (showPinsOnly && !m.is_pinned) return false;
    if (messageSearchQuery.trim()) {
      return m.content?.toLowerCase().includes(messageSearchQuery.toLowerCase());
    }
    return true;
  });

  return (
    <div className="w-full h-[calc(100vh-50px)] flex bg-[var(--bg-main)] text-[var(--text-primary)] font-sans relative overflow-hidden">
      
      {/* ── LEFT SIDEBAR ─────────────────────────────────── */}
      <div className="w-80 flex flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-card)]/50 backdrop-blur-md shrink-0">
        
        {/* Workspace Title & Search */}
        <div className="p-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-bold bg-gradient-to-r from-[var(--accent)] to-purple-400 bg-clip-text text-transparent flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-[var(--accent)]" />
              VerboChat Workspace
            </h1>
            {isStaff && (
              <button 
                onClick={() => { setShowNewChatModal(true); setNewChatType("direct"); }}
                className="p-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors cursor-pointer"
                title="New Chat / Group"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
          
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs focus:outline-none focus:border-[var(--border-focus)] transition-colors"
            />
          </div>
        </div>

        {/* Chat Lists */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          
          {/* Groups list */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text-muted)] px-3 mb-1 uppercase tracking-wider">
              <span>Groups ({conversations.filter(c => c.type === "group").length})</span>
              {isStaff && (
                <button 
                  onClick={() => { setShowNewChatModal(true); setNewChatType("group"); }}
                  className="hover:text-[var(--accent)] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            
            <div className="space-y-0.5">
              {conversations
                .filter(c => c.type === "group" && c.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .map(c => {
                  const isActive = c.id === activeConversationId;
                  const unread = unreadCounts[c.id] || 0;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveConversation(c.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                        isActive 
                          ? "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/25 font-semibold" 
                          : "hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Hash className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-[var(--text-muted)]"}`} />
                        <span className="truncate">{c.name}</span>
                      </div>
                      {unread > 0 && (
                        <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                          {unread}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Direct Messages */}
          <div>
            <div className="text-[11px] font-bold text-[var(--text-muted)] px-3 mb-1 uppercase tracking-wider">
              Direct Messages
            </div>
            
            <div className="space-y-0.5">
              {conversations
                .filter(c => c.type === "direct")
                .map(c => {
                  // find target member details
                  const targetMember = c.participants?.find(p => p.user_id !== userId);
                  const isOnline = targetMember ? onlineUsers.has(targetMember.user_id) : false;
                  const displayName = targetMember?.name || targetMember?.email?.split("@")[0] || "Unknown User";
                  const isActive = c.id === activeConversationId;
                  const unread = unreadCounts[c.id] || 0;

                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveConversation(c.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                        isActive 
                          ? "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/25 font-semibold" 
                          : "hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div className="relative shrink-0">
                          <div className={`w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white uppercase`}>
                            {displayName.substring(0, 2)}
                          </div>
                          <div className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border-2 ${
                            isActive ? "border-[var(--accent)]" : "border-[var(--bg-card)]"
                          } ${isOnline ? "bg-green-500" : "bg-gray-400"}`} />
                        </div>
                        <div className="flex flex-col text-left truncate">
                          <span className="truncate">{displayName}</span>
                          {targetMember?.last_seen_at && !isOnline && (
                            <span className="text-[9px] opacity-70 truncate">
                              seen {relativeTime(targetMember.last_seen_at)}
                            </span>
                          )}
                        </div>
                      </div>
                      {unread > 0 && (
                        <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                          {unread}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

        </div>

        {/* User footer info */}
        <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent)] to-pink-500 flex items-center justify-center font-bold text-white text-xs uppercase shrink-0">
              {user?.email?.substring(0, 2)}
            </div>
            <div className="flex flex-col text-left min-w-0">
              <span className="text-xs font-semibold truncate">{user?.email?.split("@")[0]}</span>
              <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">{user?.role?.replace("_", " ")}</span>
            </div>
          </div>
          <button 
            onClick={() => navigateTo("/")}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer"
            title="Go to Project Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── MIDDLE CHAT ROOM AREA ────────────────────────── */}
      <div className="flex-1 flex flex-col bg-[var(--bg-main)] min-w-0 h-full relative">
        {activeConv ? (
          <>
            {/* Header */}
            <div className="h-[55px] border-b border-[var(--border-subtle)] px-6 flex items-center justify-between shrink-0 bg-[var(--bg-card)]/30 backdrop-blur-sm">
              <div className="flex items-center gap-3 min-w-0">
                {activeConv.type === "group" ? (
                  <Hash className="w-5 h-5 text-[var(--accent)] shrink-0" />
                ) : (
                  <User className="w-5 h-5 text-[var(--accent)] shrink-0" />
                )}
                <div className="flex flex-col text-left min-w-0">
                  <h2 className="text-sm font-bold truncate">
                    {activeConv.type === "group" 
                      ? activeConv.name 
                      : (activeConv.participants?.find(p => p.user_id !== userId)?.name || activeConv.participants?.find(p => p.user_id !== userId)?.email?.split("@")[0] || "Direct Chat")}
                  </h2>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {activeConv.type === "group" 
                      ? `${activeConv.participants?.length || 0} members` 
                      : (onlineUsers.has(activeConv.participants?.find(p => p.user_id !== userId)?.user_id) ? "Online" : "Offline")}
                  </span>
                </div>
              </div>

              {/* Header Right actions */}
              <div className="flex items-center gap-3">
                {/* Search in message bar */}
                <div className="relative max-w-[200px] hidden md:block">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    placeholder="Search inside chat..."
                    value={messageSearchQuery}
                    onChange={(e) => setMessageSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1 bg-[var(--bg-elevated)]/60 border border-[var(--border-subtle)] rounded-lg text-[10px] focus:outline-none focus:border-[var(--border-focus)]"
                  />
                  {messageSearchQuery && (
                    <button onClick={() => setMessageSearchQuery("")} className="absolute right-2 top-2 hover:text-white text-[var(--text-muted)]">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Starred/Pins filter */}
                <button
                  onClick={() => setShowPinsOnly(!showPinsOnly)}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                    showPinsOnly 
                      ? "bg-amber-500/20 border-amber-500 text-amber-500 shadow-md" 
                      : "border-transparent text-[var(--text-muted)] hover:text-white"
                  }`}
                  title="Toggle Pinned Messages"
                >
                  <Pin className="w-4 h-4" />
                </button>

                {/* Details toggle */}
                <button
                  onClick={() => setRightSidebar(rightSidebar === "info" ? null : "info")}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                    rightSidebar === "info" 
                      ? "bg-[var(--accent)] border-[var(--accent)] text-white" 
                      : "border-transparent text-[var(--text-muted)] hover:text-white"
                  }`}
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Message Feed list */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {filteredMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] gap-2">
                  <AlertCircle className="w-8 h-8 opacity-45" />
                  <span className="text-xs">No messages found here.</span>
                </div>
              ) : (
                filteredMessages.map((msg, i) => {
                  const isOwn = msg.sender_id === userId;
                  const prevMsg = filteredMessages[i - 1];
                  
                  // Date separator
                  const currentMsgDate = new Date(msg.created_at).toDateString();
                  const prevMsgDate = prevMsg ? new Date(prevMsg.created_at).toDateString() : null;
                  const isNewDay = currentMsgDate !== prevMsgDate;

                  return (
                    <div key={msg.id} className="space-y-2">
                      {isNewDay && (
                        <div className="flex items-center justify-center my-4">
                          <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-elevated)] px-3 py-1 rounded-full font-medium shadow-sm">
                            {currentMsgDate}
                          </span>
                        </div>
                      )}

                      <div className={`flex group relative gap-3 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                        
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center font-bold text-white text-[10px] uppercase shrink-0 shadow-sm">
                          {msg.sender_name?.substring(0, 2) || "U"}
                        </div>

                        {/* Content block */}
                        <div className={`flex flex-col max-w-[70%] ${isOwn ? "items-end text-right" : "items-start text-left"}`}>
                          
                          {/* Header info */}
                          <div className="flex items-center gap-1.5 mb-1 px-1">
                            <span className="text-[11px] font-bold text-[var(--text-primary)]">
                              {msg.sender_name || "User"}
                            </span>
                            <span className="text-[9px] text-[var(--text-muted)]">
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {msg.is_edited && (
                              <span className="text-[8px] text-[var(--text-muted)] italic">(edited)</span>
                            )}
                          </div>

                          {/* Reply quotes preview */}
                          {msg.replyToMessage && !msg.is_unsent && (
                            <div className="text-[10px] px-2.5 py-1 mb-1 rounded-lg border-l-2 bg-[var(--bg-elevated)] border-[var(--accent)] text-[var(--text-muted)] flex items-center gap-1.5">
                              <Reply className="w-3 h-3 shrink-0" />
                              <span className="font-semibold">{msg.replyToMessage.sender_name}:</span>
                              <span className="truncate max-w-[150px]">{msg.replyToMessage.content || "Image 📎"}</span>
                            </div>
                          )}

                          {/* Bubble */}
                          <div className="relative">
                            
                            {editingMsgId === msg.id ? (
                              <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-elevated)] border border-[var(--border-focus)] rounded-xl max-w-sm">
                                <input
                                  type="text"
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  className="bg-transparent text-xs p-1.5 text-white outline-none w-full min-w-[200px]"
                                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                                />
                                <button onClick={saveEdit} className="p-1 rounded-lg bg-green-600 text-white cursor-pointer"><Check className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setEditingMsgId(null)} className="p-1 rounded-lg bg-red-600 text-white cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            ) : (
                              <div className={`px-4 py-2.5 rounded-2xl text-[12.5px] leading-relaxed shadow-sm relative ${
                                msg.is_unsent
                                  ? "bg-[var(--bg-elevated)]/50 text-[var(--text-muted)] italic text-[11px] border border-dashed border-[var(--border-subtle)]"
                                  : isOwn
                                  ? "bg-gradient-to-br from-[var(--accent)] to-purple-600 text-white rounded-tr-sm"
                                  : "bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-tl-sm"
                              }`}>
                                {msg.is_unsent ? (
                                  <span>This message was deleted</span>
                                ) : msg.file_url ? (
                                  <div className="space-y-1">
                                    {msg.file_type === "image" ? (
                                      <img
                                        src={getFileUrl(msg.file_url)}
                                        alt={msg.file_name || "Attachment"}
                                        className="max-w-[240px] max-h-[180px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity border border-white/10"
                                        onClick={() => window.open(getFileUrl(msg.file_url), "_blank")}
                                      />
                                    ) : (
                                      <div className="flex items-center gap-2 p-2 rounded-lg bg-black/20 text-xs">
                                        <FileText className="w-4 h-4 shrink-0 text-blue-400" />
                                        <span className="truncate max-w-[140px]" title={msg.file_name}>{msg.file_name || "File"}</span>
                                      </div>
                                    )}
                                    <a
                                      href={getFileUrl(msg.file_url)}
                                      download
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 font-medium pt-1"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      Download file
                                    </a>
                                  </div>
                                ) : (
                                  <p className="whitespace-pre-wrap">{renderMessageContent(msg.content)}</p>
                                )}

                                {/* Pinned Badge indicator */}
                                {msg.is_pinned && (
                                  <div className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white rounded-full p-0.5 border border-[var(--bg-main)]">
                                    <Pin className="w-2.5 h-2.5 fill-current" />
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Reactions display tray */}
                            {msg.reactions && msg.reactions.length > 0 && !msg.is_unsent && (
                              <div className={`flex flex-wrap gap-1 mt-1.5 justify-${isOwn ? "end" : "start"}`}>
                                {Array.from(new Set(msg.reactions.map(r => r.emoji))).map(emoji => {
                                  const matching = msg.reactions.filter(r => r.emoji === emoji);
                                  const reactedByMe = matching.some(r => r.user_id === userId);
                                  return (
                                    <button
                                      key={emoji}
                                      onClick={() => handleReact(msg.id, emoji)}
                                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] border cursor-pointer transition-all ${
                                        reactedByMe
                                          ? "bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--text-primary)] font-bold shadow-sm"
                                          : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-white"
                                      }`}
                                    >
                                      <span>{emoji}</span>
                                      <span>{matching.length}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Thread replies link */}
                            {msg.reply_count > 0 && !msg.is_unsent && (
                              <div className={`flex justify-${isOwn ? "end" : "start"} mt-1`}>
                                <button
                                  onClick={() => {
                                    setActiveThreadParentId(msg.id);
                                    setRightSidebar("thread");
                                  }}
                                  className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline font-semibold cursor-pointer"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>{msg.reply_count} {msg.reply_count === 1 ? "reply" : "replies"}</span>
                                </button>
                              </div>
                            )}

                          </div>

                        </div>

                        {/* HOVER INDIVIDUAL MESSAGE MENU BAR */}
                        {!msg.is_unsent && editingMsgId !== msg.id && (
                          <div className={`absolute top-1 z-10 hidden group-hover:flex items-center bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg shadow-lg p-0.5 transition-all ${
                            isOwn ? "left-12" : "right-12"
                          }`}>
                            
                            {/* Emoji Quick reactions */}
                            <div className="flex items-center border-r border-[var(--border-subtle)] pr-1 mr-1 gap-0.5">
                              {["👍", "❤️", "😂", "😮", "🙏"].map(emoji => (
                                <button
                                  key={emoji}
                                  onClick={() => handleReact(msg.id, emoji)}
                                  className="p-1 hover:bg-[var(--bg-hover)] rounded text-xs cursor-pointer"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>

                            {/* Standard menu items */}
                            <button
                              onClick={() => setReplyToMsg(msg)}
                              className="p-1 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white rounded cursor-pointer"
                              title="Quote / Reply"
                            >
                              <Reply className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => { setActiveThreadParentId(msg.id); setRightSidebar("thread"); }}
                              className="p-1 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white rounded cursor-pointer"
                              title="Reply in Thread"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => togglePin(msg.id)}
                              className={`p-1 hover:bg-[var(--bg-hover)] rounded cursor-pointer ${
                                msg.is_pinned ? "text-amber-500" : "text-[var(--text-muted)] hover:text-white"
                              }`}
                              title="Pin Message"
                            >
                              <Pin className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => initiateForward(msg)}
                              className="p-1 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white rounded cursor-pointer"
                              title="Forward Message"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>

                            {isOwn && (
                              <>
                                <button
                                  onClick={() => startEdit(msg)}
                                  className="p-1 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white rounded cursor-pointer"
                                  title="Edit Message"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => performUnsend(msg.id)}
                                  className="p-1 hover:bg-[var(--bg-hover)] text-red-500 hover:text-red-400 rounded cursor-pointer"
                                  title="Delete Message"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}

                          </div>
                        )}

                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messageEndRef} />
            </div>

            {/* Typing indicators */}
            {typingUsers[activeConversationId]?.length > 0 && (
              <div className="px-6 py-1 bg-[var(--bg-main)] text-[10px] text-[var(--text-muted)] italic text-left">
                {typingUsers[activeConversationId].map(u => u.userName).join(", ")} {
                  typingUsers[activeConversationId].length === 1 ? "is typing..." : "are typing..."
                }
              </div>
            )}

            {/* Input area */}
            <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]/20 backdrop-blur-sm shrink-0">
              
              {/* Reply preview banner */}
              {replyToMsg && (
                <div className="flex items-center justify-between bg-[var(--bg-elevated)] border-l-4 border-[var(--accent)] px-3 py-1.5 rounded-lg mb-2 text-xs">
                  <div className="flex flex-col text-left truncate">
                    <span className="font-bold text-[10px] text-[var(--text-muted)]">Replying to {replyToMsg.sender_name}</span>
                    <span className="truncate opacity-80">{replyToMsg.content || "File attachment"}</span>
                  </div>
                  <button onClick={() => setReplyToMsg(null)} className="p-1 text-[var(--text-muted)] hover:text-white cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* File Attachment preview */}
              {selectedFile && (
                <div className="flex items-center justify-between bg-blue-500/10 border-l-4 border-blue-500 px-3 py-1.5 rounded-lg mb-2 text-xs">
                  <div className="flex items-center gap-2 truncate text-left">
                    <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="truncate font-medium">{selectedFile.name}</span>
                  </div>
                  <button onClick={() => setSelectedFile(null)} className="p-1 text-[var(--text-muted)] hover:text-white cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Mentions popover suggestions */}
              {mentionSearch !== null && mentionSuggestions.length > 0 && (
                <div className="absolute bottom-16 left-6 z-50 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-xl w-60 overflow-hidden text-xs">
                  <div className="px-3 py-1.5 bg-[var(--bg-elevated)] font-bold text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                    Mention Members
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {mentionSuggestions.map((p, idx) => (
                      <button
                        key={p.user_id}
                        onClick={() => handleMentionSelect(p)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors cursor-pointer ${
                          idx === selectedMentionIndex ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--bg-hover)]"
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[9px] font-bold text-white uppercase">
                          {(p.name || p.email).substring(0, 2)}
                        </div>
                        <span className="truncate">{p.name || p.email}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message inputs */}
              <div className="flex items-end gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer border border-transparent hover:border-[var(--border-subtle)] shadow-sm shrink-0"
                >
                  <Paperclip className="w-4.5 h-4.5" />
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                    className="hidden"
                  />
                </button>

                <textarea
                  rows={1}
                  value={textInput}
                  onChange={(e) => handleTyping(e.target.value)}
                  placeholder={`Message #${activeConv.name || "chat"}...`}
                  className="flex-1 resize-none rounded-xl px-4 py-2.5 text-xs bg-[var(--bg-elevated)] border border-[var(--border-subtle)]
                    text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                    focus:outline-none focus:border-[var(--border-focus)] transition-colors
                    max-h-24 min-h-[38px] leading-relaxed shadow-inner"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />

                <button
                  onClick={handleSend}
                  disabled={!textInput.trim() && !selectedFile}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-[var(--accent)] to-purple-600 hover:opacity-90 text-white transition-all cursor-pointer shrink-0
                    disabled:opacity-30 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                >
                  <Send className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] gap-3 bg-[var(--bg-main)]">
            <MessageSquare className="w-12 h-12 opacity-35 text-[var(--accent)] animate-pulse" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Welcome to VerboLabs Workspace Chat</h3>
            <p className="text-xs max-w-sm">Select a conversation or group from the left sidebar to start collaborating.</p>
          </div>
        )}
      </div>

      {/* ── RIGHT SIDEBAR: THREADS / GROUP DETAIL INFO PANEL ────── */}
      {rightSidebar && activeConv && (
        <div className="w-80 border-l border-[var(--border-subtle)] bg-[var(--bg-card)]/50 backdrop-blur-md shrink-0 flex flex-col h-full z-20">
          
          {/* Header */}
          <div className="h-[55px] border-b border-[var(--border-subtle)] px-4 flex items-center justify-between bg-[var(--bg-card)]/30">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              {rightSidebar === "thread" ? "Thread Replies" : "Group details"}
            </h3>
            <button 
              onClick={() => { setRightSidebar(null); setActiveThreadParentId(null); }} 
              className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {/* THREAD VIEW */}
            {rightSidebar === "thread" && activeThreadParent && (
              <div className="flex flex-col h-full">
                
                {/* Parent Message details */}
                <div className="p-3 bg-[var(--bg-elevated)]/40 border border-[var(--border-subtle)] rounded-xl space-y-2 mb-3 text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center font-bold text-white text-[9px] uppercase">
                      {activeThreadParent.sender_name?.substring(0, 2) || "U"}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold">{activeThreadParent.sender_name}</span>
                      <span className="text-[8px] text-[var(--text-muted)]">
                        {new Date(activeThreadParent.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs">{activeThreadParent.content}</p>
                  {activeThreadParent.file_url && (
                    <div className="pt-1">
                      <span className="text-[10px] text-blue-400">📎 File attachment</span>
                    </div>
                  )}
                </div>

                {/* Sub replies */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {activeThreadReplies.map((reply) => {
                    const isOwnReply = reply.sender_id === userId;
                    return (
                      <div key={reply.id} className="flex gap-2 text-left">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[8px] font-bold text-white uppercase shrink-0">
                          {reply.sender_name?.substring(0, 2)}
                        </div>
                        <div className="flex-1 flex flex-col min-w-0">
                          <div className="flex items-baseline gap-1">
                            <span className="text-[10px] font-bold">{reply.sender_name}</span>
                            <span className="text-[7.5px] text-[var(--text-muted)]">
                              {new Date(reply.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          
                          <div className={`px-2.5 py-1.5 rounded-xl text-xs mt-0.5 leading-relaxed inline-block ${
                            reply.is_unsent
                              ? "bg-[var(--bg-elevated)] text-[var(--text-muted)] italic text-[10px]"
                              : isOwnReply
                              ? "bg-[var(--accent)]/15 text-[var(--text-primary)] border border-[var(--accent)]"
                              : "bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                          }`}>
                            {reply.is_unsent ? (
                              <span>This reply was deleted</span>
                            ) : reply.file_url ? (
                              <div className="space-y-1">
                                {reply.file_type === "image" ? (
                                  <img
                                    src={getFileUrl(reply.file_url)}
                                    alt="Thread media"
                                    className="max-w-[150px] rounded-lg border border-white/10"
                                  />
                                ) : (
                                  <span className="truncate max-w-[120px] text-[10px] flex items-center gap-1">
                                    <FileText className="w-3.5 h-3.5" />
                                    {reply.file_name}
                                  </span>
                                )}
                                <a href={getFileUrl(reply.file_url)} download target="_blank" rel="noreferrer" className="text-[9px] text-blue-400 flex items-center gap-1">
                                  <Download className="w-3 h-3" /> Download
                                </a>
                              </div>
                            ) : (
                              <p>{reply.content}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={threadEndRef} />
                </div>

                {/* Sub-reply input box */}
                <div className="pt-3 border-t border-[var(--border-subtle)] space-y-1">
                  
                  {/* File preview */}
                  {selectedThreadFile && (
                    <div className="flex items-center justify-between bg-blue-500/10 px-2 py-1 rounded text-[10px]">
                      <span className="truncate">{selectedThreadFile.name}</span>
                      <button onClick={() => setSelectedThreadFile(null)} className="text-[var(--text-muted)] hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="flex gap-1 items-center">
                    <button 
                      onClick={() => threadFileInputRef.current?.click()}
                      className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-pointer"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <input 
                        type="file" 
                        ref={threadFileInputRef} 
                        onChange={(e) => setSelectedThreadFile(e.target.files[0])}
                        className="hidden" 
                      />
                    </button>
                    <input
                      type="text"
                      placeholder="Reply to thread..."
                      value={threadTextInput}
                      onChange={(e) => setThreadTextInput(e.target.value)}
                      className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2.5 py-1.5 rounded-lg text-xs focus:outline-none focus:border-[var(--border-focus)]"
                      onKeyDown={(e) => e.key === "Enter" && handleSendThreadReply()}
                    />
                    <button 
                      onClick={handleSendThreadReply}
                      className="p-1.5 rounded-lg bg-[var(--accent)] hover:opacity-90 text-white cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* INFO VIEW / DETAILS & MEMBERS LIST */}
            {rightSidebar === "info" && (
              <div className="space-y-4 text-left">
                
                {/* Chat profile details */}
                <div className="flex flex-col items-center justify-center text-center p-3 bg-[var(--bg-elevated)]/20 border border-[var(--border-subtle)] rounded-2xl">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[var(--accent)] to-indigo-600 flex items-center justify-center font-bold text-white text-lg uppercase shadow-md mb-2">
                    {activeConv.name?.substring(0, 2) || "C"}
                  </div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)]">{activeConv.name}</h4>
                  <span className="text-[10px] text-[var(--text-muted)] capitalize">{activeConv.type} conversation</span>
                </div>

                {/* Starred / Pinned list */}
                <div>
                  <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Pin className="w-3.5 h-3.5" /> Pinned Messages ({activeMessages.filter(m => m.is_pinned).length})
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {activeMessages.filter(m => m.is_pinned).map(p => (
                      <div key={p.id} className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg text-[10px] space-y-1 relative group/pin">
                        <div className="flex items-center justify-between font-semibold">
                          <span>{p.sender_name}</span>
                          <button onClick={() => togglePin(p.id)} className="text-[var(--text-muted)] hover:text-red-400 opacity-0 group-hover/pin:opacity-100 transition-opacity">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="line-clamp-2 italic opacity-85">"{p.content || "Attachment"}"</p>
                      </div>
                    ))}
                    {activeMessages.filter(m => m.is_pinned).length === 0 && (
                      <span className="text-[10px] text-[var(--text-muted)]">No pinned messages inside this conversation.</span>
                    )}
                  </div>
                </div>

                {/* Group participants roster */}
                <div>
                  <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Members ({activeConv.participants?.length || 0})
                  </div>

                  {isStaff && activeConv.type === "group" && (
                    <div className="mt-1 mb-3">
                      <div className="flex gap-1.5">
                        <select
                          id="add-member-select"
                          className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2 py-1 rounded-lg text-[10.5px] focus:outline-none focus:border-[var(--border-focus)] text-[var(--text-primary)]"
                          defaultValue=""
                        >
                          <option value="" disabled>Add new member...</option>
                          {allUsersList
                            .filter(u => !activeConv.participants?.some(p => p.user_id === u.id))
                            .map(u => (
                              <option key={u.id} value={u.id}>
                                {u.name || u.email.split("@")[0]} ({u.role?.replace("_", " ")})
                              </option>
                            ))
                          }
                        </select>
                        <button
                          onClick={async () => {
                            const selectEl = document.getElementById("add-member-select");
                            const targetUserId = selectEl?.value;
                            if (!targetUserId) return;
                            try {
                              await addParticipants(activeConv.id, [targetUserId]);
                              selectEl.value = ""; // Reset dropdown
                            } catch (err) {
                              console.error("Failed to add participant:", err);
                            }
                          }}
                          className="px-2.5 py-1 bg-[var(--accent)] hover:opacity-90 text-white rounded-lg text-[10.5px] font-semibold cursor-pointer shrink-0"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {activeConv.participants?.map((member) => {
                      const isMemberOnline = onlineUsers.has(member.user_id);
                      return (
                        <div key={member.user_id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <div className="relative">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[9px] font-bold text-white uppercase shrink-0">
                                {(member.name || member.email).substring(0, 2)}
                              </div>
                              <div className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-[var(--bg-card)] ${
                                isMemberOnline ? "bg-green-500" : "bg-gray-400"
                              }`} />
                            </div>
                            <div className="flex flex-col truncate">
                              <span className="font-semibold truncate">{member.name || member.email?.split("@")[0]}</span>
                              <span className="text-[8px] text-[var(--text-muted)] capitalize">{member.role}</span>
                            </div>
                          </div>

                          {/* Member actions for staff */}
                          {isStaff && member.user_id !== userId && activeConv.type === "group" && (
                            <button
                              onClick={async () => {
                                if (confirm("Remove user from group?")) {
                                  try {
                                    await removeParticipant(activeConv.id, member.user_id);
                                  } catch (err) {
                                    console.error("Failed to remove member:", err);
                                  }
                                }
                              }}
                              className="p-1 text-red-500 hover:bg-red-500/10 rounded cursor-pointer"
                              title="Kick member"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Leave Group Action button */}
                {activeConv.type === "group" && (
                  <button
                    onClick={async () => {
                      if (confirm("Are you sure you want to leave this group?")) {
                        try {
                          await leaveGroup(activeConv.id);
                          setRightSidebar(null);
                        } catch (err) {
                          console.error("Leave failed:", err);
                        }
                      }
                    }}
                    className="w-full py-2 border border-red-500/30 text-red-500 hover:bg-red-500/10 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Leave Group
                  </button>
                )}

              </div>
            )}

          </div>
        </div>
      )}

      {/* ── FORWARD MESSAGE MODAL ─────────────────────────── */}
      {showForwardModal && forwardMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl shadow-xl w-80 overflow-hidden flex flex-col max-h-[400px]">
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider">Forward Message</h3>
              <button onClick={() => { setShowForwardModal(false); setForwardMsg(null); }} className="hover:text-white text-[var(--text-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <span className="text-[10px] text-[var(--text-muted)] px-3 block mb-2">Select a conversation to forward this message to:</span>
              {conversations.map((c) => {
                const displayName = c.type === "group" 
                  ? c.name 
                  : (c.participants?.find(p => p.user_id !== userId)?.name || c.participants?.find(p => p.user_id !== userId)?.email?.split("@")[0] || "Chat");
                return (
                  <button
                    key={c.id}
                    onClick={() => triggerForward(c.id)}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--bg-hover)] rounded-xl flex items-center gap-2 text-xs transition-colors cursor-pointer"
                  >
                    {c.type === "group" ? <Hash className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                    <span className="truncate">{displayName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE NEW CHAT / GROUP MODAL ────────────────── */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl shadow-xl w-96 overflow-hidden flex flex-col max-h-[500px]">
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {newChatType === "direct" ? "New Direct Message" : "Create Group Conversation"}
              </h3>
              <button onClick={() => { setShowNewChatModal(false); setSelectedUsers([]); }} className="hover:text-white text-[var(--text-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 flex-1 flex flex-col overflow-hidden text-left">
              {newChatType === "group" && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Group Name</label>
                  <input
                    type="text"
                    placeholder="E.g., Hindi Translators"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs focus:outline-none focus:border-[var(--border-focus)]"
                  />
                </div>
              )}

              <div className="space-y-1 flex-1 flex flex-col overflow-hidden">
                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  {newChatType === "direct" ? "Select Recipient" : "Select Members"}
                </label>
                <div className="flex-1 overflow-y-auto border border-[var(--border-subtle)] rounded-xl p-2 space-y-1.5 bg-[var(--bg-elevated)]/30">
                  {allUsersList.map((usr) => {
                    const isSelected = selectedUsers.includes(usr.id);
                    const name = usr.name || usr.email.split("@")[0];
                    return (
                      <button
                        key={usr.id}
                        onClick={() => {
                          if (newChatType === "direct") {
                            setSelectedUsers([usr.id]);
                          } else {
                            setSelectedUsers(isSelected 
                              ? selectedUsers.filter(id => id !== usr.id) 
                              : [...selectedUsers, usr.id]
                            );
                          }
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between text-xs transition-all cursor-pointer ${
                          isSelected 
                            ? "bg-[var(--accent)] text-white shadow-sm font-semibold" 
                            : "hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[9px] font-bold text-white uppercase shrink-0">
                            {name.substring(0, 2)}
                          </div>
                          <span className="truncate">{name} ({usr.role?.replace("_", " ")})</span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 flex justify-end gap-2 shrink-0">
              <button
                onClick={() => { setShowNewChatModal(false); setSelectedUsers([]); }}
                className="px-4 py-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateChat}
                disabled={selectedUsers.length === 0 || (newChatType === "group" && !newGroupName.trim())}
                className="px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-md cursor-pointer"
              >
                {newChatType === "direct" ? "Open Chat" : "Create Group"}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
