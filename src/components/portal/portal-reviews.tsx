'use client'

// Module C.2.6 — Avis & Réputation : l'enseigne voit les avis clients de ses stations,
// se compare aux concurrents et mesure la valeur de son enseigne (IVE).

import { useEffect, useMemo, useState } from "react"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { KpiCard } from "@/components/shell/kpi-card"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { ChartContainer } from "@/components/ui/chart"
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ReferenceLine, Tooltip, XAxis, YAxis,
} from "recharts"
import {
  Star, Trophy, TrendingUp, TrendingDown, MessageSquareQuote, Award, Gauge, Users, Quote, Info,
} from "lucide-react"
import type { ReputationStats } from "@/lib/types"
import { num, relDays } from "@/components/settings/settings-shared"

const EMERALD = "#059669"
const AMBER = "#d97706"
const SLATE = "#94a3b8"

// ---------- Étoiles ----------
function Stars({ value, className = "h-3.5 w-3.5" }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} sur 5 étoiles`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`${className} ${i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
          aria-hidden
        />
      ))}
    </span>
  )
}

// ---------- Bulle de graphique ----------
function ChartTip({ active, payload, label, suffix = "" }: {
  active?: boolean
  payload?: { name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> }[]
  label?: string | number
  suffix?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-lg">
      <p className="mb-0.5 font-semibold">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? EMERALD }} aria-hidden />
          {p.name} : <span className="font-semibold text-foreground tabular-nums">{p.value}{suffix}</span>
        </p>
      ))}
    </div>
  )
}

export function PortalReviews({ brandSlug }: { brandSlug: string }) {
  const [stats, setStats] = useState<ReputationStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch(`/api/stats/reputation?brand=${encodeURIComponent(brandSlug)}`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: ReputationStats) => setStats(j))
      .catch(e => { if (e.name !== "AbortError") setError(e.message) })
    return () => ac.abort()
  }, [brandSlug])

  // Données dérivées pour les graphiques
  const derived = useMemo(() => {
    if (!stats) return null
    const own = stats.own
    const market = stats.market

    // Comparaison des enseignes (barres horizontales)
    const comparison = market.brandComparison
      .filter(b => b.reviewsCount > 0)
      .map(b => ({ name: b.slug === stats.brand.slug ? `${b.name} (moi)` : b.name, note: b.avgRating, isOwn: b.slug === stats.brand.slug }))
    const maxNote = Math.max(...comparison.map(c => c.note), 4.5)

    // Répartition en % (normalisée) — moi vs marché
    const ownTotal = Math.max(1, own.distribution.reduce((s, d) => s + d.count, 0))
    const mktTotal = Math.max(1, market.distribution.reduce((s, d) => s + d.count, 0))
    const dist = own.distribution.map(d => {
      const m = market.distribution.find(x => x.rating === d.rating)
      return {
        etoiles: `${d.rating}★`,
        moi: Math.round((d.count / ownTotal) * 1000) / 10,
        marche: Math.round(((m?.count ?? 0) / mktTotal) * 1000) / 10,
      }
    })

    // Critères (radar)
    const radar = own.criteria.map(c => {
      const m = market.criteria.find(x => x.key === c.key)
      return { critere: c.label, moi: c.value, marche: m?.value ?? 0 }
    })

    // Tendance
    const trend = own.trend.months.map((m, i) => ({
      mois: m,
      moi: own.trend.values[i] ?? 0,
      marche: market.trend.values[i] ?? 0,
    }))

    const delta = Math.round((own.avgRating - market.avgRating) * 10) / 10
    const rank = market.brandComparison.findIndex(b => b.slug === stats.brand.slug) + 1

    return { comparison, maxNote, dist, radar, trend, delta, rank }
  }, [stats])

  if (error) return <ErrorState message={error} />
  if (!stats || !derived) return <TabSkeleton title="Chargement de la réputation…" />

  const { own, market, valueIndex: ive, brand } = stats
  const d = derived

  return (
    <div className="space-y-4">
      {/* ---------- Synthèse ---------- */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between md:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              <MessageSquareQuote className="h-5.5 w-5.5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1.5">
              <h2 className="text-base font-bold leading-tight">Réputation en ligne — {brand.name}</h2>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {d.delta >= 0 ? (
                  <>
                    Votre enseigne est notée <strong className="text-foreground">{own.avgRating}/5</strong> sur{" "}
                    <strong className="text-foreground">{num(own.reviewsCount)} avis</strong>, soit{" "}
                    <strong className="text-emerald-600">+{d.delta.toFixed(1).replace(".", ",")} point{d.delta > 1 ? "s" : ""} au-dessus de la moyenne marché</strong>{" "}
                    ({market.avgRating}/5). Vous captez <strong className="text-foreground">{own.shareOfVoice} %</strong> du
                    volume d’avis des consommateurs.
                  </>
                ) : (
                  <>
                    Votre enseigne est notée <strong className="text-foreground">{own.avgRating}/5</strong> sur{" "}
                    <strong className="text-foreground">{num(own.reviewsCount)} avis</strong>, soit{" "}
                    <strong className="text-red-600">{Math.abs(d.delta).toFixed(1).replace(".", ",")} point{"(s)"} en dessous de la moyenne marché</strong>{" "}
                    ({market.avgRating}/5) — un axe prioritaire d’amélioration de l’expérience client.
                  </>
                )}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="outline" className="gap-1.5">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {own.stationsWithReviews}/{own.stationsTotal} stations notées
                </Badge>
                <Badge variant="outline" className="gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Part de voix : {own.shareOfVoice} %
                </Badge>
                <Badge variant="outline" className="gap-1.5">
                  <Award className="h-3.5 w-3.5" />
                  IVE : {ive.score}/100 — {ive.rank}<sup>e</sup>/{ive.brandsCount}
                </Badge>
              </div>
            </div>
          </div>
          <div className="shrink-0 rounded-xl border bg-muted/40 p-4 text-center sm:min-w-[150px]">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Indice de valeur</p>
            <p className="mt-1 text-4xl font-black tabular-nums leading-none text-emerald-600 dark:text-emerald-400">
              {ive.score}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">enseigne / 100</p>
            <div className="mt-2"><Stars value={own.avgRating} /></div>
          </div>
        </CardContent>
      </Card>

      {/* ---------- KPIs ---------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Note moyenne"
          value={`${own.avgRating}/5`}
          icon={Star}
          tone="default"
          trend={{ value: d.delta, label: " pts vs marché" }}
        />
        <KpiCard
          label="Avis clients reçus"
          value={num(own.reviewsCount)}
          icon={MessageSquareQuote}
          sub={`${own.stationsWithReviews} stations notées`}
        />
        <KpiCard
          label="Rang concurrentiel"
          value={`${d.rank}${d.rank === 1 ? "er" : "e"}`}
          icon={TrendingUp}
          sub={`sur ${market.brandComparison.filter(b => b.reviewsCount > 0).length} enseignes notées`}
        />
        <KpiCard
          label="Indice de valeur (IVE)"
          value={`${ive.score}/100`}
          icon={Award}
          sub={`${ive.rank}${ive.rank === 1 ? "er" : "e"} enseigne du marché`}
        />
      </div>

      {/* ---------- Comparaison + répartition ---------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Note moyenne par enseigne</CardTitle>
            <CardDescription>Positionnement de {brand.name} face aux concurrents (toutes enseignes confondues : {market.avgRating}/5).</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="aspect-auto h-[300px] w-full">
              <BarChart data={d.comparison} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={116} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTip suffix="/5" />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                <ReferenceLine x={market.avgRating} stroke={SLATE} strokeDasharray="4 3" label={{ value: "Marché", position: "insideTopRight", fontSize: 10, fill: SLATE }} />
                <Bar dataKey="note" name="Note" radius={[0, 4, 4, 0]} barSize={16}>
                  {d.comparison.map((row, i) => (
                    <Cell key={i} fill={row.isOwn ? EMERALD : "var(--muted-foreground)"} fillOpacity={row.isOwn ? 1 : 0.45} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Répartition des notes</CardTitle>
            <CardDescription>Comparé au marché — où se situe la masse de vos avis ?</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="aspect-auto h-[300px] w-full">
              <BarChart data={d.dist} margin={{ left: 0, right: 8, top: 12, bottom: 4 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="etoiles" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `${v} %`} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTip suffix=" %" />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                <Bar dataKey="marche" name="Marché" fill={SLATE} fillOpacity={0.5} radius={[4, 4, 0, 0]} barSize={22} />
                <Bar dataKey="moi" name="Mon enseigne" fill={EMERALD} radius={[4, 4, 0, 0]} barSize={22} />
              </BarChart>
            </ChartContainer>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: EMERALD }} aria-hidden /> Mon enseigne
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SLATE }} aria-hidden /> Marché
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---------- Critères + tendance ---------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Critères d’expérience</CardTitle>
            <CardDescription>Note moyenne par critère, comparée au marché.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="aspect-auto h-[300px] w-full">
              <RadarChart data={d.radar} outerRadius="72%">
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="critere" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} angle={90} />
                <Radar name="Marché" dataKey="marche" stroke={SLATE} fill={SLATE} fillOpacity={0.18} strokeWidth={1.5} />
                <Radar name="Mon enseigne" dataKey="moi" stroke={EMERALD} fill={EMERALD} fillOpacity={0.32} strokeWidth={2} />
                <Tooltip content={<ChartTip suffix="/5" />} />
              </RadarChart>
            </ChartContainer>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: EMERALD }} aria-hidden /> Mon enseigne
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SLATE }} aria-hidden /> Marché
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tendance de la note</CardTitle>
            <CardDescription>Note moyenne mensuelle de votre réseau vs marché.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="aspect-auto h-[300px] w-full">
              <LineChart data={d.trend} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="mois" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis domain={[3, 5]} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTip suffix="/5" />} />
                <Line type="monotone" dataKey="marche" name="Marché" stroke={SLATE} strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
                <Line type="monotone" dataKey="moi" name="Mon enseigne" stroke={EMERALD} strokeWidth={2.5} dot={{ r: 3, fill: EMERALD }} activeDot={{ r: 5 }} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* ---------- IVE + Top/Flop ---------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Indice de Valeur d’Enseigne
            </CardTitle>
            <CardDescription>Score composite {ive.score}/100 — comment il se construit :</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5">
            {ive.details.map(det => (
              <div key={det.key} title={det.hint}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium">
                    {det.key === "note" && <Star className="h-3.5 w-3.5 text-amber-500" aria-hidden />}
                    {det.key === "volume" && <MessageSquareQuote className="h-3.5 w-3.5 text-amber-500" aria-hidden />}
                    {det.key === "experience" && <Gauge className="h-3.5 w-3.5 text-amber-500" aria-hidden />}
                    {det.key === "fraicheur" && <Info className="h-3.5 w-3.5 text-amber-500" aria-hidden />}
                    {det.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    <span className="font-bold text-foreground">{det.points.toString().replace(".", ",")}</span>/{det.max} pts
                  </span>
                </div>
                <Progress value={(det.points / det.max) * 100} className="h-2" aria-label={`${det.label} : ${det.points}/${det.max}`} />
              </div>
            ))}
            <p className="rounded-lg border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              L’IVE agrège la satisfaction client (40 pts), la densité d’avis (20 pts), l’expérience réseau —
              stations actives et 24h/24-7j/7 (20 pts) et la fraîcheur des vérifications terrain (20 pts).
              Il permet de suivre la valeur perçue de l’enseigne mois après mois.
            </p>
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-amber-500" aria-hidden />
              Vos 5 meilleures stations
            </CardTitle>
            <CardDescription>Les ambassadrices de votre enseigne.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {own.topStations.map((s, i) => (
              <div key={s.code} className="flex items-center gap-3 rounded-lg border bg-muted/20 p-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.gouvernorat} · {s.reviewsCount} avis</p>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <Stars value={s.rating} />
                  <span className="mt-0.5 text-xs font-bold tabular-nums">{s.rating.toString().replace(".", ",")}/5</span>
                </div>
              </div>
            ))}
            {own.topStations.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Pas encore assez d’avis (minimum 3 par station).
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden />
              5 stations à surveiller
            </CardTitle>
            <CardDescription>Notes les plus basses — vos priorités d’action terrain.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {own.flopStations.map(s => (
              <div key={s.code} className="flex items-center gap-3 rounded-lg border bg-muted/20 p-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700 dark:bg-orange-950 dark:text-orange-400">
                  {s.rating.toString().replace(".", ",")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.gouvernorat} · {s.reviewsCount} avis</p>
                </div>
                <Stars value={s.rating} />
              </div>
            ))}
            {own.flopStations.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Pas encore assez d’avis (minimum 3 par station).
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------- Flux d'avis récents ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Quote className="h-4 w-4 text-muted-foreground" aria-hidden />
            Derniers avis clients ({num(own.reviewsCount)} au total)
          </CardTitle>
          <CardDescription>Les 20 avis les plus récents sur vos stations.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-96 pr-3">
            <div className="space-y-2.5">
              {own.recentReviews.map(r => (
                <article key={r.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                      aria-hidden>
                      {r.author.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold">{r.author}</span>
                    <Stars value={r.rating} className="h-3 w-3" />
                    <span className="ms-auto text-xs text-muted-foreground" title={new Date(r.createdAt).toLocaleString("fr-FR")}>
                      {relDays(r.createdAt)}
                    </span>
                  </div>
                  {r.comment && (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">« {r.comment} »</p>
                  )}
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{r.stationName}</span> · {r.gouvernorat}
                  </p>
                </article>
              ))}
              {own.recentReviews.length === 0 && (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Aucun avis reçu pour l’instant — encouragez vos clients à noter vos stations depuis l’app mobile.
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
