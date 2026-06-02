import { useEffect, useState } from "react";
import { createSession, unlockSession, hasStoredSession, roleForPin, clearSession } from "../utils/security.js";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-slate-900">
        <h3 className="mb-2 text-lg font-semibold">Screen Lock</h3>
        <p className="mb-4 text-sm text-slate-600">Enter your office PIN to unlock.</p>

        <form onSubmit={handleSubmit}>
          <label className="mb-2 block text-sm">PIN</label>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="mb-3 w-full rounded border px-3 py-2 outline-none"
            inputMode="numeric"
          />
          {error && <div className="mb-2 text-sm text-red-600">{error}</div>}
          <div className="flex justify-end gap-2">
            {stored && (
              <button
                type="button"
                onClick={() => {
                  clearSession();
                  setStored(false);
                  setPin("");
                }}
                className="rounded px-3 py-2 text-sm"
              >
                Clear Session
              </button>
            )}
            <button
              type="submit"
              className="rounded bg-sky-700 px-3 py-2 text-sm text-white"
            >
              Unlock
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
