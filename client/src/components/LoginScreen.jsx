import { useState } from "react";
import axios from "axios";
import { useUserStore } from "../services/userStore";

const API_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api` 
  : "/api";

export const LoginScreen = ({ mode: initialMode = "login", onResetSuccess }) => {
  const loginAction = useUserStore((state) => state.login);
  
  const [mode, setMode] = useState(initialMode); // 'login', 'register', 'forgot', 'reset'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    try {
      if (mode === "login") {
        // Log In Request
        const response = await axios.post(`${API_URL}/auth/login`, { email, password });
        loginAction(response.data.token, response.data.user);
      } 
      else if (mode === "register") {
        // Sign Up Request
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters long");
        }
        const response = await axios.post(`${API_URL}/auth/register`, { email, password });
        setSuccessMsg(response.data.message);
        setEmail("");
        setPassword("");
        setConfirmPassword("");
      } 
      else if (mode === "forgot") {
        // Forgot Password Request
        const response = await axios.post(`${API_URL}/auth/forgot-password`, { email });
        setSuccessMsg(response.data.message);
        setEmail("");
      }
      else if (mode === "reset") {
        // Reset Password Request
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters long");
        }
        const token = localStorage.getItem("verbocat_token");
        const response = await axios.post(`${API_URL}/auth/reset-password`, 
          { password },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setSuccessMsg(response.data.message);
        setPassword("");
        setConfirmPassword("");
        setTimeout(() => {
          if (onResetSuccess) {
            onResetSuccess();
          } else {
            setMode("login");
            setSuccessMsg("");
          }
        }, 3000);
      }
    } catch (err) {
      console.error(err);
      const serverErr = err.response?.data?.error;
      const errorText = typeof serverErr === "object" && serverErr !== null
        ? (serverErr.message || JSON.stringify(serverErr))
        : (serverErr || err.message || "An unexpected error occurred");
      setError(errorText);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#05070c]/85 backdrop-blur-md p-4 transition-all duration-500 animate-fade-in">
      <div className="relative w-full max-w-md overflow-hidden rounded-[32px] border border-white/10 bg-slate-900/60 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
        <div className="absolute -top-12 -left-12 h-36 w-36 rounded-full bg-indigo-500/10 blur-[50px] pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 h-36 w-36 rounded-full bg-cyan-500/10 blur-[50px] pointer-events-none" />

        <div className="relative flex flex-col items-center">
          {/* Logo Brand Title */}
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/15 animate-pulse-glow">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          
          <h3 className="mb-1 text-2xl font-black tracking-tight text-white">VerboCat Editor</h3>
          <p className="mb-6 text-xs text-slate-400 text-center">
            {mode === "login" && "Enter credentials to access translation workspace."}
            {mode === "register" && "Create a secure account to join translation projects."}
            {mode === "forgot" && "Recover your password using your registered email address."}
            {mode === "reset" && "Create a strong new password for your account."}
          </p>

          <form onSubmit={handleSubmit} className="w-full space-y-4">
            
            {/* Input Email (hidden in reset mode) */}
            {mode !== "reset" && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 select-none">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-slate-100 outline-none transition-all placeholder:text-slate-600 focus:border-indigo-500/50 focus:bg-black/60 focus:ring-2 focus:ring-indigo-500/20 text-sm"
                />
              </div>
            )}

            {/* Input Password (skip in forgot password) */}
            {mode !== "forgot" && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 select-none">
                  {mode === "reset" ? "New Password" : "Password"}
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-slate-100 outline-none transition-all placeholder:text-slate-600 focus:border-indigo-500/50 focus:bg-black/60 focus:ring-2 focus:ring-indigo-500/20 text-sm"
                />
              </div>
            )}

            {/* Confirm Password (register and reset modes only) */}
            {(mode === "register" || mode === "reset") && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 select-none">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-slate-100 outline-none transition-all placeholder:text-slate-600 focus:border-indigo-500/50 focus:bg-black/60 focus:ring-2 focus:ring-indigo-500/20 text-sm"
                />
              </div>
            )}

            {/* Forgot Password trigger (login mode only) */}
            {mode === "login" && (
              <div className="flex justify-end text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setSuccessMsg("");
                    setMode("forgot");
                  }}
                  className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            {/* Alert boxes */}
            {error && (
              <div className="rounded-xl bg-rose-500/10 py-3 px-4 text-xs font-semibold text-rose-400 border border-rose-500/20">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="rounded-xl bg-emerald-500/10 py-3 px-4 text-xs font-semibold text-emerald-400 border border-emerald-500/20 leading-relaxed">
                {successMsg}
              </div>
            )}

            {/* Submit Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3.5 font-bold text-white shadow-lg shadow-indigo-500/15 transition-all hover:from-indigo-500 hover:to-violet-500 focus:outline-none disabled:opacity-50 active:scale-95 cursor-pointer text-sm"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <>
                  {mode === "login" && "Sign In"}
                  {mode === "register" && "Create Account"}
                  {mode === "forgot" && "Send Reset Link"}
                  {mode === "reset" && "Update Password"}
                </>
              )}
            </button>

            {/* Account toggle link (hidden in reset mode) */}
            {mode !== "reset" && (
              <div className="pt-2 text-center text-xs text-slate-500">
                {mode === "login" && (
                  <span>
                    Don't have an account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setSuccessMsg("");
                        setMode("register");
                      }}
                      className="text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer"
                    >
                      Register here
                    </button>
                  </span>
                )}

                {mode === "register" && (
                  <span>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setSuccessMsg("");
                        setMode("login");
                      }}
                      className="text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer"
                    >
                      Sign In
                    </button>
                  </span>
                )}

                {mode === "forgot" && (
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setSuccessMsg("");
                      setMode("login");
                    }}
                    className="text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer"
                  >
                    Back to Login
                  </button>
                )}
              </div>
            )}

          </form>
        </div>
      </div>
    </div>
  );
};
