import { create } from "zustand";
import { api, setAccessToken, getAccessToken } from "../lib/api";
import {
  connectSocket,
  disconnectSocket,
  on,
} from "../lib/socket";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  boot: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: true,
  error: null,

  setUser: (user) => {
    set({ user });
    localStorage.setItem("pvc-locale", user.locale || "id");
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const data = await api<{ accessToken: string; user: User }>("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setAccessToken(data.accessToken);
      // mark as online in local state immediately
      const userOnline = { ...data.user, status: "online" };
      set({ user: userOnline, token: data.accessToken, loading: false, error: null });
      localStorage.setItem("pvc-locale", data.user.locale || "id");
      connectSocket();
      return true;
    } catch (e: any) {
      set({ loading: false, error: e?.message || "Login failed" });
      return false;
    }
  },

  boot: async () => {
    // coba pakai token yang tersimpan (baru login / session aktif)
    const existing = getAccessToken();
    if (existing) {
      try {
        const me = await api<User>("/api/users/me");
        set({ user: me, token: existing, loading: false });
        connectSocket();
        return;
      } catch {
        /* token rusak, coba refresh */
      }
    }
    try {
      const data = await api<{ accessToken: string; user: User }>("/api/auth/refresh", {
        method: "POST",
      });
      setAccessToken(data.accessToken);
      set({ user: data.user, token: data.accessToken, loading: false });
      localStorage.setItem("pvc-locale", data.user.locale || "id");
      connectSocket();
    } catch {
      set({ user: null, token: null, loading: false });
    }
  },

  logout: async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    disconnectSocket();
    set({ user: null, token: null });
    localStorage.removeItem("pvc-locale");
  },
}));

// sync socket presence listener ke store (dipakai komponen)
export function onPresence(fn: (u: { userId: string; status: string }) => void) {
  return on("presence:update", fn);
}