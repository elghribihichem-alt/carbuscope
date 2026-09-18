'use client'

// Module C.2.6 — Avis & Réputation : l'enseigne voit les avis clients de ses stations,
// se compare aux concurrents et mesure la valeur de son enseigne (IVE).

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { toast } from "sonner"
import { KpiCard } from "@/components/shell/kpi-card"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { ChartContainer } from "@/components/ui/chart"
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ReferenceLine, Tooltip, XAxis, YAxis,
} from "recharts"
import {
  Star, Trophy, TrendingUp, TrendingDown, MessageSquareQuote, MessageSquareReply, Award, Gauge,
  Users, Quote, Info, Send, Pencil, Loader2, Trash2, Clock, Radar as RadarIcon, AlertTriangle, Download, CheckCircle2, Printer, Fuel,
} from "lucide-react"
import type { ReputationStats } from "@/lib/types"
import { num, relDays } from "@/components/settings/settings-shared"
import { StationDetailDialog } from "@/components/stations/station-detail-dialog"

const EMERALD = "#059669"
const AMBER = "#d97706"
const SLATE = "#94a3b8"

// Feuille d'impression du rapport réputation : seul le nœud portail #cs-reputation-print
// reste visible à l'impression (les autres enfants directs de <body> sont masqués).
const PRINT_CSS = `
@media print {
  body > *:not(#cs-reputation-print) { display: none !important; }
  #cs-reputation-print { display: block !important; }
  #cs-reputation-print .bar { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
@page { size: A4 portrait; margin: 12mm; }
`

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

type ReviewFilter = "all" | "pending" | "replied"

export function PortalReviews({ brandSlug }: { brandSlug: string }) {
  const [stats, setStats] = useState<ReputationStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Réponse de l'enseigne (C.2.6+)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all")
  // Fiche station ouverte depuis la surveillance des notes
  const [watchFicheId, setWatchFicheId] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch(`/api/stats/reputation?brand=${encodeURIComponent(brandSlug)}`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: ReputationStats) => setStats(j))
      .catch(e => { if (e.name !== "AbortError") setError(e.message) })
    return () => ac.abort()
  }, [brandSlug])

  // Publication / mise à jour d'une réponse officielle
  const submitReply = (reviewId: string) => {
    const text = replyText.trim()
    if (text.length < 10) {
      toast.error("La réponse doit contenir au moins 10 caractères.")
      return
    }
    setSending(true)
    fetch(`/api/reviews/${reviewId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, by: `Équipe ${stats?.brand.name ?? "enseigne"}` }),
    })
      .then(r => (r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error ?? `HTTP ${r.status}`)))))
      .then(({ reply }: { reply: { replyText: string; repliedAt: string; repliedBy: string } }) => {
        setStats(prev => prev ? {
          ...prev,
          own: {
            ...prev.own,
            recentReviews: prev.own.recentReviews.map(rv =>
              rv.id === reviewId ? { ...rv, ...reply } : rv),
          },
        } : prev)
        toast.success("Réponse publiée — elle est visible par les clients sur l’app mobile.")
        setReplyingTo(null)
        setReplyText("")
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Échec de l’envoi"))
      .finally(() => setSending(false))
  }

  // Retrait d'une réponse
  const removeReply = (reviewId: string) => {
    setSending(true)
    fetch(`/api/reviews/${reviewId}/reply`, { method: "DELETE" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(() => {
        setStats(prev => prev ? {
          ...prev,
          own: {
            ...prev.own,
            recentReviews: prev.own.recentReviews.map(rv =>
              rv.id === reviewId ? { ...rv, replyText: null, repliedAt: null, repliedBy: null } : rv),
          },
        } : prev)
        toast.success("Réponse retirée.")
        if (replyingTo === reviewId) { setReplyingTo(null); setReplyText("") }
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Échec du retrait"))
      .finally(() => setSending(false))
  }

  // Export CSV du flux d'avis filtré (BOM UTF-8, séparateur « ; » standard Excel fr)
  const exportCsv = () => {
    if (!stats || reviewFlow.list.length === 0) {
      toast.error("Aucun avis à exporter avec le filtre courant.")
      return
    }
    const esc = (v: string | number) => {
      const s = String(v ?? "")
      return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = ["Date avis", "Auteur", "Note", "Station", "Gouvernorat", "Commentaire", "Réponse publiée", "Texte de la réponse", "Répondu par", "Date réponse"]
    const rows = reviewFlow.list.map(r => [
      new Date(r.createdAt).toLocaleDateString("fr-FR"),
      r.author, `${r.rating}/5`, r.stationName, r.gouvernorat, r.comment,
      r.replyText ? "oui" : "non", r.replyText ?? "", r.repliedBy ?? "",
      r.repliedAt ? new Date(r.repliedAt).toLocaleDateString("fr-FR") : "",
    ])
    const csv = [header, ...rows].map(row => row.map(esc).join(";")).join("\r\n")
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `avis-${stats.brand.slug}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    const filterLabel = reviewFilter === "pending" ? "À traiter" : reviewFilter === "replied" ? "Traités" : null
    toast.success(`${reviewFlow.list.length} avis exportés${filterLabel ? ` (filtre « ${filterLabel} »)` : ""}.`)
  }

  // Rapport réputation imprimable (PDF via la boîte d'impression du navigateur)
  const doExportPdf = () => {
    toast.info("Rapport réputation — impression", {
      description: "Choisissez « Enregistrer au format PDF » dans la boîte d'impression pour archiver ou partager le rapport.",
    })
    window.setTimeout(() => window.print(), 500)
  }

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

  // Flux d'avis filtré (tous / sans réponse / avec réponse) + compteurs
  // (calcul direct — le compilateur React mémoïse automatiquement)
  const allReviews = stats?.own.recentReviews ?? []
  const pendingCount = allReviews.filter(r => !r.replyText).length
  const repliedCount = allReviews.length - pendingCount
  const reviewFlow = {
    list: reviewFilter === "pending" ? allReviews.filter(r => !r.replyText)
      : reviewFilter === "replied" ? allReviews.filter(r => r.replyText)
      : allReviews,
    pending: pendingCount,
    replied: repliedCount,
  }

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
                  <MessageSquareReply className="h-3.5 w-3.5 text-emerald-600" />
                  Taux de réponse : {own.responseRate} %
                  {own.avgReplyDelayHours != null && (
                    <span className="text-muted-foreground">· sous {Math.max(1, Math.round(own.avgReplyDelayHours / 24))} j</span>
                  )}
                </Badge>
                {own.watchlist.length > 0 && (
                  <Badge
                    variant="outline"
                    className="gap-1.5 border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400"
                    title="Stations dont la note récente a chuté d’au moins 0,8 point"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {own.watchlist.length} station{own.watchlist.length > 1 ? "s" : ""} en perte de vitesse
                  </Badge>
                )}
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
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-8 w-full gap-1.5 text-xs"
              onClick={doExportPdf}
              title="Rapport complet A4 : synthèse, IVE, comparaison marché, top/flop, surveillance"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden />
              Rapport PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---------- KPIs ---------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
          label="Taux de réponse"
          value={`${own.responseRate} %`}
          icon={MessageSquareReply}
          tone="success"
          trend={{ value: Math.round((own.responseRate - market.responseRate) * 10) / 10, label: " pts vs marché" }}
          sub={`${num(own.repliesCount)} réponses${own.avgReplyDelayHours != null ? ` · délai moy. ${own.avgReplyDelayHours.toString().replace(".", ",")} h` : ""}`}
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
                    {det.key === "reponse" && <MessageSquareReply className="h-3.5 w-3.5 text-amber-500" aria-hidden />}
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
              L’IVE agrège la satisfaction client (35 pts), la densité d’avis (15 pts), l’expérience réseau —
              stations actives et 24h/24-7j/7 (15 pts), la fraîcheur des vérifications terrain (15 pts)
              et le taux de réponse aux avis (20 pts) — un levier directement actionnable depuis le flux ci-dessous.
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

      {/* ---------- Surveillance des notes (chutes récentes) ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <RadarIcon className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden />
            Surveillance des notes
            <Badge
              variant="outline"
              className={own.watchlist.length > 0
                ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400"
                : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
            }
            >
              {own.watchlist.length} station{own.watchlist.length > 1 ? "s" : ""}
            </Badge>
          </CardTitle>
          <CardDescription>
            Stations en perte de vitesse : moyenne récente (≤ 90 jours) en baisse d’au moins 0,8 point
            par rapport à l’historique — vos priorités d’audit terrain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {own.watchlist.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <p className="text-sm leading-relaxed">
                <strong className="text-emerald-700 dark:text-emerald-400">Aucune station en perte de vitesse.</strong>{" "}
                <span className="text-muted-foreground">La satisfaction de votre réseau est stable sur les 3 derniers mois.</span>
              </p>
            </div>
          ) : (
            <div className="grid gap-2.5 lg:grid-cols-2">
              {own.watchlist.map(w => {
                const severe = w.delta >= 1
                return (
                  <div
                    key={w.code}
                    className={`rounded-lg border p-3 transition-colors hover:bg-muted/30 ${
                      severe
                        ? "border-red-200/80 dark:border-red-900/60"
                        : "border-orange-200/80 dark:border-orange-900/50"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${severe ? "bg-red-500 animate-pulse" : "bg-orange-400"}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{w.name}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
                        <span className="text-muted-foreground line-through decoration-muted-foreground/50">{w.previousRating.toFixed(1).replace(".", ",")}</span>
                        <TrendingDown className="h-3.5 w-3.5 text-red-500" aria-hidden />
                        <span className="font-bold text-red-600 dark:text-red-400">{w.currentRating.toFixed(1).replace(".", ",")}</span>
                        <Badge variant="outline" className="border-red-300 bg-red-50 text-[10px] font-bold text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                          −{w.delta.toFixed(1).replace(".", ",")} pt
                        </Badge>
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {w.gouvernorat} · code {w.code} · {w.recentCount} avis récents
                    </p>
                    {w.lastLowReview && (
                      <blockquote className="mt-2 rounded-md border-l-2 border-orange-300 bg-orange-50/50 px-2.5 py-1.5 dark:border-orange-700 dark:bg-orange-950/30">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium text-orange-700 dark:text-orange-400">
                          <span>Dernier avis défavorable ({w.lastLowReview.rating}/5)</span>
                          <span className="font-normal text-orange-600/80 dark:text-orange-400/70">
                            {w.lastLowReview.author} · {relDays(w.lastLowReview.createdAt)}
                          </span>
                        </p>
                        {w.lastLowReview.comment && (
                          <p className="mt-0.5 line-clamp-2 text-[11px] italic leading-snug text-muted-foreground">
                            « {w.lastLowReview.comment} »
                          </p>
                        )}
                      </blockquote>
                    )}
                    {w.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1.5 h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => setWatchFicheId(w.id)}
                      >
                        Voir la fiche
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fiche station (depuis la surveillance des notes) */}
      <StationDetailDialog
        stationId={watchFicheId}
        onClose={() => setWatchFicheId(null)}
        onEdit={() => {
          setWatchFicheId(null)
          toast.info("L’édition d’une station se fait depuis l’onglet « Mes stations » de l’observatoire.")
        }}
        onLocate={() => setWatchFicheId(null)}
      />

      {/* ---------- Flux d'avis récents + gestion des réponses ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Quote className="h-4 w-4 text-muted-foreground" aria-hidden />
                Derniers avis clients ({num(own.reviewsCount)} au total)
              </CardTitle>
              <CardDescription className="mt-1">
                Répondez officiellement aux avis : votre réponse est publiée sur l’app mobile, visible par tous les clients.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                value={reviewFilter}
                onValueChange={v => { if (v) setReviewFilter(v as ReviewFilter) }}
                variant="outline"
                size="sm"
                aria-label="Filtrer les avis"
              >
                <ToggleGroupItem value="all" className="gap-1.5">Tous ({own.recentReviews.length})</ToggleGroupItem>
                <ToggleGroupItem value="pending" className="gap-1.5 data-[state=on]:border-amber-400 data-[state=on]:bg-amber-50 data-[state=on]:text-amber-700 dark:data-[state=on]:bg-amber-950 dark:data-[state=on]:text-amber-400">
                  À traiter ({reviewFlow.pending})
                </ToggleGroupItem>
                <ToggleGroupItem value="replied" className="gap-1.5 data-[state=on]:border-emerald-400 data-[state=on]:bg-emerald-50 data-[state=on]:text-emerald-700 dark:data-[state=on]:bg-emerald-950 dark:data-[state=on]:text-emerald-400">
                  Traités ({reviewFlow.replied})
                </ToggleGroupItem>
              </ToggleGroup>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs"
                onClick={exportCsv}
                title="Télécharger les avis affichés (CSV, compatible Excel)"
              >
                <Download className="h-3.5 w-3.5" aria-hidden /> Exporter CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-96 pr-3">
            <div className="space-y-2.5">
              {reviewFlow.list.map(r => (
                <article
                  key={r.id}
                  className={`rounded-lg border p-3 transition-colors hover:bg-muted/30 ${
                    r.replyText ? "border-emerald-200/70 dark:border-emerald-900/60" : "border-amber-200/70 dark:border-amber-900/50"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                      aria-hidden>
                      {r.author.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold">{r.author}</span>
                    <Stars value={r.rating} className="h-3 w-3" />
                    {!r.replyText && (
                      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                        À traiter
                      </Badge>
                    )}
                    {r.replyText && (
                      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                        <MessageSquareReply className="h-3 w-3" aria-hidden /> Répondu
                      </Badge>
                    )}
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

                  {/* Réponse officielle publiée */}
                  {r.replyText && r.repliedAt && replyingTo !== r.id && (
                    <div className="mt-2 rounded-lg border-l-2 border-emerald-500 bg-emerald-50/60 px-3 py-2 dark:bg-emerald-950/40">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <MessageSquareReply className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">Réponse officielle · {r.repliedBy}</span>
                        <span className="ms-auto flex shrink-0 items-center gap-1 font-normal text-emerald-700/70 dark:text-emerald-400/70">
                          <Clock className="h-3 w-3" aria-hidden />
                          {relDays(r.repliedAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed">{r.replyText}</p>
                    </div>
                  )}

                  {/* Actions */}
                  {replyingTo !== r.id && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.replyText ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 px-2.5 text-xs"
                            onClick={() => { setReplyingTo(r.id); setReplyText(r.replyText ?? "") }}
                          >
                            <Pencil className="h-3 w-3" aria-hidden /> Modifier la réponse
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 px-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                            disabled={sending}
                            onClick={() => removeReply(r.id)}
                          >
                            <Trash2 className="h-3 w-3" aria-hidden /> Retirer
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5 border-emerald-300 px-2.5 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                          onClick={() => { setReplyingTo(r.id); setReplyText("") }}
                        >
                          <MessageSquareReply className="h-3 w-3" aria-hidden /> Répondre à ce client
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Éditeur de réponse */}
                  {replyingTo === r.id && (
                    <div className="mt-2.5 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 dark:border-emerald-900 dark:bg-emerald-950/30">
                      <Textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder="Votre réponse officielle — remerciez, expliquez les actions correctives engagées…"
                        rows={3}
                        maxLength={600}
                        className="resize-none bg-background text-sm"
                        aria-label={`Réponse de l’enseigne à l’avis de ${r.author}`}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {replyText.length}/600 · min. 10 caractères
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 text-xs"
                            onClick={() => { setReplyingTo(null); setReplyText("") }}
                          >
                            Annuler
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 gap-1.5 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                            disabled={sending || replyText.trim().length < 10}
                            onClick={() => submitReply(r.id)}
                          >
                            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
                            {r.replyText ? "Mettre à jour" : "Publier la réponse"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              ))}
              {reviewFlow.list.length === 0 && (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {reviewFilter === "pending"
                    ? "Bravo — tous les avis récents ont reçu une réponse officielle. 🎉"
                    : reviewFilter === "replied"
                      ? "Aucun avis répondu pour l’instant — commencez par les avis « À traiter »."
                      : "Aucun avis reçu pour l’instant — encouragez vos clients à noter vos stations depuis l’app mobile."}
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* ---------- Rapport réputation imprimable (A4, PDF via la boîte d'impression) ----------
          Rendu dans un portail <body> : masqué à l'écran, seul visible à l'impression. */}
      {typeof document !== "undefined" && createPortal(
        <div id="cs-reputation-print" className="hidden bg-white text-slate-900">
          <style>{PRINT_CSS}</style>

          {/* En-tête */}
          <div className="flex items-end justify-between border-b-2 border-emerald-700 pb-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700 text-white">
                <Fuel className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <h1 className="text-[19px] font-black leading-tight">Rapport de réputation — {brand.name}</h1>
                <p className="text-[11px] text-slate-600">
                  Portail enseigne CarbuScope · généré le {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">IVE — Indice de valeur</p>
              <p className="text-3xl font-black leading-none text-emerald-700">{ive.score}<span className="text-sm text-slate-400">/100</span></p>
              <p className="text-[10.5px] text-slate-600">{ive.rank}<sup>e</sup> sur {ive.brandsCount} enseignes</p>
            </div>
          </div>

          {/* Synthèse */}
          <p className="mt-3 text-[12px] leading-relaxed text-slate-700">
            L’enseigne <strong>{brand.name}</strong> est notée <strong>{own.avgRating.toFixed(1).replace(".", ",")}/5</strong> sur{" "}
            <strong>{num(own.reviewsCount)} avis</strong> (marché : {market.avgRating.toFixed(1).replace(".", ",")}/5), avec{" "}
            <strong>{own.stationsWithReviews}/{own.stationsTotal}</strong> stations notées, une part de voix de{" "}
            <strong>{own.shareOfVoice} %</strong> et un taux de réponse officielle de <strong>{own.responseRate} %</strong>
            {own.avgReplyDelayHours != null && <> (délai moyen : {Math.max(1, Math.round(own.avgReplyDelayHours))} h)</>}.
          </p>

          {/* KPIs */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { label: "Note client", value: `${own.avgRating.toFixed(1).replace(".", ",")}/5` },
              { label: "Avis reçus", value: num(own.reviewsCount) },
              { label: "Rang concurrentiel", value: `${d.rank}e / ${ive.brandsCount}` },
              { label: "IVE", value: `${ive.score}/100` },
              { label: "Taux de réponse", value: `${own.responseRate} %` },
              { label: "Part de voix", value: `${own.shareOfVoice} %` },
            ].map(k => (
              <div key={k.label} className="rounded-lg border border-slate-300 px-3 py-2">
                <p className="text-[9.5px] font-bold uppercase tracking-wide text-slate-500">{k.label}</p>
                <p className="text-[16px] font-black tabular-nums text-slate-900">{k.value}</p>
              </div>
            ))}
          </div>

          {/* Décomposition IVE */}
          <h2 className="mt-5 border-b border-slate-300 pb-1 text-[13px] font-bold uppercase tracking-wide text-emerald-800">
            Indice de valeur d’enseigne — décomposition
          </h2>
          <table className="mt-1.5 w-full text-[11px]">
            <tbody>
              {ive.details.map(det => (
                <tr key={det.key} className="border-b border-slate-200 align-middle">
                  <td className="w-[38%] py-1.5 pr-2 font-semibold">{det.label}</td>
                  <td className="py-1.5">
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="bar h-full rounded-full bg-emerald-600"
                        style={{ width: `${Math.min(100, Math.round((det.points / det.max) * 100))}%` }}
                      />
                    </div>
                  </td>
                  <td className="w-[70px] py-1.5 pl-2 text-right font-bold tabular-nums">
                    {det.points.toFixed(1).replace(".", ",")}/{det.max}
                  </td>
                </tr>
              ))}
              <tr className="border-b-2 border-slate-400 font-black">
                <td className="py-1.5 pr-2">Score composite</td>
                <td />
                <td className="py-1.5 pl-2 text-right tabular-nums text-emerald-700">{ive.score}/100</td>
              </tr>
            </tbody>
          </table>

          {/* Comparaison marché */}
          <h2 className="mt-5 border-b border-slate-300 pb-1 text-[13px] font-bold uppercase tracking-wide text-emerald-800">
            Comparaison concurrentielle ({ive.brandsCount} enseignes)
          </h2>
          <table className="mt-1.5 w-full text-[11px]">
            <thead>
              <tr className="border-b-2 border-slate-400 text-left">
                <th className="py-1 pr-2 font-semibold">Enseigne</th>
                <th className="py-1 px-2 text-right font-semibold">Note</th>
                <th className="py-1 px-2 text-right font-semibold">Avis</th>
                <th className="py-1 px-2 text-right font-semibold">Taux de réponse</th>
                <th className="py-1 pl-2 text-right font-semibold">IVE indicatif</th>
              </tr>
            </thead>
            <tbody>
              {market.brandComparison.map(b => (
                <tr
                  key={b.slug}
                  className={`border-b border-slate-200 ${b.slug === brand.slug ? "bg-emerald-50 font-bold" : ""}`}
                >
                  <td className="py-1.5 pr-2">{b.name}{b.slug === brand.slug ? " (moi)" : ""}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{b.avgRating.toFixed(1).replace(".", ",")}/5</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{num(b.reviewsCount)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{b.responseRate} %</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">{b.valueIndex}/100</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Distribution + critères */}
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <h2 className="border-b border-slate-300 pb-1 text-[12px] font-bold uppercase tracking-wide text-emerald-800">
                Distribution des notes
              </h2>
              <table className="mt-1.5 w-full text-[10.5px]">
                <thead>
                  <tr className="border-b border-slate-300 text-left">
                    <th className="py-1 font-semibold">Étoiles</th>
                    <th className="py-1 text-right font-semibold">Moi</th>
                    <th className="py-1 text-right font-semibold">Marché</th>
                  </tr>
                </thead>
                <tbody>
                  {d.dist.map(row => (
                    <tr key={row.etoiles} className="border-b border-slate-200">
                      <td className="py-1">{row.etoiles}</td>
                      <td className="py-1 text-right font-semibold tabular-nums">{row.moi.toFixed(1).replace(".", ",")} %</td>
                      <td className="py-1 text-right tabular-nums text-slate-600">{row.marche.toFixed(1).replace(".", ",")} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h2 className="border-b border-slate-300 pb-1 text-[12px] font-bold uppercase tracking-wide text-emerald-800">
                Critères notés par les clients
              </h2>
              <table className="mt-1.5 w-full text-[10.5px]">
                <thead>
                  <tr className="border-b border-slate-300 text-left">
                    <th className="py-1 font-semibold">Critère</th>
                    <th className="py-1 text-right font-semibold">Moi</th>
                    <th className="py-1 text-right font-semibold">Marché</th>
                  </tr>
                </thead>
                <tbody>
                  {d.radar.map(row => (
                    <tr key={row.critere} className="border-b border-slate-200">
                      <td className="py-1">{row.critere}</td>
                      <td className="py-1 text-right font-semibold tabular-nums">{row.moi.toFixed(1).replace(".", ",")}/5</td>
                      <td className="py-1 text-right tabular-nums text-slate-600">{row.marche.toFixed(1).replace(".", ",")}/5</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top 5 / Flop 5 */}
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <h2 className="border-b border-slate-300 pb-1 text-[12px] font-bold uppercase tracking-wide text-emerald-800">
                Top 5 stations (≥ 3 avis)
              </h2>
              <table className="mt-1.5 w-full text-[10.5px]">
                <tbody>
                  {own.topStations.map(s => (
                    <tr key={s.code} className="border-b border-slate-200">
                      <td className="py-1 pr-1 font-semibold">{s.name}</td>
                      <td className="py-1 text-right text-slate-600">{s.gouvernorat}</td>
                      <td className="py-1 pl-2 text-right font-bold tabular-nums text-emerald-700">
                        {s.rating.toFixed(1).replace(".", ",")}/5
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h2 className="border-b border-slate-300 pb-1 text-[12px] font-bold uppercase tracking-wide text-amber-700">
                Flop 5 stations (≥ 3 avis)
              </h2>
              <table className="mt-1.5 w-full text-[10.5px]">
                <tbody>
                  {own.flopStations.map(s => (
                    <tr key={s.code} className="border-b border-slate-200">
                      <td className="py-1 pr-1 font-semibold">{s.name}</td>
                      <td className="py-1 text-right text-slate-600">{s.gouvernorat}</td>
                      <td className="py-1 pl-2 text-right font-bold tabular-nums text-amber-700">
                        {s.rating.toFixed(1).replace(".", ",")}/5
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Surveillance des notes */}
          {own.watchlist.length > 0 && (
            <>
              <h2 className="mt-5 border-b border-slate-300 pb-1 text-[13px] font-bold uppercase tracking-wide text-red-700">
                Surveillance — {own.watchlist.length} station{own.watchlist.length > 1 ? "s" : ""} en perte de vitesse
              </h2>
              <table className="mt-1.5 w-full text-[10.5px]">
                <thead>
                  <tr className="border-b-2 border-slate-400 text-left">
                    <th className="py-1 pr-2 font-semibold">Station</th>
                    <th className="py-1 px-2 font-semibold">Gouvernorat</th>
                    <th className="py-1 px-2 text-right font-semibold">Note antérieure</th>
                    <th className="py-1 px-2 text-right font-semibold">Note récente</th>
                    <th className="py-1 pl-2 text-right font-semibold">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {own.watchlist.map(w => (
                    <tr key={w.code} className="border-b border-slate-200">
                      <td className="py-1.5 pr-2 font-semibold">{w.name}</td>
                      <td className="py-1.5 px-2">{w.gouvernorat}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{w.previousRating.toFixed(1).replace(".", ",")}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{w.currentRating.toFixed(1).replace(".", ",")}</td>
                      <td className="py-1.5 pl-2 text-right font-bold tabular-nums text-red-700">
                        −{Math.abs(w.delta).toFixed(1).replace(".", ",")} pt
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <p className="mt-5 border-t border-slate-300 pt-2 text-[9.5px] leading-snug text-slate-500">
            Rapport généré depuis le portail enseigne CarbuScope — onglet « Avis &amp; réputation ». Données issues de la
            communauté et des vérifications terrain. IVE = note client (35 pts) + volume d’avis (15 pts) + expérience réseau
            (15 pts) + fraîcheur (15 pts) + taux de réponse (20 pts).
          </p>
        </div>,
        document.body
      )}
    </div>
  )
}
