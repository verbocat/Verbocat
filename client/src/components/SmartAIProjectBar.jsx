import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  X,
  CornerDownLeft,
  User,
  Trash2
} from "lucide-react";
import { executeAIProjectCommand } from "../services/api";

export function SmartAIProjectBar({
  projectId = null,
  onSuccess,
  showToast,
  onOpenDuplicateModal
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const inputRef = useRef(null);
  const chatScrollContainerRef = useRef(null);

  // Focus input and scroll chat on open or new message
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && chatScrollContainerRef.current) {
      chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
    }
  }, [messages, loading, isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleExecute = async (e) => {
    if (e) e.preventDefault();
    const commandText = prompt.trim();
    if (!commandText) return;

    // Add user message to chat
    const userMsgId = Date.now();
    const newMessages = [
      ...messages,
      {
        id: userMsgId,
        sender: "user",
        text: commandText,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      }
    ];
    setMessages(newMessages);
    setPrompt("");
    setLoading(true);

    try {
      const res = await executeAIProjectCommand(commandText, [], projectId);

      if (res.requiresClarification && res.clarificationType === "duplication_scope") {
        if (onOpenDuplicateModal) {
          onOpenDuplicateModal(res.projectId || projectId);
        }
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: "ai",
            text: "Please select the project duplication scope in the popup window.",
            type: "info",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          }
        ]);
        return;
      }

      if (res.success) {
        const msg = res.message || "AI Command executed successfully";
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: "ai",
            text: msg,
            type: "success",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          }
        ]);
        if (onSuccess) onSuccess(res);
      } else {
        const errMsg = res.error || "Failed to execute AI command.";
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: "ai",
            text: errMsg,
            type: "error",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          }
        ]);
      }
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || err.message || "AI Command execution failed";
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: "ai",
          text: errMsg,
          type: "error",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes minimalFadeSlide {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes subtlePulse {
          0%, 100% {
            opacity: 0.75;
          }
          50% {
            opacity: 1;
          }
        }
        .minimal-bubble-enter {
          animation: minimalFadeSlide 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .minimal-sparkle {
          animation: subtlePulse 3s ease-in-out infinite;
        }
        .custom-chat-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-chat-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-chat-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(120, 120, 120, 0.25);
          border-radius: 9999px;
        }
      `}</style>

      {/* ── TRANSLUCENT MINIMAL BACKDROP WITH CHAT FEED ── */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/15 backdrop-blur-xs transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-auto flex flex-col items-center justify-between pb-20 pt-6 px-4"
        >
          {/* Scrollable Chat Feed Container */}
          <div
            ref={chatScrollContainerRef}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl flex-1 overflow-y-auto custom-chat-scrollbar pointer-events-auto px-4 py-4"
            style={{ overscrollBehavior: "contain" }}
          >
            {messages.length > 0 && (
              <div className="flex flex-col gap-3 min-h-full">
                {/* Elastic Spacer */}
                <div className="flex-1 min-h-4" />

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`minimal-bubble-enter flex items-end gap-2.5 ${
                      msg.sender === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {/* AI Avatar */}
                    {msg.sender === "ai" && (
                      <div className="h-7 w-7 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-indigo-500 shrink-0 shadow-xs">
                        <Sparkles size={13} />
                      </div>
                    )}

                    {/* Minimal Luxury Message Bubble */}
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs shadow-md backdrop-blur-xl transition-all ${
                        msg.sender === "user"
                          ? "bg-indigo-600 text-white rounded-br-xs font-medium"
                          : msg.type === "error"
                          ? "bg-rose-950/85 text-rose-200 border border-rose-500/30 rounded-bl-xs"
                          : "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-bl-xs font-medium"
                      }`}
                    >
                      <div className="leading-relaxed whitespace-pre-wrap break-words">{msg.text}</div>
                      <div
                        className={`text-[9px] mt-1 font-mono text-right ${
                          msg.sender === "user" ? "text-white/60" : "text-[var(--text-muted)]"
                        }`}
                      >
                        {msg.time}
                      </div>
                    </div>

                    {/* User Avatar */}
                    {msg.sender === "user" && (
                      <div className="h-7 w-7 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-secondary)] flex items-center justify-center shrink-0 text-xs">
                        <User size={13} />
                      </div>
                    )}
                  </div>
                ))}

                {/* Processing Indicator */}
                {loading && (
                  <div className="minimal-bubble-enter flex items-center gap-2.5 justify-start">
                    <div className="h-7 w-7 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-indigo-500 shrink-0 shadow-xs">
                      <Loader2 size={13} className="animate-spin" />
                    </div>
                    <div className="bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded-xl rounded-bl-xs px-3.5 py-2 text-xs flex items-center gap-2 shadow-xs">
                      <span className="font-medium text-[11px]">Executing command...</span>
                      <div className="flex gap-1 items-center">
                        <span className="h-1.5 w-1.5 rounded-xs bg-indigo-500 animate-pulse" />
                        <span className="h-1.5 w-1.5 rounded-xs bg-indigo-500 animate-pulse [animation-delay:0.2s]" />
                        <span className="h-1.5 w-1.5 rounded-xs bg-indigo-500 animate-pulse [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 10X SMOOTHER MINIMAL LUXURY BOTTOM DOCK AI COMMAND CAPSULE ── */}
      <div
        className="fixed bottom-6 left-1/2 z-50 pointer-events-auto transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform"
        style={{
          transform: isOpen
            ? "translate(-50%, 0)"
            : "translate(calc(50vw - 100% - 24px), 0)",
          width: isOpen ? "min(92vw, 560px)" : "126px"
        }}
      >
        {/* Crisp Frosted Glass Container */}
        <div
          className={`relative overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isOpen
              ? "bg-[var(--bg-surface)]/98 border border-[var(--border-medium)] shadow-2xl shadow-black/15 rounded-xl p-1.5 pl-3 backdrop-blur-2xl"
              : "bg-[var(--bg-surface)]/95 hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-indigo-500/40 shadow-lg rounded-xl px-3 py-1.5 backdrop-blur-xl flex items-center justify-center cursor-pointer"
          }`}
          onClick={() => {
            if (!isOpen) setIsOpen(true);
          }}
        >
          {isOpen ? (
            /* ── EXPANDED COMMAND INPUT ── */
            <form
              onSubmit={handleExecute}
              className="flex items-center h-9 gap-2.5 w-full"
            >
              {/* Minimal Sparkle Icon */}
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-indigo-500/10 text-indigo-400 shrink-0">
                {loading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Sparkles size={13} className="minimal-sparkle" />
                )}
              </div>

              {/* Text Input */}
              <input
                ref={inputRef}
                type="text"
                placeholder="Command AI to duplicate projects, auto-translate, or audit quality..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={loading}
                className="flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none font-medium h-full"
              />

              {/* Action Buttons */}
              <div className="flex items-center gap-1 shrink-0 pr-1">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMessages([]);
                    }}
                    className="h-6 w-6 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
                    title="Clear History"
                  >
                    <Trash2 size={12} />
                  </button>
                )}

                <button
                  type="submit"
                  disabled={loading || !prompt.trim()}
                  className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  <span>Execute</span>
                  <CornerDownLeft size={10} />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                  }}
                  className="h-6 w-6 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X size={13} />
                </button>
              </div>
            </form>
          ) : (
            /* ── COLLAPSED MINIMAL LUXURY BUTTON ── */
            <div
              className="flex items-center gap-2 text-[var(--text-primary)] text-xs font-semibold select-none whitespace-nowrap h-7"
              title="Open AI Command Center"
            >
              <Sparkles size={13} className="text-indigo-400 minimal-sparkle shrink-0" />
              <span>AI Command</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
