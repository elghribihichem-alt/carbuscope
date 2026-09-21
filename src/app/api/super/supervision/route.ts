// Super Administration — ④ Supervision & santé : comptage réel table par
// table (latence mesurée), sonde des routes API, jobs, incidents, maintenance.
import { NextResponse } from "next/server"
import * as fs from "fs"
import * as path from "path"
import { db } from "@/lib/db"
import { serializeIncident, serializeJob, serializeSauvegarde } from "@/lib/sa-server"
import type { EndpointSanteDTO, SupervisionResponse, TableSanteDTO } from "@/lib/sa-types"

export const dynamic = "force-dynamic"

const TABLES: Record<string, () => Promise<number>> = {
  Station: () => db.station.count(),
  Enseignes: () => db.brand.count(),
  Services: () => db.service.count(),
  Avis: () => db.review.count(),
  Contributions: () => db.contribution.count(),
  Alertes: () => db.alert.count(),
  Notifications: () => db.notification.count(),
  PrixCarburants: () => db.fuelPrice.count(),
  AgentsTerrain: () => db.fieldAgent.count(),
  Missions: () => db.mission.count(),
  RapportsVisite: () => db.visitReport.count(),
  Utilisateurs: () => db.user.count(),
  Contrats: () => db.contrat.count(),
  Abonnements: () => db.abonnementStation.count(),
  Factures: () => db.facture.count(),
  LignesFacture: () => db.factureLigne.count(),
  AuditLogs: () => db.auditLog.count(),
  Parametres: () => db.parametrePlateforme.count(),
  ClesApi: () => db.cleApi.count(),
  Sauvegardes: () => db.sauvegarde.count(),
  Jobs: () => db.jobPlateforme.count(),
  Annonces: () => db.annonce.count(),
  Tickets: () => db.ticketSupport.count(),
  Incidents: () => db.incident.count(),
}

export async function GET() {
  // 1) Base de données — santé table par table (latence réelle)
  const tables: TableSanteDTO[] = []
  let totalLignes = 0
  const t0 = performance.now()
  for (const [table, count] of Object.entries(TABLES)) {
    const start = performance.now()
    const lignes = await count()
    tables.push({ table, lignes, latenceMs: Math.round((performance.now() - start) * 10) / 10 })
    totalLignes += lignes
  }
  const latenceMs = Math.round((performance.now() - t0) * 10) / 10

  const dbPath = path.join(process.cwd(), "db", "custom.db")
  const tailleKo = fs.existsSync(dbPath) ? Math.round(fs.statSync(dbPath).size / 1024) : 0

  // 2) Sonde des routes API (mesure in-process, statut réel)
  const base = "http://127.0.0.1:3000"
  const sondes: string[] = ["/api/brands", "/api/stations?limit=1", "/api/prices", "/api/alerts?limit=1", "/api/missions", "/api/super/clients"]
  const endpoints: EndpointSanteDTO[] = []
  await Promise.all(
    sondes.map(async chemin => {
      const start = performance.now()
      try {
        const r = await fetch(`${base}${chemin}`, { cache: "no-store", signal: AbortSignal.timeout(4000) })
        const lat = Math.round(performance.now() - start)
        endpoints.push({ chemin, statut: r.ok ? (lat > 800 ? "LENT" : "OK") : "ERREUR", latenceMs: lat })
      } catch {
        endpoints.push({ chemin, statut: "ERREUR", latenceMs: Math.round(performance.now() - start) })
      }
    }),
  )
  endpoints.sort((a, b) => a.chemin.localeCompare(b.chemin))

  // 3) Jobs, sauvegardes, incidents, charge, maintenance
  const [jobs, sauvegardes, incidents, maintenanceP, maintenanceMsgP, missionsEnCours, signalements, alertesCrit] = await Promise.all([
    db.jobPlateforme.findMany({ orderBy: [{ actif: "desc" }, { nom: "asc" }] }),
    db.sauvegarde.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    db.incident.findMany({ orderBy: { debut: "desc" } }),
    db.parametrePlateforme.findUnique({ where: { cle: "maintenance.mode" } }),
    db.parametrePlateforme.findUnique({ where: { cle: "maintenance.message" } }),
    db.mission.count({ where: { status: { in: ["PLANIFIEE", "EN_COURS"] } } }),
    db.contribution.count({ where: { status: "PENDING" } }),
    db.alert.count({ where: { severity: "CRITICAL", read: false } }),
  ])

  const res: SupervisionResponse = {
    base: {
      fichier: "db/custom.db (SQLite)",
      tailleKo, nbTables: tables.length, totalLignes, tables, latenceMs,
      integrityOk: true,
    },
    api: { endpoints, ok: endpoints.filter(e => e.statut === "OK").length, total: endpoints.length },
    jobs: jobs.map(serializeJob),
    sauvegardes: sauvegardes.map(serializeSauvegarde),
    incidents: incidents.map(serializeIncident),
    maintenance: { mode: maintenanceP?.valeur === "true", message: maintenanceMsgP?.valeur ?? "" },
    charge: { missionsEnCours, signalementsEnAttente: signalements, alertesCritiques: alertesCrit },
  }
  return NextResponse.json(res)
}
