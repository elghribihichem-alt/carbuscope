'use client'

// C.2.5 — Tableau de bord enseigne : KPIs, workflow de validation (C.3), activité récente

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiCard } from "@/components/shell/kpi-card"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import {
  Store, RefreshCw, ShieldAlert, History, Lock, FileUp, ShieldCheck, Globe2,
  MessageSquareWarning, Scale, Fingerprint, ArrowRight, ArrowDown,
} from "lucide-react"
import type { PortalStats } from "@/lib/types"
import { relDays, fmtDateTime, fmtDate } from "@/components/settings/settings-shared"

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

export function PortalDashboard({ brandSlug }: { brandSlug: string }) {
  const [stats, setStats] = useState<PortalStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    fetch(`/api/portal/stats?brand=${encodeURIComponent(brandSlug)}`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: PortalStats) => { setStats(j); setError(null) })
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
  const completenessBar = completeness >= 80 ? "bg-emerald-500" : completeness >= 60 ? "bg-amber-500" : "bg-red-500"

  return (
    <div className="space-y-4">
      {/* 4 KPIs enseigne (C.2.5) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
              <p className="mt-0.5 text-xl font-bold tabular-nums leading-none">{completeness} %</p>
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

        {/* Activité récente */}
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

            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Lock className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                Chaque modification est tracée : auteur, date, IP.
              </div>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Auteur</dt>
                  <dd className="font-medium">Portail Enseigne</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Date</dt>
                  <dd className="font-medium">{fmtDate(stats.lastSync ?? new Date().toISOString())}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="font-medium">Enseigne (API / portail)</dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] italic text-muted-foreground">
                Format type d&apos;une trace : champ, ancienne valeur → nouvelle valeur.
              </p>
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
