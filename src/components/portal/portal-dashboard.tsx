'use client'

// C.2.5 — Tableau de bord enseigne : KPIs, workflow de validation (C.3), activité récente.
// T53-T2 — enrichissement additif (gel souple) : bannière d'alertes proactives
// (fil réel de /api/stats/overview, pattern T52-R1 sa-overview-alertes), KPI
// note moyenne / avis (extension additive de /api/portal/stats) et carte
// « activité récente » vivante (8 dernières traces réelles StationHistory).
// Aucune donnée inventée : tout provient des routes API existantes.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { KpiCard } from "@/components/shell/kpi-card"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import {
  Store, RefreshCw, ShieldAlert, History, Lock, FileUp, ShieldCheck, Globe2,
  MessageSquareWarning, Scale, Fingerprint, ArrowRight, ArrowDown, Star,
  BellRing, TriangleAlert, X, Radar,
} from "lucide-react"
import type { AlertDTO, OverviewStats, PortalStats } from "@/lib/types"
import { STATUS_LABELS } from "@/lib/types"
import { relDays, fmtDateTime, fmtDate, num } from "@/components/settings/settings-shared"
import { relativeDate, sortByPriority } from "@/components/dashboard/dashboard-utils"
import { useAppStore } from "@/store/app-store"
import { cn } from "@/lib/utils"

type Step = {
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
  cls: string
}

const WORKFLOW_STEPS: Step[] = [
  {
    icon: FileUp,
    title: "Soumission",
    desc: "L'enseigne soumet une modification depuis son portail.",
    cls: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  },
  {
    icon: ShieldCheck,
    title: "Vérification de cohérence",
    desc: "La plateforme contrôle : pas de sabotage, pas d'erreur grossière.",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  },
  {
    icon: Globe2,
    title: "Publication",
    desc: "La modification validée est publiée sur la fiche publique.",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  },
  {
    icon: MessageSquareWarning,
    title: "Contestation",
    desc: "Les utilisateurs peuvent contester la donnée publiée.",
    cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  },
  {
    icon: Scale,
    title: "Arbitrage",
    desc: "La plateforme tranche en cas de conflit persistant.",
    cls: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  },
]

// ---------------------------------------------------------------- types locaux (T53-T2)
// Extension LOCALE du type PortalStats (src/lib/types.ts protégé, pattern T52-R1) :
// les trois champs supplémentaires sont servis par l'extension additive de
// /api/portal/stats — optionnels pour rester tolérants aux réponses antérieures.

export type PortalHistoryItem = {
  id: string
  stationName: string
  stationCode: string
  field: string
  oldValue: string
  newValue: string
  author: string
  source: string
  createdAt: string
}

type PortalStatsExt = PortalStats & {
  avgRating?: number | null
  reviewsCount?: number
  recentHistory?: PortalHistoryItem[]
}

/** Libellés FR des champs réellement tracés en base (services, statut, horaires, photo). */
const FIELD_LABELS: Record<string, string> = {
  services: "Services",
  statut: "Statut",
  horaires: "Horaires",
  photo: "Photo",
}

/** Décimale à la française : 3.7 → « 3,7 ». */
const fr1 = (n: number): string => n.toFixed(1).replace(".", ",")

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.charAt(0).toUpperCase() + field.slice(1)
}

/** Valeur lisible : les statuts techniques (ACTIVE…) sont traduits, le reste est réel. */
function valueLabel(field: string, raw: string): string {
  if (field === "statut" && STATUS_LABELS[raw]) return STATUS_LABELS[raw]
  return raw
}

// ---------------------------------------------------------------- bannière d'alertes (T53-T2)
// Pattern T52-R1 (sa-overview-alertes) : consolide au montage le fil d'alertes
// de veille servi par /api/stats/overview?brand=. Zéro alerte → rien rendu ;
// erreur réseau → rien rendu non plus (une bannière proactive n'est jamais un
// point de panne). Chip navigante vers la veille de l'observatoire, masquage
// pour la session. Identité : ambre = avertissement, rouge = critique.

function PortalAlertsBanner({ brandSlug, onOpenVeille }: { brandSlug: string; onOpenVeille: () => void }) {
  const [alerts, setAlerts] = useState<OverviewStats["alerts"] | null>(null)
  const [feed, setFeed] = useState<AlertDTO[]>([])
  const [masque, setMasque] = useState(false)

  useEffect(() => {
    const ac = new AbortController()
    fetch(`/api/stats/overview?brand=${encodeURIComponent(brandSlug)}`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: OverviewStats) => {
        setAlerts(j.alerts)
        setFeed(j.alertsFeed ?? [])
      })
      .catch((e: unknown) => {
        // Échec réseau : la bannière proactive reste simplement absente.
        if (e instanceof DOMException && e.name === "AbortError") return
      })
    return () => ac.abort()
  }, [brandSlug])

  const plusUrgente = useMemo(() => {
    if (feed.length === 0) return null
    return sortByPriority(feed)[0]
  }, [feed])

  if (masque || !alerts || alerts.total === 0) return null

  const critique = alerts.critical > 0
  const Icone = critique ? TriangleAlert : BellRing

  const fragments: string[] = []
  if (alerts.critical > 0) fragments.push(`${num(alerts.critical)} alerte${alerts.critical > 1 ? "s" : ""} critique${alerts.critical > 1 ? "s" : ""}`)
  if (alerts.medium > 0) fragments.push(`${num(alerts.medium)} moyenne${alerts.medium > 1 ? "s" : ""}`)
  if (alerts.info > 0) fragments.push(`${num(alerts.info)} info${alerts.info > 1 ? "s" : ""}`)
  const resume = plusUrgente
    ? `${fragments.join(" · ")} — plus urgente : « ${plusUrgente.title} » (${relativeDate(plusUrgente.date)})`
    : fragments.join(" · ")

  const banniere = critique
    ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
    : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
  const chipStyle = critique
    ? "border-red-300 bg-white/70 text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/60"
    : "border-amber-300 bg-white/70 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/60"

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={`Veille de l'enseigne : ${resume}`}
      className={cn("overflow-hidden rounded-lg border shadow-sm", banniere)}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3 py-2.5 md:px-4">
        <Icone
          className={cn("h-5 w-5 shrink-0", critique ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")}
          aria-hidden
        />
        <p className="min-w-0 flex-1 text-xs font-medium leading-snug md:text-sm">{resume}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenVeille}
            aria-label={`Consulter la veille — ${num(alerts.total)} alertes actives`}
            className={cn(
              "inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-md border px-2.5 py-2",
              "text-[11px] font-semibold leading-tight transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600 dark:focus-visible:ring-red-400",
              chipStyle,
            )}
          >
            <Radar className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 text-left">Veille ({num(alerts.total)})</span>
          </button>
          <button
            type="button"
            onClick={() => setMasque(true)}
            aria-label="Masquer les alertes de veille pour la session courante"
            title="Masquer pour la session courante (réaffiché au prochain chargement)"
            className={cn(
              "inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-md border",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset",
              "focus-visible:ring-red-600 dark:focus-visible:ring-red-400",
              critique
                ? "border-red-300/70 bg-transparent text-red-700 hover:bg-red-100 dark:border-red-700/70 dark:text-red-300 dark:hover:bg-red-900/60"
                : "border-amber-300/70 bg-transparent text-amber-800 hover:bg-amber-100 dark:border-amber-700/70 dark:text-amber-300 dark:hover:bg-amber-900/60",
            )}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- composant principal

export function PortalDashboard({ brandSlug }: { brandSlug: string }) {
  const [stats, setStats] = useState<PortalStatsExt | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const setNav = useAppStore(s => s.setNav)
  const setTab = useAppStore(s => s.setTab)

  // Deep-links internes : veille de l'observatoire (pattern sidebar G2) et
  // onglet « Avis & réputation » du portail (pattern pTab G3).
  const openVeille = useCallback(() => {
    setNav("espace", "observatoire")
    setTab("veille")
  }, [setNav, setTab])
  const openReviews = useCallback(() => {
    setNav("espace", "portail")
    setNav("portail", "reviews")
  }, [setNav])

  useEffect(() => {
    const ac = new AbortController()
    fetch(`/api/portal/stats?brand=${encodeURIComponent(brandSlug)}`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: PortalStatsExt) => { setStats(j); setError(null) })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setError("Impossible de charger les statistiques du portail enseigne.")
      })
    return () => ac.abort()
  }, [brandSlug, reloadKey])

  const retry = useCallback(() => setReloadKey(k => k + 1), [])

  if (error) return <ErrorState message={error} retry={retry} />
  if (!stats) return <TabSkeleton title="Chargement du tableau de bord enseigne…" />

  const completeness = stats.completenessPct
  // T53-T2 : décimale à la française (« 69,4 % », pas « 69.4 % »).
  const completenessLabel = completeness.toLocaleString("fr-FR", { maximumFractionDigits: 1 })
  const completenessBar = completeness >= 80 ? "bg-emerald-500" : completeness >= 60 ? "bg-amber-500" : "bg-red-500"

  // Traces réelles (extension additive) — repli vide si le champ est absent.
  const history: PortalHistoryItem[] = stats.recentHistory ?? []
  const avgRating = stats.avgRating ?? null
  const reviewsCount = stats.reviewsCount ?? 0

  return (
    <div className="space-y-4">
      {/* Bannière d'alertes proactives (T53-T2 — fil réel de veille) */}
      <PortalAlertsBanner brandSlug={brandSlug} onOpenVeille={openVeille} />

      {/* 5 KPIs enseigne (C.2.5 + note moyenne T53-T2) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Stations publiées"
          value={stats.published}
          icon={Store}
          tone="success"
          sub="Fiches visibles côté grand public"
        />
        {/* Complétude avec mini barre */}
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400">
              <Fingerprint className="h-4.5 w-4.5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Taux de complétude des fiches
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums leading-none">{completenessLabel} %</p>
              <div
                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={completeness}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Taux de complétude"
              >
                <div className={`h-full rounded-full transition-all ${completenessBar}`} style={{ width: `${completeness}%` }} />
              </div>
              <p className="mt-1.5 truncate text-xs text-muted-foreground">Photo, services, adresse, vérification</p>
            </div>
          </CardContent>
        </Card>
        <KpiCard
          label="Dernière synchronisation"
          value={relDays(stats.lastSync)}
          icon={RefreshCw}
          tone="info"
          sub={fmtDateTime(stats.lastSync)}
        />
        {/* T53-T2 — note moyenne réelle des avis de l'enseigne (table Review) */}
        <KpiCard
          label="Note moyenne des avis"
          value={avgRating !== null ? `${fr1(avgRating)} / 5` : "—"}
          icon={Star}
          tone={avgRating === null ? "default" : avgRating >= 4 ? "success" : avgRating < 3 ? "warning" : "default"}
          sub={reviewsCount > 0 ? `${num(reviewsCount)} avis clients cumulés` : "Aucun avis pour le moment"}
          onClick={openReviews}
        />
        <KpiCard
          label="Alertes de modération"
          value={stats.moderationAlerts}
          icon={ShieldAlert}
          tone={stats.moderationAlerts > 0 ? "danger" : "default"}
          sub={stats.moderationAlerts > 0 ? "Signalements à traiter" : "Aucune alerte en attente"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Workflow de validation (C.3) */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Workflow de validation</CardTitle>
            <CardDescription>
              Le parcours d&apos;une modification soumise par l&apos;enseigne — 5 étapes, de la soumission à
              l&apos;arbitrage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2 md:flex-row md:items-stretch md:gap-0" aria-label="Étapes du workflow">
              {WORKFLOW_STEPS.map((step, i) => {
                const Icon = step.icon
                return (
                  <li key={step.title} className="contents">
                    <div className="flex flex-1 items-start gap-3 rounded-lg border bg-muted/30 p-3 md:flex-col md:gap-2">
                      <div className="flex items-center gap-2 md:w-full md:justify-between">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${step.cls}`}>
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Étape {i + 1}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight">{step.title}</p>
                        <p className="mt-1 text-xs leading-snug text-muted-foreground">{step.desc}</p>
                      </div>
                    </div>
                    {i < WORKFLOW_STEPS.length - 1 && (
                      <div className="flex items-center justify-center px-1 py-0.5 md:py-0" aria-hidden>
                        <ArrowDown className="h-4 w-4 shrink-0 text-muted-foreground/60 md:hidden" />
                        <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground/60 md:block" />
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>

        {/* Activité récente — T53-T2 : liste vivante des 8 dernières traces réelles */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Activité récente</CardTitle>
            <CardDescription>Modifications tracées depuis la mise en service du portail.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-2">
              <p className="text-4xl font-bold tabular-nums leading-none text-emerald-600 dark:text-emerald-400">
                {stats.historyCount}
              </p>
              <p className="pb-0.5 text-sm text-muted-foreground">modifications tracées</p>
            </div>

            {history.length > 0 ? (
              <ul
                className="max-h-96 space-y-2 overflow-y-auto pr-1.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent"
                aria-label="Dernières modifications tracées"
              >
                {history.map(h => (
                  <li key={h.id} className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-xs font-semibold" title={`${h.stationName} (${h.stationCode})`}>
                        {h.stationName}
                      </p>
                      <span
                        className="shrink-0 text-[11px] text-muted-foreground"
                        title={fmtDate(h.createdAt)}
                      >
                        {relativeDate(h.createdAt)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs">
                      <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] font-medium">
                        {fieldLabel(h.field)}
                      </Badge>
                      <span className="min-w-0 truncate text-muted-foreground" title={`${valueLabel(h.field, h.oldValue)} → ${valueLabel(h.field, h.newValue)}`}>
                        <span className="line-through decoration-muted-foreground/50">{valueLabel(h.field, h.oldValue)}</span>
                        <ArrowRight className="mx-1 inline h-3 w-3 align-[-1px]" aria-hidden />
                        <span className="font-medium text-foreground">{valueLabel(h.field, h.newValue)}</span>
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {h.author} · source&nbsp;: {h.source}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                Aucune modification tracée pour le moment.
              </p>
            )}

            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Lock className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                Chaque modification est tracée : champ, ancienne valeur → nouvelle valeur, auteur et source.
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
              <History className="h-4 w-4 shrink-0" aria-hidden />
              L&apos;historique complet est consultable depuis la fiche de chaque station.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
