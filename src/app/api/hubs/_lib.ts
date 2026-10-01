// ============================================================================
// CarbuScope — T54-Ca — lib serveur partagée des routes /api/hubs/*.
//
// Module 2 « Mobility Hub Operations » (volets 1-3 : carte des TMP, gestion
// des services, base clients). Les TMP ne sont PAS scopés enseigne dans le
// schéma T54-A1 (aucun brandSlug sur MobilityHub) : la lecture est donc
// réservée à toute SESSION authentifiée (la base clients véhicule porte des
// données personnelles — noms, téléphones — pas de lecture anonyme), et les
// mutations exigent en plus un rôle d'exploitation réseau :
//   SUPER_ADMIN, ADMIN, NETWORK, COMMERCIAL, DG
// (miroir du gating sidebar HUBS_MODULE_ROLES de T54-A2B1 + Super Admin —
// même discipline que FRANCHISE_WRITE_ROLES côté Radar).
// Conventions : AuditEvent module « HUBS » sur chaque mutation, messages
// d'erreur 100 % FR, schéma T54-A1 GELÉ, routes STRICTEMENT ADDITIVES.
// ============================================================================

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"

/** Rôles autorisés à créer / faire évoluer les services et segments clients. */
export const HUBS_WRITE_ROLES: ReadonlySet<string> = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "NETWORK",
  "COMMERCIAL",
  "DG",
])

export type HubSession =
  | { ok: true; email: string; role: string }
  | { ok: false; status: number; error: string }

/**
 * Exige une session valide → 401 sinon (pattern radar/_lib requireSessionOr401,
 * enrichi du message FR projet). Les lectures hubs sont internes enseigne.
 */
export async function requireHubSession(): Promise<HubSession> {
  const session = await getSessionUser()
  if (!session) {
    return {
      ok: false,
      status: 401,
      error: "Connexion requise — le module Mobility Hub est un espace interne enseigne.",
    }
  }
  return { ok: true, email: session.email, role: session.role }
}

/* ============================== Services de hub ============================== */

/** Les 8 catégories de services d'un TMP (énumération du schéma T54-A1). */
export const SERVICE_CATEGORIES: readonly string[] = [
  "LAVAGE",
  "VIDANGE",
  "PNEUS",
  "RECHARGE",
  "BOUTIQUE",
  "CAFÉ",
  "LAVERIE",
  "RELAIS",
] as const

/** Libellés FR des catégories (mêmes libellés que le volet « services »). */
export const SERVICE_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  LAVAGE: "Lavage",
  VIDANGE: "Vidange",
  PNEUS: "Pneus",
  RECHARGE: "Recharge VE",
  BOUTIQUE: "Boutique",
  CAFÉ: "Café",
  LAVERIE: "Laverie",
  RELAIS: "Relais colis",
}

/**
 * Transitions de statut d'un service (spec T54-Ca) :
 *   · ACTIVE ↔ PAUSED : libres (mise en pause / reprise) ;
 *   · → CLOSED : DÉFINITIVE (le service clôturé ne peut plus être modifié —
 *     400 FR, il faut en recréer un) ;
 *   · CLOSED → n'importe quoi : interdit (définitif).
 */
export const SERVICE_STATUS_LABELS: Readonly<Record<string, string>> = {
  ACTIVE: "Actif",
  PAUSED: "En pause",
  CLOSED: "Clôturé",
}

/* ============================== Clients véhicules ============================== */

/** Segments de fidélité des véhicules clients (énumération du schéma). */
export const VEHICLE_SEGMENTS: readonly string[] = ["FIDÈLE", "RÉGULIER", "NOUVEAU"] as const

export const SEGMENT_LABELS: Readonly<Record<string, string>> = {
  "FIDÈLE": "Fidèle",
  "RÉGULIER": "Régulier",
  "NOUVEAU": "Nouveau",
}

/* ============================== Helpers ============================== */

/** Statuts de hub ordonnés pour l'affichage (actifs d'abord). */
export const HUB_STATUS_RANK: Readonly<Record<string, number>> = {
  ACTIVE: 0,
  CONSTRUCTION: 1,
  PLANNED: 2,
  CLOSED: 3,
}

/** Réponse JSON d'erreur FR utilitaire (évite la répétition dans les routes). */
export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Recherche insensible à la casse et aux accents (miroir serveur du
 * normalizeFr des tables stations/portal — NFD + suppression diacritiques).
 */
export function normalizeFr(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/** Nombre de véhicules clients par page dans la base clients (spec : 20). */
export const CLIENTS_PAGE_SIZE = 20

/**
 * Agrégat « CA cumulé estimé » d'un véhicule client : somme des prix des
 * interventions NON ANNULÉES (réalisées + en cours + planifiées — d'où le
 * badge « est. » affiché côté UI ; les annulées n'ont rien encaissé).
 */
export async function estimatedRevenueByVehicle(vehicleIds: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (vehicleIds.length === 0) return out
  const rows = await db.hubIntervention.groupBy({
    by: ["vehicleId"],
    where: { vehicleId: { in: [...vehicleIds] }, status: { not: "CANCELLED" } },
    _sum: { price: true },
  })
  for (const r of rows) {
    if (r.vehicleId) out.set(r.vehicleId, r._sum.price ?? 0)
  }
  return out
}
