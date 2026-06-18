import { useState, useEffect } from "react";
import axios from "axios";
import { useUserStore } from "../services/userStore";
import { Eye, EyeOff, Lock, Mail, ArrowLeft, CheckCircle, AlertCircle, Sparkles } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api` 
  : "/api";

export const LoginScreen = ({ mode: initialMode = "login", onResetSuccess }) => {
  const loginAction = useUserStore((state) => state.login);
  
  const [mode, setMode] = useState(initialMode); // 'login', 'register', 'forgot', 'reset'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    setMode(initialMode);
    setError("");
    setSuccessMsg("");
  }, [initialMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    try {
      if (mode === "login") {
        const response = await axios.post(`${API_URL}/auth/login`, { email, password });
        loginAction(response.data.token, response.data.user);
      } 
      else if (mode === "register") {
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
        const response = await axios.post(`${API_URL}/auth/forgot-password`, { email });
        setSuccessMsg(response.data.message);
        setEmail("");
      }
      else if (mode === "reset") {
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
      console.error("DEBUG LOGINSCREEN ERROR:", err);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#03060f]/90 backdrop-blur-lg p-4 transition-all duration-500 animate-fade-in overflow-hidden">
      
      {/* Animated Glowing Orbs */}
      <div className="absolute top-1/4 left-1/4 h-[300px] w-[300px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none animate-float-glow-1" />
      <div className="absolute bottom-1/4 right-1/4 h-[350px] w-[350px] rounded-full bg-violet-600/10 blur-[130px] pointer-events-none animate-float-glow-2" />
      
      {/* Frosted Glass card */}
      <div className="relative w-full max-w-[440px] overflow-hidden rounded-3xl border border-white/5 bg-slate-950/40 p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-3xl animate-slide-up">
        
        {/* Subtle top border illumination */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />

        <div className="relative flex flex-col items-center">
          
          {/* Logo Header */}
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white shadow-xl shadow-indigo-500/10 relative group">
            <Sparkles className="h-6 w-6 animate-pulse" />
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 blur-md opacity-45 -z-10 group-hover:opacity-75 transition-opacity" />
          </div>
          
          <h3 className="mb-1.5 text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
            {mode === "login" && "Welcome Back"}
            {mode === "register" && "Create Account"}
            {mode === "forgot" && "Recover Access"}
            {mode === "reset" && "Update Password"}
          </h3>
          
          <p className="mb-6 text-xs text-slate-400/80 text-center leading-relaxed max-w-[280px]">
            {mode === "login" && "Enter your credentials to enter the VerboCat workspace."}
            {mode === "register" && "Get started with custom translation projects."}
            {mode === "forgot" && "Confirm your email address to receive a recovery link."}
            {mode === "reset" && "Update your credentials with a new secure password."}
          </p>

          <form onSubmit={handleSubmit} className="w-full space-y-4">
            
            {/* Input Email (skip in reset mode) */}
            {mode !== "reset" && (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400/80 select-none">Email Address</label>
                <div className="relative group">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                    <Mail className="h-4 w-4" />
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full rounded-2xl border border-white/5 bg-slate-900/40 pl-11 pr-4 py-3 text-slate-100 outline-none transition-all placeholder:text-slate-600 focus:border-indigo-500/50 focus:bg-slate-950/60 focus:ring-4 focus:ring-indigo-500/10 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Input Password (skip in forgot password) */}
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400/80 select-none">
                  {mode === "reset" ? "New Password" : "Password"}
                </label>
                <div className="relative group">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                    <Lock className="h-4 w-4" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-white/5 bg-slate-900/40 pl-11 pr-11 py-3 text-slate-100 outline-none transition-all placeholder:text-slate-600 focus:border-indigo-500/50 focus:bg-slate-950/60 focus:ring-4 focus:ring-indigo-500/10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm Password (register and reset modes only) */}
            {(mode === "register" || mode === "reset") && (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400/80 select-none">
                  Confirm Password
                </label>
                <div className="relative group">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                    <Lock className="h-4 w-4" />
                  </span>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-white/5 bg-slate-900/40 pl-11 pr-11 py-3 text-slate-100 outline-none transition-all placeholder:text-slate-600 focus:border-indigo-500/50 focus:bg-slate-950/60 focus:ring-4 focus:ring-indigo-500/10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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
                  className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            {/* Error Message banner */}
            {error && (
              <div className="rounded-2xl bg-rose-500/5 py-3 px-4 text-xs font-medium text-rose-400 border border-rose-500/15 flex items-start gap-2.5 animate-slide-up">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{typeof error === "object" ? JSON.stringify(error) : String(error)}</span>
              </div>
            )}

            {/* Success Message banner */}
            {successMsg && (
              <div className="rounded-2xl bg-emerald-500/5 py-3 px-4 text-xs font-medium text-emerald-400 border border-emerald-500/15 flex items-start gap-2.5 animate-slide-up">
                <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{typeof successMsg === "object" ? JSON.stringify(successMsg) : String(successMsg)}</span>
              </div>
            )}

            {/* Submit Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 py-3.5 font-bold text-white shadow-xl shadow-indigo-500/15 transition-all duration-300 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 cursor-pointer text-sm"
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
              <div className="pt-3 text-center text-xs text-slate-500/90 border-t border-white/5 mt-4">
                {mode === "login" && (
                  <span>
                    New to VerboCat?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setSuccessMsg("");
                        setMode("register");
                      }}
                      className="text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer transition-colors pl-0.5"
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
                      className="text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer transition-colors pl-0.5"
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
                    className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
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
