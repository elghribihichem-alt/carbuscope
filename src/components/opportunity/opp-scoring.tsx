'use client'

// T51-b — Radar d'Opportunités / sous-module « 📊 Scoring d'opportunités » :
// 1. Score global — tableau triable/filtrable des 54 zones + vue carte
// 2. Critères de scoring — radar d'une zone + composantes empilées (top 15)
// 3. Top 50 zones — podium + classement numéroté
// 4. Alertes du radar — seuils, nouvelles zones, zones équipées (lecture)

import { useMemo, useState } from "react"
import {
  Bar, BarChart, CartesianGrid, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, Tooltip, XAxis, YAxis,
} from "recharts"
import { ArrowUpDown, Bell, BellRing, Eye, Filter, Gauge, Medal, Scale, Trophy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer } from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { KpiCard } from "@/components/shell/kpi-card"
import { useChartPalette } from "@/hooks/use-chart-palette"
import { tooltipStyle } from "@/lib/chart"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { OpportunitySettingDTO, OpportunityZoneDTO } from "@/lib/t51-dto"
import {
  FormatBadge, OppEmpty, OppError, ScoreBadge, ScoreBar, TunisiaBubbleMap, ZoneStatusBadge,
  criteriaMeta, oppNum, oppRelFr, oppScrollList, scoreTone, useAlerts,
  type BubblePoint,
} from "./opp-shared"

export interface OppScoringProps {
  zones: OpportunityZoneDTO[]
  settings: OpportunitySettingDTO | null
  brandSlug: string
}

type TipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }

const STATUS_RANK: Record<string, number> = { IDENTIFIEE: 0, QUALIFIEE: 1, ETUDE: 2, SIGNEE: 3, EQUIPEE: 4 }

/** En-tête de colonne triable (déclaré hors render — cf. react-hooks/static-components). */
function SortHead({
  k, label, sort, onToggle, className,
}: {
  k: SortKey
  label: string
  sort: { key: SortKey; dir: "asc" | "desc" }
  onToggle: (k: SortKey) => void
  className?: string
}) {
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onToggle(k)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
        aria-label={`Trier par ${label}`}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", sort.key === k ? "opacity-100" : "opacity-50")} aria-hidden />
      </button>
    </TableHead>
  )
}

const ALERT_META: Record<string, { label: string; cls: string; icon: typeof Bell }> = {
  SEUIL_ATTEINT: {
    label: "Seuil atteint",
    cls: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
    icon: Gauge,
  },
  NOUVELLE_ZONE: {
    label: "Nouvelle zone",
    cls: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
    icon: BellRing,
  },
  ZONE_EQUIPEE: {
    label: "Zone équipée",
    cls: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    icon: Medal,
  },
}

/* ======================= Onglet 1 — Score global ======================= */

type SortKey = "zoneName" | "gouvernorat" | "weightedScore" | "status" | "recommendedFormat"

function GlobalScoreTab({ zones }: { zones: OpportunityZoneDTO[] }) {
  const [gov, setGov] = useState("ALL")
  const [minScore, setMinScore] = useState(0)
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "weightedScore", dir: "desc" })

  const govs = useMemo(
    () => [...new Set(zones.map(z => z.gouvernorat))].sort((a, b) => a.localeCompare(b, "fr")),
    [zones]
  )

  const rows = useMemo(() => {
    const filtered = zones.filter(z => (gov === "ALL" || z.gouvernorat === gov) && z.weightedScore >= minScore)
    const dir = sort.dir === "desc" ? -1 : 1
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case "zoneName":
          return dir * a.zoneName.localeCompare(b.zoneName, "fr")
        case "gouvernorat":
          return dir * (a.gouvernorat.localeCompare(b.gouvernorat, "fr") || a.zoneName.localeCompare(b.zoneName, "fr"))
        case "status":
          return dir * ((STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0))
        case "recommendedFormat":
          return dir * a.recommendedFormat.localeCompare(b.recommendedFormat)
        default:
          return dir * (a.weightedScore - b.weightedScore)
      }
    })
  }, [zones, gov, minScore, sort])

  const toggleSort = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }))

  const points: BubblePoint[] = rows.map(z => ({
    lat: z.lat,
    lng: z.lng,
    value: z.weightedScore,
    label: `${z.zoneName} (${z.delegation})`,
    sub: `${z.gouvernorat} · statut ${z.status} · ${z.recommendedFormat}`,
    tone: scoreTone(z.weightedScore),
  }))

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Filter className="h-3.5 w-3.5" aria-hidden /> Filtres
            </p>
            <Select value={gov} onValueChange={setGov}>
              <SelectTrigger className="w-[240px]" aria-label="Filtrer par gouvernorat">
                <SelectValue placeholder="Gouvernorat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les gouvernorats ({zones.length})</SelectItem>
                {govs.map(g => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              Score minimal : <span className="font-semibold tabular-nums text-foreground">≥ {minScore}</span>
            </p>
            <Slider
              value={[minScore]}
              min={0}
              max={100}
              step={5}
              onValueChange={v => setMinScore(v[0] ?? 0)}
              className="w-[240px]"
              aria-label="Seuil minimal de score"
            />
          </div>
          <Badge variant="secondary" className="h-6 px-2.5 tabular-nums">
            {rows.length} zone{rows.length > 1 ? "s" : ""} affichée{rows.length > 1 ? "s" : ""}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Score pondéré par zone</CardTitle>
            <CardDescription>
              Note /100 = somme pondérée des 5 critères (poids du paramétrage enseigne / Super Admin).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={cn(oppScrollList, "max-h-[28rem]")}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead k="zoneName" label="Zone" sort={sort} onToggle={toggleSort} />
                    <SortHead k="gouvernorat" label="Gouvernorat" sort={sort} onToggle={toggleSort} />
                    <SortHead k="weightedScore" label="Score pondéré" sort={sort} onToggle={toggleSort} />
                    <SortHead k="status" label="Statut" sort={sort} onToggle={toggleSort} />
                    <SortHead k="recommendedFormat" label="Format" sort={sort} onToggle={toggleSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(z => (
                    <TableRow key={z.id}>
                      <TableCell className="py-2">
                        <p className="text-sm font-medium">{z.zoneName}</p>
                        <p className="text-[11px] text-muted-foreground">{z.delegation}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{z.gouvernorat}</TableCell>
                      <TableCell className="py-2">
                        <div className="flex min-w-[120px] flex-col gap-1">
                          <ScoreBadge score={z.weightedScore} />
                          <ScoreBar value={z.weightedScore} />
                        </div>
                      </TableCell>
                      <TableCell><ZoneStatusBadge status={z.status} /></TableCell>
                      <TableCell><FormatBadge format={z.recommendedFormat} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Aucune zone ne correspond aux filtres sélectionnés.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Vue carte — score pondéré</CardTitle>
            <CardDescription>Taille des bulles = score, couleur par palier (70/55).</CardDescription>
          </CardHeader>
          <CardContent>
            <TunisiaBubbleMap
              points={points}
              height={640}
              valueLabel="Score"
              ariaLabel="Carte des scores pondérés par zone"
              legend={[
                { tone: "ok", label: "Score ≥ 70" },
                { tone: "warning", label: "Score 55-69" },
                { tone: "danger", label: "Score < 55" },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ======================= Onglet 2 — Critères de scoring ======================= */

function CriteriaTab({ zones, settings }: { zones: OpportunityZoneDTO[]; settings: OpportunitySettingDTO | null }) {
  const criteria = useMemo(() => criteriaMeta(settings), [settings])
  const sorted = useMemo(() => [...zones].sort((a, b) => b.weightedScore - a.weightedScore), [zones])
  const [zoneId, setZoneId] = useState<string>("")
  const zone = zones.find(z => z.id === zoneId) ?? sorted[0]

  const palette = useChartPalette()

  const radarData = zone
    ? criteria.map(c => ({ critere: c.label, valeur: Math.round((zone[c.key] as number) ?? 0) }))
    : []

  const stackRows = useMemo(
    () =>
      sorted.slice(0, 15).map(z => {
        const row: Record<string, number | string> = { zone: z.zoneName }
        for (const c of criteria) row[c.label] = Math.round(((z[c.key] as number) ?? 0) * c.weight)
        return row
      }),
    [sorted, criteria]
  )

  const renderRadarTip = (props: TipProps) => {
    if (!props.active || !props.payload?.length) return null
    const row = props.payload[0]?.payload as { critere: string; valeur: number } | undefined
    if (!row) return null
    return (
      <div className="px-3 py-2 text-xs" style={tooltipStyle()}>
        <p className="font-medium text-popover-foreground">{row.critere}</p>
        <p className="tabular-nums text-muted-foreground">
          Score : <span className="font-semibold text-popover-foreground">{row.valeur}/100</span>
        </p>
      </div>
    )
  }

  const renderStackTip = (props: TipProps) => {
    if (!props.active || !props.payload?.length) return null
    const row = props.payload[0]?.payload as Record<string, number | string> | undefined
    if (!row) return null
    const total = criteria.reduce((s, c) => s + (Number(row[c.label]) || 0), 0)
    return (
      <div className="px-3 py-2 text-xs" style={tooltipStyle()}>
        <p className="mb-1 font-medium text-popover-foreground">{row.zone}</p>
        {criteria.map((c, i) => (
          <div key={c.key} className="flex items-center justify-between gap-6">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.color(i + 1) }} aria-hidden />
              {c.label}
            </span>
            <span className="font-semibold tabular-nums text-popover-foreground">
              {(Number(row[c.label]) || 0).toLocaleString("fr-FR")}
            </span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between gap-6 border-t pt-1">
          <span className="text-muted-foreground">Total pondéré</span>
          <span className="font-semibold tabular-nums text-popover-foreground">{Math.round(total)}</span>
        </div>
      </div>
    )
  }

  if (sorted.length === 0) return <OppEmpty icon={Scale} title="Aucune zone à scorer" />

  return (
    <div className="space-y-4">
      {/* Poids des 5 critères */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {criteria.map((c, i) => (
          <Card key={c.key} className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ backgroundColor: palette.color(i + 1) }}
              >
                {Math.round(c.weight * 100)} %
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{c.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {zone ? `${Math.round((zone[c.key] as number) ?? 0)}/100 sur la zone sélectionnée` : "poids du paramétrage"}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Composantes pondérées — 15 premières zones</CardTitle>
            <CardDescription>
              Chaque segment = note du critère × poids · la largeur totale approche le score pondéré.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[480px]" role="img" aria-label="Composantes de score des 15 premières zones">
              <ChartContainer config={{}} className="aspect-auto h-full w-full">
                <BarChart data={stackRows} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={palette.grid} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: palette.axis }}
                  />
                  <YAxis
                    type="category"
                    dataKey="zone"
                    width={132}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: palette.axis }}
                  />
                  <Tooltip content={renderStackTip} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                  {criteria.map((c, i) => (
                    <Bar
                      key={c.key}
                      dataKey={c.label}
                      stackId="comp"
                      fill={palette.color(i + 1)}
                      maxBarSize={13}
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
              <Gauge className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
              Profil d&apos;une zone
            </CardTitle>
            <CardDescription>Radar des 5 critères (0-100).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={zone?.id ?? ""} onValueChange={setZoneId}>
              <SelectTrigger aria-label="Sélectionner une zone">
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                {sorted.slice(0, 60).map(z => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.zoneName} — {z.gouvernorat} ({z.weightedScore}/100)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {zone && (
              <>
                <div className="mx-auto aspect-square h-auto w-full max-w-[320px]" role="img" aria-label={`Radar des critères de ${zone.zoneName}`}>
                  <ChartContainer config={{}} className="aspect-square h-full w-full">
                    <RadarChart data={radarData} outerRadius="72%">
                      <PolarGrid strokeDasharray="3 3" />
                      <PolarAngleAxis dataKey="critere" tick={{ fontSize: 10, fill: palette.axis }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: palette.axis }} angle={90} />
                      <Tooltip content={renderRadarTip} />
                      <Radar
                        dataKey="valeur"
                        name={zone.zoneName}
                        stroke={palette.color(1)}
                        fill={palette.color(1)}
                        fillOpacity={0.35}
                        strokeWidth={2}
                      />
                    </RadarChart>
                  </ChartContainer>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">{zone.zoneName}</span> ({zone.delegation}, {zone.gouvernorat}) —
                  parc {zone.scorePark}/100, pouvoir d&apos;achat {zone.scorePower}/100, trafic {zone.scoreTraffic}/100,
                  concurrence {zone.scoreCompetition}/100, foncier {zone.scoreFoncier}/100.
                  Score pondéré global : <span className="font-semibold text-foreground">{zone.weightedScore}/100</span>.
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ======================= Onglet 3 — Top 50 zones ======================= */

const PODIUM_STYLES = [
  "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/60",
  "border-stone-400 bg-stone-100 dark:border-stone-600 dark:bg-stone-800/60",
  "border-orange-400 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/60",
]

function TopZonesTab({ zones }: { zones: OpportunityZoneDTO[] }) {
  const top = useMemo(() => [...zones].sort((a, b) => b.weightedScore - a.weightedScore).slice(0, 50), [zones])
  if (top.length === 0) return <OppEmpty icon={Trophy} title="Aucune opportunité classée" />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {top.slice(0, 3).map((z, i) => (
          <Card key={z.id} className={cn("relative overflow-hidden transition-shadow hover:shadow-md", PODIUM_STYLES[i])}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-current text-sm font-bold" aria-hidden>
                    {i + 1}
                  </span>
                  {i === 0 && <Trophy className="h-5 w-5 text-amber-500" aria-hidden />}
                  {i === 1 && <Medal className="h-5 w-5 text-stone-400 dark:text-stone-500" aria-hidden />}
                  {i === 2 && <Medal className="h-5 w-5 text-orange-500" aria-hidden />}
                </div>
                <ScoreBadge score={z.weightedScore} />
              </div>
              <p className="mt-2 truncate text-base font-bold">{z.zoneName}</p>
              <p className="truncate text-xs text-muted-foreground">{z.delegation} · {z.gouvernorat}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <FormatBadge format={z.recommendedFormat} />
                <ZoneStatusBadge status={z.status} />
                <Badge variant="outline" className="px-2 tabular-nums text-muted-foreground">
                  {oppNum(z.vehicles)} véh.
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Classement des {top.length} meilleures opportunités</CardTitle>
          <CardDescription>Par score pondéré décroissant · cliquez sur une ligne pour repérer la zone sur la carte.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className={cn(oppScrollList, "max-h-[28rem] space-y-1")}>
            {top.map((z, i) => (
              <li key={z.id}>
                <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-muted/50">
                  <span className="w-7 shrink-0 text-right text-sm font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{z.zoneName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {z.delegation} · {z.gouvernorat} · TMJ {oppNum(z.trafficDaily)} véh/j
                    </p>
                  </div>
                  <div className="hidden shrink-0 sm:block"><FormatBadge format={z.recommendedFormat} /></div>
                  <div className="w-24 shrink-0">
                    <ScoreBadge score={z.weightedScore} />
                    <ScoreBar value={z.weightedScore} className="mt-1" />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}

/* ======================= Onglet 4 — Alertes du radar ======================= */

function AlertsTab() {
  const { alerts, error, markRead, markAllRead } = useAlerts()
  const [filter, setFilter] = useState<"all" | "unread">("all")

  const shown = useMemo(() => {
    if (!alerts) return null
    return filter === "unread" ? alerts.filter(a => !a.read) : alerts
  }, [alerts, filter])

  const unreadCount = alerts?.filter(a => !a.read).length ?? 0

  const onMarkAll = async () => {
    await markAllRead()
    toast.success("Toutes les alertes ont été marquées comme lues.")
  }

  if (error) return <OppError message={error} />
  if (!alerts) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6" aria-busy="true" aria-label="Chargement des alertes…">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Alertes non lues" value={unreadCount} icon={BellRing} tone={unreadCount > 0 ? "warning" : "success"} sub="seuils, nouvelles zones, zones équipées" />
        <KpiCard label="Alertes (30 derniers jours)" value={alerts.length} icon={Bell} sub="fil du radar d'opportunités" />
        <KpiCard
          label="Meilleur score signalé"
          value={alerts.length ? `${Math.max(...alerts.map(a => a.score))}/100` : "—"}
          icon={Gauge}
          tone="info"
          sub="parmi les alertes du fil"
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bell className="h-4 w-4 text-amber-600" aria-hidden />
              Fil des alertes
            </CardTitle>
            <CardDescription>Alertes SEUIL_ATTEINT · NOUVELLE_ZONE · ZONE_EQUIPEE générées par le moteur du radar.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border" role="group" aria-label="Filtre des alertes">
              {(["all", "unread"] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    filter === f ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                  aria-pressed={filter === f}
                >
                  {f === "all" ? `Toutes (${alerts.length})` : `Non lues (${unreadCount})`}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={onMarkAll} disabled={unreadCount === 0} className="gap-1.5">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              Tout marquer comme lu
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {shown && shown.length === 0 ? (
            <OppEmpty icon={Bell} title="Aucune alerte dans ce fil">
              {filter === "unread" ? "Toutes les alertes ont été lues." : "Le moteur du radar n'a émis aucune alerte."}
            </OppEmpty>
          ) : (
            <ul className={cn(oppScrollList, "max-h-[28rem] space-y-2")}>
              {(shown ?? []).map(a => {
                const meta = ALERT_META[a.type] ?? {
                  label: a.type,
                  cls: "border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300",
                  icon: Bell,
                }
                return (
                  <li
                    key={a.id}
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                      a.read ? "bg-card opacity-75" : "border-amber-300/70 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-950/40"
                    )}
                  >
                    <Badge variant="outline" className={cn("gap-1.5 px-2", meta.cls)}>
                      <meta.icon className="h-3 w-3" aria-hidden />
                      {meta.label}
                    </Badge>
                    <p className="min-w-0 flex-1 text-sm leading-snug">{a.message}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      {a.score > 0 && <ScoreBadge score={a.score} />}
                      <span className="text-[11px] tabular-nums text-muted-foreground">{oppRelFr(a.createdAt)}</span>
                      {!a.read && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1.5 px-2 text-xs"
                          onClick={() => {
                            void markRead(a.id)
                            toast.success("Alerte marquée comme lue.")
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden /> Lire
                        </Button>
                      )}
                      {a.read && <span className="text-[11px] text-muted-foreground">lue</span>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ======================= Sous-module Scoring ======================= */

export function OppScoring({ zones, settings }: OppScoringProps) {
  const [tab, setTab] = useState("global")

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
        <TabsTrigger value="global">Score global</TabsTrigger>
        <TabsTrigger value="criteres">Critères de scoring</TabsTrigger>
        <TabsTrigger value="top50">Top 50 zones</TabsTrigger>
        <TabsTrigger value="alertes">Alerte nouvelle zone</TabsTrigger>
      </TabsList>
      <TabsContent value="global" className="mt-0 space-y-4">
        <GlobalScoreTab zones={zones} />
      </TabsContent>
      <TabsContent value="criteres" className="mt-0 space-y-4">
        <CriteriaTab zones={zones} settings={settings} />
      </TabsContent>
      <TabsContent value="top50" className="mt-0 space-y-4">
        <TopZonesTab zones={zones} />
      </TabsContent>
      <TabsContent value="alertes" className="mt-0 space-y-4">
        <AlertsTab />
      </TabsContent>
    </Tabs>
  )
}
