import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeZone, serializeAlert, serializeOpportunitySetting } from "@/lib/t51-server"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// T51 — Module Opportunity Radar. GET : zones d'opportunités + paramétrage
// (poids de scoring de l'enseigne demandée, repli ligne globale) + alertes +
// statistiques de synthèse. POST : actions du portail — « maj-statut-zone »
// (pipeline IDENTIFIEE→EQUIPEE) et « maj-notes ».

const DEFAULT_WEIGHTS = { park: 0.30, power: 0.20, traffic: 0.25, comp: 0.15, foncier: 0.10 }

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand")?.trim() || null
  const [zones, brandSetting, globalSetting, alerts, studies, hubs] = await Promise.all([
    db.opportunityZone.findMany({ orderBy: [{ scoreGlobal: "desc" }] }),
    brand ? db.opportunitySetting.findUnique({ where: { brandSlug: brand } }) : null,
    db.opportunitySetting.findFirst({ where: { brandSlug: null } }),
    db.opportunityAlert.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    db.feasibilityStudy.findMany({ select: { zoneId: true } }),
    db.mobilityHub.findMany({ select: { code: true, gouvernorat: true, delegation: true } }),
  ])
  const setting = brandSetting ?? globalSetting
  const weights = setting
    ? {
        park: setting.weightPark, power: setting.weightPower, traffic: setting.weightTraffic,
        comp: setting.weightCompetition, foncier: setting.weightFoncier,
      }
    : DEFAULT_WEIGHTS
  const studyZoneIds = new Set(studies.map(s => s.zoneId))
  const zoneDTOs = zones.map(z =>
    serializeZone(z, weights, { hasStudy: studyZoneIds.has(z.id), hubCode: null }),
  )
  // Code TMP → zone équipée correspondante (même délégation)
  for (const h of hubs) {
    const z = zoneDTOs.find(x => x.gouvernorat === h.gouvernorat && x.delegation === h.delegation)
    if (z) z.hubCode = h.code
  }
  const white = zoneDTOs.filter(z => z.isWhiteZone)
  const stats = {
    total: zoneDTOs.length,
    whiteZones: white.length,
    avgScore: Math.round(zoneDTOs.reduce((s, z) => s + z.weightedScore, 0) / Math.max(1, zoneDTOs.length)),
    topScore: zoneDTOs[0]?.weightedScore ?? 0,
    critical: zoneDTOs.filter(z => z.weightedScore >= (setting?.alertThreshold ?? 70)).length,
    byFormat: {
      STATION: zoneDTOs.filter(z => z.recommendedFormat === "STATION").length,
      MICRO_HUB_EXPRESS: zoneDTOs.filter(z => z.recommendedFormat === "MICRO_HUB_EXPRESS").length,
      MOBILITY_HUB: zoneDTOs.filter(z => z.recommendedFormat === "MOBILITY_HUB").length,
    },
    pipeline: {
      IDENTIFIEE: zoneDTOs.filter(z => z.status === "IDENTIFIEE").length,
      QUALIFIEE: zoneDTOs.filter(z => z.status === "QUALIFIEE").length,
      ETUDE: zoneDTOs.filter(z => z.status === "ETUDE").length,
      SIGNEE: zoneDTOs.filter(z => z.status === "SIGNEE").length,
      EQUIPEE: zoneDTOs.filter(z => z.status === "EQUIPEE").length,
    },
  }
  return NextResponse.json({
    zones: zoneDTOs,
    settings: setting ? serializeOpportunitySetting(setting) : null,
    alerts: alerts.map(serializeAlert),
    stats,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : undefined

  if (body.action === "maj-statut-zone") {
    const zoneId = typeof body.zoneId === "string" ? body.zoneId : ""
    const status = typeof body.status === "string" ? body.status : ""
    const VALID = ["IDENTIFIEE", "QUALIFIEE", "ETUDE", "SIGNEE", "EQUIPEE"]
    if (!zoneId || !VALID.includes(status)) {
      return NextResponse.json({ error: "Paramètres « zoneId » / « status » invalides" }, { status: 400 })
    }
    const zone = await db.opportunityZone.update({ where: { id: zoneId }, data: { status } })
    await logAudit({
      acteur: actor ? { nom: "Utilisateur", email: actor, role: "PORTAIL" } : undefined,
      module: "OPPORTUNITY",
      action: "Mise à jour du statut de zone d'opportunité",
      cibleType: "Zone",
      cibleLabel: `${zone.zoneName} (${zone.delegation}, ${zone.gouvernorat}) → ${status}`,
    })
    return NextResponse.json({ ok: true, status: zone.status })
  }

  if (body.action === "maj-notes") {
    const zoneId = typeof body.zoneId === "string" ? body.zoneId : ""
    if (!zoneId) return NextResponse.json({ error: "Paramètre « zoneId » requis" }, { status: 400 })
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 600) : null
    await db.opportunityZone.update({ where: { id: zoneId }, data: { notes } })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 400 })
}
