// GET /api/shadow/overview — Vue d'ensemble du marché parallèle (T44)
// KPIs, alertes, pertes par gouvernorat, typologies, série mensuelle,
// top stations menacées, calendrier des recensements.
// Scope : NATIONAL (super-admin / démo sans session) ou BRAND (pertes filtrées
// sur les stations de l'enseigne — les points informels restent nationaux).
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  getDataset, resolveScope, marketShareStolenPct, govLossesForBrand,
  typologyStatsFor, topThreatsFor, monthlyForScope,
} from "@/app/api/shadow/_lib"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const scope = await resolveScope(req)
  const ds = await getDataset()

  const [alerts, calendar, pendingValidation, newThisWeek] = await Promise.all([
    db.shadowAlert.findMany({ orderBy: { date: "desc" }, take: 40 }),
    db.shadowCensusEvent.findMany({ orderBy: { date: "asc" } }),
    db.shadowPoint.count({ where: { status: { in: ["BRUT", "VERIFIE"] } } }),
    db.shadowPoint.count({
      where: { active: true, status: { notIn: ["REJETE", "DOUBLON"] }, firstSeenAt: { gte: new Date(Date.now() - 7 * 86400000) } },
    }),
  ])

  const latest = ds.monthly[ds.monthly.length - 1] ?? null
  const prev = ds.monthly[ds.monthly.length - 2] ?? null

  // --- KPIs ---
  const brandAgg = scope.scope === "BRAND" && scope.brandSlug ? ds.brandAgg.get(scope.brandSlug) : null
  const estLossTnd = brandAgg ? brandAgg.lossTnd : ds.totals.lossTnd
  const volumeLJ = brandAgg ? Math.round(brandAgg.capturedLJ) : ds.totals.volumeLJ
  const stationsThreatened = brandAgg ? brandAgg.stationsThreatened : ds.totals.stationsThreatened
  const stationsThreatenedRed = brandAgg ? brandAgg.stationsRed : ds.totals.stationsThreatenedRed

  // Variations vs mois précédent (série nationale — les points informels sont
  // un phénomène national ; la dynamique de perte est supposée homothétique
  // pour une enseigne donnée).
  const monthVariationPct =
    latest && prev && prev.activePoints > 0
      ? Math.round(((latest.activePoints - prev.activePoints) / prev.activePoints) * 1000) / 10
      : 0
  const lossVariationPct =
    latest && prev && prev.estLossTnd > 0
      ? Math.round(((latest.estLossTnd - prev.estLossTnd) / prev.estLossTnd) * 1000) / 10
      : 0

  const kpis = {
    activePoints: ds.totals.points,
    estLossTnd: Math.round(estLossTnd),
    stationsThreatened,
    stationsThreatenedRed,
    monthVariationPct,
    lossVariationPct,
    marketShareStolenPct: marketShareStolenPct(ds),
    volumeLJ,
    pendingValidation,
    newThisWeek,
  }

  // --- Alertes (sévérité puis date) ---
  const sevOrder: Record<string, number> = { CRITICAL: 0, MEDIUM: 1, INFO: 2 }
  const alertsFeed = [...alerts]
    .sort((a, b) => {
      const s = (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9)
      return s !== 0 ? s : b.date.getTime() - a.date.getTime()
    })
    .slice(0, 10)
    .map(a => ({
      id: a.id, severity: a.severity, kind: a.kind, title: a.title, detail: a.detail,
      zone: a.zone, stationCode: a.stationCode, stationName: a.stationName,
      lossTnd: a.lossTnd, date: a.date.toISOString(),
    }))

  const govLosses =
    scope.scope === "BRAND" && scope.brandSlug ? govLossesForBrand(ds, scope.brandSlug) : ds.govNational

  return NextResponse.json({
    month: latest?.month ?? "",
    monthLabel: latest?.label ?? "",
    scope: scope.scope,
    brandSlug: scope.brandSlug,
    kpis,
    alerts: alertsFeed,
    govLosses,
    typologies: typologyStatsFor(ds, scope.scope === "BRAND" ? scope.brandSlug : null),
    monthly: monthlyForScope(ds, scope),
    topThreats: topThreatsFor(ds, scope.scope === "BRAND" ? scope.brandSlug : null, 10),
    calendar: calendar.map(e => ({
      id: e.id, teamLabel: e.teamLabel, zone: e.zone, kind: e.kind,
      date: e.date.toISOString(), pointsTargeted: e.pointsTargeted,
      pointsFound: e.pointsFound, status: e.status,
    })),
  })
}
