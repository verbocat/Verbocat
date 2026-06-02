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

export const translateBatch = async (segments, target) => {
  const response = await api.post("/api/translate-batch", {
    segments,
    target
  });
  return response.data;
};

export const exportHtmlFile = async (fileId, segments) => {
  const response = await api.post(
    "/api/export-html",
    { fileId, segments },
    { responseType: "blob" }
  );

  return new Blob([response.data]);
};
