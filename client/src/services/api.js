import axios from "axios";

const api = axios.create({
  // If VITE_API_URL is set at build/runtime, use it. Otherwise use
  // an empty baseURL so requests go to the current origin.
  baseURL: import.meta.env.VITE_API_URL || ""
});

// Automatically inject JWT authentication token to headers
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("verbocat_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const uploadFile = async (file, sourceLang, targetLang) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("source", sourceLang);
  formData.append("target", targetLang);
  const response = await api.post("/api/upload", formData);
  return response.data;
};

export const translateBatch = async (segments, target, source, contextSettings = null) => {
  const response = await api.post("/api/translate-batch", {
    segments,
    target,
    source,
    contextSettings
  });
  return response.data;
};

export const exportFile = async (fileId, segments, extension = '.html', sourceLang = 'en', targetLang = 'hi', fileName = 'document') => {
  const response = await api.post(
    "/api/export",
    { fileId, segments, extension, sourceLang, targetLang, fileName },
    { responseType: "blob" }
  );

  return new Blob([response.data]);
};

export const exportGlobalTm = async (sourceLang, targetLang) => {
  const response = await api.get(
    `/api/export-global-tm?source=${sourceLang}&target=${targetLang}`,
    { responseType: "blob" }
  );
  return new Blob([response.data]);
};

export const importXliff = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/api/import-xliff", formData);
  return response.data;
};

export const importTmx = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/api/import-tmx", formData);
  return response.data;
};

export const fetchAdminUsers = async () => {
  const response = await api.get("/api/admin/users");
  return response.data;
};

export const updateAdminUser = async (id, data) => {
  const response = await api.put(`/api/admin/users/${id}`, data);
  return response.data;
};

export const deleteAdminUser = async (id) => {
  const response = await api.delete(`/api/admin/users/${id}`);
  return response.data;
};

export const fetchAdminCreditLogs = async () => {
  const response = await api.get("/api/admin/credit-logs");
  return response.data;
};

export const fetchDocument = async (documentId) => {
  const response = await api.get(`/api/documents/${documentId}`);
  return response.data;
};

export const updateSegment = async (documentId, segmentIndex, targetText, status) => {
  const response = await api.put(`/api/documents/${documentId}/segments/${segmentIndex}`, {
    targetText,
    status
  });
  return response.data;
};

export const fetchDocumentAccess = async (documentId) => {
  const response = await api.get(`/api/documents/${documentId}/access`);
  return response.data;
};

export const grantDocumentAccess = async (documentId, email, permission) => {
  const response = await api.post(`/api/documents/${documentId}/access`, {
    email,
    permission
  });
  return response.data;
};

export const revokeDocumentAccess = async (documentId, userId) => {
  const response = await api.delete(`/api/documents/${documentId}/access/${userId}`);
  return response.data;
};

export const searchUsers = async (query) => {
  const response = await api.get(`/api/users/search?query=${query}`);
  return response.data;
};

