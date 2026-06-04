export const QAPanel = ({ qaIssuesList, showQaPanel, theme, onGoToSegment }) =>
  showQaPanel && qaIssuesList.length > 0 ? (
    <section className={`rounded-2xl border p-4 ${theme.cardStrong}`}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className={`text-xs uppercase tracking-[0.2em] ${theme.muted}`}>
            QA Review
          </div>
          <h2 className="mt-1 text-lg font-bold">Issue Navigator</h2>
        </div>
        <div className="rounded-lg bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-300 ring-1 ring-rose-400/20">
          {qaIssuesList.length} issues
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 max-h-[30vh] overflow-y-auto pr-2">
        {qaIssuesList.map((item, index) => (
          <button
            key={`${item.id}-${index}`}
            onClick={() => onGoToSegment(item.id)}
            className="rounded-xl border border-rose-400/20 bg-rose-500/8 p-4 text-left transition hover:bg-rose-500/14"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="font-semibold text-rose-200">{item.issue}</div>
              <div className={`text-xs ${theme.muted}`}>Segment {item.id}</div>
            </div>
            <div className={`mt-2 text-sm ${theme.muted}`}>{item.source}</div>
          </button>
        ))}
      </div>
    </section>
  ) : null;
