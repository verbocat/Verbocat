import React from "react";

export const LoadingOverlay = ({ isUploading, isLoadingDocument, message, theme }) => {
  if (!isUploading && !isLoadingDocument && !message) return null;

  const displayMessage = message || (isUploading ? "Uploading file & extracting text..." : "Loading document...");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-xs transition-all duration-200">
      <div className="flex flex-col items-center gap-3 rounded-2xl p-6 shadow-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-primary)]">
        <div className="animate-spin rounded-full h-7 w-7 border-2 border-indigo-500 border-t-transparent"></div>
        <p className="text-xs font-semibold tracking-wide text-[var(--text-secondary)]">
          {displayMessage}
        </p>
      </div>
    </div>
  );
};
