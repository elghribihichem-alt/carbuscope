'use client'

// CarbuScope — Onglet « Veille terrain » du portail enseigne, section B :
// « Fiche propriétaire » — tableau de bord de conformité de MON enseigne,
// dérivé des rapports des missions de contrôle (score conformité, propreté,
// file d'attente, anomalies), alertes qualité et liste des stations contrôlées.

import { useMemo } from "react"
import {
  AlertTriangle, CheckCircle2, Clock, Gauge, MapPin, ShieldCheck, Sparkles, Star,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { ErrorState } from "@/components/shell/loading"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDate } from "@/components/settings/settings-shared"
import type { BrandDTO } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  aggregateOwnStats, BrandDot, CleanlinessStars, ComplianceBadge, DAY_MS, OwnControlRow,
} from "./terrain-shared"

const ALERT_RECENT_DAYS = 15
const MAX_ALERTS = 4

export function TerrainOwnSheet({
  brandSlug, brand, rows, error, retry, onOpenMission,
}: {
  brandSlug: string
  brand: BrandDTO | null
  rows: OwnControlRow[] | null
  error: string | null
  retry: () => void
  onOpenMission: (missionId: string) => void
}) {
  const stats = useMemo(() => (rows ? aggregateOwnStats(rows) : null), [rows])
  const missionCount = useMemo(
    () => (rows ? new Set(rows.map(r => r.missionId)).size : 0),
    [rows]
  )

  // ----- Alertes qualité : cibles ANOMALIE, récentes en tête -----
  const alerts = useMemo(() => {
    if (!rows) return []
    return rows
      .filter(r => r.taskStatus === "ANOMALIE")
      .sort((a, b) => {
        const ta = a.report ? new Date(a.report.createdAt).getTime() : 0
        const tb = b.report ? new Date(b.report.createdAt).getTime() : 0
        return tb - ta
      })
  }, [rows])

  // ----- Colonnes DataViews (patron movements-history) -----
  const columns: DataViewColumn<OwnControlRow>[] = [
    {
      key: "station", header: "Station",
      sortValue: (r) => r.stationName.toLowerCase(),
      render: (r) => (
        <div className="min-w-0">
          <p className="max-w-[220px] truncate text-xs font-semibold" title={r.targetLabel}>{r.targetLabel}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {r.stationCode ? <code className="font-mono">{r.stationCode}</code> : "cible libre"} · {r.missionTitle}
          </p>
        </div>
      ),
    },
    {
      key: "visit", header: "Dernière visite", className: "whitespace-nowrap",
      sortValue: (r) => (r.report ? new Date(r.report.createdAt).getTime() : 0),
      render: (r) => r.report ? (
        <span className="text-xs tabular-nums text-muted-foreground">{fmtDate(r.report.createdAt)}</span>
      ) : (
        <span className="text-[11px] italic text-muted-foreground">à contrôler</span>
      ),
    },
    {
      key: "conformite", header: "Conformité",
      sortValue: (r) => r.report?.complianceScore ?? -1,
      render: (r) => <ComplianceBadge score={r.report?.complianceScore ?? null} />,
    },
    {
      key: "proprete", header: "Propreté",
      sortValue: (r) => r.report?.cleanliness ?? -1,
      render: (r) => <CleanlinessStars value={r.report?.cleanliness ?? null} />,
    },
    {
      key: "file", header: "File", align: "right",
      sortValue: (r) => r.report?.queueMinutes ?? -1,
      render: (r) => r.report?.queueMinutes != null ? (
        <span className="text-xs tabular-nums">{r.report.queueMinutes} min</span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
    },
    {
      key: "anomalies", header: "Anomalies constatées",
      sortValue: (r) => r.report?.anomalies ?? "",
      render: (r) => r.report?.anomalies ? (
        <span className="block max-w-[240px] truncate text-xs text-red-600 dark:text-red-400" title={r.report.anomalies}>
          {r.report.anomalies}
        </span>
      ) : r.taskStatus === "ANOMALIE" ? (
        <Badge variant="outline" className="text-[11px] border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          signalée
        </Badge>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" aria-hidden /> aucune
        </span>
      ),
    },
  ]

  const renderStationCard = (r: OwnControlRow) => (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-snug" title={r.targetLabel}>{r.targetLabel}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {r.stationCode ? <code className="font-mono">{r.stationCode}</code> : "cible libre"} · {r.missionTitle}
            </p>
          </div>
          <ComplianceBadge score={r.report?.complianceScore ?? null} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Dernière visite</dt>
            <dd className="mt-0.5">
              {r.report ? (
                <span className="tabular-nums">{fmtDate(r.report.createdAt)}</span>
              ) : (
                <span className="italic text-muted-foreground">à contrôler</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Propreté</dt>
            <dd className="mt-0.5"><CleanlinessStars value={r.report?.cleanliness ?? null} /></dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">File d&apos;attente</dt>
            <dd className="mt-0.5 tabular-nums">
              {r.report?.queueMinutes != null ? `${r.report.queueMinutes} min` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Zone</dt>
            <dd className="mt-0.5">{r.zone}</dd>
          </div>
        </dl>
        {r.report?.anomalies ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-2 text-[11px] leading-snug text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-400" title={r.report.anomalies}>
            <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden />
            {r.report.anomalies}
          </p>
        ) : r.taskStatus === "ANOMALIE" ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-400">
            <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden />
            Anomalie signalée — détail dans la mission.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )

  if (error) {
    return <ErrorState message={error} retry={retry} />
  }

  if (!rows || !stats) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement de la fiche propriétaire…">
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />)}
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  const pctFr = (v: number | null, digits = 1): string | null =>
    v == null ? null : `${v.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`

  return (
    <div className="space-y-4">
      {/* En-tête : identité de l'enseigne propriétaire */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 md:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <ShieldCheck className="h-5.5 w-5.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold leading-tight">
                  <BrandDot color={brand?.color ?? "#059669"} name={brand?.name ?? brandSlug} />
                </h2>
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                  Fiche propriétaire
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Tableau de bord de conformité de votre réseau — {stats.visitedCount} visite
                {stats.visitedCount > 1 ? "s" : ""} de contrôle sur {stats.targetsCount} cible
                {stats.targetsCount > 1 ? "s" : ""} ({missionCount} mission{missionCount > 1 ? "s" : ""} de contrôle),
                rapports remontés par vos agents de zone.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
            <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
            <div className="text-sm">
              <p className="font-semibold leading-none">
                {brand ? `${brand.stationCount.toLocaleString("fr-FR")} stations` : "Réseau national"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Référentiel de l&apos;enseigne</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs de conformité */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Score conformité moyen"
          value={stats.complianceAvg != null
            ? `${Math.round(stats.complianceAvg)} %`
            : "—"}
          icon={Gauge}
          tone={stats.complianceAvg == null ? "default" : stats.complianceAvg >= 90 ? "success" : stats.complianceAvg >= 70 ? "warning" : "danger"}
          sub={stats.complianceAvg != null ? `moyenne sur ${stats.visitedCount} rapport${stats.visitedCount > 1 ? "s" : ""}` : "aucun rapport de contrôle"}
        />
        <KpiCard
          label="Propreté moyenne"
          value={stats.cleanlinessAvg != null
            ? `${stats.cleanlinessAvg.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} / 5`
            : "—"}
          icon={Sparkles}
          tone="info"
          sub="état général des pistes et de l'accueil"
        />
        <KpiCard
          label="File d'attente moyenne"
          value={stats.queueAvg != null
            ? `${Math.round(stats.queueAvg)} min`
            : "—"}
          icon={Clock}
          tone={stats.queueAvg != null && stats.queueAvg > 10 ? "warning" : "default"}
          sub="temps moyen constaté aux heures de pointe"
        />
        <KpiCard
          label="Cibles avec anomalie"
          value={pctFr(stats.anomalyPct) ?? "—"}
          icon={AlertTriangle}
          tone={stats.anomalyPct != null && stats.anomalyPct > 0 ? "danger" : "success"}
          sub={`${stats.anomalyCount} anomalie${stats.anomalyCount > 1 ? "s" : ""} sur ${stats.targetsCount} cible${stats.targetsCount > 1 ? "s" : ""}`}
        />
      </div>

      {/* Alertes qualité : cibles ANOMALIE récentes */}
      {alerts.length > 0 && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              Alertes qualité ({alerts.length})
            </CardTitle>
            <CardDescription>
              Cibles signalées en anomalie par vos agents — les plus récentes en premier.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.slice(0, MAX_ALERTS).map(a => {
              const days = a.report
                ? (Date.now() - new Date(a.report.createdAt).getTime()) / DAY_MS
                : Number.POSITIVE_INFINITY
              const recent = days <= ALERT_RECENT_DAYS
              return (
                <div
                  key={a.taskId}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-lg border p-3",
                    recent
                      ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/50"
                      : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50",
                  )}
                  role="alert"
                >
                  <AlertTriangle
                    className={cn(
                      "h-4 w-4 shrink-0",
                      recent ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {a.targetLabel}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">· {a.zone}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground" title={a.report?.anomalies ?? undefined}>
                      {a.report?.anomalies ?? "Anomalie signalée — détail dans la mission."}
                      {a.report ? ` — ${fmtDate(a.report.createdAt)}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="outline" size="sm"
                    className="h-11 shrink-0 gap-1.5 text-xs"
                    onClick={() => onOpenMission(a.missionId)}
                    aria-label={`Voir la mission ${a.missionTitle}`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Voir la mission
                  </Button>
                </div>
              )
            })}
            {alerts.length > MAX_ALERTS && (
              <p className="text-xs text-muted-foreground">
                + {alerts.length - MAX_ALERTS} autre{alerts.length - MAX_ALERTS > 1 ? "s" : ""} anomalie
                {alerts.length - MAX_ALERTS > 1 ? "s" : ""} — consultez la liste détaillée ci-dessous.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Liste des stations contrôlées */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="h-4 w-4 text-emerald-600" aria-hidden />
            Stations contrôlées
          </CardTitle>
          <CardDescription>
            {rows.length} cible{rows.length > 1 ? "s" : ""} de contrôle · groupées par gouvernorat · 3 modes d&apos;affichage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey="portal-terrain-own"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.taskId}
            emptyMessage="Aucune station contrôlée pour l'instant — commanditez une mission de contrôle depuis « Mes missions »."
            maxHeightClassName="max-h-[26rem]"
            onRowClick={(r) => onOpenMission(r.missionId)}
            renderCard={renderStationCard}
            nested={{
              groupKey: (r) => r.zone,
              groupLabel: (gk, grows) => {
                const withReport = grows.filter(r => r.report?.complianceScore != null)
                const avg = withReport.length > 0
                  ? Math.round(withReport.reduce((a, r) => a + r.report!.complianceScore!, 0) / withReport.length)
                  : null
                const anom = grows.filter(r => r.taskStatus === "ANOMALIE").length
                return (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {gk}
                    <span className="ml-1 text-[11px] font-normal text-primary/70">
                      — {grows.length} station{grows.length > 1 ? "s" : ""}
                      {avg != null ? ` · score moyen ${avg} %` : ""}
                      {anom > 0 ? ` · ${anom} anomalie${anom > 1 ? "s" : ""}` : ""}
                    </span>
                  </span>
                )
              },
              groupSortValue: (_gk, grows) => grows.length,
              defaultOpen: "first",
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
