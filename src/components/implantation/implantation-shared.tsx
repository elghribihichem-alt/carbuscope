'use client'

// CarbuScope — Implantation (Task ID: 9) : socle partagé des 4 outils décisionnels.
// Chargement unique des 3 endpoints au niveau de l'onglet, calculs purs ici
// (quartiles, paliers d'équipement, score d'opportunité) + atomes UI communs.

import { Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { num } from "@/lib/chart"
import type { BrandDTO, GovernoratRow, StationDTO } from "@/lib/types"

/* ============================== Types ============================== */

/** Données partagées entre les 4 sections (un seul chargement réseau). */
export type ImplantationData = {
  governorats: GovernoratRow[]
  stations: StationDTO[]
  brands: BrandDTO[]
}

/** Paliers d'équipement d'un gouvernorat (seuils = quartiles du ratio véh/station). */
export type PalierKey = "BLANCHE" | "SOUS" | "EQUILIBREE" | "DENSE"

export type BrandCount = { slug: string; name: string; color: string; count: number }

export type DelegationCount = { name: string; count: number }

/** Statistiques marché consolidées d'un gouvernorat (calcul client). */
export type GovStat = {
  name: string
  population: number
  vehicles: number
  motorizationRate: number
  avgFleetAge: number
  delegationCount: number
  /** Stations en service (ACTIVE + RÉNOVATION) — l'offre réelle. */
  stationsTotal: number
  stationsByBrand: BrandCount[]
  delegations: DelegationCount[]
  /** Ratio central : véhicules par station en service. */
  ratio: number
  palier: PalierKey
  /** Score d'opportunité 0-100 (ratio 50 % · population 30 % · motorisation 20 %). */
  opportunity: number
  /** Note moyenne des stations notées (null si aucune note). */
  avgRating: number | null
  ratedStations: number
}

export type GovStatsResult = {
  stats: GovStat[]
  /** Quartiles du ratio (q1, médiane, q3) — seuils des paliers. */
  thresholds: { q1: number; q2: number; q3: number }
  national: {
    vehicles: number
    stations: number
    ratio: number
    population: number
  }
}

/* ============================== Méta paliers ============================== */

export const PALIER_META: Record<PalierKey, {
  label: string
  badge: string
  color: string
  description: string
  /** Rang d'affichage (zones blanches en tête). */
  rank: number
}> = {
  BLANCHE: {
    label: "Zone blanche",
    badge:
      "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400",
    color: "#dc2626",
    description: "poches de chalandise sans offre suffisante — priorité d'implantation",
    rank: 0,
  },
  SOUS: {
    label: "Sous-équipée",
    badge:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    color: "#d97706",
    description: "couverture inférieure à la médiane nationale",
    rank: 1,
  },
  EQUILIBREE: {
    label: "Équilibrée",
    badge:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    color: "#059669",
    description: "offre alignée sur le parc local",
    rank: 2,
  },
  DENSE: {
    label: "Dense",
    badge:
      "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
    color: "#64748b",
    description: "forte densité concurrentielle — prudence",
    rank: 3,
  },
}

/** Couleur de repli pour une enseigne inconnue (ardoise). */
export const NEUTRAL_BRAND = "#64748b"

/** Statuts comptés comme « offre en service » (ni fermée, ni projet). */
export const SERVICE_STATUSES = new Set(["ACTIVE", "RENOVATION"])

export const inService = (s: StationDTO): boolean => SERVICE_STATUSES.has(s.status)

/* ============================== Calculs ============================== */

/** Quantile R-7 (interpolation linéaire) sur une série TRIÉE croissante. */
export function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const h = (sorted.length - 1) * p
  const lo = Math.floor(h)
  const hi = Math.min(lo + 1, sorted.length - 1)
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
}

const norm = (v: number, min: number, max: number): number =>
  max > min ? (v - min) / (max - min) : 1

/**
 * Consolide les 24 gouvernorats : couverture stations par enseigne/délégation,
 * ratio véhicules/station, paliers (quartiles) et score d'opportunité.
 */
export function computeGovStats(data: ImplantationData): GovStatsResult {
  const brandByName = new Map<string, BrandCount>()
  const delegations = new Map<string, Map<string, number>>()
  const ratingSum = new Map<string, { sum: number; n: number }>()

  for (const s of data.stations) {
    if (!inService(s)) continue
    const gov = delegations.get(s.gouvernorat) ?? new Map<string, number>()
    gov.set(s.delegation, (gov.get(s.delegation) ?? 0) + 1)
    delegations.set(s.gouvernorat, gov)

    const key = `${s.gouvernorat}||${s.brandSlug ?? "sans"}`
    const b = brandByName.get(key) ?? {
      slug: s.brandSlug ?? "sans",
      name: s.brandName || "Sans enseigne",
      color: s.brandColor || NEUTRAL_BRAND,
      count: 0,
    }
    b.count += 1
    brandByName.set(key, b)

    if (s.rating > 0) {
      const r = ratingSum.get(s.gouvernorat) ?? { sum: 0, n: 0 }
      r.sum += s.rating
      r.n += 1
      ratingSum.set(s.gouvernorat, r)
    }
  }

  const partial = data.governorats.map((g) => {
    const stationsTotal = [...(delegations.get(g.name)?.values() ?? [])].reduce(
      (a, b) => a + b, 0
    )
    // Gouvernorat sans station en service : ratio dégradé = parc entier (extrême haut).
    const ratio = stationsTotal > 0 ? g.vehicles / stationsTotal : g.vehicles
    const rating = ratingSum.get(g.name)
    return { g, stationsTotal, ratio, avgRating: rating ? rating.sum / rating.n : null, ratedStations: rating?.n ?? 0 }
  })

  const sortedRatios = partial.map((p) => p.ratio).sort((a, b) => a - b)
  const q1 = quantile(sortedRatios, 0.25)
  const q2 = quantile(sortedRatios, 0.5)
  const q3 = quantile(sortedRatios, 0.75)

  const minRatio = sortedRatios[0] ?? 0
  const maxRatio = sortedRatios[sortedRatios.length - 1] ?? 0
  const minPop = Math.min(...partial.map((p) => p.g.population))
  const maxPop = Math.max(...partial.map((p) => p.g.population))
  const minMotor = Math.min(...partial.map((p) => p.g.motorizationRate))
  const maxMotor = Math.max(...partial.map((p) => p.g.motorizationRate))

  const stats: GovStat[] = partial.map(({ g, stationsTotal, ratio, avgRating, ratedStations }) => {
    const palier: PalierKey =
      ratio > q3 ? "BLANCHE" : ratio > q2 ? "SOUS" : ratio > q1 ? "EQUILIBREE" : "DENSE"
    const opportunity = Math.round(
      50 * norm(ratio, minRatio, maxRatio) +
        30 * norm(g.population, minPop, maxPop) +
        20 * norm(g.motorizationRate, minMotor, maxMotor)
    )
    return {
      name: g.name,
      population: g.population,
      vehicles: g.vehicles,
      motorizationRate: g.motorizationRate,
      avgFleetAge: g.avgFleetAge,
      delegationCount: g.delegationCount,
      stationsTotal,
      stationsByBrand: [...brandByName.entries()]
        .filter(([k]) => k.startsWith(`${g.name}||`))
        .map(([, b]) => b)
        .sort((a, b) => b.count - a.count),
      delegations: [...(delegations.get(g.name)?.entries() ?? [])]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      ratio,
      palier,
      opportunity,
      avgRating,
      ratedStations,
    }
  })

  const vehicles = data.governorats.reduce((s, g) => s + g.vehicles, 0)
  const stations = stats.reduce((s, x) => s + x.stationsTotal, 0)
  return {
    stats,
    thresholds: { q1, q2, q3 },
    national: {
      vehicles,
      stations,
      ratio: stations > 0 ? vehicles / stations : 0,
      population: data.governorats.reduce((s, g) => s + g.population, 0),
    },
  }
}

/* ============================== Formatage FR ============================== */

export { num }
export const fmtPct1 = (v: number): string =>
  `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`
export const fmtRatio = (v: number): string => num(v)
export const fmtKm = (km: number, digits = 1): string =>
  `${km.toLocaleString("fr-FR", { maximumFractionDigits: digits })} km`
/** 0,42 km → « 420 m » ; 1,3 km → « 1,3 km ». */
export const fmtDist = (km: number): string =>
  km < 1 ? `${Math.round(km * 1000)} m` : fmtKm(km)
export const fmtNote = (v: number): string =>
  v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })

/* ============================== Atomes UI ============================== */

export function BrandDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn("h-2 w-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color || NEUTRAL_BRAND }}
      aria-hidden
    />
  )
}

export function PalierBadge({ palier, className }: { palier: PalierKey; className?: string }) {
  const meta = PALIER_META[palier]
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium", meta.badge, className)}>
      {meta.label}
    </Badge>
  )
}

export function NoteCell({ rating, reviews }: { rating: number; reviews?: number }) {
  if (!rating || rating <= 0) return <span className="text-xs italic text-muted-foreground">non notée</span>
  return (
    <span className="inline-flex items-center gap-1 text-xs tabular-nums">
      <Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-hidden />
      <span className="font-medium">{fmtNote(rating)}</span>
      {reviews !== undefined && reviews > 0 && (
        <span className="text-muted-foreground">({num(reviews)})</span>
      )}
    </span>
  )
}

/**
 * Mini-barre 100 % empilée de la répartition des enseignes.
 * Rectangles colorés proportionnels — libellés détaillés dans le title/aria-label.
 */
export function BrandMiniBar({
  dist,
  height = "h-1.5",
  className,
  label,
}: {
  dist: BrandCount[]
  height?: string
  className?: string
  label?: string
}) {
  const total = dist.reduce((s, b) => s + b.count, 0)
  if (total === 0) return <span className="text-xs italic text-muted-foreground">—</span>
  const aria =
    label ??
    `Répartition enseignes : ${dist.map((b) => `${b.name} ${num(b.count)}`).join(", ")}`
  return (
    <span
      role="img"
      aria-label={aria}
      title={aria}
      className={cn("flex w-full max-w-[150px] overflow-hidden rounded-full bg-muted", height, className)}
    >
      {dist.map((b) => (
        <span
          key={b.slug}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(b.count / total) * 100}%`, backgroundColor: b.color }}
        />
      ))}
    </span>
  )
}

/** Barre de progression fine + valeur (score 0-100). */
export function ScoreBar({
  value,
  color,
  className,
}: {
  value: number
  color: string
  className?: string
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }}
        />
      </span>
      <span className="text-xs font-semibold tabular-nums">{num(value)}</span>
    </span>
  )
}

/* ============================== Géo ============================== */

/** Azimut initial (radians, depuis le nord) entre deux points. */
export function bearingRad(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180
  const f1 = lat1 * toRad
  const f2 = lat2 * toRad
  const dl = (lng2 - lng1) * toRad
  const y = Math.sin(dl) * Math.cos(f2)
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
  return Math.atan2(y, x)
}

/** Médiane d'une série (non triée). */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  return quantile(s, 0.5)
}
