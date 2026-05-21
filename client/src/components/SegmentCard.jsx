import { Icons } from "./Icons.jsx";

export const SegmentCard = ({
  darkMode,
  index,
  segment,
  theme,
  onCopy,
  onUpdateTranslation
}) => (
  <article
    id={`segment-${segment.id}`}
    className={`border-l-4 ${segment.target ? theme.status.translated : theme.status.empty}`}
  >
    <div className="grid gap-4 px-4 py-4 lg:grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)]">
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
        <div className="flex items-center justify-end">
          <button
            onClick={() => onCopy(segment.source)}
            className={`rounded-lg px-3 py-2 transition ${theme.buttonSecondary}`}
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <Icons.Copy />
              Copy
            </span>
          </button>
        </div>

        <textarea
          value={segment.source}
          readOnly
          className={`min-h-[210px] w-full resize-none rounded-xl border p-4 outline-none ${theme.inputSoft}`}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className={`text-sm ${theme.muted}`}>
            {segment.target ? "Ready to edit" : "Waiting for translation"}
          </div>
          <button
            onClick={() => onCopy(segment.target || "")}
            className={`rounded-lg px-3 py-2 transition ${theme.buttonSecondary}`}
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <Icons.Copy />
              Copy
            </span>
          </button>
        </div>

        <textarea
          value={segment.target || ""}
          onChange={(event) => onUpdateTranslation(segment.id, event.target.value)}
          placeholder="Translation will appear here..."
          className={`min-h-[210px] w-full resize-none rounded-xl border p-4 outline-none focus:ring-2 focus:ring-sky-300 ${theme.input}`}
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
