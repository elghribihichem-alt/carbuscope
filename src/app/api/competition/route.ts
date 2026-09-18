import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeStation, STATION_INCLUDE } from "@/lib/serialize"
import { haversineKm } from "@/lib/geo"
import type { CompetitionStats } from "@/lib/types"

export const dynamic = "force-dynamic"

// GET /api/competition?brand=agil&radius=10
// Analyse concurrentielle complète : saturation, zones sous-desservies,
// densité de services, évolution des ouvertures, concurrents proches.
export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand") ?? "agil"
  const radius = Math.min(Math.max(Number(req.nextUrl.searchParams.get("radius") ?? 10), 2), 50)

  const [brandRow, myStationsRaw, othersRaw, govStats, brands, total, movements, groupedByGov] = await Promise.all([
    db.brand.findUnique({ where: { slug: brand } }),
    db.station.findMany({ where: { brand: { slug: brand } }, include: STATION_INCLUDE }),
    db.station.findMany({ where: { status: "ACTIVE", brand: { NOT: { slug: brand } } }, include: STATION_INCLUDE }),
    db.governoratStat.findMany(),
    db.brand.findMany({ include: { _count: { select: { stations: true } } } }),
    db.station.count(),
    (async () => {
      const s = new Date()
      s.setMonth(s.getMonth() - 12)
      return db.movement.findMany({ where: { date: { gte: s }, type: "OPENING" } })
    })(),
    db.station.groupBy({ by: ["gouvernorat"], _count: { _all: true } }),
  ])

  const myActive = myStationsRaw.filter(s => s.status === "ACTIVE")
  const competitors = othersRaw.map(serializeStation)

  // --- Concurrents dans ma zone (rayon paramétrable) ---
  const inZone = new Set<string>()
  let sumNear = 0
  let sumNear5 = 0
  for (const m of myActive) {
    let c = 0
    let c5 = 0
    for (const o of othersRaw) {
      const km = haversineKm(m.lat, m.lng, o.lat, o.lng)
      if (km <= radius) {
        c++
        inZone.add(o.id)
      }
      if (km <= 5) c5++
    }
    sumNear += c
    sumNear5 += c5
  }
  const avgCompetitors = myActive.length ? sumNear / myActive.length : 0
  const avgAt5km = myActive.length ? sumNear5 / myActive.length : 0
  // Indice de saturation : référence marché = 12 concurrents à 5 km → 100 %
  const saturationIndex = Math.min(100, Math.round((avgAt5km / 12) * 100))

  // --- Zones sous-desservies (benchmark : 1 station / 1200 véhicules) ---
  const stationsByGov = new Map(groupedByGov.map(g => [g.gouvernorat, g._count._all]))
  const underservedZones = govStats
    .map(g => {
      const stations = stationsByGov.get(g.name) ?? 0
      const expected = Math.ceil(g.vehicles / 1200)
      return { gouvernorat: g.name, stations, expected, deficit: Math.max(0, expected - stations) }
    })
    .filter(z => z.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit)
    .slice(0, 6)

  // --- Part de marché ---
  const marketShare = brands
    .map(b => ({
      brand: b.name, slug: b.slug, color: b.color, stations: b._count.stations,
      sharePct: total ? Math.round((b._count.stations / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.stations - a.stations)

  // --- Densité de services (concurrents vs moi) ---
  const myAll = myStationsRaw.map(serializeStation)
  const serviceSlugs = ["boutique", "gonflage", "toilettes", "atm", "cafe", "lavage", "vidange", "atelier", "recharge"]
  const servicesDensity = serviceSlugs.map(sl => {
    const mineWith = myAll.filter(s => s.services.includes(sl)).length
    const compWith = competitors.filter(s => s.services.includes(sl)).length
    return {
      service: sl,
      competitorsPct: competitors.length ? Math.round((compWith / competitors.length) * 1000) / 10 : 0,
      minePct: myAll.length ? Math.round((mineWith / myAll.length) * 1000) / 10 : 0,
    }
  })

  // --- Évolution des ouvertures concurrentes (12 mois) ---
  const months: string[] = []
  const values: number[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i, 1)
    months.push(new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(d))
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    values.push(
      movements.filter(m => {
        const md = new Date(m.date)
        return md >= d && md < next && m.brand !== brandRow?.name
      }).length
    )
  }

  // --- Concurrents proches de mes meilleures stations ---
  const myTop = [...myActive].sort((a, b) => b.traffic - a.traffic).slice(0, 15)
  const nearby = myTop.map(m => {
    let best: { st: typeof othersRaw[number]; km: number } | null = null
    for (const o of othersRaw) {
      const km = haversineKm(m.lat, m.lng, o.lat, o.lng)
      if (!best || km < best.km) best = { st: o, km }
    }
    if (!best) return null
    const myServices = m.services.map(s => s.service.slug)
    const diff = best.st.services.map(s => s.service.slug).filter(s => !myServices.includes(s)).slice(0, 4)
    const status: "TENSION" | "WATCH" | "OK" =
      best.km < 2 ? "TENSION" : best.km < 5 ? "WATCH" : "OK"
    return {
      myStation: m.name,
      myCode: m.code,
      nearestCompetitor: best.st.name,
      competitorBrand: best.st.brand?.name ?? "Indépendant",
      competitorColor: best.st.brand?.color ?? "#94a3b8",
      distanceKm: Math.round(best.km * 10) / 10,
      differentiators: diff,
      status,
    }
  }).filter(Boolean) as CompetitionStats["nearby"]

  const stats: CompetitionStats = {
    competitorsTotal: total - myAll.length,
    competitorsInZone: inZone.size,
    saturationIndex,
    avgCompetitorsPerStation: Math.round(avgAt5km * 10) / 10,
    underservedZones,
    marketShare,
    servicesDensity,
    openingsEvolution: { months, values },
    nearby,
  }

  return NextResponse.json(stats)
}
