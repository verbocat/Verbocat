import { useState, useRef, useEffect } from "react";
import { Copy, Check, ArrowRight, CornerDownRight, AlertTriangle } from "lucide-react";

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
      <mark className="bg-amber-500/20 text-amber-200 border-b border-amber-400/50 rounded-sm px-0.5 cursor-pointer">{children}</mark>
      {show && (
        <span 
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 bg-slate-950 text-white font-semibold text-[11px] rounded-lg shadow-2xl z-50 whitespace-nowrap cursor-text select-text flex items-center gap-2 border border-white/10"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <span>{term.target}</span>
          <button 
            onClick={handleCopy}
            className="p-1 hover:bg-white/15 rounded text-sky-400 transition"
            title="Copy to clipboard"
          >
            <Copy className="w-3 h-3" />
          </button>
        </span>
      )}
    </span>
  );
};

const targetToHtml = (str) => {
  if (!str) return "";
  let html = str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/&lt;(\/?\d+|\/?(?:g|ph|x|bpt|ept|it)[^&>]*)&gt;/gi, (match, tagInner) => {
    let displayName = tagInner;
    if (!/^\/?\d+$/.test(tagInner)) {
      const idMatch = tagInner.match(/id=(?:&quot;|"|')([^"']+)("|&quot;|')/i);
      if (idMatch) {
        const isClosing = tagInner.startsWith('/');
        const tagName = tagInner.replace(/^\//, '').split(/[\s/]/)[0];
        displayName = (isClosing ? '/' : '') + tagName + idMatch[1];
      }
    }
    const escapedTagInner = tagInner.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    return `<span class="inline-flex items-center justify-center bg-neutral-900 border border-white/8 text-violet-300 px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-mono select-none" contenteditable="false" data-tag="${escapedTagInner}">${displayName}</span>`;
  });
  html = html.replace(/\n/g, "<br>");
  return html;
};

const htmlToTarget = (element) => {
  let result = "";
  const traverse = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
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

  // Sync state recycles by Virtuoso
  useEffect(() => {
    if (targetRef.current) {
      targetRef.current.innerHTML = targetToHtml(segment.target || "");
      lastSavedTargetRef.current = segment.target || "";
    }
  }, [segment.id]);

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
        const regex = new RegExp(`(${term.source.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')})`, 'gi');
        
        elements = elements.flatMap(el => {
          if (typeof el === 'string') {
            const parts = el.split(regex);
            return parts.map((part, i) => {
              if (i % 2 === 1) {
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
        const parts = el.split(/(<\/?\d+>|<\/?(?:g|ph|x|bpt|ept|it)[^>]*>)/gi);
        return parts.map((part, i) => {
          if (/^<\/?\d+>$/.test(part) || /^<\/?(?:g|ph|x|bpt|ept|it)[^>]*>$/i.test(part)) {
            const inner = part.replace(/[<>]/g, '');
            let displayName = inner;
            if (!/^\/?\d+$/.test(inner)) {
              const idMatch = inner.match(/id=(?:&quot;|"|')([^"']+)("|&quot;|')/i);
              if (idMatch) {
                const isClosing = inner.startsWith('/');
                const tagName = inner.replace(/^\//, '').split(/[\s/]/)[0];
                displayName = (isClosing ? '/' : '') + tagName + idMatch[1];
              }
            }
            return (
              <span key={`ph-${i}-${inner}`} className="inline-flex items-center justify-center bg-neutral-900 border border-white/5 text-neutral-400 px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-mono select-none" title={inner}>
                {displayName}
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
      className={`relative overflow-hidden rounded-2xl border transition-all duration-300 bg-[#090b11]/30 border-white/5 px-3 py-3 md:px-4 md:py-3.5 ${
        segment.verified 
          ? 'border-l-2 border-l-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.02)]' 
          : segment.target 
            ? 'border-l-2 border-l-violet-500/60 shadow-[0_0_15px_rgba(139,92,246,0.02)]' 
            : 'border-l-2 border-l-neutral-700/60'
      }`}
    >
      <div className="flex flex-col md:grid md:grid-cols-[48px_minmax(0,1fr)_auto_minmax(0,1fr)_auto] md:items-center gap-4">
        
        {/* ========================================================
            COLUMN 1: Segment Number Badge (Minimalist)
            ======================================================== */}
        <div className="flex md:flex-col items-center justify-between md:justify-center gap-1.5 shrink-0 select-none">
          <div className="text-[10px] font-mono font-bold text-neutral-400 bg-neutral-950/40 border border-white/5 px-2 py-0.5 rounded-lg min-w-[32px] text-center shadow-inner">
            {String(index + 1).padStart(2, "0")}
          </div>
          
          {/* Fuzzy matching & QA issue badges */}
          <div className="flex items-center md:flex-col gap-1">
            {segment.fuzzyScore && (
              <span className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-200" title={`Fuzzy match score: ${segment.fuzzyScore}%`}>
                {segment.fuzzyScore}%
              </span>
            )}
            {segment.qaIssues?.length > 0 && (
              <span className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-300 flex items-center gap-0.5" title={`${segment.qaIssues.length} QA issue detected`}>
                <AlertTriangle className="h-2.5 w-2.5 text-rose-400" />
                <span>QA</span>
              </span>
            )}
          </div>
        </div>

        {/* ========================================================
            COLUMN 2: Source Text Block
            ======================================================== */}
        <div className="relative min-h-[32px] w-full bg-neutral-950/45 border border-white/5 rounded-xl p-2 pr-8 text-white leading-relaxed text-[11px] font-medium">
          <div className="break-words select-text">{renderHighlightedSource(segment.source)}</div>
          
          <button
            onClick={() => onCopy(segment.source)}
            className="absolute right-2 top-2 p-1 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition-all duration-200 cursor-pointer"
            title="Copy source text to clipboard"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>

        {/* ========================================================
            COLUMN 3: Middle Link Arrow (Static Indicator)
            ======================================================== */}
        <div className="flex items-center justify-center rotate-90 md:rotate-0 shrink-0 select-none text-neutral-600">
          <ArrowRight className="h-4 w-4" />
        </div>

        {/* ========================================================
            COLUMN 4: Target Translation Block
            ======================================================== */}
        <div className="flex flex-col w-full min-w-0">
          
          {/* Status badge row */}
          <div className="flex items-center gap-1.5 mb-1.5 select-none text-[9px] font-bold">
            <span className={`h-1.5 w-1.5 rounded-full ${
              segment.verified 
                ? 'bg-emerald-500 animate-pulse' 
                : segment.target 
                  ? 'bg-indigo-400' 
                  : 'bg-violet-500'
            }`} />
            <span className={`${
              segment.verified 
                ? 'text-emerald-400' 
                : segment.target 
                  ? 'text-indigo-300' 
                  : 'text-violet-400'
            }`}>
              {segment.verified ? "Verified" : segment.target ? "Ready to verify" : "Waiting for translation"}
            </span>
          </div>

          {/* Autocomplete Input Container */}
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
              className={`min-h-[38px] w-full break-words rounded-xl border border-white/5 bg-neutral-950/45 p-2.5 outline-none focus:border-violet-500/35 focus:ring-2 focus:ring-violet-500/10 whitespace-pre-wrap leading-relaxed text-[12px] font-medium text-white transition-all duration-300 ${
                segment.verified ? 'bg-slate-900/10 cursor-not-allowed opacity-60' : 'empty:before:content-["Translation_will_appear_here..."]'
              }`}
            />

            {/* Glossary Suggestions Overlay */}
            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 z-[100] mt-1 rounded-xl border border-white/8 p-1.5 shadow-2xl bg-[#0d0e14] text-white flex flex-col gap-0.5 max-h-48 overflow-y-auto custom-scrollbar">
                <div className="px-2 py-1 text-[8px] font-mono uppercase tracking-wider text-neutral-500 border-b border-white/5 mb-1 flex justify-between items-center select-none">
                  <span>Glossary Suggestions</span>
                  <span>↑↓ Navigate · Enter Select</span>
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
                        ? "bg-violet-600/35 text-violet-200 border border-violet-500/30" 
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

          {/* Help instructions (Ctrl+Enter indicator) */}
          {!segment.verified && (
            <span className="text-[9px] text-neutral-500 font-mono mt-1 px-1 select-none">
              Press Ctrl Enter to verify and move to next
            </span>
          )}
        </div>

        {/* ========================================================
            COLUMN 5: Action Verification Buttons
            ======================================================== */}
        <div className="flex items-center gap-1.5 justify-end md:justify-center shrink-0">
          
          {/* Copy Source to Target Button */}
          <button
            onClick={() => onUpdateTranslation(segment.id, segment.source)}
            title="Copy source text to target editor"
            className="rounded-lg p-2 border border-white/5 bg-neutral-900/40 text-neutral-400 hover:text-white hover:bg-white/5 transition-all duration-200 cursor-pointer active:scale-95"
          >
            <CornerDownRight className="h-4 w-4" />
          </button>

          {/* Verify Check Button */}
          <button
            onClick={onToggleVerify}
            title={segment.verified ? 'Unverify segment' : 'Verify segment'}
            className={`rounded-lg p-2 border transition-all duration-200 cursor-pointer active:scale-95 ${
              segment.verified 
                ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-500/10' 
                : 'bg-neutral-900/40 border-white/5 text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Check className="h-4 w-4" />
          </button>

          {/* Copy Target Button */}
          <button
            onClick={() => onCopy(segment.target || "")}
            title="Copy target translation to clipboard"
            className="rounded-lg p-2 border border-white/5 bg-neutral-900/40 text-neutral-400 hover:text-white hover:bg-white/5 transition-all duration-200 cursor-pointer active:scale-95"
          >
            <Copy className="h-4 w-4" />
          </button>

        </div>

      </div>

      {/* Inline QA Errors panel underneath card */}
      {segment.qaIssues?.length > 0 && (
        <div className="mt-4 border-t border-white/5 pt-3 space-y-1.5 select-none">
          <span className="text-[9px] font-mono uppercase tracking-widest text-rose-400 block px-1">
            QA checks failed:
          </span>
          <div className="flex flex-wrap gap-2">
            {segment.qaIssues.map((issue, issueIndex) => (
              <span
                key={`${segment.id}-issue-${issueIndex}`}
                className="rounded-lg bg-rose-500/10 border border-rose-500/15 py-1 px-2.5 text-[10px] font-semibold text-rose-300"
              >
                {issue}
              </span>
            ))}
          </div>
        </div>
      )}

    </article>
  );
};
