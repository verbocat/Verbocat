import { Icons } from "./Icons.jsx";

export const LoadingOverlay = ({ isUploading, theme }) => {
  if (!isUploading) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm transition-all duration-300">
      <div className={`flex flex-col items-center gap-4 rounded-2xl p-8 shadow-2xl ${theme.cardStrong}`}>
        <Icons.Loader className="h-10 w-10 animate-spin text-sky-400" />
        <p className={`text-sm font-semibold tracking-wide ${theme.text}`}>
          Uploading and extracting text...
        </p>
      </div>
    </div>
  );
};
