// Password Manager Store

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PasswordItem {
  id: string;
  url: string;
  username: string;
  password: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

interface PasswordStore {
  passwords: PasswordItem[];
  addPassword: (url: string, username: string, password: string, notes?: string) => boolean;
  updatePassword: (id: string, updates: Partial<PasswordItem>) => void;
  deletePassword: (id: string) => void;
  deleteByUrl: (url: string) => void;
  getPasswordsForUrl: (url: string) => PasswordItem[];
  findPassword: (url: string, username: string) => PasswordItem | undefined;
  hasPasswordForUrl: (url: string) => boolean;
  search: (query: string) => PasswordItem[];
  exportPasswords: () => string;
  importPasswords: (jsonData: string) => { success: boolean; error?: string; count?: number };
  clearAll: () => void;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const usePasswordStore = create<PasswordStore>()(
  persist(
    (set, get) => ({
      passwords: [],

      addPassword: (url, username, password, notes = "") => {
        const exists = get().passwords.some((p) => p.url === url && p.username === username);
        if (exists) return false;

        const newPassword: PasswordItem = {
          id: `pwd-${Date.now()}`,
          url,
          username,
          password,
          notes,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set((state) => ({
          passwords: [newPassword, ...state.passwords],
        }));

        return true;
      },

      updatePassword: (id, updates) => {
        set((state) => ({
          passwords: state.passwords.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p,
          ),
        }));
      },

      deletePassword: (id) => {
        set((state) => ({
          passwords: state.passwords.filter((p) => p.id !== id),
        }));
      },

      deleteByUrl: (url) => {
        set((state) => ({
          passwords: state.passwords.filter((p) => p.url !== url),
        }));
      },

      getPasswordsForUrl: (url) => {
        if (!url) return [];
        const domain = extractDomain(url);
        return get().passwords.filter((p) => extractDomain(p.url) === domain);
      },

      findPassword: (url, username) => {
        if (!url || !username) return undefined;
        return get().passwords.find(
          (p) => extractDomain(p.url) === extractDomain(url) && p.username === username,
        );
      },

      hasPasswordForUrl: (url) => {
        if (!url) return false;
        const domain = extractDomain(url);
        return get().passwords.some((p) => extractDomain(p.url) === domain);
      },

      search: (query) => {
        if (!query) return get().passwords;
        const q = query.toLowerCase();
        return get().passwords.filter(
          (p) =>
            p.url.toLowerCase().includes(q) ||
            p.username.toLowerCase().includes(q) ||
            p.notes?.toLowerCase().includes(q),
        );
      },

      exportPasswords: () => JSON.stringify(get().passwords, null, 2),

      importPasswords: (jsonData) => {
        try {
          const data = JSON.parse(jsonData);
          if (!Array.isArray(data)) return { success: false, error: "Invalid format" };

          const newPasswords = data.filter((p) => p.url && p.username && p.password);

          set((state) => ({
            passwords: [...newPasswords, ...state.passwords],
          }));

          return { success: true, count: newPasswords.length };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      },

      clearAll: () => set({ passwords: [] }),
    }),
    {
      name: "eduos-browser-passwords",
    },
  ),
);
