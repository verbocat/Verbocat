import { useState, useRef, useEffect } from "react";
import { Icons } from "./Icons.jsx";

const GlossaryHighlight = ({ term, children }) => {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setShow(false), 800);
  };

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(term.target);
  };

  return (
    <span 
      className="relative inline-block group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <mark className="bg-amber-200 text-amber-900 rounded-sm px-0.5 cursor-pointer">{children}</mark>
      {show && (
        <span 
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 text-white font-semibold text-xs rounded shadow-lg z-50 whitespace-nowrap cursor-text select-text flex items-center gap-2 border border-white/10"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
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

const targetToHtml = (str) => {
  if (!str) return "";
  let html = str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/&lt;(\/?\d+)&gt;/g, (match, tagInner) => {
    return `<span class="inline-flex items-center justify-center bg-slate-700 text-sky-300 px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-mono select-none" contenteditable="false" data-tag="${tagInner}">${tagInner}</span>`;
  });
  html = html.replace(/\n/g, "<br>");
  return html;
};

const htmlToTarget = (element) => {
  let result = "";
  const traverse = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Convert non-breaking spaces back to normal spaces if any, though standard is fine
      result += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName.toLowerCase() === "br") {
        result += "\n";
      } else if (node.tagName.toLowerCase() === "div") {
        result += "\n";
        node.childNodes.forEach(traverse);
      } else if (node.hasAttribute("data-tag")) {
        result += `<${node.getAttribute("data-tag")}>`;
      } else {
        node.childNodes.forEach(traverse);
      }
    }
  };
  element.childNodes.forEach(traverse);
  // Clean up any leading newline from div wrapping
  return result.replace(/^\n/, "");
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
  const targetRef = useRef(null);
  const lastSavedTargetRef = useRef(segment.target || "");
  const [suggestions, setSuggestions] = useState([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  // Reset innerHTML when the segment ID changes (recycled by Virtuoso)
  useEffect(() => {
    if (targetRef.current) {
      targetRef.current.innerHTML = targetToHtml(segment.target || "");
      lastSavedTargetRef.current = segment.target || "";
    }
  }, [segment.id]);

  // Sync external changes to target (e.g. from translation API or undo/redo)
  useEffect(() => {
    if (targetRef.current) {
      if (segment.target !== lastSavedTargetRef.current) {
        targetRef.current.innerHTML = targetToHtml(segment.target || "");
        lastSavedTargetRef.current = segment.target || "";
      }
    }
  }, [segment.target]);

  const renderHighlightedSource = (text) => {
    if (!text) return null;

    let elements = [text];
    
    if (translationGlossary && translationGlossary.length > 0) {
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
    }

    elements = elements.flatMap(el => {
      if (typeof el === 'string') {
        const parts = el.split(/(<\/?\d+>)/g);
        return parts.map((part, i) => {
          if (/^<\/?\d+>$/.test(part)) {
            const inner = part.replace(/[<>]/g, '');
            return (
              <span key={`ph-${i}-${inner}`} className="inline-flex items-center justify-center bg-slate-700/50 text-slate-400 px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-mono select-none border border-white/5">
                {inner}
              </span>
            );
          }
          return part;
        });
      }
      return el;
    });

    return elements;
  };

  const handleInput = (e) => {
    const text = htmlToTarget(e.currentTarget);
    const words = text.split(/[\s\u00a0]+/);
    const lastWord = words[words.length - 1] || "";
    
    if (lastWord.length >= 1 && translationGlossary && translationGlossary.length > 0) {
      const filtered = translationGlossary.filter(term => 
        (term.target && term.target.toLowerCase().startsWith(lastWord.toLowerCase())) ||
        (term.source && term.source.toLowerCase().startsWith(lastWord.toLowerCase()))
      );
      setSuggestions(filtered.slice(0, 5));
      setActiveSuggestionIndex(0);
    } else {
      setSuggestions([]);
    }
  };

  const applySuggestion = (term) => {
    if (!targetRef.current) return;
    const text = htmlToTarget(targetRef.current);
    const words = text.split(/(\s+)/);
    
    let wordIndex = -1;
    for (let i = words.length - 1; i >= 0; i--) {
      if (words[i].trim() !== "") {
        wordIndex = i;
        break;
      }
    }
    
    if (wordIndex !== -1) {
      words[wordIndex] = term.target;
    } else {
      words.push(term.target);
    }
    
    const newTarget = words.join("");
    targetRef.current.innerHTML = targetToHtml(newTarget);
    lastSavedTargetRef.current = newTarget;
    onUpdateTranslation(segment.id, newTarget);
    setSuggestions([]);
    
    setTimeout(() => {
      if (!targetRef.current) return;
      targetRef.current.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(targetRef.current);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }, 10);
  };

  const handleKeyDown = (e) => {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applySuggestion(suggestions[activeSuggestionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSuggestions([]);
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      const newTarget = htmlToTarget(e.currentTarget);
      lastSavedTargetRef.current = newTarget;
      onUpdateTranslation(segment.id, newTarget);
      onVerifyAndNext();
    }
  };

  const handleBlur = (e) => {
    const newTarget = htmlToTarget(e.currentTarget);
    lastSavedTargetRef.current = newTarget;
    if (newTarget !== segment.target) {
      onUpdateTranslation(segment.id, newTarget);
    }
    setTimeout(() => {
      setSuggestions([]);
    }, 200);
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
          className={`min-h-[40px] w-full break-words rounded-xl border p-3 whitespace-pre-wrap leading-relaxed ${theme.inputSoft}`}
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

        <div className="relative">
          <div
            id={`target-${segment.id}`}
            ref={targetRef}
            data-segment-target="true"
            contentEditable={!segment.verified}
            suppressContentEditableWarning={true}
            onBlur={handleBlur}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            className={`min-h-[40px] w-full break-words rounded-xl border p-3 outline-none focus:ring-2 whitespace-pre-wrap leading-relaxed ${segment.verified ? 'focus:ring-teal-500 bg-slate-800/50 cursor-not-allowed opacity-70' : 'focus:ring-sky-300'} ${theme.input} empty:before:content-['Translation_will_appear_here..._(Press_Ctrl_Enter_to_verify_and_move_to_next)'] empty:before:text-slate-500`}
          />

          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 z-[100] mt-1 rounded-xl border p-1.5 shadow-2xl bg-neutral-900 border-white/10 text-white flex flex-col gap-0.5 max-h-48 overflow-y-auto">
              <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-neutral-500 border-b border-white/5 mb-1 flex justify-between items-center select-none">
                <span>Glossary Suggestions</span>
                <span>↑↓ Navigate · Enter/Tab Select</span>
              </div>
              {suggestions.map((term, i) => (
                <button
                  key={`sugg-${segment.id}-${i}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySuggestion(term);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition ${
                    i === activeSuggestionIndex 
                      ? "bg-sky-600/30 text-sky-200 border border-sky-500/20" 
                      : "hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <div className="font-semibold">{term.target}</div>
                  <div className="text-[10px] text-neutral-400 font-mono">{term.source}</div>
                </button>
              ))}
            </div>
          )}
        </div>

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
