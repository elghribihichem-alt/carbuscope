'use client'

// T51-b — Radar d'Opportunités / sous-module « 🗺️ Zones blanches » :
// 1. Carte des déserts automobiles (bulles = parc, couleur = score)
// 2. Analyse de couverture par enseigne (barres empilées + zones manquantes)
// 3. Densité du parc auto ATTT (bulle-map + histogramme gouv + top zones)
// 4. Trafic routier (bulles TMJ + top axes du référentiel + liste des zones)
// Les zones viennent du parent (useZones unique du module) ; seul l'onglet
// couverture charge les stations nationales (agrégation côté client).

import { useEffect, useMemo, useState } from "react"
import {
  Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis,
} from "recharts"
import { Car, Gauge, Layers, MapPin, MapPinPlus, Route, Ruler, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer } from "@/components/ui/chart"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { KpiCard } from "@/components/shell/kpi-card"
import { useChartPalette } from "@/hooks/use-chart-palette"
import { tooltipStyle } from "@/lib/chart"
import type { StationDTO } from "@/lib/types"
import type { OpportunityAlertDTO, OpportunitySettingDTO, OpportunityZoneDTO } from "@/lib/t51-dto"
import {
  OppEmpty, OppError, ROAD_AXES, ScoreBadge, TONE_HEX, TunisiaBubbleMap,
  oppNum, oppScrollList, scoreTone, type BubblePoint, type OppStats, type OppTone,
} from "./opp-shared"
import { cn } from "@/lib/utils"

export interface OppZonesProps {
  zones: OpportunityZoneDTO[]
  stats: OppStats
  settings: OpportunitySettingDTO | null
  alerts: OpportunityAlertDTO[]
  brandSlug: string
}

type TipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }

/* ======================= Onglet 1 — Déserts automobiles ======================= */

function DesertsTab({ zones }: { zones: OpportunityZoneDTO[] }) {
  const white = useMemo(
    () => zones.filter(z => z.isWhiteZone).sort((a, b) => b.scoreGlobal - a.scoreGlobal),
    [zones]
  )
  const avgKm = white.length ? white.reduce((s, z) => s + z.nearestStationKm, 0) / white.length : 0
  const avgScore = white.length ? Math.round(white.reduce((s, z) => s + z.scoreGlobal, 0) / white.length) : 0
  const biggest = white.reduce<OpportunityZoneDTO | null>((m, z) => (!m || z.areaKm2 > m.areaKm2 ? z : m), null)

  const points: BubblePoint[] = white.map(z => ({
    lat: z.lat,
    lng: z.lng,
    value: z.vehicles,
    label: `${z.zoneName} (${z.delegation})`,
    sub: `Score ${z.scoreGlobal}/100 · station la plus proche à ${z.nearestStationKm.toLocaleString("fr-FR")} km`,
    tone: scoreTone(z.scoreGlobal),
  }))

  if (white.length === 0) {
    return <OppEmpty icon={MapPin} title="Aucune zone blanche détectée">Toutes les zones référencées disposent d'une station à moins de 5 km.</OppEmpty>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Zones blanches" value={white.length} icon={MapPinPlus} tone="danger" sub="aucune station à moins de 5 km" />
        <KpiCard label="Distance médiane au réseau" value={`${avgKm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`} icon={Route} tone="warning" sub="station la plus proche, moyenne des zones blanches" />
        <KpiCard label="Score moyen (zones blanches)" value={`${avgScore}/100`} icon={Gauge} tone="info" sub="scoring pondéré sur 5 critères" />
        <KpiCard
          label="Plus grande zone blanche"
          value={biggest ? biggest.zoneName : "—"}
          icon={Ruler}
          sub={biggest ? `${oppNum(biggest.areaKm2)} km² · ${biggest.gouvernorat}` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Carte des déserts automobiles</CardTitle>
            <CardDescription>
              {white.length} zones blanches sur {zones.length} — taille des bulles = parc automobile local,
              couleur = score d&apos;opportunité.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TunisiaBubbleMap
              points={points}
              height={600}
              valueLabel="Parc auto"
              unit=" véh."
              ariaLabel="Carte des zones blanches de Tunisie"
              legend={[
                { tone: "ok", label: "Score ≥ 70 — opportunité majeure" },
                { tone: "warning", label: "Score 55-69 — à qualifier" },
                { tone: "danger", label: "Score < 55 — à instruire" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Zones blanches ({white.length})</CardTitle>
            <CardDescription>Triées par score décroissant · distance à la station la plus proche.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className={cn(oppScrollList, "space-y-1.5")}>
              {white.map(z => (
                <li
                  key={z.id}
                  className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{z.zoneName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {z.delegation} · {z.gouvernorat} · {oppNum(z.vehicles)} véh.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <ScoreBadge score={z.scoreGlobal} />
                    <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {z.nearestStationKm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ======================= Onglet 2 — Analyse de couverture ======================= */

const INDEP_KEY = "independants"

/** Ligne de couverture : gouvernorat + une clé par enseigne visible + totaux. */
interface CovRow {
  gouvernorat: string
  total: number
  white: number
  [brandKey: string]: number | string
}

function CoverageTab({ zones, brandSlug }: { zones: OpportunityZoneDTO[]; brandSlug: string }) {
  const [stations, setStations] = useState<StationDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [hidden, setHidden] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/stations?limit=3200", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { stations: StationDTO[] }) => {
        setStations(j.stations ?? [])
        setError(null)
      })
      .catch(e => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setError("Impossible de charger le parc national de stations.")
      })
    return () => ac.abort()
  }, [reloadKey])

  const palette = useChartPalette()

  const brandMeta = useMemo(() => {
    const m = new Map<string, { key: string; name: string; color: string }>()
    for (const s of stations ?? []) {
      const key = s.brandSlug ?? INDEP_KEY
      if (!m.has(key)) m.set(key, { key, name: s.brandSlug ? s.brandName : "Indépendants", color: s.brandColor })
    }
    const list = [...m.values()]
    list.sort((a, b) => (a.key === brandSlug ? -1 : b.key === brandSlug ? 1 : a.name.localeCompare(b.name)))
    return list
  }, [stations, brandSlug])

  const rows = useMemo<CovRow[]>(() => {
    if (!stations) return []
    const inService = stations.filter(s => s.status === "ACTIVE" || s.status === "RENOVATION")
    // Lignes aplaties : { gouvernorat, [brandKey]: n, total, white } — dataKey plat pour Recharts
    const byGov = new Map<string, CovRow>()
    for (const s of inService) {
      const key = s.brandSlug ?? INDEP_KEY
      if (hidden[key]) continue
      const rec = byGov.get(s.gouvernorat) ?? { gouvernorat: s.gouvernorat, total: 0, white: 0 }
      rec[key] = (Number(rec[key]) || 0) + 1
      rec.total = (Number(rec.total) || 0) + 1
      byGov.set(s.gouvernorat, rec)
    }
    const whiteByGov = new Map<string, number>()
    for (const z of zones) {
      if (!z.isWhiteZone) continue
      whiteByGov.set(z.gouvernorat, (whiteByGov.get(z.gouvernorat) ?? 0) + 1)
    }
    return [...byGov.values()]
      .map(r => ({ ...r, white: whiteByGov.get(r.gouvernorat) ?? 0 }))
      .sort((a, b) => b.total - a.total)
  }, [stations, zones, hidden])

  const missing = useMemo(() => {
    const m = new Map<string, OpportunityZoneDTO[]>()
    for (const z of zones) {
      if (!z.isWhiteZone) continue
      const arr = m.get(z.gouvernorat)
      if (arr) arr.push(z)
      else m.set(z.gouvernorat, [z])
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [zones])

  const renderTip = (props: TipProps) => {
    if (!props.active || !props.payload?.length) return null
    const row = props.payload[0]?.payload as (typeof rows)[number] | undefined
    if (!row) return null
    return (
      <div className="px-3 py-2 text-xs" style={tooltipStyle()}>
        <p className="mb-1 font-medium text-popover-foreground">{row.gouvernorat}</p>
        <div className="space-y-0.5">
          {brandMeta
            .filter(b => !hidden[b.key] && (Number(row[b.key]) || 0) > 0)
            .map(b => (
              <div key={b.key} className="flex items-center justify-between gap-6">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
                  {b.name}
                </span>
                <span className="font-semibold tabular-nums text-popover-foreground">{row[b.key]}</span>
              </div>
            ))}
          <div className="flex items-center justify-between gap-6 border-t pt-1">
            <span className="text-muted-foreground">Total en service</span>
            <span className="font-semibold tabular-nums text-popover-foreground">{row.total}</span>
          </div>
          {row.white > 0 && (
            <div className="flex items-center justify-between gap-6">
              <span className="inline-flex items-center gap-1.5 text-orange-700 dark:text-orange-400">
                <TriangleAlert className="h-3 w-3" aria-hidden /> Zones blanches
              </span>
              <span className="font-semibold tabular-nums">{row.white}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (error) {
    return <OppError message={error} onRetry={() => setReloadKey(k => k + 1)} />
  }
  if (!stations) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6" aria-busy="true" aria-label="Chargement de la couverture nationale…">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Layers className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
            Superposition par enseigne
          </CardTitle>
          <CardDescription>
            Nombre de stations en service par gouvernorat et par enseigne — cochez les enseignes à superposer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {brandMeta.map(b => (
              <label key={b.key} className="inline-flex cursor-pointer select-none items-center gap-2 text-xs font-medium">
                <Checkbox
                  checked={!hidden[b.key]}
                  onCheckedChange={c => setHidden(prev => ({ ...prev, [b.key]: c === false }))}
                  aria-label={`Afficher ${b.name}`}
                />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
                {b.name}
                {b.key === brandSlug && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">mon enseigne</Badge>}
              </label>
            ))}
          </div>
          <div className="h-[620px]" role="img" aria-label="Stations en service par gouvernorat et par enseigne">
            <ChartContainer config={{}} className="aspect-auto h-full w-full">
              <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={palette.grid} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: palette.axis }}
                  tickFormatter={(v: number) => oppNum(v)}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="gouvernorat"
                  width={100}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: palette.axis }}
                />
                <Tooltip content={renderTip} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                {brandMeta
                  .filter(b => !hidden[b.key])
                  .map(b => (
                    <Bar
                      key={b.key}
                      dataKey={b.key}
                      name={b.name}
                      stackId="cov"
                      fill={b.color}
                      maxBarSize={14}
                    />
                  ))}
              </BarChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TriangleAlert className="h-4 w-4 text-orange-700 dark:text-orange-400" aria-hidden />
            Où manque une station
          </CardTitle>
          <CardDescription>
            Gouvernorats comptant des zones blanches — aucun point de vente à moins de 5 km des zones listées.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className={cn(oppScrollList, "space-y-1.5")}>
            {missing.map(([gov, list]) => (
              <li key={gov} className="rounded-lg border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{gov}</p>
                  <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-800 tabular-nums dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300">
                    {list.length} zone{list.length > 1 ? "s" : ""} blanche{list.length > 1 ? "s" : ""}
                  </Badge>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                  {list.map(z => `${z.zoneName} (${z.nearestStationKm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km)`).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

/* ======================= Onglet 3 — Densité du parc auto ======================= */

function DensityTab({ zones }: { zones: OpportunityZoneDTO[] }) {
  const sorted = useMemo(() => [...zones].sort((a, b) => b.vehicleDensity - a.vehicleDensity), [zones])

  const thresholds = useMemo(() => {
    const d = [...zones].map(z => z.vehicleDensity).sort((a, b) => a - b)
    const q = (p: number) => d[Math.min(d.length - 1, Math.floor(p * (d.length - 1)))] ?? 0
    return { q25: q(0.25), q50: q(0.5), q75: q(0.75) }
  }, [zones])

  const toneOf = (d: number): OppTone =>
    d >= thresholds.q75 ? "ok" : d >= thresholds.q50 ? "info" : d >= thresholds.q25 ? "warning" : "danger"

  const points: BubblePoint[] = zones.map(z => ({
    lat: z.lat,
    lng: z.lng,
    value: z.vehicleDensity,
    label: `${z.zoneName} (${z.delegation})`,
    sub: `Score ${z.scoreGlobal}/100 · ${oppNum(z.vehicles)} véhicules sur ${oppNum(z.areaKm2)} km²`,
    tone: toneOf(z.vehicleDensity),
  }))

  const topGov = useMemo(() => {
    const m = new Map<string, { gouvernorat: string; vehicles: number; area: number }>()
    for (const z of zones) {
      const rec = m.get(z.gouvernorat) ?? { gouvernorat: z.gouvernorat, vehicles: 0, area: 0 }
      rec.vehicles += z.vehicles
      rec.area += z.areaKm2
      m.set(z.gouvernorat, rec)
    }
    return [...m.values()]
      .map(r => ({ gouvernorat: r.gouvernorat, densite: Math.round(r.vehicles / Math.max(1, r.area)) }))
      .sort((a, b) => b.densite - a.densite)
      .slice(0, 10)
  }, [zones])

  const palette = useChartPalette()
  const renderTip = (props: TipProps) => {
    if (!props.active || !props.payload?.length) return null
    const row = props.payload[0]?.payload as { gouvernorat: string; densite: number } | undefined
    if (!row) return null
    return (
      <div className="px-3 py-2 text-xs" style={tooltipStyle()}>
        <p className="font-medium text-popover-foreground">{row.gouvernorat}</p>
        <p className="tabular-nums text-muted-foreground">
          Densité : <span className="font-semibold text-popover-foreground">{oppNum(row.densite)} véh/km²</span>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Car className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
              Densité du parc automobile (croisement ATTT)
            </CardTitle>
            <CardDescription>
              Véhicules par km² par zone — taille des bulles = densité, couleur par quartile national.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TunisiaBubbleMap
              points={points}
              height={600}
              valueLabel="Densité"
              unit=" véh/km²"
              ariaLabel="Carte de densité du parc automobile par zone"
              legend={[
                { tone: "ok", label: `Quartile supérieur (≥ ${oppNum(thresholds.q75)} véh/km²)` },
                { tone: "info", label: `Quartile médian (≥ ${oppNum(thresholds.q50)})` },
                { tone: "warning", label: `Quartile inférieur (≥ ${oppNum(thresholds.q25)})` },
                { tone: "danger", label: `Plus faible densité (< ${oppNum(thresholds.q25)})` },
              ]}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Les 10 gouvernorats les plus denses</CardTitle>
              <CardDescription>Parc total rapporté à la superficie des zones du référentiel.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]" role="img" aria-label="Histogramme des 10 gouvernorats les plus denses">
                <ChartContainer config={{}} className="aspect-auto h-full w-full">
                  <BarChart data={topGov} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.grid} />
                    <XAxis
                      dataKey="gouvernorat"
                      tick={{ fontSize: 9, fill: palette.axis }}
                      interval={0}
                      angle={-38}
                      textAnchor="end"
                      height={52}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: palette.axis }}
                      tickFormatter={(v: number) => oppNum(v)}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                    />
                    <Tooltip content={renderTip} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                    <Bar dataKey="densite" name="véh/km²" radius={[3, 3, 0, 0]} maxBarSize={26}>
                      {topGov.map(r => (
                        <Cell key={r.gouvernorat} fill={TONE_HEX[toneOf(r.densite)]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Top zones par densité</CardTitle>
              <CardDescription>Les 15 zones les plus denses du référentiel (54 zones).</CardDescription>
            </CardHeader>
            <CardContent>
              <div className={cn(oppScrollList, "max-h-96")}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zone</TableHead>
                      <TableHead className="text-right">Densité</TableHead>
                      <TableHead className="text-right">Parc</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.slice(0, 15).map(z => (
                      <TableRow key={z.id}>
                        <TableCell className="py-2">
                          <p className="truncate text-sm font-medium">{z.zoneName}</p>
                          <p className="text-[11px] text-muted-foreground">{z.gouvernorat}</p>
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums">
                          {oppNum(z.vehicleDensity)}
                          <span className="ml-1 text-[11px] font-normal text-muted-foreground">véh/km²</span>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {oppNum(z.vehicles)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ======================= Onglet 4 — Trafic routier ======================= */

function TrafficTab({ zones }: { zones: OpportunityZoneDTO[] }) {
  const toneOf = (t: number): OppTone => (t >= 12000 ? "ok" : t >= 6000 ? "info" : t >= 3000 ? "warning" : "danger")

  const points: BubblePoint[] = zones.map(z => ({
    lat: z.lat,
    lng: z.lng,
    value: z.trafficDaily,
    label: `${z.zoneName} (${z.delegation})`,
    sub: `TMJ · score ${z.scoreGlobal}/100 · ${oppNum(z.vehicles)} véhicules`,
    tone: toneOf(z.trafficDaily),
  }))

  const sortedZones = useMemo(() => [...zones].sort((a, b) => b.trafficDaily - a.trafficDaily), [zones])
  const axes = useMemo(() => [...ROAD_AXES].sort((a, b) => b.tmj - a.tmj).slice(0, 10), [])

  const palette = useChartPalette()
  const renderTip = (props: TipProps) => {
    if (!props.active || !props.payload?.length) return null
    const row = props.payload[0]?.payload as (typeof axes)[number] | undefined
    if (!row) return null
    return (
      <div className="px-3 py-2 text-xs" style={tooltipStyle()}>
        <p className="font-medium text-popover-foreground">{row.label}</p>
        <p className="tabular-nums text-muted-foreground">
          TMJ : <span className="font-semibold text-popover-foreground">{oppNum(row.tmj)} véh/j</span>
        </p>
      </div>
    )
  }

  const nationalAvg = zones.length ? zones.reduce((s, z) => s + z.trafficDaily, 0) / zones.length : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="TMJ moyen (zones)" value={`${oppNum(nationalAvg)} véh/j`} icon={Gauge} tone="info" sub="trafic moyen journalier estimé par zone" />
        <KpiCard label="Zone la plus passante" value={sortedZones[0]?.zoneName ?? "—"} icon={Route} sub={sortedZones[0] ? `${oppNum(sortedZones[0].trafficDaily)} véh/j · ${sortedZones[0].gouvernorat}` : undefined} />
        <KpiCard label="Axes du référentiel" value={ROAD_AXES.length} icon={MapPin} sub="autoroutes et routes nationales suivies" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Route className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
              Volume quotidien par axe et par zone
            </CardTitle>
            <CardDescription>
              Taille des bulles = trafic moyen journalier (TMJ) de la zone · repères : Tunis, Sousse, Sfax.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TunisiaBubbleMap
              points={points}
              height={600}
              valueLabel="TMJ"
              unit=" véh/j"
              ariaLabel="Carte du trafic routier quotidien par zone"
              legend={[
                { tone: "ok", label: "TMJ ≥ 12 000 — fort trafic" },
                { tone: "info", label: "TMJ 6 000-12 000" },
                { tone: "warning", label: "TMJ 3 000-6 000" },
                { tone: "danger", label: "TMJ < 3 000" },
              ]}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Top 10 axes routiers</CardTitle>
              <CardDescription>Trafic moyen journalier indicatif du référentiel national.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[340px]" role="img" aria-label="Trafic moyen journalier des 10 premiers axes routiers">
                <ChartContainer config={{}} className="aspect-auto h-full w-full">
                  <BarChart data={axes} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={palette.grid} />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10, fill: palette.axis }}
                      tickFormatter={(v: number) => oppNum(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="code"
                      width={44}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10, fill: palette.axis }}
                    />
                    <Tooltip content={renderTip} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                    <Bar dataKey="tmj" name="TMJ (véh/j)" radius={[0, 3, 3, 0]} maxBarSize={12}>
                      {axes.map(a => (
                        <Cell key={a.code} fill={TONE_HEX[toneOf(a.tmj)]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Zones par TMJ</CardTitle>
              <CardDescription>Toutes les zones triées par trafic décroissant.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className={cn(oppScrollList, "space-y-1")}>
                {sortedZones.map(z => (
                  <li key={z.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-1.5 transition-colors hover:bg-muted/50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{z.zoneName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{z.delegation} · {z.gouvernorat}</p>
                    </div>
                    <span
                      className="shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums text-white"
                      style={{ backgroundColor: TONE_HEX[toneOf(z.trafficDaily)] }}
                    >
                      {oppNum(z.trafficDaily)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ======================= Sous-module Zones blanches ======================= */

export function OppZones({ zones, brandSlug }: OppZonesProps) {
  const [tab, setTab] = useState("deserts")

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
        <TabsTrigger value="deserts">Carte des déserts</TabsTrigger>
        <TabsTrigger value="couverture">Analyse de couverture</TabsTrigger>
        <TabsTrigger value="densite">Densité du parc auto</TabsTrigger>
        <TabsTrigger value="trafic">Trafic routier</TabsTrigger>
      </TabsList>
      <TabsContent value="deserts" className="mt-0 space-y-4">
        <DesertsTab zones={zones} />
      </TabsContent>
      <TabsContent value="couverture" className="mt-0 space-y-4">
        <CoverageTab zones={zones} brandSlug={brandSlug} />
      </TabsContent>
      <TabsContent value="densite" className="mt-0 space-y-4">
        <DensityTab zones={zones} />
      </TabsContent>
      <TabsContent value="trafic" className="mt-0 space-y-4">
        <TrafficTab zones={zones} />
      </TabsContent>
    </Tabs>
  )
}
