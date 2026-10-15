// T55 — Moteur de scoring « Opportunity Radar » (serveur uniquement).
// Croise 5 critères validés T55-P1 : parc automobile (30 %) · pouvoir d'achat
// (20 %) · trafic routier (25 %) · concurrence (15 %) · foncier (10 %) —
// pondération éditable depuis la console Super Admin (OpportunityConfig).
// Les axes routiers (RoadAxis, TMJ réel) sont attribués au gouvernorat dont
// l'ancre est la plus proche d'un point de leur tracé.

import { db } from "@/lib/db"

// ---------- Ancres des 24 gouvernorats (source prisma/seed.ts, 1re ancre) ----------
export const GOV_ANCHORS: [string, number, number][] = [
  ["Tunis", 10.178, 36.798], ["Ariana", 10.19, 36.86], ["Ben Arous", 10.23, 36.75],
  ["Nabeul", 10.74, 36.45], ["Sfax", 10.76, 34.74], ["Sousse", 10.63, 35.83],
  ["Monastir", 10.83, 35.78], ["Mahdia", 11.06, 35.5], ["Bizerte", 9.87, 37.27],
  ["Kairouan", 10.09, 35.68], ["Zaghouan", 10.14, 36.4], ["Béja", 9.18, 36.72],
  ["Jendouba", 8.78, 36.5], ["Le Kef", 8.7, 36.17], ["Siliana", 9.37, 36.08],
  ["Sidi Bouzid", 9.48, 35.38], ["Kasserine", 8.83, 35.17], ["Gabès", 10.11, 33.89],
  ["Médenine", 10.5, 33.35], ["Tataouine", 10.92, 32.93], ["Gafsa", 8.78, 34.42],
  ["Tozeur", 8.13, 33.92], ["Kébili", 8.77, 33.7], ["Manouba", 10.1, 36.81],
]

// ---------- Types partagés (contrat API) ----------
export interface RadarConfigDTO {
  weightParc: number
  weightPpa: number
  weightTraffic: number
  weightCompet: number
  weightLand: number
  alertThreshold: number
  topN: number
  updatedBy: string | null
  updatedAt: string | null
}

export interface ZoneAlertDTO {
  id: string
  gouvernorat: string
  score: number
  threshold: number
  detail: string
  createdAt: string
}

export interface BrandPresenceDTO {
  slug: string
  name: string
  color: string
  count: number
}

export interface DelegationPresenceDTO {
  name: string
  stations: number
  withoutStation?: boolean
}

export interface RadarZoneDTO {
  gouvernorat: string
  score: number
  components: { parc: number; ppa: number; traffic: number; compet: number; land: number }
  ratio: number
  palier: "BLANCHE" | "SOUS" | "EQUILIBREE" | "DENSE"
  vehicles: number
  population: number
  stationsTotal: number
  stationsByBrand: BrandPresenceDTO[]
  myBrandStations: number
  myBrandSharePct: number
  tmj: number
  axes: number
  ppaIndex: number
  ppaEstimated: boolean
  landPriceDt: number
  landAvailPct: number
  landEstimated: boolean
  delegations: DelegationPresenceDTO[]
  delegationWithoutStation: number
  alert: ZoneAlertDTO | null
}

export interface RadarZonesResponse {
  config: RadarConfigDTO
  zones: RadarZoneDTO[]
  meta: {
    q1: number
    q2: number
    q3: number
    totalStations: number
    totalVehicles: number
    axesTotal: number
    alertsActive: number
    generatedAt: string
  }
}

// ---------- Helpers ----------
const norm = (v: number, min: number, max: number) => (max > min ? (v - min) / (max - min) : 0)

/** Distance approchée (equirectangulaire, ~Tunisie) — suffisant pour attribuer
 *  un axe routier au gouvernorat le plus proche. */
function approxDistKm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const x = (lng2 - lng1) * 111.32 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180)
  const y = (lat2 - lat1) * 110.57
  return Math.sqrt(x * x + y * y)
}

function quartile(sorted: number[], q: number): number {
  if (!sorted.length) return 0
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base]
}

// ---------- Moteur ----------
export async function computeRadarZones(brandSlug?: string | null): Promise<RadarZonesResponse> {
  const [govs, stations, roads, lands, ppas, configRow, alerts] = await Promise.all([
    db.governoratStat.findMany(),
    db.station.findMany({
      where: { status: { in: ["ACTIVE", "RENOVATION"] } },
      include: { brand: true },
    }),
    db.roadAxis.findMany(),
    db.landIndicator.findMany(),
    db.purchasingPower.findMany(),
    db.opportunityConfig.findFirst(),
    db.zoneAlert.findMany({ where: { acknowledged: false }, orderBy: { createdAt: "desc" } }),
  ])

  const cfg = configRow ?? {
    weightParc: 30, weightPpa: 20, weightTraffic: 25, weightCompet: 15, weightLand: 10,
    alertThreshold: 70, topN: 50, updatedBy: null, updatedAt: null,
  }
  const config: RadarConfigDTO = {
    weightParc: cfg.weightParc, weightPpa: cfg.weightPpa, weightTraffic: cfg.weightTraffic,
    weightCompet: cfg.weightCompet, weightLand: cfg.weightLand,
    alertThreshold: cfg.alertThreshold, topN: cfg.topN,
    updatedBy: cfg.updatedBy ?? null, updatedAt: cfg.updatedAt?.toISOString() ?? null,
  }

  // — Attribuer le trafic aux gouvernorats : chaque point du tracé distribue
  // sa part de TMJ (tmj / nbPoints) au gouvernorat dont l'ancre est la plus
  // proche — un axe qui traverse plusieurs gouvernorats y répartit son trafic.
  const tmjByGov = new Map<string, { tmj: number; axes: number }>()
  for (const g of govs) tmjByGov.set(g.name, { tmj: 0, axes: 0 })
  for (const road of roads) {
    const pts = (road.segments as [number, number][] | null) ?? []
    if (!pts.length) continue
    const share = road.tmj / pts.length
    const touched = new Set<string>()
    for (const [plng, plat] of pts) {
      let best = { name: "", d: Infinity }
      for (const [name, lng, lat] of GOV_ANCHORS) {
        const d = approxDistKm(plng, plat, lng, lat)
        if (d < best.d) best = { name, d }
      }
      if (best.name) {
        const cur = tmjByGov.get(best.name)
        if (cur) { cur.tmj += share; touched.add(best.name) }
      }
    }
    for (const name of touched) tmjByGov.get(name)!.axes += 1
  }

  // — Stations par gouvernorat / enseigne / délégation —
  const stationCount = new Map<string, number>()
  const byBrand = new Map<string, Map<string, number>>() // gov → brandSlug → count
  const byDeleg = new Map<string, Map<string, number>>()
  const govDelegTotal = new Map<string, number>()
  for (const g of govs) govDelegTotal.set(g.name, g.delegationCount)
  for (const s of stations) {
    if (!stationCount.has(s.gouvernorat)) stationCount.set(s.gouvernorat, 0)
    stationCount.set(s.gouvernorat, stationCount.get(s.gouvernorat)! + 1)
    const bSlug = s.brand?.slug ?? "independants"
    const bMap = byBrand.get(s.gouvernorat) ?? new Map<string, number>()
    bMap.set(bSlug, (bMap.get(bSlug) ?? 0) + 1)
    byBrand.set(s.gouvernorat, bMap)
    const dMap = byDeleg.get(s.gouvernorat) ?? new Map<string, number>()
    dMap.set(s.delegation, (dMap.get(s.delegation) ?? 0) + 1)
    byDeleg.set(s.gouvernorat, dMap)
  }

  const landByGov = new Map(lands.map(l => [l.gouvernorat, l]))
  const ppaByGov = new Map(ppas.map(p => [p.gouvernorat, p]))
  const alertByGov = new Map<string, ZoneAlertDTO>()
  for (const a of alerts) {
    if (!alertByGov.has(a.gouvernorat)) {
      alertByGov.set(a.gouvernorat, {
        id: a.id, gouvernorat: a.gouvernorat, score: a.score, threshold: a.threshold,
        detail: a.detail, createdAt: a.createdAt.toISOString(),
      })
    }
  }

  // — Normalisations min-max sur les 24 gouvernorats —
  const veh = govs.map(g => g.vehicles)
  const tmjs = govs.map(g => tmjByGov.get(g.name)?.tmj ?? 0)
  const ratios = govs.map(g => (stationCount.get(g.name) ?? 0) > 0 ? g.vehicles / stationCount.get(g.name)! : g.vehicles / 10)
  const prices = govs.map(g => landByGov.get(g.name)?.landPriceDt ?? 300)
  const minV = Math.min(...veh), maxV = Math.max(...veh)
  const minT = Math.min(...tmjs), maxT = Math.max(...tmjs)
  const minR = Math.min(...ratios), maxR = Math.max(...ratios)
  const minP = Math.min(...prices), maxP = Math.max(...prices)

  const sortedR = [...ratios].sort((a, b) => a - b)
  const q1 = Math.round(quartile(sortedR, 0.25))
  const q2 = Math.round(quartile(sortedR, 0.5))
  const q3 = Math.round(quartile(sortedR, 0.75))

  const W = {
    parc: config.weightParc / 100,
    ppa: config.weightPpa / 100,
    traffic: config.weightTraffic / 100,
    compet: config.weightCompet / 100,
    land: config.weightLand / 100,
  }

  const zones: RadarZoneDTO[] = govs.map(g => {
    const st = stationCount.get(g.name) ?? 0
    const ratio = st > 0 ? g.vehicles / st : g.vehicles / 10
    const palier: RadarZoneDTO["palier"] = ratio > q3 ? "BLANCHE" : ratio > q2 ? "SOUS" : ratio > q1 ? "EQUILIBREE" : "DENSE"
    const land = landByGov.get(g.name)
    const ppa = ppaByGov.get(g.name)
    const price01 = norm(land?.landPriceDt ?? 300, minP, maxP)
    const avail01 = (land?.landAvailPct ?? 30) / 100
    const landComp = 0.5 * avail01 + 0.5 * (1 - price01)
    const comps = {
      parc: norm(g.vehicles, minV, maxV),
      ppa: (ppa?.ppaIndex ?? 50) / 100,
      traffic: norm(tmjByGov.get(g.name)?.tmj ?? 0, minT, maxT),
      compet: norm(ratio, minR, maxR),
      land: Math.min(1, Math.max(0, landComp)),
    }
    const score = Math.round(100 * (
      W.parc * comps.parc + W.ppa * comps.ppa + W.traffic * comps.traffic +
      W.compet * comps.compet + W.land * comps.land
    ))
    const bMap = byBrand.get(g.name) ?? new Map<string, number>()
    const stationsByBrand: BrandPresenceDTO[] = [...bMap.entries()]
      .map(([slug, count]) => ({
        slug,
        name: slug === "independants" ? "Indépendants" : (stations.find(s => s.brand?.slug === slug)?.brand?.name ?? slug),
        color: stations.find(s => s.brand?.slug === slug)?.brand?.color ?? "#64748b",
        count,
      }))
      .sort((a, b) => b.count - a.count)
    const myBrandStations = brandSlug ? (bMap.get(brandSlug) ?? 0) : 0
    const dMap = byDeleg.get(g.name) ?? new Map<string, number>()
    const delegations: DelegationPresenceDTO[] = [...dMap.entries()]
      .map(([name, s]) => ({ name, stations: s }))
      .sort((a, b) => b.stations - a.stations)
    const delegationWithoutStation = Math.max(0, (govDelegTotal.get(g.name) ?? 0) - dMap.size)
    return {
      gouvernorat: g.name,
      score,
      components: {
        parc: Math.round(comps.parc * 100),
        ppa: Math.round(comps.ppa * 100),
        traffic: Math.round(comps.traffic * 100),
        compet: Math.round(comps.compet * 100),
        land: Math.round(comps.land * 100),
      },
      ratio: Math.round(ratio),
      palier,
      vehicles: g.vehicles,
      population: g.population,
      stationsTotal: st,
      stationsByBrand,
      myBrandStations,
      myBrandSharePct: st > 0 && brandSlug ? Math.round((myBrandStations / st) * 1000) / 10 : 0,
      tmj: tmjByGov.get(g.name)?.tmj ?? 0,
      axes: tmjByGov.get(g.name)?.axes ?? 0,
      ppaIndex: Math.round(ppa?.ppaIndex ?? 50),
      ppaEstimated: ppa?.estimated ?? true,
      landPriceDt: Math.round(land?.landPriceDt ?? 300),
      landAvailPct: Math.round(land?.landAvailPct ?? 30),
      landEstimated: land?.estimated ?? true,
      delegations,
      delegationWithoutStation,
      alert: alertByGov.get(g.name) ?? null,
    }
  })
  zones.sort((a, b) => b.score - a.score)

  return {
    config,
    zones,
    meta: {
      q1, q2, q3,
      totalStations: stations.length,
      totalVehicles: govs.reduce((s, g) => s + g.vehicles, 0),
      axesTotal: roads.length,
      alertsActive: alerts.length,
      generatedAt: new Date().toISOString(),
    },
  }
}
