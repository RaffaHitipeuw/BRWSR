import { create } from "zustand";

const AUTH_BASE = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:8080/api/auth";

export interface EduOSUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  permissions: string[];
}

interface AuthState {
  user: EduOSUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string, role: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

async function request(path: string, body: unknown) {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message ?? `Request failed (${res.status})`);
  }
  return data;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: JSON.parse(localStorage.getItem("eduos_user") ?? "null"),
  accessToken: localStorage.getItem("eduos_access_token"),
  refreshToken: localStorage.getItem("eduos_refresh_token"),
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const data = await request("/login", { email, password });
      localStorage.setItem("eduos_access_token", data.access_token);
      localStorage.setItem("eduos_refresh_token", data.refresh_token);
      localStorage.setItem("eduos_user", JSON.stringify(data.user));
      set({
        user: data.user,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        loading: false,
      });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
      throw e;
    }
  },

  register: async (fullName, email, password, role) => {
    set({ loading: true, error: null });
    try {
      const data = await request("/register", { full_name: fullName, email, password, role });
      localStorage.setItem("eduos_access_token", data.access_token);
      localStorage.setItem("eduos_refresh_token", data.refresh_token);
      localStorage.setItem("eduos_user", JSON.stringify(data.user));
      set({
        user: data.user,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        loading: false,
      });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
      throw e;
    }
  },

  logout: () => {
    localStorage.removeItem("eduos_access_token");
    localStorage.removeItem("eduos_refresh_token");
    localStorage.removeItem("eduos_user");
    set({ user: null, accessToken: null, refreshToken: null });
  },

  hasPermission: (permission) => {
    const user = get().user;
    if (!user) return false;
    return user.permissions.includes("*") || user.permissions.includes(permission);
  },
}));
