import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// T55-C-a — GET /api/hubs/interventions : registre réel des interventions
// (vidanges / pneus / diagnostics) enrichi hub + véhicule, avec méta
// d'agrégation (total, CA, par type, par hub) calculée sur l'ENSEMBLE filtré
// (indépendant de la pagination). Filtres SQL : brand (join MobilityHub
// .brandSlug), hubId, type, période from/to (ISO), tri createdAt desc.
// Pagination simple : limit défaut 100, max 500, offset.

const TYPES = ["VIDANGE", "PNEUS", "DIAGNOSTIC"]

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const brand = sp.get("brand") || null
  const hubId = sp.get("hubId") || null
  const type = sp.get("type") || null
  const from = sp.get("from") || null
  const to = sp.get("to") || null

  // Validation douce : type / dates invalides → ignorés (aucune erreur bloquante).
  const typeFilter = type && TYPES.includes(type) ? type : null
  const fromDate = from ? new Date(from) : null
  const toDate = to ? new Date(to) : null
  const fromOk = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : null
  const toOk = toDate && !Number.isNaN(toDate.getTime()) ? toDate : null

  const limitRaw = Number(sp.get("limit"))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(500, Math.round(limitRaw)) : 100
  const offsetRaw = Number(sp.get("offset"))
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.round(offsetRaw) : 0

  // Clause where 100 % SQL (le join brand passe par la relation hub).
  const where: Record<string, unknown> = {}
  const hubClause: Record<string, unknown> = {}
  if (brand) hubClause.brandSlug = brand
  if (hubId) hubClause.id = hubId
  if (Object.keys(hubClause).length) where.hub = hubClause
  if (typeFilter) where.serviceType = typeFilter
  const createdAt: Record<string, unknown> = {}
  if (fromOk) createdAt.gte = fromOk
  if (toOk) createdAt.lte = toOk
  if (Object.keys(createdAt).length) where.createdAt = createdAt

  // Un seul findMany : ~500 lignes maximum en base — la méta est dérivée de
  // l'ensemble filtré puis la page est découpée (honnête : le WHERE est SQL,
  // seule l'agrégation reste en mémoire sur l'ensemble déjà filtré).
  const rows = await db.hubIntervention.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      hub: { select: { code: true, name: true, gouvernorat: true, brandSlug: true } },
      vehicle: { select: { plate: true, brand: true, model: true, km: true } },
    },
  })

  const caTotal = rows.reduce((s, i) => s + i.priceDt, 0)
  const durations = rows.filter(i => i.durationMin != null).map(i => i.durationMin as number)

  // Agrégats par type de service (sur l'ensemble filtré).
  const byTypeMap = new Map<string, { type: string; count: number; ca: number }>()
  for (const r of rows) {
    const cur = byTypeMap.get(r.serviceType) ?? { type: r.serviceType, count: 0, ca: 0 }
    cur.count++
    cur.ca += r.priceDt
    byTypeMap.set(r.serviceType, cur)
  }

  // Agrégats par hub (code + nom) — le CA par hub alimente les en-têtes de
  // groupes de la vue « nested » du registre.
  const byHubMap = new Map<string, { code: string; name: string; count: number; ca: number }>()
  for (const r of rows) {
    const cur = byHubMap.get(r.hub.code) ?? { code: r.hub.code, name: r.hub.name, count: 0, ca: 0 }
    cur.count++
    cur.ca += r.priceDt
    byHubMap.set(r.hub.code, cur)
  }

  const page = rows.slice(offset, offset + limit).map(i => ({
    id: i.id,
    serviceType: i.serviceType,
    detail: i.detail,
    priceDt: i.priceDt,
    durationMin: i.durationMin,
    createdAt: i.createdAt.toISOString(),
    hub: { code: i.hub.code, name: i.hub.name, gouvernorat: i.hub.gouvernorat, brandSlug: i.hub.brandSlug },
    vehicle: i.vehicle ? { plate: i.vehicle.plate, brand: i.vehicle.brand, model: i.vehicle.model, km: i.vehicle.km } : null,
  }))

  return NextResponse.json({
    interventions: page,
    meta: {
      total: rows.length,
      caTotal: Math.round(caTotal * 10) / 10,
      panierMoyen: rows.length ? Math.round((caTotal / rows.length) * 10) / 10 : 0,
      dureeMoyenne: durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0,
      byType: [...byTypeMap.values()].sort((a, b) => b.count - a.count).map(v => ({ ...v, ca: Math.round(v.ca * 10) / 10 })),
      byHub: [...byHubMap.values()].sort((a, b) => b.ca - a.ca).map(v => ({ ...v, ca: Math.round(v.ca * 10) / 10 })),
    },
    limit,
    offset,
    filters: { brand, hubId, type: typeFilter, from: fromOk?.toISOString() ?? null, to: toOk?.toISOString() ?? null },
  })
}
