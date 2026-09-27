"use client"

// Shadow Market (T44-c) — onglet « 📊 Indicateurs Clés » de la Vue d'Ensemble :
// tableau de bord DG complet — 4 KPI, heatmap Tunisie + perte par gouvernorat,
// alertes critiques de la semaine, top 10 stations menacées + typologie
// nationale (donut), tendance 12 mois avec notes saisonnières.

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ResponsiveContainer, ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ReferenceLine,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip as ShTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { ShadowOverviewKpis, ShadowOverviewResponse, ShadowMapResponse } from "@/lib/types"
import { tooltipStyle } from "@/lib/chart"
import {
  ShadowKpiCard, ShadowLevelBadge, SectionHeader, formatTnd, formatLJ, relDateFr,
  LEVEL_COLORS, SHADOW_COLORS,
} from "@/components/shadow/shadow-shared"
import { ShadowMap } from "../cartography/shadow-map"
import { CircleDot, TrendingDown, Building2, PieChart as PieIcon, TriangleAlert, MapPin, Activity } from "lucide-react"

const TICK = { fontSize: 10, fill: "var(--muted-foreground)" }

/** Tick incliné (recharts ne type pas l'attribut « angle » → rendu <text> custom). */
function AngledTick({
  x, y, payload, fmt,
}: {
  x?: number
  y?: number
  payload?: { value?: string | number }
  fmt?: (v: number) => string
}) {
  if (x == null || y == null) return null
  const text = fmt && payload?.value != null ? fmt(Number(payload.value)) : String(payload?.value ?? "")
  return (
    <text x={x} y={y} dy={9} textAnchor="end" fontSize={10} fill="var(--muted-foreground)"
      transform={`rotate(-28 ${x} ${y})`}>
      {text}
    </text>
  )
}

export function KpisTab({
  data, kpis, consolidated, selectedMonth, onNavigate,
}: {
  data: ShadowOverviewResponse
  kpis: ShadowOverviewKpis
  consolidated: boolean
  selectedMonth: string
  onNavigate?: (section: string) => void
}) {
  // ----- Carte : dataset géolocalisé chargé paresseusement (cache serveur 60 s) -----
  const [mapData, setMapData] = useState<ShadowMapResponse | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const loadMap = useCallback(async (signal: AbortSignal) => {
    try {
      const r = await fetch("/api/shadow/map", { signal })
      if (!r.ok) throw new Error(`API /api/shadow/map [${r.status}]`)
      setMapData((await r.json()) as ShadowMapResponse)
      setMapError(null)
    } catch (e) {
      if (signal.aborted) return
      setMapError(e instanceof Error ? e.message : "Erreur inconnue")
    }
  }, [])
  useEffect(() => {
    const ac = new AbortController()
    const t = setTimeout(() => { void loadMap(ac.signal) }, 0)
    return () => { clearTimeout(t); ac.abort() }
  }, [loadMap])

  // ----- Alertes critiques de la semaine -----
  const criticalAlerts = useMemo(
    () => data.alerts
      .filter(a => a.severity === "CRITICAL")
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5),
    [data.alerts]
  )

  // ----- Perte par gouvernorat (top 12) -----
  const govBars = useMemo(
    () => [...data.govLosses].sort((a, b) => b.lossTnd - a.lossTnd).slice(0, 12)
      .map(g => ({ gouvernorat: g.gouvernorat, perte: g.lossTnd, points: g.points, level: g.level })),
    [data.govLosses]
  )

  // ----- Tendance 12 mois -----
  const trendData = useMemo(() => data.monthly.map(m => {
    const [y, mo] = m.month.split("-")
    const label = new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(Number(y), Number(mo) - 1, 1))
    return {
      month: m.month,
      label: `${label} ${y.slice(2)}`,
      "Points actifs": m.activePoints,
      "Perte est. (DT)": m.estLossTnd,
      note: m.note,
    }
  }), [data.monthly])
  const notedMonths = useMemo(() => trendData.filter(m => m.note), [trendData])

  const totalTypoCount = data.typologies.reduce((s, t) => s + t.count, 0)

  return (
    <div className="space-y-4">
      {/* ---------- 4 KPI ---------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ShadowKpiCard
          label="Points informels actifs"
          value={kpis.activePoints.toLocaleString("fr-FR")}
          sub={consolidated ? "données mensuelles consolidées" : `+${kpis.newThisWeek} cette semaine · ${kpis.pendingValidation} à valider`}
          trend={kpis.monthVariationPct}
          trendLabel="vs mois précédent"
          icon={CircleDot}
          tone="orange"
          onClick={onNavigate ? () => onNavigate("cartography") : undefined}
        />
        <ShadowKpiCard
          label="Perte mensuelle estimée"
          value={formatTnd(kpis.estLossTnd)}
          sub={`≈ ${formatLJ(kpis.volumeLJ)} écoulés hors circuit`}
          trend={kpis.lossVariationPct}
          trendLabel="vs mois précédent"
          icon={TrendingDown}
          tone="red"
        />
        <ShadowKpiCard
          label="Stations menacées"
          value={kpis.stationsThreatened.toLocaleString("fr-FR")}
          sub={`dont ${kpis.stationsThreatenedRed} critiques 🔴`}
          icon={Building2}
          tone="red"
          onClick={onNavigate ? () => onNavigate("cartography") : undefined}
        />
        <ShadowKpiCard
          label="Part de marché grignotée"
          value={`${Math.round(kpis.marketShareStolenPct).toLocaleString("fr-FR")} %`}
          sub="marché formel vs parallèle"
          icon={PieIcon}
          tone="yellow"
        />
      </div>

      {/* ---------- Heatmap Tunisie + Perte par gouvernorat ---------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Heatmap Tunisie</CardTitle>
            <CardDescription>
              Disques proportionnels à la perte mensuelle par gouvernorat — cliquez un point pour sa fiche terrain
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mapData ? (
              <ShadowMap
                points={mapData.points}
                govHeat={data.govLosses}
                showGovHeat
                typologies={mapData.typologies}
                compact
                height="h-[400px]"
              />
            ) : mapError ? (
              <p className="flex h-[400px] items-center justify-center rounded-xl border border-dashed border-stone-300 px-4 text-center text-xs text-muted-foreground dark:border-stone-700">
                Carte indisponible ({mapError}).
              </p>
            ) : (
              <Skeleton className="h-[400px] w-full rounded-xl" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Perte par gouvernorat</CardTitle>
            <CardDescription>Top 12 · barres colorées par niveau de menace · survol = détail</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]" role="img" aria-label="Perte mensuelle estimée par gouvernorat, douze premiers gouvernorats">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={govBars} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={<AngledTick fmt={formatTnd} />} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatTnd(v)} />
                  <YAxis type="category" dataKey="gouvernorat" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={92} interval={0} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    contentStyle={tooltipStyle()}
                    formatter={(v, _n, item) => {
                      const d = item?.payload as { points?: number; level?: string } | undefined
                      return [`${formatTnd(Number(v))}/mois · ${d?.points ?? 0} points`, "Perte"]
                    }}
                  />
                  <Bar dataKey="perte" radius={[0, 4, 4, 0]} barSize={16}>
                    {govBars.map(g => (
                      <Cell key={g.gouvernorat} fill={LEVEL_COLORS[g.level]} fillOpacity={0.88} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---------- Alertes critiques de la semaine ---------- */}
      <Card className="border-[#E53935]/30">
        <CardHeader>
          <SectionHeader
            emoji="🔴"
            title="Alertes critiques (cette semaine)"
            description="Les signaux nécessitant une action immédiate — cliquez une alerte pour l'explorer sur la cartographie."
          />
        </CardHeader>
        <CardContent>
          {criticalAlerts.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucune alerte critique active — situation maîtrisée.</p>
          )}
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {criticalAlerts.map(a => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onNavigate?.("cartography")}
                  className="flex w-full items-start gap-3 rounded-lg border border-stone-200 px-3 py-2.5 text-left transition-colors hover:border-[#E53935]/40 hover:bg-[#E53935]/5 dark:border-stone-700"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#E53935]/12 text-[#E53935]">
                    <TriangleAlert className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold leading-snug text-stone-900 dark:text-stone-50">{a.title}</span>
                    <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-muted-foreground">{a.detail}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {a.zone}
                      {a.stationName && <><span aria-hidden>·</span><span>{a.stationName}</span></>}
                      <span aria-hidden>·</span>
                      <strong className="tabular-nums" style={{ color: SHADOW_COLORS.red }}>{formatTnd(a.lossTnd)}</strong>
                      <span aria-hidden>·</span>
                      <span title={a.date}>{relDateFr(a.date)}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ---------- Top 10 stations menacées + typologie nationale ---------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle>Top 10 stations menacées</CardTitle>
                <CardDescription>Classement par perte mensuelle estimée · survol = détail</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <TooltipProvider delayDuration={120}>
              <ol className="max-h-96 space-y-1 overflow-y-auto pr-1 scroll-coffee">
                {data.topThreats.map((s, i) => (
                  <li key={s.code}>
                    <ShTooltip>
                      <TooltipTrigger asChild>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => onNavigate?.("cartography")}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onNavigate?.("cartography") }}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:border-stone-200 hover:bg-accent/60 dark:hover:border-stone-700"
                        >
                          <span className="w-5 shrink-0 text-right text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.brandColor }} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-stone-900 dark:text-stone-50">{s.name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">{s.brandName} · {s.gouvernorat}</span>
                          </span>
                          <ShadowLevelBadge level={s.level} loss={s.lossTnd} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-60">
                        <p className="font-semibold">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground">{s.delegation} · {s.gouvernorat}</p>
                        <p className="mt-1 text-[11px]">{s.points} points informels à proximité</p>
                        <p className="text-[11px]">Volume volé : {formatLJ(s.volumeStolenLJ)}</p>
                        <p className="text-[11px]">Point le plus proche : {s.worstDistanceM != null ? `${Math.round(s.worstDistanceM)} m` : "—"}</p>
                        <p className="text-[11px]">Trafic station : {s.traffic.toLocaleString("fr-FR")} véh./j</p>
                      </TooltipContent>
                    </ShTooltip>
                  </li>
                ))}
              </ol>
            </TooltipProvider>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Typologie nationale</CardTitle>
            <CardDescription>Répartition des {totalTypoCount} points actifs par type de vente informelle</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative h-52" role="img" aria-label="Répartition des points informels par typologie">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.typologies}
                    dataKey="count"
                    nameKey="label"
                    innerRadius="62%"
                    outerRadius="88%"
                    paddingAngle={2}
                    strokeWidth={1.5}
                    stroke="var(--background)"
                  >
                    {data.typologies.map(t => (
                      <Cell key={t.code} fill={t.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle()}
                    formatter={(v, n) => [`${Number(v).toLocaleString("fr-FR")} points`, String(n)]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-50">{totalTypoCount.toLocaleString("fr-FR")}</p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">points actifs</p>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5">
              {data.typologies.map(t => (
                <li key={t.code} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: t.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium text-stone-900 dark:text-stone-50">{t.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {t.count.toLocaleString("fr-FR")} pts · {t.pct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
                  </span>
                  <span className="w-20 shrink-0 text-right font-semibold tabular-nums" style={{ color: SHADOW_COLORS.red }}>
                    {formatTnd(t.lossTnd)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* ---------- Tendance 12 mois ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
            Tendance 12 mois
          </CardTitle>
          <CardDescription>
            Points actifs (aire) et perte mensuelle estimée (courbe, axe droit) · 📌 = événement noté (Ramadan, saisonnalité…)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72" role="img" aria-label="Tendance sur douze mois des points actifs et de la perte estimée">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: -8, bottom: 18 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={<AngledTick />} height={44} interval={0} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={TICK} axisLine={false} tickLine={false} width={42} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={TICK} axisLine={false} tickLine={false} width={64} tickFormatter={(v: number) => formatTnd(v)} />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  formatter={(v, n) => (String(n).includes("Perte") ? [formatTnd(Number(v)), String(n)] : [Number(v).toLocaleString("fr-FR"), String(n)])}
                  labelFormatter={l => `Mois : ${l}`}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" iconSize={8} />
                <Area yAxisId="left" type="monotone" dataKey="Points actifs" stroke={SHADOW_COLORS.orange} fill={SHADOW_COLORS.orange} fillOpacity={0.22} strokeWidth={2} activeDot={{ r: 4 }} />
                <Line yAxisId="right" type="monotone" dataKey="Perte est. (DT)" stroke={SHADOW_COLORS.red} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                {notedMonths.map(m => (
                  <ReferenceLine
                    key={m.month}
                    x={m.label}
                    yAxisId="left"
                    stroke="var(--muted-foreground)"
                    strokeDasharray="3 3"
                    strokeOpacity={0.6}
                    label={{ value: "📌", position: "insideTopLeft", fontSize: 10, offset: 4 }}
                  />
                ))}
                <ReferenceLine
                  x={trendData.find(m => m.month === selectedMonth)?.label}
                  yAxisId="left"
                  stroke={SHADOW_COLORS.blue}
                  strokeWidth={1.6}
                  label={{ value: "mois affiché", position: "top", fontSize: 9, fill: SHADOW_COLORS.blue }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {notedMonths.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-stone-100 pt-2 dark:border-stone-800">
              {notedMonths.map(m => (
                <span key={m.month} className="inline-flex max-w-full items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] text-muted-foreground dark:border-stone-700 dark:bg-stone-900">
                  <span aria-hidden>📌</span>
                  <strong className="font-semibold text-foreground">{m.label}</strong>
                  <span className="truncate">{m.note}</span>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
