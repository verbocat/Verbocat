import { Icons } from "./Icons.jsx";

export const ExportModal = ({
  show,
  onClose,
  onExportDocument,
  onExportXliff,
  onExportTmx,
  onExportGlobalTmx,
  onRelinkHtml,
  fileExtension,
  theme,
  sourceLanguage,
  targetLanguage
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
      <div className={`w-full max-w-lg rounded-2xl border shadow-[0_30px_120px_rgba(2,6,23,0.5)] p-6 ${theme.cardStrong}`}>
        <div className="flex items-center justify-between mb-5 border-b border-white/10 pb-3">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Icons.Download className="text-sky-400" /> Export Translations & TM
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition">
            <Icons.X />
          </button>
        </div>

        <div className="space-y-4">
          {/* Option 1: Original Format */}
          <div className="p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition flex items-center justify-between">
            <div className="space-y-1">
              <div className="font-bold flex items-center gap-2 text-sm">
                Translated Document ({fileExtension})
              </div>
              <p className={`text-xs ${theme.muted}`}>
                Export the final translated file with the original layout preserved.
              </p>
            </div>
            <button
              onClick={() => {
                onExportDocument();
                onClose();
              }}
              className="bg-emerald-600 text-white hover:bg-emerald-500 rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Icons.Download /> Download
            </button>
          </div>

          {/* Option 2: XLIFF */}
          <div className="p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition flex items-center justify-between">
            <div className="space-y-1">
              <div className="font-bold flex items-center gap-2 text-sm text-sky-300">
                Bilingual XLIFF (.xlf)
              </div>
              <p className={`text-xs ${theme.muted}`}>
                Standard XML format containing source & target segments for CAT tools.
              </p>
            </div>
            <button
              onClick={() => {
                onExportXliff();
                onClose();
              }}
              className="bg-sky-700 text-white hover:bg-sky-600 rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Icons.Download /> Download
            </button>
          </div>

          {/* Option: Export as HTML for XLF */}
          {fileExtension !== ".html" && (
            <div className="p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-bold flex items-center gap-2 text-sm text-green-300">
                  Export as HTML (.html)
                </div>
                <p className={`text-xs ${theme.muted}`}>
                  To export this XLF as HTML, you must first relink the original HTML template.
                </p>
              </div>
              <label className="bg-green-700 cursor-pointer text-white hover:bg-green-600 rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition">
                <Icons.Upload /> Relink HTML
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".html,.htm" 
                  onChange={(e) => {
                    if (onRelinkHtml) {
                      onRelinkHtml(e);
                      onClose();
                    }
                  }} 
                />
              </label>
            </div>
          )}

          {/* Option 3: TMX Current */}
          <div className="p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition flex items-center justify-between">
            <div className="space-y-1">
              <div className="font-bold flex items-center gap-2 text-sm text-amber-300">
                Translation Memory TMX (.tmx)
              </div>
              <p className={`text-xs ${theme.muted}`}>
                Export translated units of this document as a local TM file.
              </p>
            </div>
            <button
              onClick={() => {
                onExportTmx();
                onClose();
              }}
              className="bg-amber-700 text-white hover:bg-amber-600 rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Icons.Download /> Download
            </button>
          </div>

          {/* Option 4: TMX Global */}
          <div className="p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition flex items-center justify-between">
            <div className="space-y-1">
              <div className="font-bold flex items-center gap-2 text-sm text-purple-300">
                Global Database TM TMX (.tmx)
              </div>
              <p className={`text-xs ${theme.muted}`}>
                Export all approved segments in the database for {sourceLanguage.toUpperCase()} → {targetLanguage.toUpperCase()}.
              </p>
            </div>
            <button
              onClick={() => {
                onExportGlobalTmx();
                onClose();
              }}
              className="bg-purple-800 text-white hover:bg-purple-700 rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Icons.Download /> Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
