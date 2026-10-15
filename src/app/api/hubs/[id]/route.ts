import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// T55-A1 — GET /api/hubs/[id] : fiche détaillée d'un micro-hub — méta,
// franchisé, KPIs réels, 20 dernières interventions (véhicule inclus),
// 12 véhicules clients, 12 dernières conversions, grille tarifaire.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const hub = await db.mobilityHub.findUnique({
    where: { id },
    include: {
      franchisee: { select: { fullName: true, email: true, phone: true, capital: true, experience: true } },
      interventions: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { vehicle: { select: { plate: true, brand: true, model: true, km: true } } },
      },
      vehicles: { orderBy: { lastVisit: "desc" }, take: 12 },
    },
  })
  if (!hub) return NextResponse.json({ error: "Micro-hub introuvable." }, { status: 404 })

  const [allInterventions, conversions, services] = await Promise.all([
    db.hubIntervention.findMany({ where: { hubId: id }, select: { priceDt: true, createdAt: true } }),
    db.hubConversion.findMany({ where: { hubId: id }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.hubService.findMany(),
  ])

  const now = Date.now()
  const d30 = now - 30 * 24 * 3600 * 1000
  const caTotal = allInterventions.reduce((s, i) => s + i.priceDt, 0)
  const ca30 = allInterventions.filter(i => i.createdAt.getTime() >= d30).reduce((s, i) => s + i.priceDt, 0)
  const monthsOpen = hub.openedAt ? Math.max(1, Math.round((now - hub.openedAt.getTime()) / (30 * 24 * 3600 * 1000))) : 0
  const caMonthly = monthsOpen > 0 ? Math.round(caTotal / monthsOpen) : 0
  const converted = conversions.filter(c => c.status === "CONVERTI")
  const vehiclesCount = await db.hubVehicle.count({ where: { hubId: id } })

  return NextResponse.json({
    hub: {
      id: hub.id,
      code: hub.code,
      name: hub.name,
      brandSlug: hub.brandSlug,
      gouvernorat: hub.gouvernorat,
      delegation: hub.delegation,
      lat: hub.lat,
      lng: hub.lng,
      format: hub.format,
      status: hub.status,
      openedAt: hub.openedAt?.toISOString() ?? null,
      investmentDt: hub.investmentDt,
      monthlyRentDt: hub.monthlyRentDt,
      franchisee: hub.franchisee,
      kpis: {
        interventions: allInterventions.length,
        caTotal: Math.round(caTotal),
        ca30: Math.round(ca30),
        caMonthly,
        vehicles: vehiclesCount,
        conversionsShown: conversions.length,
        conversionsConverted: converted.length,
        caConversions: Math.round(converted.reduce((s, c) => s + c.valueDt, 0)),
        roiPct: hub.investmentDt > 0 && caTotal > 0 ? Math.round((caTotal / hub.investmentDt) * 1000) / 10 : 0,
        paybackMonths: caMonthly > 0 ? Math.round(hub.investmentDt / caMonthly) : null,
        monthsOpen,
      },
      interventions: hub.interventions.map(i => ({
        id: i.id,
        serviceType: i.serviceType,
        detail: i.detail,
        priceDt: i.priceDt,
        durationMin: i.durationMin,
        createdAt: i.createdAt.toISOString(),
        vehicle: i.vehicle ? { plate: i.vehicle.plate, brand: i.vehicle.brand, model: i.vehicle.model } : null,
      })),
      vehicles: hub.vehicles.map(v => ({
        id: v.id,
        plate: v.plate,
        brand: v.brand,
        model: v.model,
        km: v.km,
        loyaltyPoints: v.loyaltyPoints,
        lastVisit: v.lastVisit?.toISOString() ?? null,
      })),
      conversions: conversions.map(c => ({
        id: c.id,
        stationCode: c.stationCode,
        detail: c.detail,
        status: c.status,
        valueDt: c.valueDt,
        createdAt: c.createdAt.toISOString(),
      })),
      services: services.map(s => ({ type: s.type, label: s.label, basePriceDt: s.basePriceDt, durationMin: s.durationMin })),
    },
  })
}
