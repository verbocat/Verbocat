import axios from "axios";

const api = axios.create({
  // If VITE_API_URL is set at build/runtime, use it. Otherwise use
  // an empty baseURL so requests go to the current origin.
  baseURL: import.meta.env.VITE_API_URL || ""
});

export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
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

export const exportFile = async (fileId, segments, extension = '.html') => {
  const response = await api.post(
    "/api/export",
    { fileId, segments, extension },
    { responseType: "blob" }
  );

  return new Blob([response.data]);
};
