'use client'

// CarbuScope — Implantation (Task ID: 9) / outil 1 : « Zones blanches ».
// Croisement parc automobile × couverture stations par gouvernorat :
// ratio véhicules/station, paliers par quartiles, score d'opportunité,
// barres horizontales par palier et panneau de détail par gouvernorat.

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts"
import { Car, MapPinPlus, Scale, Sparkles, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { ChartContainer } from "@/components/ui/chart"
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import { KpiCard } from "@/components/shell/kpi-card"
import { tooltipStyle } from "@/lib/chart"
import { cn } from "@/lib/utils"
import {
  BrandDot, BrandMiniBar, NoteCell, PALIER_META, PalierBadge, ScoreBar,
  fmtPct1, fmtRatio, num, type GovStat, type GovStatsResult, type PalierKey,
} from "./implantation-shared"

const BENCHMARK = 1200 // benchmark national : 1 station pour 1 200 véhicules (module Concurrence)

/* ---------------- Panneau de détail (Sheet droit) ---------------- */

function GovDetailSheet({ gov, onClose }: { gov: GovStat | null; onClose: () => void }) {
  const meta = gov ? PALIER_META[gov.palier] : null
  const emptyDelegations = gov ? gov.delegationCount - gov.delegations.length : 0
  const topBrand = gov?.stationsByBrand[0]
  const maxDeleg = gov ? Math.max(1, ...gov.delegations.map((d) => d.count)) : 1

  return (
    <Sheet open={gov !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {gov && meta && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base">
                {gov.name}
                <PalierBadge palier={gov.palier} />
              </SheetTitle>
              <SheetDescription>
                {gov.delegationCount} délégations · {num(gov.stationsTotal)} stations en service ·
                note moyenne {gov.avgRating ? `${gov.avgRating.toFixed(1).replace(".", ",")}/5` : "—"}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-6">
              {/* KPI du gouvernorat */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Population", value: num(gov.population) },
                  { label: "Parc", value: num(gov.vehicles) },
                  { label: "Motorisation", value: fmtPct1(gov.motorizationRate * 100) },
                  { label: "Stations", value: num(gov.stationsTotal) },
                  { label: "Véh./station", value: fmtRatio(gov.ratio) },
                  { label: "Opportunité", value: `${gov.opportunity}/100` },
                ].map((k) => (
                  <div key={k.label} className="rounded-lg border bg-muted/30 p-2 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{k.label}</p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums">{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Répartition enseignes — barres horizontales colorées */}
              <section aria-labelledby="zg-brands">
                <h3 id="zg-brands" className="mb-2 text-sm font-semibold">Répartition des enseignes</h3>
                <div className="space-y-2">
                  {gov.stationsByBrand.map((b) => {
                    const pct = (b.count / gov.stationsTotal) * 100
                    return (
                      <div key={b.slug} className="flex items-center gap-2">
                        <BrandDot color={b.color} />
                        <span className="w-28 truncate text-xs font-medium" title={b.name}>{b.name}</span>
                        <span
                          className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-valuenow={Math.round(pct)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Part de ${b.name}`}
                        >
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: b.color }}
                          />
                        </span>
                        <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                          {num(b.count)} · {pct.toFixed(0)} %
                        </span>
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Stations par délégation */}
              <section aria-labelledby="zg-deleg">
                <h3 id="zg-deleg" className="mb-2 text-sm font-semibold">Stations par délégation</h3>
                {emptyDelegations > 0 && (
                  <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                    {emptyDelegations} délégation{emptyDelegations > 1 ? "s" : ""} sur {gov.delegationCount}
                    {" "}ne recensent aucune station en service — cibles d&apos;étude locales prioritaires.
                  </p>
                )}
                <ul className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
                  {gov.delegations.map((d) => (
                    <li key={d.name} className="flex items-center gap-2">
                      <span className="w-32 truncate text-xs" title={d.name}>{d.name}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span
                          className="block h-full rounded-full bg-emerald-500"
                          style={{ width: `${(d.count / maxDeleg) * 100}%` }}
                        />
                      </span>
                      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Synthèse opportunité */}
              <section aria-labelledby="zg-verdict" className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                <h3 id="zg-verdict" className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Lecture d&apos;implantation
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {gov.name} compte {num(gov.vehicles)} véhicules
                  ({fmtPct1(gov.motorizationRate * 100)} de motorisation) pour {num(gov.stationsTotal)} stations en
                  service — soit 1 station pour {fmtRatio(gov.ratio)} véhicules
                  {gov.ratio > BENCHMARK ? " (au-dessus du benchmark national de 1 200)" : " (sous le benchmark national de 1 200)"}.
                  {topBrand
                    ? ` L'offre locale est dominée par ${topBrand.name} (${num(topBrand.count)} station${topBrand.count > 1 ? "s" : ""}).`
                    : ""}
                  {emptyDelegations > 0
                    ? ` ${emptyDelegations} délégation${emptyDelegations > 1 ? "s" : ""} sans station : poches blanches à instruire en priorité.`
                    : ""}
                  {" "}Score d&apos;opportunité : {gov.opportunity}/100.
                </p>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/* ---------------- Outil 1 : Zones blanches ---------------- */

export function ZonesBlanches({ result }: { result: GovStatsResult }) {
  const [selected, setSelected] = useState<GovStat | null>(null)
  const { stats, thresholds, national } = result

  const byPalier = useMemo(() => {
    const m = new Map<PalierKey, GovStat[]>()
    for (const s of stats) {
      const arr = m.get(s.palier)
      if (arr) arr.push(s)
      else m.set(s.palier, [s])
    }
    return m
  }, [stats])

  const topOpportunities = useMemo(
    () => [...stats].sort((a, b) => b.opportunity - a.opportunity).slice(0, 3),
    [stats]
  )

  const chartRows = useMemo(
    () => [...stats].sort((a, b) => b.ratio - a.ratio).map((s) => ({
      name: s.name,
      ratio: Math.round(s.ratio),
      palier: s.palier,
      stations: s.stationsTotal,
      vehicles: s.vehicles,
    })),
    [stats]
  )

  const columns: DataViewColumn<GovStat>[] = [
    {
      key: "gouvernorat", header: "Gouvernorat",
      sortValue: (s) => s.name,
      render: (s) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{s.name}</p>
          <p className="text-[11px] text-muted-foreground">{s.delegationCount} délégations</p>
        </div>
      ),
    },
    {
      key: "population", header: "Population", align: "right",
      sortValue: (s) => s.population,
      render: (s) => <span className="text-sm tabular-nums">{num(s.population)}</span>,
    },
    {
      key: "vehicles", header: "Parc (véh.)", align: "right",
      sortValue: (s) => s.vehicles,
      render: (s) => <span className="text-sm tabular-nums">{num(s.vehicles)}</span>,
    },
    {
      key: "motorization", header: "Motorisation", align: "right",
      sortValue: (s) => s.motorizationRate,
      render: (s) => <span className="text-sm tabular-nums text-muted-foreground">{fmtPct1(s.motorizationRate * 100)}</span>,
    },
    {
      key: "stations", header: "Stations",
      sortValue: (s) => s.stationsTotal,
      render: (s) => (
        <div className="flex min-w-[110px] flex-col gap-1">
          <span className="text-sm font-medium tabular-nums">{num(s.stationsTotal)}</span>
          <BrandMiniBar dist={s.stationsByBrand} />
        </div>
      ),
    },
    {
      key: "ratio", header: "Véh./station", align: "right",
      sortValue: (s) => s.ratio,
      render: (s) => (
        <span className={cn(
          "text-sm font-bold tabular-nums",
          s.palier === "BLANCHE" && "text-red-600 dark:text-red-400",
          s.palier === "SOUS" && "text-amber-600 dark:text-amber-400"
        )}>
          {fmtRatio(s.ratio)}
        </span>
      ),
    },
    {
      key: "palier", header: "Palier",
      sortValue: (s) => PALIER_META[s.palier].rank,
      render: (s) => <PalierBadge palier={s.palier} />,
    },
    {
      key: "opportunity", header: "Opportunité", align: "right",
      sortValue: (s) => s.opportunity,
      render: (s) => <ScoreBar value={s.opportunity} color="#059669" />,
    },
  ]

  const renderTip = ({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) => {
    if (!active || !payload?.length) return null
    const row = payload[0]?.payload as (typeof chartRows)[number] | undefined
    if (!row) return null
    return (
      <div className="px-3 py-2 text-xs" style={tooltipStyle()}>
        <p className="mb-1 font-medium text-popover-foreground">{row.name}</p>
        <div className="space-y-0.5">
          <div className="flex items-center justify-between gap-6">
            <span className="text-muted-foreground">Ratio</span>
            <span className="font-semibold tabular-nums">{num(row.ratio)} véh./station</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="text-muted-foreground">Stations</span>
            <span className="font-semibold tabular-nums">{num(row.stations)}</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PALIER_META[row.palier].color }} aria-hidden />
              Palier
            </span>
            <span className="font-semibold">{PALIER_META[row.palier].label}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPI de tête + meilleures opportunités */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Zones blanches"
          value={byPalier.get("BLANCHE")?.length ?? 0}
          icon={MapPinPlus}
          tone="danger"
          sub={`ratio > ${fmtRatio(thresholds.q3)} véh./station (q3)`}
        />
        <KpiCard
          label="Gouvernorats sous-équipés"
          value={byPalier.get("SOUS")?.length ?? 0}
          icon={TriangleAlert}
          tone="warning"
          sub={`ratio entre ${fmtRatio(thresholds.q2)} et ${fmtRatio(thresholds.q3)}`}
        />
        <KpiCard
          label="Ratio médian national"
          value={fmtRatio(thresholds.q2)}
          icon={Scale}
          sub={`véhicules par station · benchmark national : 1 200`}
        />
        <KpiCard
          label="Parc automobile national"
          value={num(national.vehicles)}
          icon={Car}
          sub={`${num(national.stations)} stations en service · 1 station / ${fmtRatio(national.ratio)} véh.`}
        />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <span className="text-xs font-medium text-muted-foreground">Meilleures opportunités :</span>
          {topOpportunities.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setSelected(s)}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 dark:hover:bg-emerald-900"
              aria-label={`Ouvrir le détail de ${s.name}, score d'opportunité ${s.opportunity} sur 100`}
            >
              <Sparkles className="h-3 w-3" aria-hidden />
              {s.name}
              <span className="tabular-nums opacity-70">{s.opportunity}/100</span>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Ratio par gouvernorat + légende des paliers */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Ratio véhicules / station par gouvernorat</CardTitle>
            <CardDescription>
              24 gouvernorats, triés par ratio décroissant — la couleur suit le palier d&apos;équipement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="aspect-auto h-[344px] w-full">
              <BarChart data={chartRows} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v: number) => num(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={92}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                />
                <Tooltip content={renderTip} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                <Bar dataKey="ratio" name="Véh./station" barSize={9} radius={[0, 3, 3, 0]}>
                  {chartRows.map((r) => (
                    <Cell key={r.name} fill={PALIER_META[r.palier].color} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Légende des paliers</CardTitle>
            <CardDescription>
              Seuils = quartiles du ratio calculés sur les 24 gouvernorats.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {(["BLANCHE", "SOUS", "EQUILIBREE", "DENSE"] as PalierKey[]).map((k) => {
                const meta = PALIER_META[k]
                const rows = byPalier.get(k) ?? []
                const interval =
                  k === "BLANCHE" ? `> ${fmtRatio(thresholds.q3)}` :
                  k === "SOUS" ? `${fmtRatio(thresholds.q2)} – ${fmtRatio(thresholds.q3)}` :
                  k === "EQUILIBREE" ? `${fmtRatio(thresholds.q1)} – ${fmtRatio(thresholds.q2)}` :
                  `≤ ${fmtRatio(thresholds.q1)}`
                return (
                  <li key={k} className="flex items-start gap-2">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-xs font-semibold">
                        {meta.label}
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
                          {rows.length}
                        </Badge>
                        <span className="font-mono text-[11px] font-normal text-muted-foreground">{interval} véh./station</span>
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{meta.description}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
              Méthode : stations en service (ACTIVE + RÉNOVATION), parc et motorisation issus de
              &apos;/api/governorats&apos; croisés avec &apos;/api/stations&apos;. Ratio élevé = offre insuffisante
              pour le parc local.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tableau des 24 gouvernorats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Couverture par gouvernorat</CardTitle>
          <CardDescription>
            Cliquez sur une ligne pour ouvrir le détail (enseignes, délégations, lecture d&apos;implantation)
            · 3 modes d&apos;affichage · nested par palier d&apos;équipement
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey="implantation-zones"
            columns={columns}
            rows={stats}
            rowKey={(s) => s.name}
            onRowClick={(s) => setSelected(s)}
            emptyMessage="Aucun gouvernorat chargé."
            maxHeightClassName="max-h-[26rem]"
            nested={{
              groupKey: (s) => s.palier,
              groupLabel: (gk, grows) => {
                const meta = PALIER_META[gk as PalierKey]
                const ratio = grows[0]?.ratio ?? 0
                return (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
                    {meta.label}
                    <span className="ml-1 text-[11px] font-normal text-primary/70">
                      — {grows.length} gouvernorat{grows.length > 1 ? "s" : ""} · ratio médian{" "}
                      {fmtRatio(grows.reduce((acc, s) => acc + s.ratio, 0) / (grows.length || 1))}
                      {gk === "BLANCHE" && ` · ex. ${grows[0]?.name} (${fmtRatio(ratio)})`}
                    </span>
                  </span>
                )
              },
              groupSortValue: (gk) => PALIER_META[gk as PalierKey].rank,
              hideColumnKeyInGroups: "palier",
              defaultOpen: "first",
            }}
            renderCard={(s) => (
              <Card className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setSelected(s)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{s.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {num(s.population)} hab. · {num(s.vehicles)} véhicules · {s.delegationCount} délégations
                      </p>
                    </div>
                    <PalierBadge palier={s.palier} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Stations</p>
                      <p className="font-semibold tabular-nums">
                        {num(s.stationsTotal)}
                        <span className="ml-1 font-normal text-muted-foreground">· {fmtPct1(s.motorizationRate * 100)} motorisés</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Véh./station</p>
                      <p className="font-bold tabular-nums">{fmtRatio(s.ratio)}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <BrandMiniBar dist={s.stationsByBrand} />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <NoteCell rating={s.avgRating ?? 0} reviews={s.ratedStations} />
                      <ScoreBar value={s.opportunity} color={PALIER_META[s.palier].color} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          />
        </CardContent>
      </Card>

      <GovDetailSheet gov={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
