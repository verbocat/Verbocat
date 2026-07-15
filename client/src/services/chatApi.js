import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/chat`
  : "/api/chat";

const getHeaders = () => {
  const token = localStorage.getItem("centroid_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchConversations = async () => {
  const { data } = await axios.get(`${API_BASE}/conversations`, {
    headers: getHeaders(),
  });
  return data;
};

export const createConversation = async (type, participantIds, name = null) => {
  const { data } = await axios.post(
    `${API_BASE}/conversations`,
    { type, participantIds, name },
    { headers: getHeaders() }
  );
  return data;
};

export const fetchMessages = async (conversationId, cursor = null, limit = 40) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  const { data } = await axios.get(
    `${API_BASE}/conversations/${conversationId}/messages?${params}`,
    { headers: getHeaders() }
  );
  return data;
};

export const sendMessage = async (conversationId, content, replyTo = null, threadParentId = null) => {
  const { data } = await axios.post(
    `${API_BASE}/conversations/${conversationId}/messages`,
    { content, replyTo, threadParentId },
    { headers: getHeaders() }
  );
  return data;
};

export const uploadChatFile = async (conversationId, file, replyTo = null, threadParentId = null) => {
  const formData = new FormData();
  formData.append("file", file);
  if (replyTo) formData.append("replyTo", replyTo);
  if (threadParentId) formData.append("threadParentId", threadParentId);
  const { data } = await axios.post(
    `${API_BASE}/conversations/${conversationId}/upload`,
    formData,
    {
      headers: {
        ...getHeaders(),
        "Content-Type": "multipart/form-data",
      },
    }
  );
  return data;
};

export const unsendMessage = async (messageId) => {
  const { data } = await axios.put(
    `${API_BASE}/messages/${messageId}/unsend`,
    {},
    { headers: getHeaders() }
  );
  return data;
};

export const markAsRead = async (conversationId) => {
  const { data } = await axios.put(
    `${API_BASE}/conversations/${conversationId}/read`,
    {},
    { headers: getHeaders() }
  );
  return data;
};

export const searchChatUsers = async (search) => {
  const { data } = await axios.get(
    `${API_BASE}/users?search=${encodeURIComponent(search)}`,
    { headers: getHeaders() }
  );
  return data;
};

export const updateGroup = async (conversationId, name) => {
  const { data } = await axios.put(
    `${API_BASE}/conversations/${conversationId}`,
    { name },
    { headers: getHeaders() }
  );
  return data;
};

export const addParticipants = async (conversationId, userIds) => {
  const { data } = await axios.post(
    `${API_BASE}/conversations/${conversationId}/participants`,
    { userIds },
    { headers: getHeaders() }
  );
  return data;
};

export const removeParticipant = async (conversationId, userId) => {
  const { data } = await axios.delete(
    `${API_BASE}/conversations/${conversationId}/participants/${userId}`,
    { headers: getHeaders() }
  );
  return data;
};

export const leaveGroup = async (conversationId) => {
  const { data } = await axios.delete(
    `${API_BASE}/conversations/${conversationId}/leave`,
    { headers: getHeaders() }
  );
  return data;
};

export const editMessage = async (messageId, content) => {
  const { data } = await axios.put(
    `${API_BASE}/messages/${messageId}`,
    { content },
    { headers: getHeaders() }
  );
  return data;
};

export const togglePin = async (messageId) => {
  const { data } = await axios.put(
    `${API_BASE}/messages/${messageId}/pin`,
    {},
    { headers: getHeaders() }
  );
  return data;
};

export const toggleReaction = async (messageId, emoji) => {
  const { data } = await axios.post(
    `${API_BASE}/messages/${messageId}/reactions`,
    { emoji },
    { headers: getHeaders() }
  );
  return data;
};

export const forwardMessage = async (messageId, conversationId) => {
  const { data } = await axios.post(
    `${API_BASE}/messages/${messageId}/forward`,
    { conversationId },
    { headers: getHeaders() }
  );
  return data;
};

export const fetchThreadReplies = async (messageId) => {
  const { data } = await axios.get(
    `${API_BASE}/messages/${messageId}/thread`,
    { headers: getHeaders() }
  );
  return data;
};
