import { Icons } from "./Icons.jsx";

export const EmptyWorkspace = ({ darkMode, onLoadProject, onUpload, theme }) => (
  <div
    className={`relative overflow-hidden rounded-2xl border p-8 sm:p-10 ${theme.cardStrong}`}
  >
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.10),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(148,163,184,0.10),transparent_24%)]" />
    <div className="relative mx-auto max-w-2xl text-center">
      <div className="mx-auto mb-6 flex h-18 w-18 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-slate-300 text-slate-950 shadow-xl shadow-black/10">
        <Icons.Upload />
      </div>
      <div className={`text-xs uppercase tracking-[0.35em] ${theme.muted}`}>
        Start Here
      </div>
      <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
        Drop in your document and start translating in a cleaner workspace.
      </h2>
      <p className={`mx-auto mt-4 max-w-xl text-base ${theme.muted}`}>
        HTML and DOCX uploads are supported. After upload, the editor keeps QA,
        glossary, save/load, search, and export available without changing your
        existing workflow.
      </p>

      <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-slate-300 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-black/10 transition hover:from-sky-300 hover:to-slate-200">
          <Icons.Upload />
          Choose File
          <input type="file" onChange={onUpload} className="hidden" />
        </label>
        <label
          className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition ${theme.buttonSecondary}`}
        >
          <Icons.FileJson />
          Load Saved Project
          <input
            type="file"
            accept=".json"
            onChange={onLoadProject}
            className="hidden"
          />
        </label>
      </div>

      <div
        className={`mt-5 inline-flex rounded-2xl border px-5 py-3 text-sm ${
          darkMode
            ? "border-white/10 bg-white/5 text-slate-300"
            : "border-slate-200 bg-white text-slate-600"
        }`}
      >
        Drag and drop anywhere on the page to upload faster.
      </div>
    </div>
  </div>
);
