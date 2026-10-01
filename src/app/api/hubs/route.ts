// CarbuScope — T54-Ca — GET /api/hubs : inventaire des Terminaux
// Multi-Services (module « Mobility Hub Operations », volet carte). Route
// STRICTEMENT ADDITIVE (gel T52/T53, schéma T54-A1 inchangé).
//   · GET (session requise — 401 sinon) → { hubs: HubDTO[] } avec compteurs
//     consolidés par hub : servicesCount (total), activeServicesCount (actifs)
//     et bookingsThisMonth (somme des réservations du mois des services).
//     Les 45 services TMP au total rendent l'inclusion JS plus lisible qu'un
//     groupBy par statut (documenté — même convention que les listes légères).
// Tri : statut (ACTIVE → CONSTRUCTION → PLANNED → CLOSED) puis code.
// Les hubs PLANNED/CONSTRUCTION restent à 0 trafic/CA tant qu'ils ne sont pas
// ouverts (invariant du seed T54-A1 — l'API ne fait que relire).

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { HUB_STATUS_RANK, requireHubSession } from "./_lib"

export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest) {
  const session = await requireHubSession()
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }

  const rows = await db.mobilityHub.findMany({
    orderBy: { code: "asc" },
    include: {
      services: { select: { status: true, bookingsThisMonth: true } },
    },
  })

  const hubs = rows
    .map(h => ({
      id: h.id,
      code: h.code,
      name: h.name,
      gouvernorat: h.gouvernorat,
      address: h.address,
      lat: h.lat,
      lng: h.lng,
      status: h.status,
      type: h.type,
      openedAt: h.openedAt ? h.openedAt.toISOString() : null,
      surfaceM2: h.surfaceM2,
      dailyVehicles: h.dailyVehicles,
      monthlyRevenue: h.monthlyRevenue,
      manager: h.manager,
      phone: h.phone,
      // Compteurs consolidés (services du hub — 45 lignes au total en V1).
      servicesCount: h.services.length,
      activeServicesCount: h.services.filter(s => s.status === "ACTIVE").length,
      bookingsThisMonth: h.services.reduce((a, s) => a + s.bookingsThisMonth, 0),
    }))
    // Actifs d'abord (même rang que la légende de la carte), puis code croissant.
    .sort(
      (a, b) =>
        (HUB_STATUS_RANK[a.status] ?? 9) - (HUB_STATUS_RANK[b.status] ?? 9) ||
        a.code.localeCompare(b.code),
    )

  return NextResponse.json({ hubs })
}
