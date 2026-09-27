// CarbuScope — État global (zustand)

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"
import type { SessionUser } from "@/lib/types"

export type Mode = "observatoire" | "portail" | "mobile" | "agents" | "backoffice" | "superadmin" | "shadow"

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
  | "demographie"
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
  // Onglet conditionnel (T37) : visible si l'utilisateur connecté dispose d'un
  // accès démographie (volet Paramétrage de la Super Administration).
  demographie: ["ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER"],
  settings: ["ADMIN"],
}

interface AppState {
  mode: Mode
  tab: Tab
  brandSlug: string // enseigne connectée
  role: Role
  focusStationCode: string | null // « voir sur la carte »
  selectedStationId: string | null
  userId: string | null // compte de démonstration connecté (ancien flux, conservé pour compat)
  // ---- V7 : session d'authentification réelle (bootstrappée depuis /api/auth/session) ----
  session: SessionUser | null
  /** "anon" = écran de connexion ; "auth" = session serveur active. */
  authStatus: "anon" | "auth"
  setMode: (m: Mode) => void
  setTab: (t: Tab) => void
  setBrandSlug: (b: string) => void
  setRole: (r: Role) => void
  setFocusStation: (code: string | null) => void
  setSelectedStation: (id: string | null) => void
  login: (accountId: string) => void
  logout: () => void
  setSession: (u: SessionUser | null) => void
  setAuthStatus: (s: "anon" | "auth") => void
  /** Sort d'une éventuelle prise de main (impersonation) : l'état redevient nominal. */
  stopImpersonating: () => void
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
      userId: null,
      // V7 : session serveur (jamais persistée — bootstrappée via /api/auth/session,
      // le cookie httpOnly signé fait foi)
      session: null,
      authStatus: "anon",
      setMode: (mode) => set({ mode }),
      setTab: (tab) => set({ tab }),
      setBrandSlug: (brandSlug) => set({ brandSlug, focusStationCode: null, selectedStationId: null }),
      setRole: (role) => set({ role }),
      setFocusStation: (focusStationCode) => set({ focusStationCode }),
      setSelectedStation: (selectedStationId) => set({ selectedStationId }),
      // Connexion démo : applique le profil complet du compte (rôle, enseigne, espace)
      login: (accountId) => {
        const acc = DEMO_ACCOUNTS_MAP[accountId]
        if (!acc) return
        set({
          userId: accountId,
          role: acc.role,
          brandSlug: acc.brandSlug,
          mode: acc.mode,
          tab: "dashboard",
          focusStationCode: null,
          selectedStationId: null,
        })
      },
      logout: () => set({ userId: null }),
      // ---- V7 : session réelle ----
      setSession: (session) => set({ session }),
      setAuthStatus: (authStatus) => set({ authStatus }),
      stopImpersonating: () => set({ userId: null }),
    }),
    {
      name: "carbuscope-store",
      partialize: (s) => ({ brandSlug: s.brandSlug, role: s.role, userId: s.userId }),
    }
  )
)
