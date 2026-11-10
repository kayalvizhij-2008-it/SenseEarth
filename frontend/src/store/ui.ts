import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";
export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  toasts: Toast[];
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  pushToast: (toast: Omit<Toast, "id">) => string;
  dismissToast: (id: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      sidebarCollapsed: false,
      toasts: [],
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      pushToast: (toast) => {
        const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set({ toasts: [...get().toasts, { ...toast, id }] });
        window.setTimeout(() => get().dismissToast(id), toast.tone === "error" ? 8000 : 5000);
        return id;
      },
      dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
    }),
    {
      name: "senseearth.ui",
      partialize: (state) => ({ theme: state.theme, sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);

/** Convenience for non-component code (API error handlers, etc.). */
export function toast(tone: ToastTone, title: string, description?: string): void {
  useUiStore.getState().pushToast({ tone, title, description });
}
