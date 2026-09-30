'use client'

// CarbuScope — Onglet « Veille terrain » du portail enseigne, section C :
// « Fiches concurrents » — intelligence concurrentielle : fiche d'identité du
// concurrent (part de marché, note réseau, présence par gouvernorat), pratiques
// observées sur le terrain (rapports de veille ciblant ce concurrent, prix
// relevés face au décret en vigueur) et notes d'intelligence.

import { useEffect, useMemo, useState } from "react"
import {
  Building2, Download, Eye, Gauge, Lightbulb, MapPin, Star,
} from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { fmtDate } from "@/components/settings/settings-shared"
import type { BrandDTO, MissionDTO, MissionDetailDTO, StationDTO, VisitReportDTO } from "@/lib/types"
import { BrandDot, BrandLookup, fmtDt, fmtMillimesDelta, fmtNote } from "./terrain-shared"

// ---------- Types locaux ----------

type MarketShareEntry = { brand: string; slug: string; color: string; stations: number; sharePct: number }
type Fuel = "GAZOLE" | "ESSENCE" | "GPL"
type DecreePrices = Record<Fuel, number>

/** Ligne « observation terrain » : un rapport de veille sur une station concurrente */
type CompetitorRow = {
  taskId: string
  missionId: string
  missionTitle: string
  missionZone: string
  agentName: string | null
  agentCode: string | null
  stationName: string
  stationCode: string | null
  visitedAt: string
  report: VisitReportDTO
}

// ---------- Petits composants ----------

/** Échappe une cellule CSV si nécessaire (guillemets, « ; », sauts de ligne). */
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Millimes → dinars 3 décimales pour CSV (« 1,885 »), vide si absent. */
const csvDt = (millimes: number | null): string =>
  millimes == null
    ? ""
    : (millimes / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })

/**
 * T53-T5 — Export CSV des observations terrain (pattern T52-R2b : séparateur
 * « ; », BOM UTF-8, retours \r\n). Données déjà chargées — aucun fetch.
 * Écarts signés au décret en millimes lorsque les prix en vigueur sont connus.
 */
function exportObservationsCsv(rows: CompetitorRow[], compName: string, decree: DecreePrices | null): void {
  const header = [
    "Date", "Mission", "Zone", "Station", "Code station", "Agent",
    "Gazole (DT)", "Essence (DT)", "GPL (DT)",
    ...(decree ? ["Écart GA (millimes)", "Écart ES (millimes)", "Écart GPL (millimes)"] : []),
    "File (min)", "Propreté (/5)", "Pratiques observées", "Notes",
  ]
  const lines = rows.map(r => [
    fmtDate(r.visitedAt), r.missionTitle, r.missionZone, r.stationName,
    r.stationCode ?? "", r.agentName ?? "",
    csvDt(r.report.gazolePrice), csvDt(r.report.essencePrice), csvDt(r.report.gplPrice),
    ...(decree ? [
      r.report.gazolePrice != null ? r.report.gazolePrice - decree.GAZOLE : "",
      r.report.essencePrice != null ? r.report.essencePrice - decree.ESSENCE : "",
      r.report.gplPrice != null ? r.report.gplPrice - decree.GPL : "",
    ] : []),
    r.report.queueMinutes ?? "", r.report.cleanliness ?? "",
    r.report.competitorPractices ?? "", r.report.notes ?? "",
  ])
  const csv = `\uFEFF${[header, ...lines].map(l => l.map(csvCell).join(";")).join("\r\n")}`
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `carbuscope-veille-${compName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(" ", "-")}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Prix relevé face au décret : « 1,885 DT » + badge « = décret » / « écart ». */
function PriceObs({
  label, millimes, decree,
}: { label: string; millimes: number; decree: number | null }) {
  if (decree == null) {
    return <span className="text-xs tabular-nums">{label} {fmtDt(millimes)}</span>
  }
  const equal = millimes === decree
  const delta = millimes - decree
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs tabular-nums">{label} {fmtDt(millimes)}</span>
      {equal ? (
        <Badge
          variant="outline"
          className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
          title={`Prix en vigueur : ${fmtDt(decree)} — relevé conforme`}
        >
          = décret
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
          title={`Prix en vigueur : ${fmtDt(decree)} — écart ${fmtMillimesDelta(delta)}`}
        >
          écart
        </Badge>
      )}
    </span>
  )
}

/** Bloc « prix relevés » d'un rapport (GA / ES / GPL, valeurs présentes). */
function PricesObs({
  report, decree,
}: { report: VisitReportDTO; decree: DecreePrices | null }) {
  const items: { label: string; millimes: number; ref: number | null }[] = []
  if (report.gazolePrice != null) {
    items.push({ label: "GA", millimes: report.gazolePrice, ref: decree ? decree.GAZOLE : null })
  }
  if (report.essencePrice != null) {
    items.push({ label: "ES", millimes: report.essencePrice, ref: decree ? decree.ESSENCE : null })
  }
  if (report.gplPrice != null) {
    items.push({ label: "GPL", millimes: report.gplPrice, ref: decree ? decree.GPL : null })
  }
  if (items.length === 0) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {items.map(it => (
        <PriceObs key={it.label} label={it.label} millimes={it.millimes} decree={it.ref} />
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Section C — « Fiches concurrents »
// ---------------------------------------------------------------------------

export function TerrainCompetitorsSheet({
  brandSlug, brands, brandOf, ownQueueAvg,
}: {
  brandSlug: string
  brands: BrandDTO[] | null
  brandOf: BrandLookup
  ownQueueAvg: number | null
}) {
  const competitors = useMemo(
    () => (brands ?? []).filter(b => b.slug !== brandSlug).sort((a, b) => b.stationCount - a.stationCount),
    [brands, brandSlug]
  )

  const [selected, setSelected] = useState("")
  // Sélection effective : le concurrent choisi, sinon le plus grand réseau
  // concurrent par défaut (valeur dérivée — pas de setState dans un effet).
  const effectiveSelected = selected || (competitors[0]?.slug ?? "")

  // ----- Parts de marché (non bloquant) -----
  const [market, setMarket] = useState<MarketShareEntry[] | null>(null)
  const [marketFailed, setMarketFailed] = useState(false)
  const [marketRetry, setMarketRetry] = useState(0)
  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/stats/market-share", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { data: MarketShareEntry[] }) => {
        setMarket(j.data)
        setMarketFailed(false)
      })
      .catch(e => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setMarketFailed(true)
      })
    return () => ac.abort()
  }, [marketRetry])

  // ----- Prix du décret en vigueur (badges « = décret » / « écart ») -----
  const [decree, setDecree] = useState<DecreePrices | null>(null)
  const [decreeFailed, setDecreeFailed] = useState(false)
  const [decreeRetry, setDecreeRetry] = useState(0)
  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/prices", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { current: { fuelType: string; priceMillimes: number }[] }) => {
        const map: Partial<DecreePrices> = {}
        for (const c of j.current) {
          if (c.fuelType === "GAZOLE" || c.fuelType === "ESSENCE" || c.fuelType === "GPL") {
            map[c.fuelType] = c.priceMillimes
          }
        }
        if (map.GAZOLE != null && map.ESSENCE != null && map.GPL != null) {
          setDecree(map as DecreePrices)
          setDecreeFailed(false)
        }
      })
      .catch(e => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setDecreeFailed(true)
      })
    return () => ac.abort()
  }, [decreeRetry])

  // ----- Parc du concurrent (note réseau, présence par gouvernorat) -----
  // Chargement à clé : pendant le chargement ou après un changement de concurrent,
  // la dérivée vaut null (skeleton) — sans setState synchrone dans l'effet.
  const [stationsLoad, setStationsLoad] = useState<{
    key: string
    data: StationDTO[] | null
    error: boolean
  } | null>(null)
  const [stationsRetry, setStationsRetry] = useState(0)
  useEffect(() => {
    if (!effectiveSelected) return
    const ac = new AbortController()
    fetch(`/api/stations?brand=${encodeURIComponent(effectiveSelected)}&limit=2200`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { stations: StationDTO[] }) =>
        setStationsLoad({ key: effectiveSelected, data: j.stations, error: false }))
      .catch(e => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setStationsLoad({ key: effectiveSelected, data: null, error: true })
      })
    return () => ac.abort()
  }, [effectiveSelected, stationsRetry])
  const stations = stationsLoad && stationsLoad.key === effectiveSelected && !stationsLoad.error
    ? stationsLoad.data
    : null
  const stationsError = !!stationsLoad && stationsLoad.key === effectiveSelected && stationsLoad.error

  // ----- Rapports de veille ciblant ce concurrent (missions + détails) -----
  const [veilleLoad, setVeilleLoad] = useState<{
    key: string
    pairs: { mission: MissionDTO; detail: MissionDetailDTO }[] | null
    error: boolean
  } | null>(null)
  const [veilleRetry, setVeilleRetry] = useState(0)
  useEffect(() => {
    if (!effectiveSelected) return
    const ac = new AbortController()
    fetch(`/api/missions?competitor=${encodeURIComponent(effectiveSelected)}`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(async (j: { missions: MissionDTO[] }) => {
        const details = await Promise.all(
          j.missions.map(m =>
            fetch(`/api/missions/${m.id}`, { signal: ac.signal })
              .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
              .then((d: { mission: MissionDetailDTO }) => d.mission)
          )
        )
        return j.missions.map((m, i) => ({ mission: m, detail: details[i] }))
      })
      .then(pairs => setVeilleLoad({ key: effectiveSelected, pairs, error: false }))
      .catch(e => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setVeilleLoad({ key: effectiveSelected, pairs: null, error: true })
      })
    return () => ac.abort()
  }, [effectiveSelected, veilleRetry])
  const veille = veilleLoad && veilleLoad.key === effectiveSelected && !veilleLoad.error
    ? veilleLoad.pairs
    : null
  const veilleError = !!veilleLoad && veilleLoad.key === effectiveSelected && veilleLoad.error

  const compBrand = brandOf(effectiveSelected || null)
  const marketEntry = market?.find(e => e.slug === effectiveSelected) ?? null
  const myMarketEntry = market?.find(e => e.slug === brandSlug) ?? null

  // ----- Statistiques réseau du concurrent -----
  const networkStats = useMemo(() => {
    if (!stations) return null
    const rated = stations.filter(s => s.reviewsCount > 0)
    const ratings = rated.map(s => s.rating)
    const byGov = new Map<string, number>()
    for (const s of stations) byGov.set(s.gouvernorat, (byGov.get(s.gouvernorat) ?? 0) + 1)
    const topGovs = Array.from(byGov.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
    return {
      total: stations.length,
      ratedCount: rated.length,
      ratingAvg: avg,
      ratingMin: ratings.length > 0 ? Math.min(...ratings) : null,
      ratingMax: ratings.length > 0 ? Math.max(...ratings) : null,
      topGovs,
      maxGovCount: topGovs.length > 0 ? topGovs[0][1] : 1,
    }
  }, [stations])

  // ----- Lignes « pratiques observées » -----
  const veilleRows = useMemo(() => {
    if (!veille) return []
    const rows: CompetitorRow[] = []
    for (const { mission, detail } of veille) {
      for (const t of detail.tasks) {
        if (t.competitorSlug && effectiveSelected && t.competitorSlug !== effectiveSelected) continue
        if (!t.lastReport) continue
        rows.push({
          taskId: t.id,
          missionId: mission.id,
          missionTitle: mission.title,
          missionZone: mission.zone,
          agentName: mission.agentName,
          agentCode: mission.agentCode,
          stationName: t.targetLabel,
          stationCode: t.stationCode,
          visitedAt: t.lastReport.createdAt,
          report: t.lastReport,
        })
      }
    }
    return rows.sort((a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime())
  }, [veille, effectiveSelected])

  // ----- Colonnes DataViews (patron movements-history) -----
  const columns: DataViewColumn<CompetitorRow>[] = [
    {
      key: "date", header: "Date", className: "whitespace-nowrap",
      sortValue: (r) => new Date(r.visitedAt).getTime(),
      render: (r) => (
        <span className="text-xs tabular-nums text-muted-foreground">{fmtDate(r.visitedAt)}</span>
      ),
    },
    {
      key: "station", header: "Station observée",
      sortValue: (r) => r.stationName.toLowerCase(),
      render: (r) => (
        <div className="min-w-0">
          <p className="max-w-[200px] truncate text-xs font-semibold" title={r.stationName}>{r.stationName}</p>
          {r.stationCode && <p className="font-mono text-[10px] text-muted-foreground">{r.stationCode}</p>}
        </div>
      ),
    },
    {
      key: "agent", header: "Agent",
      sortValue: (r) => r.agentName ?? "",
      render: (r) => r.agentName ? (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{r.agentName}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{r.agentCode}</p>
        </div>
      ) : (
        <span className="text-[11px] italic text-muted-foreground">—</span>
      ),
    },
    {
      key: "prices", header: "Prix relevés",
      sortValue: (r) => r.report.gazolePrice ?? r.report.essencePrice ?? r.report.gplPrice ?? 0,
      render: (r) => <PricesObs report={r.report} decree={decree} />,
    },
    {
      key: "queue", header: "File", align: "right",
      sortValue: (r) => r.report.queueMinutes ?? -1,
      render: (r) => r.report.queueMinutes != null ? (
        <span className="text-xs tabular-nums">{r.report.queueMinutes} min</span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
    },
    {
      key: "practices", header: "Pratiques observées",
      sortValue: (r) => r.report.competitorPractices ?? "",
      render: (r) => r.report.competitorPractices ? (
        <span className="block max-w-[260px] truncate text-xs text-orange-700 dark:text-orange-400" title={r.report.competitorPractices}>
          {r.report.competitorPractices}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
    },
  ]

  const renderRowCard = (r: CompetitorRow) => (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold" title={r.stationName}>{r.stationName}</p>
          <span className="text-xs tabular-nums text-muted-foreground">{fmtDate(r.visitedAt)}</span>
        </div>
        <p className="truncate text-[11px] text-muted-foreground" title={r.missionTitle}>
          <Eye className="mr-1 inline h-3 w-3" aria-hidden />
          {r.missionTitle} · {r.missionZone}
          {r.agentName ? ` · ${r.agentName}` : ""}
        </p>
        <PricesObs report={r.report} decree={decree} />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">File constatée</dt>
            <dd className="mt-0.5 tabular-nums">
              {r.report.queueMinutes != null ? `${r.report.queueMinutes} min` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Propreté</dt>
            <dd className="mt-0.5 tabular-nums">
              {r.report.cleanliness != null ? `${fmtNote(r.report.cleanliness)}/5` : "—"}
            </dd>
          </div>
        </dl>
        {r.report.competitorPractices && (
          <p
            className="rounded-md border border-orange-200 bg-orange-50 p-2 text-[11px] leading-snug text-orange-700 dark:border-orange-900 dark:bg-orange-950/60 dark:text-orange-400"
            title={r.report.competitorPractices}
          >
            {r.report.competitorPractices}
          </p>
        )}
      </CardContent>
    </Card>
  )

  // ----- Notes d'intelligence (synthèse) -----
  const insights = useMemo(() => {
    const notes: { title: string; body: string }[] = []
    const queues = veilleRows.map(r => r.report.queueMinutes).filter((v): v is number => v != null)
    const compQueueAvg = queues.length > 0 ? queues.reduce((a, b) => a + b, 0) / queues.length : null

    // 1 — File d'attente concurrente vs mienne
    if (compQueueAvg != null && ownQueueAvg != null) {
      const diff = compQueueAvg - ownQueueAvg
      notes.push({
        title: "File d'attente",
        body: `${Math.round(compQueueAvg)} min en moyenne chez ${compBrand.name} contre ${Math.round(ownQueueAvg)} min sur votre réseau — ${
          diff > 1
            ? `vous êtes plus fluide de ${Math.round(diff)} min : un argument client à valoriser.`
            : diff < -1
              ? `votre concurrent est plus fluide de ${Math.round(-diff)} min : surveillez vos heures de pointe.`
              : "parité sur les files d'attente aux heures observées."
        }`,
      })
    } else if (compQueueAvg != null) {
      notes.push({
        title: "File d'attente",
        body: `${Math.round(compQueueAvg)} min en moyenne constatées chez ${compBrand.name} (${queues.length} relevé${queues.length > 1 ? "s" : ""}) — comparez avec vos propres contrôles pour situer votre fluidité.`,
      })
    } else if (veilleRows.length > 0) {
      notes.push({
        title: "File d'attente",
        body: "Aucune file d'attente relevée sur les observations de ce concurrent — demandez à vos agents de la consigner aux heures de pointe.",
      })
    }

    // 2 — Discipline tarifaire face au décret
    if (decree && veilleRows.length > 0) {
      let total = 0
      let conformes = 0
      for (const r of veilleRows) {
        for (const [mill, ref] of [
          [r.report.gazolePrice, decree.GAZOLE],
          [r.report.essencePrice, decree.ESSENCE],
          [r.report.gplPrice, decree.GPL],
        ] as [number | null, number][]) {
          if (mill == null) continue
          total++
          if (mill === ref) conformes++
        }
      }
      if (total > 0) {
        const pctConf = Math.round((conformes / total) * 100)
        notes.push({
          title: "Discipline tarifaire",
          body: pctConf === 100
            ? `Tous les prix relevés chez ${compBrand.name} (${total}) affichent exactement le prix du décret — concurrent strictement conforme.`
            : `${conformes}/${total} prix relevés chez ${compBrand.name} sont au tarif du décret (${pctConf} % conformes) — ${total - conformes} écart${total - conformes > 1 ? "s" : ""} constaté${total - conformes > 1 ? "s" : ""}, à documenter.`,
        })
      }
    }

    // 3 — Pratiques & promotions constatées
    const practices = [...new Set(
      veilleRows.map(r => r.report.competitorPractices?.trim()).filter((p): p is string => !!p)
    )]
    if (practices.length > 0) {
      notes.push({
        title: "Pratiques & promotions",
        body: `${practices.length} pratique${practices.length > 1 ? "s" : ""} distincte${practices.length > 1 ? "s" : ""} observée${practices.length > 1 ? "s" : ""} sur le terrain — « ${practices.slice(0, 2).join(" » · « ")} »${practices.length > 2 ? " …" : ""}.`,
      })
    }

    // 4 — Couverture de la veille
    if (veilleRows.length > 0) {
      const distinctStations = new Set(veilleRows.map(r => r.stationCode ?? r.stationName)).size
      const distinctAgents = new Set(veilleRows.map(r => r.agentCode).filter(Boolean)).size
      notes.push({
        title: "Couverture de la veille",
        body: `${veilleRows.length} rapport${veilleRows.length > 1 ? "s" : ""} de veille sur ${distinctStations} station${distinctStations > 1 ? "s" : ""} distincte${distinctStations > 1 ? "s" : ""} de ${compBrand.name}, mobilisant ${distinctAgents} agent${distinctAgents > 1 ? "s" : ""} de zone.`,
      })
    }

    return notes
  }, [veilleRows, ownQueueAvg, compBrand, decree])

  // ----- Rendu -----

  if (!brands) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement des fiches concurrents…">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (competitors.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Aucune enseigne concurrente n&apos;est référencée sur la plateforme — impossible de
          constituer une fiche concurrent pour l&apos;instant.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* En-tête : sélecteur + identité du concurrent */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 md:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400">
              <Eye className="h-5.5 w-5.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold leading-tight">
                  <BrandDot color={compBrand.color} name={compBrand.name} />
                </h2>
                <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400">
                  Fiche concurrent
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Intelligence concurrentielle : réseau, pratiques observées sur le terrain et
                discipline tarifaire face au décret.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {marketEntry && (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden />
                <div className="min-w-[120px]">
                  <p className="text-sm font-semibold leading-none tabular-nums">
                    {marketEntry.sharePct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
                    <span className="ml-1 text-xs font-normal text-muted-foreground">de part de marché</span>
                  </p>
                  <div
                    className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={Math.round(marketEntry.sharePct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Part de marché de ${compBrand.name}`}
                  >
                    <div
                      className="h-full rounded-full bg-orange-500"
                      style={{ width: `${Math.min(100, marketEntry.sharePct)}%` }}
                    />
                  </div>
                  {myMarketEntry && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Votre part : {myMarketEntry.sharePct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
              <div className="text-sm">
                <p className="font-semibold leading-none">
                  {(() => {
                    const b = brands.find(x => x.slug === effectiveSelected)
                    return b ? `${b.stationCount.toLocaleString("fr-FR")} stations` : "—"
                  })()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Réseau national</p>
              </div>
            </div>
            <div className="w-full sm:w-[240px]">
              <Select value={effectiveSelected} onValueChange={setSelected}>
                <SelectTrigger aria-label="Choisir l'enseigne concurrente à observer">
                  <SelectValue placeholder="Choisir un concurrent…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {competitors.map(b => (
                    <SelectItem key={b.slug} value={b.slug}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
                        {b.name}
                        <span className="text-[11px] text-muted-foreground">{b.stationCount} stations</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
        {marketFailed && (
          <CardContent className="pt-0">
            <p className="flex items-center justify-between gap-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
              Parts de marché indisponibles — la fiche reste consultable sans cet indicateur.
              <Button variant="outline" size="sm" className="h-6" onClick={() => { setMarketFailed(false); setMarketRetry(k => k + 1) }}>
                Réessayer
              </Button>
            </p>
          </CardContent>
        )}
      </Card>

      {/* Fiche réseau : note moyenne + présence par gouvernorat */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="h-4 w-4 text-amber-500" aria-hidden /> Note moyenne du réseau
            </CardTitle>
            <CardDescription>Agrégée des avis clients des stations {compBrand.name}</CardDescription>
          </CardHeader>
          <CardContent>
            {stationsError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Erreur de chargement</p>
                <p className="mt-0.5 text-xs text-red-600/90 dark:text-red-400/80">
                  Impossible de charger le réseau {compBrand.name}.
                </p>
                <Button size="sm" variant="outline" className="mt-2 h-7" onClick={() => { setStationsLoad(null); setStationsRetry(k => k + 1) }}>
                  Réessayer
                </Button>
              </div>
            ) : !networkStats ? (
              <div className="space-y-3" aria-busy="true" aria-label="Chargement du réseau concurrent…">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-4 w-56" />
              </div>
            ) : (
              <>
                <div className="flex items-end gap-2">
                  <p className="text-4xl font-bold tabular-nums leading-none text-amber-600 dark:text-amber-400">
                    {networkStats.ratingAvg != null
                      ? networkStats.ratingAvg.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                      : "—"}
                  </p>
                  <p className="pb-0.5 text-sm text-muted-foreground">/ 5 · {networkStats.ratedCount} station{networkStats.ratedCount > 1 ? "s" : ""} notée{networkStats.ratedCount > 1 ? "s" : ""}</p>
                </div>
                <dl className="mt-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Note la plus basse</dt>
                    <dd className="font-medium tabular-nums">
                      {networkStats.ratingMin != null ? `${networkStats.ratingMin.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} / 5` : "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Note la plus haute</dt>
                    <dd className="font-medium tabular-nums">
                      {networkStats.ratingMax != null ? `${networkStats.ratingMax.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} / 5` : "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Stations non notées</dt>
                    <dd className="font-medium tabular-nums">
                      {networkStats.total - networkStats.ratedCount} / {networkStats.total}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 rounded-md border bg-muted/30 p-2 text-[11px] leading-snug text-muted-foreground">
                  Comparez avec votre propre note réseau depuis l&apos;onglet « Avis &amp; réputation »
                  pour situer votre qualité de service perçue.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-emerald-600" aria-hidden /> Présence par gouvernorat
            </CardTitle>
            <CardDescription>
              Top 5 des implantations de {compBrand.name} — densité du réseau concurrent
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!networkStats ? (
              <div className="space-y-3" aria-busy="true">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : networkStats.topGovs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune station référencée pour cette enseigne.</p>
            ) : (
              <ul className="space-y-2.5">
                {networkStats.topGovs.map(([gov, count]) => (
                  <li key={gov} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-xs font-medium" title={gov}>{gov}</span>
                    <div
                      className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={count}
                      aria-valuemin={0}
                      aria-valuemax={networkStats.maxGovCount}
                      aria-label={`Stations ${compBrand.name} dans le gouvernorat de ${gov}`}
                    >
                      <div
                        className="h-full rounded-full bg-orange-500"
                        style={{ width: `${(count / networkStats.maxGovCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {count} station{count > 1 ? "s" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pratiques observées sur le terrain */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="h-4 w-4 text-orange-600" aria-hidden /> Pratiques observées sur le terrain
              </CardTitle>
              <CardDescription>
                {veilleRows.length > 0
                  ? `${veilleRows.length} rapport${veilleRows.length > 1 ? "s" : ""} de veille ciblant ${compBrand.name} · prix face au décret · 3 modes d'affichage`
                  : "Rapports de veille remontés par les agents de terrain"}
              </CardDescription>
            </div>
            {/* T53-T5 — export CSV des observations (données déjà chargées) */}
            {veille && veilleRows.length > 0 && (
              <Button
                size="sm" variant="outline"
                className="h-11 shrink-0 gap-1.5"
                onClick={() => {
                  exportObservationsCsv(veilleRows, compBrand.name, decree)
                  toast.success("Export CSV généré", {
                    description: `${veilleRows.length} observation${veilleRows.length > 1 ? "s" : ""} de ${compBrand.name} — prix relevés${decree ? " et écarts au décret" : ""}, prêt pour tableur.`,
                  })
                }}
                aria-label={`Exporter les observations terrain de ${compBrand.name} au format CSV`}
              >
                <Download className="h-3.5 w-3.5" aria-hidden /> Exporter (CSV)
              </Button>
            )}
          </div>
          {decree && (
            <p className="text-[11px] text-muted-foreground">
              Prix en vigueur (décret) : GA {fmtDt(decree.GAZOLE)} · ES {fmtDt(decree.ESSENCE)} · GPL {fmtDt(decree.GPL)}
            </p>
          )}
          {decreeFailed && (
            <p className="flex items-center justify-between gap-2 rounded-md border border-dashed p-2 text-[11px] text-muted-foreground">
              Prix du décret indisponibles — les relevés s&apos;affichent sans comparaison.
              <Button variant="outline" size="sm" className="h-6" onClick={() => { setDecreeFailed(false); setDecreeRetry(k => k + 1) }}>
                Réessayer
              </Button>
            </p>
          )}
        </CardHeader>
        <CardContent>
          {veilleError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">Erreur de chargement</p>
              <p className="mt-0.5 text-xs text-red-600/90 dark:text-red-400/80">
                Impossible de charger les missions de veille sur {compBrand.name}.
              </p>
              <Button
                size="sm" variant="outline" className="mt-2 h-7"
                onClick={() => { setVeilleLoad(null); setVeilleRetry(k => k + 1) }}
              >
                Réessayer
              </Button>
            </div>
          ) : !veille ? (
            <div className="space-y-2" aria-busy="true" aria-label="Chargement des rapports de veille…">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <DataViews
              viewKey="portal-terrain-competitor"
              columns={columns}
              rows={veilleRows}
              rowKey={(r) => r.taskId}
              emptyMessage={`Aucun rapport de veille sur ${compBrand.name} pour l'instant — commanditez une mission de veille depuis « Mes missions ».`}
              maxHeightClassName="max-h-[26rem]"
              renderCard={renderRowCard}
              nested={{
                groupKey: (r) => r.missionId,
                groupLabel: (gk, grows) => {
                  const first = grows[0]
                  const label = first ? first.missionTitle : gk
                  const agent = first?.agentName
                  const zone = first?.missionZone
                  return (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <span className="max-w-[320px] truncate">{label}</span>
                      <span className="ml-1 text-[11px] font-normal text-primary/70">
                        — {zone}{agent ? ` · ${agent}` : ""} · {grows.length} observation{grows.length > 1 ? "s" : ""}
                      </span>
                    </span>
                  )
                },
                groupSortValue: (_gk, grows) => {
                  const latest = grows.reduce((a, r) => Math.max(a, new Date(r.visitedAt).getTime()), 0)
                  return -latest // missions les plus récentes en tête
                },
                hideColumnKeyInGroups: "agent",
                defaultOpen: "first",
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Notes d'intelligence */}
      {veille !== null && insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden /> Notes d&apos;intelligence
            </CardTitle>
            <CardDescription>
              Enseignements tirés des observations terrain sur {compBrand.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-2" aria-label="Notes d'intelligence concurrentielle">
              {insights.map(note => (
                <li key={note.title} className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                    <Lightbulb className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">{note.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
