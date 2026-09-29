'use client'

// CarbuScope — Module A.2 « Tableau de bord »
// Objectif (cahier des charges) : donner en 10 secondes une vision complète
// de la situation. 5 KPIs, empreinte territoriale, fil d'alertes, 4 graphiques.

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TunisiaMap } from "@/components/map/tunisia-map"
import { KpiCard } from "@/components/shell/kpi-card"
import { SeverityBadge } from "@/components/shell/badges"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { useAppStore } from "@/store/app-store"
import { num, pct } from "@/lib/chart"
import {
  ALERT_TYPE_LABELS,
  type AlertDTO, type BrandDTO, type GouvernoratStatRow, type MarketShareRow,
  type MovementsStats, type OverviewStats, type ServicesEvolution, type StationDTO,
} from "@/lib/types"
import {
  Building2, PieChart, TriangleAlert, Gauge, BellRing, MapPin,
  ArrowRight, CalendarRange, Eye,
} from "lucide-react"
import { relativeDate, dateFr, sortByPriority } from "./dashboard-utils"
import { GouvBarChart, ServicesLineChart, MarketShareDonut, MovementsBarChart } from "./dashboard-charts"

const NO_STATIONS: StationDTO[] = []

type DashboardData = {
  brand: string
  overview: OverviewStats
  brands: BrandDTO[]
  gouv: GouvernoratStatRow[]
  services: ServicesEvolution
  market: MarketShareRow[]
  movements: MovementsStats
  stations: StationDTO[] // stations de l'enseigne + échantillon concurrent (dédupliqué par code)
}

export function DashboardTab() {
  const { brandSlug, setTab, setFocusStation } = useAppStore()
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [govFilter, setGovFilter] = useState("tous")

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const get = async <T,>(url: string): Promise<T> => {
        const r = await fetch(url, { signal })
        if (!r.ok) throw new Error(`API ${url} [${r.status}]`)
        return (await r.json()) as T
      }
      const [overview, brandsRes, gouvRes, servicesRes, marketRes, movementsRes, mineRes, allRes] = await Promise.all([
        get<OverviewStats>(`/api/stats/overview?brand=${encodeURIComponent(brandSlug)}`),
        get<{ brands: BrandDTO[] }>("/api/brands"),
        get<{ data: GouvernoratStatRow[] }>(`/api/stats/gouvernorats?brand=${encodeURIComponent(brandSlug)}`),
        get<ServicesEvolution>("/api/stats/services-evolution"),
        get<{ data: MarketShareRow[] }>("/api/stats/market-share"),
        get<MovementsStats>("/api/stats/movements"),
        get<{ stations: StationDTO[] }>(`/api/stations?brand=${encodeURIComponent(brandSlug)}&limit=400`),
        get<{ stations: StationDTO[] }>("/api/stations?limit=600"),
      ])
      // Mes stations en priorité + échantillon national pour le contraste (dédupliqué par code)
      const byCode = new Map<string, StationDTO>()
      for (const s of allRes.stations) byCode.set(s.code, s)
      for (const s of mineRes.stations) byCode.set(s.code, s)
      setData({
        brand: brandSlug,
        overview,
        brands: brandsRes.brands,
        gouv: gouvRes.data,
        services: servicesRes,
        market: marketRes.data,
        movements: movementsRes,
        stations: [...byCode.values()],
      })
      setError(null)
    } catch (e) {
      if (signal.aborted) return
      setError(e instanceof Error ? e.message : "Erreur inconnue")
    }
  }, [brandSlug])

  useEffect(() => {
    const ac = new AbortController()
    const t = setTimeout(() => { void load(ac.signal) }, 0)
    return () => { clearTimeout(t); ac.abort() }
  }, [load])

  const retry = useCallback(() => {
    void load(new AbortController().signal)
  }, [load])

  // Données courantes seulement si elles correspondent à l'enseigne connectée (dérivé au rendu)
  const current = data && data.brand === brandSlug ? data : null
  const stations = useMemo(() => current?.stations ?? NO_STATIONS, [current])
  const govs = useMemo(
    () => Array.from(new Set(stations.map(s => s.gouvernorat))).sort((a, b) => a.localeCompare(b, "fr")),
    [stations]
  )
  const mapStations = useMemo(
    () => (govFilter === "tous" ? stations : stations.filter(s => s.gouvernorat === govFilter)),
    [stations, govFilter]
  )

  if (error && !current) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState message={error} retry={retry} />
      </div>
    )
  }
  if (!current) return <TabSkeleton title="Chargement du tableau de bord…" />

  const brand = current.brands.find(b => b.slug === brandSlug)
  const brandName = brand?.name ?? brandSlug
  const brandColor = brand?.color ?? "#059669"
  const o = current.overview
  const feed = sortByPriority(o.alertsFeed).slice(0, 5)
  const myCount = mapStations.filter(s => s.brandSlug === brandSlug).length

  return (
    <motion.div
      className="space-y-4 p-4 md:p-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight md:text-2xl">
            Tableau de bord — {brandName}
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: brandColor }} aria-hidden />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vue d&apos;ensemble stratégique du réseau {brandName} et du marché tunisien du carburant.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 whitespace-nowrap">
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
          Période : 12 derniers mois
        </Badge>
      </div>

      {/* ---------- 5 KPIs (A.2.1) ---------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Stations de l'enseigne"
          value={num(o.myStations)}
          sub={`Part de marché ${pct(o.marketSharePct)}`}
          icon={Building2}
          tone="success"
          onClick={() => setTab("stations")}
        />
        <KpiCard
          label="Part de marché"
          value={pct(o.marketSharePct)}
          sub={`${num(o.totalNational)} stations au national`}
          icon={PieChart}
        />
        <KpiCard
          label="À rénover / sous tension"
          value={num(o.toRenovate + o.underTension)}
          sub={`${o.toRenovate} en rénovation · ${o.underTension} sous tension`}
          icon={TriangleAlert}
          tone="warning"
        />
        <KpiCard
          label="Trafic captif moyen"
          value={num(o.avgTraffic)}
          sub="véh./jour · stations actives"
          icon={Gauge}
          tone="info"
        />
        <KpiCard
          label="Alertes actives"
          value={num(o.alerts.total)}
          sub={`${o.alerts.critical} critiques · ${o.alerts.medium} moyens · ${o.alerts.info} info`}
          icon={BellRing}
          tone="danger"
          onClick={() => setTab("veille")}
        />
      </div>

      {/* ---------- Empreinte territoriale (A.2.2) + fil d'alertes (A.2.3) ---------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle>Empreinte territoriale</CardTitle>
                <CardDescription>
                  {num(mapStations.length)} stations affichées · {num(myCount)} {brandName} ·{" "}
                  {num(mapStations.length - myCount)} concurrentes
                </CardDescription>
              </div>
              <Select value={govFilter} onValueChange={setGovFilter}>
                <SelectTrigger size="sm" className="w-[190px]" aria-label="Filtrer par gouvernorat">
                  <MapPin className="h-3.5 w-3.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Tous les gouvernorats</SelectItem>
                  {govs.map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <TunisiaMap
              stations={mapStations}
              ownBrandSlug={brandSlug}
              fitTo={mapStations}
              showLayerControl={false}
              tools={false}
              className="h-[340px]"
              layers={{ traffic: false, projects: false, fleet: false, zones: true }}
              onViewDetail={(s) => {
                setFocusStation(s.code)
                setTab("map")
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle>Fil des dernières alertes</CardTitle>
                <CardDescription>Triées par priorité : critique &gt; moyen &gt; info</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => setTab("veille")}>
                Tout voir
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          {/* T53-T2 — liste sémantique (a11y, zéro changement visuel) */}
          <CardContent className="grid gap-2">
            <ul className="grid gap-2" aria-label="Dernières alertes actives">
              {feed.length === 0 && (
                <li className="py-8 text-center text-sm text-muted-foreground">Aucune alerte active pour le moment.</li>
              )}
              {feed.map(a => (
                <AlertRow key={a.id} alert={a} onSee={() => setTab("veille")} />
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* ---------- 4 graphiques (A.2.4) ---------- */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Répartition territoriale</CardTitle>
            <CardDescription>
              Stations {brandName} vs concurrentes — 12 premiers gouvernorats
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GouvBarChart rows={current.gouv} brandName={brandName} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Évolution des services</CardTitle>
            <CardDescription>
              Stations équipées sur 5 ans — 6 services les plus dynamiques
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ServicesLineChart data={current.services} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Part de marché par enseigne</CardTitle>
            <CardDescription>
              Répartition des {num(o.totalNational)} stations au niveau national
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MarketShareDonut rows={current.market} totalNational={o.totalNational} mySlug={brandSlug} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Mouvements concurrentiels</CardTitle>
            <CardDescription>
              Ouvertures, rénovations, fermetures et re-brandings — 12 derniers mois
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MovementsBarChart data={current.movements} />
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}

// ---------------- Ligne d'alerte du fil (A.2.3) ----------------

function AlertRow({ alert, onSee }: { alert: AlertDTO; onSee: () => void }) {
  return (
    <li className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
      <div className="flex items-center gap-2">
        <SeverityBadge severity={alert.severity} />
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {ALERT_TYPE_LABELS[alert.type] ?? String(alert.type)}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground" title={dateFr(alert.date)}>
          {relativeDate(alert.date)}
        </span>
      </div>
      <p className="mt-1.5 text-sm font-semibold leading-snug">{alert.title}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {alert.gouvernorat}
            {alert.brand ? ` · ${alert.brand}` : ""}
          </span>
        </p>
        <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-xs" onClick={onSee}>
          Voir
          <Eye className="h-3 w-3" />
        </Button>
      </div>
    </li>
  )
}
