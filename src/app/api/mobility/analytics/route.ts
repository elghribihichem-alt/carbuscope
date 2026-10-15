import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeHub } from "@/lib/t51-server"

export const dynamic = "force-dynamic"

// T51 — Analytics & Conversions des Mobility Hubs. GET ?brand= → tableau de
// bord comparatif : KPIs par TMP (CA, ROI, taux de conversion, satisfaction),
// série mensuelle réseau, répartition CA par type de service, top conversions
// et CA capté pour les stations classiques (par TMP cible).

const DAY = 86_400_000

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand")?.trim() || null
  const hubs = await (brand
    ? db.mobilityHub.findMany({ where: { brandSlug: brand }, orderBy: { code: "asc" } })
    : db.mobilityHub.findMany({ orderBy: { code: "asc" } }))
  if (hubs.length === 0) {
    return NextResponse.json({ hubs: [], monthly: [], byType: [], topConversions: [], stationCapture: [], totals: null })
  }
  const hubIds = hubs.map(h => h.id)
  const [records, conversions, vehicleCounts, equipment, stocks] = await Promise.all([
    db.hubServiceRecord.findMany({ where: { hubId: { in: hubIds } } }),
    db.hubConversion.findMany({ where: { hubId: { in: hubIds } } }),
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

  const now = Date.now()
  // Série mensuelle réseau (6 mois)
  const monthly: { month: string; ca: number; conversions: number; captured: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now - (i + 1) * 30 * DAY)
    const end = new Date(now - i * 30 * DAY)
    const inRange = (d: Date) => d >= start && d < end
    monthly.push({
      month: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(end),
      ca: Math.round(records.filter(r => inRange(r.performedAt)).reduce((s, r) => s + r.amount, 0)),
      conversions: conversions.filter(c => inRange(c.proposedAt) && c.status === "CONFIRMEE").length,
      captured: Math.round(conversions
        .filter(c => inRange(c.proposedAt) && c.status === "CONFIRMEE")
        .reduce((s, c) => s + c.amount, 0)),
    })
  }
  // Répartition du CA par type de service (fenêtre 90 j)
  const byType = ["VIDANGE", "PNEUS_VENTE", "PNEUS_MONTAGE", "DIAGNOSTIC"].map(t => {
    const rows = records.filter(r => r.type === t && now - r.performedAt.getTime() < 90 * DAY)
    return { type: t, count: rows.length, amount: Math.round(rows.reduce((s, r) => s + r.amount, 0)) }
  })
  // Top conversions confirmées (montant) + CA capté par station cible
  const confirmed = conversions.filter(c => c.status === "CONFIRMEE")
  const topConversions = confirmed
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 12)
    .map(c => ({
      plate: c.plate, reason: c.reason, amount: c.amount,
      station: c.targetStationName, stationCode: c.targetStationCode,
      proposedAt: c.proposedAt.toISOString(),
    }))
  const captureMap = new Map<string, { station: string; stationCode: string; amount: number; count: number }>()
  for (const c of confirmed) {
    const cur = captureMap.get(c.targetStationCode) ?? {
      station: c.targetStationName, stationCode: c.targetStationCode, amount: 0, count: 0,
    }
    cur.amount += c.amount
    cur.count += 1
    captureMap.set(c.targetStationCode, cur)
  }
  const stationCapture = [...captureMap.values()].sort((a, b) => b.amount - a.amount).slice(0, 15)

  const totals = {
    ca30: hubDTOs.reduce((s, h) => s + h.ca30, 0),
    captured: hubDTOs.reduce((s, h) => s + h.caCaptured, 0),
    conversions90: hubDTOs.reduce((s, h) => s + h.conversions90, 0),
    confirmed90: hubDTOs.reduce((s, h) => s + h.conversionsConfirmed90, 0),
    avgConversion: hubDTOs.length ? Math.round(hubDTOs.reduce((s, h) => s + h.conversionRate, 0) / hubDTOs.length) : 0,
    avgRoi: hubDTOs.length ? Math.round(hubDTOs.reduce((s, h) => s + h.roiPct, 0) / hubDTOs.length) : 0,
    vehicles: hubDTOs.reduce((s, h) => s + h.vehiclesCount, 0),
  }
  return NextResponse.json({ hubs: hubDTOs, monthly, byType, topConversions, stationCapture, totals })
}
