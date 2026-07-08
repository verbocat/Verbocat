import axios from "axios";
import { useUserStore } from "./userStore";

const api = axios.create({
  // If VITE_API_URL is set at build/runtime, use it. Otherwise use
  // an empty baseURL so requests go to the current origin.
  baseURL: import.meta.env.VITE_API_URL || ""
});

let refreshPromise = null;

const refreshSessionToken = async () => {
  const refreshToken = localStorage.getItem("centroid_refresh_token");
  if (!refreshToken) throw new Error("No refresh token available");

  if (refreshPromise) return refreshPromise;

  const API_URL = import.meta.env.VITE_API_URL 
    ? `${import.meta.env.VITE_API_URL}/api` 
    : "/api";

  refreshPromise = axios.post(`${API_URL}/auth/refresh`, { refreshToken })
    .then((response) => {
      refreshPromise = null;
      const { token, refreshToken: newRefreshToken, expiresAt, user } = response.data;
      
      // Update store state and localStorage
      useUserStore.getState().login(token, newRefreshToken, expiresAt, user);
      return token;
    })
    .catch((err) => {
      refreshPromise = null;
      useUserStore.getState().logout();
      throw err;
    });

  return refreshPromise;
};

// Automatically inject JWT authentication token to headers and pre-emptively refresh if near expiry
api.interceptors.request.use(async (config) => {
  const expiresAt = localStorage.getItem("centroid_expires_at");
  let token = localStorage.getItem("centroid_token");

  // Pre-emptive refresh: if token will expire in less than 1 minute, refresh it first
  if (token && expiresAt && Date.now() > parseInt(expiresAt, 10) - 60000) {
    try {
      const newToken = await refreshSessionToken();
      if (newToken) {
        token = newToken;
      }
    } catch (e) {
      console.error("Pre-emptive token refresh failed:", e);
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto logout and refresh if token is invalid or expired (fallback retry)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const newToken = await refreshSessionToken();
        if (newToken) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        console.error("Session refresh failed on 401 response:", refreshError);
      }
      
      // If refresh fails or token is rejected, log out completely
      useUserStore.getState().logout();
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export const uploadFile = async (file, sourceLang, targetLang) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("source", sourceLang);
  formData.append("target", targetLang);
  const response = await api.post("/api/upload", formData);
  return response.data;
};

export const translateBatch = async (segments, target, source, contextSettings = null, documentId = null) => {
  const response = await api.post("/api/translate-batch", {
    segments,
    target,
    source,
    contextSettings,
    documentId
  });
  return response.data;
};

export const exportFile = async (fileId, segments, extension = '.html', sourceLang = 'en', targetLang = 'hi', fileName = 'document', exportSource = false) => {
  const response = await api.post(
    "/api/export",
    { fileId, segments, extension, sourceLang, targetLang, fileName, exportSource },
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

export const updateSegment = async (documentId, segmentIndex, targetText, status, contextJira, contextDescription, autoPropagate = true) => {
  const response = await api.put(`/api/documents/${documentId}/segments/${segmentIndex}`, {
    targetText,
    status,
    contextJira,
    contextDescription,
    autoPropagate
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

export const fetchRequestStatus = async (documentId) => {
  const response = await api.get(`/api/documents/${documentId}/request-status`);
  return response.data;
};

export const requestAccess = async (documentId) => {
  const response = await api.post(`/api/documents/${documentId}/request-access`);
  return response.data;
};

export const fetchAccessRequests = async (documentId) => {
  const response = await api.get(`/api/documents/${documentId}/access-requests`);
  return response.data;
};

export const respondToAccessRequest = async (documentId, requestId, action) => {
  const response = await api.post(`/api/documents/${documentId}/access-requests/${requestId}/respond`, { action });
  return response.data;
};

export const translateSegmentWithContext = async (documentId, segmentIndex, { contextJira, contextDescription, screenshot, contextSettings, sourceLang, targetLang }) => {
  const formData = new FormData();
  if (contextJira !== undefined && contextJira !== null) formData.append("contextJira", contextJira);
  if (contextDescription !== undefined && contextDescription !== null) formData.append("contextDescription", contextDescription);
  if (screenshot) formData.append("screenshot", screenshot);
  if (contextSettings) formData.append("contextSettings", JSON.stringify(contextSettings));
  if (sourceLang !== undefined && sourceLang !== null) formData.append("sourceLang", sourceLang);
  if (targetLang !== undefined && targetLang !== null) formData.append("targetLang", targetLang);

  const response = await api.post(`/api/documents/${documentId}/segments/${segmentIndex}/translate-context`, formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });
  return response.data;
};

export const auditDocument = async (documentId, contextSettings) => {
  const response = await api.post(`/api/documents/${documentId}/audit`, { contextSettings });
  return response.data;
};

export const getAuditEstimate = async (documentId, contextSettings) => {
  const response = await api.post(`/api/documents/${documentId}/audit/estimate`, { contextSettings });
  return response.data;
};

export const startAudit = async (documentId, contextSettings) => {
  const response = await api.post(`/api/documents/${documentId}/audit/start`, { contextSettings });
  return response.data;
};

export const cancelAudit = async (documentId, jobId) => {
  const response = await api.post(`/api/documents/${documentId}/audit/cancel/${jobId}`);
  return response.data;
};

export const getAuditStatus = async (documentId, jobId) => {
  const response = await api.get(`/api/documents/${documentId}/audit/status/${jobId}`);
  return response.data;
};

export const updateDocumentLanguages = async (documentId, sourceLang, targetLang) => {
  const response = await api.put(`/api/documents/${documentId}/languages`, { sourceLang, targetLang });
  return response.data;
};

export const toggleTrackChanges = async (documentId, enabled) => {
  const response = await api.post(`/api/documents/${documentId}/track-changes`, { enabled });
  return response.data;
};

export const acceptTrackedChange = async (documentId, segmentIndex) => {
  const response = await api.post(`/api/documents/${documentId}/segments/${segmentIndex}/accept-change`);
  return response.data;
};

export const rejectTrackedChange = async (documentId, segmentIndex) => {
  const response = await api.post(`/api/documents/${documentId}/segments/${segmentIndex}/reject-change`);
  return response.data;
};

export const acceptAllTrackedChanges = async (documentId) => {
  const response = await api.post(`/api/documents/${documentId}/accept-all-changes`);
  return response.data;
};

export const fetchPublicAccess = async (documentId) => {
  const response = await api.get(`/api/documents/${documentId}/public-access`);
  return response.data;
};

export const updatePublicAccess = async (documentId, publicAccess) => {
  const response = await api.put(`/api/documents/${documentId}/public-access`, { publicAccess });
  return response.data;
};


