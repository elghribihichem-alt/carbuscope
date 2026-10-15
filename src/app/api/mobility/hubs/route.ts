import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeHub } from "@/lib/t51-server"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// T51 — Module Mobility Hub Operations. GET ?brand=&hubId= → TMP (micro-hubs)
// avec KPIs calculés (CA 30 j, objectif, conversions, ROI, alertes) + stats de
// synthèse réseau. Le paramètre hubId isole un seul TMP (fiche détaillée).

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand")?.trim() || null
  const hubId = req.nextUrl.searchParams.get("hubId")?.trim() || null

  const hubs = await (hubId
    ? db.mobilityHub.findMany({ where: { id: hubId } })
    : brand
      ? db.mobilityHub.findMany({ where: { brandSlug: brand }, orderBy: { code: "asc" } })
      : db.mobilityHub.findMany({ orderBy: { code: "asc" } }))
  if (hubs.length === 0) return NextResponse.json({ hubs: [], stats: null })

  const hubIds = hubs.map(h => h.id)
  const [records, conversions, vehicleCounts, equipment, stocks] = await Promise.all([
    db.hubServiceRecord.findMany({ where: { hubId: { in: hubIds } }, select: { hubId: true, amount: true, performedAt: true } }),
    db.hubConversion.findMany({ where: { hubId: { in: hubIds } }, select: { hubId: true, status: true, amount: true, proposedAt: true } }),
    db.hubVehicle.groupBy({ by: ["hubId"], where: { hubId: { in: hubIds } }, _count: { _all: true } }),
    db.hubEquipment.findMany({ where: { hubId: { in: hubIds } }, select: { hubId: true, status: true } }),
    db.hubStockItem.findMany({ where: { hubId: { in: hubIds } }, select: { hubId: true, quantity: true, minQuantity: true } }),
  ])
  const vehicleCountByHub = new Map(vehicleCounts.map(v => [v.hubId, v._count._all]))
  const hubDTOs = hubs.map(h => serializeHub(
    h,
    records.filter(r => r.hubId === h.id),
    conversions.filter(c => c.hubId === h.id),
    vehicleCountByHub.get(h.id) ?? 0,
    equipment.filter(e => e.hubId === h.id && e.status === "ALERTE").length,
    stocks.filter(s => s.hubId === h.id && s.quantity <= s.minQuantity).length,
  ))
  const operational = hubDTOs.filter(h => h.status === "OPERATIONNEL")
  const stats = {
    total: hubDTOs.length,
    operational: operational.length,
    construction: hubDTOs.filter(h => h.status === "EN_CONSTRUCTION").length,
    pilotes: hubDTOs.filter(h => h.status === "PILOTE").length,
    ca30: hubDTOs.reduce((s, h) => s + h.ca30, 0),
    caCaptured: hubDTOs.reduce((s, h) => s + h.caCaptured, 0),
    conversions90: hubDTOs.reduce((s, h) => s + h.conversions90, 0),
    confirmed90: hubDTOs.reduce((s, h) => s + h.conversionsConfirmed90, 0),
    avgConversionRate: hubDTOs.length > 0
      ? Math.round(hubDTOs.reduce((s, h) => s + h.conversionRate, 0) / hubDTOs.length)
      : 0,
    vehicles: hubDTOs.reduce((s, h) => s + h.vehiclesCount, 0),
    equipmentAlerts: hubDTOs.reduce((s, h) => s + h.equipmentAlerts, 0),
    stockAlerts: hubDTOs.reduce((s, h) => s + h.stockAlerts, 0),
    avgRating: hubDTOs.length > 0
      ? Math.round(hubDTOs.reduce((s, h) => s + h.rating, 0) / hubDTOs.length * 10) / 10
      : 0,
  }
  return NextResponse.json({ hubs: hubDTOs, stats })
}

// POST — actions sur les TMP : « maj-statut » (EN_CONSTRUCTION | PILOTE |
// OPERATIONNEL | SUSPENDU). Audité (module MOBILITY).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }
  if (body.action === "maj-statut") {
    const hubId = typeof body.hubId === "string" ? body.hubId : ""
    const status = typeof body.status === "string" ? body.status : ""
    const VALID = ["EN_CONSTRUCTION", "PILOTE", "OPERATIONNEL", "SUSPENDU"]
    if (!hubId || !VALID.includes(status)) {
      return NextResponse.json({ error: "Paramètres « hubId » / « status » invalides" }, { status: 400 })
    }
    const hub = await db.mobilityHub.update({ where: { id: hubId }, data: { status } })
    const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : undefined
    await logAudit({
      acteur: actor ? { nom: "Utilisateur", email: actor, role: "PORTAIL" } : undefined,
      module: "MOBILITY",
      action: "Mise à jour du statut d'un TMP",
      cibleType: "TMP",
      cibleLabel: `${hub.code} — ${hub.name} → ${status}`,
    })
    return NextResponse.json({ ok: true, status: hub.status })
  }
  return NextResponse.json({ error: "Action inconnue" }, { status: 400 })
}
