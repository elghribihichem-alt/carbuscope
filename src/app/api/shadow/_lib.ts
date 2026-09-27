// ============================================================================
// Shadow Market (T44) — lib serveur partagée par les routes /api/shadow/*
// Calculs : perte par point (volume × marge × 30,4 j), cannibalisation des
// stations (facteur de capture = 1 − d/rayon, plancher 0,15), agrégats par
// gouvernorat / enseigne / typologie, zones rouges (grille 1,5 km), axes RN.
// Cache module-level TTL 60 s — invalidé sur mutation des points / config /
// typologies.
// ============================================================================
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { haversineKm } from "@/lib/geo"
import type {
  ShadowConfigDTO,
  ShadowCensusEventDTO,
  ShadowGovLossDTO,
  ShadowLevel,
  ShadowMonthlyStatDTO,
  ShadowPointDTO,
  ShadowRedZoneDTO,
  ShadowRoadStatDTO,
  ShadowThreatStationDTO,
  ShadowTypologyDTO,
  ShadowTypologyStatDTO,
} from "@/lib/types"

export const DAYS_PER_MONTH = 30.4

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

export function monthLabel(month: string): string {
  const [y, m] = month.split("-")
  const idx = Number(m) - 1
  if (!y || idx < 0 || idx > 11) return month
  return `${MONTHS_FR[idx]} ${y}`
}

// ---------------------------------------------------------------------------
// Scope — IMPORTANT (convention projet : API « données » ouverte en démo)
// Sans session (cookie cs_session absent — curl, préview, API ouverte) :
//   → scope NATIONAL (mode démonstration).
// Avec session :
//   SUPER_ADMIN                → NATIONAL (le paramètre ?brand= est accepté
//                                comme lentille enseigne) ;
//   compte enseigne (brandSlug) → BRAND FORCÉ à session.brandSlug — les points
//                                informels restent nationaux, seules les
//                                pertes / stations menacées sont filtrées sur
//                                les stations de l'enseigne ;
//   personnel plateforme        → NATIONAL.
// ---------------------------------------------------------------------------
export type ShadowScope = { scope: "NATIONAL" | "BRAND"; brandSlug: string | null; scopeLabel: string }

export async function resolveScope(req: Request): Promise<ShadowScope> {
  const session = await getSessionUser()
  if (!session) return { scope: "NATIONAL", brandSlug: null, scopeLabel: "National" }
  if (session.role === "SUPER_ADMIN") {
    const lens = new URL(req.url).searchParams.get("brand")
    if (lens && lens !== "national") {
      const b = await db.brand.findUnique({ where: { slug: lens }, select: { name: true } })
      return { scope: "BRAND", brandSlug: lens, scopeLabel: b?.name ?? lens }
    }
    return { scope: "NATIONAL", brandSlug: null, scopeLabel: "National" }
  }
  if (session.brandSlug) {
    return { scope: "BRAND", brandSlug: session.brandSlug, scopeLabel: session.brandName ?? session.brandSlug }
  }
  return { scope: "NATIONAL", brandSlug: null, scopeLabel: "National" }
}

// ---------------------------------------------------------------------------
// Modèle de perte (parts Daher, marge détaillant 0,200 DT/L)
// ---------------------------------------------------------------------------
export const pointLossTnd = (volumeLJ: number, marginTndPerL: number) =>
  volumeLJ * marginTndPerL * DAYS_PER_MONTH

export const captureFactor = (distanceM: number, radiusM: number) =>
  Math.max(0.15, 1 - distanceM / radiusM)

export function levelForLoss(lossTnd: number, config: ShadowConfigDTO): ShadowLevel {
  if (lossTnd >= config.lossRedTnd) return "RED"
  if (lossTnd >= config.lossOrangeTnd) return "ORANGE"
  if (lossTnd > 0) return "YELLOW"
  return "GREEN"
}

// ---------------------------------------------------------------------------
// Dataset (calculs lourds, mis en cache)
// ---------------------------------------------------------------------------
export type RawPoint = {
  id: string
  code: string
  typologyCode: string
  status: string
  gouvernorat: string
  delegation: string
  cite: string | null
  lat: number
  lng: number
  volumeLJ: number
  priceMillimes: number | null
  photoUrl: string | null
  notes: string
  source: string
  reporter: string
  brandThreat: string | null
  firstSeenAt: Date
  lastCheckAt: Date
  active: boolean
}

export type EffectivePoint = RawPoint & {
  /** Perte mensuelle pleine du point (DT) : volumeLJ × marge × 30,4. */
  lossTnd: number
  nearest: { code: string; name: string; brandSlug: string; brandName: string; distanceM: number } | null
}

export type ThreatStation = {
  code: string
  name: string
  brandSlug: string
  brandName: string
  brandColor: string
  gouvernorat: string
  delegation: string
  lat: number
  lng: number
  traffic: number
  points: number
  volumeStolenLJ: number
  lossTnd: number
  level: ShadowLevel
  worstDistanceM: number | null
  pointIds: Set<string>
}

export type BrandAgg = {
  brandSlug: string
  lossTnd: number
  capturedLJ: number
  stationsThreatened: number
  stationsRed: number
  /** Perte mensuelle captée sur les stations de l'enseigne, par point. */
  pointLoss: Map<string, number>
}

export type ShadowDataset = {
  at: number
  config: ShadowConfigDTO
  typologies: ShadowTypologyDTO[]
  /** Points effectifs (active, statut ≠ REJETE/DOUBLON) avec perte + station la plus proche. */
  points: EffectivePoint[]
  /** Toutes les stations non fermées, avec menace calculée. */
  stations: ThreatStation[]
  /** Paires (point, station) dans le rayon, avec capture NORMALISÉE et distance. */
  pairs: { pointId: string; stationCode: string; distanceM: number; capture: number }[]
  govNational: ShadowGovLossDTO[]
  brandAgg: Map<string, BrandAgg>
  monthly: ShadowMonthlyStatDTO[]
  roads: ShadowRoadStatDTO[]
  formalVolumeLJ: number
  totals: {
    points: number
    lossTnd: number
    volumeLJ: number
    stationsThreatened: number
    stationsThreatenedRed: number
  }
}

export function configDTO(c: {
  radiiM: string
  cannibRadiusM: number
  redZoneThreshold: number
  lossRedTnd: number
  lossOrangeTnd: number
  notifyRadiusM: number
  notifyActive: boolean
  marginTndPerL: number
}): ShadowConfigDTO {
  return {
    radiiM: c.radiiM.split(",").map(x => Number(x.trim())).filter(x => Number.isFinite(x) && x > 0),
    cannibRadiusM: c.cannibRadiusM,
    redZoneThreshold: c.redZoneThreshold,
    lossRedTnd: c.lossRedTnd,
    lossOrangeTnd: c.lossOrangeTnd,
    notifyRadiusM: c.notifyRadiusM,
    notifyActive: c.notifyActive,
    marginTndPerL: c.marginTndPerL,
  }
}

async function buildDataset(): Promise<ShadowDataset> {
  const [configRow, typologies, stationRows, pointRows, monthlyRows, roadRows] = await Promise.all([
    db.shadowConfig.findUnique({ where: { id: "shadow-config" } }),
    db.shadowTypology.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    db.station.findMany({
      where: { status: { not: "CLOSED" } },
      select: {
        code: true, name: true, gouvernorat: true, delegation: true, lat: true, lng: true, traffic: true,
        brand: { select: { slug: true, name: true, color: true } },
      },
    }),
    db.shadowPoint.findMany({ where: { active: true, status: { notIn: ["REJETE", "DOUBLON"] } } }),
    db.shadowMonthlyStat.findMany({ orderBy: { month: "asc" } }),
    db.roadAxis.findMany(),
  ])

  const config = configDTO(
    configRow ?? {
      radiiM: "500,1000,2000", cannibRadiusM: 2000, redZoneThreshold: 5,
      lossRedTnd: 20000, lossOrangeTnd: 5000, notifyRadiusM: 500, notifyActive: true, marginTndPerL: 0.2,
    },
  )
  const margin = configRow?.marginTndPerL ?? 0.2
  const radiusM = configRow?.cannibRadiusM ?? 2000

  // --- Points effectifs : perte + station la plus proche ---
  const points: EffectivePoint[] = pointRows.map(p => ({
    ...p,
    lossTnd: pointLossTnd(p.volumeLJ, margin),
    nearest: null,
  }))

  // --- Menace par station (cannibalisation) + nearest par point ---
  // Modèle : capture brute = 1 − d/rayon (plancher 0,15). NORMALISATION : la
  // somme des facteurs de capture d'un point sur l'ensemble des stations du
  // bassin est plafonnée à 1 — un point informel ne peut pas soutirer plus que
  // son propre volume ; l'attrition est répartie au prorata de l'affinité
  // (distance). Sans ce plafond, les coordonnées stations empilées (grille
  // grossière de la base) gonfleraient artificiellement les pertes cumulées.
  const stations: ThreatStation[] = stationRows.map(s => ({
    code: s.code, name: s.name,
    brandSlug: s.brand?.slug ?? "independants",
    brandName: s.brand?.name ?? "Indépendants",
    brandColor: s.brand?.color ?? "#64748b",
    gouvernorat: s.gouvernorat, delegation: s.delegation, lat: s.lat, lng: s.lng, traffic: s.traffic,
    points: 0, volumeStolenLJ: 0, lossTnd: 0, level: "GREEN" as ShadowLevel,
    worstDistanceM: null, pointIds: new Set<string>(),
  }))
  const brandAgg = new Map<string, BrandAgg>()
  const nearestD = new Array<number>(points.length).fill(Infinity)
  const nearestSt = new Array<(typeof stationRows)[number] | null>(points.length).fill(null)

  type Pair = { pi: number; si: number; distanceM: number; rawCapture: number }
  const rawPairs: Pair[] = []

  for (let si = 0; si < stations.length; si++) {
    const src = stationRows[si]
    for (let pi = 0; pi < points.length; pi++) {
      const p = points[pi]
      const dM = haversineKm(p.lat, p.lng, src.lat, src.lng) * 1000
      if (dM < nearestD[pi]) {
        nearestD[pi] = dM
        nearestSt[pi] = src
      }
      if (dM <= radiusM) {
        rawPairs.push({ pi, si, distanceM: dM, rawCapture: captureFactor(dM, radiusM) })
      }
    }
  }

  // Attribution plafonnée : chaque point menace au plus les MAX_TARGETS=3
  // stations les plus proches du rayon (tri par affinité décroissante).
  // Poids normalisés : Σ captures attribuées ≤ 1 — un point informel draine
  // surtout les 2-3 stations immédiatement proches, pas tout le bassin. Sans
  // ce plafond, les zones denses (Grand Tunis, Sfax) émiettent chaque point
  // sur 8-10 stations et aucune n'atteint le seuil d'alerte.
  const MAX_TARGETS = 3
  const byPoint = new Map<number, Pair[]>()
  for (const pair of rawPairs) {
    const arr = byPoint.get(pair.pi) ?? []
    arr.push(pair)
    byPoint.set(pair.pi, arr)
  }
  const kept: Pair[] = []
  for (const arr of byPoint.values()) {
    arr.sort((a, b) => b.rawCapture - a.rawCapture)
    kept.push(...arr.slice(0, MAX_TARGETS))
  }
  const sumKept = new Array<number>(points.length).fill(0)
  for (const pair of kept) sumKept[pair.pi] += pair.rawCapture
  const scale = new Array<number>(points.length).fill(1)
  for (let pi = 0; pi < points.length; pi++) {
    if (sumKept[pi] > 1) scale[pi] = 1 / sumKept[pi]
  }

  const pairs: { pointId: string; stationCode: string; distanceM: number; capture: number }[] = []
  for (const pair of kept) {
    const p = points[pair.pi]
    const st = stations[pair.si]
    const capture = pair.rawCapture * scale[pair.pi]
    const contribution = p.volumeLJ * margin * DAYS_PER_MONTH * capture
    st.lossTnd += contribution
    st.volumeStolenLJ += p.volumeLJ * capture
    st.points++
    st.worstDistanceM = st.worstDistanceM === null ? pair.distanceM : Math.min(st.worstDistanceM, pair.distanceM)
    st.pointIds.add(p.id)
    const slug = st.brandSlug
    const agg =
      brandAgg.get(slug) ??
      { brandSlug: slug, lossTnd: 0, capturedLJ: 0, stationsThreatened: 0, stationsRed: 0, pointLoss: new Map<string, number>() }
    agg.lossTnd += contribution
    agg.capturedLJ += p.volumeLJ * capture
    agg.pointLoss.set(p.id, (agg.pointLoss.get(p.id) ?? 0) + contribution)
    brandAgg.set(slug, agg)
    pairs.push({ pointId: p.id, stationCode: st.code, distanceM: Math.round(pair.distanceM), capture })
  }

  for (let pi = 0; pi < points.length; pi++) {
    const s = nearestSt[pi]
    if (s) {
      points[pi].nearest = {
        code: s.code, name: s.name,
        brandSlug: s.brand?.slug ?? "independants",
        brandName: s.brand?.name ?? "Indépendants",
        distanceM: Math.round(nearestD[pi]),
      }
    }
  }

  for (const st of stations) {
    st.lossTnd = Math.round(st.lossTnd)
    st.volumeStolenLJ = Math.round(st.volumeStolenLJ)
    st.level = levelForLoss(st.lossTnd, config)
    if (st.lossTnd >= config.lossOrangeTnd) {
      const agg = brandAgg.get(st.brandSlug)
      if (agg) {
        agg.stationsThreatened++
        if (st.lossTnd >= config.lossRedTnd) agg.stationsRed++
      }
    }
  }

  // --- Agrégats nationaux ---
  // « Stations menacées » = perte mensuelle ≥ seuil orange (5 000 DT) — la
  // simple proximité d'un point (> 0) concernerait ~2 000 stations et n'a
  // aucune valeur d'alerte (modèle DG : 63 stations significativement touchées).
  const totalLoss = Math.round(points.reduce((s, p) => s + p.lossTnd, 0))
  const totalVol = points.reduce((s, p) => s + p.volumeLJ, 0)
  const stationsThreatened = stations.filter(s => s.lossTnd >= config.lossOrangeTnd).length
  const stationsRed = stations.filter(s => s.lossTnd >= config.lossRedTnd).length

  const govMap = new Map<string, { points: number; volumeLJ: number; lossTnd: number; stations: number }>()
  for (const p of points) {
    const g = govMap.get(p.gouvernorat) ?? { points: 0, volumeLJ: 0, lossTnd: 0, stations: 0 }
    g.points++
    g.volumeLJ += p.volumeLJ
    g.lossTnd += p.lossTnd
    govMap.set(p.gouvernorat, g)
  }
  for (const st of stations) {
    if (st.lossTnd < config.lossOrangeTnd) continue
    const g = govMap.get(st.gouvernorat)
    if (g) g.stations++
  }
  const govNational: ShadowGovLossDTO[] = [...govMap.entries()]
    .map(([gouvernorat, g]) => ({
      gouvernorat,
      points: g.points,
      volumeLJ: g.volumeLJ,
      lossTnd: Math.round(g.lossTnd),
      stationsThreatened: g.stations,
      level: levelForLoss(Math.round(g.lossTnd), config),
    }))
    .sort((a, b) => b.lossTnd - a.lossTnd)

  // --- Série mensuelle ---
  const monthly: ShadowMonthlyStatDTO[] = monthlyRows.map(m => ({
    month: m.month,
    label: monthLabel(m.month),
    activePoints: m.activePoints,
    newPoints: m.newPoints,
    closedPoints: m.closedPoints,
    estLossTnd: m.estLossTnd,
    note: m.note,
  }))

  // --- Axes routiers : points informels à moins de 3 km d'un segment ---
  const roads: ShadowRoadStatDTO[] = roadRows.map(r => {
    const segs = (r.segments as [number, number][]) ?? []
    let count = 0
    let loss = 0
    for (const p of points) {
      let best = Infinity
      for (let i = 0; i < segs.length - 1; i++) {
        const d = distPointToSegmentKm(p.lat, p.lng, segs[i], segs[i + 1])
        if (d < best) best = d
      }
      if (best <= 3) {
        count++
        loss += p.lossTnd
      }
    }
    return { code: r.code, name: r.name, type: r.type, tmj: r.tmj, points: count, lossTnd: Math.round(loss) }
  })

  const formalVolumeLJ = stationRows.reduce((s, x) => s + x.traffic * 8, 0)

  return {
    at: Date.now(),
    config,
    typologies: typologies.map(t => ({
      code: t.code, label: t.label, description: t.description, icon: t.icon,
      color: t.color, volumeLJ: t.volumeLJ, active: t.active, sortOrder: t.sortOrder,
    })),
    points,
    stations,
    pairs,
    govNational,
    brandAgg,
    monthly,
    roads,
    formalVolumeLJ,
    totals: { points: points.length, lossTnd: totalLoss, volumeLJ: totalVol, stationsThreatened, stationsThreatenedRed: stationsRed },
  }
}

// Cache module-level TTL 60 s
let cache: { data: ShadowDataset; at: number } | null = null
const TTL_MS = 60_000

export async function getDataset(): Promise<ShadowDataset> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data
  const data = await buildDataset()
  cache = { data, at: Date.now() }
  return data
}

/** Invalide le cache (appelé après toute mutation point/config/typologie). */
export function invalidateShadowCache() {
  cache = null
}

// ---------------------------------------------------------------------------
// Part de marché grignotée (indicateur macro ~38–42 %)
// Volume formel = Σ stations (traffic × 8 L/véh). Le recensement n'observe que
// la fraction du marché parallèle visible depuis les axes et stations : le
// volume informel recensé est extrapolé par le facteur des études sectorielles
// (marché parallèle ≈ 40 % du formel) pour produire l'indicateur.
// ---------------------------------------------------------------------------
const INFORMAL_EXTRAPOLATION = 310

export function marketShareStolenPct(ds: ShadowDataset): number {
  const informal = ds.totals.volumeLJ * INFORMAL_EXTRAPOLATION
  const share = (100 * informal) / (informal + ds.formalVolumeLJ)
  return Math.round(share * 10) / 10
}

// ---------------------------------------------------------------------------
// Zones rouges — grille 1,5 km, cellules ≥ redZoneThreshold points actifs
// ---------------------------------------------------------------------------
const CELL_LAT = 1.5 / 111
const CELL_LNG = CELL_LAT / Math.cos((34 * Math.PI) / 180)

export function computeRedZones(points: EffectivePoint[], config: ShadowConfigDTO): ShadowRedZoneDTO[] {
  const cells = new Map<string, { pts: EffectivePoint[] }>()
  for (const p of points) {
    const key = `${Math.floor(p.lat / CELL_LAT)}:${Math.floor(p.lng / CELL_LNG)}`
    const c = cells.get(key) ?? { pts: [] }
    c.pts.push(p)
    cells.set(key, c)
  }
  const zones: ShadowRedZoneDTO[] = []
  for (const c of cells.values()) {
    if (c.pts.length < config.redZoneThreshold) continue
    const lat = c.pts.reduce((s, p) => s + p.lat, 0) / c.pts.length
    const lng = c.pts.reduce((s, p) => s + p.lng, 0) / c.pts.length
    let radius = 0
    for (const p of c.pts) radius = Math.max(radius, haversineKm(lat, lng, p.lat, p.lng) * 1000)
    radius = Math.round(Math.min(3000, Math.max(800, radius * 1.25)))
    // Libellé : cité dominante, à défaut délégation dominante
    const cites = c.pts.map(p => p.cite?.trim()).filter((x): x is string => !!x)
    const delegs = c.pts.map(p => p.delegation)
    const label = modeOf(cites.length ? cites : delegs)
    zones.push({
      label,
      gouvernorat: modeOf(c.pts.map(p => p.gouvernorat)),
      lat: Math.round(lat * 100000) / 100000,
      lng: Math.round(lng * 100000) / 100000,
      radiusM: radius,
      points: c.pts.length,
      lossTnd: Math.round(c.pts.reduce((s, p) => s + p.lossTnd, 0)),
    })
  }
  return zones.sort((a, b) => b.points - a.points)
}

// ---------------------------------------------------------------------------
// Lentilles BRAND
// ---------------------------------------------------------------------------
export function govLossesForBrand(ds: ShadowDataset, brandSlug: string): ShadowGovLossDTO[] {
  const byGov = new Map<string, { loss: number; captured: number; stations: number; pointIds: Set<string> }>()
  for (const st of ds.stations) {
    if (st.brandSlug !== brandSlug || st.lossTnd < ds.config.lossOrangeTnd) continue
    const g = byGov.get(st.gouvernorat) ?? { loss: 0, captured: 0, stations: 0, pointIds: new Set<string>() }
    g.loss += st.lossTnd
    g.captured += st.volumeStolenLJ
    g.stations++
    for (const id of st.pointIds) g.pointIds.add(id)
    byGov.set(st.gouvernorat, g)
  }
  return [...byGov.entries()]
    .map(([gouvernorat, g]) => ({
      gouvernorat,
      points: g.pointIds.size,
      volumeLJ: Math.round(g.captured),
      lossTnd: Math.round(g.loss),
      stationsThreatened: g.stations,
      level: levelForLoss(Math.round(g.loss), ds.config),
    }))
    .sort((a, b) => b.lossTnd - a.lossTnd)
}

export function typologyStatsFor(ds: ShadowDataset, brandSlug: string | null): ShadowTypologyStatDTO[] {
  const lossByPoint = brandSlug ? ds.brandAgg.get(brandSlug)?.pointLoss : null
  const set = brandSlug
    ? ds.points.filter(p => lossByPoint?.has(p.id))
    : ds.points
  const byTyp = new Map<string, { count: number; volumeLJ: number; lossTnd: number }>()
  for (const p of set) {
    const t = byTyp.get(p.typologyCode) ?? { count: 0, volumeLJ: 0, lossTnd: 0 }
    t.count++
    t.volumeLJ += p.volumeLJ
    t.lossTnd += lossByPoint ? (lossByPoint.get(p.id) ?? 0) : p.lossTnd
    byTyp.set(p.typologyCode, t)
  }
  const total = set.length || 1
  return ds.typologies
    .filter(t => byTyp.has(t.code))
    .map(t => {
      const s = byTyp.get(t.code)!
      return {
        code: t.code,
        label: t.label,
        color: t.color,
        count: s.count,
        pct: Math.round((s.count / total) * 1000) / 10,
        volumeLJ: s.volumeLJ,
        lossTnd: Math.round(s.lossTnd),
      }
    })
    .sort((a, b) => b.count - a.count)
}

export function topThreatsFor(ds: ShadowDataset, brandSlug: string | null, limit = 10): ShadowThreatStationDTO[] {
  const list = brandSlug ? ds.stations.filter(s => s.brandSlug === brandSlug) : ds.stations
  return [...list]
    .filter(s => s.points > 0)
    .sort((a, b) => b.lossTnd - a.lossTnd)
    .slice(0, limit)
    .map(s => ({
      code: s.code, name: s.name, brandSlug: s.brandSlug, brandName: s.brandName, brandColor: s.brandColor,
      gouvernorat: s.gouvernorat, delegation: s.delegation, lat: s.lat, lng: s.lng, traffic: s.traffic,
      points: s.points, volumeStolenLJ: s.volumeStolenLJ, lossTnd: s.lossTnd, level: s.level,
      worstDistanceM: s.worstDistanceM,
    }))
}

/** Série mensuelle adaptée au scope BRAND (perte re-scalée au poids de l'enseigne). */
export function monthlyForScope(ds: ShadowDataset, scope: ShadowScope): ShadowMonthlyStatDTO[] {
  if (scope.scope !== "BRAND" || !scope.brandSlug) return ds.monthly
  const agg = ds.brandAgg.get(scope.brandSlug)
  const share = agg && ds.totals.lossTnd > 0 ? agg.lossTnd / ds.totals.lossTnd : 0
  return ds.monthly.map(m => ({ ...m, estLossTnd: Math.round(m.estLossTnd * share) }))
}

// ---------------------------------------------------------------------------
// DTO mappers
// ---------------------------------------------------------------------------
export function pointDTO(p: RawPoint, lossTnd: number, nearest: EffectivePoint["nearest"]): ShadowPointDTO {
  return {
    id: p.id, code: p.code, typologyCode: p.typologyCode, status: p.status,
    gouvernorat: p.gouvernorat, delegation: p.delegation, cite: p.cite,
    lat: p.lat, lng: p.lng, volumeLJ: p.volumeLJ, priceMillimes: p.priceMillimes,
    photoUrl: p.photoUrl, notes: p.notes, source: p.source, reporter: p.reporter,
    brandThreat: p.brandThreat,
    firstSeenAt: p.firstSeenAt.toISOString(),
    lastCheckAt: p.lastCheckAt.toISOString(),
    active: p.active,
    lossTnd: Math.round(lossTnd),
    nearestStation: nearest,
  }
}

/** Station la plus proche d'une coordonnée (pour les points hors dataset). */
export function nearestStationFor(
  lat: number,
  lng: number,
  ds: ShadowDataset,
): { code: string; name: string; brandSlug: string; brandName: string; distanceM: number } | null {
  let best: number | null = null
  let code = "", name = "", brandSlug = "independants", brandName = "Indépendants"
  for (const st of ds.stations) {
    const dM = haversineKm(lat, lng, st.lat, st.lng) * 1000
    if (best === null || dM < best) {
      best = dM
      code = st.code
      name = st.name
      brandSlug = st.brandSlug
      brandName = st.brandName
    }
  }
  if (best === null) return null
  return { code, name, brandSlug, brandName, distanceM: Math.round(best) }
}

export function updateDTO(u: {
  id: string; kind: string; oldValue: string | null; newValue: string | null; author: string; date: Date
  point: { code: string; typologyCode: string; gouvernorat: string }
}) {
  return {
    id: u.id,
    pointCode: u.point.code,
    pointTypology: u.point.typologyCode,
    kind: u.kind,
    oldValue: u.oldValue,
    newValue: u.newValue,
    author: u.author,
    date: u.date.toISOString(),
    gouvernorat: u.point.gouvernorat,
  }
}

export function eventDTO(e: {
  id: string; teamLabel: string; zone: string; kind: string; date: Date
  pointsTargeted: number; pointsFound: number; status: string
}): ShadowCensusEventDTO {
  return {
    id: e.id, teamLabel: e.teamLabel, zone: e.zone, kind: e.kind,
    date: e.date.toISOString(), pointsTargeted: e.pointsTargeted,
    pointsFound: e.pointsFound, status: e.status,
  }
}

export function auditorDTO(a: {
  id: string; name: string; zone: string; brandSlug: string; phone: string
  pointsDone: number; rechecks: number; active: boolean
}) {
  return {
    id: a.id, name: a.name, zone: a.zone, brandSlug: a.brandSlug, phone: a.phone,
    pointsDone: a.pointsDone, rechecks: a.rechecks, active: a.active,
  }
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------
function modeOf(arr: string[]): string {
  const counts = new Map<string, number>()
  for (const a of arr) counts.set(a, (counts.get(a) ?? 0) + 1)
  let best = arr[0] ?? ""
  let n = -1
  for (const [k, v] of counts) if (v > n) { n = v; best = k }
  return best
}

/** Distance point → segment [lng,lat]→[lng,lat] en km (approx. plane locale). */
function distPointToSegmentKm(pLat: number, pLng: number, a: [number, number], b: [number, number]): number {
  const lat0 = (pLat * Math.PI) / 180
  const cosLat = Math.cos(lat0)
  const ax = (a[0] - pLng) * 111 * cosLat
  const ay = (a[1] - pLat) * 111
  const bx = (b[0] - pLng) * 111 * cosLat
  const by = (b[1] - pLat) * 111
  const abx = bx - ax
  const aby = by - ay
  const l2 = abx * abx + aby * aby
  let t = 0
  if (l2 > 0) t = (-(ax * abx) - (ay * aby)) / l2
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * abx
  const cy = ay + t * aby
  return Math.sqrt(cx * cx + cy * cy)
}

/** Numéro suivant pour un code « SM-26-XXXX ». */
export function nextShadowCode(existing: { code: string }[]): string {
  let max = 0
  for (const { code } of existing) {
    const n = Number(code.split("-")[2])
    if (Number.isFinite(n) && n > max) max = n
  }
  return `SM-26-${String(max + 1).padStart(4, "0")}`
}

export function fmtTnd(n: number): string {
  return Math.round(n).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")
}
