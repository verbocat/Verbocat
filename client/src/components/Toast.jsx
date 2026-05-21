export const Toast = ({ toast }) =>
  toast ? (
    <div
      className={`fixed top-5 right-5 z-50 px-6 py-3 rounded-lg shadow-xl text-white font-medium transition-all transform translate-x-0 ${
        toast.type === "error" ? "bg-red-600" : "bg-green-600"
      }`}
    >
      {toast.message}
    </div>
  ) : null;
