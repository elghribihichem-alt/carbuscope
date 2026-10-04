// CarbuScope — État global (zustand)
// T50 : convergence 7 → 3 espaces produit. L'ancienne famille de modes
// (observatoire · portail · mobile · agents · backoffice · superadmin · shadow)
// devient : Portail enseigne ("portail" — fusion Observatoire + Portail +
// Back-office + Shadow + Agents, naviguée par nav.espace) · Mobile B2C
// ("mobile") · Super Administration ("superadmin", réservée au compte racine).

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"
import type { SessionUser } from "@/lib/types"

export type Mode = "portail" | "mobile" | "superadmin"

/** Module actif de l'espace enseigne fusionné (T50 — blueprint 8 groupes). */
export type Espace = "observatoire" | "portail" | "shadow" | "backoffice" | "agents"

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

export type Role = "ADMIN" | "NETWORK" | "COMMERCIAL" | "EXPANSION" | "VIEWER" | "DG"

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrateur",
  NETWORK: "Direction Réseau",
  COMMERCIAL: "Direction Commerciale",
  EXPANSION: "Direction Expansion",
  VIEWER: "Observateur",
  DG: "Directeur Général",
}

/** Onglets accessibles par rôle (cahier des charges A.1).
 * T50 : le rôle DG (directeur général) voit tous les modules par défaut. */
export const TAB_ACCESS: Record<Tab, Role[]> = {
  dashboard: ["ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER", "DG"],
  map: ["ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER", "DG"],
  stations: ["ADMIN", "NETWORK", "DG"],
  competition: ["ADMIN", "COMMERCIAL", "DG"],
  calculators: ["ADMIN", "EXPANSION", "DG"],
  implantation: ["ADMIN", "EXPANSION", "COMMERCIAL", "DG"],
  prices: ["ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER", "DG"],
  veille: ["ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER", "DG"],
  reports: ["ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER", "DG"],
  // Onglet conditionnel (T37) : visible si l'utilisateur connecté dispose d'un
  // accès démographie (volet Paramétrage de la Super Administration).
  demographie: ["ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER", "DG"],
  settings: ["ADMIN", "DG"],
}

/** T50 — rôles autorisés sur le groupe « Back-office plateforme » (G7). */
export const PLATFORM_MODULE_ROLES: Role[] = ["ADMIN", "DG"]

/** T50 — rôles autorisés sur le groupe « Shadow Market » (G6). */
export const SHADOW_MODULE_ROLES: Role[] = ["ADMIN", "COMMERCIAL", "DG"]

/** T54 — rôles autorisés sur le module « Opportunity Radar » (Portail enseigne).
 * Même périmètre que l'onglet historique « implantation » qu'il absorbe. */
export const RADAR_MODULE_ROLES: Role[] = ["ADMIN", "EXPANSION", "COMMERCIAL", "DG"]

/** T54 — rôles autorisés sur le module « Mobility Hub Operations » (Portail enseigne). */
export const HUBS_MODULE_ROLES: Role[] = ["ADMIN", "NETWORK", "COMMERCIAL", "DG"]

/** T60 — rôles autorisés sur le module « Média & Panneaux urbains » (Portail
 * enseigne). Tous les membres de l'enseigne y entrent (lecteur inclus) : les
 * données visibles relèvent des couches de permissions média (résolution
 * serveur), pas du rôle. */
export const MEDIA_MODULE_ROLES: Role[] = ["ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER", "DG"]

/** T50 — convertit un mode historique (localStorage / deep-link) vers les
 * 3 espaces produit. Observatoire, portail, shadow, back-office et agents
 * fusionnent dans l'espace enseigne ; mobile et superadmin subsistent. */
export function migrateMode(legacy: string): Mode {
  if (legacy === "mobile" || legacy === "superadmin") return legacy
  return "portail"
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
  // ---- T46 : navigation verticale (sidebar accordéon) ----
  /** Sous-navigation des modules : clé = module (ex. "shadow-recensement"), valeur = section active. */
  nav: Record<string, string>
  setNav: (key: string, value: string) => void
  /** Sidebar desktop repliée en rail d'icônes. */
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  /** Panneau de navigation mobile (Sheet). */
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
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
      mode: "portail",
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
      // T46 : navigation verticale — les valeurs manquantes retombent sur les
      // défauts de chaque vue (nav[key] ?? "…"), donc pas de persistance nécessaire.
      nav: {},
      setNav: (key, value) => set((s) => ({ nav: { ...s.nav, [key]: value } })),
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      mobileNavOpen: false,
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
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
      version: 1,
      // T50 : un état persisté par une version antérieure (mode historique)
      // est ramené vers les 3 espaces produit.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<{ mode: unknown; role: unknown }>
        const next: Record<string, unknown> = { ...p }
        if (typeof p.mode === "string") next.mode = migrateMode(p.mode)
        return next as object
      },
      partialize: (s) => ({ brandSlug: s.brandSlug, role: s.role, userId: s.userId, sidebarCollapsed: s.sidebarCollapsed }),
    }
  )
)
