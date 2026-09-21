"use client"

// Super Administration — ④ Supervision & Santé : état réel de la base (comptage
// table par table + latence), sonde des endpoints API, jobs planifiés,
// sauvegardes physiques avec restauration, mode maintenance, incidents & charge.
// Conventions : identité graphite/violet, emerald = sain, amber = à surveiller,
// red = critique — jamais de bleu/indigo, UI 100 % FR.

import { useCallback, useEffect, useState } from "react"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { toast } from "sonner"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
} from "recharts"
import {
  Activity, AlertCircle, AlertTriangle, Cog, Database, Gauge, HardDrive, History, Loader2,
  Play, RefreshCw, RotateCcw, Save, Timer, Wrench,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AXIS_STYLE, GRID_STROKE, num, tooltipStyle } from "@/lib/chart"
import {
  formatInt, formatDateTime, pastille, JOB_STATUT_META, INCIDENT_STATUT_META, SEVERITE_META,
  type JobDTO, type Pastille, type SauvegardeDTO, type SupervisionResponse,
} from "@/lib/sa-types"

// ---------------------------------------------------------------- méta & formats locaux

interface DisqueResponse {
  sauvegardes: SauvegardeDTO[]
  disque: { baseTailleKo: number; backupsTailleKo: number }
}

const TYPE_SAUVEGARDE_META: Record<string, Pastille> = {
  AUTO: { label: "Auto", className: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" },
  MANUELLE: { label: "Manuelle", className: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-400" },
  PRE_RESTAURATION: { label: "Pré-restauration", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
}

const PERIODICITE_JOB_META: Record<string, Pastille> = {
  QUOTIDIEN: { label: "Quotidien", className: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" },
  HEBDO: { label: "Hebdomadaire", className: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-400" },
  MENSUEL: { label: "Mensuel", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  TEMPS_REEL: { label: "Temps réel", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
}

const ENDPOINT_STATUT_META: Record<string, Pastille> = {
  OK: { label: "OK", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  LENT: { label: "Lent", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
  ERREUR: { label: "Erreur", className: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" },
}

const COMPOSANT_META: Record<string, string> = {
  API: "API",
  BASE_DONNEES: "Base de données",
  CARTE: "Carte",
  MOTEUR_VEILLE: "Moteur de veille",
  FACTURATION: "Facturation",
}

/** ms → « 3 ms », « 18,7 ms », « 1,6 s » */
function formatDuree(ms: number): string {
  if (ms < 10) return `${ms.toFixed(1).replace(".", ",")} ms`
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`
}

/** Ko → « 3 668 Ko » / « 10,2 Mo » */
function formatTaille(ko: number): string {
  if (ko >= 1024) return `${(ko / 1024).toFixed(1).replace(".", ",")} Mo`
  return `${formatInt(ko)} Ko`
}

function ageLabel(iso: string): string {
  const h = (Date.now() - new Date(iso).getTime()) / 3600000
  if (h < 1) return "il y a moins d'une heure"
  if (h < 24) return `il y a ${Math.max(1, Math.round(h))} h`
  const j = Math.round(h / 24)
  return `il y a ${j} jour${j > 1 ? "s" : ""}`
}

function dureeIncident(debut: string, fin: string | null): string {
  const ms = (fin ? new Date(fin).getTime() : Date.now()) - new Date(debut).getTime()
  const min = Math.max(1, Math.round(ms / 60000))
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} j`
}

// Heuristique de présence du fichier de sauvegarde (côté client, sans
// endpoint dédié) : les sauvegardes créées à l'exécution suivent la convention
// de nommage de l'API (horodatage ISO) et le seed a copié physiquement les 2
// dernières sauvegardes automatiques. Les autres entrées seed sont purement
// historiques — l'API répond alors 409, géré par un toast d'erreur explicite.
const FICHIER_HORODATE = /^backup-(manuel|pre-restauration)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/
const FICHIERS_SEED_PHYSIQUES = new Set(["backup-auto-j.db", "backup-auto-j1.db"])
function fichierSurDisque(nomFichier: string): boolean {
  return FICHIER_HORODATE.test(nomFichier) || FICHIERS_SEED_PHYSIQUES.has(nomFichier)
}

// ---------------------------------------------------------------- composant

export function SaSupervision() {
  // données
  const [sup, setSup] = useState<SupervisionResponse | null>(null)
  const [sauvegardes, setSauvegardes] = useState<SauvegardeDTO[]>([])
  const [disque, setDisque] = useState<DisqueResponse["disque"] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const recharger = useCallback(() => setReloadKey(k => k + 1), [])

  // jobs
  const [jobsEnCours, setJobsEnCours] = useState<Set<string>>(new Set())
  const [jobADesactiver, setJobADesactiver] = useState<JobDTO | null>(null)

  // sauvegardes
  const [dialogSauvegarde, setDialogSauvegarde] = useState(false)
  const [noteSauvegarde, setNoteSauvegarde] = useState("")
  const [creationEnCours, setCreationEnCours] = useState(false)
  const [cibleRestauration, setCibleRestauration] = useState<SauvegardeDTO | null>(null)
  const [restaurationEnCours, setRestaurationEnCours] = useState(false)

  // maintenance
  const [maintenanceOn, setMaintenanceOn] = useState(false)
  const [messageMaintenance, setMessageMaintenance] = useState("")
  const [brouillonMessage, setBrouillonMessage] = useState("")
  const [confirmActivation, setConfirmActivation] = useState(false)
  const [majEnCours, setMajEnCours] = useState(false)

  useEffect(() => {
    const ac = new AbortController()
    Promise.all([
      fetch("/api/super/supervision", { signal: ac.signal }).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
      fetch("/api/super/sauvegardes", { signal: ac.signal }).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
    ])
      .then(([supervision, journal]: [SupervisionResponse, DisqueResponse]) => {
        setSup(supervision)
        setSauvegardes(journal.sauvegardes)
        setDisque(journal.disque)
        setMaintenanceOn(supervision.maintenance.mode)
        setMessageMaintenance(supervision.maintenance.message)
        setBrouillonMessage(supervision.maintenance.message)
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setError("Impossible de charger l'état de supervision de la plateforme.")
      })
    return () => ac.abort()
  }, [reloadKey])

  // ---------------------------------------------------------------- mutations

  const marquerJob = (id: string, actif: boolean) =>
    setJobsEnCours(s => { const n = new Set(s); if (actif) n.add(id); else n.delete(id); return n })

  async function patchConfig(cle: string, valeur: string): Promise<boolean> {
    try {
      const r = await fetch(`/api/super/config?cle=${encodeURIComponent(cle)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valeur }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        toast.error("Mise à jour impossible", { description: j?.error ?? `HTTP ${r.status}` })
        return false
      }
      return true
    } catch {
      toast.error("Erreur réseau", { description: "Le paramètre n'a pas pu être mis à jour." })
      return false
    }
  }

  async function basculerJob(j: JobDTO) {
    marquerJob(j.id, true)
    try {
      const r = await fetch(`/api/super/jobs?id=${encodeURIComponent(j.id)}`, { method: "PATCH" })
      const json = await r.json().catch(() => null)
      if (!r.ok) {
        toast.error("Bascule impossible", { description: json?.error ?? `HTTP ${r.status}` })
        return
      }
      toast.success(j.actif ? "Job désactivé" : "Job réactivé", {
        description: `${j.nom} — ${j.actif ? "ne s'exécutera plus selon sa périodicité" : "reprend son exécution planifiée"}. Action tracée à l'audit.`,
      })
      recharger()
    } catch {
      toast.error("Erreur réseau", { description: "La commande n'a pas pu être envoyée." })
    } finally {
      marquerJob(j.id, false)
    }
  }

  async function executerJob(j: JobDTO) {
    marquerJob(j.id, true)
    try {
      const r = await fetch(`/api/super/jobs?id=${encodeURIComponent(j.id)}`, { method: "POST" })
      const json = await r.json().catch(() => null)
      if (!r.ok) {
        toast.error("Exécution impossible", { description: json?.error ?? `HTTP ${r.status}` })
        return
      }
      const job = json.job as JobDTO
      toast.success(`${job.nom} — exécuté`, {
        description: `${job.resultat} · durée ${formatDuree(job.dureeDernierRunMs)}.`,
      })
      recharger()
    } catch {
      toast.error("Erreur réseau", { description: "L'exécution n'a pas pu être déclenchée." })
    } finally {
      marquerJob(j.id, false)
    }
  }

  async function creerSauvegarde() {
    setCreationEnCours(true)
    try {
      const r = await fetch("/api/super/sauvegardes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteSauvegarde.trim() || undefined }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        toast.error("Sauvegarde impossible", { description: j?.error ?? `HTTP ${r.status}` })
        return
      }
      const s = j.sauvegarde as SauvegardeDTO
      toast.success("Sauvegarde physique créée", {
        description: `${s.nomFichier} — ${formatTaille(s.tailleKo)} · ${s.nbTables} tables · ${formatDuree(s.dureeMs)}.`,
      })
      setDialogSauvegarde(false)
      setNoteSauvegarde("")
      recharger()
    } catch {
      toast.error("Erreur réseau", { description: "La copie physique n'a pas pu être déclenchée." })
    } finally {
      setCreationEnCours(false)
    }
  }

  async function restaurer(s: SauvegardeDTO) {
    setRestaurationEnCours(true)
    try {
      const r = await fetch(`/api/super/sauvegardes?id=${encodeURIComponent(s.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restaurer" }),
      })
      const j = await r.json().catch(() => null)
      if (r.status === 409) {
        toast.error("Restauration impossible", { description: j?.error ?? "Fichier de sauvegarde absent du disque (entrée seed ancienne)." })
        return
      }
      if (!r.ok) {
        toast.error("Restauration impossible", { description: j?.error ?? `HTTP ${r.status}` })
        return
      }
      toast.success("Base physiquement restaurée", {
        description: `Depuis ${j.restaure} — instantané préalable : ${j.instantane}. Rechargez la page pour réaligner les données affichées.`,
        duration: 10000,
      })
      recharger()
    } catch {
      toast.error("Erreur réseau", { description: "La restauration n'a pas pu être exécutée." })
    } finally {
      setRestaurationEnCours(false)
      setCibleRestauration(null)
    }
  }

  async function activerMaintenance() {
    setConfirmActivation(false)
    setMajEnCours(true)
    try {
      if (await patchConfig("maintenance.mode", "true")) {
        setMaintenanceOn(true)
        toast.warning("Mode maintenance ACTIF", {
          description: "La bannière maintenance s'affiche désormais sur TOUS les espaces (visible après rechargement de la page).",
        })
        recharger()
      }
    } finally {
      setMajEnCours(false)
    }
  }

  async function desactiverMaintenance() {
    setMajEnCours(true)
    try {
      if (await patchConfig("maintenance.mode", "false")) {
        setMaintenanceOn(false)
        toast.success("Mode maintenance désactivé", {
          description: "La plateforme redevient pleinement accessible (bannière retirée après rechargement).",
        })
        recharger()
      }
    } finally {
      setMajEnCours(false)
    }
  }

  async function enregistrerMessage() {
    setMajEnCours(true)
    try {
      const valeur = brouillonMessage.trim() || "Maintenance planifiée — accès dégradé possible."
      if (await patchConfig("maintenance.message", valeur)) {
        setMessageMaintenance(valeur)
        toast.success("Message de maintenance enregistré", {
          description: "Affiché dans la bannière dès que le mode maintenance est actif.",
        })
      }
    } finally {
      setMajEnCours(false)
    }
  }

  // ---------------------------------------------------------------- rendu

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Erreur de chargement</p>
            <p className="text-xs text-red-600/90 dark:text-red-400/80">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={recharger}>Réessayer</Button>
        </CardContent>
      </Card>
    )
  }

  if (!sup) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement de la supervision">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Card>
          <CardHeader><Skeleton className="h-4 w-56" /></CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---------------------------------------------------------------- données dérivées (après garde null)

  const { base, api } = sup
  const tauxApi = Math.round((api.ok / Math.max(1, api.total)) * 100)
  const jobsActifs = sup.jobs.filter(j => j.actif).length
  const jobsErreur = sup.jobs.filter(j => j.statutDernierRun === "ERREUR")
  const incidentsEnCours = sup.incidents.filter(i => i.statut === "EN_COURS")
  const incidentsSurveilles = sup.incidents.filter(i => i.statut === "SURVEILLE")
  const incidentsOuverts = incidentsEnCours.length + incidentsSurveilles.length
  const derniere = sauvegardes[0] ?? sup.sauvegardes[0] ?? null
  const ageDerniereH = derniere ? (Date.now() - new Date(derniere.createdAt).getTime()) / 3600000 : Infinity

  const jobsTries = [...sup.jobs].sort((a, b) => {
    const ea = a.statutDernierRun === "ERREUR" ? 0 : 1
    const eb = b.statutDernierRun === "ERREUR" ? 0 : 1
    if (ea !== eb) return ea - eb
    if (a.actif !== b.actif) return a.actif ? -1 : 1
    return a.nom.localeCompare(b.nom, "fr")
  })

  const incidentsTries = [...sup.incidents].sort((a, b) => {
    const ordre: Record<string, number> = { EN_COURS: 0, SURVEILLE: 1, RESOLU: 2 }
    return (ordre[a.statut] ?? 3) - (ordre[b.statut] ?? 3) || new Date(b.debut).getTime() - new Date(a.debut).getTime()
  })

  const topTables = [...base.tables].sort((a, b) => b.lignes - a.lignes).slice(0, 10)

  // ---------------------------------------------------------------- colonnes : tables de la base

  const colonnesTables: DataViewColumn<{ table: string; lignes: number; latenceMs: number }>[] = [
    {
      key: "table", header: "Table", sortValue: t => t.table,
      render: t => <span className="font-mono text-xs font-medium">{t.table}</span>,
    },
    {
      key: "lignes", header: "Lignes", align: "right", sortValue: t => t.lignes,
      render: t => <span className="text-xs tabular-nums">{formatInt(t.lignes)}</span>,
    },
    {
      key: "latence", header: "Latence", align: "right", sortValue: t => t.latenceMs,
      render: t => {
        const cls = t.latenceMs < 2
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
          : t.latenceMs < 5
            ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
            : "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
        return <Badge variant="outline" className={cn("tabular-nums text-[10px]", cls)}>{formatDuree(t.latenceMs)}</Badge>
      },
    },
  ]

  // ---------------------------------------------------------------- colonnes : jobs

  const colonnesJobs: DataViewColumn<JobDTO>[] = [
    {
      key: "job", header: "Job", sortValue: j => j.nom,
      render: j => (
        <div className="flex min-w-0 items-start gap-1.5">
          {j.statutDernierRun === "ERREUR" && <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" aria-label="Dernier run en erreur" />}
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{j.nom}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{j.code}</p>
          </div>
        </div>
      ),
    },
    {
      key: "description", header: "Description", sortValue: j => j.description,
      render: j => <span className="block max-w-[280px] truncate text-xs text-muted-foreground" title={j.description}>{j.description}</span>,
    },
    {
      key: "periodicite", header: "Périodicité", sortValue: j => j.periodicite,
      render: j => {
        const p = pastille(PERIODICITE_JOB_META, j.periodicite)
        return <Badge variant="outline" className={cn("text-[10px]", p.className)}>{p.label}</Badge>
      },
    },
    {
      key: "dernierRun", header: "Dernier run", sortValue: j => (j.dernierRun ? new Date(j.dernierRun).getTime() : 0),
      render: j => (
        <div className="whitespace-nowrap text-xs tabular-nums">
          {j.dernierRun ? formatDateTime(j.dernierRun) : <span className="text-muted-foreground">jamais</span>}
          <span className="block text-[11px] text-muted-foreground">
            {j.dernierRun ? `durée ${formatDuree(j.dureeDernierRunMs)}` : "—"}
          </span>
        </div>
      ),
    },
    {
      key: "statut", header: "Statut", sortValue: j => j.statutDernierRun,
      render: j => {
        const p = pastille(JOB_STATUT_META, j.statutDernierRun)
        return <Badge variant="outline" className={cn("text-[10px]", p.className)}>{p.label}</Badge>
      },
    },
    {
      key: "resultat", header: "Résultat", sortValue: j => j.resultat,
      render: j => <span className="block max-w-[240px] truncate text-xs text-muted-foreground" title={j.resultat}>{j.resultat || "—"}</span>,
    },
    {
      key: "actif", header: "Actif", align: "center", sortValue: j => (j.actif ? 1 : 0),
      render: j => (
        <Switch
          checked={j.actif}
          disabled={jobsEnCours.has(j.id) || majEnCours}
          onCheckedChange={() => { if (j.actif) setJobADesactiver(j); else void basculerJob(j) }}
          aria-label={`${j.actif ? "Désactiver" : "Réactiver"} le job ${j.nom}`}
        />
      ),
    },
    {
      key: "actions", header: "Actions", align: "right",
      render: j => (
        <Button
          variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]"
          disabled={jobsEnCours.has(j.id)}
          onClick={() => void executerJob(j)}
        >
          {jobsEnCours.has(j.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Exécuter
        </Button>
      ),
    },
  ]

  const renderCarteJob = (j: JobDTO) => (
    <Card className={cn(
      "overflow-hidden",
      j.statutDernierRun === "ERREUR" && "border-red-300 dark:border-red-900",
      !j.actif && "opacity-70",
    )}>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold leading-snug">
              {j.statutDernierRun === "ERREUR" && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />}
              {j.nom}
            </p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{j.code}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant="outline" className={cn("text-[10px]", pastille(JOB_STATUT_META, j.statutDernierRun).className)}>
              {pastille(JOB_STATUT_META, j.statutDernierRun).label}
            </Badge>
            <Badge variant="outline" className={cn("text-[10px]", pastille(PERIODICITE_JOB_META, j.periodicite).className)}>
              {pastille(PERIODICITE_JOB_META, j.periodicite).label}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{j.description}</p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          Dernier run : {j.dernierRun ? `${formatDateTime(j.dernierRun)} · ${formatDuree(j.dureeDernierRunMs)}` : "jamais exécuté"}
        </p>
        {j.resultat && <p className="text-xs">{j.resultat}</p>}
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={j.actif}
              disabled={jobsEnCours.has(j.id) || majEnCours}
              onCheckedChange={() => { if (j.actif) setJobADesactiver(j); else void basculerJob(j) }}
              aria-label={`${j.actif ? "Désactiver" : "Réactiver"} le job ${j.nom}`}
            />
            {j.actif ? "Actif" : "Inactif"}
          </span>
          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={jobsEnCours.has(j.id)} onClick={() => void executerJob(j)}>
            {jobsEnCours.has(j.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Exécuter
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  // ---------------------------------------------------------------- colonnes : sauvegardes

  const colonnesSauvegardes: DataViewColumn<SauvegardeDTO>[] = [
    {
      key: "nom", header: "Fichier", sortValue: s => s.nomFichier,
      render: s => (
        <span className="block max-w-[240px] truncate font-mono text-[11px]" title={s.nomFichier}>{s.nomFichier}</span>
      ),
    },
    {
      key: "type", header: "Type", sortValue: s => s.type,
      render: s => {
        const p = pastille(TYPE_SAUVEGARDE_META, s.type)
        return <Badge variant="outline" className={cn("text-[10px]", p.className)}>{p.label}</Badge>
      },
    },
    {
      key: "taille", header: "Taille", align: "right", sortValue: s => s.tailleKo,
      render: s => <span className="text-xs tabular-nums">{formatTaille(s.tailleKo)}</span>,
    },
    {
      key: "tables", header: "Tables", align: "right", sortValue: s => s.nbTables,
      render: s => <span className="text-xs tabular-nums">{formatInt(s.nbTables)}</span>,
    },
    {
      key: "duree", header: "Durée", align: "right", sortValue: s => s.dureeMs,
      render: s => <span className="text-xs tabular-nums text-muted-foreground">{formatDuree(s.dureeMs)}</span>,
    },
    {
      key: "cree", header: "Créée le", sortValue: s => new Date(s.createdAt).getTime(),
      render: s => (
        <div className="whitespace-nowrap text-xs tabular-nums">
          {formatDateTime(s.createdAt)}
          <span className="block text-[11px] text-muted-foreground">{ageLabel(s.createdAt)}</span>
        </div>
      ),
    },
    {
      key: "note", header: "Note", sortValue: s => s.note,
      render: s => <span className="block max-w-[220px] truncate text-xs text-muted-foreground" title={s.note}>{s.note || "—"}</span>,
    },
    {
      key: "actions", header: "Actions", align: "right",
      render: s => {
        if (!fichierSurDisque(s.nomFichier)) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled aria-label="Restauration indisponible">
                    <RotateCcw className="h-3 w-3" /> Restaurer
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-64">
                Fichier absent du disque (entrée seed historique) — restauration impossible, l&apos;API répondrait 409.
              </TooltipContent>
            </Tooltip>
          )
        }
        return (
          <Button
            variant="outline" size="sm"
            className="h-7 gap-1 px-2 text-[11px] text-red-700 hover:border-red-300 hover:bg-red-50 dark:text-red-400 dark:hover:border-red-800 dark:hover:bg-red-950"
            onClick={() => setCibleRestauration(s)}
          >
            <RotateCcw className="h-3 w-3" /> Restaurer
          </Button>
        )
      },
    },
  ]

  const renderCarteSauvegarde = (s: SauvegardeDTO) => {
    const present = fichierSurDisque(s.nomFichier)
    return (
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 break-all font-mono text-[11px] font-medium leading-snug">{s.nomFichier}</p>
            <Badge variant="outline" className={cn("shrink-0 text-[10px]", pastille(TYPE_SAUVEGARDE_META, s.type).className)}>
              {pastille(TYPE_SAUVEGARDE_META, s.type).label}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
            <span className="tabular-nums">{formatTaille(s.tailleKo)}</span>
            <span className="tabular-nums">{formatInt(s.nbTables)} tables</span>
            <span className="tabular-nums">{formatDuree(s.dureeMs)}</span>
            <span className="tabular-nums">{formatDateTime(s.createdAt)}</span>
          </div>
          {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
          <div className="pt-1">
            {present ? (
              <Button
                variant="outline" size="sm"
                className="h-7 w-full gap-1 text-[11px] text-red-700 hover:border-red-300 hover:bg-red-50 dark:text-red-400 dark:hover:border-red-800 dark:hover:bg-red-950"
                onClick={() => setCibleRestauration(s)}
              >
                <RotateCcw className="h-3 w-3" /> Restaurer cette sauvegarde
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="h-7 w-full cursor-not-allowed gap-1 text-[11px]" disabled>
                <RotateCcw className="h-3 w-3" /> Fichier absent (seed)
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ---------------------------------------------------------------- rendu principal

  return (
    <div className="space-y-4">
      {/* ---------- bouton d'actualisation ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          État relevé en direct — la sonde API s&apos;exécute à chaque chargement de la page.
        </p>
        <Button variant="outline" size="sm" className="h-8" onClick={recharger}>
          <RefreshCw className="h-3.5 w-3.5" /> Actualiser
        </Button>
      </div>

      {/* ---------- KPI santé ---------- */}
      <section aria-label="Indicateurs de santé de la plateforme" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Base de données" value={base.integrityOk ? "Intègre" : "Alerte"} icon={Database}
          tone={base.integrityOk ? "success" : "danger"}
          sub={`${formatTaille(base.tailleKo)} · ${base.nbTables} tables · ${formatInt(base.totalLignes)} lignes`}
        />
        <KpiCard
          label="Latence base" value={formatDuree(base.latenceMs)} icon={Timer}
          tone={base.latenceMs < 60 ? "success" : base.latenceMs < 300 ? "warning" : "danger"}
          sub="cumul des sondes table par table"
        />
        <KpiCard
          label="Endpoints API" value={`${api.ok}/${api.total}`} icon={Activity}
          tone={api.ok === api.total ? "success" : api.ok === 0 ? "danger" : "warning"}
          sub="sonde réelle au chargement"
        />
        <KpiCard
          label="Jobs planifiés" value={`${jobsActifs}/${sup.jobs.length}`} icon={Cog}
          tone={jobsErreur.length > 0 ? "danger" : "success"}
          sub={jobsErreur.length > 0 ? `${jobsErreur.length} en erreur — ${jobsErreur[0].code}` : "tous exécutés avec succès"}
        />
        <KpiCard
          label="Dernière sauvegarde"
          value={derniere ? pastille(TYPE_SAUVEGARDE_META, derniere.type).label : "—"}
          icon={Save}
          tone={ageDerniereH < 48 ? "success" : ageDerniereH < 192 ? "warning" : "danger"}
          sub={derniere ? `${formatTaille(derniere.tailleKo)} · ${ageLabel(derniere.createdAt)}` : "aucune sauvegarde"}
        />
        <KpiCard
          label="Incidents ouverts" value={formatInt(incidentsOuverts)} icon={AlertTriangle}
          tone={incidentsEnCours.length > 0 ? "danger" : incidentsSurveilles.length > 0 ? "warning" : "success"}
          sub={`${incidentsEnCours.length} en cours · ${incidentsSurveilles.length} sous surveillance`}
        />
      </section>

      {/* ---------- Santé de la base ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>Santé de la base de données</CardTitle>
              <CardDescription>
                Comptage réel ligne par ligne — {formatInt(base.totalLignes)} lignes réparties sur {base.nbTables} tables.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={cn(
                "gap-1 text-[10px]",
                base.integrityOk
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                  : "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
              )}>
                {base.integrityOk ? "Intégrité vérifiée" : "Intégrité dégradée"}
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">{base.fichier}</Badge>
              <Badge variant="outline" className="tabular-nums text-[10px]">{formatTaille(base.tailleKo)}</Badge>
              <Badge variant="outline" className={cn(
                "tabular-nums text-[10px]",
                base.latenceMs < 60
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                  : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
              )}>
                {formatDuree(base.latenceMs)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Top 10 des tables les plus volumineuses */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Top 10 des tables par nombre de lignes</p>
            <div className="h-56" role="img" aria-label="Histogramme horizontal des dix plus grandes tables">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topTables} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                  <CartesianGrid horizontal={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="table" width={96} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <RTooltip
                    contentStyle={tooltipStyle()}
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    formatter={(value: number) => [`${num(value)} lignes`, ""]}
                  />
                  <Bar dataKey="lignes" radius={[0, 4, 4, 0]} barSize={13} fill="#9333ea" name="lignes" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <DataViews
            viewKey="sa-tables"
            columns={colonnesTables}
            rows={base.tables}
            rowKey={t => t.table}
            cardColumns={2}
            emptyMessage="Aucune table détectée."
            maxHeightClassName="max-h-96"
          />
        </CardContent>
      </Card>

      {/* ---------- Santé des API ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>Santé des API</CardTitle>
              <CardDescription>
                {api.ok}/{api.total} endpoints répondent correctement — sonde exécutée à chaque chargement (seuil « Lent » à 800 ms).
              </CardDescription>
            </div>
            <Badge variant="outline" className={cn(
              "tabular-nums text-[10px]",
              tauxApi === 100
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
            )}>
              {tauxApi} % OK
            </Badge>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Progress value={tauxApi} className="h-2" aria-label="Taux de endpoints OK" />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{tauxApi} %</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2">
            {api.endpoints.map(e => {
              const p = pastille(ENDPOINT_STATUT_META, e.statut)
              return (
                <div key={e.chemin} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span className="min-w-0 truncate font-mono text-[11px]">{e.chemin}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">{formatDuree(e.latenceMs)}</span>
                    <Badge variant="outline" className={cn("text-[10px]", p.className)}>{p.label}</Badge>
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ---------- Jobs planifiés ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>Jobs planifiés</CardTitle>
              <CardDescription>
                {jobsActifs}/{sup.jobs.length} actifs — {jobsErreur.length > 0 ? `${jobsErreur.length} en échec (${jobsErreur.map(j => j.code).join(", ")})` : "tous en succès"}.
              </CardDescription>
            </div>
            {jobsErreur.length > 0 && (
              <Badge variant="outline" className="gap-1 border-red-300 bg-red-50 text-[10px] text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                <AlertCircle className="h-3 w-3" aria-hidden /> action requise
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey="sa-jobs"
            columns={colonnesJobs}
            rows={jobsTries}
            rowKey={j => j.id}
            renderCard={renderCarteJob}
            cardColumns={2}
            emptyMessage="Aucun job planifié."
            maxHeightClassName="max-h-96"
          />
        </CardContent>
      </Card>

      {/* ---------- Sauvegardes & restauration ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Sauvegardes & restauration</CardTitle>
              <CardDescription>
                Copies PHYSIQUES de la base dans <span className="font-mono">db/backups/</span> — {sauvegardes.length} entrée{pluriel(sauvegardes.length)} au journal.
              </CardDescription>
              {disque && (
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <HardDrive className="h-3.5 w-3.5" aria-hidden /> Base : {formatTaille(disque.baseTailleKo)}
                  </span>
                  <span>Historique : {formatTaille(disque.backupsTailleKo)}</span>
                  <span className="font-medium text-foreground">Total : {formatTaille(disque.baseTailleKo + disque.backupsTailleKo)}</span>
                </p>
              )}
            </div>
            <Button
              size="sm" className="h-9 shrink-0 bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => setDialogSauvegarde(true)}
            >
              <Save className="h-4 w-4" />
              Créer une sauvegarde maintenant
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey="sa-sauvegardes"
            columns={colonnesSauvegardes}
            rows={sauvegardes}
            rowKey={s => s.id}
            renderCard={renderCarteSauvegarde}
            cardColumns={2}
            emptyMessage="Aucune sauvegarde au journal."
            maxHeightClassName="max-h-96"
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Les entrées marquées « Fichier absent (seed) » sont historiques : leur copie physique n&apos;a pas été conservée
            sur le disque, la restauration est désactivée.
          </p>
        </CardContent>
      </Card>

      {/* ---------- Mode maintenance ---------- */}
      <Card className={cn(
        maintenanceOn
          ? "border-red-300 dark:border-red-900"
          : "border-amber-300 dark:border-amber-800",
      )}>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
                Mode maintenance
              </CardTitle>
              <CardDescription>
                Suspend l&apos;accès à la plateforme pour une maintenance planifiée — bannière affichée sur tous les espaces.
              </CardDescription>
            </div>
            <Switch
              checked={maintenanceOn}
              disabled={majEnCours}
              onCheckedChange={v => { if (v) setConfirmActivation(true); else void desactiverMaintenance() }}
              aria-label="Activer ou désactiver le mode maintenance"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn(
              "text-[10px]",
              maintenanceOn
                ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                : "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
            )}>
              {maintenanceOn ? "ACTIF — bannière visible partout" : "Inactif"}
            </Badge>
            {maintenanceOn && (
              <span className="text-xs text-red-600 dark:text-red-400">
                Message affiché : «&nbsp;{messageMaintenance || "La plateforme est en mode maintenance."}&nbsp;»
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sa-maintenance-message">Message de la bannière (modifiable)</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="sa-maintenance-message"
                value={brouillonMessage}
                onChange={e => setBrouillonMessage(e.target.value)}
                placeholder="Maintenance planifiée — accès dégradé possible."
                className="min-w-[240px] flex-1"
                maxLength={200}
              />
              <Button
                variant="outline" size="sm" className="h-9"
                disabled={majEnCours || brouillonMessage.trim() === messageMaintenance.trim()}
                onClick={() => void enregistrerMessage()}
              >
                {majEnCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Enregistrer le message
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Activation protégée : une confirmation est exigée, l&apos;impact est global (bannière sur TOUS les espaces) et l&apos;action est auditée en «&nbsp;CRITIQUE&nbsp;».
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Incidents & charge opérationnelle ---------- */}
      <section className="grid gap-4 lg:grid-cols-3" aria-label="Incidents et charge opérationnelle">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Incidents</CardTitle>
            <CardDescription>
              Journal des incidents de plateforme — {incidentsOuverts} ouvert{incidentsOuverts > 1 ? "s" : ""} sur {sup.incidents.length} au total.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {incidentsTries.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Aucun incident enregistré — la plateforme est stable.
              </p>
            ) : (
              <ol className="max-h-96 space-y-3 overflow-y-auto border-l-2 border-border pl-4 pr-1" aria-label="Chronologie des incidents">
                {incidentsTries.map(i => {
                  const st = pastille(INCIDENT_STATUT_META, i.statut)
                  const sv = pastille(SEVERITE_META, i.severite)
                  return (
                    <li key={i.id} className="relative">
                      <span className={cn(
                        "absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full",
                        i.statut === "EN_COURS" ? "bg-red-500" : i.statut === "SURVEILLE" ? "bg-amber-500" : "bg-emerald-500",
                      )} aria-hidden />
                      <div className={cn(
                        "rounded-lg border p-3",
                        i.statut === "EN_COURS"
                          ? "border-red-200 bg-red-50/40 dark:border-red-900/70 dark:bg-red-950/20"
                          : "border-border bg-card",
                      )}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="min-w-0 text-sm font-semibold leading-snug">{i.titre}</p>
                          <div className="flex shrink-0 flex-wrap items-center gap-1">
                            <Badge variant="outline" className={cn("text-[10px]", sv.className)}>{sv.label}</Badge>
                            <Badge variant="outline" className={cn("text-[10px]", st.className)}>{st.label}</Badge>
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              {COMPOSANT_META[i.composant] ?? i.composant}
                            </Badge>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{i.impact}</p>
                        <p className="mt-1 text-xs leading-relaxed">{i.description}</p>
                        <p className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
                          <span>
                            {formatDateTime(i.debut)} → {i.fin ? formatDateTime(i.fin) : <span className="font-medium text-red-600 dark:text-red-400">en cours</span>}
                          </span>
                          <span>durée : {dureeIncident(i.debut, i.fin)}</span>
                        </p>
                        {i.resolution && (
                          <p className="mt-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] leading-relaxed text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
                            Résolution : {i.resolution}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Charge actuelle</CardTitle>
            <CardDescription>Activité en attente de traitement par l&apos;équipe CarbuScope.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2.5 dark:border-violet-900 dark:bg-violet-950/30">
              <span className="flex items-center gap-2 text-sm">
                <Gauge className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
                Missions terrain en cours
              </span>
              <span className="text-lg font-bold tabular-nums">{formatInt(sup.charge.missionsEnCours)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950/30">
              <span className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
                Signalements B2C en attente
              </span>
              <span className="text-lg font-bold tabular-nums">{formatInt(sup.charge.signalementsEnAttente)}</span>
            </div>
            <div className={cn(
              "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5",
              sup.charge.alertesCritiques > 0
                ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30"
                : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30",
            )}>
              <span className="flex items-center gap-2 text-sm">
                <AlertTriangle className={cn(
                  "h-4 w-4",
                  sup.charge.alertesCritiques > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400",
                )} aria-hidden />
                Alertes critiques non lues
              </span>
              <span className={cn(
                "text-lg font-bold tabular-nums",
                sup.charge.alertesCritiques > 0 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400",
              )}>
                {formatInt(sup.charge.alertesCritiques)}
              </span>
            </div>
            <p className="text-xs italic text-muted-foreground">
              Indicateurs relevés en base — combinés aux incidents, ils pilotent la priorisation de l&apos;équipe.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ---------- Dialogues ---------- */}
      <Dialog open={dialogSauvegarde} onOpenChange={setDialogSauvegarde}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
              Créer une sauvegarde maintenant
            </DialogTitle>
            <DialogDescription>
              Copie physique réelle du fichier <span className="font-mono">{base.fichier}</span> vers <span className="font-mono">db/backups/</span> — l&apos;opération est instantanée et auditée.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="sa-note-sauvegarde">Note (optionnelle)</Label>
            <Textarea
              id="sa-note-sauvegarde"
              value={noteSauvegarde}
              onChange={e => setNoteSauvegarde(e.target.value)}
              placeholder="Ex. avant migration, sauvegarde de fin de mois…"
              rows={3}
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              Taille attendue : environ {formatTaille(base.tailleKo)} · {base.nbTables} tables.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogSauvegarde(false)} disabled={creationEnCours}>Annuler</Button>
            <Button onClick={() => void creerSauvegarde()} disabled={creationEnCours} className="bg-violet-600 text-white hover:bg-violet-700">
              {creationEnCours && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Créer la sauvegarde
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restauration — double avertissement */}
      <AlertDialog open={!!cibleRestauration} onOpenChange={o => { if (!o) setCibleRestauration(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-700 dark:text-red-400">
              Restaurer la base depuis cette sauvegarde ?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  La sauvegarde <span className="font-mono text-xs">{cibleRestauration?.nomFichier}</span> du{" "}
                  {cibleRestauration ? formatDateTime(cibleRestauration.createdAt) : ""} ({cibleRestauration ? formatTaille(cibleRestauration.tailleKo) : ""}){" "}
                  va remplacer physiquement la base actuelle.
                </p>
                <ul className="list-disc space-y-1 pl-4 text-left">
                  <li>
                    <strong>Filet de sécurité</strong> : un instantané de la base actuelle sera d&apos;abord créé
                    (type «&nbsp;Pré-restauration&nbsp;») pour permettre un retour arrière.
                  </li>
                  <li>
                    <strong>Impact réel</strong> : toutes les données enregistrées après cette sauvegarde
                    (stations, avis, factures, tickets…) seront écrasées.
                  </li>
                  <li>
                    Après la restauration, un rechargement de la page est recommandé pour réaligner les caches.
                  </li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restaurationEnCours}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={restaurationEnCours}
              onClick={e => {
                e.preventDefault()
                if (cibleRestauration) void restaurer(cibleRestauration)
              }}
            >
              {restaurationEnCours && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Restaurer maintenant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Désactivation d'un job — confirmation */}
      <AlertDialog open={!!jobADesactiver} onOpenChange={o => { if (!o) setJobADesactiver(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver ce job planifié ?</AlertDialogTitle>
            <AlertDialogDescription>
              «&nbsp;{jobADesactiver?.nom}&nbsp;» ({jobADesactiver?.code}) ne s&apos;exécutera plus selon sa périodicité
              ({pastille(PERIODICITE_JOB_META, jobADesactiver?.periodicite ?? "").label.toLowerCase()}) jusqu&apos;à
              sa réactivation. Vous pourrez toujours le déclencher manuellement depuis la liste.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                const j = jobADesactiver
                setJobADesactiver(null)
                if (j) void basculerJob(j)
              }}
            >
              Désactiver le job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Activation maintenance — confirmation rouge */}
      <AlertDialog open={confirmActivation} onOpenChange={setConfirmActivation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-700 dark:text-red-400">
              Activer le mode maintenance ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Une bannière de maintenance sera affichée en haut de <strong>TOUS</strong> les espaces — Observatoire,
              portails enseignes, application mobile, back-office et Super Administration — jusqu&apos;à la désactivation
              explicite. Message qui sera diffusé : «&nbsp;{brouillonMessage.trim() || messageMaintenance || "La plateforme est en mode maintenance."}&nbsp;».
              L&apos;action est journalisée en sévérité «&nbsp;CRITIQUE&nbsp;».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={e => {
                e.preventDefault()
                void activerMaintenance()
              }}
            >
              <Wrench className="h-3.5 w-3.5" />
              Activer la maintenance
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** « entrées » / « entrée » */
function pluriel(n: number): string {
  return n > 1 ? "s" : ""
}
