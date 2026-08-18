import axios from "axios";
import { useUserStore } from "./userStore";

const rawBaseUrl = (import.meta.env.VITE_API_URL || "").trim();
const cleanBaseUrl = rawBaseUrl.replace(/\/+$/, "").replace(/\/api$/, "");

export const api = axios.create({
  baseURL: cleanBaseUrl
});

let refreshPromise = null;

const refreshSessionToken = async () => {
  const refreshToken = localStorage.getItem("centroid_refresh_token");
  if (!refreshToken) throw new Error("No refresh token available");

  if (refreshPromise) return refreshPromise;

  const API_URL = cleanBaseUrl ? `${cleanBaseUrl}/api` : "/api";

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

  // Inject tenant subdomain header from URL query param (?space=slug) or browser hostname
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const spaceParam = searchParams.get("space") || searchParams.get("tenant") || searchParams.get("org");
    if (spaceParam) {
      config.headers["X-Tenant-Subdomain"] = spaceParam.toLowerCase().trim();
    } else {
      const hostname = window.location.hostname;
      const parts = hostname.split(".");
      let subdomain = "";
      if (parts.length >= 4) {
        subdomain = parts[0];
      } else if (parts.length === 3 && parts[1] === "lvh" && parts[2] === "me") {
        subdomain = parts[0];
      } else if (parts.length === 2 && parts[1] === "localhost") {
        subdomain = parts[0];
      }

      if (subdomain && !["www", "app", "centroid", "verbolabs", "localhost"].includes(subdomain.toLowerCase())) {
        config.headers["X-Tenant-Subdomain"] = subdomain;
      }
    }
  } catch (_) {}

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const requestUrl = String(originalRequest.url || "");
    const isPublicAuthRoute = requestUrl.includes("/auth/login") ||
                              requestUrl.includes("/auth/register") ||
                              requestUrl.includes("/auth/forgot-password") ||
                              requestUrl.includes("/auth/reset-password") ||
                              requestUrl.includes("/auth/resend-verification") ||
                              requestUrl.includes("/auth/manual-verify");

    const hasRefreshToken = !!localStorage.getItem("centroid_refresh_token");

    if (error.response && error.response.status === 401 && !originalRequest._retry && !isPublicAuthRoute && hasRefreshToken) {
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
      
      // If refresh fails or token is rejected, log out cleanly
      useUserStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export const uploadFile = async (file, sourceLang, targetLang, onProgress = null) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("source", sourceLang);
  formData.append("target", targetLang);
  const response = await api.post("/api/upload", formData, {
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      }
    }
  });
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

export const exportFile = async (fileId, segments, extension = '.html', sourceLang = 'en', targetLang = 'hi', fileName = 'document', exportSource = false, template = null) => {
  try {
    const response = await api.post(
      "/api/export",
      { fileId, template, segments, extension, sourceLang, targetLang, fileName, exportSource },
      { responseType: "blob" }
    );
    return new Blob([response.data]);
  } catch (err) {
    if (err.response && err.response.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const parsed = JSON.parse(text);
        if (parsed.error) {
          throw new Error(parsed.error);
        }
      } catch (parseErr) {
        if (parseErr.message && parseErr.message !== err.message && !parseErr.message.includes("JSON")) {
          throw parseErr;
        }
      }
    }
    throw err;
  }
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

export const importTargetHtml = async (documentId, lang, file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post(`/api/documents/${documentId}/lang/${lang}/import-target-html`, formData);
  return response.data;
};

export const relinkFiles = async (sourceFile, targetFile) => {
  const formData = new FormData();
  formData.append("sourceFile", sourceFile);
  formData.append("targetFile", targetFile);
  const response = await api.post("/api/relink-files", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
};

export const bulkActionSegments = async (documentId, lang, segmentIndices, action) => {
  const response = await api.post(`/api/documents/${documentId}/lang/${lang}/segments/bulk-action`, {
    segmentIndices,
    action
  });
  return response.data;
};

export const fetchAdminUsers = async () => {
  const response = await api.get("/api/admin/users");
  if (Array.isArray(response.data)) return response.data;
  if (response.data && Array.isArray(response.data.users)) return response.data.users;
  return [];
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
  if (Array.isArray(response.data)) return response.data;
  if (response.data && Array.isArray(response.data.logs)) return response.data.logs;
  return [];
};

export const fetchAdminTm = async (search = "", sourceLang = "", targetLang = "") => {
  const response = await api.get(`/api/admin/tm?search=${search}&sourceLang=${sourceLang}&targetLang=${targetLang}`);
  if (Array.isArray(response.data)) return response.data;
  if (response.data && Array.isArray(response.data.tm)) return response.data.tm;
  return [];
};

export const updateAdminTm = async (id, targetText) => {
  const response = await api.put(`/api/admin/tm/${id}`, { target_text: targetText });
  return response.data;
};

export const deleteAdminTm = async (id) => {
  const response = await api.delete(`/api/admin/tm/${id}`);
  return response.data;
};

export const fetchDocument = async (documentId, targetLang = null) => {
  const url = targetLang ? `/api/documents/${documentId}?target=${targetLang}` : `/api/documents/${documentId}`;
  const response = await api.get(url);
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

export const updateSegmentsBulk = async (documentId, updates, autoPropagate = true, targetLang = null) => {
  const url = targetLang
    ? `/api/documents/${documentId}/lang/${targetLang}/segments/bulk`
    : `/api/documents/${documentId}/segments/bulk`;
  const response = await api.post(url, {
    updates,
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

export const fetchProjectShares = async (projectId) => {
  const response = await api.get(`/api/projects/${projectId}/shares`);
  return response.data;
};

export const shareProject = async (projectId, email, accessLevel = "editor") => {
  const response = await api.post(`/api/projects/${projectId}/share`, {
    email,
    accessLevel
  });
  return response.data;
};

export const revokeProjectShare = async (projectId, targetId) => {
  const response = await api.delete(`/api/projects/${projectId}/shares/${targetId}`);
  return response.data;
};

export const duplicateProject = async (projectId, scope = "source_only", newName = null, addTargetLangs = []) => {
  const response = await api.post(`/api/projects/${projectId}/duplicate`, {
    scope,
    newName,
    addTargetLangs
  });
  return response.data;
};

export const executeAIProjectCommand = async (prompt, fileIds = [], projectId = null) => {
  const response = await api.post("/api/projects/ai-command", {
    prompt,
    fileIds,
    projectId
  });
  return response.data;
};

export const addProjectTargetLanguages = async (projectId, targetLangs) => {
  const response = await api.post(`/api/projects/${projectId}/add-languages`, {
    targetLangs
  });
  return response.data;
};

export const setProjectContextNotes = async (projectId, contextNotes) => {
  const response = await api.post(`/api/projects/${projectId}/context`, {
    contextNotes
  });
  return response.data;
};

export const fetchProjectNotes = async (projectId) => {
  const response = await api.get(`/api/projects/${projectId}/notes`);
  return response.data;
};

export const createProjectNote = async (projectId, content, isPinned = false) => {
  const response = await api.post(`/api/projects/${projectId}/notes`, { content, isPinned });
  return response.data;
};

export const updateProjectNote = async (projectId, noteId, data) => {
  const response = await api.put(`/api/projects/${projectId}/notes/${noteId}`, data);
  return response.data;
};

export const deleteProjectNote = async (projectId, noteId) => {
  const response = await api.delete(`/api/projects/${projectId}/notes/${noteId}`);
  return response.data;
};

export const searchUsers = async (query) => {
  const response = await api.get(`/api/auth/users/search?query=${encodeURIComponent(query)}`);
  return response.data?.users || [];
};

export const fetchLinguists = async () => {
  const response = await api.get("/api/auth/users/linguists");
  return response.data?.linguists || [];
};

export const bulkShareDocuments = async (documentIds, emails, permission = "write", targetLang = null) => {
  const response = await api.post("/api/documents/bulk-share", {
    documentIds,
    emails,
    permission,
    targetLang
  });
  return response.data;
};

export const fetchAssignedDocuments = async () => {
  const response = await api.get("/api/documents/assigned");
  return response.data?.assignments || [];
};

export const fetchRequestStatus = async (documentId) => {
  const response = await api.get(`/api/documents/${documentId}/request-status`);
  return response.data;
};

export const requestAccess = async (documentId, permission = "write") => {
  const response = await api.post(`/api/documents/${documentId}/request-access`, { permission });
  return response.data;
};

export const fetchAccessRequests = async (documentId) => {
  const response = await api.get(`/api/documents/${documentId}/access-requests`);
  return response.data;
};

export const respondToAccessRequest = async (documentId, requestId, action) => {
  const response = await api.post(`/api/documents/${documentId}/access-requests/${requestId}/respond`, {
    requestId,
    action
  });
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

export const fetchProjectPublicAccess = async (projectId) => {
  const response = await api.get(`/api/projects/${projectId}/public-access`);
  return response.data;
};

export const updateProjectPublicAccess = async (projectId, publicAccess) => {
  const response = await api.put(`/api/projects/${projectId}/public-access`, { publicAccess });
  return response.data;
};

export const deleteDocument = async (documentId) => {
  const response = await api.delete(`/api/documents/${documentId}`);
  return response.data;
};

// ── PROJECT-BASED TRANSLATION MANAGEMENT SYSTEM CLIENT API ────────────────

export const createProject = async (name, client, description, sourceLanguage, targetLanguages, deadline = null, settings = {}, referenceFile = null) => {
  if (referenceFile) {
    const formData = new FormData();
    formData.append("name", name);
    if (client) formData.append("client", client);
    if (description) formData.append("description", description);
    formData.append("sourceLanguage", sourceLanguage);
    formData.append("targetLanguages", JSON.stringify(targetLanguages));
    if (deadline) formData.append("dueDate", deadline);
    formData.append("settings", JSON.stringify(settings));
    formData.append("referenceFile", referenceFile);

    const response = await api.post("/api/projects", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return response.data;
  }

  const response = await api.post("/api/projects", {
    name,
    client,
    description,
    sourceLanguage,
    targetLanguages,
    deadline,
    dueDate: deadline,
    settings
  });
  return response.data;
};

export const uploadProjectReferenceFile = async (projectId, referenceFile) => {
  const formData = new FormData();
  formData.append("referenceFile", referenceFile);
  const response = await api.post(`/api/projects/${projectId}/reference-file`, formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
};

export const fetchProjects = async () => {
  const response = await api.get("/api/projects");
  if (Array.isArray(response.data)) return response.data;
  if (response.data && Array.isArray(response.data.projects)) return response.data.projects;
  return [];
};

export const fetchGlobalHistory = async () => {
  const response = await api.get("/api/projects/history");
  if (Array.isArray(response.data)) return response.data;
  if (response.data && Array.isArray(response.data.history)) return response.data.history;
  return [];
};

export const fetchProjectActivities = async (projectId) => {
  const response = await api.get(`/api/projects/${projectId}/activities`);
  if (Array.isArray(response.data)) return response.data;
  if (response.data && Array.isArray(response.data.activities)) return response.data.activities;
  return [];
};

export const fetchProjectDetails = async (projectId) => {
  const response = await api.get(`/api/projects/${projectId}`);
  return response.data;
};

export const deleteProject = async (projectId) => {
  const response = await api.delete(`/api/projects/${projectId}`);
  return response.data;
};

export const uploadFileToProject = async (projectId, file, onProgress = null) => {
  const formData = new FormData();
  formData.append("file", file);
  console.log(`[FRONTEND_API] POST /api/projects/${projectId}/upload -> Starting HTTP upload of "${file.name}" (${file.size} bytes)...`);
  const response = await api.post(`/api/projects/${projectId}/upload`, formData, {
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        console.log(`[FRONTEND_UPLOAD_HTTP_PROGRESS] "${file.name}": ${percentCompleted}% sent over wire (${(progressEvent.loaded / 1024).toFixed(1)} KB / ${(progressEvent.total / 1024).toFixed(1)} KB)`);
        if (percentCompleted === 100) {
          console.log(`[FRONTEND_UPLOAD_SERVER_WAIT] HTTP bytes sent! Waiting for server to parse document & save segments...`);
        }
        if (onProgress) onProgress(percentCompleted);
      }
    }
  });
  console.log(`[FRONTEND_API_SUCCESS] Server finished processing "${file.name}"! Response received:`, response.data);
  return response.data;
};

export const updateProjectLanguages = async (projectId, targetLanguages) => {
  const response = await api.post(`/api/projects/${projectId}/add-languages`, {
    targetLangs: targetLanguages,
    targetLanguages
  });
  return response.data;
};

export const fetchJobSegments = async (jobId) => {
  const response = await api.get(`/api/jobs/${jobId}/segments`);
  return response.data;
};

export const updateJobSegment = async (jobId, segmentIndex, targetText, status, contextJira = null, contextDescription = null, autoPropagate = true) => {
  const response = await api.put(`/api/jobs/${jobId}/segments/${segmentIndex}`, {
    targetText,
    status,
    contextJira,
    contextDescription,
    autoPropagate
  });
  return response.data;
};

export const translateJobSegmentContext = async (jobId, segmentIndex, { contextJira, contextDescription, screenshot, contextSettings }) => {
  const formData = new FormData();
  if (contextJira !== undefined && contextJira !== null) formData.append("contextJira", contextJira);
  if (contextDescription !== undefined && contextDescription !== null) formData.append("contextDescription", contextDescription);
  if (screenshot) formData.append("screenshot", screenshot);
  if (contextSettings) formData.append("contextSettings", JSON.stringify(contextSettings));

  const response = await api.post(`/api/jobs/${jobId}/segments/${segmentIndex}/translate-context`, formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });
  return response.data;
};

export const controlJobQueue = async (jobId, action) => {
  const response = await api.post(`/api/jobs/${jobId}/${action}`);
  return response.data;
};

export const fetchJobStatus = async (jobId) => {
  const response = await api.get(`/api/jobs/${jobId}/status`);
  return response.data;
};

export const downloadJobFile = async (jobId, fileName, targetLang, extension = ".html") => {
  const response = await api.get(`/api/jobs/${jobId}/download`, { responseType: "blob" });
  const blob = new Blob([response.data]);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${fileName}_${targetLang}${extension}`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const downloadLanguageZip = async (projectId, lang) => {
  const response = await api.get(`/api/projects/${projectId}/download/lang/${lang}`, { responseType: "blob" });
  const blob = new Blob([response.data]);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `project_${projectId}_${lang}.zip`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const downloadProjectZip = async (projectId) => {
  const response = await api.get(`/api/projects/${projectId}/download/all`, { responseType: "blob" });
  const blob = new Blob([response.data]);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `project_${projectId}_all.zip`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const fetchProjectAnalytics = async (projectId) => {
  const response = await api.get(`/api/projects/${projectId}/analytics`);
  return response.data;
};

export const fetchJobSegmentsByPath = async (documentId, lang) => {
  const response = await api.get(`/api/documents/${documentId}/lang/${lang}/segments`);
  return response.data;
};

export const updateJobSegmentByPath = async (documentId, lang, segmentIndex, targetText, status, contextJira = null, contextDescription = null, autoPropagate = true) => {
  const response = await api.put(`/api/documents/${documentId}/lang/${lang}/segments/${segmentIndex}`, {
    targetText,
    status,
    contextJira,
    contextDescription,
    autoPropagate
  });
  return response.data;
};

export const fetchTmAnalysis = async (documentId, lang) => {
  const response = await api.get(`/api/documents/${documentId}/lang/${lang}/tm-analysis`);
  return response.data;
};

export const translateJobSegmentContextByPath = async (documentId, lang, segmentIndex, { contextJira, contextDescription, screenshot, contextSettings }) => {
  const formData = new FormData();
  if (contextJira !== undefined && contextJira !== null) formData.append("contextJira", contextJira);
  if (contextDescription !== undefined && contextDescription !== null) formData.append("contextDescription", contextDescription);
  if (screenshot) formData.append("screenshot", screenshot);
  if (contextSettings) formData.append("contextSettings", JSON.stringify(contextSettings));

  const response = await api.post(`/api/documents/${documentId}/lang/${lang}/segments/${segmentIndex}/translate-context`, formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });
  return response.data;
};

export const updateProjectDetails = async (projectId, updatedData) => {
  const response = await api.put(`/api/projects/${projectId}`, updatedData);
  return response.data;
};

export const renameDocument = async (documentId, name) => {
  const response = await api.put(`/api/documents/${documentId}/rename`, { name });
  return response.data;
};

export const duplicateDocument = async (documentId) => {
  const response = await api.post(`/api/documents/${documentId}/duplicate`);
  return response.data;
};

export const fetchProtectedRules = async (projectId) => {
  const response = await api.get(`/api/projects/${projectId}/protected-content/rules`);
  return response.data;
};

export const saveProtectedRules = async (projectId, rules) => {
  const response = await api.put(`/api/projects/${projectId}/protected-content/rules`, { rules });
  return response.data;
};

export const scanProtectedContent = async (projectId, options = {}) => {
  const response = await api.post(`/api/projects/${projectId}/protected-content/scan`, { options });
  return response.data;
};

export const fetchDocumentTemplate = async (documentId) => {
  const response = await api.get(`/api/documents/${documentId}/template`);
  return response.data;
};

export const fetchDocumentPreview = async (documentId, segments = null, targetLang = "hi") => {
  try {
    const response = await api.post(
      `/api/documents/${documentId}/preview`,
      { segments, targetLang },
      { responseType: "arraybuffer" }
    );
    return {
      data: response.data,
      contentType: response.headers["content-type"],
      documentType: response.headers["x-document-type"]
    };
  } catch (err) {
    // Axios wraps non-2xx responses as errors when responseType is arraybuffer.
    // Decode the arraybuffer response body to extract the server's JSON error message.
    if (err.response && err.response.data instanceof ArrayBuffer) {
      try {
        const text = new TextDecoder("utf-8").decode(err.response.data);
        const parsed = JSON.parse(text);
        if (parsed && parsed.error) {
          const decodedError = new Error(parsed.error);
          decodedError.status = err.response.status;
          throw decodedError;
        }
      } catch (decodeErr) {
        if (decodeErr.status) throw decodeErr; // re-throw if we already built a nice error
      }
    }
    throw err;
  }
};

export const fetchAdminOrganizations = async () => {
  const response = await api.get("/api/admin/organizations");
  if (Array.isArray(response.data)) return response.data;
  if (response.data && Array.isArray(response.data.organizations)) return response.data.organizations;
  return [];
};

export const createAdminOrganization = async (data) => {
  const response = await api.post("/api/admin/organizations", data);
  return response.data;
};

export const updateAdminOrganization = async (id, data) => {
  const response = await api.put(`/api/admin/organizations/${id}`, data);
  return response.data;
};

export const deleteAdminOrganization = async (id) => {
  const response = await api.delete(`/api/admin/organizations/${id}`);
  return response.data;
};

export const fetchMySpaces = async () => {
  const response = await api.get("/api/auth/my-spaces");
  if (Array.isArray(response.data)) return response.data;
  if (response.data && Array.isArray(response.data.spaces)) return response.data.spaces;
  return [];
};

export const joinSpace = async (spaceSlug) => {
  const response = await api.post("/api/auth/join-space", { spaceSlug });
  return response.data;
};

// --- SCREENSHOT LINKING API HELPERS ---
export const uploadDocumentScreenshot = async (documentId, file, caption = "") => {
  const formData = new FormData();
  formData.append("screenshot", file);
  if (caption) formData.append("caption", caption);

  const response = await api.post(`/api/documents/${documentId}/screenshots`, formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
};

export const fetchDocumentScreenshots = async (documentId) => {
  const response = await api.get(`/api/documents/${documentId}/screenshots`);
  return response.data;
};

export const linkSegmentScreenshot = async (segmentId, documentId, screenshotId, boundingBox = null, unlink = false) => {
  const response = await api.post(`/api/segments/${segmentId}/screenshot-link`, {
    documentId,
    screenshotId,
    boundingBox,
    unlink
  });
  return response.data;
};

export const deleteScreenshot = async (screenshotId) => {
  const response = await api.delete(`/api/screenshots/${screenshotId}`);
  return response.data;
};






