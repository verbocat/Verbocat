import { useState, useRef, useCallback } from "react";
import { useChatStore } from "../../services/chatStore";
import { ChatPanel } from "./ChatPanel";
import { MessageCircle, X } from "lucide-react";

export function ChatBubble({ user, chatSocketRef, onTeleport }) {
  const { isOpen, toggleOpen, totalUnread } = useChatStore();

  /* ── Draggable position ────────────────── */
  const [position, setPosition] = useState({
    x: window.innerWidth - 80,
    y: window.innerHeight - 80,
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef(null);
  const hasDraggedRef = useRef(false);

  const onPointerDown = useCallback((e) => {
    setIsDragging(true);
    hasDraggedRef.current = false;
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [position]);

  const onPointerMove = useCallback(
    (e) => {
      if (!isDragging || !dragStartRef.current) return;
      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;
      const dx = Math.abs(newX - position.x);
      const dy = Math.abs(newY - position.y);
      if (dx > 5 || dy > 5) hasDraggedRef.current = true;

      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 56, newX)),
        y: Math.max(0, Math.min(window.innerHeight - 56, newY)),
      });
    },
    [isDragging, position]
  );

  const onPointerUp = useCallback(() => {
    setIsDragging(false);
    if (!hasDraggedRef.current) {
      toggleOpen();
    }
  }, [toggleOpen]);

  return (
    <>
      {/* Chat Panel */}
      {isOpen && (
        <ChatPanel
          chatSocketRef={chatSocketRef}
          panelPosition={position}
          onTeleport={onTeleport}
        />
      )}

      {/* Floating bubble */}
      <div
        className="fixed z-[500] select-none touch-none"
        style={{
          left: position.x,
          top: position.y,
          width: 56,
          height: 56,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center cursor-pointer
            transition-all duration-200 ease-out
            ${isOpen
              ? "bg-[var(--bg-elevated)] border border-[var(--border-medium)] shadow-lg"
              : "bg-gradient-to-br from-[var(--accent)] to-[color-mix(in_srgb,var(--accent),#000_30%)] shadow-[0_4px_20px_rgba(91,106,240,0.35)]"
            }
            hover:scale-105 active:scale-95
          `}
          style={isDragging ? { pointerEvents: "none" } : {}}
        >
          {isOpen ? (
            <X className="w-5 h-5 text-[var(--text-primary)]" />
          ) : (
            <MessageCircle className="w-6 h-6 text-white" />
          )}
        </div>

        {/* Unread badge */}
        {!isOpen && totalUnread > 0 && (
          <div
            className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-rose-500 text-white text-[10px]
              font-bold flex items-center justify-center px-1.5 shadow-md
              animate-[chatPulse_2s_ease_infinite]"
          >
            {totalUnread > 99 ? "99+" : totalUnread}
          </div>
        )}
      </div>
    </>
  );
}
