import React from "react";

export const SegmentStatusBadge = ({ status }) => {
  switch (status) {
    case "translated":
    case "confirmed":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Confirmed
        </span>
      );
    case "in_review":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
          Review
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20 uppercase tracking-wider">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Draft
        </span>
      );
  }
};
