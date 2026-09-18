'use client'

// D.2.6 — Veille & alertes (vue consolidée back-office) :
// toutes les alertes email programmées de toutes les enseignes, moteur
// périodique d'évaluation (planificateur réel mini-services/veil-scheduler,
// passe SCHEDULED quotidienne 08:00 Tunis — état de santé live), rapport
// détaillé par passe (filtrable par enseigne, imprimable), historique,
// agrégats et tableau par enseigne.

import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import {
  BellRing, Play, Radar, Mail, Clock, PauseCircle, Eye, ChevronDown,
  Zap, Store, TrendingDown, RefreshCw, History, Inbox, CalendarClock, Loader2, Download,
  Printer, ServerCog, Activity, Gauge, PlugZap,
} from "lucide-react"
import { toast } from "sonner"
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { KpiCard } from "@/components/shell/kpi-card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { AXIS_STYLE, GRID_STROKE, tooltipStyle } from "@/lib/chart"
import type { AlertRunDTO, AlertRunDetail, WatchlistOverviewResponse } from "@/lib/types"
import { fmtDateTime, relDays } from "@/components/settings/settings-shared"
import { cn } from "@/lib/utils"

const FREQ_META: Record<string, { label: string; cls: string }> = {
  IMMEDIATE: { label: "Immédiat", cls: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400" },
  DAILY: { label: "Quotidien", cls: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400" },
  WEEKLY: { label: "Hebdo", cls: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400" },
}

const STATUS_META: Record<string, { label: string; dot: string; cls: string }> = {
  TRIGGERED: {
    label: "Email envoyé",
    dot: "bg-red-500",
    cls: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400",
  },
  STABLE: {
    label: "Situation stable",
    dot: "bg-emerald-500",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  },
  SKIPPED: {
    label: "Non due — déjà notifiée",
    dot: "bg-slate-400",
    cls: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
  },
}

const fr1 = (n: number) => n.toFixed(1).replace(".", ",")

// ---------- Planificateur (mini-service veil-scheduler, port 3035) ----------
// État de santé live interrogé via la passerelle (XTransformPort). Repli
// statique gracieux si le service ne répond pas.
type SchedulerStatus = {
  service: string
  ok: boolean
  timezone: string
  scheduleHour: number
  nextRunAt: string
  nextRunInMin: number
  nextRunLabel: string
  uptimeSec: number
  journal?: { at: string; ok: boolean; mode: string; triggeredAlerts?: number; error?: string }[]
}

function fmtCountdown(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h} h ${m.toString().padStart(2, "0")}` : `${h} h`
}

// Feuille d'impression du rapport de passe : seul le nœud portail
// #cs-run-print reste visible à l'impression.
const RUN_PRINT_CSS = `
@media print {
  body > *:not(#cs-run-print) { display: none !important; }
  #cs-run-print { display: block !important; }
  #cs-run-print .bar { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
@page { size: A4 portrait; margin: 12mm; }
`

// Export CSV de l'inventaire consolidé des alertes (BOM UTF-8, « ; »).
function exportAlertsCsv(data: WatchlistOverviewResponse) {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = [
    "Enseigne", "Alertes actives", "Alertes total", "Stations en watchlist",
    "Pire chute (station)", "Chute (pt)", "Alertes immédiates", "Alertes quotidiennes",
    "Alertes hebdomadaires", "Déclenchements cumulés", "Dernier envoi",
  ]
  const rows = data.brands.map(b => [
    esc(b.name), b.alertsActive, b.alertsTotal, b.watchlistCount,
    esc(b.worstDropName), b.worstDropDelta === null ? "" : fr1(b.worstDropDelta),
    b.immediate, b.daily, b.weekly, b.totalTriggers,
    esc(b.lastTriggeredAt ? new Date(b.lastTriggeredAt).toLocaleString("fr-FR") : ""),
  ].join(";"))
  const csv = ["\uFEFF" + header.join(";"), ...rows].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `veille-alertes-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  toast.success(`Inventaire exporté — ${data.brands.length} enseignes, ${data.totals.alertsTotal} alertes.`, {
    description: "veille-alertes.csv · compatible Excel (UTF-8, séparateur « ; »)",
  })
}

function freqChip(freq: string) {
  const m = FREQ_META[freq] ?? { label: freq, cls: "" }
  return (
    <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px] font-medium", m.cls)}>
      {m.label}
    </Badge>
  )
}

function statusBadge(status: string) {
  const m = STATUS_META[status] ?? { label: status, dot: "bg-slate-400", cls: "" }
  return (
    <Badge variant="outline" className={cn("gap-1.5 px-2 py-0.5 text-[10px] font-medium", m.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} aria-hidden />
      {m.label}
    </Badge>
  )
}

export function BoAlerts() {
  const [data, setData] = useState<WatchlistOverviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [previewAlertId, setPreviewAlertId] = useState<string | null>(null)
  const [justRanId, setJustRanId] = useState<string | null>(null)
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null)
  const [schedulerUp, setSchedulerUp] = useState<boolean | null>(null)
  const [brandFilter, setBrandFilter] = useState<string>("ALL")
  const [printOpen, setPrintOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/watchlist-alerts/overview?runs=12")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as WatchlistOverviewResponse
      setData(j)
      setError(null)
    } catch {
      setError("Impossible de charger la veille consolidée.")
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void load()
    return () => ac.abort()
  }, [load])

  // État de santé du planificateur réel (mini-service veil-scheduler:3035,
  // via la passerelle). Repli silencieux si le service est arrêté.
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const r = await fetch("/status?XTransformPort=3035", { cache: "no-store", signal: AbortSignal.timeout(4000) })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = (await r.json()) as SchedulerStatus
        if (!cancelled) { setScheduler(j); setSchedulerUp(true) }
      } catch {
        if (!cancelled) setSchedulerUp(false)
      }
    }
    void poll()
    const id = setInterval(() => void poll(), 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Passe sélectionnée : run explicite, sinon la plus récente.
  const selectedRun: AlertRunDTO | null = useMemo(
    () => data?.runs.find(r => r.id === selectedRunId) ?? data?.runs[0] ?? null,
    [data, selectedRunId],
  )

  // Détails de la passe filtrés par enseigne (T20 — filtre historique).
  const filteredDetails = useMemo(
    () => selectedRun
      ? selectedRun.details.filter(d => brandFilter === "ALL" || d.brandSlug === brandFilter)
      : [],
    [selectedRun, brandFilter],
  )

  // Agrégats plateforme sur l'historique des passes (T20 — moyennes).
  const aggregates = useMemo(() => {
    if (!data || data.runs.length === 0) return null
    const n = data.runs.length
    const avgStations = data.runs.reduce((a, r) => a + r.stationsFlagged, 0) / n
    const evaluated = data.runs.reduce((a, r) => a + r.evaluatedAlerts, 0)
    const triggered = data.runs.reduce((a, r) => a + r.triggeredAlerts, 0)
    return {
      avgStations: Math.round(avgStations * 10) / 10,
      triggerRate: evaluated > 0 ? Math.round((triggered / evaluated) * 100) : 0,
      passes: n,
    }
  }, [data])

  // Impression du rapport de passe : rendu du portail puis fenêtre d'impression.
  const printReport = useCallback(() => {
    if (!selectedRun) return
    setPrintOpen(true)
    window.setTimeout(() => {
      window.print()
      setPrintOpen(false)
    }, 600)
  }, [selectedRun])

  // Série temporelle pour le mini graphique (oldest → newest).
  const chartData = useMemo(() => {
    if (!data) return []
    return [...data.runs].reverse().map(r => ({
      date: new Date(r.ranAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
      stations: r.stationsFlagged,
      alertes: r.triggeredAlerts,
    }))
  }, [data])

  const runEngine = useCallback(async () => {
    if (running) return
    setRunning(true)
    try {
      const r = await fetch("/api/watchlist-alerts/run", { method: "POST" })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as { run: AlertRunDTO }
      await load()
      setSelectedRunId(j.run.id)
      setPreviewAlertId(null)
      setJustRanId(j.run.id)
      setTimeout(() => setJustRanId(null), 8000)
      toast.success(
        j.run.triggeredAlerts > 0
          ? `Passe exécutée — ${j.run.triggeredAlerts} alerte(s) déclenchée(s), ${j.run.stationsFlagged} stations signalées.`
          : "Passe exécutée — aucune alerte n'a dépassé son seuil.",
        { description: `Moteur de veille · ${j.run.evaluatedAlerts} alertes évaluées en ${j.run.durationMs} ms.` },
      )
    } catch {
      toast.error("La passe de veille a échoué — réessayez.")
    } finally {
      setRunning(false)
    }
  }, [running, load])

  const t = data?.totals

  return (
    <div className="space-y-4">
      {/* ---------- KPIs consolidés + agrégats ---------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Alertes actives"
          value={t ? `${t.alertsActive}/${t.alertsTotal}` : "…"}
          icon={BellRing}
          tone="default"
          sub={t ? `${t.brandsCovered} enseignes couvertes` : undefined}
        />
        <KpiCard
          label="Déclenchements cumulés"
          value={t ? t.totalTriggers : "…"}
          icon={Zap}
          tone="warning"
          sub="depuis la mise en service"
        />
        <KpiCard
          label="Emails en file"
          value={t ? t.emailsQueuedLastRun : "…"}
          icon={Mail}
          tone="info"
          sub={t?.lastRunAt ? `dernière passe : ${relDays(t.lastRunAt)}` : "aucune passe"}
        />
        <KpiCard
          label="Prochaine passe"
          value={scheduler
            ? scheduler.nextRunLabel
            : t?.nextScheduledAt ? fmtNextPass(t.nextScheduledAt) : "—"}
          icon={CalendarClock}
          tone="success"
          sub={scheduler
            ? `dans ${fmtCountdown(scheduler.nextRunInMin)} — planificateur live`
            : "planifiée chaque jour à 08:00"}
        />
        <KpiCard
          label="Volume moyen / passe"
          value={aggregates ? fr1(aggregates.avgStations) : "…"}
          icon={Gauge}
          tone="default"
          sub={aggregates ? `${aggregates.passes} passes tracées` : undefined}
        />
        <KpiCard
          label="Taux de déclenchement"
          value={aggregates ? `${aggregates.triggerRate} %` : "…"}
          icon={Activity}
          tone={aggregates && aggregates.triggerRate >= 50 ? "warning" : "default"}
          sub={aggregates ? "alertes déclenchées / évaluées" : undefined}
        />
      </div>

      {error && (
        <Card className="border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/40">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-red-700 dark:text-red-400">
            <Inbox className="h-4 w-4 shrink-0" aria-hidden /> {error}
          </CardContent>
        </Card>
      )}

      {!data && !error && (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-5">
          {/* ---------- Moteur de veille + historique ---------- */}
          <div className="space-y-4 lg:col-span-2">
            <Card className="overflow-hidden">
              <CardHeader className="bg-gradient-to-br from-emerald-50/80 via-transparent to-transparent pb-4 dark:from-emerald-950/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                      <Radar className="h-4.5 w-4.5" aria-hidden />
                    </div>
                    <div>
                      <CardTitle className="text-base leading-tight">Moteur de veille</CardTitle>
                      <CardDescription className="mt-0.5 text-xs">
                        Évalue toutes les alertes actives contre l&apos;état live du terrain
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Chaque passe parcourt les <strong className="text-foreground">{t?.alertsActive ?? 0} alertes actives</strong> des{" "}
                  <strong className="text-foreground">{t?.brandsCovered ?? 0} enseignes</strong>, recalcule la watchlist
                  (chutes ≥ 0,8 pt sur avis ≤ 90 j), honore les fréquences (les digests déjà envoyés ne sont pas
                  re-notifiés) et met les emails en file — puis laisse une notification in-app à chaque enseigne
                  concernée (cloche du portail).
                </p>

                {/* État de santé du planificateur réel (mini-service) */}
                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5",
                    schedulerUp
                      ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/40"
                      : "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/40",
                  )}
                  aria-live="polite"
                >
                  <div className="flex items-center gap-2.5">
                    <span className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md",
                      schedulerUp
                        ? "bg-emerald-600 text-white"
                        : "bg-amber-500 text-white",
                    )} aria-hidden>
                      {schedulerUp ? <PlugZap className="h-3.5 w-3.5" /> : <ServerCog className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold">
                        {schedulerUp ? "Planificateur actif" : "Planificateur injoignable"}
                        {schedulerUp && (
                          <span className="relative flex h-1.5 w-1.5" aria-hidden>
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {scheduler
                          ? <>Passe <strong className="text-foreground">SCHEDULED</strong> quotidienne à 08:00 ({scheduler.timezone.split("/")[1]}) · dans {fmtCountdown(scheduler.nextRunInMin)} · en ligne depuis {scheduler.uptimeSec < 3600 ? `${Math.max(1, Math.round(scheduler.uptimeSec / 60))} min` : `${Math.round(scheduler.uptimeSec / 3600)} h`}</>
                          : "Service veil-scheduler:3035 — repli sur l’heure calculée côté application."}
                      </p>
                    </div>
                  </div>
                  {scheduler?.journal && scheduler.journal.length > 0 && (
                    <Badge
                      variant="outline"
                      className="h-5 gap-1 border-border/70 bg-background/80 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground"
                    >
                      <Activity className="h-3 w-3" aria-hidden />
                      {scheduler.journal.length} passe{scheduler.journal.length > 1 ? "s" : ""} service
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => void runEngine()}
                    disabled={running}
                    className="gap-2 bg-emerald-600 text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow-md focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                    aria-label="Exécuter une passe du moteur de veille maintenant"
                  >
                    {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                    {running ? "Évaluation en cours…" : "Exécuter la veille maintenant"}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => void load()}
                    aria-label="Rafraîchir les données de veille"
                    className="h-9 w-9 transition-transform hover:rotate-180 hover:bg-muted/60"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden />
                  </Button>
                </div>

                {/* Historique : timeline verticale + filtre par enseigne */}
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <History className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Historique des passes
                      </p>
                    </div>
                    <Select
                      value={brandFilter}
                      onValueChange={setBrandFilter}
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-7 w-auto min-w-36 gap-1 border-border/70 bg-background/80 text-[11px]"
                        aria-label="Filtrer le rapport de passe par enseigne"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL" className="text-xs">Toutes les enseignes</SelectItem>
                        {data.brands.map(b => (
                          <SelectItem key={b.slug} value={b.slug} className="text-xs">
                            <span className="flex items-center gap-1.5">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: b.color }}
                                aria-hidden
                              />
                              {b.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <ScrollArea className="h-[22rem] rounded-lg border bg-background/60 pr-2">
                    <div className="space-y-1 p-2">
                      {data.runs.length === 0 && (
                        <p className="p-4 text-center text-xs text-muted-foreground">
                          Aucune passe enregistrée — exécutez le moteur pour démarrer l&apos;historique.
                        </p>
                      )}
                      {data.runs.map(run => {
                        const isSelected = selectedRun?.id === run.id
                        // Compteurs filtrés par enseigne si un filtre est actif.
                        const brandDetails = brandFilter === "ALL"
                          ? null
                          : run.details.filter(d => d.brandSlug === brandFilter)
                        const shownTriggered = brandDetails
                          ? brandDetails.filter(d => d.status === "TRIGGERED").length
                          : run.triggeredAlerts
                        const shownFlagged = brandDetails
                          ? brandDetails.reduce((a, d) => a + (d.status === "TRIGGERED" ? d.exceedCount : 0), 0)
                          : run.stationsFlagged
                        return (
                          <button
                            key={run.id}
                            onClick={() => { setSelectedRunId(run.id); setPreviewAlertId(null) }}
                            aria-pressed={isSelected}
                            className={cn(
                              "group relative w-full rounded-lg border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                              isSelected
                                ? "border-emerald-300 bg-emerald-50/70 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/50"
                                : "border-transparent hover:border-border hover:bg-muted/40",
                              justRanId === run.id && "ring-2 ring-emerald-400 ring-offset-1",
                            )}
                          >
                            <div className="flex items-start gap-2.5">
                              <span
                                className={cn(
                                  "mt-1 h-2 w-2 shrink-0 rounded-full ring-2",
                                  run.mode === "SCHEDULED"
                                    ? "bg-purple-500 ring-purple-100 dark:ring-purple-950"
                                    : "bg-amber-500 ring-amber-100 dark:ring-amber-950",
                                )}
                                aria-hidden
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="text-xs font-semibold">
                                    {fmtDateTime(run.ranAt)}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "h-4.5 px-1.5 py-0 text-[10px]",
                                      run.mode === "SCHEDULED"
                                        ? "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400"
                                        : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400",
                                    )}
                                  >
                                    {run.mode === "SCHEDULED" ? "Planifiée" : "Manuelle"}
                                  </Badge>
                                  {justRanId === run.id && (
                                    <Badge className="h-4.5 animate-in fade-in slide-in-from-left-2 px-1.5 py-0 text-[10px]">
                                      À l&apos;instant
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-red-700 dark:bg-red-950 dark:text-red-400">
                                    <Mail className="h-3 w-3" aria-hidden /> {shownTriggered} email{shownTriggered > 1 ? "s" : ""}
                                  </span>
                                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                                    <TrendingDown className="h-3 w-3" aria-hidden /> {shownFlagged} station{shownFlagged > 1 ? "s" : ""}
                                  </span>
                                  {brandFilter === "ALL" && (
                                    <span className="inline-flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
                                      <Clock className="h-3 w-3" aria-hidden /> {run.durationMs} ms
                                    </span>
                                  )}
                                  {brandFilter === "ALL" && run.skippedAlerts > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                      <PauseCircle className="h-3 w-3" aria-hidden /> {run.skippedAlerts} non due{run.skippedAlerts > 1 ? "s" : ""}
                                    </span>
                                  )}
                                  {brandDetails && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                                      périmètre filtré
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ---------- Rapport de passe sélectionnée ---------- */}
          <div className="space-y-4 lg:col-span-3">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                      <Zap className="h-4 w-4" aria-hidden />
                    </div>
                    <div>
                      <CardTitle className="text-base leading-tight">Rapport de passe</CardTitle>
                      <CardDescription className="mt-0.5 text-xs">
                        {selectedRun
                          ? `${fmtDateTime(selectedRun.ranAt)} — ${selectedRun.mode === "SCHEDULED" ? "passe planifiée" : "passe manuelle"}${brandFilter !== "ALL" ? " · enseigne filtrée" : ""}`
                          : "Aucune passe sélectionnée"}
                      </CardDescription>
                    </div>
                  </div>
                  {selectedRun && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {brandFilter !== "ALL" && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                        >
                          {data.brands.find(b => b.slug === brandFilter)?.name ?? brandFilter} · {filteredDetails.length} ligne{filteredDetails.length > 1 ? "s" : ""}
                        </Badge>
                      )}
                      <Badge variant="outline" className="gap-1 tabular-nums">
                        <Store className="h-3 w-3" aria-hidden /> {selectedRun.brandsCovered} enseignes
                      </Badge>
                      <Badge variant="outline" className="gap-1 tabular-nums">
                        <BellRing className="h-3 w-3" aria-hidden /> {selectedRun.evaluatedAlerts} évaluées
                      </Badge>
                      <Badge variant="outline" className="gap-1 tabular-nums">
                        <Mail className="h-3 w-3" aria-hidden /> {selectedRun.emailsQueued} email{selectedRun.emailsQueued > 1 ? "s" : ""}
                      </Badge>
                      <Badge variant="outline" className="gap-1 tabular-nums">
                        <Clock className="h-3 w-3" aria-hidden /> {selectedRun.durationMs} ms
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={printReport}
                        disabled={printOpen}
                        className="h-7 gap-1.5 px-2 text-[11px] transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:border-emerald-800 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
                        aria-label="Imprimer le rapport de passe (PDF via impression navigateur)"
                      >
                        <Printer className="h-3 w-3" aria-hidden /> Rapport PDF
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {!selectedRun && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Sélectionnez une passe dans l&apos;historique ou exécutez le moteur.
                  </p>
                )}
                {selectedRun && filteredDetails.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {brandFilter === "ALL"
                      ? "Aucune alerte active lors de cette passe."
                      : "Aucune alerte pour l’enseigne filtrée lors de cette passe."}
                  </p>
                )}
                {filteredDetails.map(d => (
                  <RunDetailRow
                    key={d.alertId}
                    detail={d}
                    previewOpen={previewAlertId === d.alertId}
                    onTogglePreview={() => setPreviewAlertId(prev => (prev === d.alertId ? null : d.alertId))}
                  />
                ))}
              </CardContent>
            </Card>

            {/* Mini graphique : volume de stations signalées par passe */}
            {chartData.length >= 2 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Volume signalé par passe</CardTitle>
                  <CardDescription className="text-xs">
                    Stations en perte de vitesse détectées (barres) et alertes déclenchées (courbe) sur les{" "}
                    {chartData.length} dernières passes
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                      <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ ...AXIS_STYLE, fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="left" tick={{ ...AXIS_STYLE, fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis yAxisId="right" orientation="right" tick={{ ...AXIS_STYLE, fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={26} />
                      <Tooltip
                        contentStyle={tooltipStyle()}
                        formatter={(value: number | string, name: string) => [
                          value,
                          name === "stations" ? "Stations signalées" : "Alertes déclenchées",
                        ]}
                      />
                      <Bar yAxisId="left" dataKey="stations" fill="#d97706" radius={[3, 3, 0, 0]} maxBarSize={26} />
                      <Line yAxisId="right" type="monotone" dataKey="alertes" stroke="#059669" strokeWidth={2} dot={{ r: 2.5, fill: "#059669" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ---------- Tableau consolidé par enseigne ---------- */}
      {data && data.brands.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Alertes programmées par enseigne</CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Vue consolidée des {t?.alertsTotal ?? 0} alertes de veille actives sur la plateforme —
                  périmètres, fréquences et déclenchements
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <BellRing className="h-3 w-3" aria-hidden /> {t?.alertsActive ?? 0} actives
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportAlertsCsv(data)}
                  className="h-7 gap-1.5 px-2 text-[11px] transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:border-emerald-800 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
                  aria-label="Exporter l'inventaire consolidé des alertes en CSV"
                >
                  <Download className="h-3 w-3" aria-hidden /> Exporter CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Enseigne</TableHead>
                    <TableHead className="text-center">Alertes</TableHead>
                    <TableHead className="text-center">Watchlist</TableHead>
                    <TableHead>Pire chute</TableHead>
                    <TableHead className="text-center">Fréquences</TableHead>
                    <TableHead className="text-right">Déclenchements</TableHead>
                    <TableHead className="pr-4 text-right">Dernier envoi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.brands.map(b => (
                    <TableRow
                      key={b.slug}
                      className="transition-colors hover:bg-muted/50 focus-within:bg-muted/50"
                    >
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-muted-foreground/10"
                            style={{ backgroundColor: b.color }}
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{b.name}</p>
                            <p className="text-[10px] text-muted-foreground">{b.activeEmails} destinataire{b.activeEmails > 1 ? "s" : ""}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-semibold tabular-nums">{b.alertsActive}</span>
                        <span className="text-muted-foreground">/{b.alertsTotal}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            "gap-1 tabular-nums",
                            b.watchlistCount > 5
                              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
                              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400",
                          )}
                        >
                          <TrendingDown className="h-3 w-3" aria-hidden /> {b.watchlistCount}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {b.worstDropName ? (
                          <div className="flex flex-col">
                            <span className="max-w-44 truncate text-xs">{b.worstDropName}</span>
                            <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">
                              −{fr1(b.worstDropDelta ?? 0)} pt
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-wrap justify-center gap-1">
                          {b.immediate > 0 && (
                            <Badge variant="outline" className="px-1 py-0 text-[10px] tabular-nums">
                              {b.immediate} × immédiat
                            </Badge>
                          )}
                          {b.daily > 0 && (
                            <Badge variant="outline" className="px-1 py-0 text-[10px] tabular-nums">
                              {b.daily} × quotidien
                            </Badge>
                          )}
                          {b.weekly > 0 && (
                            <Badge variant="outline" className="px-1 py-0 text-[10px] tabular-nums">
                              {b.weekly} × hebdo
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{b.totalTriggers}</TableCell>
                      <TableCell className="pr-4 text-right text-xs text-muted-foreground">
                        {relDays(b.lastTriggeredAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- Rapport de passe imprimable (T20 — PDF navigateur) ---------- */}
      {typeof document !== "undefined" && selectedRun && createPortal(
        <div id="cs-run-print" className="hidden bg-white text-slate-900">
          <style>{RUN_PRINT_CSS}</style>
          <div className="mx-auto max-w-[720px] px-2 py-6 font-sans text-[11px] leading-relaxed">
            {/* En-tête */}
            <div className="flex items-start justify-between border-b-2 border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-lg font-black text-white">
                  C
                </div>
                <div>
                  <p className="text-base font-black tracking-tight">CarbuScope — Rapport de passe de veille</p>
                  <p className="text-[10px] text-slate-500">
                    Back-office plateforme · Moteur de veille des notes (C.2.6+)
                  </p>
                </div>
              </div>
              <div className="text-right text-[10px] text-slate-500">
                <p className="font-semibold text-slate-800">{fmtDateTime(selectedRun.ranAt)}</p>
                <p>{selectedRun.mode === "SCHEDULED" ? "Passe planifiée (08:00 Tunis)" : "Passe manuelle"}</p>
              </div>
            </div>

            {/* Synthèse chiffrée */}
            <div className="mt-4 grid grid-cols-5 gap-2">
              {[
                { k: "Enseignes couvertes", v: selectedRun.brandsCovered },
                { k: "Alertes évaluées", v: selectedRun.evaluatedAlerts },
                { k: "Alertes déclenchées", v: selectedRun.triggeredAlerts },
                { k: "Stations signalées", v: selectedRun.stationsFlagged },
                { k: "Durée", v: `${selectedRun.durationMs} ms` },
              ].map(c => (
                <div key={c.k} className="rounded-md border border-slate-200 bg-slate-50 p-2 text-center">
                  <p className="text-base font-black tabular-nums text-slate-900">{c.v}</p>
                  <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">{c.k}</p>
                </div>
              ))}
            </div>

            {/* Tableau par alerte */}
            <p className="mt-5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Détail par alerte {brandFilter !== "ALL" && `— périmètre : ${data?.brands.find(b => b.slug === brandFilter)?.name ?? brandFilter}`}
            </p>
            <table className="mt-1.5 w-full border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100 text-left">
                  <th className="px-2 py-1.5 font-bold">Enseigne</th>
                  <th className="px-2 py-1.5 font-bold">Périmètre</th>
                  <th className="px-2 py-1.5 font-bold">Fréquence</th>
                  <th className="px-2 py-1.5 font-bold">Statut</th>
                  <th className="px-2 py-1.5 text-right font-bold">Stations</th>
                  <th className="px-2 py-1.5 font-bold">Exemples de chutes</th>
                </tr>
              </thead>
              <tbody>
                {filteredDetails.map(d => (
                  <tr key={d.alertId} className="border-b border-slate-200 align-top">
                    <td className="px-2 py-1.5">
                      <span className="font-semibold" style={{ color: d.brandColor }}>{d.brandName}</span>
                    </td>
                    <td className="px-2 py-1.5">{d.stationLabel}</td>
                    <td className="px-2 py-1.5">{FREQ_META[d.frequency]?.label ?? d.frequency}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className="rounded px-1.5 py-0.5 font-semibold"
                        style={{
                          backgroundColor: d.status === "TRIGGERED" ? "#fee2e2" : d.status === "STABLE" ? "#d1fae5" : "#f1f5f9",
                          color: d.status === "TRIGGERED" ? "#b91c1c" : d.status === "STABLE" ? "#047857" : "#475569",
                        }}
                      >
                        {STATUS_META[d.status]?.label ?? d.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums">
                      {d.status === "TRIGGERED" ? d.exceedCount : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-slate-600">
                      {d.examples.length > 0
                        ? d.examples.map(ex => `${ex.name} (${ex.gouvernorat}) : ${fr1(ex.previousRating)} → ${fr1(ex.currentRating)} (−${fr1(ex.delta)} pt)`).join(" ; ")
                        : "—"}
                    </td>
                  </tr>
                ))}
                {filteredDetails.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-slate-500">
                      Aucune alerte {brandFilter !== "ALL" ? "pour l'enseigne filtrée " : ""}lors de cette passe.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Pied méthodologique */}
            <div className="mt-6 border-t border-slate-300 pt-2.5 text-[9px] leading-relaxed text-slate-500">
              <p>
                Méthodologie : la passe évalue chaque alerte active contre la watchlist recalculée (chute ≥ seuil
                sur avis ≤ 90 j). Les fréquences sont honorées — un digest déjà envoyé n&apos;est pas re-notifié.
                Chaque alerte déclenchée met un email en file et laisse une notification in-app à l&apos;enseigne.
                Document généré depuis le back-office CarbuScope — données de démonstration.
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// Ligne de détail d'une passe : statut, périmètre, exemples de chutes, aperçu email.
function RunDetailRow({
  detail,
  previewOpen,
  onTogglePreview,
}: {
  detail: AlertRunDetail
  previewOpen: boolean
  onTogglePreview: () => void
}) {
  const hasEmail = detail.status === "TRIGGERED" && !!detail.preview
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-all",
        detail.status === "TRIGGERED"
          ? "border-red-200 bg-red-50/40 hover:border-red-300 dark:border-red-900/70 dark:bg-red-950/30"
          : detail.status === "SKIPPED"
            ? "border-dashed border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-900/40"
            : "border-emerald-200 bg-emerald-50/30 hover:border-emerald-300 dark:border-emerald-800 dark:bg-emerald-950/20",
        previewOpen && "shadow-sm",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-muted-foreground/10"
          style={{ backgroundColor: detail.brandColor }}
          aria-hidden
        />
        <span className="text-xs font-semibold">{detail.brandName}</span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {detail.stationLabel}
        </span>
        {freqChip(detail.frequency)}
        {statusBadge(detail.status)}
        <span className="ml-auto flex items-center gap-1.5">
          {detail.status === "TRIGGERED" && (
            <Badge variant="outline" className="tabular-nums">
              {detail.exceedCount} station{detail.exceedCount > 1 ? "s" : ""}
            </Badge>
          )}
          {hasEmail && (
            <Button
              variant="outline"
              size="sm"
              onClick={onTogglePreview}
              aria-expanded={previewOpen}
              className={cn(
                "h-7 gap-1.5 px-2 text-[11px] transition-all focus-visible:ring-2 focus-visible:ring-emerald-500",
                previewOpen && "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
              )}
            >
              <Eye className="h-3 w-3" aria-hidden />
              Aperçu email
              <ChevronDown className={cn("h-3 w-3 transition-transform", previewOpen && "rotate-180")} aria-hidden />
            </Button>
          )}
        </span>
      </div>

      {/* Exemples de chutes détectées */}
      {detail.examples.length > 0 && detail.status !== "STABLE" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {detail.examples.map(ex => (
            <span
              key={ex.name}
              className="inline-flex items-center gap-1 rounded-md border border-red-200/70 bg-white/70 px-1.5 py-0.5 text-[10px] text-red-700 dark:border-red-900/60 dark:bg-slate-900/60 dark:text-red-400"
              title={`${ex.name} (${ex.gouvernorat}) — ${fr1(ex.previousRating)} → ${fr1(ex.currentRating)}`}
            >
              <TrendingDown className="h-3 w-3" aria-hidden />
              <span className="max-w-36 truncate">{ex.name}</span>
              <span className="font-semibold tabular-nums">−{fr1(ex.delta)}</span>
            </span>
          ))}
          {detail.exceedCount > detail.examples.length && (
            <span className="text-[10px] text-muted-foreground">
              +{detail.exceedCount - detail.examples.length} autre{detail.exceedCount - detail.examples.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Email tel qu'envoyé */}
      {previewOpen && hasEmail && (
        <div className="mt-2.5 animate-in fade-in slide-in-from-top-1 rounded-lg border bg-background p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold">
            <Mail className="h-3 w-3 text-emerald-600" aria-hidden />
            Objet : <span className="font-normal">{detail.subject}</span>
          </p>
          <p className="mb-1 text-[10px] text-muted-foreground">
            Destinataire : {detail.email}
          </p>
          <ScrollArea className="h-40 rounded-md bg-muted/60 p-2.5">
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/90">
              {detail.preview}
            </pre>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

// Prochaine passe : « demain 08:00 » / « aujourd'hui 08:00 ».
function fmtNextPass(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const isTomorrow = d.getDate() === today.getDate() + 1
    || (today.getDate() === new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() && d.getDate() === 1)
  return `${isTomorrow ? "demain" : "aujourd'hui"} 08:00`
}
