import { useEffect, useState } from "react";
import { createSession, unlockSession, hasStoredSession, roleForPin, clearSession } from "../utils/security.js";
import { Icons } from "./Icons.jsx";

export const ScreenLock = ({ onUnlock }) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [stored, setStored] = useState(false);

  useEffect(() => {
    setStored(hasStoredSession());
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (stored) {
      const role = await unlockSession(pin);
      if (role) {
        onUnlock(role);
        setPin("");
        return;
      }
      setError("Incorrect PIN");
      return;
    }

    const role = roleForPin(pin);
    if (!role) {
      setError("PIN not recognized");
      return;
    }

    const created = await createSession(pin);
    if (created) {
      onUnlock(created);
      setStored(true);
      setPin("");
    } else {
      setError("Failed to create session");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md transition-all">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-2xl shadow-sky-900/20 backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/50 shadow-[0_0_15px_rgba(14,165,233,0.3)]">
            <Icons.Lock />
          </div>
          <h3 className="mb-2 text-2xl font-bold tracking-tight text-white">Centroid Locked</h3>
          <p className="mb-8 text-sm text-slate-400">Please enter your secure PIN to access the workspace.</p>
          
          <form onSubmit={handleSubmit} className="w-full">
            <div className="relative mb-6">
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoFocus
                className="w-full rounded-2xl border border-white/10 bg-black/40 py-4 text-center text-2xl font-mono tracking-[0.5em] text-white outline-none transition-all placeholder:text-slate-600 focus:border-sky-500/50 focus:bg-black/60 focus:ring-4 focus:ring-sky-500/20"
                placeholder="••••"
                inputMode="numeric"
              />
            </div>

            {error && (
              <div className="mb-6 animate-pulse rounded-xl bg-rose-500/10 py-2.5 text-sm font-medium text-rose-400 ring-1 ring-rose-500/30">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                type="submit"
                disabled={!pin}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-sky-500 py-3.5 font-bold text-white shadow-lg transition-all hover:from-sky-500 hover:to-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-500/30 disabled:opacity-50"
              >
                <Icons.Unlock />
                Authenticate
              </button>
              
              {stored && (
                <button
                  type="button"
                  onClick={() => {
                    clearSession();
                    setStored(false);
                    setPin("");
                  }}
                  className="rounded-xl py-3 text-sm font-semibold text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                >
                  Clear Active Session
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
