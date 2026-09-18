import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeStation, STATION_INCLUDE } from "@/lib/serialize"
import { haversineKm } from "@/lib/geo"

export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const station = await db.station.findUnique({
    where: { id },
    include: {
      ...STATION_INCLUDE,
      brand: true,
      reviews: { orderBy: { createdAt: "desc" }, take: 12 },
      history: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  })
  if (!station) return NextResponse.json({ error: "Station introuvable" }, { status: 404 })

  const [active, all] = await Promise.all([
    db.station.findMany({ where: { status: "ACTIVE" }, include: STATION_INCLUDE }),
    Promise.resolve(station),
  ])
  const nearby = active
    .filter(s => s.id !== station.id)
    .map(s => {
      const km = haversineKm(station.lat, station.lng, s.lat, s.lng)
      return { s, km }
    })
    .filter(x => x.km <= 40)
    .sort((a, b) => a.km - b.km)
    .slice(0, 8)
    .map(x => ({ ...serializeStation(x.s), distanceKm: Math.round(x.km * 10) / 10 }))

  const { reviews, history, ...s } = station
  return NextResponse.json({
    station: serializeStation({ ...s, services: s.services }),
    reviews: reviews.map(r => ({
      id: r.id,
      stationId: r.stationId,
      author: r.author,
      rating: r.rating,
      comment: r.comment,
      criteria: r.criteria as Record<string, number> | null,
      createdAt: r.createdAt.toISOString(),
      replyText: r.replyText,
      repliedAt: r.repliedAt?.toISOString() ?? null,
      repliedBy: r.repliedBy,
    })),
    history: history.map(h => ({
      id: h.id,
      field: h.field,
      oldValue: h.oldValue,
      newValue: h.newValue,
      author: h.author,
      source: h.source,
      createdAt: h.createdAt.toISOString(),
    })),
    nearby,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 })

  const current = await db.station.findUnique({ where: { id }, include: STATION_INCLUDE })
  if (!current) return NextResponse.json({ error: "Station introuvable" }, { status: 404 })

  const data: Record<string, unknown> = { lastVerified: new Date(), verifiedBy: body.verifiedBy ?? current.verifiedBy }
  const changes: { field: string; oldValue: string; newValue: string }[] = []

  for (const key of ["name", "address", "gouvernorat", "delegation", "status", "photoUrl", "verifiedBy"] as const) {
    if (body[key] !== undefined && String(body[key]) !== String(current[key])) {
      data[key] = body[key]
      changes.push({ field: key, oldValue: String(current[key] ?? "—"), newValue: String(body[key]) })
    }
  }
  if (body.traffic !== undefined && Number(body.traffic) !== current.traffic) {
    data.traffic = Number(body.traffic)
    changes.push({ field: "traffic", oldValue: String(current.traffic), newValue: String(body.traffic) })
  }
  if (body.open24 !== undefined && Boolean(body.open24) !== current.open24) {
    data.open24 = Boolean(body.open24)
    changes.push({ field: "open24", oldValue: String(current.open24), newValue: String(body.open24) })
  }
  if (body.open7j !== undefined && Boolean(body.open7j) !== current.open7j) {
    data.open7j = Boolean(body.open7j)
    changes.push({ field: "open7j", oldValue: String(current.open7j), newValue: String(body.open7j) })
  }

  if (Array.isArray(body.services)) {
    const wanted = new Set<string>(body.services)
    const have = new Set(current.services.map(s => s.service.slug))
    const added = [...wanted].filter(x => !have.has(x))
    const removed = [...have].filter(x => !wanted.has(x))
    if (added.length || removed.length) {
      const all = await db.service.findMany()
      const bySlug = new Map(all.map(s => [s.slug, s.id]))
      if (removed.length) {
        await db.stationService.deleteMany({
          where: { stationId: id, serviceId: { in: removed.map(sl => bySlug.get(sl)!).filter(Boolean) } },
        })
      }
      if (added.length) {
        await db.stationService.createMany({
          data: added.map(sl => ({ stationId: id, serviceId: bySlug.get(sl)! })).filter(d => d.serviceId),
        })
      }
      changes.push({ field: "services", oldValue: [...have].join(", ") || "—", newValue: [...wanted].join(", ") || "—" })
    }
  }

  const station = await db.station.update({ where: { id }, data, include: STATION_INCLUDE })

  const author = body.verifiedBy ?? "Portail Enseigne"
  const source = body.source ?? "Enseigne"
  for (const c of changes) {
    await db.stationHistory.create({ data: { stationId: id, ...c, author, source } })
  }

  return NextResponse.json({ station: serializeStation(station), changes: changes.length })
}
