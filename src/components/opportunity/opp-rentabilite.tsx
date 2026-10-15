'use client'

// T51-b — Radar d'Opportunités / sous-module « 📈 Simulations de rentabilité » :
// 1. Business plan 5 ans (LineChart CA / charges / net)
// 2. Break-even (cumul du net vs investissement, AreaChart + lignes de repère)
// 3. Scénarios pessimiste / réaliste / optimiste (cartes + barres groupées)
// 4. Impact marketing (nouveaux clients fidélisables, donut, leviers)
// Les simulations viennent de /api/opportunity/etude (générées avec l'étude).

import { useMemo, useState } from "react"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, Tooltip, XAxis, YAxis,
} from "recharts"
import {
  Activity, Calculator, HeartHandshake, LineChart as LineChartIcon, Loader2, Megaphone, Percent, PieChart as PieChartIcon,
  Repeat, Target, Timer, TrendingDown, TrendingUp, Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer } from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { KpiCard } from "@/components/shell/kpi-card"
import { useChartPalette } from "@/hooks/use-chart-palette"
import { tooltipStyle } from "@/lib/chart"
import { toast } from "sonner"
import { SCENARIO_LABELS, type OpportunityZoneDTO, type RentabilitySimulationDTO } from "@/lib/t51-dto"
import {
  OppEmpty, OppError, ScoreBadge, TONE_HEX, oppDt, oppNum, useEtude, type OppTone,
} from "./opp-shared"

export interface OppRentabiliteProps {
  zones: OpportunityZoneDTO[]
  brandSlug: string
}

const SCEN_TONE: Record<string, OppTone> = { OPTIMISTE: "ok", REALISTE: "warning", PESSIMISTE: "danger" }
const SCEN_ORDER = ["PESSIMISTE", "REALISTE", "OPTIMISTE"]

interface YearRow {
  annee: number
  ca: number
  charges: number
  net: number
}

/** Projection 5 ans : CA à growthPct, charges indexées à moitié de la croissance. */
function projectYears(sim: RentabilitySimulationDTO): YearRow[] {
  const g = sim.growthPct / 100
  const halfG = g / 2
  const rows: YearRow[] = []
  for (let y = 1; y <= 5; y++) {
    const ca = sim.caYear1 * Math.pow(1 + g, y - 1)
    const charges = sim.chargesAnnual * Math.pow(1 + halfG, y - 1)
    rows.push({ annee: y, ca: Math.round(ca), charges: Math.round(charges), net: Math.round(ca - charges) })
  }
  return rows
}

/** Cumul mensuel du bénéfice net sur 5 ans (interpolation linéaire intra-année). */
function monthlyCumul(rows: YearRow[]): { mois: number; cumul: number }[] {
  const out: { mois: number; cumul: number }[] = []
  let c = 0
  for (const r of rows) {
    for (let m = 0; m < 12; m++) {
      c += r.net / 12
      out.push({ mois: out.length + 1, cumul: Math.round(c) })
    }
  }
  return out
}

const fmtAxisDt = (v: number): string =>
  Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`
  : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)} K`
  : `${Math.round(v)}`

function scenarioOf(sims: RentabilitySimulationDTO[], key: string): RentabilitySimulationDTO | undefined {
  return sims.find(s => s.scenario === key)
}

/* ======================= Onglet 1 — Business plan 5 ans ======================= */

function BusinessPlanTab({
  zone, sims,
}: {
  zone: OpportunityZoneDTO | undefined
  sims: RentabilitySimulationDTO[]
}) {
  const [scen, setScen] = useState("REALISTE")
  const palette = useChartPalette()
  const sim = scenarioOf(sims, scen)
  const rows = useMemo(() => (sim ? projectYears(sim) : []), [sim])

  if (!sim) return <OppEmpty icon={Calculator} title="Aucune simulation disponible" />

  const chartRows = rows.map(r => ({
    annee: `An ${r.annee}`,
    "Chiffre d'affaires": r.ca,
    "Charges": r.charges,
    "Bénéfice net": r.net,
  }))

  const renderTip = (props: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) => {
    if (!props.active || !props.payload?.length) return null
    const row = props.payload[0]?.payload as (typeof chartRows)[number] | undefined
    if (!row) return null
    return (
      <div className="px-3 py-2 text-xs" style={tooltipStyle()}>
        <p className="mb-1 font-medium text-popover-foreground">{row.annee}</p>
        {(["Chiffre d'affaires", "Charges", "Bénéfice net"] as const).map(k => (
          <div key={k} className="flex items-center justify-between gap-6">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-semibold tabular-nums text-popover-foreground">{oppDt(row[k])}</span>
          </div>
        ))}
      </div>
    )
  }

  const last = rows[rows.length - 1]
  const marge5 = last && last.ca > 0 ? Math.round((last.net / last.ca) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="CA an 1" value={oppDt(sim.caYear1)} icon={TrendingUp} tone="info" sub={`croissance ${sim.growthPct} %/an`} />
        <KpiCard label="CA an 5" value={oppDt(last?.ca ?? 0)} icon={Activity} sub="projection du scénario sélectionné" />
        <KpiCard label="Bénéfice net an 5" value={oppDt(sim.netYear5)} icon={Calculator} tone="success" sub={`marge an 5 ≈ ${marge5} %`} />
        <KpiCard label="Investissement" value={oppDt(sim.investment)} icon={Timer} tone="warning" sub={`remboursement en ${sim.breakEvenMonths} mois`} />
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between space-y-0 gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <LineChartIcon className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
              Business plan 5 ans — {zone?.zoneName ?? "zone"}
            </CardTitle>
            <CardDescription>
              Projection CA / charges / bénéfice net (DT) · hypothèse : charges indexées à la moitié de la croissance.
            </CardDescription>
          </div>
          <Select value={scen} onValueChange={setScen}>
            <SelectTrigger className="w-[210px]" aria-label="Scénario du business plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCEN_ORDER.map(k => (
                <SelectItem key={k} value={k}>{SCENARIO_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="h-[340px]" role="img" aria-label="Business plan sur 5 ans">
            <ChartContainer config={{}} className="aspect-auto h-full w-full">
              <LineChart data={chartRows} margin={{ top: 4, right: 12, left: -4, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.grid} />
                <XAxis dataKey="annee" tick={{ fontSize: 11, fill: palette.axis }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: palette.axis }}
                  tickFormatter={fmtAxisDt}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip content={renderTip} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
                <Line dataKey="Chiffre d'affaires" stroke={palette.color(2)} strokeWidth={2.5} dot={{ r: 3 }} />
                <Line dataKey="Charges" stroke={palette.color(5)} strokeWidth={2} strokeDasharray="5 3" dot={false} />
                <Line dataKey="Bénéfice net" stroke={palette.color(3)} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ======================= Onglet 2 — Break-even ======================= */

function BreakEvenTab({ sims }: { sims: RentabilitySimulationDTO[] }) {
  const [scen, setScen] = useState("REALISTE")
  const palette = useChartPalette()
  const sim = scenarioOf(sims, scen)
  const cumulRows = useMemo(() => (sim ? monthlyCumul(projectYears(sim)) : []), [sim])

  if (!sim) return <OppEmpty icon={Timer} title="Aucune simulation disponible" />

  const renderTip = (props: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) => {
    if (!props.active || !props.payload?.length) return null
    const row = props.payload[0]?.payload as { mois: number; cumul: number } | undefined
    if (!row) return null
    return (
      <div className="px-3 py-2 text-xs" style={tooltipStyle()}>
        <p className="font-medium text-popover-foreground">Mois {row.mois}</p>
        <p className="tabular-nums text-muted-foreground">
          Cumul du net : <span className="font-semibold text-popover-foreground">{oppDt(row.cumul)}</span>
        </p>
      </div>
    )
  }

  const gradientId = "be-grad"

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {SCEN_ORDER.map(k => {
          const s = scenarioOf(sims, k)
          if (!s) return null
          const be = s.breakEvenMonths >= 999 ? "au-delà de 5 ans" : `${s.breakEvenMonths} mois`
          const tone = SCEN_TONE[k]
          return (
            <Card key={k} className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{SCENARIO_LABELS[k]}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    investissement {oppDt(s.investment)} · marge an 1 {oppDt(s.caYear1 - s.chargesAnnual)}
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold text-white tabular-nums"
                  style={{ backgroundColor: TONE_HEX[tone] }}
                >
                  {be}
                </span>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between space-y-0 gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
              Cumul du bénéfice net vs investissement
            </CardTitle>
            <CardDescription>
              L&apos;aire franchit la ligne d&apos;investissement au mois {sim.breakEvenMonths >= 999 ? "?" : sim.breakEvenMonths} —
              point mort de {SCENARIO_LABELS[scen].toLowerCase()}.
            </CardDescription>
          </div>
          <Select value={scen} onValueChange={setScen}>
            <SelectTrigger className="w-[210px]" aria-label="Scénario du break-even">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCEN_ORDER.map(k => (
                <SelectItem key={k} value={k}>{SCENARIO_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="h-[340px]" role="img" aria-label="Cumul du bénéfice net mensuel contre la ligne d'investissement">
            <ChartContainer config={{}} className="aspect-auto h-full w-full">
              <AreaChart data={cumulRows} margin={{ top: 4, right: 12, left: -4, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={palette.color(3)} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={palette.color(3)} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.grid} />
                <XAxis
                  dataKey="mois"
                  type="number"
                  domain={[1, 60]}
                  ticks={[1, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60]}
                  tick={{ fontSize: 10, fill: palette.axis }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: palette.axis }}
                  tickFormatter={fmtAxisDt}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip content={renderTip} />
                <ReferenceLine
                  y={sim.investment}
                  stroke={TONE_HEX.danger}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  label={{ value: `Investissement ${oppDt(sim.investment)}`, position: "insideTopRight", fontSize: 10, fill: TONE_HEX.danger }}
                />
                {sim.breakEvenMonths < 999 && (
                  <ReferenceLine
                    x={sim.breakEvenMonths}
                    stroke={palette.color(3)}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    label={{ value: `Mois ${sim.breakEvenMonths}`, position: "insideTop", fontSize: 10, fill: palette.color(3) }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="cumul"
                  name="Cumul du net"
                  stroke={palette.color(3)}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ======================= Onglet 3 — Scénarios ======================= */

function ScenariosTab({ sims }: { sims: RentabilitySimulationDTO[] }) {
  const palette = useChartPalette()
  const chartRows = SCEN_ORDER.map(k => {
    const s = scenarioOf(sims, k)
    return {
      scenar: SCENARIO_LABELS[k] ?? k,
      "CA an 1": s?.caYear1 ?? 0,
      "CA an 5": s ? Math.round(s.caYear1 * Math.pow(1 + s.growthPct / 100, 4)) : 0,
      "Bénéfice net an 5": s?.netYear5 ?? 0,
    }
  })

  const renderTip = (props: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) => {
    if (!props.active || !props.payload?.length) return null
    const row = props.payload[0]?.payload as (typeof chartRows)[number] | undefined
    if (!row) return null
    return (
      <div className="px-3 py-2 text-xs" style={tooltipStyle()}>
        <p className="mb-1 font-medium text-popover-foreground">{row.scenar}</p>
        {(["CA an 1", "CA an 5", "Bénéfice net an 5"] as const).map(k => (
          <div key={k} className="flex items-center justify-between gap-6">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-semibold tabular-nums text-popover-foreground">{oppDt(row[k])}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {SCEN_ORDER.map(k => {
          const s = scenarioOf(sims, k)
          if (!s) return null
          const tone = SCEN_TONE[k]
          const be = s.breakEvenMonths >= 999 ? "> 5 ans" : `${s.breakEvenMonths} mois`
          return (
            <Card key={k} className="border-t-4 transition-shadow hover:shadow-md" style={{ borderTopColor: TONE_HEX[tone] }}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-bold">
                    {k === "OPTIMISTE" ? <TrendingUp className="h-4 w-4" style={{ color: TONE_HEX[tone] }} aria-hidden /> : null}
                    {k === "PESSIMISTE" ? <TrendingDown className="h-4 w-4" style={{ color: TONE_HEX[tone] }} aria-hidden /> : null}
                    {SCENARIO_LABELS[k]}
                  </p>
                  <Badge variant="outline" className="px-2 tabular-nums text-muted-foreground">
                    <Percent className="mr-1 h-3 w-3" aria-hidden />{s.growthPct} %/an
                  </Badge>
                </div>
                <div className="space-y-2">
                  {[
                    { label: "CA an 1", value: oppDt(s.caYear1) },
                    { label: "Bénéfice net an 5", value: oppDt(s.netYear5) },
                    { label: "Break-even", value: be },
                    { label: "Nouveaux clients", value: `${oppNum(s.newClients)} clients` },
                  ].map(r => (
                    <div key={r.label} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-1.5 text-sm">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className="font-bold tabular-nums">{r.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Projection comparée des 3 scénarios</CardTitle>
          <CardDescription>CA an 1 / CA an 5 / bénéfice net an 5 en dinars tunisiens.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]" role="img" aria-label="Barres groupées des scénarios">
            <ChartContainer config={{}} className="aspect-auto h-full w-full">
              <BarChart data={chartRows} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.grid} />
                <XAxis dataKey="scenar" tick={{ fontSize: 11, fill: palette.axis }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: palette.axis }} tickFormatter={fmtAxisDt} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={renderTip} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
                <Bar dataKey="CA an 1" fill={palette.color(2)} radius={[3, 3, 0, 0]} maxBarSize={30} />
                <Bar dataKey="CA an 5" fill={palette.color(1)} radius={[3, 3, 0, 0]} maxBarSize={30} />
                <Bar dataKey="Bénéfice net an 5" fill={palette.color(3)} radius={[3, 3, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ======================= Onglet 4 — Impact marketing ======================= */

const LEVIERS = [
  {
    icon: HeartHandshake,
    title: "Programme de fidélité",
    text: "Carte fidélité enseigne : chaque vidange et chaque diagnostic cumulent des points (paliers Bronze → Platine), redeemables en prestations. Objectif : 40 % de clients récurrents sur 3 ans.",
  },
  {
    icon: Repeat,
    title: "Conversions vers stations",
    text: "Le micro-hub détecte les besoins hors périmètre (carburant, lavage, boutique) et oriente le client vers la station enseigne la plus proche — conversions tracées dans le module Mobility Hub.",
  },
  {
    icon: Megaphone,
    title: "Promotions de lancement",
    text: "Offre d'ouverture (vidange + diagnostic offerts), partenariats flottes locales et taxis, communication géociblée dans un rayon de 10 km autour du point.",
  },
] as const

function MarketingTab({ sims }: { sims: RentabilitySimulationDTO[] }) {
  const palette = useChartPalette()
  const donutRows = SCEN_ORDER.map(k => {
    const s = scenarioOf(sims, k)
    return { name: SCENARIO_LABELS[k] ?? k, value: s?.newClients ?? 0, tone: SCEN_TONE[k] }
  }).filter(r => r.value > 0)
  const total = donutRows.reduce((s, r) => s + r.value, 0)

  const renderTip = (props: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) => {
    if (!props.active || !props.payload?.length) return null
    const row = props.payload[0]?.payload as { name: string; value: number } | undefined
    if (!row) return null
    return (
      <div className="px-3 py-2 text-xs" style={tooltipStyle()}>
        <p className="font-medium text-popover-foreground">{row.name}</p>
        <p className="tabular-nums text-muted-foreground">
          {oppNum(row.value)} clients · {total > 0 ? Math.round((row.value / total) * 100) : 0} %
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SCEN_ORDER.map(k => {
          const s = scenarioOf(sims, k)
          if (!s) return null
          const tone = SCEN_TONE[k]
          return (
            <KpiCard
              key={k}
              label={`Nouveaux clients — ${SCENARIO_LABELS[k].toLowerCase()}`}
              value={oppNum(s.newClients)}
              icon={Users}
              tone={k === "OPTIMISTE" ? "success" : k === "REALISTE" ? "info" : "warning"}
              sub={`fidélisables sur 30 jours · ${k === "OPTIMISTE" ? "0,038" : k === "REALISTE" ? "0,030" : "0,022"} véh. TMJ/jour`}
            />
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <PieChartIcon className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
              Répartition du potentiel
            </CardTitle>
            <CardDescription>Part de chaque scénario dans le total de clients fidélisables.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="relative h-56 w-full max-w-[220px] shrink-0" role="img" aria-label="Répartition des nouveaux clients par scénario">
              <ChartContainer config={{}} className="aspect-square h-full w-full">
                <PieChart>
                  <Tooltip content={renderTip} />
                  <Pie
                    data={donutRows}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="58%"
                    outerRadius="86%"
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                  >
                    {donutRows.map(r => (
                      <Cell key={r.name} fill={TONE_HEX[r.tone]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-xl font-bold tabular-nums leading-none">{oppNum(total)}</p>
                <p className="mt-1 text-center text-[10px] uppercase leading-tight tracking-wide text-muted-foreground">
                  clients<br />fidélisables
                </p>
              </div>
            </div>
            <ul className="w-full space-y-1.5 text-xs">
              {donutRows.map(r => (
                <li key={r.name} className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TONE_HEX[r.tone] }} aria-hidden />
                    {r.name}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {oppNum(r.value)} · {total > 0 ? Math.round((r.value / total) * 100) : 0} %
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-amber-700 dark:text-amber-500" aria-hidden />
              Leviers marketing du point de service
            </CardTitle>
            <CardDescription>Dispositifs déployés par l&apos;enseigne pour transformer le trafic en clientèle fidèle.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {LEVIERS.map(l => (
              <div key={l.title} className="flex gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <l.icon className="h-4.5 w-4.5" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{l.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{l.text}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ======================= Sous-module Rentabilité ======================= */

export function OppRentabilite({ zones, brandSlug }: OppRentabiliteProps) {
  const [tab, setTab] = useState("plan")
  const sorted = useMemo(() => [...zones].sort((a, b) => b.scoreGlobal - a.scoreGlobal), [zones])
  const withSims = useMemo(() => sorted.filter(z => z.hasStudy), [sorted])
  const [zoneId, setZoneId] = useState<string>("")
  const zone = zones.find(z => z.id === zoneId) ?? withSims[0] ?? sorted[0]
  const etude = useEtude(zone?.id ?? null)
  const sims = etude.data?.simulations ?? []

  const onGenerate = async () => {
    if (!zone) return
    const ok = await etude.generate(brandSlug)
    if (ok) toast.success(`Simulations générées pour ${zone.zoneName} (3 scénarios).`)
    else toast.error("La génération des simulations a échoué — réessayez.")
  }

  if (sorted.length === 0) return <OppEmpty icon={Calculator} title="Aucune zone disponible" />

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Zone simulée</p>
              <Select value={zone?.id ?? ""} onValueChange={setZoneId}>
                <SelectTrigger className="w-[320px]" aria-label="Sélectionner la zone simulée">
                  <SelectValue placeholder="Zone" />
                </SelectTrigger>
                <SelectContent>
                  {sorted.slice(0, 60).map(z => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.zoneName} — {z.gouvernorat} · {z.scoreGlobal}/100{z.hasStudy ? " · simulations ✓" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {zone && <ScoreBadge score={zone.scoreGlobal} />}
            {sims.length > 0 && (
              <Badge variant="secondary" className="h-6 px-2.5 tabular-nums">
                {sims.length} scénarios chargés
              </Badge>
            )}
          </div>
          {sims.length === 0 && !etude.error && (
            <Button onClick={() => void onGenerate()} disabled={etude.generating} variant="outline" className="gap-2">
              {etude.generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {etude.generating ? "Génération…" : "Générer les simulations"}
            </Button>
          )}
        </CardContent>
      </Card>

      {etude.error && <OppError message={etude.error} onRetry={etude.reload} />}
      {etude.data === null && !etude.error && (
        <Card>
          <CardContent className="space-y-3 p-6" aria-busy="true" aria-label="Chargement des simulations…">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-72 w-full rounded-lg" />
          </CardContent>
        </Card>
      )}

      {etude.data !== null && sims.length === 0 && (
        <OppEmpty
          icon={Calculator}
          title="Aucune simulation pour cette zone"
          action={
            <Button onClick={() => void onGenerate()} disabled={etude.generating} className="gap-2">
              {etude.generating ? "Génération…" : "Générer l'étude + 3 scénarios"}
            </Button>
          }
        >
          Les simulations de rentabilité (pessimiste / réaliste / optimiste) sont générées en même temps que
          l&apos;étude de faisabilité de la zone.
        </OppEmpty>
      )}

      {sims.length > 0 && (
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
            <TabsTrigger value="plan">Business plan 5 ans</TabsTrigger>
            <TabsTrigger value="breakeven">Break-even</TabsTrigger>
            <TabsTrigger value="scenarios">Scénarios</TabsTrigger>
            <TabsTrigger value="marketing">Impact marketing</TabsTrigger>
          </TabsList>
          <TabsContent value="plan" className="mt-0 space-y-4">
            <BusinessPlanTab zone={zone} sims={sims} />
          </TabsContent>
          <TabsContent value="breakeven" className="mt-0 space-y-4">
            <BreakEvenTab sims={sims} />
          </TabsContent>
          <TabsContent value="scenarios" className="mt-0 space-y-4">
            <ScenariosTab sims={sims} />
          </TabsContent>
          <TabsContent value="marketing" className="mt-0 space-y-4">
            <MarketingTab sims={sims} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
