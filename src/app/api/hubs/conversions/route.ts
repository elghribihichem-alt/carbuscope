import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// T55-C-a — GET /api/hubs/conversions : registre enrichi des conversions
// TMP → station classique (véhicule + hub d'origine) avec entonnoir
// ORIENTE/CONVERTI/PERDU et valeur attribuée. Filtres SQL : brand (join via
// vehicle.hub.brandSlug), hubId (champ dénormalisé), status. Tri desc.
//
// PATCH /api/hubs/conversions : changement de statut d'une conversion
// (ORIENTE|CONVERTI|PERDU, valueDt optionnel) — session requise (401 sinon),
// audité (module HUBS, action CONVERSION_STATUS), pattern /api/radar/alerts/[id].

const STATUSES = ["ORIENTE", "CONVERTI", "PERDU"]

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const brand = sp.get("brand") || null
  const hubId = sp.get("hubId") || null
  const status = sp.get("status") || null
  const statusFilter = status && STATUSES.includes(status) ? status : null

  // Le join brand passe par la relation vehicle → hub (MobilityHub.brandSlug).
  const where: Record<string, unknown> = {}
  const vehicleClause: Record<string, unknown> = {}
  const hubJoin: Record<string, unknown> = {}
  if (brand) hubJoin.brandSlug = brand
  if (hubId) hubJoin.id = hubId
  if (Object.keys(hubJoin).length) vehicleClause.hub = hubJoin
  if (Object.keys(vehicleClause).length) where.vehicle = vehicleClause
  if (statusFilter) where.status = statusFilter

  const rows = await db.hubConversion.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      vehicle: { select: { plate: true, brand: true, model: true } },
    },
  })

  // Hub d'origine : hubId dénormalisé → une seule passe de map (léger, ≤ 8 hubs).
  const hubs = await db.mobilityHub.findMany({
    select: { id: true, code: true, name: true, gouvernorat: true },
  })
  const hubById = new Map(hubs.map(h => [h.id, h]))

  const funnel = { ORIENTE: 0, CONVERTI: 0, PERDU: 0 }
  let valueTotal = 0
  let valueConverted = 0
  for (const r of rows) {
    if (r.status === "ORIENTE") funnel.ORIENTE++
    else if (r.status === "CONVERTI") { funnel.CONVERTI++; valueConverted += r.valueDt }
    else funnel.PERDU++
    valueTotal += r.valueDt
  }

  return NextResponse.json({
    conversions: rows.map(r => {
      const hub = hubById.get(r.hubId)
      return {
        id: r.id,
        stationCode: r.stationCode,
        detail: r.detail,
        status: r.status,
        valueDt: r.valueDt,
        createdAt: r.createdAt.toISOString(),
        vehicle: { plate: r.vehicle.plate, brand: r.vehicle.brand, model: r.vehicle.model },
        hub: hub ? { code: hub.code, name: hub.name, gouvernorat: hub.gouvernorat } : null,
      }
    }),
    meta: {
      total: rows.length,
      funnel,
      valueTotal: Math.round(valueTotal * 10) / 10,
      valueConverted: Math.round(valueConverted * 10) / 10,
      conversionRatePct: rows.length ? Math.round((funnel.CONVERTI / rows.length) * 1000) / 10 : 0,
    },
    filters: { brand, hubId, status: statusFilter },
  })
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Session requise — reconnectez-vous." }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "Corps JSON requis : { id, status, valueDt? }." }, { status: 400 })
  }
  if (!STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Statut invalide (ORIENTE, CONVERTI ou PERDU)." }, { status: 400 })
  }

  const existing = await db.hubConversion.findUnique({ where: { id: body.id } })
  if (!existing) return NextResponse.json({ error: "Conversion introuvable." }, { status: 404 })

  // valueDt optionnel (requis pour figer le CA attribué d'une conversion).
  const data: Record<string, unknown> = { status: body.status }
  if (body.valueDt !== undefined) {
    const n = Number(body.valueDt)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "Valeur invalide (nombre positif en DT)." }, { status: 400 })
    }
    data.valueDt = Math.round(n * 100) / 100
  }

  const saved = await db.hubConversion.update({ where: { id: body.id }, data })
  await logAudit({
    acteur: { nom: user.name, email: user.email, role: user.role },
    module: "HUBS",
    action: "CONVERSION_STATUS",
    cibleType: "HubConversion",
    cibleLabel: `${existing.detail}${existing.stationCode ? ` → ${existing.stationCode}` : ""}`,
    details: `${existing.status} → ${saved.status}${saved.valueDt !== undefined ? ` · ${saved.valueDt} DT` : ""}`,
  })

  return NextResponse.json({
    ok: true,
    conversion: {
      id: saved.id,
      stationCode: saved.stationCode,
      detail: saved.detail,
      status: saved.status,
      valueDt: saved.valueDt,
      createdAt: saved.createdAt.toISOString(),
    },
  })
}
