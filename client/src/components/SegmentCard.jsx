import { useState, useRef, useEffect } from "react";
import { Icons } from "./Icons.jsx";

const GlossaryHighlight = ({ term, children }) => {
  const [show, setShow] = useState(false);
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(term.target);
  };
  return (
    <span 
      className="relative inline-block group"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <mark className="bg-amber-200 text-amber-900 rounded-sm px-0.5 cursor-pointer">{children}</mark>
      {show && (
        <span 
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 text-white font-semibold text-xs rounded shadow-lg z-50 whitespace-nowrap cursor-text select-text flex items-center gap-2 border border-white/10"
          onMouseEnter={() => setShow(true)}
        >
          {term.target}
          <button 
            onClick={handleCopy}
            className="p-1 hover:bg-white/20 rounded transition text-sky-300"
            title="Copy to clipboard"
          >
            <Icons.Copy className="w-3 h-3" />
          </button>
        </span>
      )}
    </span>
  );
};

export const SegmentCard = ({
  darkMode,
  index,
  segment,
  theme,
  translationGlossary = [],
  onCopy,
  onUpdateTranslation,
  onToggleVerify,
  onVerifyAndNext
}) => {
  const sourceRef = useRef(null);
  const targetRef = useRef(null);

  useEffect(() => {
    if (targetRef.current) {
      targetRef.current.style.height = "auto";
      targetRef.current.style.height = `${targetRef.current.scrollHeight}px`;
    }
  }, [segment.target]);

  const renderHighlightedSource = (text) => {
    if (!text) return null;
    if (!translationGlossary || translationGlossary.length === 0) return text;

    let elements = [text];
    
    translationGlossary.forEach((term) => {
      if (!term.source) return;
      const regex = new RegExp(`(${term.source.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')})`, 'gi');
      
      elements = elements.flatMap(el => {
        if (typeof el === 'string') {
          const parts = el.split(regex);
          return parts.map((part, i) => {
            if (i % 2 === 1) { // This is the match
              return <GlossaryHighlight key={`${term.source}-${i}`} term={term}>{part}</GlossaryHighlight>;
            }
            return part;
          });
        }
        return el;
      });
    });

    return elements;
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onVerifyAndNext();
    }
  };

  const handleAutoResize = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  return (
  <article
    id={`segment-${segment.id}`}
    className={`border-l-4 ${segment.verified ? 'border-teal-500' : segment.target ? theme.status.translated : theme.status.empty}`}
  >
    <div className="grid gap-3 px-3 py-3 lg:grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex items-start justify-between lg:block">
        <div className="text-xl font-bold">{index + 1}</div>
        <div className="mt-0 flex flex-wrap gap-2 lg:mt-3 lg:flex-col">
          {segment.fuzzyScore && (
            <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200 ring-1 ring-amber-300/20">
              Fuzzy {segment.fuzzyScore}%
            </span>
          )}
          {segment.qaIssues?.length > 0 && (
            <span className="rounded-lg bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-300 ring-1 ring-rose-400/20">
              {segment.qaIssues.length} QA
            </span>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onUpdateTranslation(segment.id, segment.source)}
            title="Copy Source to Target"
            className={`rounded-lg p-2 transition text-slate-400 hover:text-white ${theme.buttonSecondary}`}
          >
            <Icons.ArrowRight />
          </button>
          <button
            onClick={() => onCopy(segment.source)}
            title="Copy Source Text"
            className={`rounded-lg p-2 transition text-slate-400 hover:text-white ${theme.buttonSecondary}`}
          >
            <Icons.Copy />
          </button>
        </div>

        <div
          className={`min-h-[40px] w-full break-words rounded-xl border p-3 whitespace-pre-wrap ${theme.inputSoft}`}
        >
          {renderHighlightedSource(segment.source)}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className={`text-sm ${theme.muted}`}>
            {segment.verified ? (
              <span className="text-teal-500 font-bold flex items-center gap-1"><Icons.Check /> Verified</span>
            ) : segment.target ? "Ready to edit" : "Waiting for translation"}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleVerify}
              title={segment.verified ? 'Unverify' : 'Verify'}
              className={`rounded-lg p-2 transition ${segment.verified ? 'bg-teal-700 text-white hover:bg-teal-600' : `text-slate-400 hover:text-white ${theme.buttonSecondary}`}`}
            >
              <Icons.Check />
            </button>
            <button
              onClick={() => onCopy(segment.target || "")}
              title="Copy Target Text"
              className={`rounded-lg p-2 transition text-slate-400 hover:text-white ${theme.buttonSecondary}`}
            >
              <Icons.Copy />
            </button>
          </div>
        </div>

        <textarea
          id={`target-${segment.id}`}
          ref={targetRef}
          data-segment-target="true"
          value={segment.target || ""}
          onChange={(event) => onUpdateTranslation(segment.id, event.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleAutoResize}
          placeholder="Translation will appear here... (Press Ctrl+Enter to verify and move to next)"
          className={`min-h-[40px] w-full resize-none overflow-hidden rounded-xl border p-3 outline-none focus:ring-2 ${segment.verified ? 'focus:ring-teal-500' : 'focus:ring-sky-300'} ${theme.input}`}
        />

        {segment.qaIssues?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {segment.qaIssues.map((issue, issueIndex) => (
              <span
                key={`${segment.id}-issue-${issueIndex}`}
                className="rounded-lg bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-300 ring-1 ring-rose-400/20"
              >
                {issue}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  </article>
);
};
