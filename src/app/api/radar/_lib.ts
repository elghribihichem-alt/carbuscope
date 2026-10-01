// ============================================================================
// CarbuScope — T54-B2 — lib serveur partagée des routes /api/radar/*.
// Charge les données du moteur de scoring depuis la base (gouvernorats INS,
// pouvoir d'achat, foncier, axes routiers, stations en service, délégations,
// configuration OpportunityConfig) et expose des helpers d'authentification.
// Convention projet : les GET « données » restent ouverts en démonstration ;
// les PATCH sont réservés (Super Administration pour config/indicateurs,
// session authentifiée pour l'acquittement des alertes) — cf. chaque route.
// ============================================================================

import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import {
  type ScoringInputs,
  type ScoringRoadAxis,
  type ScoringWeights,
} from "@/lib/radar/scoring"

/** Statuts comptés comme « offre en service » (même convention que
 *  computeGovStats — implantation-shared.tsx, fichier gelé). */
const SERVICE_STATUSES = ["ACTIVE", "RENOVATION"]

/** Poids par défaut (mirroir des valeurs par défaut du schéma Prisma). */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  parc: 30,
  purchasing: 20,
  trafic: 25,
  concurrence: 15,
  foncier: 10,
}

export type RadarThresholds = { zoneBlanche: number; alert: number }

/** Configuration effective du moteur (singleton « default », créé au besoin). */
export async function loadConfig(): Promise<{
  weights: ScoringWeights
  thresholds: RadarThresholds
  updatedBy: string | null
  updatedAt: string
}> {
  let config = await db.opportunityConfig.findUnique({ where: { id: "default" } })
  if (!config) {
    config = await db.opportunityConfig.create({
      data: {
        id: "default",
        weightParc: DEFAULT_WEIGHTS.parc,
        weightPurchasing: DEFAULT_WEIGHTS.purchasing,
        weightTrafic: DEFAULT_WEIGHTS.trafic,
        weightConcurrence: DEFAULT_WEIGHTS.concurrence,
        weightFoncier: DEFAULT_WEIGHTS.foncier,
      },
    })
  }
  return {
    weights: {
      parc: config.weightParc,
      purchasing: config.weightPurchasing,
      trafic: config.weightTrafic,
      concurrence: config.weightConcurrence,
      foncier: config.weightFoncier,
    },
    thresholds: {
      zoneBlanche: config.zoneBlancheThreshold,
      alert: config.alertThreshold,
    },
    updatedBy: config.updatedBy,
    updatedAt: config.updatedAt.toISOString(),
  }
}

/** Charge les entrées complètes du moteur (calculs purs dans scoring.ts). */
export async function loadScoringInputs(): Promise<ScoringInputs> {
  const [govRows, purchasingRows, landRows, roadRows, stationGroups, delegRows] =
    await Promise.all([
      db.governoratStat.findMany({
        select: { name: true, population: true, vehicles: true },
        orderBy: { name: "asc" },
      }),
      db.purchasingPower.findMany({
        select: { gouvernorat: true, index: true },
      }),
      db.landIndicator.findMany({
        select: { gouvernorat: true, pricePerM2: true, availability: true },
      }),
      db.roadAxis.findMany({
        select: { tmj: true, heavyVehiclePct: true, segments: true },
      }),
      db.station.groupBy({
        by: ["gouvernorat"],
        where: { status: { in: SERVICE_STATUSES } },
        _count: { id: true },
      }),
      db.demographicDelegation.findMany({
        select: {
          gouvernorat: true,
          delegation: true,
          population: true,
          vehiclesLight: true,
          vehiclesUtility: true,
          vehiclesHeavy: true,
          vehiclesBuses: true,
          vehiclesMotorcycles: true,
        },
        orderBy: [{ gouvernorat: "asc" }, { delegation: "asc" }],
      }),
    ])

  const purchasingByGov = new Map(purchasingRows.map(p => [p.gouvernorat, p]))
  const landByGov = new Map(landRows.map(l => [l.gouvernorat, l]))
  const stationsByGov = new Map(stationGroups.map(g => [g.gouvernorat, g._count.id]))

  return {
    governorats: govRows.map(g => ({
      name: g.name,
      population: g.population,
      vehicles: g.vehicles,
      stationsInService: stationsByGov.get(g.name) ?? 0,
      purchasing: purchasingByGov.has(g.name)
        ? { index: purchasingByGov.get(g.name)!.index }
        : null,
      land: landByGov.has(g.name)
        ? {
            pricePerM2: landByGov.get(g.name)!.pricePerM2,
            availability: landByGov.get(g.name)!.availability,
          }
        : null,
    })),
    roads: roadRows.map(r => ({
      tmj: r.tmj,
      heavyVehiclePct: r.heavyVehiclePct,
      segments: (r.segments ?? []) as ScoringRoadAxis["segments"],
    })),
    delegations: delegRows.map(d => ({
      gouvernorat: d.gouvernorat,
      delegation: d.delegation,
      population: d.population,
      // Parc réel = somme des 5 catégories (null si aucune catégorie renseignée).
      parc:
        d.vehiclesLight == null &&
        d.vehiclesUtility == null &&
        d.vehiclesHeavy == null &&
        d.vehiclesBuses == null &&
        d.vehiclesMotorcycles == null
          ? null
          : (d.vehiclesLight ?? 0) +
            (d.vehiclesUtility ?? 0) +
            (d.vehiclesHeavy ?? 0) +
            (d.vehiclesBuses ?? 0) +
            (d.vehiclesMotorcycles ?? 0),
    })),
  }
}

/** Exige une session valide → 401 sinon (pattern des routes admin). */
export async function requireSessionOr401(): Promise<
  { ok: true; email: string; role: string } | { ok: false; email: null; role: null }
> {
  const session = await getSessionUser()
  if (!session) return { ok: false, email: null, role: null }
  return { ok: true, email: session.email, role: session.role }
}

/** Exige la Super Administration → 401 (non connecté) / 403 (rôle insuffisant). */
export async function requireSuperAdmin(): Promise<
  { ok: true; email: string } | { ok: false; status: number; error: string }
> {
  const session = await getSessionUser()
  if (!session) {
    return {
      ok: false,
      status: 401,
      error: "Connexion requise — cette action est réservée à la Super Administration.",
    }
  }
  if (session.role !== "SUPER_ADMIN") {
    return {
      ok: false,
      status: 403,
      error: "Action réservée à la Super Administration.",
    }
  }
  return { ok: true, email: session.email }
}
