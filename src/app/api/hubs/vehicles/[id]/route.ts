import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// T55-C-a — GET /api/hubs/vehicles/[id] : fiche complète d'un véhicule client
// — identité, hub de rattachement, historique des interventions (desc) et des
// conversions, statistiques (dépenses totales, première visite, nombre de
// visites, services). Lecture seule, aucune mutation.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const vehicle = await db.hubVehicle.findUnique({
    where: { id },
    include: {
      hub: { select: { code: true, name: true, gouvernorat: true, brandSlug: true, delegation: true } },
      interventions: { orderBy: { createdAt: "desc" } },
      conversions: { orderBy: { createdAt: "desc" } },
    },
  })
  if (!vehicle) return NextResponse.json({ error: "Véhicule introuvable." }, { status: 404 })

  // « Visites » ≈ interventions distinctes par jour (un véhicule peut avoir
  // plusieurs prestations le même jour) ; firstVisit = plus ancienne trace.
  const visitDays = new Set(vehicle.interventions.map(i => i.createdAt.toISOString().slice(0, 10)))
  const firstVisit = vehicle.interventions.length
    ? vehicle.interventions.reduce((min, i) => (i.createdAt < min ? i.createdAt : min), vehicle.interventions[0].createdAt)
    : null
  const totalSpent = vehicle.interventions.reduce((s, i) => s + i.priceDt, 0)
  const convertedValue = vehicle.conversions
    .filter(c => c.status === "CONVERTI")
    .reduce((s, c) => s + c.valueDt, 0)

  // Alertes : même dérivation V1 que /api/hubs/vehicles (cohérence fiche/liste).
  const now = Date.now()
  const d180 = now - 180 * 24 * 3600 * 1000
  const lastVidange = vehicle.interventions
    .filter(i => i.serviceType === "VIDANGE")
    .reduce<number | null>((acc, i) => (acc === null || i.createdAt.getTime() > acc ? i.createdAt.getTime() : acc), null)
  const lastVisitMs = vehicle.lastVisit ? vehicle.lastVisit.getTime() : null
  const daysSince = (ms: number) => Math.floor((now - ms) / 86400000)
  let alert: { type: string; label: string; sinceDays?: number } | null = null
  const lastVisitOverdue = lastVisitMs === null || lastVisitMs < d180
  const noVidangeEver = lastVidange === null && vehicle.km > 15000
  const vidangeOverdue = lastVidange !== null && lastVidange < d180
  if (lastVisitOverdue || noVidangeEver || vidangeOverdue) {
    alert = {
      type: "VIDANGE_DUE",
      label: lastVisitMs === null ? "jamais revenu" : noVidangeEver ? "vidange jamais faite" : "vidange due",
      sinceDays: lastVidange !== null ? daysSince(lastVidange) : lastVisitMs !== null ? daysSince(lastVisitMs) : undefined,
    }
  } else if (vehicle.loyaltyPoints >= 180) {
    alert = { type: "LOYALTY_NEAR", label: "récompense atteinte" }
  }

  return NextResponse.json({
    vehicle: {
      id: vehicle.id,
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      km: vehicle.km,
      loyaltyPoints: vehicle.loyaltyPoints,
      lastVisit: vehicle.lastVisit?.toISOString() ?? null,
      alert,
      // Champs de liste (cohérence avec /api/hubs/vehicles) :
      interventionCount: vehicle.interventions.length,
      lastService: vehicle.interventions[0]?.createdAt.toISOString()
        ?? vehicle.lastVisit?.toISOString() ?? null,
      conversionsCount: vehicle.conversions.length,
      hub: vehicle.hub
        ? { code: vehicle.hub.code, name: vehicle.hub.name, gouvernorat: vehicle.hub.gouvernorat, delegation: vehicle.hub.delegation, brandSlug: vehicle.hub.brandSlug }
        : null,
      interventions: vehicle.interventions.map(i => ({
        id: i.id,
        serviceType: i.serviceType,
        detail: i.detail,
        priceDt: i.priceDt,
        durationMin: i.durationMin,
        createdAt: i.createdAt.toISOString(),
      })),
      conversions: vehicle.conversions.map(c => ({
        id: c.id,
        stationCode: c.stationCode,
        detail: c.detail,
        status: c.status,
        valueDt: c.valueDt,
        createdAt: c.createdAt.toISOString(),
      })),
      stats: {
        totalSpent: Math.round(totalSpent * 10) / 10,
        convertedValue: Math.round(convertedValue * 10) / 10,
        firstVisit: firstVisit ? firstVisit.toISOString() : null,
        visitsCount: visitDays.size,
        servicesCount: vehicle.interventions.length,
        conversionsCount: vehicle.conversions.length,
      },
    },
  })
}
