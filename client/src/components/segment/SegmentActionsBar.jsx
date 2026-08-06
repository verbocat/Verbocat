import React from "react";
import { Check, Copy, Undo } from "lucide-react";

export const SegmentActionsBar = ({ onConfirm, onCopySource, onReset, isConfirmed, disabled }) => {
  return (
    <div className="flex items-center gap-1 select-none">
      <button
        type="button"
        onClick={onCopySource}
        disabled={disabled}
        title="Copy Source to Target"
        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all cursor-pointer disabled:opacity-40"
      >
        <Copy size={13} />
      </button>

      {isConfirmed ? (
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          title="Revert to Draft"
          className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20 transition-all cursor-pointer disabled:opacity-40"
        >
          <Undo size={13} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled}
          title="Confirm Segment"
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40"
        >
          <Check size={13} />
          <span>Confirm</span>
        </button>
      )}
    </div>
  );
};
