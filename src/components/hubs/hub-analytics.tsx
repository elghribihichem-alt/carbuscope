'use client'

// CarbuScope — T54-Cb — Module 2 « Mobility Hub Operations », volet 4/5 :
// « Analytics & conversions ». Mesure de l'efficacité commerciale des TMP,
// du passage capteur à la fidélisation (données /api/hubs/analytics?days=).
//   · 4 KPIs de tête : passages cumulés, taux de conversion global (badge de
//     tendance vs période précédente), valeur générée (DT — somme des
//     paniers SERVICE + FIDELISE), clients fidélisés ;
//   · Entonnoir 4 barres horizontales proportionnelles (PASSAGE zinc →
//     VISITE émeraude clair → SERVICE ambre → FIDELISE émeraude plein) avec
//     effectifs + taux de passage inter-étapes, animation subtile au
//     chargement (largeur 0 → cible, transition CSS) ;
//   · Graphiques thémés (pattern recharts des dashboards — AXIS_STYLE/
//     tooltipStyle/GRID_STROKE de src/lib/chart) : courbe tendances
//     passages/conversions (agrégat hebdo si 90 j) + répartition par source
//     (barres horizontales, mapping thémé SOURCE_META) ;
//   · Table comparative des hubs (tri par colonne, mini jauge de taux,
//     max-h-96 + scrollbar fine) ;
//   · CARTE « Boucle capteurs → Radar » (lien métier) : gouvernorats à fort
//     potentiel (score Radar ≥ seuil d'alerte) où des passages capteur sont
//     détectés + navigation « Voir le scoring Radar » (espace → portail →
//     radar/scoring — même chaîne que la sidebar) ;
//   · Filtre période 30/90 jours (Select, re-fetch abortable), Skeleton,
//     ErrorState + Réessayer. État vide honnête partout.

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDownRight, ArrowUpRight, BarChart3, Coins, Filter, Gauge, Heart,
  Radar, RefreshCw, TrendingUp,
} from "lucide-react"
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ErrorState, Skeleton } from "@/components/shell/loading"
import { useAppStore } from "@/store/app-store"
import { AXIS_STYLE, GRID_STROKE, num, tooltipStyle } from "@/lib/chart"
import {
  FUNNEL_STAGE_META, HUB_STATUS_META, SOURCE_META,
  kdt, pctFr, priceFr,
  type HubAnalyticsDTO,
} from "./hub-shared"

/* ============================== Helpers locaux ============================== */

/** jj/mm court pour l'axe temporel FR. */
const dayMonth = (iso: string): string => {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

/** Étiquette d'axe : « sem. 03/07 » en agrégat hebdo, « 03/07 » en journalier. */
const tickLabel = (iso: string, weekly: boolean): string =>
  weekly ? `sem. ${dayMonth(iso)}` : dayMonth(iso)

/** Tendance FR : « +2,1 pts » (delta de taux en points de pourcentage). */
const trendPts = (prev: number, cur: number): string => {
  const d = cur - prev
  const s = d > 0 ? "+" : d < 0 ? "−" : ""
  return `${s}${Math.abs(d).toFixed(1).replace(".", ",").replace(",0", "")} pts`
}

type SortKey = "code" | "passages" | "taux" | "valeur"

/* ============================== Composant ============================== */

export function HubAnalytics() {
  const setNav = useAppStore(s => s.setNav)

  // ---- Données (période 30 | 90 jours, fetch abortable + retry) ----
  const [days, setDays] = useState("90")
  const [data, setData] = useState<HubAnalyticsDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // Montée des barres du funnel (animation subtile, une seule fois par jeu).
  const [barsIn, setBarsIn] = useState(false)
  const seqRef = useRef(0)

  useEffect(() => {
    const ctrl = new AbortController()
    const seq = ++seqRef.current
    fetch(`/api/hubs/analytics?days=${days}`, { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`/api/hubs/analytics → ${r.status}`)
        return (await r.json()) as HubAnalyticsDTO
      })
      .then(d => {
        if (seq !== seqRef.current) return // réponse périmée (changement de période)
        setData(d)
        setError(null)
        setBarsIn(false)
        requestAnimationFrame(() => setBarsIn(true))
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        if (seq !== seqRef.current) return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [days, reloadKey])

  // ---- Série temporelle mise en forme (étiquettes FR) ----
  const weekly = days === "90"
  const chartRows = useMemo(() => {
    if (!data) return []
    return data.timeseries.map(t => ({
      ...t,
      label: tickLabel(t.date, weekly),
    }))
  }, [data, weekly])

  // ---- Tri de la table comparative ----
  const [sortKey, setSortKey] = useState<SortKey>("passages")
  const [sortDir, setSortDir] = useState<1 | -1>(-1)
  const sortedHubs = useMemo(() => {
    if (!data) return []
    const rows = [...data.byHub]
    rows.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const c = typeof av === "string" ? av.localeCompare(String(bv), "fr") : (av as number) - (bv as number)
      return c * sortDir
    })
    return rows
  }, [data, sortKey, sortDir])
  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 1 ? -1 : 1))
    else {
      setSortKey(key)
      setSortDir(key === "code" ? 1 : -1)
    }
  }

  /* ---------- Rendus ---------- */

  if (error !== null) {
    return <ErrorState message={error} retry={() => setReloadKey(k => k + 1)} />
  }

  if (data === null) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement des analytics TMP…">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    )
  }

  const { kpis, funnel, bySource, radarLoop } = data
  const maxFunnel = funnel[0]?.count ?? 0
  // Tendance du taux global : delta en points vs période précédente.
  const tauxTrend =
    kpis.prev != null ? { pts: kpis.tauxGlobal - kpis.prev.tauxGlobal, prev: kpis.prev.tauxGlobal } : null

  const th = (key: SortKey, label: string, className = "") => (
    <TableHead
      className={`h-10 text-[11px] uppercase tracking-wide ${className}`}
      aria-sort={sortKey === key ? (sortDir === 1 ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
        onClick={() => toggleSort(key)}
      >
        {label}
      </button>
    </TableHead>
  )

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- En-tête : filtre période 30/90 jours ---- */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" aria-hidden /> Efficacité commerciale du réseau TMP
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Du passage capteur à la fidélisation — une conversion est une prestation facturée
            (stades Service + Fidélisé), la valeur agrège les paniers moyens correspondants.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <Select value={days} onValueChange={v => setDays(v)}>
            <SelectTrigger className="h-11 w-[170px]" aria-label="Période d'analyse">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="90" className="h-11">90 derniers jours</SelectItem>
              <SelectItem value="30" className="h-11">30 derniers jours</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="h-11 gap-1.5"
            onClick={() => setReloadKey(k => k + 1)}
            aria-label="Recharger les analytics"
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Actualiser</span>
          </Button>
        </div>
      </div>

      {/* ---- KPIs de tête (4 cartes) ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Gauge className="h-3.5 w-3.5" aria-hidden /> Passages détectés
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums leading-none">{num(kpis.passages)}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {num(kpis.visites)} visites · {num(kpis.services)} prestations
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Taux de conversion global
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-bold tabular-nums leading-none">
              {pctFr(kpis.tauxGlobal)}
              {tauxTrend ? (
                <Badge
                  variant="outline"
                  className={`gap-1 text-[11px] ${
                    tauxTrend.pts > 0
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                      : tauxTrend.pts < 0
                        ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400"
                        : "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                  title={`Période précédente : ${pctFr(tauxTrend.prev)}`}
                >
                  {tauxTrend.pts > 0 ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : tauxTrend.pts < 0 ? <ArrowDownRight className="h-3 w-3" aria-hidden /> : null}
                  {trendPts(tauxTrend.prev, kpis.tauxGlobal)}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-zinc-300 bg-zinc-100 text-[11px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                  title="Aucune donnée sur la période précédente"
                >
                  1ʳᵉ période
                </Badge>
              )}
            </p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {num(kpis.conversions)} passages convertis en prestation
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Coins className="h-3.5 w-3.5" aria-hidden /> Valeur générée
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums leading-none">{kdt(kpis.valeur)}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Services {kdt(kpis.valeurService)} · fidélisés {kdt(kpis.valeurFidelise)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Heart className="h-3.5 w-3.5" aria-hidden /> Clients fidélisés
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums leading-none">{num(kpis.fidelises)}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              panier moyen {priceFr(kpis.fidelises > 0 ? kpis.valeurFidelise / kpis.fidelises : 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ---- Entonnoir capteurs → fidélisation ---- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Entonnoir capteurs → fidélisation</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Décroissance observée étape par étape — le taux affiché entre deux barres est le passage
            d&apos;une étape à la suivante.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {maxFunnel === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Aucun événement capteur sur la période — l&apos;entonnoir s&apos;affichera dès les
              premières mesures.
            </p>
          ) : (
            funnel.map((f, i) => {
              const meta = FUNNEL_STAGE_META[f.stage]
              const width = maxFunnel > 0 ? Math.max(2, (f.count / maxFunnel) * 100) : 0
              const prevCount = i > 0 ? funnel[i - 1].count : null
              const stepRate = prevCount != null && prevCount > 0 ? (f.count / prevCount) * 100 : null
              return (
                <div key={f.stage}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className={`text-sm font-semibold ${meta?.text ?? ""}`}>
                      {meta?.label ?? f.stage}
                    </p>
                    <p className="flex items-baseline gap-2 text-xs text-muted-foreground">
                      <span className="text-sm font-bold tabular-nums text-foreground">{num(f.count)}</span>
                      {stepRate != null && (
                        <span title={`Taux de passage ${FUNNEL_STAGE_META[funnel[i - 1].stage]?.short ?? ""} → ${meta?.short ?? ""}`}>
                          <ArrowDownRight className="inline h-3 w-3 align-[-2px] text-muted-foreground" aria-hidden />
                          {" "}
                          <span className="tabular-nums">{pctFr(stepRate)}</span> de l&apos;étape précédente
                        </span>
                      )}
                    </p>
                  </div>
                  <div
                    className="h-9 w-full overflow-hidden rounded-lg bg-muted/50"
                    role="img"
                    aria-label={`${meta?.label ?? f.stage} : ${num(f.count)} événements, ${pctFr(f.rate)} du volume de passages`}
                  >
                    <div
                      className={`h-full rounded-lg ${meta?.bar ?? "bg-zinc-400"} transition-[width] duration-700 ease-out`}
                      style={{ width: barsIn ? `${width}%` : "0%" }}
                    >
                      <span className="flex h-full items-center justify-end pr-2.5 text-[11px] font-semibold text-white tabular-nums drop-shadow-sm">
                        {num(f.count)} · {pctFr(f.rate)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* ---- Graphiques thémés : tendances + sources ---- */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tendances passages / conversions</CardTitle>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {weekly
                ? "Agrégat hebdomadaire (semaines glissantes de 7 jours) sur les 90 derniers jours."
                : "Rythme journalier sur les 30 derniers jours."}
            </p>
          </CardHeader>
          <CardContent>
            {chartRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucune donnée sur la période.</p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartRows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hubAnaPassages" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#059669" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={AXIS_STYLE.tick}
                      stroke={AXIS_STYLE.stroke}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={18}
                      dy={4}
                    />
                    <YAxis
                      tick={AXIS_STYLE.tick}
                      stroke={AXIS_STYLE.stroke}
                      tickLine={false}
                      width={40}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      formatter={(v, name) => [
                        num(Number(v)),
                        name === "passages" ? "Passages détectés" : "Conversions (prestations)",
                      ]}
                      labelFormatter={l =>
                        weekly
                          ? `Semaine du ${String(l).replace("sem. ", "")}`
                          : `Journée du ${String(l)}`
                      }
                    />
                    <Legend
                      formatter={v => (
                        <span className="text-xs text-muted-foreground">
                          {v === "passages" ? "Passages détectés" : "Conversions"}
                        </span>
                      )}
                      iconType="plainline"
                    />
                    <Area
                      type="monotone"
                      dataKey="passages"
                      stroke="#059669"
                      strokeWidth={2}
                      fill="url(#hubAnaPassages)"
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="conversions"
                      stroke="#d97706"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Répartition par source capteur</CardTitle>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Attribution des événements du tunnel : capteur radar (émeraude — lien avec le Radar),
              compteur de passage (zinc), campagne (ambre), borne digitale (terracotta).
            </p>
          </CardHeader>
          <CardContent>
            {bySource.every(s => s.count === 0) ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucune donnée sur la période.</p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={bySource}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis
                      type="number"
                      tick={AXIS_STYLE.tick}
                      stroke={AXIS_STYLE.stroke}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="source"
                      width={128}
                      tickFormatter={v => SOURCE_META[v]?.label ?? String(v)}
                      tick={AXIS_STYLE.tick}
                      stroke={AXIS_STYLE.stroke}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      formatter={(v, _n, entry) => [
                        `${num(Number(v))} événements (${pctFr(Number((entry?.payload as { part?: number })?.part ?? 0))})`,
                        SOURCE_META[(entry?.payload as { source?: string })?.source ?? ""]?.label ?? "Source",
                      ]}
                      cursor={{ fill: "rgba(138, 75, 31, 0.06)" }}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={22} isAnimationActive={false}>
                      {/* Une barre par source, ton du mapping thémé SOURCE_META. */}
                      {bySource.map(s => (
                        <Cell key={s.source} fill={SOURCE_META[s.source]?.hex ?? "#a1a1aa"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- Table comparative des hubs ---- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comparatif par hub</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Passages, taux de conversion et valeur générée sur la période — cliquez sur les
            en-têtes pour trier.
          </p>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-lg border [scrollbar-width:thin]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow className="hover:bg-transparent">
                  {th("code", "Hub", "text-left")}
                  <TableHead className="h-10 text-[11px] uppercase tracking-wide">Statut</TableHead>
                  {th("passages", "Passages", "text-right")}
                  <TableHead className="h-10 text-[11px] uppercase tracking-wide text-right">
                    Taux
                  </TableHead>
                  {th("valeur", "Valeur générée", "text-right")}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedHubs.map(h => {
                  const meta = HUB_STATUS_META[h.status]
                  const tauxCls =
                    h.taux >= 55
                      ? "bg-emerald-500"
                      : h.taux >= 35
                        ? "bg-amber-500"
                        : h.taux > 0
                          ? "bg-[var(--c-terra)]"
                          : "bg-zinc-300 dark:bg-zinc-700"
                  return (
                    <TableRow key={h.hubId}>
                      <TableCell className="max-w-[240px] py-2.5 pl-3">
                        <p className="truncate text-[13px] font-medium" title={`${h.code} — ${h.name}`}>
                          {h.name}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">{h.code}</p>
                      </TableCell>
                      <TableCell className="py-2.5">
                        {meta ? (
                          <Badge variant="outline" className={`text-[11px] ${meta.badge}`}>
                            {meta.label}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[11px]">{h.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-[13px] tabular-nums">
                        {h.passages > 0 ? num(h.passages) : "—"}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <span className="flex items-center justify-end gap-2" title="Conversions / passages sur la période">
                          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden>
                            <span
                              className={`block h-full rounded-full ${tauxCls}`}
                              style={{ width: `${Math.min(100, Math.round(h.taux))}%` }}
                            />
                          </span>
                          <span className="text-[13px] tabular-nums">
                            {h.passages > 0 ? pctFr(h.taux) : "—"}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 pr-3 text-right text-[13px] tabular-nums">
                        {h.valeur > 0 ? priceFr(h.valeur) : "—"}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ---- Boucle capteurs → Radar (lien métier) ---- */}
      <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/25">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Radar className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden />
            Boucle capteurs → Radar
          </CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Gouvernorats à fort potentiel (score Radar ≥ seuil d&apos;alerte
            {radarLoop.alertThreshold != null ? ` de ${num(radarLoop.alertThreshold)}` : ""}) où les
            capteurs radar des hubs détectent des passages — l&apos;analyse
            d&apos;implantation du Module 1 croise la mesure terrain du Module 2.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {radarLoop.govFortPotentiel.length === 0 ? (
            <p className="rounded-lg border border-dashed border-emerald-300 p-4 text-center text-sm text-muted-foreground dark:border-emerald-800">
              Aucun gouvernorat à fort potentiel avec passages capteur sur la période — les
              croisements apparaîtront dès qu&apos;un score franchira le seuil d&apos;alerte.
            </p>
          ) : (
            <ul className="space-y-2" aria-label="Gouvernorats à fort potentiel détectés par les capteurs">
              {radarLoop.govFortPotentiel.map(g => (
                <li
                  key={g.gouvernorat}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border bg-background/70 px-3 py-2.5"
                >
                  <p className="flex min-w-0 items-center gap-2">
                    <span className="text-sm font-semibold">{g.gouvernorat}</span>
                    <Badge
                      variant="outline"
                      className="border-emerald-300 bg-emerald-50 text-[11px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                      title="Score du moteur Opportunity Radar (données dérivées V1)"
                    >
                      score {pctFr(g.score)} · est.
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold tabular-nums text-foreground">{num(g.passagesCapteur)}</span>{" "}
                    passages capteur radar
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Button
            className="h-11 w-full gap-1.5 sm:w-auto"
            onClick={() => {
              // Navigation inter-modules (même chaîne que la sidebar) :
              // espace enseigne → onglet portail → volet Radar → scoring.
              setNav("espace", "portail")
              setNav("portail", "radar")
              setNav("radar", "scoring")
            }}
          >
            <Radar className="h-4 w-4" aria-hidden /> Voir le scoring Radar
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
