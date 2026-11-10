import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/api/types";

interface AuthState {
  token: string | null;
  user: User | null;
  setSession: (token: string, user: User) => void;
  updateUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      updateUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: "senseearth.session",
      version: 1,
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);

export function useCurrentUser(): User | null {
  return useAuthStore((state) => state.user);
}

export const DEMO_EMAIL = "demo@senseearth.app";
export const DEMO_PASSWORD = "senseearth";
