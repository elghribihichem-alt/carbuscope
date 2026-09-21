'use client'

// CarbuScope — Module A.5 « Concurrence » : KPIs concurrentiels, sélecteur de rayon,
// parts de marché (doughnut), densité de services, évolution des ouvertures,
// zones sous-desservies et tableau des concurrents proches.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Building2, Loader2, MapPinned, Radar, TriangleAlert } from "lucide-react"
import { useAppStore } from "@/store/app-store"
import type { CompetitionStats } from "@/lib/types"
import { num } from "@/lib/chart"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { ErrorState, TabSkeleton } from "@/components/shell/loading"
import { ServiceChips } from "@/components/stations/service-chip"
import { fmtPct, MarketShareDoughnut, OpeningsAreaChart, ServicesDensityChart } from "./competition-charts"
import { SaturationCard } from "./saturation-gauge"

const NEARBY_STATUS_LABELS: Record<string, string> = {
  TENSION: "Tension",
  WATCH: "À surveiller",
  OK: "OK",
}

const NEARBY_STATUS_STYLES: Record<string, string> = {
  TENSION: "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400",
  WATCH: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  OK: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
}

function distanceBadge(km: number): { label: string; cls: string } {
  if (km < 2) return { label: "Tension", cls: NEARBY_STATUS_STYLES.TENSION }
  if (km < 5) return { label: "À surveiller", cls: NEARBY_STATUS_STYLES.WATCH }
  return { label: "OK", cls: NEARBY_STATUS_STYLES.OK }
}

function fmtKm(km: number): string {
  return `${km.toFixed(1).replace(".", ",")} km`
}

/** Colonne des zones sous-desservies (DataViews : Tableau / Cartes). */
type ZoneRow = { gouvernorat: string; stations: number; expected: number; deficit: number }

const ZONE_COLUMNS: DataViewColumn<ZoneRow>[] = [
  {
    key: "gouvernorat", header: "Gouvernorat",
    sortValue: (z) => z.gouvernorat,
    render: (z) => <span className="text-sm font-medium">{z.gouvernorat}</span>,
  },
  {
    key: "stations", header: "Stations", align: "right",
    sortValue: (z) => z.stations,
    render: (z) => <span className="text-sm tabular-nums">{num(z.stations)}</span>,
  },
  {
    key: "expected", header: "Attendues", align: "right",
    sortValue: (z) => z.expected,
    render: (z) => <span className="text-sm tabular-nums text-muted-foreground">{num(z.expected)}</span>,
  },
  {
    key: "deficit", header: "Déficit", align: "right",
    sortValue: (z) => z.deficit,
    render: (z) => (
      <Badge variant="outline" className="tabular-nums text-red-600 dark:text-red-400">
        −{num(z.deficit)}
      </Badge>
    ),
  },
]

export function CompetitionTab() {
  const brandSlug = useAppStore((s) => s.brandSlug)
  const setTab = useAppStore((s) => s.setTab)
  const setFocusStation = useAppStore((s) => s.setFocusStation)

  const [radius, setRadius] = useState(10)
  const [sliderVal, setSliderVal] = useState(10)
  const [data, setData] = useState<{ brand: string; radius: number; stats: CompetitionStats } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // ---- Rayon : debounce 400 ms après le dernier mouvement du curseur (A.5) ----
  useEffect(() => {
    if (sliderVal === radius) return
    const t = window.setTimeout(() => setRadius(sliderVal), 400)
    return () => window.clearTimeout(t)
  }, [sliderVal, radius])

  // ---- Analyse concurrentielle (rayon paramétrable) ----
  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/competition?brand=${encodeURIComponent(brandSlug)}&radius=${radius}`, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json() as Promise<CompetitionStats>
      })
      .then((stats) => {
        setData({ brand: brandSlug, radius, stats })
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [brandSlug, radius, reloadKey])

  // Données affichables : cohérentes avec l'enseigne ET le rayon courants ;
  // en cas d'écart (refetch en cours), on conserve l'analytique précédente + témoin d'actualisation.
  const forBrand = data !== null && data.brand === brandSlug ? data : null
  const stats = forBrand !== null && forBrand.radius === radius ? forBrand.stats : null
  const shown = stats ?? forBrand?.stats ?? null
  const stale = shown !== null && stats === null

  const myRow = shown?.marketShare.find((r) => r.slug === brandSlug) ?? null
  const brandName = myRow?.brand ?? brandSlug
  const myStations = myRow?.stations ?? 0

  const locate = useCallback((code: string) => {
    setFocusStation(code)
    setTab("map")
  }, [setFocusStation, setTab])

  const zones = useMemo(
    () => (shown ? [...shown.underservedZones].sort((a, b) => b.deficit - a.deficit) : []),
    [shown]
  )
  const topZone = zones[0] ?? null

  // Colonnes des concurrents proches (DataViews : Tableau / Cartes / Arborescence par enseigne)
  const nearbyColumns: DataViewColumn<CompetitionStats["nearby"][number]>[] = [
    {
      key: "myStation", header: "Ma station",
      sortValue: (n) => n.myStation,
      render: (n) => (
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{n.myStation}</p>
            <p className="font-mono text-[10px] text-muted-foreground">{n.myCode}</p>
          </div>
        </div>
      ),
    },
    {
      key: "competitorBrand", header: "Enseigne",
      sortValue: (n) => n.competitorBrand,
      hideInCards: true,
      render: (n) => (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: n.competitorColor }} aria-hidden />
          <span className="truncate">{n.competitorBrand}</span>
        </span>
      ),
    },
    {
      key: "nearestCompetitor", header: "Concurrent le plus proche",
      sortValue: (n) => n.nearestCompetitor,
      render: (n) => (
        <span className="block max-w-[220px] truncate text-sm font-medium" title={n.nearestCompetitor}>
          {n.nearestCompetitor}
        </span>
      ),
    },
    {
      key: "distance", header: "Distance",
      sortValue: (n) => n.distanceKm,
      render: (n) => {
        const d = distanceBadge(n.distanceKm)
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium tabular-nums">{fmtKm(n.distanceKm)}</span>
            <Badge variant="outline" className={d.cls}>{d.label}</Badge>
          </div>
        )
      },
    },
    {
      key: "differentiators", header: "Services différenciants",
      sortValue: (n) => n.differentiators.length,
      render: (n) =>
        n.differentiators.length > 0 ? (
          <ServiceChips services={n.differentiators} max={4} showLabels />
        ) : (
          <span className="text-xs italic text-muted-foreground">Parité de services</span>
        ),
    },
    {
      key: "status", header: "Statut",
      sortValue: (n) => NEARBY_STATUS_LABELS[n.status] ?? n.status,
      render: (n) => (
        <Badge variant="outline" className={NEARBY_STATUS_STYLES[n.status] ?? ""}>
          {NEARBY_STATUS_LABELS[n.status] ?? n.status}
        </Badge>
      ),
    },
  ]

  // Rayon correspondant réellement aux données affichées (peut différer pendant l'actualisation)
  const shownRadius = stats !== null ? radius : (forBrand?.radius ?? radius)

  if (shown === null && error === null) {
    return <TabSkeleton title="Chargement de l'analyse concurrentielle…" />
  }
  if (shown === null) {
    return <ErrorState message={`Impossible de charger l'analyse concurrentielle : ${error}`} retry={() => setReloadKey((k) => k + 1)} />
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* En-tête + note méthodologique */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
            Analyse concurrentielle — {brandName}
          </h2>
          {stale && error === null && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Actualisation…
            </span>
          )}
          {stale && error !== null && (
            <span className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400" role="alert">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
              Actualisation impossible — données précédentes affichées
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="rounded-md border border-red-300 px-2 py-0.5 font-medium transition-colors hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
              >
                Réessayer
              </button>
            </span>
          )}
        </div>
        <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Source : données internes CarbuScope (1 814 stations recensées, tous réseaux confondus). Benchmark de référence :
          1 station pour 1 200 véhicules. L&apos;indice de saturation est mesuré à 5 km autour de chaque site ;
          le rayon d&apos;analyse ci-dessous délimite la zone concurrentielle prise en compte.
        </p>
      </div>

      {/* Sélecteur de rayon (A.5 : « rayon paramétrable ») */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Radar className="h-4 w-4 text-muted-foreground" aria-hidden />
            Rayon d&apos;analyse
          </div>
          <Slider
            min={2}
            max={30}
            step={1}
            value={[sliderVal]}
            onValueChange={(v) => setSliderVal(v[0] ?? sliderVal)}
            className="w-44 sm:w-60"
            aria-label="Rayon d'analyse en kilomètres"
          />
          <Badge variant="secondary" className="tabular-nums">{sliderVal} km</Badge>
          <span className="text-xs text-muted-foreground">
            Zone autour de vos stations dans laquelle les concurrents sont comptés.
          </span>
        </CardContent>
      </Card>

      {/* KPIs (A.5.1) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Concurrents recensés"
          value={num(shown.competitorsTotal)}
          icon={Building2}
          sub={`vs mes ${num(myStations)} stations`}
        />
        <KpiCard
          label="Concurrents dans ma zone"
          value={num(shown.competitorsInZone)}
          icon={Radar}
          sub={`rayon de ${shownRadius} km`}
        />
        <SaturationCard value={shown.saturationIndex} avgCompetitors={shown.avgCompetitorsPerStation} />
        <KpiCard
          label="Zones sous-desservies"
          value={num(shown.underservedZones.length)}
          icon={MapPinned}
          tone={shown.underservedZones.length > 0 ? "warning" : "success"}
          sub={topZone ? `manque le plus fort : ${topZone.gouvernorat} (−${num(topZone.deficit)})` : "aucune zone détectée"}
        />
      </div>

      {/* Graphiques (A.5.2) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Part de marché par enseigne</CardTitle>
            <CardDescription>Nombre de stations et part du parc national — centre : mon réseau.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <MarketShareDoughnut rows={shown.marketShare} mySlug={brandSlug} />
            <div className="flex w-full flex-wrap justify-center gap-x-4 gap-y-1.5">
              {shown.marketShare.map((r) => (
                <span key={r.slug} className="inline-flex items-center gap-1.5 text-[11px]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
                  <span className={cn("font-medium", r.slug === brandSlug && "text-foreground")}>{r.brand}</span>
                  <span className="tabular-nums text-muted-foreground">{fmtPct(r.sharePct)} · {num(r.stations)}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Densité de services concurrents</CardTitle>
            <CardDescription>Part des réseaux équipés, par service proposé.</CardDescription>
          </CardHeader>
          <CardContent>
            <ServicesDensityChart data={shown.servicesDensity} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Évolution des ouvertures concurrentes</CardTitle>
            <CardDescription>Ouvertures des 12 derniers mois, tous réseaux confondus.</CardDescription>
          </CardHeader>
          <CardContent>
            <OpeningsAreaChart months={shown.openingsEvolution.months} values={shown.openingsEvolution.values} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Zones sous-desservies</CardTitle>
            <CardDescription>
              Stations attendues = parc automobile ÷ 1 200 véhicules par station (benchmark national).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataViews
              viewKey="competition-zones"
              columns={ZONE_COLUMNS}
              rows={zones}
              rowKey={(z) => z.gouvernorat}
              emptyMessage="Aucune zone sous-desservie détectée à l&apos;échelle nationale."
              maxHeightClassName="max-h-72"
            />
          </CardContent>
        </Card>
      </div>

      {/* Concurrents proches (A.5.3) — DataViews : Tableau / Cartes / Arborescence par enseigne */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Concurrents les plus proches</CardTitle>
          <CardDescription>
            {shown.nearby.length} sites au plus fort trafic — cliquez sur une ligne pour localiser la station sur la
            carte · 3 modes d&apos;affichage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey="competition-nearby"
            columns={nearbyColumns}
            rows={shown.nearby}
            rowKey={(n) => n.myCode}
            emptyMessage="Aucun concurrent recensé à proximité de vos stations."
            onRowClick={(n) => locate(n.myCode)}
            nested={{
              groupKey: (n) => n.competitorBrand,
              groupLabel: (gk, grows) => {
                const color = grows[0]?.competitorColor ?? "#94a3b8"
                const avg = grows.reduce((s, n) => s + n.distanceKm, 0) / (grows.length || 1)
                const tensions = grows.filter((n) => n.status === "TENSION").length
                return (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                    {gk}
                    <span className="ml-1 text-[11px] font-normal text-primary/70">
                      — {grows.length} site{grows.length > 1 ? "s" : ""} · {fmtKm(avg)} de moyenne
                      {tensions > 0 ? ` · ${tensions} en tension` : ""}
                    </span>
                  </span>
                )
              },
              groupSortValue: (_gk, grows) => grows.length,
              hideColumnKeyInGroups: "competitorBrand",
              defaultOpen: "first",
            }}
            renderCard={(n) => {
              const d = distanceBadge(n.distanceKm)
              return (
                <Card
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                  onClick={() => locate(n.myCode)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Localiser ${n.myStation} sur la carte`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      locate(n.myCode)
                    }
                  }}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600" aria-hidden />
                          <span className="truncate">{n.myStation}</span>
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: n.competitorColor }} aria-hidden />
                          <span className="truncate">
                            {n.nearestCompetitor} · {n.competitorBrand}
                          </span>
                        </p>
                      </div>
                      <Badge variant="outline" className={NEARBY_STATUS_STYLES[n.status] ?? ""}>
                        {NEARBY_STATUS_LABELS[n.status] ?? n.status}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold tabular-nums">{fmtKm(n.distanceKm)}</span>
                      <Badge variant="outline" className={d.cls}>{d.label}</Badge>
                    </div>
                    {n.differentiators.length > 0 && (
                      <div className="mt-2">
                        <ServiceChips services={n.differentiators} max={4} showLabels />
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
