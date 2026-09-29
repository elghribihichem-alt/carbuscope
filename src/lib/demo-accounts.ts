// CarbuScope — Comptes de démonstration (simulation d'authentification)
// Chaque persona pré-configure un espace produit, un rôle et une enseigne.
// Aucune donnée réelle : ces comptes servent uniquement à la démonstration.
// T50 — gouvernance : racine unique (Rania Feki), personas enseignes uniquement
// (+ DG Agil), Star Oil activée (Anis Ferjani). Les comptes du personnel
// plateforme hors enseigne ont été purgés.

import type { Mode, Role } from "@/store/app-store"

export interface DemoAccount {
  id: string
  name: string
  initials: string
  email: string
  password: string
  jobTitle: string
  brandSlug: string
  brandName: string
  role: Role
  mode: Mode
  color: string
  bio: string
  /** Accès racine : espace Super Administration (gestion SaaS de la plateforme). */
  isSuperAdmin?: boolean
}

/** Mot de passe partagé par tous les comptes de démonstration. */
export const DEMO_PASSWORD = "carbus2025"

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "rania",
    name: "Rania Feki",
    initials: "RF",
    email: "rania.feki@carbuscope.tn",
    password: DEMO_PASSWORD,
    jobTitle: "Super-administratrice plateforme",
    brandSlug: "agil",
    brandName: "CarbuScope",
    role: "ADMIN",
    mode: "superadmin",
    color: "#0f766e",
    bio: "Pilotage SaaS : contrats des enseignes, facturation, comptes, audit.",
    isSuperAdmin: true,
  },
  {
    id: "tarek",
    name: "Tarek Mabrouk",
    initials: "TM",
    email: "tarek.mabrouk@agil.tn",
    password: DEMO_PASSWORD,
    jobTitle: "Directeur Général",
    brandSlug: "agil",
    brandName: "Agil",
    role: "DG",
    mode: "portail",
    color: "#92400e",
    bio: "Vue complète : pilotage, réseau, veille terrain, Shadow Market et back-office.",
  },
  {
    id: "sonia",
    name: "Sonia Beji",
    initials: "SB",
    email: "sonia.beji@agil.tn",
    password: DEMO_PASSWORD,
    jobTitle: "Directrice Réseau",
    brandSlug: "agil",
    brandName: "Agil",
    role: "ADMIN",
    mode: "portail",
    color: "#059669",
    bio: "Pilotage du réseau Agil : 1 230 stations, prix, marges et conformité.",
  },
  {
    id: "karim",
    name: "Karim Trabelsi",
    initials: "KT",
    email: "karim.trabelsi@shell.tn",
    password: DEMO_PASSWORD,
    jobTitle: "Direction Commerciale",
    brandSlug: "shell",
    brandName: "Shell",
    role: "COMMERCIAL",
    mode: "portail",
    color: "#d97706",
    bio: "Veille concurrentielle et parts de marché pour le réseau Shell.",
  },
  {
    id: "mehdi",
    name: "Mehdi Gharbi",
    initials: "MG",
    email: "mehdi.gharbi@ola.tn",
    password: DEMO_PASSWORD,
    jobTitle: "Direction Expansion",
    brandSlug: "ola",
    brandName: "Ola Energy",
    role: "EXPANSION",
    mode: "portail",
    color: "#7c3aed",
    bio: "Études d'implantation et calculateurs de rentabilité Ola Energy.",
  },
  {
    id: "leila",
    name: "Leila Mansour",
    initials: "LM",
    email: "leila.mansour@totalenergies.tn",
    password: DEMO_PASSWORD,
    jobTitle: "Analyste Market",
    brandSlug: "totalenergies",
    brandName: "TotalEnergies",
    role: "VIEWER",
    mode: "portail",
    color: "#ea580c",
    bio: "Consultation en lecture seule : dashboards, prix et rapports.",
  },
  {
    id: "anis",
    name: "Anis Ferjani",
    initials: "AF",
    email: "anis.ferjani@staroil.tn",
    password: DEMO_PASSWORD,
    jobTitle: "Directeur Réseau",
    brandSlug: "staroil",
    brandName: "Staroil",
    role: "ADMIN",
    mode: "portail",
    color: "#b91c1c",
    bio: "Star Oil — réseau réactivé : 120 stations à surveiller et developper.",
  },
  {
    id: "nadia",
    name: "Nadia Haddad",
    initials: "NH",
    email: "nadia.haddad@agil.tn",
    password: DEMO_PASSWORD,
    jobTitle: "Responsable données enseigne",
    brandSlug: "agil",
    brandName: "Agil",
    role: "ADMIN",
    mode: "portail",
    color: "#e11d48",
    bio: "Auto-publication du référentiel Agil : stations, services, promotions.",
  },
]

export const DEMO_ACCOUNTS_MAP: Record<string, DemoAccount> = Object.fromEntries(
  DEMO_ACCOUNTS.map(a => [a.id, a])
)

/** Recherche insensible à la casse par e-mail (trim appliqué). */
export function findAccountByEmail(email: string): DemoAccount | undefined {
  const e = email.trim().toLowerCase()
  return DEMO_ACCOUNTS.find(a => a.email.toLowerCase() === e)
}
