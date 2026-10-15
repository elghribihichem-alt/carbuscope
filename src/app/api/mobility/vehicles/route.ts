import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeVehicle } from "@/lib/t51-server"

export const dynamic = "force-dynamic"

// T51 — Base Clients TMP. GET ?hubId=&q=&tier= → véhicules diagnostiqués /
// entretenus avec alertes automatiques calculées (échéances d'entretien,
// paramétrage HubSetting de l'enseigne) + synthèse fidélité + historique
// d'entretien (prestations groupées par véhicule).

export async function GET(req: NextRequest) {
  const hubId = req.nextUrl.searchParams.get("hubId")?.trim() || null
  const q = req.nextUrl.searchParams.get("q")?.trim()?.toLowerCase() ?? ""
  const tier = req.nextUrl.searchParams.get("tier")?.trim() || null

  const hubs = await (hubId
    ? db.mobilityHub.findMany({ where: { id: hubId } })
    : db.mobilityHub.findMany({ orderBy: { code: "asc" } }))
  if (hubs.length === 0) {
    return NextResponse.json({ vehicles: [], history: [], loyalty: null, alerts: { urgent: 0, info: 0 } })
  }
  const hubIds = hubs.map(h => h.id)
  const codeById = new Map(hubs.map(h => [h.id, h.code]))

  const [vehicles, records, setting] = await Promise.all([
    db.hubVehicle.findMany({ where: { hubId: { in: hubIds } }, orderBy: { lastServiceAt: "desc" } }),
    db.hubServiceRecord.findMany({
      where: { hubId: { in: hubIds }, vehicleId: { not: null } },
      orderBy: { performedAt: "desc" },
      take: 600,
    }),
    hubs[0] ? db.hubSetting.findUnique({ where: { brandSlug: hubs[0].brandSlug } }) : null,
  ])

  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  let dtos = vehicles.map(v => serializeVehicle(v, codeById.get(v.hubId), setting))
  if (tier && ["BRONZE", "ARGENT", "OR", "PLATINE"].includes(tier)) {
    dtos = dtos.filter(v => v.loyaltyTier === tier)
  }
  if (q) {
    dtos = dtos.filter(v =>
      norm(v.plate).includes(norm(q)) || norm(v.ownerName).includes(norm(q)) ||
      norm(v.brand + " " + v.model).includes(norm(q)))
  }

  // Historique d'entretien : prestations par véhicule (limitées aux 200 véhicules affichés)
  const shownIds = new Set(dtos.slice(0, 200).map(v => v.id))
  const history = records
    .filter(r => r.vehicleId && shownIds.has(r.vehicleId))
    .map(r => ({
      vehicleId: r.vehicleId as string,
      hubCode: codeById.get(r.hubId),
      type: r.type,
      performedAt: r.performedAt.toISOString(),
      amount: r.amount,
      detail: r.detail,
    }))

  const loyalty = {
    bronze: vehicles.filter(v => v.loyaltyTier === "BRONZE").length,
    argent: vehicles.filter(v => v.loyaltyTier === "ARGENT").length,
    or: vehicles.filter(v => v.loyaltyTier === "OR").length,
    platine: vehicles.filter(v => v.loyaltyTier === "PLATINE").length,
    points: vehicles.reduce((s, v) => s + v.loyaltyPoints, 0),
    avgServices: vehicles.length ? Math.round(vehicles.reduce((s, v) => s + v.servicesCount, 0) / vehicles.length * 10) / 10 : 0,
    avgSpent: vehicles.length ? Math.round(vehicles.reduce((s, v) => s + v.totalSpent, 0) / vehicles.length) : 0,
    fuelMix: {
      ESSENCE: vehicles.filter(v => v.fuel === "ESSENCE").length,
      DIESEL: vehicles.filter(v => v.fuel === "DIESEL").length,
      HYBRIDE: vehicles.filter(v => v.fuel === "HYBRIDE").length,
      AUTRES: vehicles.filter(v => !["ESSENCE", "DIESEL", "HYBRIDE"].includes(v.fuel)).length,
    },
  }
  return NextResponse.json({
    vehicles: dtos.slice(0, 200),
    history,
    loyalty,
    alerts: {
      urgent: dtos.filter(v => v.alert?.level === "URGENT").length,
      info: dtos.filter(v => v.alert?.level === "INFO").length,
    },
  })
}
