// Utility functions for Project Status formatting, normalization, and styling

export const normalizeStatus = (status) => {
  const s = String(status || "").toLowerCase().trim();
  if (s === "completed" || s === "complete" || s === "done") return "completed";
  if (s === "on hold" || s === "on_hold" || s === "on-hold" || s === "hold" || s === "paused") return "on_hold";
  if (s === "archived" || s === "archive") return "archived";
  return "active";
};

export const formatStatusLabel = (status) => {
  const norm = normalizeStatus(status);
  switch (norm) {
    case "active": return "Active";
    case "completed": return "Completed";
    case "on_hold": return "On Hold";
    case "archived": return "Archived";
    default: return "Active";
  }
};

export const getStatusColorClass = (status) => {
  return "bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] shadow-xs transition-all";
};

export const getStatusDotColor = (status) => {
  const norm = normalizeStatus(status);
  switch (norm) {
    case "active": return "bg-emerald-400 animate-pulse";
    case "completed": return "bg-sky-400";
    case "on_hold": return "bg-amber-400";
    case "archived": return "bg-purple-400";
    default: return "bg-emerald-400 animate-pulse";
  }
};

export const STATUS_OPTIONS = [
  { value: "active", label: "Active", dotColor: "bg-emerald-400" },
  { value: "completed", label: "Completed", dotColor: "bg-sky-400" },
  { value: "on_hold", label: "On Hold", dotColor: "bg-amber-400" },
  { value: "archived", label: "Archived", dotColor: "bg-purple-400" },
];
