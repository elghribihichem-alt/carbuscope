// CarbuScope — T54-Ca — /api/hubs/clients : base clients véhicules des TMP
// (module « Mobility Hub Operations », volet 3). Route STRICTEMENT ADDITIVE
// (gel T52/T53, schéma T54-A1 inchangé) :
//   · GET ?hubId=&q=&segment=&page= (session requise) → { vehicles, total,
//     page, pages, stats } — pagination 20/page (spec), recherche
//     insensible à la casse/accents sur plaque OU client OU téléphone,
//     tri dernière visite décroissante (jamais venus en fin) ; « stats »
//     agrège le JEU FILTRÉ (total, répartition segments, moyenne de visites)
//     pour les KPI de tête du volet. V1 : 350 véhicules → filtre + tri en
//     mémoire après where Prisma (hubId, segment) — documenté, aucun coût.
//     CA cumulé ESTIMÉ par véhicule = somme des interventions non annulées.
//   · GET ?vehicleId=… → { vehicle, interventions } — fiche + historique
//     (services + hub inclus, scheduledAt décroissant, 50 max — spec) ;
//     totalRevenue porte le CA sur L'ENSEMBLE des interventions du véhicule.
//   · PATCH (session + rôle écrit) { id, segment } — FIDÈLE | RÉGULIER |
//     NOUVEAU (400 FR si segment inconnu ou identique). AuditEvent « HUBS ».
// La base clients véhicule porte des données personnelles : 401 sans session.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import {
  CLIENTS_PAGE_SIZE,
  HUBS_WRITE_ROLES,
  SEGMENT_LABELS,
  VEHICLE_SEGMENTS,
  estimatedRevenueByVehicle,
  jsonError,
  normalizeFr,
  requireHubSession,
} from "../_lib"

export const dynamic = "force-dynamic"

type VehicleRow = {
  id: string
  hubId: string
  plate: string
  brand: string
  model: string
  type: string
  clientName: string
  clientPhone: string
  segment: string
  lastVisit: Date | null
  visitsCount: number
  createdAt: Date
  hub: { code: string; name: string }
}

const serializeVehicle = (v: VehicleRow, estimatedRevenue: number) => ({
  id: v.id,
  hubId: v.hubId,
  hubCode: v.hub.code,
  hubName: v.hub.name,
  plate: v.plate,
  brand: v.brand,
  model: v.model,
  type: v.type,
  clientName: v.clientName,
  clientPhone: v.clientPhone,
  segment: v.segment,
  lastVisit: v.lastVisit ? v.lastVisit.toISOString() : null,
  visitsCount: v.visitsCount,
  estimatedRevenue,
})

type InterventionRow = {
  id: string
  hubId: string
  vehicleId: string | null
  serviceId: string | null
  type: string
  status: string
  price: number
  durationMin: number | null
  scheduledAt: Date
  hub: { code: string; name: string }
  service: { name: string; category: string } | null
}

const serializeIntervention = (i: InterventionRow) => ({
  id: i.id,
  hubId: i.hubId,
  hubCode: i.hub.code,
  hubName: i.hub.name,
  vehicleId: i.vehicleId,
  serviceId: i.serviceId,
  serviceName: i.service?.name ?? null,
  serviceCategory: i.service?.category ?? null,
  type: i.type,
  status: i.status,
  price: i.price,
  durationMin: i.durationMin,
  scheduledAt: i.scheduledAt.toISOString(),
})

/* ----------------------------- GET : liste paginée ----------------------------- */

export async function GET(req: NextRequest) {
  const session = await requireHubSession()
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }

  // ---- Mode détail : ?vehicleId=… (prioritaire sur la liste) ----
  const vehicleId = req.nextUrl.searchParams.get("vehicleId")?.trim() ?? ""
  if (vehicleId) {
    const vehicle = await db.hubVehicle.findUnique({
      where: { id: vehicleId },
      include: { hub: { select: { code: true, name: true } } },
    })
    if (!vehicle) {
      return jsonError("Véhicule client introuvable.", 404)
    }
    const interventions = await db.hubIntervention.findMany({
      where: { vehicleId },
      include: {
        hub: { select: { code: true, name: true } },
        service: { select: { name: true, category: true } },
      },
      orderBy: { scheduledAt: "desc" },
      take: 50,
    })
    // CA cumulé estimé : sur TOUTES les interventions non annulées (les 50
    // lignes affichées sont un extrait — le total porte sur l'ensemble).
    const totalRevenue = await db.hubIntervention.aggregate({
      where: { vehicleId, status: { not: "CANCELLED" } },
      _sum: { price: true },
    })
    return NextResponse.json({
      vehicle: serializeVehicle(vehicle as VehicleRow, totalRevenue._sum.price ?? 0),
      interventions: interventions.map(serializeIntervention),
    })
  }

  // ---- Mode liste : filtres hubId / segment (Prisma) + q (mémoire) ----
  const hubId = req.nextUrl.searchParams.get("hubId")?.trim() ?? ""
  const q = normalizeFr(req.nextUrl.searchParams.get("q")?.trim() ?? "")
  const segment = req.nextUrl.searchParams.get("segment")?.trim() ?? ""
  const pageParam = req.nextUrl.searchParams.get("page")?.trim() ?? "1"
  const page = Math.max(1, Number.parseInt(pageParam, 10) || 1)

  if (segment && !VEHICLE_SEGMENTS.includes(segment)) {
    return jsonError("Segment inconnu (fidèle, régulier ou nouveau).", 400)
  }
  if (hubId) {
    const hub = await db.mobilityHub.findUnique({ where: { id: hubId }, select: { id: true } })
    if (!hub) {
      return jsonError("Terminal Multi-Services introuvable.", 404)
    }
  }

  const rows = await db.hubVehicle.findMany({
    where: {
      ...(hubId ? { hubId } : {}),
      ...(segment ? { segment } : {}),
    },
    include: { hub: { select: { code: true, name: true } } },
    orderBy: [{ plate: "asc" }],
  })

  // Recherche accent/casse-insensible : plaque, client ou téléphone.
  const filtered = q
    ? rows.filter(v =>
        normalizeFr(`${v.plate} ${v.clientName} ${v.clientPhone} ${v.brand} ${v.model}`).includes(q),
      )
    : rows

  // Tri : dernière visite décroissante (jamais venus en fin), puis plaque.
  filtered.sort((a, b) => {
    const ta = a.lastVisit ? a.lastVisit.getTime() : 0
    const tb = b.lastVisit ? b.lastVisit.getTime() : 0
    return tb - ta || a.plate.localeCompare(b.plate)
  })

  const total = filtered.length
  const pages = Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE))
  const safePage = Math.min(page, pages)
  const pageRows = filtered.slice((safePage - 1) * CLIENTS_PAGE_SIZE, safePage * CLIENTS_PAGE_SIZE)

  const revenue = await estimatedRevenueByVehicle(pageRows.map(v => v.id))

  // KPI du JEU FILTRÉ (total + répartition segments + moyenne de visites).
  const fidele = filtered.filter(v => v.segment === "FIDÈLE").length
  const regulier = filtered.filter(v => v.segment === "RÉGULIER").length
  const nouveau = filtered.filter(v => v.segment === "NOUVEAU").length
  const avgVisits = total > 0 ? filtered.reduce((a, v) => a + v.visitsCount, 0) / total : 0

  return NextResponse.json({
    vehicles: pageRows.map(v => serializeVehicle(v as VehicleRow, revenue.get(v.id) ?? 0)),
    total,
    page: safePage,
    pages,
    stats: {
      total,
      fidele,
      regulier,
      nouveau,
      avgVisits,
    },
  })
}

/* ----------------------------- PATCH : segment client ----------------------------- */

export async function PATCH(req: NextRequest) {
  const session = await requireHubSession()
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }
  if (!HUBS_WRITE_ROLES.has(session.role)) {
    return jsonError(
      "Action réservée aux profils d'exploitation réseau (admin, network, commercial, DG).",
      403,
    )
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof body?.id === "string" ? body.id.trim() : ""
  const segment = typeof body?.segment === "string" ? body.segment.trim() : ""

  if (!id) {
    return jsonError("Champ « id » requis.", 400)
  }
  if (!VEHICLE_SEGMENTS.includes(segment)) {
    return jsonError("Segment invalide — fidèle, régulier ou nouveau.", 400)
  }

  const existing = await db.hubVehicle.findUnique({
    where: { id },
    include: { hub: { select: { code: true, name: true } } },
  })
  if (!existing) {
    return jsonError("Véhicule client introuvable.", 404)
  }
  if (existing.segment === segment) {
    return jsonError(
      `Ce véhicule est déjà au segment « ${SEGMENT_LABELS[existing.segment] ?? existing.segment} ».`,
      400,
    )
  }

  const updated = await db.hubVehicle.update({ where: { id }, data: { segment } })

  await logAudit({
    acteur: { nom: session.email, email: session.email, role: session.role },
    module: "HUBS",
    action: "Segment client TMP mis à jour",
    cibleType: "HUB_VEHICLE",
    cibleLabel: `${existing.plate} (${existing.hub.code})`,
    details: `${SEGMENT_LABELS[existing.segment] ?? existing.segment} → ${SEGMENT_LABELS[segment] ?? segment} · client ${existing.clientName}`,
  })

  const revenue = await estimatedRevenueByVehicle([id])
  return NextResponse.json({
    vehicle: serializeVehicle(
      { ...updated, hub: existing.hub } as VehicleRow,
      revenue.get(id) ?? 0,
    ),
  })
}
