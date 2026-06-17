import { create } from "zustand";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api` 
  : "/api";

export const useUserStore = create((set, get) => ({
  token: localStorage.getItem("verbocat_token") || null,
  user: null,
  isAuth: !!localStorage.getItem("verbocat_token"),
  loading: false,
  error: null,

  // 1. Log In Action
  login: (token, user) => {
    localStorage.setItem("verbocat_token", token);
    set({ token, user, isAuth: true, error: null });
  },

  // 2. Log Out Action
  logout: () => {
    localStorage.removeItem("verbocat_token");
    set({ token: null, user: null, isAuth: false, error: null });
  },

  // 3. Set Error Action
  setError: (error) => set({ error }),

  // 4. Fetch / Sync User Profile from Backend
  fetchProfile: async () => {
    const { token, logout } = get();
    if (!token) return;

    set({ loading: true, error: null });
    try {
      const response = await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      set({ user: response.data, isAuth: true, loading: false });
    } catch (err) {
      console.error("Failed to sync profile session:", err);
      // Auto log out if token is expired or unauthorized
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        logout();
        const serverErr = err.response.data?.error;
        const errorText = typeof serverErr === "object" && serverErr !== null
          ? (serverErr.message || JSON.stringify(serverErr))
          : (serverErr || "Session expired. Please log in again.");
        set({ error: errorText, loading: false });
      } else {
        set({ error: "Failed to connect to authentication server", loading: false });
      }
    }
  }
}));
