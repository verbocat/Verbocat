import { create } from "zustand";
import * as chatApi from "./chatApi";

export const useChatStore = create((set, get) => ({
  /* ── state ─────────────────────────────────────────── */
  conversations: [],
  activeConversationId: null,
  messages: {},          // { [conversationId]: Message[] }
  unreadCounts: {},      // { [conversationId]: number }
  totalUnread: 0,
  typingUsers: {},       // { [conversationId]: { userId, userName }[] }
  isOpen: false,
  view: "list",          // "list" | "chat" | "new" | "new-group"
  loading: false,
  messagesLoading: false,
  hasMore: {},           // { [conversationId]: boolean }
  onlineUsers: new Set(),
  socket: null,
  threadMessages: {},    // { [parentMessageId]: Message[] }
  activeThreadParentId: null,


  /* ── basic actions ─────────────────────────────────── */
  setSocket: (socket) => set({ socket }),

  toggleOpen: () =>
    set((s) => {
      const next = !s.isOpen;
      // When closing, reset to list view
      if (!next) return { isOpen: false, view: "list", activeConversationId: null };
      return { isOpen: true };
    }),

  setOpen: (open) => set({ isOpen: open }),

  setView: (view) => set({ view }),

  setActiveConversation: (id) => {
    set({ activeConversationId: id, view: "chat" });
    // Mark conversation as read and fetch messages
    get().markAsRead(id);
    if (!get().messages[id]?.length) {
      get().fetchMessages(id);
    }
    // Join socket room
    const socket = get().socket;
    if (socket) {
      socket.emit("chat:join-conversation", { conversationId: id });
    }
  },

  goBack: () => set({ view: "list", activeConversationId: null }),

  /* ── data fetching ─────────────────────────────────── */
  fetchConversations: async () => {
    try {
      set({ loading: true });
      const data = await chatApi.fetchConversations();
      const convs = data.conversations || data || [];
      const unreadCounts = {};
      let totalUnread = 0;
      convs.forEach((c) => {
        const count = c.unreadCount ?? c.unread_count ?? 0;
        unreadCounts[c.id] = count;
        totalUnread += count;
      });
      set({ conversations: convs, unreadCounts, totalUnread, loading: false });
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
      set({ loading: false });
    }
  },

  fetchMessages: async (conversationId, cursor = null) => {
    try {
      set({ messagesLoading: true });
      const data = await chatApi.fetchMessages(conversationId, cursor);
      const newMsgs = data.messages || data || [];
      const hasMorePage = data.hasMore ?? newMsgs.length >= 40;

      set((s) => {
        const existing = cursor ? (s.messages[conversationId] || []) : [];
        // API returns messages oldest-first
        const merged = cursor ? [...newMsgs, ...existing] : newMsgs;

        // Deduplicate by id
        const seen = new Set();
        const deduped = merged.filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });

        return {
          messages: { ...s.messages, [conversationId]: deduped },
          hasMore: { ...s.hasMore, [conversationId]: hasMorePage },
          messagesLoading: false,
        };
      });
    } catch (err) {
      console.error("Failed to fetch messages:", err);
      set({ messagesLoading: false });
    }
  },

  sendMessage: async (conversationId, content, replyTo = null) => {
    try {
      const msg = await chatApi.sendMessage(conversationId, content, replyTo);
      // The socket will deliver the message to us, but add optimistically
      set((s) => {
        const existing = s.messages[conversationId] || [];
        // Don't add if already present (from socket)
        if (existing.find((m) => m.id === msg.id)) return {};
        return {
          messages: {
            ...s.messages,
            [conversationId]: [...existing, msg],
          },
        };
      });
      // Update conversation's last message
      get()._updateConversationLastMessage(conversationId, msg);
      return msg;
    } catch (err) {
      console.error("Failed to send message:", err);
      throw err;
    }
  },

  uploadFile: async (conversationId, file) => {
    try {
      const msg = await chatApi.uploadChatFile(conversationId, file);
      set((s) => {
        const existing = s.messages[conversationId] || [];
        if (existing.find((m) => m.id === msg.id)) return {};
        return {
          messages: {
            ...s.messages,
            [conversationId]: [...existing, msg],
          },
        };
      });
      get()._updateConversationLastMessage(conversationId, msg);
      return msg;
    } catch (err) {
      console.error("Failed to upload file:", err);
      throw err;
    }
  },

  unsendMessage: async (messageId, conversationId) => {
    try {
      await chatApi.unsendMessage(messageId);
      set((s) => {
        const msgs = (s.messages[conversationId] || []).map((m) =>
          m.id === messageId ? { ...m, is_unsent: true, content: null, file_url: null } : m
        );
        return { messages: { ...s.messages, [conversationId]: msgs } };
      });
    } catch (err) {
      console.error("Failed to unsend message:", err);
    }
  },

  markAsRead: async (conversationId) => {
    try {
      await chatApi.markAsRead(conversationId);
      set((s) => {
        const diff = s.unreadCounts[conversationId] || 0;
        return {
          unreadCounts: { ...s.unreadCounts, [conversationId]: 0 },
          totalUnread: Math.max(0, s.totalUnread - diff),
        };
      });
    } catch (err) {
      // silent — not critical
    }
  },

  createDirectChat: async (userId) => {
    try {
      const conv = await chatApi.createConversation("direct", [userId]);
      set((s) => {
        const exists = s.conversations.find((c) => c.id === conv.id);
        const convs = exists ? s.conversations : [conv, ...s.conversations];
        return {
          conversations: convs,
          activeConversationId: conv.id,
          view: "chat",
        };
      });
      get().fetchMessages(conv.id);

      // Join socket room
      const socket = get().socket;
      if (socket) {
        socket.emit("chat:join-conversation", { conversationId: conv.id });
      }

      return conv;
    } catch (err) {
      console.error("Failed to create direct chat:", err);
      throw err;
    }
  },

  createGroup: async (name, participantIds) => {
    try {
      const conv = await chatApi.createConversation("group", participantIds, name);
      set((s) => ({
        conversations: [conv, ...s.conversations],
        activeConversationId: conv.id,
        view: "chat",
      }));
      get().fetchMessages(conv.id);

      // Join socket room
      const socket = get().socket;
      if (socket) {
        socket.emit("chat:join-conversation", { conversationId: conv.id });
      }

      return conv;
    } catch (err) {
      console.error("Failed to create group:", err);
      throw err;
    }
  },

  setActiveThreadParentId: (id) => set({ activeThreadParentId: id }),

  editMessage: async (messageId, content) => {
    try {
      const updatedMsg = await chatApi.editMessage(messageId, content);
      set((s) => {
        const convId = updatedMsg.conversation_id;
        const existing = s.messages[convId] || [];
        const updated = existing.map((m) => m.id === messageId ? updatedMsg : m);

        // Also update if it is in thread messages
        const parentId = updatedMsg.thread_parent_id;
        let threadUpdated = {};
        if (parentId && s.threadMessages[parentId]) {
          const threadList = s.threadMessages[parentId].map((m) => m.id === messageId ? updatedMsg : m);
          threadUpdated = { [parentId]: threadList };
        }

        return {
          messages: { ...s.messages, [convId]: updated },
          threadMessages: { ...s.threadMessages, ...threadUpdated }
        };
      });
      return updatedMsg;
    } catch (err) {
      console.error("Failed to edit message:", err);
      throw err;
    }
  },

  togglePin: async (messageId) => {
    try {
      const updatedMsg = await chatApi.togglePin(messageId);
      set((s) => {
        const convId = updatedMsg.conversation_id;
        const existing = s.messages[convId] || [];
        const updated = existing.map((m) => m.id === messageId ? updatedMsg : m);
        return { messages: { ...s.messages, [convId]: updated } };
      });
      return updatedMsg;
    } catch (err) {
      console.error("Failed to toggle pin:", err);
      throw err;
    }
  },

  toggleReaction: async (messageId, emoji) => {
    try {
      const reactions = await chatApi.toggleReaction(messageId, emoji);
      set((s) => {
        // Find conversation containing this message
        let foundConvId = null;
        for (const [cid, msgs] of Object.entries(s.messages)) {
          if (msgs.find((m) => m.id === messageId)) {
            foundConvId = cid;
            break;
          }
        }
        if (!foundConvId) return {};

        const existing = s.messages[foundConvId] || [];
        const updated = existing.map((m) => m.id === messageId ? { ...m, reactions } : m);
        return { messages: { ...s.messages, [foundConvId]: updated } };
      });
      return reactions;
    } catch (err) {
      console.error("Failed to toggle reaction:", err);
      throw err;
    }
  },

  forwardMessage: async (messageId, conversationId) => {
    try {
      const msg = await chatApi.forwardMessage(messageId, conversationId);
      set((s) => {
        const existing = s.messages[conversationId] || [];
        if (existing.find((m) => m.id === msg.id)) return {};
        return {
          messages: {
            ...s.messages,
            [conversationId]: [...existing, msg]
          }
        };
      });
      return msg;
    } catch (err) {
      console.error("Failed to forward message:", err);
      throw err;
    }
  },

  fetchThreadReplies: async (messageId) => {
    try {
      set({ messagesLoading: true });
      const replies = await chatApi.fetchThreadReplies(messageId);
      set((s) => ({
        threadMessages: {
          ...s.threadMessages,
          [messageId]: replies
        },
        messagesLoading: false
      }));
      return replies;
    } catch (err) {
      console.error("Failed to fetch thread replies:", err);
      set({ messagesLoading: false });
      throw err;
    }
  },

  sendThreadMessage: async (conversationId, parentId, content) => {
    try {
      const msg = await chatApi.sendMessage(conversationId, content, null, parentId);
      set((s) => {
        const existing = s.threadMessages[parentId] || [];
        if (existing.find((m) => m.id === msg.id)) return {};
        return {
          threadMessages: {
            ...s.threadMessages,
            [parentId]: [...existing, msg]
          }
        };
      });
      return msg;
    } catch (err) {
      console.error("Failed to send thread reply:", err);
      throw err;
    }
  },

  uploadThreadFile: async (conversationId, parentId, file) => {
    try {
      const msg = await chatApi.uploadChatFile(conversationId, file, null, parentId);
      set((s) => {
        const existing = s.threadMessages[parentId] || [];
        if (existing.find((m) => m.id === msg.id)) return {};
        return {
          threadMessages: {
            ...s.threadMessages,
            [parentId]: [...existing, msg]
          }
        };
      });
      return msg;
    } catch (err) {
      console.error("Failed to upload thread file:", err);
      throw err;
    }
  },

  /* ── socket handlers ───────────────────────────────── */
  handleNewMessage: (message) => {
    set((s) => {
      const convId = message.conversation_id;
      const parentId = message.thread_parent_id;

      if (parentId) {
        // It's a thread message! Add to thread list if loaded
        const threadList = s.threadMessages[parentId] || [];
        if (threadList.find((m) => m.id === message.id)) return {};
        const threadUpdated = [...threadList, message];

        // Increment reply count of parent message in main list
        const mainList = s.messages[convId] || [];
        const mainUpdated = mainList.map((m) =>
          m.id === parentId ? { ...m, reply_count: (m.reply_count || 0) + 1 } : m
        );

        return {
          threadMessages: { ...s.threadMessages, [parentId]: threadUpdated },
          messages: { ...s.messages, [convId]: mainUpdated }
        };
      }

      const existing = s.messages[convId] || [];
      // Deduplicate
      if (existing.find((m) => m.id === message.id)) return {};

      const newMessages = { ...s.messages, [convId]: [...existing, message] };

      // Update unread only if this conversation is not actively open
      const isActive = s.isOpen && s.activeConversationId === convId;
      const unreadCounts = { ...s.unreadCounts };
      let totalUnread = s.totalUnread;
      if (!isActive) {
        unreadCounts[convId] = (unreadCounts[convId] || 0) + 1;
        totalUnread += 1;
      }

      return { messages: newMessages, unreadCounts, totalUnread };
    });

    // Update conversation in the list
    if (!message.thread_parent_id) {
      get()._updateConversationLastMessage(message.conversation_id, message);
    }

    // If this conversation is active and open, mark as read
    const s = get();
    if (s.isOpen && s.activeConversationId === message.conversation_id) {
      s.markAsRead(message.conversation_id);
    }
  },

  handleMessageUnsent: ({ messageId, conversationId }) => {
    set((s) => {
      const msgs = (s.messages[conversationId] || []).map((m) =>
        m.id === messageId ? { ...m, is_unsent: true, content: null, file_url: null } : m
      );

      // Also mark unsent in threadMessages if present
      let threadUpdated = {};
      for (const [parentId, replies] of Object.entries(s.threadMessages)) {
        if (replies.find((r) => r.id === messageId)) {
          const updatedReplies = replies.map((r) =>
            r.id === messageId ? { ...r, is_unsent: true, content: null, file_url: null } : r
          );
          threadUpdated[parentId] = updatedReplies;
        }
      }

      return {
        messages: { ...s.messages, [conversationId]: msgs },
        threadMessages: { ...s.threadMessages, ...threadUpdated }
      };
    });
  },

  handleMessageEdited: (editedMsg) => {
    set((s) => {
      const convId = editedMsg.conversation_id;
      const existing = s.messages[convId] || [];
      const updated = existing.map((m) => (m.id === editedMsg.id ? { ...m, ...editedMsg } : m));

      // Also update threadMessages if loaded
      const parentId = editedMsg.thread_parent_id;
      let threadUpdated = {};
      if (parentId && s.threadMessages[parentId]) {
        const threadList = s.threadMessages[parentId].map((m) => (m.id === editedMsg.id ? { ...m, ...editedMsg } : m));
        threadUpdated = { [parentId]: threadList };
      }

      return {
        messages: { ...s.messages, [convId]: updated },
        threadMessages: { ...s.threadMessages, ...threadUpdated }
      };
    });
  },

  handleMessagePinned: ({ messageId, conversationId, is_pinned, message }) => {
    set((s) => {
      const existing = s.messages[conversationId] || [];
      const updated = existing.map((m) => (m.id === messageId ? { ...m, is_pinned, ...message } : m));
      return { messages: { ...s.messages, [conversationId]: updated } };
    });
  },

  handleReactionUpdated: ({ messageId, conversationId, reactions }) => {
    set((s) => {
      const existing = s.messages[conversationId] || [];
      const updated = existing.map((m) => (m.id === messageId ? { ...m, reactions } : m));

      // Also update in thread messages if it's a thread reply
      let threadUpdated = {};
      for (const [parentId, replies] of Object.entries(s.threadMessages)) {
        if (replies.find((r) => r.id === messageId)) {
          const updatedReplies = replies.map((r) => (r.id === messageId ? { ...r, reactions } : r));
          threadUpdated[parentId] = updatedReplies;
        }
      }

      return {
        messages: { ...s.messages, [conversationId]: updated },
        threadMessages: { ...s.threadMessages, ...threadUpdated }
      };
    });
  },

  handleTyping: ({ conversationId, userId, userName }) => {
    set((s) => {
      const current = s.typingUsers[conversationId] || [];
      if (current.find((t) => t.userId === userId)) return {};
      return {
        typingUsers: {
          ...s.typingUsers,
          [conversationId]: [...current, { userId, userName }],
        },
      };
    });
    // Auto-remove after 3s
    setTimeout(() => {
      get().handleStopTyping({ conversationId, userId });
    }, 3000);
  },

  handleStopTyping: ({ conversationId, userId }) => {
    set((s) => {
      const current = s.typingUsers[conversationId] || [];
      return {
        typingUsers: {
          ...s.typingUsers,
          [conversationId]: current.filter((t) => t.userId !== userId),
        },
      };
    });
  },

  handleNewConversation: (conversation) => {
    set((s) => {
      const exists = s.conversations.find((c) => c.id === conversation.id);
      if (exists) return {};
      return { conversations: [conversation, ...s.conversations] };
    });
  },

  handleOnlineUsers: (userIds) => {
    set({ onlineUsers: new Set(userIds) });
  },

  handleUserOnline: (userId) => {
    set((s) => {
      const next = new Set(s.onlineUsers);
      next.add(userId);
      return { onlineUsers: next };
    });
  },

  handleUserOffline: (userId) => {
    set((s) => {
      const next = new Set(s.onlineUsers);
      next.delete(userId);
      return { onlineUsers: next };
    });
  },

  handleParticipantsUpdated: () => {
    get().fetchConversations();
  },

  handleGroupUpdated: (updatedConv) => {
    set((s) => {
      const convs = s.conversations.map((c) => {
        if (c.id !== updatedConv.id) return c;
        return {
          ...c,
          ...updatedConv,
        };
      });
      return { conversations: convs };
    });
  },

  /* ── internal helpers ──────────────────────────────── */
  _updateConversationLastMessage: (conversationId, message) => {
    set((s) => {
      const convs = s.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        return { ...c, lastMessage: message, last_message: message, updated_at: message.created_at };
      });
      // Sort by updated_at descending
      convs.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
      return { conversations: convs };
    });
  },
}));
