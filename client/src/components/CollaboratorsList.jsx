import React from "react";

export function CollaboratorsList({ collaborators, onTeleport }) {
  if (!collaborators || collaborators.length === 0) return null;

  // Generate a soft background/border color based on email string to keep colors consistent
  const getColorHash = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      { bg: "bg-rose-500/10 text-rose-400 border-rose-500/30", dot: "bg-rose-400" },
      { bg: "bg-amber-500/10 text-amber-400 border-amber-500/30", dot: "bg-amber-400" },
      { bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400" },
      { bg: "bg-sky-500/10 text-sky-400 border-sky-500/30", dot: "bg-sky-400" },
      { bg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30", dot: "bg-indigo-400" },
      { bg: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30", dot: "bg-fuchsia-400" }
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="flex items-center gap-1.5 pl-3 border-l border-zinc-800">
      <span className="text-xs text-zinc-500 mr-1 hidden sm:inline">Active:</span>
      <div className="flex -space-x-2">
        {collaborators.map((user) => {
          const initials = (user.name || user.email || "?")
            .split(" ")[0]
            .substring(0, 2)
            .toUpperCase();
          const colors = getColorHash(user.email);
          const hasActiveSegment = user.activeSegmentIndex !== null && user.activeSegmentIndex !== undefined;

          return (
            <div
              key={user.socketId}
              onClick={() => {
                if (hasActiveSegment && onTeleport) {
                  onTeleport(user.activeSegmentIndex);
                }
              }}
              className={`relative group flex items-center justify-center w-8 h-8 rounded-full border text-xs font-semibold ${colors.bg} select-none transition-transform hover:-translate-y-0.5 ${hasActiveSegment ? "cursor-pointer" : "cursor-default"}`}
              title={hasActiveSegment ? `Teleport to Segment ${user.activeSegmentIndex + 1}` : ""}
            >
              {initials}
              {/* Online Indicator */}
              <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border border-zinc-900 ${colors.dot}`} />
              
              {/* Rich Tooltip */}
              <div className="absolute top-8 right-0 hidden group-hover:block z-55 bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] rounded-lg p-2.5 shadow-xl whitespace-nowrap min-w-[150px]">
                <p className="font-bold text-white text-xs">{user.name || "Collaborator"}</p>
                <p className="text-zinc-500 text-[10px] mt-0.5">{user.email}</p>
                <div className="flex items-center gap-1 mt-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                  <span className="capitalize text-[10px] text-zinc-400">{user.role?.replace("_", " ")}</span>
                </div>
                {hasActiveSegment && (
                  <p className="text-[10px] text-[var(--text-accent)] font-bold mt-1.5 border-t border-white/5 pt-1.5">
                    🎯 Segment {user.activeSegmentIndex + 1} (Click to teleport)
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
