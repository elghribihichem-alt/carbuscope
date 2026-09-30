"use client"

// D.2.8 — Missions terrain (module D — pilotage du système de veille terrain T28) :
// agents de zone par enseigne (ex : chaque agent TotalEnergies responsable d'un
// gouvernorat), missions de contrôle des stations de son enseigne (fiche
// propriétaire) et missions de veille concurrentielle (fiche concurrent),
// rapports de visite remontés par l'app mobile agent.
// KPIs + filtres + création assistée (sélecteur de cibles sur le parc réel,
// max 30) + pilotage mission par mission (réassignation, annulation, statut des
// cibles) + gestion des agents (actif/inactif — la désactivation détache les
// missions ouvertes). Listes en multi-vues DataViews (T27).

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Radar, ClipboardList, ClipboardCheck, CheckCircle2, UserRound, ShieldCheck, Swords,
  Eye, MapPin, Loader2, Plus, X, Search, Phone, AlertTriangle, Circle, Check, Ban,
  UserCog, FileText, ChevronDown, Sparkles, Download, type LucideIcon,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { ErrorState } from "@/components/shell/loading"
import { fmtDate, fmtDateTime, GOVERNORAT_NAMES } from "@/components/settings/settings-shared"
import type {
  BrandDTO, FieldAgentDTO, MissionDTO, MissionDetailDTO, MissionStatus, MissionTaskDTO,
  MissionTaskStatus, MissionType, MissionsResponse, StationDTO, VisitReportDTO,
} from "@/lib/types"
import { cn } from "@/lib/utils"

// ---------- Conventions & helpers ----------

const NEUTRAL_DOT = "#a1a1aa" // T53-T6b : slate-400 → zinc-400
const DAY_MS = 86_400_000
const MAX_TARGETS = 30

/** Prix en millimes → « 1,885 DT » */
const fmtDt = (millimes: number): string =>
  `${(millimes / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} DT`

const todayIso = (): string => new Date().toISOString().slice(0, 10)

type BrandLookup = (slug: string | null) => { name: string; color: string }

const isMissionOverdue = (m: Pick<MissionDTO, "dueDate" | "status">): boolean => {
  if (!m.dueDate || m.status === "TERMINEE" || m.status === "ANNULEE") return false
  const due = new Date(m.dueDate)
  due.setHours(23, 59, 59, 999)
  return due.getTime() < Date.now()
}

const MISSION_TYPES: MissionType[] = ["CONTROLE", "VEILLE_CONCURRENT"]
const MISSION_STATUSES: MissionStatus[] = ["PLANIFIEE", "EN_COURS", "TERMINEE", "ANNULEE"]
const TASK_STATUSES: MissionTaskStatus[] = ["TODO", "FAITE", "ANOMALIE"]

const TYPE_META: Record<MissionType, {
  label: string
  chip: string
  icon: LucideIcon
  iconBg: string
  cardTitle: string
  cardDesc: string
}> = {
  CONTROLE: {
    label: "Contrôle",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    icon: ShieldCheck,
    iconBg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    cardTitle: "Contrôle de mes stations",
    cardDesc: "Vérifier la conformité des stations de l'enseigne commanditaire (fiche propriétaire).",
  },
  VEILLE_CONCURRENT: {
    label: "Veille",
    chip: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-400",
    icon: Swords,
    iconBg: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
    cardTitle: "Veille concurrentielle",
    cardDesc: "Observer discrètement les stations d'une enseigne concurrente (fiche concurrent).",
  },
}

const STATUS_META: Record<MissionStatus, { label: string; chip: string; dot: string; rank: number }> = {
  EN_COURS: {
    label: "En cours",
    chip: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    dot: "bg-amber-500",
    rank: 0,
  },
  PLANIFIEE: {
    label: "Planifiée",
    // T53-T6b : slate → zinc (harmonisation neutres, pattern T53-T4b/T5b/T6a).
    chip: "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
    dot: "bg-zinc-400",
    rank: 1,
  },
  TERMINEE: {
    label: "Terminée",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    dot: "bg-emerald-500",
    rank: 2,
  },
  ANNULEE: {
    label: "Annulée",
    chip: "border-dashed border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-500",
    dot: "bg-zinc-300",
    rank: 3,
  },
}

const TASK_STATUS_META: Record<MissionTaskStatus, { label: string; chip: string; icon: LucideIcon; iconColor: string }> = {
  TODO: {
    label: "À faire",
    chip: "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
    icon: Circle,
    iconColor: "text-zinc-400",
  },
  FAITE: {
    label: "Réalisée",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    icon: CheckCircle2,
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  ANOMALIE: {
    label: "Anomalie",
    chip: "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400",
    icon: AlertTriangle,
    iconColor: "text-red-600 dark:text-red-400",
  },
}

// Export CSV de la liste des missions (données réelles chargées — pattern
// T52-R2b/T6a : BOM UTF-8 + séparateur « ; » + dates FR).
function exportMissionsCsv(missions: MissionDTO[], brandOf: BrandLookup) {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = ["Mission", "Type", "Commanditaire", "Agent", "Zone", "Cibles", "Réalisées", "Anomalies", "Échéance", "Statut"]
  const lines = missions.map(m => [
    esc(m.title),
    TYPE_META[m.type]?.label ?? m.type,
    esc(brandOf(m.brandSlug).name),
    esc(m.agentName ?? "Non assignée"),
    esc(m.zone),
    m.tasksTotal,
    m.tasksDone,
    m.tasksAnomaly,
    m.dueDate ? esc(fmtDate(m.dueDate)) : "",
    STATUS_META[m.status]?.label ?? m.status,
  ].join(";"))
  const csv = ["\uFEFF" + header.join(";"), ...lines].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `missions-terrain-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  toast.success(`Liste exportée — ${missions.length} mission${missions.length > 1 ? "s" : ""}.`, {
    description: "missions-terrain.csv · compatible Excel (UTF-8, séparateur « ; »)",
  })
}

// ---------- Petits composants de rendu ----------

function TypeBadge({ type }: { type: MissionType }) {
  const Meta = TYPE_META[type] ?? TYPE_META.CONTROLE
  const Icon = Meta.icon
  return (
    <Badge variant="outline" className={cn("gap-1 text-[11px]", Meta.chip)}>
      <Icon className="h-3 w-3" aria-hidden />
      {Meta.label}
    </Badge>
  )
}

function MissionStatusBadge({ status }: { status: MissionStatus }) {
  const Meta = STATUS_META[status] ?? STATUS_META.PLANIFIEE
  return <Badge variant="outline" className={cn("text-[11px]", Meta.chip)}>{Meta.label}</Badge>
}

function TaskStatusBadge({ status }: { status: MissionTaskStatus }) {
  const Meta = TASK_STATUS_META[status] ?? TASK_STATUS_META.TODO
  return <Badge variant="outline" className={cn("text-[11px]", Meta.chip)}>{Meta.label}</Badge>
}

function BrandCell({ slug, brandOf }: { slug: string | null; brandOf: BrandLookup }) {
  const b = brandOf(slug)
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
      <span className="truncate">{b.name}</span>
    </span>
  )
}

/** Barre d'avancement + compteur + badge anomalies. */
function Advancement({
  done, total, anomaly, className,
}: { done: number; total: number; anomaly: number; className?: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className={cn("w-32 space-y-1", className)}>
      <div className="flex items-center justify-between text-[11px] leading-none text-muted-foreground">
        <span className="tabular-nums">{done}/{total} cibles</span>
        <span className="tabular-nums">{pct}&nbsp;%</span>
      </div>
      <Progress
        value={pct}
        className="h-1.5"
        aria-label={`Avancement : ${done} cibles réalisées sur ${total}`}
      />
      {anomaly > 0 && (
        <p className="flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          {anomaly} anomalie{anomaly > 1 ? "s" : ""}
        </p>
      )}
    </div>
  )
}

function DueCell({ mission }: { mission: Pick<MissionDTO, "dueDate" | "status"> }) {
  if (!mission.dueDate) return <span className="text-xs text-muted-foreground">—</span>
  const late = isMissionOverdue(mission)
  return (
    <span className={cn(
      "whitespace-nowrap text-xs tabular-nums",
      late ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground",
    )}>
      {fmtDate(mission.dueDate)}{late ? " · dépassée" : ""}
    </span>
  )
}

// ---------- Onglet principal ----------

export function BoMissions() {
  const [data, setData] = useState<MissionsResponse | null>(null)
  const [brands, setBrands] = useState<BrandDTO[] | null>(null)
  const [reports, setReports] = useState<VisitReportDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Filtres de la liste des missions
  const [fType, setFType] = useState("all")
  const [fStatus, setFStatus] = useState("all")
  const [fBrand, setFBrand] = useState("all")
  const [fZone, setFZone] = useState("all")

  // Dialogues
  const [detailId, setDetailId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    const ac = new AbortController()
    const opts = { signal: ac.signal }
    fetch("/api/missions", opts)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: MissionsResponse) => { setData(j); setError(null) })
      .catch(e => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setError("Impossible de charger les missions de veille terrain.")
      })
    // Enseignes et rapports : non bloquants pour l'onglet
    fetch("/api/brands", opts)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { brands: BrandDTO[] }) => setBrands(j.brands))
      .catch(() => {})
    fetch("/api/reports?limit=300", opts)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { reports: VisitReportDTO[] }) => setReports(j.reports))
      .catch(() => {})
    return () => ac.abort()
  }, [reloadKey])

  const missions = useMemo(() => data?.missions ?? [], [data])
  const agents = useMemo(() => data?.agents ?? [], [data])

  const brandOf = useCallback<BrandLookup>((slug) => {
    const b = brands?.find(x => x.slug === slug)
    return { name: b?.name ?? slug ?? "—", color: b?.color ?? NEUTRAL_DOT }
  }, [brands])

  const refresh = useCallback(() => setReloadKey(k => k + 1), [])

  // ----- KPIs -----
  const openCount = missions.filter(m => m.status === "PLANIFIEE" || m.status === "EN_COURS").length
  const doneCount = missions.filter(m => m.status === "TERMINEE").length
  const activeAgents = agents.filter(a => a.active).length
  const reports7d = reports === null
    ? null
    : reports.filter(r => Date.now() - new Date(r.createdAt).getTime() < 7 * DAY_MS).length

  // ----- Filtres -----
  const zones = useMemo(
    () => [...new Set(missions.map(m => m.zone))].sort((a, b) => a.localeCompare(b, "fr")),
    [missions]
  )
  const filtered = useMemo(() => missions.filter(m =>
    (fType === "all" || m.type === fType) &&
    (fStatus === "all" || m.status === fStatus) &&
    (fBrand === "all" || m.brandSlug === fBrand) &&
    (fZone === "all" || m.zone === fZone)
  ), [missions, fType, fStatus, fBrand, fZone])
  const targetsTotal = filtered.reduce((a, m) => a + m.tasksTotal, 0)

  if (error && !data) {
    return (
      <div className="p-1">
        <ErrorState message={error} retry={refresh} />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement des missions terrain…">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />)}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-3.5 w-80" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ----- Colonnes de la liste des missions -----

  const columns: DataViewColumn<MissionDTO>[] = [
    {
      key: "title", header: "Mission",
      sortValue: (m) => m.title.toLowerCase(),
      render: (m) => (
        <div className="min-w-0 space-y-1">
          <TypeBadge type={m.type} />
          <p className="max-w-[240px] truncate text-xs font-semibold" title={m.title}>{m.title}</p>
        </div>
      ),
    },
    {
      key: "brand", header: "Commanditaire",
      sortValue: (m) => brandOf(m.brandSlug).name,
      render: (m) => <BrandCell slug={m.brandSlug} brandOf={brandOf} />,
    },
    {
      key: "agent", header: "Agent",
      sortValue: (m) => m.agentName ?? "",
      render: (m) => m.agentId ? (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{m.agentName}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{m.agentCode}</p>
        </div>
      ) : (
        <span className="text-[11px] italic text-muted-foreground">Non assignée</span>
      ),
    },
    {
      key: "zone", header: "Zone",
      sortValue: (m) => m.zone,
      render: (m) => (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden />
          {m.zone}
        </span>
      ),
    },
    {
      key: "progress", header: "Avancement", className: "w-44",
      sortValue: (m) => (m.tasksTotal > 0 ? m.tasksDone / m.tasksTotal : 0),
      render: (m) => <Advancement done={m.tasksDone} total={m.tasksTotal} anomaly={m.tasksAnomaly} />,
    },
    {
      key: "due", header: "Échéance", className: "whitespace-nowrap",
      sortValue: (m) => (m.dueDate ? new Date(m.dueDate).getTime() : 0),
      render: (m) => <DueCell mission={m} />,
    },
    {
      key: "status", header: "Statut",
      sortValue: (m) => STATUS_META[m.status]?.rank ?? 9,
      render: (m) => <MissionStatusBadge status={m.status} />,
    },
    {
      key: "actions", header: "Détail", align: "center", hideInCards: true,
      render: (m) => (
        <Button
          variant="ghost" size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={e => { e.stopPropagation(); setDetailId(m.id) }}
          aria-label={`Voir le détail de la mission ${m.title}`}
          title="Voir le détail de la mission"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden /> Voir
        </Button>
      ),
    },
  ]

  const renderMissionCard = (m: MissionDTO) => {
    const b = brandOf(m.brandSlug)
    return (
      <Card className="overflow-hidden transition-shadow hover:shadow-md">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <TypeBadge type={m.type} />
            <MissionStatusBadge status={m.status} />
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
              {b.name}
            </span>
          </div>
          <p className="text-sm font-semibold leading-snug">{m.title}</p>
          <Advancement done={m.tasksDone} total={m.tasksTotal} anomaly={m.tasksAnomaly} className="w-full" />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Agent</dt>
              <dd className="mt-0.5 truncate">
                {m.agentId ? (
                  <>
                    {m.agentName} <span className="font-mono text-[10px] text-muted-foreground">{m.agentCode}</span>
                  </>
                ) : (
                  <span className="italic text-muted-foreground">Non assignée</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Zone</dt>
              <dd className="mt-0.5">{m.zone}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Échéance</dt>
              <dd className="mt-0.5"><DueCell mission={m} /></dd>
            </div>
          </dl>
          {/* T53-T6b : cible tactile h-11 (convention 44 px, pattern T4b/T5b). */}
          <Button variant="outline" size="sm" className="h-11 w-full gap-1.5" onClick={() => setDetailId(m.id)}>
            <Eye className="h-3.5 w-3.5" aria-hidden /> Voir le détail
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Bandeau KPI */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Missions ouvertes" value={openCount} icon={Radar} tone="warning"
          sub="planifiées ou en cours sur le terrain"
        />
        <KpiCard
          label="Missions terminées" value={doneCount} icon={CheckCircle2} tone="success"
          sub="contrôles et veilles bouclés"
        />
        <KpiCard
          label="Agents actifs" value={activeAgents} icon={UserRound} tone="info"
          sub={`${agents.length} agent${agents.length > 1 ? "s" : ""} de zone au total`}
        />
        <KpiCard
          label="Rapports (7 jours)" value={reports7d ?? "…"} icon={ClipboardCheck}
          sub="remontés depuis l'application mobile agent"
        />
      </div>

      {/* Liste des missions */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Radar className="h-4 w-4 text-emerald-600" aria-hidden /> Missions terrain
              </CardTitle>
              <CardDescription>
                {filtered.length} mission{filtered.length > 1 ? "s" : ""} sur {missions.length} · {targetsTotal} cible{targetsTotal > 1 ? "s" : ""} · 3 modes d&apos;affichage
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* T53-T6b : export CSV de la liste filtrée (pattern T52-R2b —
                  données réelles déjà chargées, aucune requête serveur). */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportMissionsCsv(filtered, brandOf)}
                disabled={filtered.length === 0}
                className="h-8 gap-1.5"
                aria-label="Exporter la liste filtrée des missions en CSV"
              >
                <Download className="h-3.5 w-3.5" aria-hidden /> Exporter CSV
              </Button>
              <Button size="sm" className="h-8 shrink-0 gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Nouvelle mission
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select value={fType} onValueChange={setFType}>
              <SelectTrigger size="sm" className="w-[200px]" aria-label="Filtrer par type de mission">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                {MISSION_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{TYPE_META[t].label} — {t === "CONTROLE" ? "mes stations" : "concurrente"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger size="sm" className="w-[160px]" aria-label="Filtrer par statut de mission">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {MISSION_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fBrand} onValueChange={setFBrand}>
              <SelectTrigger size="sm" className="w-[190px]" aria-label="Filtrer par enseigne commanditaire">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les enseignes</SelectItem>
                {(brands ?? []).map(b => (
                  <SelectItem key={b.slug} value={b.slug}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
                      {b.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fZone} onValueChange={setFZone}>
              <SelectTrigger size="sm" className="w-[170px]" aria-label="Filtrer par zone (gouvernorat)">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les zones</SelectItem>
                {zones.map(z => (
                  <SelectItem key={z} value={z}>{z}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey="bo-missions"
            columns={columns}
            rows={filtered}
            rowKey={(m) => m.id}
            emptyMessage="Aucune mission ne correspond à ces filtres — créez la première avec « + Nouvelle mission »."
            maxHeightClassName="max-h-[26rem]"
            onRowClick={(m) => setDetailId(m.id)}
            renderCard={renderMissionCard}
            nested={{
              groupKey: (m) => m.status,
              groupLabel: (gk, grows) => {
                const Meta = STATUS_META[gk as MissionStatus] ?? STATUS_META.PLANIFIEE
                const done = grows.reduce((a, m) => a + m.tasksDone, 0)
                const tot = grows.reduce((a, m) => a + m.tasksTotal, 0)
                const anom = grows.reduce((a, m) => a + m.tasksAnomaly, 0)
                return (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", Meta.dot)} aria-hidden />
                    {Meta.label}
                    <span className="ml-1 text-[11px] font-normal text-primary/70">
                      — {grows.length} mission{grows.length > 1 ? "s" : ""} · {done}/{tot} cibles réalisées{anom > 0 ? ` · ${anom} anomalie${anom > 1 ? "s" : ""}` : ""}
                    </span>
                  </span>
                )
              },
              groupSortValue: (gk) => STATUS_META[gk as MissionStatus]?.rank ?? 9,
              hideColumnKeyInGroups: "status",
              defaultOpen: "all",
            }}
          />
        </CardContent>
      </Card>

      {/* Gestion des agents de zone (section repliable — pas d'onglet dédié) */}
      <FieldAgentsSection agents={agents} brands={brands} onChanged={refresh} />

      {/* Dialogue : détail & pilotage d'une mission */}
      {detailId && (
        <MissionDetailDialog
          key={detailId}
          missionId={detailId}
          agents={agents}
          brands={brands}
          onClose={() => setDetailId(null)}
          onChanged={refresh}
        />
      )}

      {/* Dialogue : création de mission */}
      {createOpen && (
        <CreateMissionDialog
          agents={agents}
          brands={brands}
          onClose={() => setCreateOpen(false)}
          onCreated={refresh}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialogue : détail & pilotage d'une mission
// ---------------------------------------------------------------------------

function MissionDetailDialog({
  missionId, agents, brands, onClose, onChanged,
}: {
  missionId: string
  agents: FieldAgentDTO[]
  brands: BrandDTO[] | null
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<MissionDetailDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [agentSel, setAgentSel] = useState<string>("none")
  const [reassigning, setReassigning] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)

  useEffect(() => {
    const ac = new AbortController()
    setDetail(null)
    setError(null)
    fetch(`/api/missions/${missionId}`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { mission: MissionDetailDTO }) => { setDetail(j.mission); setError(null) })
      .catch(e => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setError("Impossible de charger le détail de la mission.")
      })
    return () => ac.abort()
  }, [missionId, reloadKey])

  // Le sélecteur suit l'agent réellement en charge
  useEffect(() => {
    if (detail) setAgentSel(detail.agentId ?? "none")
  }, [detail])

  // La mission n'est plus annulable (déjà ANNULÉE) : referme la confirmation
  useEffect(() => {
    if (detail && detail.status === "ANNULEE") setConfirmCancelOpen(false)
  }, [detail])

  const brandOf = useCallback<BrandLookup>((slug) => {
    const b = brands?.find(x => x.slug === slug)
    return { name: b?.name ?? slug ?? "—", color: b?.color ?? NEUTRAL_DOT }
  }, [brands])

  // --- Changement du statut d'une cible ---
  const setTaskStatus = useCallback(async (task: MissionTaskDTO, status: MissionTaskStatus) => {
    if (busyTaskId) return
    setBusyTaskId(task.id)
    try {
      const r = await fetch(`/api/missions/${missionId}?taskId=${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskStatus: status }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`)
      toast.success("Cible mise à jour", {
        description: `${task.targetLabel} → ${TASK_STATUS_META[status].label}.`,
      })
      setReloadKey(k => k + 1)
      onChanged()
    } catch (e) {
      toast.error("Mise à jour refusée", {
        description: e instanceof Error ? e.message : "Erreur inattendue.",
      })
    } finally {
      setBusyTaskId(null)
    }
  }, [busyTaskId, missionId, onChanged])

  // --- Réassignation de l'agent ---
  const activeAgents = useMemo(() => agents.filter(a => a.active), [agents])
  const zoneAgents = useMemo(
    () => (detail ? activeAgents.filter(a => a.zone === detail.zone) : []),
    [activeAgents, detail]
  )
  const otherAgents = useMemo(
    () => (detail ? activeAgents.filter(a => a.zone !== detail.zone) : []),
    [activeAgents, detail]
  )
  // Agent courant inactif (cas résiduel) : affiché mais non re-sélectionnable
  const inactiveCurrent = useMemo(() => {
    if (!detail?.agentId) return null
    const a = agents.find(x => x.id === detail.agentId)
    return a && !a.active ? a : null
  }, [agents, detail])

  const reassignChanged = detail ? agentSel !== (detail.agentId ?? "none") : false

  const reassign = useCallback(async () => {
    if (!detail || !reassignChanged || reassigning) return
    setReassigning(true)
    const target = agentSel === "none" ? null : agentSel
    try {
      const r = await fetch(`/api/missions/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: target }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`)
      if (target === null) {
        toast.success("Mission détachée", {
          description: `${detail.title} repasse PLANIFIÉE sans agent — réassignez-la depuis ce dialogue.`,
        })
      } else {
        const a = agents.find(x => x.id === target)
        toast.success("Agent réassigné", {
          description: a ? `${a.name} (${a.code}) prend en charge « ${detail.title} ».` : "Mission réassignée.",
        })
      }
      setReloadKey(k => k + 1)
      onChanged()
    } catch (e) {
      toast.error("Réassignation refusée", {
        description: e instanceof Error ? e.message : "Erreur inattendue.",
      })
    } finally {
      setReassigning(false)
    }
  }, [detail, reassignChanged, reassigning, agentSel, agents, onChanged])

  // --- Annulation de la mission (DELETE : supprime si 0 rapport, sinon ANNULEE) ---
  const canCancel = detail ? detail.status !== "ANNULEE" : false
  const hasReports = detail ? detail.tasks.some(t => t.lastReport !== null) : false

  const cancel = useCallback(async () => {
    if (!detail || cancelling) return
    setCancelling(true)
    try {
      // NB : PATCH { status } est écrasé par le recalcul serveur — l'annulation
      // passe par DELETE, qui supprime la mission sans rapport (ou l'annule en
      // conservant l'historique terrain si des rapports existent).
      const r = await fetch(`/api/missions/${detail.id}`, { method: "DELETE" })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`)
      if ((j as { deleted?: boolean }).deleted) {
        toast.success("Mission supprimée", {
          description: `« ${detail.title} » — aucun rapport n'avait été remonté, elle est définitivement retirée de la liste.`,
        })
        setConfirmCancelOpen(false)
        onChanged()
        onClose()
      } else {
        toast.success("Mission annulée", {
          description: "Les cibles restantes sont figées ; les rapports déjà remontés restent consultables (historique terrain).",
        })
        setConfirmCancelOpen(false)
        setReloadKey(k => k + 1)
        onChanged()
      }
    } catch (e) {
      toast.error("Annulation refusée", {
        description: e instanceof Error ? e.message : "Erreur inattendue.",
      })
    } finally {
      setCancelling(false)
    }
  }, [detail, cancelling, onChanged, onClose])

  const b = detail ? brandOf(detail.brandSlug) : null

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base leading-snug">
            {detail ? detail.title : "Détail de la mission"}
          </DialogTitle>
          <DialogDescription>
            {detail
              ? `Fiche de pilotage — zone ${detail.zone} · ${detail.tasks.length} cible${detail.tasks.length > 1 ? "s" : ""}`
              : "Chargement de la mission…"}
          </DialogDescription>
        </DialogHeader>

        {error && !detail && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Erreur de chargement</p>
            <p className="mt-0.5 text-xs text-red-600/90 dark:text-red-400/80">{error}</p>
            <Button size="sm" variant="outline" className="mt-2 h-7" onClick={() => setReloadKey(k => k + 1)}>
              Réessayer
            </Button>
          </div>
        )}

        {!detail && !error && (
          <div className="space-y-3" aria-busy="true" aria-label="Chargement du détail de la mission">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-16 w-full" />
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        )}

        {detail && b && (
          <div className="space-y-4">
            {/* Badges d'identité */}
            <div className="flex flex-wrap items-center gap-1.5">
              <TypeBadge type={detail.type} />
              <MissionStatusBadge status={detail.status} />
              <Badge variant="secondary" className="gap-1.5 text-[11px] font-normal">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
                Commanditaire : {b.name}
              </Badge>
            </div>

            {/* Méta */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg border bg-muted/30 p-3 text-xs sm:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Agent en charge</dt>
                <dd className="mt-0.5 font-medium">
                  {detail.agentId ? (
                    <>
                      {detail.agentName} <span className="font-mono text-[10px] text-muted-foreground">{detail.agentCode}</span>
                    </>
                  ) : (
                    <span className="italic text-muted-foreground">Non assignée</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Zone</dt>
                <dd className="mt-0.5 font-medium">{detail.zone}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Échéance</dt>
                <dd className="mt-0.5"><DueCell mission={detail} /></dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Créée le</dt>
                <dd className="mt-0.5 tabular-nums text-muted-foreground">{fmtDateTime(detail.createdAt)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Avancement</dt>
                <dd className="mt-1">
                  <Advancement done={detail.tasksDone} total={detail.tasksTotal} anomaly={detail.tasksAnomaly} className="w-36" />
                </dd>
              </div>
            </dl>

            {/* Instructions */}
            <div className="rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <FileText className="h-3.5 w-3.5" aria-hidden /> Instructions aux agents
              </p>
              <p className="mt-1.5 text-xs leading-relaxed">
                {detail.instructions || <span className="italic text-muted-foreground">Aucune instruction particulière.</span>}
              </p>
            </div>

            {/* Pilotage : réassignation + annulation */}
            <div className="space-y-3 rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <UserCog className="h-4 w-4 text-purple-600" aria-hidden /> Pilotage
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1 space-y-1.5">
                  <Label htmlFor="detail-agent">Agent en charge</Label>
                  <Select value={agentSel} onValueChange={setAgentSel}>
                    <SelectTrigger id="detail-agent" aria-label="Réassigner l'agent de la mission">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="none">Aucun agent — mission planifiée</SelectItem>
                      {inactiveCurrent && (
                        <SelectItem value={inactiveCurrent.id} disabled>
                          {inactiveCurrent.name} · {inactiveCurrent.code} (inactif)
                        </SelectItem>
                      )}
                      {zoneAgents.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Zone {detail.zone}</SelectLabel>
                          {zoneAgents.map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name} · {a.code}</SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {otherAgents.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Autres zones</SelectLabel>
                          {otherAgents.map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name} · {a.code} — {a.zone}</SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Agents actifs uniquement — la désactivation d&apos;un agent détache ses missions.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => void reassign()}
                  disabled={!reassignChanged || reassigning}
                  className="gap-1.5"
                >
                  {reassigning
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    : <UserRound className="h-3.5 w-3.5" aria-hidden />}
                  Réassigner
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <p className="max-w-sm text-[11px] leading-snug text-muted-foreground">
                  {hasReports
                    ? "Des rapports ont été remontés : l'annulation conserve l'historique terrain et fige la mission."
                    : "Aucun rapport remonté : l'annulation supprime définitivement la mission et ses cibles."}
                </p>
                <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm" variant="outline"
                      disabled={!canCancel || cancelling}
                      className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500/40 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                      aria-label={`Annuler la mission ${detail.title}`}
                    >
                      {cancelling
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        : <Ban className="h-3.5 w-3.5" aria-hidden />}
                      Annuler la mission
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Annuler cette mission ?</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-2">
                          <p>
                            « {detail.title} » — {detail.tasksTotal} cibles, {detail.tasksDone} réalisée
                            {detail.tasksDone > 1 ? "s" : ""}
                            {detail.tasksAnomaly > 0 ? `, ${detail.tasksAnomaly} anomalie${detail.tasksAnomaly > 1 ? "s" : ""}` : ""}.
                          </p>
                          <p className="font-medium text-amber-600 dark:text-amber-400">
                            {hasReports ? (
                              <>
                                Des rapports de visite existent : la mission passera au statut ANNULÉE —
                                l&apos;agent ne pourra plus y saisir, mais l&apos;historique remonté est conservé.
                              </>
                            ) : (
                              <>
                                Aucun rapport n&apos;a été remonté : la mission et ses cibles seront
                                définitivement supprimées (action irréversible).
                              </>
                            )}
                          </p>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Conserver la mission</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={e => { e.preventDefault(); void cancel() }}
                        className="gap-1.5 bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500/40"
                      >
                        <Ban className="h-4 w-4" aria-hidden /> Oui, annuler la mission
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Cibles & derniers rapports */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <MapPin className="h-4 w-4 text-emerald-600" aria-hidden />
                  Cibles ({detail.tasks.length})
                </p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {detail.tasksDone}/{detail.tasksTotal} réalisées
                  {detail.tasksAnomaly > 0 ? ` · ${detail.tasksAnomaly} anomalie${detail.tasksAnomaly > 1 ? "s" : ""}` : ""}
                </span>
              </div>
              <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {detail.tasks.map(t => (
                  <TaskItem key={t.id} task={t} busy={busyTaskId === t.id} onStatus={setTaskStatus} />
                ))}
              </ul>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ----- Cible + dernier rapport condensé -----

function TaskItem({
  task, busy, onStatus,
}: {
  task: MissionTaskDTO
  busy: boolean
  onStatus: (t: MissionTaskDTO, s: MissionTaskStatus) => void
}) {
  const r = task.lastReport
  const prices: string[] = []
  if (r?.gazolePrice != null) prices.push(`Gazole ${fmtDt(r.gazolePrice)}`)
  if (r?.essencePrice != null) prices.push(`Essence ${fmtDt(r.essencePrice)}`)
  if (r?.gplPrice != null) prices.push(`GPL ${fmtDt(r.gplPrice)}`)

  return (
    <li className={cn(
      "rounded-lg border",
      task.status === "ANOMALIE" && "border-red-200 dark:border-red-900",
      task.status === "FAITE" && "border-emerald-200 dark:border-emerald-900",
    )}>
      <div className="flex flex-wrap items-center gap-2 p-2.5">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground"
          aria-hidden
        >
          {task.order + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold" title={task.targetLabel}>{task.targetLabel}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {task.stationCode ? <code className="font-mono">{task.stationCode}</code> : "cible libre"}
            {task.competitorSlug ? " · veille concurrente" : ""}
            {task.lat != null && task.lng != null ? ` · GPS ${task.lat.toFixed(3).replace(".", ",")}, ${task.lng.toFixed(3).replace(".", ",")}` : ""}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline" size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              disabled={busy}
              aria-label={`Changer le statut de la cible ${task.targetLabel} (actuel : ${TASK_STATUS_META[task.status].label})`}
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
              <TaskStatusBadge status={task.status} />
              <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Statut de la cible</DropdownMenuLabel>
            {TASK_STATUSES.map(s => {
              const Meta = TASK_STATUS_META[s]
              const Icon = Meta.icon
              return (
                <DropdownMenuItem
                  key={s}
                  onClick={() => onStatus(task, s)}
                  disabled={task.status === s}
                >
                  <Icon className={cn("h-3.5 w-3.5", Meta.iconColor)} aria-hidden />
                  {Meta.label}
                  {task.status === s && <Check className="ml-auto h-3 w-3" aria-hidden />}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {r ? (
        <div className="space-y-1.5 border-t bg-muted/20 px-2.5 py-2 text-[11px]">
          <p className="flex items-center gap-1 font-medium text-muted-foreground">
            <ClipboardCheck className="h-3 w-3 shrink-0" aria-hidden />
            Dernier rapport — {fmtDateTime(r.createdAt)}{r.agentName ? ` · ${r.agentName}` : ""}
          </p>
          {prices.length > 0 && (
            <p className="tabular-nums">{prices.join(" · ")}</p>
          )}
          {(r.queueMinutes != null || r.staffCount != null || r.cleanliness != null || r.complianceScore != null) && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
              {r.queueMinutes != null && (
                <span className="text-muted-foreground">File&nbsp;: <b className="text-foreground tabular-nums">{r.queueMinutes}&nbsp;min</b></span>
              )}
              {r.staffCount != null && (
                <span className="text-muted-foreground">Personnel&nbsp;: <b className="text-foreground tabular-nums">{r.staffCount}</b></span>
              )}
              {r.cleanliness != null && (
                <span className="text-muted-foreground">Propreté&nbsp;: <b className="text-foreground tabular-nums">{r.cleanliness}/5</b></span>
              )}
              {r.complianceScore != null && (
                <span className="text-muted-foreground">Conformité&nbsp;: <b className="text-foreground tabular-nums">{r.complianceScore}&nbsp;%</b></span>
              )}
            </div>
          )}
          {r.anomalies && (
            <p className="flex items-start gap-1 font-medium text-red-600 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              Anomalies : {r.anomalies}
            </p>
          )}
          {r.competitorPractices && (
            <p className="flex items-start gap-1 text-purple-700 dark:text-purple-400">
              <Swords className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              Pratiques concurrentes : {r.competitorPractices}
            </p>
          )}
          {r.notes && (
            <p className="italic text-muted-foreground">« {r.notes} »</p>
          )}
        </div>
      ) : (
        <p className="border-t px-2.5 py-1.5 text-[11px] italic text-muted-foreground/80">
          Aucun rapport de visite remonté pour cette cible.
        </p>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Dialogue : création de mission (formulaire riche + sélecteur de cibles)
// ---------------------------------------------------------------------------

type TargetDraft = {
  stationCode: string
  stationName: string
  competitorSlug: string | null
  targetLabel: string
  lat: number | null
  lng: number | null
}

function CreateMissionDialog({
  agents, brands, onClose, onCreated,
}: {
  agents: FieldAgentDTO[]
  brands: BrandDTO[] | null
  onClose: () => void
  onCreated: () => void
}) {
  const [type, setType] = useState<MissionType>("CONTROLE")
  const [title, setTitle] = useState("")
  const [brandSlug, setBrandSlug] = useState("")
  const [competitorSlug, setCompetitorSlug] = useState("")
  const [zone, setZone] = useState("")
  const [agentId, setAgentId] = useState("none")
  const [dueDate, setDueDate] = useState("")
  const [instructions, setInstructions] = useState("")
  const [targets, setTargets] = useState<TargetDraft[]>([])
  const [search, setSearch] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Parc stations : chargé paresseusement à la première ouverture du dialogue
  const [stations, setStations] = useState<StationDTO[] | null>(null)
  const [stationsFailed, setStationsFailed] = useState(false)

  useEffect(() => {
    if (stations || stationsFailed) return
    const ac = new AbortController()
    fetch("/api/stations?limit=2200", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { stations: StationDTO[] }) => setStations(j.stations))
      .catch(e => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setStationsFailed(true)
      })
    return () => ac.abort()
  }, [stations, stationsFailed])

  const brandOf = useCallback<BrandLookup>((slug) => {
    const b = brands?.find(x => x.slug === slug)
    return { name: b?.name ?? slug ?? "—", color: b?.color ?? NEUTRAL_DOT }
  }, [brands])

  // Le périmètre change → les cibles déjà choisies ne sont plus cohérentes
  useEffect(() => { setTargets([]) }, [type, brandSlug, competitorSlug, zone])
  // Le concurrent ne peut pas être la commanditaire
  useEffect(() => {
    if (competitorSlug && competitorSlug === brandSlug) setCompetitorSlug("")
  }, [competitorSlug, brandSlug])

  const watchBrand = type === "CONTROLE" ? brandSlug : competitorSlug
  const suggestions = useMemo(() => {
    if (!stations || !watchBrand || !zone) return []
    const q = search.trim().toLowerCase()
    return stations
      .filter(s =>
        s.brandSlug === watchBrand &&
        s.gouvernorat === zone &&
        s.status !== "CLOSED" &&
        s.status !== "PROJECT"
      )
      .filter(s => !q || `${s.name} ${s.code} ${s.delegation}`.toLowerCase().includes(q))
      .slice(0, 8)
  }, [stations, watchBrand, zone, search])

  const addTarget = (s: StationDTO) => {
    if (targets.some(t => t.stationCode === s.code)) {
      toast.info("Station déjà ciblée", { description: `${s.name} (${s.code}) fait déjà partie de la mission.` })
      return
    }
    if (targets.length >= MAX_TARGETS) {
      toast.error("Maximum de cibles atteint", {
        description: `Une mission ne peut pas dépasser ${MAX_TARGETS} cibles.`,
      })
      return
    }
    setTargets(prev => [...prev, {
      stationCode: s.code,
      stationName: s.name,
      competitorSlug: type === "VEILLE_CONCURRENT" ? competitorSlug : null,
      targetLabel: `${s.name} (${s.code})`,
      lat: s.lat,
      lng: s.lng,
    }])
  }

  const removeTarget = (code: string) => setTargets(prev => prev.filter(t => t.stationCode !== code))

  // Agents actifs — ceux de la zone en tête
  const activeAgents = useMemo(() => agents.filter(a => a.active), [agents])
  const zoneAgents = useMemo(
    () => (zone ? activeAgents.filter(a => a.zone === zone) : []),
    [activeAgents, zone]
  )
  const otherAgents = useMemo(
    () => (zone ? activeAgents.filter(a => a.zone !== zone) : activeAgents),
    [activeAgents, zone]
  )
  const selectedAgent = agentId === "none" ? null : agents.find(a => a.id === agentId) ?? null

  const brandName = brandOf(brandSlug).name
  const competitorName = brandOf(competitorSlug).name
  const suggestedTitle = type === "CONTROLE"
    ? (brandSlug && zone ? `Contrôle ${brandName} — ${zone}` : "")
    : (competitorSlug && zone ? `Veille ${competitorName} — ${zone}` : "")
  const finalTitle = title.trim() || suggestedTitle

  const veilleOk = type === "CONTROLE" || (!!competitorSlug && competitorSlug !== brandSlug)
  const dueOk = !dueDate || /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
  const canSubmit = !!finalTitle && !!brandSlug && !!zone && veilleOk && targets.length > 0 && dueOk && !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const r = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: finalTitle,
          type,
          brandSlug,
          ...(agentId === "none" ? {} : { agentId }),
          zone,
          ...(dueDate ? { dueDate } : {}),
          instructions: instructions.trim() || undefined,
          tasks: targets.map(t => ({
            stationCode: t.stationCode,
            stationName: t.stationName,
            ...(t.competitorSlug ? { competitorSlug: t.competitorSlug } : {}),
            targetLabel: t.targetLabel,
            ...(t.lat != null ? { lat: t.lat } : {}),
            ...(t.lng != null ? { lng: t.lng } : {}),
          })),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`)
      toast.success("Mission créée", {
        description: `${(j as { mission?: { title?: string } }).mission?.title ?? finalTitle} — ${targets.length} cible${targets.length > 1 ? "s" : ""}${selectedAgent ? ` · assignée à ${selectedAgent.name} (${selectedAgent.code})` : " · sans agent (PLANIFIÉE)"}.`,
        duration: 6000,
      })
      onCreated()
      onClose()
    } catch (e) {
      toast.error("Création refusée", {
        description: e instanceof Error ? e.message : "Erreur inattendue.",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const watchBrandInfo = brandOf(watchBrand || null)

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-emerald-600" aria-hidden />
            Nouvelle mission terrain
          </DialogTitle>
          <DialogDescription>
            Contrôle des stations de l&apos;enseigne commanditaire ou veille sur un
            concurrent — {MAX_TARGETS} cibles maximum, rapport remonté par l&apos;app agent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* 1 — Type de mission */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Type de mission</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Type de mission">
              {MISSION_TYPES.map(t => {
                const Meta = TYPE_META[t]
                const Icon = Meta.icon
                const selected = type === t
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setType(t)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border hover:bg-muted/40",
                    )}
                  >
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", Meta.iconBg)}>
                      <Icon className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-tight">{Meta.cardTitle}</span>
                      <span className="mt-1 block text-xs leading-snug text-muted-foreground">{Meta.cardDesc}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* 2 — Paramètres */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Paramètres</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="mission-title">Titre de la mission</Label>
                <Input
                  id="mission-title"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={suggestedTitle ? `ex : ${suggestedTitle}` : "ex : Contrôle trimestriel — Grand Tunis"}
                />
                {suggestedTitle && (
                  <p className="text-[11px] text-muted-foreground">
                    Suggestion : « {suggestedTitle} » — laissée vide, elle sera utilisée.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Enseigne commanditaire</Label>
                <Select value={brandSlug} onValueChange={setBrandSlug}>
                  <SelectTrigger aria-label="Enseigne commanditaire de la mission">
                    <SelectValue placeholder="Sélectionner l'enseigne…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {(brands ?? []).map(b => (
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
              <div className="space-y-1.5">
                <Label>Zone (gouvernorat)</Label>
                <Select value={zone} onValueChange={setZone}>
                  <SelectTrigger aria-label="Zone de la mission (gouvernorat)">
                    <SelectValue placeholder="Sélectionner la zone…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {GOVERNORAT_NAMES.map(g => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {type === "VEILLE_CONCURRENT" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Enseigne concurrente observée</Label>
                  <Select value={competitorSlug} onValueChange={setCompetitorSlug}>
                    <SelectTrigger aria-label="Enseigne concurrente observée">
                      <SelectValue placeholder="Sélectionner le concurrent à observer…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(brands ?? []).filter(b => b.slug !== brandSlug).map(b => (
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
                  <p className="text-[11px] text-muted-foreground">
                    Les cibles seront filtrées sur les stations de ce concurrent dans la zone choisie.
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Agent de zone</Label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger aria-label="Agent en charge de la mission">
                    <SelectValue placeholder="Choisir un agent actif…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="none">Sans agent — mission planifiée</SelectItem>
                    {zoneAgents.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Agents de la zone{zone ? ` ${zone}` : ""}</SelectLabel>
                        {zoneAgents.map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.name} · {a.code}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {otherAgents.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>{zone ? "Autres zones" : "Agents actifs"}</SelectLabel>
                        {otherAgents.map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.name} · {a.code} — {a.zone}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Sans agent, la mission est créée PLANIFIÉE ; assignée, elle démarre EN_COURS.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mission-due">Échéance</Label>
                <Input
                  id="mission-due"
                  type="date"
                  value={dueDate}
                  min={todayIso()}
                  onChange={e => setDueDate(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Date limite de remontée des rapports.</p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="mission-instructions">Instructions aux agents</Label>
                <Textarea
                  id="mission-instructions"
                  rows={3}
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  placeholder="Ex : relever les prix affichés face au décret en vigueur, photographier toute non-conformité, noter l'affluence aux heures de pointe…"
                />
              </div>
            </div>
          </div>

          {/* 3 — Sélecteur de cibles */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <MapPin className="h-4 w-4 text-emerald-600" aria-hidden />
                Cibles de la mission
              </p>
              <Badge variant="secondary" className={cn("tabular-nums", targets.length >= MAX_TARGETS && "text-red-600 dark:text-red-400")}>
                {targets.length}/{MAX_TARGETS}
              </Badge>
            </div>
            <div className="space-y-2.5 rounded-lg border bg-muted/20 p-3">
              {!watchBrand || !zone ? (
                <p className="text-xs text-muted-foreground">
                  Renseignez {type === "VEILLE_CONCURRENT" ? "l'enseigne concurrente observée" : "l'enseigne commanditaire"} et la
                  zone pour rechercher des stations à cibler.
                </p>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={`Rechercher une station ${watchBrandInfo.name} en ${zone} (nom, code, délégation)…`}
                      className="pl-8 text-xs"
                      aria-label="Rechercher une station à cibler"
                    />
                  </div>
                  {stations === null && !stationsFailed && (
                    <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      Chargement du parc des stations…
                    </div>
                  )}
                  {stationsFailed && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-red-300 p-3 text-xs text-red-600 dark:border-red-900 dark:text-red-400">
                      <span>Parc stations indisponible — impossible de choisir les cibles.</span>
                      <Button
                        variant="outline" size="sm" className="h-6"
                        onClick={() => setStationsFailed(false)}
                      >
                        Réessayer
                      </Button>
                    </div>
                  )}
                  {stations !== null && suggestions.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {search.trim()
                        ? `Aucune station ${watchBrandInfo.name} ne correspond à « ${search.trim()} » en ${zone}.`
                        : `Aucune station ${watchBrandInfo.name} en ${zone} — vérifiez la zone ou changez d'enseigne.`}
                    </p>
                  )}
                  {suggestions.length > 0 && (
                    <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border" aria-label="Stations suggérées">
                      {suggestions.map(s => (
                        <li key={s.code}>
                          <button
                            type="button"
                            onClick={() => addTarget(s)}
                            className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors hover:bg-emerald-50 focus-visible:bg-emerald-50 focus-visible:outline-none dark:hover:bg-emerald-950/40 dark:focus-visible:bg-emerald-950/40"
                            aria-label={`Ajouter la station ${s.name} (${s.code}) aux cibles`}
                          >
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{s.name}</span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {s.delegation} · {s.gouvernorat}
                              </span>
                            </span>
                            <code className="shrink-0 font-mono text-[10px] text-muted-foreground">{s.code}</code>
                            <Plus className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {targets.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Cibles sélectionnées
                    </p>
                    <button
                      type="button"
                      onClick={() => setTargets([])}
                      className="rounded text-[11px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-red-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 dark:hover:text-red-400"
                    >
                      Tout retirer
                    </button>
                  </div>
                  <ul className="flex flex-wrap gap-1.5" aria-label="Cibles sélectionnées">
                    {targets.map(t => (
                      <li
                        key={t.stationCode}
                        className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background py-0.5 pl-2.5 pr-1 text-xs"
                      >
                        <span className="max-w-[200px] truncate" title={t.targetLabel}>{t.targetLabel}</span>
                        <button
                          type="button"
                          onClick={() => removeTarget(t.stationCode)}
                          aria-label={`Retirer ${t.targetLabel} des cibles`}
                          className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 dark:hover:bg-red-950 dark:hover:text-red-400"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* 4 — Récapitulatif */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-amber-500" aria-hidden /> Récapitulatif
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</dt>
                <dd className="mt-0.5 font-medium">{TYPE_META[type].label}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Commanditaire</dt>
                <dd className="mt-0.5">
                  {brandSlug ? (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brandOf(brandSlug).color }} aria-hidden />
                      {brandName}
                    </span>
                  ) : <span className="italic text-muted-foreground">à définir</span>}
                </dd>
              </div>
              {type === "VEILLE_CONCURRENT" && (
                <div className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Concurrent</dt>
                  <dd className="mt-0.5">
                    {competitorSlug ? (
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brandOf(competitorSlug).color }} aria-hidden />
                        {competitorName}
                      </span>
                    ) : <span className="italic text-muted-foreground">à définir</span>}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Zone</dt>
                <dd className="mt-0.5 font-medium">{zone || <span className="italic text-muted-foreground">à définir</span>}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Agent</dt>
                <dd className="mt-0.5">
                  {selectedAgent ? (
                    <span className="font-medium">{selectedAgent.name} <span className="font-mono text-[10px] text-muted-foreground">{selectedAgent.code}</span></span>
                  ) : <span className="italic text-muted-foreground">non assignée</span>}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Échéance</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {dueDate ? fmtDate(dueDate) : <span className="italic text-muted-foreground">—</span>}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Cibles</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{targets.length}/{MAX_TARGETS}</dd>
              </div>
            </dl>
            {targets.length > 0 && (
              <p className="mt-2 truncate text-[11px] text-muted-foreground" title={targets.map(t => t.targetLabel).join(" · ")}>
                {targets.slice(0, 4).map(t => t.targetLabel).join(" · ")}
                {targets.length > 4 ? ` · +${targets.length - 4} autres` : ""}
              </p>
            )}
            {instructions.trim() && (
              <p className="mt-2 line-clamp-2 text-[11px] italic text-muted-foreground">« {instructions.trim()} »</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={() => void submit()} disabled={!canSubmit} className="gap-1.5">
            {submitting
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              : <ClipboardCheck className="h-4 w-4" aria-hidden />}
            Créer la mission
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Section repliable : gestion des agents de zone
// ---------------------------------------------------------------------------

function FieldAgentsSection({
  agents, brands, onChanged,
}: {
  agents: FieldAgentDTO[]
  brands: BrandDTO[] | null
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const brandOf = useCallback<BrandLookup>((slug) => {
    const b = brands?.find(x => x.slug === slug)
    return { name: b?.name ?? slug ?? "—", color: b?.color ?? NEUTRAL_DOT }
  }, [brands])

  const activeCount = agents.filter(a => a.active).length

  const toggleAgent = useCallback(async (a: FieldAgentDTO, next: boolean) => {
    if (busyId) return
    setBusyId(a.id)
    try {
      const r = await fetch(`/api/field-agents?id=${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`)
      toast.success(next ? "Agent activé" : "Agent désactivé", {
        description: !next && a.missionsOpen > 0
          ? `${a.missionsOpen} mission${a.missionsOpen > 1 ? "s" : ""} ouverte${a.missionsOpen > 1 ? "s" : ""} détachée${a.missionsOpen > 1 ? "s" : ""} — elle${a.missionsOpen > 1 ? "s" : ""} repasse${a.missionsOpen > 1 ? "nt" : ""} PLANIFIÉE sans agent, à réassigner.`
          : `${a.name} (${a.code}) — zone ${a.zone}.`,
        duration: 6000,
      })
      onChanged()
    } catch (e) {
      toast.error("Mise à jour refusée", {
        description: e instanceof Error ? e.message : "Erreur inattendue.",
      })
    } finally {
      setBusyId(null)
    }
  }, [busyId, onChanged])

  const agentColumns: DataViewColumn<FieldAgentDTO>[] = [
    {
      key: "agent", header: "Agent",
      sortValue: (a) => a.name,
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{a.name}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" aria-hidden />
            {a.phone || "—"}
          </p>
        </div>
      ),
    },
    {
      key: "code", header: "Code", className: "whitespace-nowrap",
      sortValue: (a) => a.code,
      render: (a) => <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]">{a.code}</code>,
    },
    {
      key: "zone", header: "Zone",
      sortValue: (a) => a.zone,
      render: (a) => (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden />
          {a.zone}
        </span>
      ),
    },
    {
      key: "brand", header: "Enseigne",
      sortValue: (a) => brandOf(a.brandSlug).name,
      render: (a) => <BrandCell slug={a.brandSlug} brandOf={brandOf} />,
    },
    {
      key: "stats", header: "Activité", className: "whitespace-nowrap",
      sortValue: (a) => a.missionsTotal,
      render: (a) => (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
          <span><span className="font-semibold text-amber-600 dark:text-amber-400">{a.missionsOpen}</span> en cours</span>
          <span><span className="font-semibold text-emerald-600 dark:text-emerald-400">{a.missionsDone}</span> terminée{a.missionsDone > 1 ? "s" : ""}</span>
          <span><span className="font-semibold text-foreground">{a.reportsCount}</span> rapport{a.reportsCount > 1 ? "s" : ""}</span>
        </div>
      ),
    },
    {
      key: "state", header: "Statut", align: "center",
      render: (a) => (
        <div className="flex items-center justify-center gap-2">
          <Switch
            checked={a.active}
            disabled={busyId === a.id}
            onCheckedChange={v => void toggleAgent(a, v)}
            aria-label={`${a.active ? "Désactiver" : "Activer"} l'agent ${a.name} (${a.code})`}
          />
          {busyId === a.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <span className={cn(
              "text-[11px] font-medium",
              a.active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
            )}>
              {a.active ? "Actif" : "Inactif"}
            </span>
          )}
        </div>
      ),
    },
  ]

  const renderAgentCard = (a: FieldAgentDTO) => {
    const b = brandOf(a.brandSlug)
    return (
      <Card className="overflow-hidden transition-shadow hover:shadow-md">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{a.name}</p>
              <code className="mt-1 inline-block rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]">{a.code}</code>
            </div>
            <Badge
              variant="outline"
              className={cn("text-[11px]", a.active
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                : "border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500")}
            >
              {a.active ? "Actif" : "Inactif"}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 truncate">
              <Phone className="h-3 w-3 shrink-0" aria-hidden />{a.phone || "—"}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />{a.zone}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />{b.name}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-muted/40 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">En cours</p>
              <p className="text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">{a.missionsOpen}</p>
            </div>
            <div className="rounded-md bg-muted/40 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Terminées</p>
              <p className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{a.missionsDone}</p>
            </div>
            <div className="rounded-md bg-muted/40 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rapports</p>
              <p className="text-sm font-semibold tabular-nums">{a.reportsCount}</p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <label htmlFor={`agent-switch-${a.id}`} className="text-xs text-muted-foreground">
              Agent {a.active ? "actif" : "inactif"}
            </label>
            <div className="flex items-center gap-2">
              {busyId === a.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />}
              <Switch
                id={`agent-switch-${a.id}`}
                checked={a.active}
                disabled={busyId === a.id}
                onCheckedChange={v => void toggleAgent(a, v)}
                aria-label={`${a.active ? "Désactiver" : "Activer"} l'agent ${a.name}`}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                aria-expanded={open}
                aria-controls="bo-field-agents-content"
                className="flex min-w-0 items-start gap-3 rounded-lg p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400">
                  <UserCog className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <CardTitle className="flex items-center gap-1.5 text-base">
                    Agents de zone
                    <ChevronDown
                      className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
                      aria-hidden
                    />
                  </CardTitle>
                  <CardDescription>
                    {agents.length} agent{agents.length > 1 ? "s" : ""} · {activeCount} actif{activeCount > 1 ? "s" : ""} — un agent couvre un gouvernorat pour une enseigne.
                  </CardDescription>
                </span>
              </button>
            </CollapsibleTrigger>
            <Button
              size="sm" variant="outline"
              className="h-8 shrink-0 gap-1.5"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Ajouter un agent
            </Button>
          </div>
        </CardHeader>
        <CollapsibleContent id="bo-field-agents-content">
          <CardContent>
            <DataViews
              viewKey="bo-field-agents"
              columns={agentColumns}
              rows={agents}
              rowKey={(a) => a.id}
              emptyMessage="Aucun agent de zone — ajoutez le premier avec « + Ajouter un agent »."
              maxHeightClassName="max-h-96"
              renderCard={renderAgentCard}
              nested={{
                groupKey: (a) => a.brandSlug,
                groupLabel: (gk, grows) => {
                  const b = brandOf(gk)
                  const act = grows.filter(a => a.active).length
                  return (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
                      {b.name}
                      <span className="ml-1 text-[11px] font-normal text-primary/70">
                        — {grows.length} agent{grows.length > 1 ? "s" : ""} · {act} actif{act > 1 ? "s" : ""}
                      </span>
                    </span>
                  )
                },
                groupSortValue: (gk, grows) => grows.length,
                hideColumnKeyInGroups: "brand",
                defaultOpen: "first",
              }}
            />
            <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Désactiver un agent détache automatiquement ses missions ouvertes (repassées
              PLANIFIÉE sans agent) — réassignez-les depuis le détail de chaque mission.
            </p>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      {addOpen && (
        <AddAgentDialog
          brands={brands}
          onClose={() => setAddOpen(false)}
          onCreated={onChanged}
        />
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Dialogue : ajout d'un agent de zone
// ---------------------------------------------------------------------------

function AddAgentDialog({
  brands, onClose, onCreated,
}: {
  brands: BrandDTO[] | null
  onClose: () => void
  onCreated: () => void
}) {
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [brandSlug, setBrandSlug] = useState("")
  const [zone, setZone] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const codeOk = /^[A-Z0-9-]{3,12}$/.test(code.trim())
  const canSubmit = codeOk && name.trim().length > 1 && !!brandSlug && !!zone && !submitting

  const submit = async () => {
    setSubmitting(true)
    try {
      const r = await fetch("/api/field-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          brandSlug,
          zone,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`)
      const agent = (j as { agent?: { code: string; name: string } }).agent
      toast.success(`Agent ${agent?.code ?? code.trim()} créé`, {
        description: agent
          ? `Transmettez le code à ${agent.name} pour se connecter depuis l'application mobile agent.`
          : "Transmettez le code à l'agent pour se connecter depuis l'application mobile.",
        duration: 6000,
      })
      onCreated()
      onClose()
    } catch (e) {
      toast.error("Création refusée", {
        description: e instanceof Error ? e.message : "Erreur inattendue.",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-4.5 w-4.5 text-purple-600" aria-hidden />
            Ajouter un agent de zone
          </DialogTitle>
          <DialogDescription>
            Un agent couvre un gouvernorat pour une enseigne. Le code agent sert
            d&apos;identifiant de connexion sur l&apos;application mobile.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="agent-code">Code agent</Label>
            <Input
              id="agent-code"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="ex : AGIL-TUN-07"
              className="font-mono"
              autoComplete="off"
              aria-describedby="agent-code-hint"
            />
            <p id="agent-code-hint" className={cn(
              "text-[11px]",
              code.length > 0 && !codeOk ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
            )}>
              {code.length > 0 && !codeOk
                ? "3 à 12 caractères : majuscules, chiffres et tirets uniquement."
                : "3 à 12 caractères (A-Z, 0-9, tirets) — ex : TOT-TUN-07."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">Nom complet</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ex : Fatma Zahra Ghorbel"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-phone">Téléphone (optionnel)</Label>
            <Input
              id="agent-phone"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="ex : +216 98 123 456"
              inputMode="tel"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Enseigne</Label>
              <Select value={brandSlug} onValueChange={setBrandSlug}>
                <SelectTrigger aria-label="Enseigne de l'agent">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(brands ?? []).map(b => (
                    <SelectItem key={b.slug} value={b.slug}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
                        {b.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Zone (gouvernorat)</Label>
              <Select value={zone} onValueChange={setZone}>
                <SelectTrigger aria-label="Zone de l'agent (gouvernorat)">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {GOVERNORAT_NAMES.map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={() => void submit()} disabled={!canSubmit} className="gap-1.5">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            <UserRound className="h-4 w-4" aria-hidden />
            Créer l&apos;agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
