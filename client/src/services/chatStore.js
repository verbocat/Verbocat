import { create } from "zustand";
import * as chatApi from "./chatApi";
import { useUserStore } from "./userStore";

export const useChatStore = create((set, get) => ({
  /* State */
  queries: [],
  activeQueryId: null,
  messages: {},          // { [queryId]: Message[] }
  isOpen: false,
  view: "list",          // "list" | "chat" | "create"
  loading: false,
  messagesLoading: false,
  socket: null,
  totalUnread: 0,
  unreadQueries: new Set(), // Set of queryIds with unread messages
  creationDefaults: null, // { queryType: "segment" | "file", segmentIndex: string }

  /* Basic Actions */
  setSocket: (socket) => set({ socket }),

  toggleOpen: () =>
    set((s) => {
      const next = !s.isOpen;
      if (!next) return { isOpen: false, view: "list", activeQueryId: null, creationDefaults: null };
      return { isOpen: true };
    }),

  setOpen: (open) => set({ isOpen: open }),

  setView: (view) => set({ view }),

  setCreationDefaults: (defaults) => set({ creationDefaults: defaults }),

  setActiveQuery: (id) => {
    set({ activeQueryId: id, view: "chat" });
    
    // Clear unread for this query
    set((s) => {
      const nextUnread = new Set(s.unreadQueries);
      nextUnread.delete(id);
      return {
        unreadQueries: nextUnread,
        totalUnread: nextUnread.size
      };
    });

    // Fetch messages
    get().fetchQueryMessages(id);
  },

  goBack: () => {
    set({ view: "list", activeQueryId: null });
  },

  /* API Calls */
  fetchQueries: async (documentId = null) => {
    try {
      set({ loading: true });
      const data = await chatApi.fetchQueries(documentId);
      set({ queries: data || [], loading: false });
    } catch (err) {
      console.error("Failed to fetch queries:", err);
      set({ loading: false });
    }
  },

  fetchQueryMessages: async (queryId) => {
    try {
      set({ messagesLoading: true });
      const data = await chatApi.fetchQueryMessages(queryId);
      set((s) => ({
        messages: { ...s.messages, [queryId]: data || [] },
        messagesLoading: false
      }));
    } catch (err) {
      console.error("Failed to fetch messages:", err);
      set({ messagesLoading: false });
    }
  },

  createQuery: async (documentId, queryType, segmentIndex, topic, message, linguistId = null) => {
    try {
      set({ loading: true });
      const newQuery = await chatApi.createQuery(documentId, queryType, segmentIndex, topic, message, linguistId);
      set((s) => ({
        queries: [newQuery, ...s.queries],
        loading: false
      }));
      // Select the new query
      get().setActiveQuery(newQuery.id);
      return newQuery;
    } catch (err) {
      console.error("Failed to create query:", err);
      set({ loading: false });
      throw err;
    }
  },

  sendQueryMessage: async (queryId, content) => {
    try {
      const msg = await chatApi.sendQueryMessage(queryId, content);
      set((s) => {
        const existing = s.messages[queryId] || [];
        if (existing.find((m) => m.id === msg.id)) return {};
        return {
          messages: {
            ...s.messages,
            [queryId]: [...existing, msg]
          }
        };
      });
      // Update last message in queries list
      get()._updateQueryLastMessage(queryId, msg);
      return msg;
    } catch (err) {
      console.error("Failed to send message:", err);
      throw err;
    }
  },

  uploadFile: async (queryId, file) => {
    try {
      const msg = await chatApi.uploadQueryFile(queryId, file);
      set((s) => {
        const existing = s.messages[queryId] || [];
        if (existing.find((m) => m.id === msg.id)) return {};
        return {
          messages: {
            ...s.messages,
            [queryId]: [...existing, msg]
          }
        };
      });
      get()._updateQueryLastMessage(queryId, msg);
      return msg;
    } catch (err) {
      console.error("Failed to upload file:", err);
      throw err;
    }
  },

  deleteQueryMessage: async (messageId) => {
    try {
      const data = await chatApi.deleteQueryMessage(messageId);
      get().handleMessageDeleted({
        queryId: data.queryId || get().activeQueryId,
        messageId,
        lastMessage: data.lastMessage
      });
    } catch (err) {
      console.error("Failed to delete message:", err);
      throw err;
    }
  },

  editQueryMessage: async (messageId, content) => {
    try {
      const updated = await chatApi.editQueryMessage(messageId, content);
      get().handleMessageUpdated(updated);
    } catch (err) {
      console.error("Failed to edit message:", err);
      throw err;
    }
  },

  resolveQuery: async (queryId, status = "resolved") => {
    try {
      const updated = await chatApi.resolveQuery(queryId, status);
      set((s) => ({
        queries: s.queries.map((q) => (q.id === queryId ? { ...q, status: updated.status } : q))
      }));
      return updated;
    } catch (err) {
      console.error("Failed to resolve query:", err);
      throw err;
    }
  },

  /* Real-time Socket Event Handlers */
  handleNewQuery: (query) => {
    set((s) => {
      // Avoid duplicate
      if (s.queries.find((q) => q.id === query.id)) return {};
      return {
        queries: [query, ...s.queries]
      };
    });
  },

  handleNewMessage: ({ queryId, message }) => {
    set((s) => {
      const existing = s.messages[queryId] || [];
      const isDuplicate = existing.some((m) => m.id === message.id);
      const updatedMessages = isDuplicate ? existing : [...existing, message];

      const isCurrentActive = s.activeQueryId === queryId;
      const nextUnread = new Set(s.unreadQueries);
      const currentUserId = useUserStore.getState().user?.id;
      
      if (!isCurrentActive && message.sender_id !== currentUserId) {
        nextUnread.add(queryId);
      }

      return {
        messages: {
          ...s.messages,
          [queryId]: updatedMessages
        },
        unreadQueries: nextUnread,
        totalUnread: nextUnread.size
      };
    });
    get()._updateQueryLastMessage(queryId, message);
  },

  handleQueryUpdated: ({ query, message }) => {
    set((s) => {
      const existing = s.messages[query.id] || [];
      const updatedMessages = existing.some((m) => m.id === message.id)
        ? existing
        : [...existing, message];

      return {
        queries: s.queries.map((q) => (q.id === query.id ? { ...q, status: query.status } : q)),
        messages: {
          ...s.messages,
          [query.id]: updatedMessages
        }
      };
    });
  },

  handleMessageDeleted: ({ queryId, messageId, lastMessage }) => {
    set((s) => {
      const existing = s.messages[queryId] || [];
      const updatedMessages = existing.filter((m) => m.id !== messageId);
      
      return {
        messages: {
          ...s.messages,
          [queryId]: updatedMessages
        }
      };
    });
    // Update last message in the queries list
    set((s) => ({
      queries: s.queries.map((q) =>
        q.id === queryId
          ? {
              ...q,
              lastMessage,
              last_message: lastMessage
            }
          : q
      )
    }));
  },

  handleMessageUpdated: (message) => {
    set((s) => {
      const queryId = message.query_id;
      const existing = s.messages[queryId] || [];
      const updatedMessages = existing.map((m) => m.id === message.id ? message : m);
      
      return {
        messages: {
          ...s.messages,
          [queryId]: updatedMessages
        }
      };
    });
    // Also update last message in queries list if it matches
    set((s) => ({
      queries: s.queries.map((q) =>
        q.id === message.query_id && q.lastMessage?.id === message.id
          ? {
              ...q,
              lastMessage: message,
              last_message: message
            }
          : q
      )
    }));
  },

  _updateQueryLastMessage: (queryId, message) => {
    set((s) => ({
      queries: s.queries.map((q) =>
        q.id === queryId
          ? {
              ...q,
              lastMessage: message,
              last_message: message,
              updated_at: message.created_at
            }
          : q
      )
    }));
  }
}));
