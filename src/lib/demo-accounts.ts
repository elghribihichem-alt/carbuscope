// CarbuScope — Comptes de démonstration (simulation d'authentification)
// Chaque persona pré-configure un espace produit, un rôle et une enseigne.
// Aucune donnée réelle : ces comptes servent uniquement à la démonstration.

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
export const DEMO_PASSWORD = "carbu2025"

export const DEMO_ACCOUNTS: DemoAccount[] = [
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
    mode: "observatoire",
    color: "#059669",
    bio: "Pilotage du réseau Agil : 228 stations, prix, marges et conformité.",
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
    mode: "observatoire",
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
    mode: "observatoire",
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
    mode: "observatoire",
    color: "#ea580c",
    bio: "Consultation en lecture seule : dashboards, prix et rapports.",
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
  {
    id: "yassine",
    name: "Yassine Ayari",
    initials: "YA",
    email: "yassine.ayari@gmail.com",
    password: DEMO_PASSWORD,
    jobTitle: "Conducteur — application mobile",
    brandSlug: "agil",
    brandName: "Grand Tunis",
    role: "VIEWER",
    mode: "mobile",
    color: "#ca8a04",
    bio: "Cherche le carburant le moins cher près de lui, signale les ruptures.",
  },
  {
    id: "amine",
    name: "Amine Chebbi",
    initials: "AC",
    email: "amine.chebbi@carbuscope.tn",
    password: DEMO_PASSWORD,
    jobTitle: "Opérateur plateforme",
    brandSlug: "agil",
    brandName: "CarbuScope",
    role: "ADMIN",
    mode: "backoffice",
    color: "#57534e",
    bio: "Back-office : contributions terrain, décrets, fraîcheur des données.",
  },
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
]

export const DEMO_ACCOUNTS_MAP: Record<string, DemoAccount> = Object.fromEntries(
  DEMO_ACCOUNTS.map(a => [a.id, a])
)

/** Recherche insensible à la casse par e-mail (trim appliqué). */
export function findAccountByEmail(email: string): DemoAccount | undefined {
  const e = email.trim().toLowerCase()
  return DEMO_ACCOUNTS.find(a => a.email.toLowerCase() === e)
}
