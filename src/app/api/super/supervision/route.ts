// Super Administration — supervision de la plateforme (T52-R1, réécriture).
// Santé mesurée sur les modèles Prisma RÉELLEMENT présents dans le schéma :
// taille de la base + comptages table par table (latence agrégée), sonde des
// routes API vivantes, fraîcheur des données métier et charge de modération.
//
// ⚠️ Historique : la version d'origine (T44) sondatait les modèles « JobPlateforme »,
// « Incident », « Sauvegarde », « ParametrePlateforme » du stock historique —
// inexistants dans le schéma actuel → HTTP 500 systématique. Ces concepts
// (jobs planifiés, incidents, mode maintenance) ne peuvent PAS être servis ici
// sans inventer des données : besoin signalé à l'orchestrateur (T52-R1).
// Cette version ne remonte que des mesures réelles.
import { NextResponse } from "next/server"
import * as fs from "fs"
import * as path from "path"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

/** Tables suivies (modèles vivants du schéma) — comptage parallèle. */
const TABLES: Record<string, () => Promise<number>> = {
  Stations: () => db.station.count(),
  Enseignes: () => db.brand.count(),
  Utilisateurs: () => db.user.count(),
  ContratsSaaS: () => db.saasContract.count(),
  FacturesSaaS: () => db.saasInvoice.count(),
  Avis: () => db.review.count(),
  Contributions: () => db.contribution.count(),
  Alertes: () => db.alert.count(),
  PrixCarburants: () => db.fuelPrice.count(),
  Missions: () => db.mission.count(),
  RapportsVisite: () => db.visitReport.count(),
  AgentsTerrain: () => db.fieldAgent.count(),
  PointsShadow: () => db.shadowPoint.count(),
  Delegations: () => db.demographicDelegation.count(),
  Cites: () => db.demographicCite.count(),
  JournalAudit: () => db.auditEvent.count(),
}

/** Sonde des routes API vivantes (mesure in-process, sans lecture du corps). */
const SONDES: string[] = [
  "/api/brands",
  "/api/stations?limit=1",
  "/api/prices",
  "/api/alerts?limit=1",
  "/api/missions",
]

export async function GET() {
  try {
    // 1) Base de données — comptages parallèles + latence agrégée
    const t0 = performance.now()
    const entrees = await Promise.all(
      Object.entries(TABLES).map(async ([table, count]) => ({ table, lignes: await count() })),
    )
    const latenceMs = Math.round((performance.now() - t0) * 10) / 10
    const totalLignes = entrees.reduce((s, e) => s + e.lignes, 0)
    const dbPath = path.join(process.cwd(), "db", "custom.db")
    const tailleKo = fs.existsSync(dbPath) ? Math.round(fs.statSync(dbPath).size / 1024) : 0

    // 2) Sonde des routes API (statut + latence réels)
    const base = "http://127.0.0.1:3000"
    const endpoints = await Promise.all(
      SONDES.map(async chemin => {
        const start = performance.now()
        try {
          const r = await fetch(`${base}${chemin}`, { cache: "no-store", signal: AbortSignal.timeout(4000) })
          const lat = Math.round(performance.now() - start)
          return { chemin, statut: r.ok ? (lat > 800 ? "LENT" : "OK") : "ERREUR", latenceMs: lat }
        } catch {
          return { chemin, statut: "ERREUR", latenceMs: Math.round(performance.now() - start) }
        }
      }),
    )
    endpoints.sort((a, b) => a.chemin.localeCompare(b.chemin))

    // 3) Fraîcheur des données métier + charge de modération (mesures réelles)
    const [prix, contribution, avis, audit, connexion, missions, signalements, alertesCrit] = await Promise.all([
      db.fuelPrice.aggregate({ _max: { effectiveAt: true } }),
      db.contribution.aggregate({ _max: { createdAt: true } }),
      db.review.aggregate({ _max: { createdAt: true } }),
      db.auditEvent.aggregate({ _max: { createdAt: true } }),
      db.user.aggregate({ _max: { lastLoginAt: true } }),
      db.mission.count({ where: { status: { in: ["PLANIFIEE", "EN_COURS"] } } }),
      db.contribution.count({ where: { status: "PENDING" } }),
      db.alert.count({ where: { severity: "CRITICAL", read: false } }),
    ])

    return NextResponse.json({
      releveAt: new Date().toISOString(),
      base: {
        fichier: "db/custom.db (SQLite)",
        tailleKo,
        nbTables: entrees.length,
        totalLignes,
        tables: entrees.sort((a, b) => b.lignes - a.lignes),
        latenceMs,
      },
      api: { endpoints, ok: endpoints.filter(e => e.statut === "OK").length, total: endpoints.length },
      fraicheur: {
        dernierPrixCarburantAt: prix._max.effectiveAt?.toISOString() ?? null,
        derniereContributionAt: contribution._max.createdAt?.toISOString() ?? null,
        dernierAvisAt: avis._max.createdAt?.toISOString() ?? null,
        dernierAuditAt: audit._max.createdAt?.toISOString() ?? null,
        derniereConnexionAt: connexion._max.lastLoginAt?.toISOString() ?? null,
      },
      charge: {
        missionsEnCours: missions,
        signalementsEnAttente: signalements,
        alertesCritiques: alertesCrit,
      },
    })
  } catch (e) {
    console.error("GET /api/super/supervision", e)
    return NextResponse.json(
      { error: "Impossible de relever l'état de la plateforme." },
      { status: 500 },
    )
  }
}
