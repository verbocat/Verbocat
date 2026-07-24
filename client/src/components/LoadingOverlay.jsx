import React from "react";

export const LoadingOverlay = ({ isUploading, isLoadingDocument, message, theme }) => {
  if (!isUploading && !isLoadingDocument && !message) return null;

  const displayMessage = message || (isUploading ? "Uploading file & extracting text..." : "Loading document...");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-xs transition-all duration-200">
      <div className="flex flex-col items-center gap-3 rounded-2xl p-6 shadow-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-primary)]">
        <div className="w-48 bg-[var(--bg-input)] h-2 rounded-full overflow-hidden border border-[var(--border-subtle)] relative my-1">
          <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 h-full w-full rounded-full animate-pulse" />
        </div>
        <p className="text-xs font-semibold tracking-wide text-[var(--text-secondary)]">
          {displayMessage}
        </p>
      </div>
    </div>
  );
};
