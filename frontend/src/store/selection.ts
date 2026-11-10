import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SavedArea } from "@/api/types";

interface SelectionState {
  /** Area picked on the Explore map or the landing globe, handed to New Analysis. */
  area: SavedArea | null;
  setArea: (area: SavedArea | null) => void;
}

export const useSelectionStore = create<SelectionState>()(
  persist(
    (set) => ({
      area: null,
      setArea: (area) => set({ area }),
    }),
    { name: "senseearth.selection", version: 1 },
  ),
);
