export const Toast = ({ toast }) => {
  if (!toast) return null;

  const type = toast.type || "success";

  return (
    <div className={`notification-toast toast-${type}`}>
      <div className="notification-toast-content">
        <div className="notification-toast-title">
          {type === "error" ? "Error" : type === "warn" ? "Warning" : type === "info" ? "Info" : "Success"}
        </div>
        <div className="notification-toast-message">
          {toast.message}
        </div>
      </div>
    </div>
  );
};
