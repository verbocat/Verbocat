import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/chat`
  : "/api/chat";

const getHeaders = () => {
  const token = localStorage.getItem("centroid_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Fetch support queries. If documentId is provided, filters for that document.
export const fetchQueries = async (documentId = null) => {
  const params = new URLSearchParams();
  if (documentId) params.set("documentId", documentId);
  
  const { data } = await axios.get(`${API_BASE}/queries?${params}`, {
    headers: getHeaders(),
  });
  return data;
};

// Create a new support query (Linguist raises for self, or Staff initiates contact with a linguist)
export const createQuery = async (documentId, queryType, segmentIndex, topic, message, linguistId = null) => {
  const { data } = await axios.post(
    `${API_BASE}/queries`,
    { documentId, queryType, segmentIndex, topic, message, linguistId },
    { headers: getHeaders() }
  );
  return data;
};

// Fetch all assigned linguists for a document (Staff only)
export const fetchDocumentLinguists = async (documentId) => {
  const { data } = await axios.get(`${API_BASE}/documents/${documentId}/linguists`, {
    headers: getHeaders(),
  });
  return data;
};

// Fetch messages for a specific query
export const fetchQueryMessages = async (queryId) => {
  const { data } = await axios.get(`${API_BASE}/queries/${queryId}/messages`, {
    headers: getHeaders(),
  });
  return data;
};

// Send a text message to a query thread
export const sendQueryMessage = async (queryId, content) => {
  const { data } = await axios.post(
    `${API_BASE}/queries/${queryId}/messages`,
    { content },
    { headers: getHeaders() }
  );
  return data;
};

// Upload an attachment to a query thread
export const uploadQueryFile = async (queryId, file) => {
  const formData = new FormData();
  formData.append("file", file);
  
  const { data } = await axios.post(
    `${API_BASE}/queries/${queryId}/upload`,
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

// Resolve or close a support query
export const resolveQuery = async (queryId, status = "resolved") => {
  const { data } = await axios.put(
    `${API_BASE}/queries/${queryId}/resolve`,
    { status },
    { headers: getHeaders() }
  );
  return data;
};

// Delete a support message for everyone
export const deleteQueryMessage = async (messageId) => {
  const { data } = await axios.delete(`${API_BASE}/messages/${messageId}`, {
    headers: getHeaders(),
  });
  return data;
};

// Edit a support message
export const editQueryMessage = async (messageId, content) => {
  const { data } = await axios.put(`${API_BASE}/messages/${messageId}`, { content }, {
    headers: getHeaders(),
  });
  return data;
};
