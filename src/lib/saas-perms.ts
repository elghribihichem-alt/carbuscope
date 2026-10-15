// T48 — Catalogue de la matrice de permissions SaaS (partagé client/serveur).
// Source de vérité des modules protégés : Super Administration, Back-office,
// Portail Enseigne et Observatoire. Les niveaux : 0 = aucun, 1 = lecture,
// 2 = écriture. Le rôle racine SUPER_ADMIN est implicitement maître de tout.

import type { SessionUser } from "@/lib/types"

export type PermLevel = 0 | 1 | 2

export const PERM_LEVELS: { value: PermLevel; label: string; hint: string }[] = [
  { value: 0, label: "Aucun", hint: "Module invisible et API refusée" },
  { value: 1, label: "Lecture", hint: "Consultation seule" },
  { value: 2, label: "Écriture", hint: "Consultation + actions" },
]

export interface PermGroup {
  id: string
  label: string
  description: string
}

export interface PermModule {
  key: string
  label: string
  group: string
}

export const PERM_GROUPS: PermGroup[] = [
  { id: "sa", label: "Super Administration", description: "Gouvernance du SaaS — contrats, facturation, comptes, modules" },
  { id: "bo", label: "Back-office", description: "Opérations plateforme — modération, certification, terrain" },
  { id: "portal", label: "Portail Enseigne", description: "Auto-publication des enseignes clientes" },
  { id: "obs", label: "Observatoire B2B", description: "Intelligence marché des directions" },
]

export const PERM_MODULES: PermModule[] = [
  // ---- Super Administration ----
  { key: "sa.overview", label: "Vue d'ensemble", group: "sa" },
  { key: "sa.clients", label: "Clients & enseignes", group: "sa" },
  { key: "sa.contracts", label: "Contrats", group: "sa" },
  { key: "sa.plans", label: "Plans & tarifs", group: "sa" },
  { key: "sa.devis", label: "Devis", group: "sa" },
  { key: "sa.invoices", label: "Facturation", group: "sa" },
  { key: "sa.echeances", label: "Échéances & relances", group: "sa" },
  { key: "sa.users", label: "Utilisateurs", group: "sa" },
  { key: "sa.permissions", label: "Rôles & permissions", group: "sa" },
  { key: "sa.clesapi", label: "Clés API", group: "sa" },
  { key: "sa.demographie", label: "Démographie", group: "sa" },
  { key: "sa.ai", label: "Agent IA", group: "sa" },
  { key: "sa.carto", label: "Cartographie", group: "sa" },
  { key: "sa.annonces", label: "Annonces", group: "sa" },
  { key: "sa.opportunity", label: "Radar d'Opportunités", group: "sa" },
  { key: "sa.mobility", label: "Mobility Hub Operations", group: "sa" },
  { key: "sa.config", label: "Configuration", group: "sa" },
  { key: "sa.jobs", label: "Jobs planifiés", group: "sa" },
  { key: "sa.sauvegardes", label: "Sauvegardes", group: "sa" },
  { key: "sa.support", label: "Support (tickets)", group: "sa" },
  { key: "sa.supervision", label: "Supervision", group: "sa" },
  { key: "sa.audit", label: "Journal d'audit", group: "sa" },
  { key: "sa.analytics", label: "Analytics & exports", group: "sa" },
  // ---- Back-office ----
  { key: "bo.moderation", label: "Modération", group: "bo" },
  { key: "bo.sovereign", label: "Données souveraines", group: "bo" },
  { key: "bo.freshness", label: "Fraîcheur", group: "bo" },
  { key: "bo.agents", label: "Agents terrain", group: "bo" },
  { key: "bo.missions", label: "Missions", group: "bo" },
  { key: "bo.decrees", label: "Prix & décrets", group: "bo" },
  { key: "bo.veille", label: "Veille & alertes", group: "bo" },
  { key: "bo.stats", label: "Stats plateforme", group: "bo" },
  // ---- Portail Enseigne (T49 : espace unique d'administration de l'enseigne,
  // il absorbe aussi l'observation du marché — gestion + étude au même endroit) ----
  { key: "portal.dashboard", label: "Tableau de bord", group: "portal" },
  { key: "portal.map", label: "Carte réseau", group: "portal" },
  { key: "portal.reviews", label: "Avis & réputation", group: "portal" },
  { key: "portal.stations", label: "Mes stations", group: "portal" },
  { key: "portal.terrain", label: "Veille terrain", group: "portal" },
  { key: "portal.prices", label: "Prix & marges", group: "portal" },
  { key: "portal.veille", label: "Veille des prix", group: "portal" },
  { key: "portal.competition", label: "Concurrence", group: "portal" },
  { key: "portal.implantation", label: "Implantation", group: "portal" },
  { key: "portal.calculateurs", label: "Calculateurs", group: "portal" },
  { key: "portal.demographie", label: "Démographie", group: "portal" },
  { key: "portal.rapports", label: "Rapports & exports", group: "portal" },
  { key: "portal.api", label: "Promotions & API", group: "portal" },
  { key: "portal.parametres", label: "Paramètres enseigne", group: "portal" },
  // T51 — modules premium d'expansion (activation par enseigne côté SA)
  { key: "portal.opportunity", label: "Radar d'Opportunités", group: "portal" },
  { key: "portal.mobility", label: "Mobility Hub Operations", group: "portal" },
  // ---- Observatoire B2B (T49 : re-scopé « étude du marché » — lecture seule) ----
  { key: "obs.dashboard", label: "Tableau de bord", group: "obs" },
  { key: "obs.map", label: "Carte interactive", group: "obs" },
  { key: "obs.stations", label: "Annuaire des stations", group: "obs" },
  { key: "obs.competition", label: "Concurrence", group: "obs" },
  { key: "obs.calculators", label: "Calculateurs", group: "obs" },
  { key: "obs.implantation", label: "Implantation", group: "obs" },
  { key: "obs.prices", label: "Prix & marges", group: "obs" },
  { key: "obs.veille", label: "Veille", group: "obs" },
  { key: "obs.reports", label: "Rapports", group: "obs" },
  { key: "obs.demographie", label: "Démographie", group: "obs" },
  { key: "obs.settings", label: "Paramètres", group: "obs" },
]

export const PERM_MODULE_KEYS: string[] = PERM_MODULES.map(m => m.key)

/** Matrice « tout accès » — le rôle racine. */
export function fullPermissions(): Record<string, number> {
  return Object.fromEntries(PERM_MODULE_KEYS.map(k => [k, 2]))
}

/** Niveau effectif d'un module pour une session (racine = maître de tout). */
export function permAt(perms: Record<string, number> | null | undefined, moduleKey: string): PermLevel {
  if (!perms) return 0
  return (perms[moduleKey] ?? 0) as PermLevel
}

/** Le module est-il accessible au niveau demandé (défaut : lecture) ? */
export function hasPerm(
  perms: Record<string, number> | null | undefined,
  moduleKey: string,
  minLevel: 1 | 2 = 1,
): boolean {
  return permAt(perms, moduleKey) >= minLevel
}

/** L'utilisateur voit-il AU MOINS un module d'un espace (préfixe) ? */
export function anyPerm(
  perms: Record<string, number> | null | undefined,
  prefix: "sa." | "bo." | "portal." | "obs.",
  minLevel: 1 | 2 = 1,
): boolean {
  if (!perms) return false
  return PERM_MODULE_KEYS.some(k => k.startsWith(prefix) && (perms[k] ?? 0) >= minLevel)
}

/** L'espace Super Administration est-il visible pour cette session ? */
export function canSeeSaSpace(session: SessionUser | null): boolean {
  if (!session) return false
  if (session.role === "SUPER_ADMIN") return true
  return anyPerm(session.permissions, "sa.")
}

/** L'espace Back-office est-il visible pour cette session ? */
export function canSeeBoSpace(session: SessionUser | null): boolean {
  if (!session) return false
  if (session.role === "SUPER_ADMIN") return true
  return anyPerm(session.permissions, "bo.")
}

/** Rôle SaaS effectif par défaut, selon le profil plateforme. */
export function deriveDefaultRoleCode(user: { role: string; brandSlug: string | null }): string {
  if (user.role === "SUPER_ADMIN") return "SUPER_ADMIN"
  if (user.brandSlug) return "CLIENT_ENSEIGNE"
  return "OPERATEUR_PLATEFORME"
}
