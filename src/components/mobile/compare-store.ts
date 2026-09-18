// CarbuScope Mobile — comparateur de stations (persisté)
// Jusqu'à MAX_MOBILE_COMPARE stations épinglées depuis les fiches / la carte /
// la recherche, comparées côte à côte (critères consommateurs uniquement).
// localStorage « carbuscope-compare », assainissement au merge.

import { create } from "zustand"
import { persist } from "zustand/middleware"

export const MAX_MOBILE_COMPARE = 3

export type CompareResult = "added" | "removed" | "full"

interface CompareState {
  stationIds: string[]
  toggleCompare: (id: string) => CompareResult
  removeCompare: (id: string) => void
  clear: () => void
}

export const useCompareStore = create<CompareState>()(
  persist(
    (set, get) => ({
      stationIds: [],
      toggleCompare: id => {
        const cur = get().stationIds
        if (cur.includes(id)) {
          set({ stationIds: cur.filter(x => x !== id) })
          return "removed"
        }
        if (cur.length >= MAX_MOBILE_COMPARE) return "full"
        set({ stationIds: [...cur, id] })
        return "added"
      },
      removeCompare: id => set(s => ({ stationIds: s.stationIds.filter(x => x !== id) })),
      clear: () => set({ stationIds: [] }),
    }),
    {
      name: "carbuscope-compare",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CompareState>
        return {
          ...current,
          stationIds: Array.isArray(p.stationIds)
            ? p.stationIds.filter(x => typeof x === "string").slice(0, MAX_MOBILE_COMPARE)
            : [],
        }
      },
    }
  )
)
