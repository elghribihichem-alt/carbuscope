'use client'

// CarbuScope — Implantation (Task ID: 9) / outil 2 : « Isochrones 5/10/15 min ».
// Zone de chalandise par temps de trajet autour d'un site candidat :
// candidat = station existante (recherche) ou coordonnées libres, hypothèse de
// vitesse honnête, anneaux SVG concentriques + stations projetées par azimut,
// chalandise par couronne et liste des stations captées.
// Hypothèse affichée : rayon = vitesse × temps (approximation géométrique,
// hors réseau routier — pas de routage isochrone réel).

import { useMemo, useState } from "react"
import {
  Building2, Clock, Gauge, MapPin, MapPinPlus, Navigation, TriangleAlert,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { cn } from "@/lib/utils"
import { haversineKm, TUNISIA } from "@/lib/geo"
import type { StationDTO } from "@/lib/types"
import {
  BrandDot, NoteCell, bearingRad, fmtDist, fmtKm, fmtPct1, inService, num,
  type BrandCount, type ImplantationData,
} from "./implantation-shared"

/* ============================== Constantes ============================== */

const SPEED_PRESETS = [
  { key: "grand-tunis", label: "Grand Tunis dense", kmh: 22, hint: "feux, congestion, voirie urbaine" },
  { key: "cote", label: "Ville côtière", kmh: 35, hint: "Sousse, Sfax, agglomérations secondaires" },
  { key: "interieur", label: "Intérieur / axes", kmh: 55, hint: "routes nationales, circulation dégagée" },
] as const
type SpeedKey = (typeof SPEED_PRESETS)[number]["key"]

const MINUTES = [5, 10, 15] as const

/** Géométrie SVG : échelle fixe — 15 min ↔ bord du cadre. */
const SVG_SIZE = 440
const SVG_C = SVG_SIZE / 2
const MAX_R = 172
const EMERALD = "#059669"

/** Seuil en dessous duquel une station est dite co-localisée au candidat. */
const COLOC_KM = 0.05

type Couronne = 0 | 1 | 2
const COURONNE_LABELS: Record<Couronne, string> = {
  0: "Cœur · 0-5 min",
  1: "Couronne 5-10 min",
  2: "Couronne 10-15 min",
}

type Caught = {
  code: string
  name: string
  brandSlug: string | null
  brandName: string
  brandColor: string
  delegation: string
  gouvernorat: string
  status: string
  traffic: number
  rating: number
  reviewsCount: number
  lat: number
  lng: number
  d: number
  couronne: Couronne
}

type Candidate = { name: string; sub: string; lat: number; lng: number; gov: string | null }

const inTunisia = (lat: number, lng: number): boolean =>
  lat >= TUNISIA.minLat - 0.5 && lat <= TUNISIA.maxLat + 0.5 &&
  lng >= TUNISIA.minLng - 0.5 && lng <= TUNISIA.maxLng + 0.5

/* ============================== Autocomplete station ============================== */

function StationPicker({
  stations, value, onSelect,
}: { stations: StationDTO[]; value: StationDTO | null; onSelect: (s: StationDTO) => void }) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return stations
      .filter(inService)
      .filter((s) =>
        `${s.name} ${s.brandName} ${s.delegation} ${s.gouvernorat} ${s.code}`.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [stations, query])

  const pick = (s: StationDTO) => {
    onSelect(s)
    setQuery("")
    setActive(0)
  }

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0) }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setActive((i) => Math.min(i + 1, suggestions.length - 1))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === "Enter" && suggestions[active]) {
              e.preventDefault()
              pick(suggestions[active])
            } else if (e.key === "Escape") {
              setQuery("")
            }
          }}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-label="Rechercher une station existante (nom, enseigne, délégation)"
          aria-autocomplete="list"
          placeholder="Rechercher une station existante (nom, enseigne, lieu)…"
          className="h-9 pl-8 text-sm"
        />
      </div>

      {suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Stations suggérées"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-md"
        >
          {suggestions.map((s, i) => (
            <li key={s.code}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  i === active ? "bg-primary/10" : "hover:bg-muted"
                )}
              >
                <BrandDot color={s.brandColor} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {s.brandName} · {s.delegation} ({s.gouvernorat})
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{s.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {value && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
          <span className="truncate">
            Candidat retenu : <span className="font-medium text-foreground">{value.name}</span>
          </span>
        </p>
      )}
      {value === null && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Simulation « et si j&apos;étais ici ? » — stations toutes enseignes confondues.
        </p>
      )}
    </div>
  )
}

/* ============================== Anneaux SVG ============================== */

type Hover = {
  name: string
  brandName: string
  brandColor: string
  d: number
  traffic: number
  rating: number
  x: number
  y: number
}

function IsochroneSvg({
  caught, radii, candidate, mySlug, hover, onHoverChange,
}: {
  caught: Caught[]
  radii: { r5: number; r10: number; r15: number }
  candidate: Candidate
  mySlug: string
  hover: Hover | null
  onHoverChange: (h: Hover | null) => void
}) {
  const ringPx = [MAX_R / 3, (2 * MAX_R) / 3, MAX_R]
  const ringKm = [radii.r5, radii.r10, radii.r15]

  // Stations strictement co-localisées (coordonnées identiques au recensement) :
  // éclatées en spirale d'angle d'or autour du candidat pour rester lisibles.
  const colocIdx = new Map<string, number>()
  caught.forEach((s, i) => {
    if (s.d < COLOC_KM) colocIdx.set(s.code, i)
  })
  const spiralPos = (idx: number): { x: number; y: number } => {
    const r = Math.min(10 + Math.sqrt(idx + 1) * 4.5, 44)
    const a = idx * 2.399963 + 0.7
    return { x: SVG_C + r * Math.sin(a), y: SVG_C - r * Math.cos(a) }
  }

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[440px]">
      <svg
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Isochrones 5, 10 et 15 minutes autour de ${candidate.name} : ${caught.length} stations captées`}
      >
        {/* Anneaux concentriques — émeraude translucide, du plus large au centre */}
        {[2, 1, 0].map((i) => (
          <circle
            key={i}
            cx={SVG_C}
            cy={SVG_C}
            r={ringPx[i]}
            fill={EMERALD}
            fillOpacity={0.13 - i * 0.035}
            stroke={EMERALD}
            strokeOpacity={0.55}
            strokeWidth={1.2}
            strokeDasharray={i === 2 ? "4 3" : undefined}
          />
        ))}

        {/* Libellés des anneaux (haut) */}
        {ringPx.map((r, i) => (
          <text
            key={`lbl-${i}`}
            x={SVG_C}
            y={SVG_C - r + 13}
            textAnchor="middle"
            fontSize={10}
            fill="var(--muted-foreground)"
          >
            {MINUTES[i]} min · {fmtKm(ringKm[i])}
          </text>
        ))}

        {/* Croix du site candidat */}
        <g aria-label="Site candidat">
          <circle cx={SVG_C} cy={SVG_C} r={5.5} fill={EMERALD} stroke="white" strokeWidth={1.5} />
          <line x1={SVG_C - 11} y1={SVG_C} x2={SVG_C - 7} y2={SVG_C} stroke={EMERALD} strokeWidth={1.5} />
          <line x1={SVG_C + 7} y1={SVG_C} x2={SVG_C + 11} y2={SVG_C} stroke={EMERALD} strokeWidth={1.5} />
          <line x1={SVG_C} y1={SVG_C - 11} x2={SVG_C} y2={SVG_C - 7} stroke={EMERALD} strokeWidth={1.5} />
          <line x1={SVG_C} y1={SVG_C + 7} x2={SVG_C} y2={SVG_C + 11} stroke={EMERALD} strokeWidth={1.5} />
          <text x={SVG_C} y={SVG_C + 26} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
            Candidat
          </text>
        </g>

        {/* Stations captées : azimut réel + distance relative normalisée sur l'anneau 15 min.
            Les co-localisées (distance réelle 0 m) sont éclatées en spirale autour du candidat. */}
        {caught.map((s) => {
          const idx = colocIdx.get(s.code)
          let x: number
          let y: number
          if (idx !== undefined) {
            const p = spiralPos(idx)
            x = p.x
            y = p.y
          } else {
            const rho = (s.d / radii.r15) * MAX_R
            const theta = bearingRad(candidate.lat, candidate.lng, s.lat, s.lng)
            x = SVG_C + rho * Math.sin(theta)
            y = SVG_C - rho * Math.cos(theta)
          }
          const mine = s.brandSlug === mySlug
          return (
            <circle
              key={s.code}
              cx={x}
              cy={y}
              r={mine ? 5 : 4}
              fill={s.brandColor || "#64748b"}
              stroke={mine ? EMERALD : "white"}
              strokeWidth={mine ? 2 : 1}
              onMouseEnter={() =>
                onHoverChange({
                  name: s.name, brandName: s.brandName, brandColor: s.brandColor,
                  d: s.d, traffic: s.traffic, rating: s.rating, x, y,
                })
              }
              onMouseLeave={() => onHoverChange(null)}
              opacity={idx !== undefined ? 0.75 : 1}
            >
              <title>{`${s.name} · ${s.brandName} · ${s.d < COLOC_KM ? "co-localisée (coordonnées identiques)" : fmtDist(s.d)} · ${num(s.traffic)} véh/j`}</title>
            </circle>
          )
        })}
      </svg>

      {/* Tooltip flottant au survol d'une station */}
      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 w-48 rounded-lg border bg-popover p-2 text-xs shadow-md"
          style={{
            left: `${(hover.x / SVG_SIZE) * 100}%`,
            top: `${(hover.y / SVG_SIZE) * 100}%`,
            transform: "translate(-50%, calc(-100% - 10px))",
          }}
        >
          <p className="truncate font-semibold text-popover-foreground">{hover.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
            <BrandDot color={hover.brandColor} />
            {hover.brandName}
          </p>
          <p className="mt-0.5 tabular-nums text-muted-foreground">
            {hover.d < COLOC_KM ? "co-localisée (0 m)" : fmtDist(hover.d)} · {num(hover.traffic)} véh/j
            {hover.rating > 0 ? ` · ${hover.rating.toFixed(1).replace(".", ",")}/5` : ""}
          </p>
        </div>
      )}
    </div>
  )
}

/* ============================== Outil 2 ============================== */

export function Isochrones({ data, brandSlug }: { data: ImplantationData; brandSlug: string }) {
  const [mode, setMode] = useState<"station" | "libre">("station")
  const [station, setStation] = useState<StationDTO | null>(null)
  const [latInput, setLatInput] = useState("")
  const [lngInput, setLngInput] = useState("")
  const [govInput, setGovInput] = useState("none")
  const [speedKey, setSpeedKey] = useState<SpeedKey>("interieur")
  const [hover, setHover] = useState<Hover | null>(null)

  const preset = SPEED_PRESETS.find((p) => p.key === speedKey) ?? SPEED_PRESETS[1]
  const radii = useMemo(
    () => ({
      r5: (preset.kmh * MINUTES[0]) / 60,
      r10: (preset.kmh * MINUTES[1]) / 60,
      r15: (preset.kmh * MINUTES[2]) / 60,
    }),
    [preset]
  )

  /* ---- Site candidat : station existante OU coordonnées libres valides ---- */
  const freeLat = Number.parseFloat(latInput.replace(",", "."))
  const freeLng = Number.parseFloat(lngInput.replace(",", "."))
  const freeFilled = latInput.trim() !== "" && lngInput.trim() !== ""
  const freeValid = freeFilled && Number.isFinite(freeLat) && Number.isFinite(freeLng) && inTunisia(freeLat, freeLng)

  const candidate: Candidate | null = useMemo(() => {
    if (mode === "station") {
      if (!station) return null
      return {
        name: station.name,
        sub: `${station.brandName} · ${station.delegation} (${station.gouvernorat})`,
        lat: station.lat,
        lng: station.lng,
        gov: station.gouvernorat,
      }
    }
    if (!freeValid) return null
    return {
      name: "Site candidat — coordonnées libres",
      sub: govInput !== "none" ? `Gouvernorat de ${govInput}` : "gouvernorat non précisé",
      lat: freeLat,
      lng: freeLng,
      gov: govInput !== "none" ? govInput : null,
    }
  }, [mode, station, freeValid, freeLat, freeLng, govInput])

  /* ---- Stations captées par couronne (une seule passe de calcul) ---- */
  const caught = useMemo<Caught[]>(() => {
    if (!candidate) return []
    const out: Caught[] = []
    for (const s of data.stations) {
      if (!inService(s)) continue
      const d = haversineKm(candidate.lat, candidate.lng, s.lat, s.lng)
      if (d > radii.r15) continue
      const couronne: Couronne = d <= radii.r5 ? 0 : d <= radii.r10 ? 1 : 2
      out.push({
        code: s.code, name: s.name, brandSlug: s.brandSlug, brandName: s.brandName,
        brandColor: s.brandColor, delegation: s.delegation, gouvernorat: s.gouvernorat,
        status: s.status, traffic: s.traffic, rating: s.rating, reviewsCount: s.reviewsCount,
        lat: s.lat, lng: s.lng, d, couronne,
      })
    }
    return out.sort((a, b) => a.d - b.d)
  }, [candidate, data.stations, radii])

  /* ---- Agrégats par couronne ---- */
  const couronnes = useMemo(() => {
    const build = (c: Couronne, label: string, maxKm: number, minKm: number) => {
      const rows = caught.filter((s) => s.couronne === c)
      const byBrand = new Map<string, BrandCount>()
      let traffic = 0
      let mineCount = 0
      let mineTraffic = 0
      for (const s of rows) {
        traffic += s.traffic
        const key = s.brandSlug ?? "sans"
        const b = byBrand.get(key) ?? {
          slug: key, name: s.brandName || "Sans enseigne", color: s.brandColor || "#64748b", count: 0,
        }
        b.count += 1
        byBrand.set(key, b)
        if (s.brandSlug === brandSlug) { mineCount += 1; mineTraffic += s.traffic }
      }
      const competitors = [...byBrand.values()].filter((b) => b.slug !== brandSlug).sort((a, b) => b.count - a.count)
      return {
        couronne: c, label, interval: minKm === 0 ? `≤ ${fmtKm(maxKm)}` : `${fmtKm(minKm)} – ${fmtKm(maxKm)}`,
        rows, count: rows.length, traffic,
        competitors, mineCount, mineTraffic,
        minePct: rows.length > 0 ? (mineCount / rows.length) * 100 : 0,
      }
    }
    return [
      build(0, COURONNE_LABELS[0], radii.r5, 0),
      build(1, COURONNE_LABELS[1], radii.r10, radii.r5),
      build(2, COURONNE_LABELS[2], radii.r15, radii.r10),
    ]
  }, [caught, radii, brandSlug])

  /* ---- Synthèse trafic 10 min ---- */
  const tenMin = useMemo(() => {
    const rows = caught.filter((s) => s.couronne <= 1)
    const traffic = rows.reduce((sum, s) => sum + s.traffic, 0)
    const mineTraffic = rows.filter((s) => s.brandSlug === brandSlug).reduce((sum, s) => sum + s.traffic, 0)
    const leader = couronnes[1].competitors[0] ?? couronnes[0].competitors[0] ?? null
    return {
      stations: rows.length,
      traffic,
      minePct: traffic > 0 ? (mineTraffic / traffic) * 100 : 0,
      leader,
    }
  }, [caught, brandSlug, couronnes])

  const myBrand = data.brands.find((b) => b.slug === brandSlug)

  /* ---- Colonnes DataViews des stations captées ---- */
  const columns: DataViewColumn<Caught>[] = [
    {
      key: "station", header: "Station",
      sortValue: (s) => s.name,
      render: (s) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{s.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{s.delegation} · {s.gouvernorat}</p>
        </div>
      ),
    },
    {
      key: "enseigne", header: "Enseigne",
      sortValue: (s) => s.brandName,
      render: (s) => (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <BrandDot color={s.brandColor} />
          <span className="truncate">{s.brandName}</span>
          {s.brandSlug === brandSlug && (
            <Badge variant="outline" className="h-4 px-1 text-[10px] text-emerald-700 dark:text-emerald-400">
              moi
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "distance", header: "Distance", align: "right",
      sortValue: (s) => s.d,
      render: (s) => (
        <span className="text-sm font-semibold tabular-nums">
          {s.d < COLOC_KM ? (
            <span title="Coordonnées identiques dans le recensement — distance réelle 0 m">0 m · co-localisée</span>
          ) : (
            fmtDist(s.d)
          )}
        </span>
      ),
    },
    {
      key: "traffic", header: "Trafic", align: "right",
      sortValue: (s) => s.traffic,
      render: (s) => <span className="text-sm tabular-nums">{num(s.traffic)} <span className="text-[11px] text-muted-foreground">véh/j</span></span>,
    },
    {
      key: "note", header: "Note",
      sortValue: (s) => s.rating,
      render: (s) => <NoteCell rating={s.rating} reviews={s.reviewsCount} />,
    },
    {
      key: "statut", header: "Statut",
      sortValue: (s) => s.status,
      render: (s) => (
        <Badge variant="outline" className={cn(
          "text-[11px]",
          s.status === "ACTIVE"
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
            : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
        )}>
          {s.status === "ACTIVE" ? "En service" : "En rénovation"}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {/* Sélection du site candidat + hypothèses de vitesse */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <MapPinPlus className="h-4 w-4 text-primary" aria-hidden />
              Site candidat
            </CardTitle>
            <CardDescription>
              Simulez l&apos;implantation depuis une station existante (« et si j&apos;étais ici ? »)
              ou saisissez des coordonnées libres de votre étude de site.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Mode de sélection du candidat">
              <Button
                type="button"
                variant={mode === "station" ? "default" : "outline"}
                size="sm"
                aria-pressed={mode === "station"}
                onClick={() => setMode("station")}
              >
                <Building2 className="h-3.5 w-3.5" aria-hidden />
                Station existante
              </Button>
              <Button
                type="button"
                variant={mode === "libre" ? "default" : "outline"}
                size="sm"
                aria-pressed={mode === "libre"}
                onClick={() => setMode("libre")}
              >
                <Navigation className="h-3.5 w-3.5" aria-hidden />
                Coordonnées libres
              </Button>
            </div>

            {mode === "station" ? (
              <StationPicker stations={data.stations} value={station} onSelect={setStation} />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cand-lat" className="text-xs">Latitude</Label>
                    <Input
                      id="cand-lat"
                      type="number"
                      step="0.0001"
                      inputMode="decimal"
                      value={latInput}
                      onChange={(e) => setLatInput(e.target.value)}
                      placeholder="36,8062"
                      className="h-9 font-mono text-sm"
                      aria-invalid={freeFilled && !freeValid}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cand-lng" className="text-xs">Longitude</Label>
                    <Input
                      id="cand-lng"
                      type="number"
                      step="0.0001"
                      inputMode="decimal"
                      value={lngInput}
                      onChange={(e) => setLngInput(e.target.value)}
                      placeholder="10,1815"
                      className="h-9 font-mono text-sm"
                      aria-invalid={freeFilled && !freeValid}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cand-gov" className="text-xs">Gouvernorat (optionnel)</Label>
                  <Select value={govInput} onValueChange={setGovInput}>
                    <SelectTrigger id="cand-gov" size="sm" className="w-full" aria-label="Gouvernorat du site candidat">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Non précisé</SelectItem>
                      {[...data.governorats.map((g) => g.name)].sort((a, b) => a.localeCompare(b, "fr")).map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {freeFilled && !freeValid && (
                  <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                    Coordonnées invalides ou hors Tunisie (lat 29,9–37,5 · lng 7,2–11,9).
                  </p>
                )}
              </div>
            )}

            {candidate && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{candidate.name}</p>
                <p className="mt-0.5 text-xs text-emerald-700/80 dark:text-emerald-400/80">{candidate.sub}</p>
                <p className="mt-1 font-mono text-xs text-emerald-700 dark:text-emerald-400">
                  {candidate.lat.toFixed(4)}, {candidate.lng.toFixed(4)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Gauge className="h-4 w-4 text-primary" aria-hidden />
              Hypothèse de vitesse
            </CardTitle>
            <CardDescription>Rayon = vitesse × temps — choisissez le profil de voirie le plus honnête.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={speedKey} onValueChange={(v) => setSpeedKey(v as SpeedKey)}>
              <SelectTrigger size="sm" className="w-full" aria-label="Hypothèse de vitesse moyenne">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPEED_PRESETS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label} · {p.kmh} km/h
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {preset.label} : {preset.hint} — vitesse commerciale moyenne retenue.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MINUTES.map((m) => {
                const km = (preset.kmh * m) / 60
                return (
                  <Badge key={m} variant="outline" className="gap-1 tabular-nums">
                    <Clock className="h-3 w-3 text-emerald-600" aria-hidden />
                    {m} min ≈ {fmtKm(km)}
                  </Badge>
                )
              })}
            </div>
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] leading-snug text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" role="note">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Approximation géométrique — hors réseau routier : les anneaux sont des cercles
              (vitesse × temps), pas des isochrones routiers réels.
            </p>
          </CardContent>
        </Card>
      </div>

      {candidate === null ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MapPinPlus className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm font-medium">Sélectionnez un site candidat pour tracer les isochrones</p>
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              Recherchez une station existante ou saisissez les coordonnées de votre étude de site :
              les anneaux 5/10/15 min, la chalandise par couronne et les stations captées
              s&apos;afficheront instantanément.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI de chalandise */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Stations captées (15 min)"
              value={caught.length}
              icon={MapPin}
              tone="info"
              sub={`trafic cumulé ${num(caught.reduce((s, x) => s + x.traffic, 0))} véh/j`}
            />
            <KpiCard
              label="Trafic capté (10 min)"
              value={`${num(tenMin.traffic)}`}
              icon={Gauge}
              tone="success"
              sub={`dont ${fmtPct1(tenMin.minePct)} pour ${myBrand?.name ?? "mon enseigne"} · ${tenMin.stations} stations`}
            />
            <KpiCard
              label="Concurrents dans le cœur (5 min)"
              value={couronnes[0].count - couronnes[0].mineCount}
              icon={Building2}
              tone={couronnes[0].count - couronnes[0].mineCount > 3 ? "warning" : "default"}
              sub={couronnes[0].competitors[0] ? `leader : ${couronnes[0].competitors[0].name}` : "aucun concurrent direct"}
            />
            <KpiCard
              label="Mon enseigne dans la zone"
              value={caught.filter((s) => s.brandSlug === brandSlug).length}
              icon={MapPin}
              sub={`${fmtPct1((caught.filter((s) => s.brandSlug === brandSlug).length / Math.max(caught.length, 1)) * 100)} des stations captées`}
            />
          </div>

          {/* Anneaux SVG + chalandise par couronne */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">Anneaux 5 / 10 / 15 min autour du candidat</CardTitle>
                <CardDescription>
                  Points colorés = stations captées (couleur de l&apos;enseigne, liseré émeraude = votre
                  enseigne), positionnées par azimut et distance relative · survolez pour le détail ·
                  les stations co-localisées (coordonnées identiques au recensement) sont éclatées en
                  spirale autour du candidat — distance réelle 0 m.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {caught.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 p-8 text-center">
                    <p className="text-sm font-medium">Aucune station en service dans les 15 min</p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      Zone réellement blanche à cette localisation — vérifiez l&apos;hypothèse de vitesse
                      (une vitesse plus élevée élargit les anneaux) avant d&apos;en tirer conclusion.
                    </p>
                  </div>
                ) : (
                  <IsochroneSvg
                    caught={caught}
                    radii={radii}
                    candidate={candidate}
                    mySlug={brandSlug}
                    hover={hover}
                    onHoverChange={setHover}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Chalandise par couronne</CardTitle>
                <CardDescription>
                  Stations, trafic et concurrents captés par anneau, à {preset.kmh} km/h.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {couronnes.map((c) => (
                  <div key={c.couronne} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold">{c.label}</p>
                      <Badge variant="secondary" className="tabular-nums text-[10px]">{c.interval}</Badge>
                    </div>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                      {c.count} station{c.count > 1 ? "s" : ""} · {num(c.traffic)} véh/j
                    </p>
                    {c.competitors.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {c.competitors.map((b) => (
                          <span
                            key={b.slug}
                            className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] tabular-nums"
                            title={`${b.name} : ${b.count} station(s)`}
                          >
                            <BrandDot color={b.color} className="h-1.5 w-1.5" />
                            {b.name} ×{b.count}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Ma part : {c.mineCount} station{c.mineCount > 1 ? "s" : ""} ({fmtPct1(c.minePct)})
                      {c.mineTraffic > 0 ? ` · ${num(c.mineTraffic)} véh/j` : ""}
                    </p>
                  </div>
                ))}

                <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-primary">Synthèse</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Trafic capté à 10 min : <span className="font-semibold tabular-nums text-foreground">{num(tenMin.traffic)} véh/j</span>
                    {" "}dont <span className="font-semibold tabular-nums text-foreground">{fmtPct1(tenMin.minePct)}</span> pour
                    l&apos;enseigne {myBrand?.name ?? "—"}
                    {tenMin.leader ? `, premier concurrent : ${tenMin.leader.name} (${tenMin.leader.count} station${tenMin.leader.count > 1 ? "s" : ""})` : ""}
                    {". "}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Liste des stations captées */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Stations captées dans les anneaux</CardTitle>
              <CardDescription>
                {caught.length} station{caught.length > 1 ? "s" : ""} en service à moins de {fmtKm(radii.r15)} du
                candidat · 3 modes d&apos;affichage · nested par couronne
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataViews
                viewKey="implantation-isochrones"
                columns={columns}
                rows={caught}
                rowKey={(s) => s.code}
                emptyMessage="Aucune station dans la zone 15 min — relisez l'hypothèse de vitesse."
                maxHeightClassName="max-h-[26rem]"
                nested={{
                  groupKey: (s) => String(s.couronne),
                  groupLabel: (gk, grows) => {
                    const c = Number(gk) as Couronne
                    const traffic = grows.reduce((sum, s) => sum + s.traffic, 0)
                    return (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" aria-hidden />
                        {COURONNE_LABELS[c]}
                        <span className="ml-1 text-[11px] font-normal text-primary/70">
                          — {grows.length} station{grows.length > 1 ? "s" : ""} · {num(traffic)} véh/j
                        </span>
                      </span>
                    )
                  },
                  groupSortValue: (gk) => Number(gk),
                  defaultOpen: "first",
                }}
                renderCard={(s) => (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{s.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {s.delegation} · {s.gouvernorat} · {s.code}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn(
                          "shrink-0 text-[10px]",
                          s.status === "ACTIVE"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                            : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                        )}>
                          {s.status === "ACTIVE" ? "En service" : "En rénovation"}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-xs">
                        <BrandDot color={s.brandColor} />
                        <span className="truncate font-medium">{s.brandName}</span>
                        {s.brandSlug === brandSlug && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px] text-emerald-700 dark:text-emerald-400">moi</Badge>
                        )}
                      </div>
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Distance</dt>
                          <dd className="font-semibold tabular-nums">{s.d < COLOC_KM ? "0 m · co-loc." : fmtDist(s.d)}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Trafic</dt>
                          <dd className="font-semibold tabular-nums">{num(s.traffic)}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Note</dt>
                          <dd><NoteCell rating={s.rating} reviews={s.reviewsCount} /></dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>
                )}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
