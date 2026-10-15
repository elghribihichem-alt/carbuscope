"use client"

// T48-b — Super Administration · Jobs planifiés : les 5 jobs de la plateforme
// (passe de veille, relances J+7, relais WebSocket, sauvegarde nocturne, file
// exports PDF — ils reflètent les mini-services réels). Liste par cartes avec
// statut coloré (ACTIF émeraude · SUSPENDU ardoise · ERREUR terracotta),
// Switch actif/suspendu, bouton « Exécuter maintenant » (loading + résultat
// affiché), méta complètes (schedule, endpoint, lastResult, runsCount, failures).
// API : /api/super/jobs (GET, PATCH ?id=, POST ?id= → exécuter).

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { useAppStore } from "@/store/app-store"
import { hasPerm } from "@/lib/saas-perms"
import { fmtDate, timeAgo } from "./sa-shared"
import {
  AlertTriangle, CalendarClock, CheckCircle2, CirclePause, Cpu, FileDown, Loader2,
  MessageSquareWarning, Play, RefreshCw, TimerReset, Webhook, Zap,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------- types locaux

interface JobDTO {
  id: string
  code: string
  label: string
  kind: string // CRON | TACHE
  schedule: string
  endpoint: string
  status: string // ACTIF | SUSPENDU | ERREUR
  lastRunAt: string | null
  nextRunAt: string | null
  lastResult: string
  runsCount: number
  failures: number
  active: boolean
}

// ---------------------------------------------------------------- métadonnées

const MODULE = "sa.jobs"

const STATUT_META: Record<string, { label: string; dot: string; className: string }> = {
  ACTIF: {
    label: "Actif", dot: "bg-emerald-500",
    className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  },
  SUSPENDU: {
    label: "Suspendu", dot: "bg-slate-400",
    className: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
  },
  ERREUR: {
    label: "Erreur", dot: "bg-orange-500",
    className: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
  },
}

const JOB_ICONS: Record<string, typeof Zap> = {
  VEILLE_QUOTIDIENNE: Zap,
  RELANCES_J7: CalendarClock,
  NOTIF_RELAY: MessageSquareWarning,
  SAUVEGARDE_QUOT: Cpu,
  EXPORTS_PDF: FileDown,
}

// ---------------------------------------------------------------- fiche job

function JobCard({
  job, readonly, onPatch, onRun, busy,
}: {
  job: JobDTO
  readonly: boolean
  onPatch: (j: JobDTO, active: boolean) => void
  onRun: (j: JobDTO) => void
  busy: boolean
}) {
  const meta = STATUT_META[job.status] ?? { label: job.status, dot: "bg-slate-400", className: "" }
  const Icon = JOB_ICONS[job.code] ?? Webhook

  return (
    <Card className={cn("transition-shadow", job.status === "ERREUR" && "border-orange-300 dark:border-orange-800")}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                job.status === "ACTIF" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : job.status === "ERREUR" ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
              )}
            >
              <Icon className="h-4.5 w-4.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold leading-snug">{job.label}</p>
                <Badge variant="outline" className={cn("gap-1.5 text-[11px] font-medium", meta.className)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden /> {meta.label}
                </Badge>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">{job.kind}</Badge>
              </div>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{job.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <Switch
                checked={job.active}
                disabled={readonly}
                onCheckedChange={v => onPatch(job, v)}
                aria-label={job.active ? `Suspendre ${job.label}` : `Réactiver ${job.label}`}
              />
            )}
            <Button
              size="sm"
              variant={job.code === "VEILLE_QUOTIDIENNE" ? "default" : "outline"}
              className="h-7 gap-1.5"
              onClick={() => onRun(job)}
              disabled={busy || readonly || !job.active}
              title={!job.active ? "Job suspendu — réactivez-le d’abord" : job.code === "VEILLE_QUOTIDIENNE" ? "Appelle réellement le moteur de veille" : "Exécution honnête (compteur + résultat)"}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
              Exécuter maintenant
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
          <div>
            <p className="font-medium uppercase tracking-wide text-muted-foreground">Planification</p>
            <p className="mt-0.5">{job.schedule || "—"}</p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-wide text-muted-foreground">Endpoint</p>
            <p className="mt-0.5 break-all font-mono text-[11px]">{job.endpoint || "—"}</p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-wide text-muted-foreground">Dernière exécution</p>
            <p className="mt-0.5" title={job.lastRunAt ?? undefined}>
              {job.lastRunAt ? `${fmtDate(job.lastRunAt)} · ${timeAgo(job.lastRunAt)}` : "jamais"}
            </p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-wide text-muted-foreground">Compteurs</p>
            <p className="mt-0.5 tabular-nums">
              {job.runsCount} exécution(s) · {job.failures} échec(s)
            </p>
          </div>
        </div>

        {job.lastResult && (
          <div className={cn(
            "flex items-start gap-2 rounded-lg border p-2.5 text-xs leading-relaxed",
            job.status === "ERREUR"
              ? "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/60 dark:text-orange-300"
              : "border-border bg-muted/40 text-muted-foreground",
          )}>
            {job.status === "ERREUR" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
            <p className="min-w-0 break-words">{job.lastResult}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- section

export function SaJobs() {
  const session = useAppStore(s => s.session)
  const readonly = !(session?.role === "SUPER_ADMIN" || hasPerm(session?.permissions, MODULE, 2))

  const [jobs, setJobs] = useState<JobDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/super/jobs")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as { jobs: JobDTO[] }
      setJobs(j.jobs)
      setError(null)
    } catch {
      setError("Impossible de charger les jobs planifiés.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function remplacer(maj: JobDTO) {
    setJobs(prev => prev.map(j => (j.id === maj.id ? maj : j)))
  }

  async function patcher(job: JobDTO, active: boolean) {
    setBusyId(job.id)
    try {
      const r = await fetch(`/api/super/jobs?id=${job.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active }),
      })
      const j = (await r.json().catch(() => ({}))) as { job?: JobDTO; error?: string }
      if (!r.ok || !j.job) throw new Error(j.error ?? `Erreur HTTP ${r.status}`)
      remplacer(j.job)
      toast.success(active ? `Job « ${job.label} » réactivé` : `Job « ${job.label} » suspendu`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du basculement du job")
    } finally {
      setBusyId(null)
    }
  }

  async function executer(job: JobDTO) {
    setBusyId(job.id)
    try {
      const r = await fetch(`/api/super/jobs?id=${job.id}`, { method: "POST" })
      const j = (await r.json().catch(() => ({}))) as { job?: JobDTO; resultat?: string; error?: string }
      if (!r.ok || !j.job) throw new Error(j.error ?? `Erreur HTTP ${r.status}`)
      remplacer(j.job)
      toast.success(j.resultat ? j.resultat : `Job « ${job.label} » exécuté`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l’exécution du job")
      void load() // le job a pu passer en ERREUR côté serveur
    } finally {
      setBusyId(null)
    }
  }

  const actifs = jobs.filter(j => j.active).length
  const enErreur = jobs.filter(j => j.status === "ERREUR").length

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <TimerReset className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
            Jobs planifiés
            <Badge variant="outline" className="text-[11px] text-muted-foreground">
              {actifs}/{jobs.length} actif(s)
            </Badge>
            {enErreur > 0 && (
              <Badge variant="outline" className="gap-1 border-orange-300 bg-orange-50 text-[11px] text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300">
                <AlertTriangle className="h-3 w-3" aria-hidden /> {enErreur} en erreur
              </Badge>
            )}
            <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1.5 px-2 text-xs" onClick={() => { void load() }} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
              {jobs.length > 0 ? `${jobs.length} job(s)` : "Chargement…"}
            </Button>
          </CardTitle>
          <CardDescription>
            Le planificateur interne de la plateforme : passe de veille quotidienne 08:00, relances factures J+7,
            relais WebSocket, sauvegarde nocturne et file d’exports. « Exécuter maintenant » déclenche le moteur de
            veille pour de vrai (les autres jobs journalisent une exécution honnête).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {error}
              <Button variant="outline" size="sm" className="ml-auto h-7" onClick={() => { void load() }}>Réessayer</Button>
            </div>
          )}
          {!jobs.length && !error && (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement des jobs…
            </p>
          )}
          <div className="max-h-[30rem] space-y-3 overflow-y-auto pr-1" aria-label="Liste des jobs planifiés">
            {jobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                readonly={readonly}
                busy={busyId === job.id}
                onPatch={(j, a) => { void patcher(j, a) }}
                onRun={j => { void executer(j) }}
              />
            ))}
          </div>
          {readonly && jobs.length > 0 && (
            <>
              <Separator />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CirclePause className="h-3.5 w-3.5" aria-hidden />
                Lecture seule : suspension et exécution manuelle réservées au niveau écriture.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
