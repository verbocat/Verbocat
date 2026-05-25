export const SegmentBoard = ({ children, theme }) => (
  <section className={`flex flex-col h-[calc(100vh-280px)] min-h-[500px] rounded-2xl border overflow-hidden ${theme.cardStrong}`}>
    <div className="border-b border-white/10 px-4 py-3 shrink-0">
      <div className="grid items-center gap-4 lg:grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)]">
        <div className={`text-[11px] uppercase tracking-[0.2em] ${theme.muted}`}>
          No.
        </div>
        <div className={`text-[11px] uppercase tracking-[0.2em] ${theme.muted}`}>
          Source
        </div>
        <div className={`text-[11px] uppercase tracking-[0.2em] ${theme.muted}`}>
          Target
        </div>
      </div>
    </div>

    <div className="flex-1 divide-y divide-white/8">{children}</div>
  </section>
);
