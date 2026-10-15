'use client'

// T55 — socle partagé du module « Mobility Hub Operations » : types DTO,
// hooks de chargement (/api/hubs, /api/hubs/[id], /api/hubs/analytics) et
// mini-carte SVG de la Tunisie avec positionnement réel des micro-hubs
// (projection linéaire bornes CartoBoundary — 7,5→11,6 lng · 30,2→37,4 lat).

import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"

// ---------- Types (contrats API) ----------
export interface HubKpis {
  interventions: number
  caTotal: number
  ca30: number
  caMonthly: number
  vehicles: number
  loyaltyAvg: number
  conversions: number
  conversionsConverted: number
  conversionRatePct: number
  caConversions: number
  roiPct: number
  paybackMonths: number | null
  monthsOpen: number
}

export interface HubRow {
  id: string
  code: string
  name: string
  brandSlug: string
  gouvernorat: string
  delegation: string | null
  lat: number
  lng: number
  format: string
  status: string
  openedAt: string | null
  investmentDt: number
  monthlyRentDt: number
  franchisee: string | null
  kpis: HubKpis
}

export interface HubsResponse {
  hubs: HubRow[]
  aggregate: {
    hubs: number
    active: number
    construction: number
    projet: number
    interventions: number
    ca30: number
    caTotal: number
    vehicles: number
    conversions: number
    conversionsConverted: number
    conversionRatePct: number
    caConversions: number
    investment: number
  }
  brand: string | null
}

export interface AnalyticsResponse {
  funnel: { ORIENTE: number; CONVERTI: number; PERDU: number }
  totalConversions: number
  conversionRatePct: number
  caAttributed: number
  monthly: { mois: string; ca: number; conversions: number }[]
  byService: { type: string; count: number; ca: number }[]
  byHub: { id: string; code: string; name: string; gouvernorat: string; franchisee: string | null; investmentDt: number; caTotal: number; roiPct: number; conversionRatePct: number }[]
  byBrand: { slug: string; hubs: number; ca: number; conversions: number }[]
  brand: string | null
}

export interface HubDetailResponse {
  hub: HubRow & {
    franchisee: { fullName: string; email: string | null; phone: string | null; capital: number | null; experience: string | null } | null
    kpis: HubKpis & { conversionsShown: number }
    interventions: { id: string; serviceType: string; detail: string | null; priceDt: number; durationMin: number | null; createdAt: string; vehicle: { plate: string; brand: string; model: string | null } | null }[]
    vehicles: { id: string; plate: string; brand: string; model: string | null; km: number; loyaltyPoints: number; lastVisit: string | null }[]
    conversions: { id: string; stationCode: string | null; detail: string; status: string; valueDt: number; createdAt: string }[]
    services: { type: string; label: string; basePriceDt: number; durationMin: number }[]
  }
}

// ---------- Hooks ----------
export function useHubs(brandSlug: string | null) {
  const [data, setData] = useState<HubsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])
  useEffect(() => {
    let alive = true
    const qs = brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : ""
    fetch(`/api/hubs${qs}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: HubsResponse) => { if (alive) { setData(d); setError(null) } })
      .catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [brandSlug, reloadKey])
  return { data, error, reload }
}

export function useHubDetail(id: string | null) {
  const [data, setData] = useState<HubDetailResponse | null>(null)
  useEffect(() => {
    if (!id) return
    let alive = true
    fetch(`/api/hubs/${id}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: HubDetailResponse) => { if (alive) setData(d) })
      .catch(() => { if (alive) setData(null) })
    return () => { alive = false }
  }, [id])
  // Dérivation (règle react-hooks/set-state-in-effect) : la fiche affichée
  // correspond à l'identifiant courant — un changement de hub vide l'affichage
  // sans setState synchrone dans l'effet.
  return data && id && data.hub.id === id ? data : null
}

// ---------- Métadonnées statut / format ----------
export const HUB_STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  ACTIF: { label: "Actif", badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400", dot: "#059669" },
  CONSTRUCTION: { label: "En construction", badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400", dot: "#d97706" },
  PROJET: { label: "Projet", badge: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400", dot: "#9333ea" },
  FERME: { label: "Fermé", badge: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400", dot: "#dc2626" },
}

export const HUB_FORMAT_META: Record<string, { label: string }> = {
  CLASSIQUE: { label: "Station classique" },
  EXPRESS: { label: "Micro-station express" },
  MOBILITY_HUB: { label: "Mobility Hub" },
}

export function HubStatusBadge({ status }: { status: string }) {
  const meta = HUB_STATUS_META[status] ?? HUB_STATUS_META.PROJET
  return <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
}

export function HubFormatBadge({ format }: { format: string }) {
  const meta = HUB_FORMAT_META[format] ?? { label: format }
  return (
    <Badge variant="outline" className="border-stone-300 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
      {meta.label}
    </Badge>
  )
}

// ---------- Mini-carte SVG de la Tunisie ----------
// Contour simplifié (22 sommets, sens horaire depuis Bizerte) — projection
// linéaire : x = (lng − 7,5) × 73,2 ; y = (37,4 − lat) × 88.
const TN_OUTLINE: [number, number][] = [
  [9.87, 37.27], [10.3, 37.0], [10.55, 37.05], [11.08, 37.05], [11.02, 36.55],
  [10.74, 36.45], [10.6, 36.4], [10.63, 35.83], [10.83, 35.78], [11.06, 35.5],
  [11.02, 34.85], [10.74, 34.74], [10.5, 34.45], [10.11, 33.89], [10.45, 33.4],
  [10.85, 33.28], [11.1, 33.12], [11.55, 33.25], [11.5, 32.0], [9.85, 30.6],
  [8.6, 32.1], [7.85, 33.9], [8.35, 34.7], [8.65, 35.3], [8.55, 35.85],
  [8.7, 36.17], [9.0, 36.55], [9.18, 36.72], [9.5, 37.05],
]

const projX = (lng: number) => (lng - 7.5) * 73.2
const projY = (lat: number) => (37.4 - lat) * 88
const OUTLINE_PATH = TN_OUTLINE.map(([lng, lat], i) => `${i === 0 ? "M" : "L"}${projX(lng).toFixed(1)},${projY(lat).toFixed(1)}`).join(" ") + " Z"

export function TunisiaMiniMap({
  hubs, selectedId, onSelect,
}: {
  hubs: HubRow[]
  selectedId: string | null
  onSelect: (hub: HubRow) => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
      <svg
        viewBox="-12 -12 336 660"
        className="h-80 w-auto shrink-0 sm:h-[26rem]"
        role="img"
        aria-label={`Carte de la Tunisie — ${hubs.length} micro-hubs positionnés`}
      >
        {/* Contour stylisé */}
        <path
          d={OUTLINE_PATH}
          className="fill-emerald-100 stroke-emerald-700/60 dark:fill-emerald-950 dark:stroke-emerald-400/50"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {/* Micro-hubs */}
        {hubs.map(h => {
          const meta = HUB_STATUS_META[h.status] ?? HUB_STATUS_META.PROJET
          const cx = projX(h.lng)
          const cy = projY(h.lat)
          const selected = h.id === selectedId
          return (
            <g key={h.id} className="cursor-pointer" onClick={() => onSelect(h)}>
              {h.status === "ACTIF" && (
                <circle cx={cx} cy={cy} r={12} fill={meta.dot} opacity={0.18}>
                  <animate attributeName="r" values="9;15;9" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.28;0.05;0.28" dur="3s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                cx={cx} cy={cy} r={selected ? 8 : 6}
                fill={meta.dot}
                stroke="white" strokeWidth={selected ? 3 : 2}
                className="transition-all"
              >
                <title>{`${h.code} — ${h.name} (${meta.label})`}</title>
              </circle>
              {selected && (
                <text x={cx + 12} y={cy + 4} fontSize={13} className="fill-foreground font-semibold">
                  {h.code}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Légende</p>
        <ul className="space-y-1.5 text-xs">
          {["ACTIF", "CONSTRUCTION", "PROJET"].map(s => {
            const meta = HUB_STATUS_META[s]
            const n = hubs.filter(h => h.status === s).length
            return (
              <li key={s} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.dot }} aria-hidden />
                <span className="flex-1">{meta.label}</span>
                <span className="tabular-nums text-muted-foreground">{n}</span>
              </li>
            )
          })}
        </ul>
        <p className="rounded-lg border bg-muted/30 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
          Projection des positions réelles des micro-hubs (coordonnées GPS). Cliquez un point pour ouvrir la fiche
          du TMP — interventions, véhicules clients et conversions.
        </p>
      </div>
    </div>
  )
}
