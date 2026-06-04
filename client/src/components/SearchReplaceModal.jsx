import { useState, useEffect, useRef } from "react";
import { Icons } from "./Icons.jsx";

export const SearchReplaceModal = ({ show, onClose, onReplaceAll, theme }) => {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (show && inputRef.current) {
      inputRef.current.focus();
    }
  }, [show]);

  if (!show) return null;

  const handleReplace = () => {
    if (!findText) return;
    onReplaceAll(findText, replaceText);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleReplace();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-slate-950/40 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-2xl border shadow-[0_30px_120px_rgba(2,6,23,0.5)] p-5 ${theme.cardStrong}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Icons.Search /> Search & Replace
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition">
            <Icons.X />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className={`text-[10px] uppercase tracking-[0.1em] font-semibold ${theme.muted}`}>Find in Target text</span>
            <input
              ref={inputRef}
              type="text"
              value={findText}
              onChange={e => setFindText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Text to find..."
              className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500/50 ${theme.inputSoft}`}
            />
          </label>

          <label className="block space-y-1.5">
            <span className={`text-[10px] uppercase tracking-[0.1em] font-semibold ${theme.muted}`}>Replace with</span>
            <input
              type="text"
              value={replaceText}
              onChange={e => setReplaceText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Replacement text..."
              className={`w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500/50 ${theme.inputSoft}`}
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${theme.buttonSecondary}`}
          >
            Cancel
          </button>
          <button 
            onClick={handleReplace}
            disabled={!findText}
            className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-bold hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Replace All
          </button>
        </div>
      </div>
    </div>
  );
};
