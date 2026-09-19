// CarbuScope — État global (zustand)

import { create } from "zustand"
import { persist } from "zustand/middleware"

export type Mode = "observatoire" | "portail" | "mobile" | "backoffice"

export type Tab =
  | "dashboard"
  | "map"
  | "stations"
  | "competition"
  | "calculators"
  | "implantation"
  | "prices"
  | "veille"
  | "reports"
  | "settings"

export type Role = "ADMIN" | "NETWORK" | "COMMERCIAL" | "EXPANSION" | "VIEWER"

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrateur",
  NETWORK: "Direction Réseau",
  COMMERCIAL: "Direction Commerciale",
  EXPANSION: "Direction Expansion",
  VIEWER: "Observateur",
}

/** Onglets accessibles par rôle (cahier des charges A.1) */
export const TAB_ACCESS: Record<Tab, Role[]> = {
  dashboard: ["ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER"],
  map: ["ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER"],
  stations: ["ADMIN", "NETWORK"],
  competition: ["ADMIN", "COMMERCIAL"],
  calculators: ["ADMIN", "EXPANSION"],
  implantation: ["ADMIN", "EXPANSION", "COMMERCIAL"],
  prices: ["ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER"],
  veille: ["ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER"],
  reports: ["ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER"],
  settings: ["ADMIN"],
}

interface AppState {
  mode: Mode
  tab: Tab
  brandSlug: string // enseigne connectée
  role: Role
  focusStationCode: string | null // « voir sur la carte »
  selectedStationId: string | null
  setMode: (m: Mode) => void
  setTab: (t: Tab) => void
  setBrandSlug: (b: string) => void
  setRole: (r: Role) => void
  setFocusStation: (code: string | null) => void
  setSelectedStation: (id: string | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      mode: "observatoire",
      tab: "dashboard",
      brandSlug: "agil",
      role: "ADMIN",
      focusStationCode: null,
      selectedStationId: null,
      setMode: (mode) => set({ mode }),
      setTab: (tab) => set({ tab }),
      setBrandSlug: (brandSlug) => set({ brandSlug, focusStationCode: null, selectedStationId: null }),
      setRole: (role) => set({ role }),
      setFocusStation: (focusStationCode) => set({ focusStationCode }),
      setSelectedStation: (selectedStationId) => set({ selectedStationId }),
    }),
    {
      name: "carbuscope-store",
      partialize: (s) => ({ brandSlug: s.brandSlug, role: s.role }),
    }
  )
)
