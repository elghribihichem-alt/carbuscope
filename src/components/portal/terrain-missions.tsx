'use client'

// CarbuScope — Onglet « Veille terrain » du portail enseigne, section A :
// « Mes missions » — missions commanditées par MON enseigne (contrôles des
// mes stations + veilles concurrentes), KPIs, liste multi-vues DataViews,
// fiche de pilotage (réassignation d'agent, annulation), demande de mission
// avec sélecteur de cibles sur le parc réel (max 30).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle, Ban, CheckCircle2, ClipboardCheck, ClipboardList, Eye, FileText,
  Footprints, Loader2, MapPin, Plus, Search, ShieldCheck, UserCog, UserRound, X,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { fmtDate, fmtDateTime, GOVERNORAT_NAMES } from "@/components/settings/settings-shared"
import type {
  BrandDTO, FieldAgentDTO, MissionDTO, MissionDetailDTO, MissionTaskDTO, MissionType,
  StationDTO, VisitReportDTO,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  BrandLookup, MAX_TARGETS, STATUS_META, TaskStatusBadge, TypeBadge, MissionStatusBadge,
  fmtDt, isMissionOverdue,
} from "./terrain-shared"

const todayIso = (): string => new Date().toISOString().slice(0, 10)

// ---------- Petits composants de rendu ----------

/** Barre d'avancement + compteur + anomalies signalées. */
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

/** Dernier rapport de visite condensé (prix, file, propreté, conformité…). */
function ReportSummary({ report }: { report: VisitReportDTO }) {
  const prices: string[] = []
  if (report.gazolePrice != null) prices.push(`Gazole ${fmtDt(report.gazolePrice)}`)
  if (report.essencePrice != null) prices.push(`Essence ${fmtDt(report.essencePrice)}`)
  if (report.gplPrice != null) prices.push(`GPL ${fmtDt(report.gplPrice)}`)
  return (
    <div className="space-y-1.5 border-t bg-muted/20 px-2.5 py-2 text-[11px]">
      <p className="flex items-center gap-1 font-medium text-muted-foreground">
        <ClipboardCheck className="h-3 w-3 shrink-0" aria-hidden />
        Dernier rapport — {fmtDateTime(report.createdAt)}{report.agentName ? ` · ${report.agentName}` : ""}
      </p>
      {prices.length > 0 && <p className="tabular-nums">{prices.join(" · ")}</p>}
      {(report.queueMinutes != null || report.staffCount != null || report.cleanliness != null || report.complianceScore != null) && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
          {report.queueMinutes != null && (
            <span className="text-muted-foreground">File&nbsp;: <b className="text-foreground tabular-nums">{report.queueMinutes}&nbsp;min</b></span>
          )}
          {report.staffCount != null && (
            <span className="text-muted-foreground">Personnel&nbsp;: <b className="text-foreground tabular-nums">{report.staffCount}</b></span>
          )}
          {report.cleanliness != null && (
            <span className="text-muted-foreground">Propreté&nbsp;: <b className="text-foreground tabular-nums">{report.cleanliness}/5</b></span>
          )}
          {report.complianceScore != null && (
            <span className="text-muted-foreground">Conformité&nbsp;: <b className="text-foreground tabular-nums">{report.complianceScore}&nbsp;%</b></span>
          )}
        </div>
      )}
      {report.anomalies && (
        <p className="flex items-start gap-1 font-medium text-red-600 dark:text-red-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          Anomalies : {report.anomalies}
        </p>
      )}
      {report.competitorPractices && (
        <p className="flex items-start gap-1 text-orange-700 dark:text-orange-400">
          <Eye className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          Pratiques concurrentes : {report.competitorPractices}
        </p>
      )}
      {report.notes && <p className="italic text-muted-foreground">« {report.notes} »</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section A — « Mes missions »
// ---------------------------------------------------------------------------

export function TerrainMissions({
  brandSlug, missions, agents, brands, brandOf, pendingMissionId, onPendingConsumed, onChanged,
}: {
  brandSlug: string
  missions: MissionDTO[]
  agents: FieldAgentDTO[]
  brands: BrandDTO[] | null
  brandOf: BrandLookup
  pendingMissionId: string | null
  onPendingConsumed: () => void
  onChanged: () => void
}) {
  const [detailId, setDetailId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [fType, setFType] = useState("all")

  // Deep-link depuis les alertes qualité de la fiche propriétaire (section B) :
  // ouverture différée (setTimeout 0 — même convention que la carte interactive,
  // évite tout setState synchrone dans l'effet) puis consommation du lien.
  useEffect(() => {
    if (!pendingMissionId) return
    const t = setTimeout(() => {
      setDetailId(pendingMissionId)
      onPendingConsumed()
    }, 0)
    return () => clearTimeout(t)
  }, [pendingMissionId, onPendingConsumed])

  const myBrand = brandOf(brandSlug)
  const myActiveAgents = useMemo(() => agents.filter(a => a.active), [agents])

  // ----- KPIs -----
  const openCount = missions.filter(m => m.status === "PLANIFIEE" || m.status === "EN_COURS").length
  const enCoursCount = missions.filter(m => m.status === "EN_COURS").length
  const doneCount = missions.filter(m => m.status === "TERMINEE").length
  const anomalyTotal = missions.reduce((a, m) => a + m.tasksAnomaly, 0)

  const filtered = useMemo(
    () => missions.filter(m => fType === "all" || m.type === fType),
    [missions, fType]
  )
  const targetsTotal = filtered.reduce((a, m) => a + m.tasksTotal, 0)

  // ----- Colonnes DataViews (patron movements-history) -----
  const columns: DataViewColumn<MissionDTO>[] = [
    {
      key: "mission", header: "Mission",
      sortValue: (m) => m.title.toLowerCase(),
      render: (m) => (
        <div className="min-w-0 space-y-1">
          <TypeBadge type={m.type} />
          <p className="max-w-[230px] truncate text-xs font-semibold" title={m.title}>{m.title}</p>
        </div>
      ),
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
      key: "progress", header: "Avancement", className: "w-40",
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
      key: "detail", header: "Détail", align: "center", hideInCards: true,
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

  const renderMissionCard = (m: MissionDTO) => (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <TypeBadge type={m.type} />
          <MissionStatusBadge status={m.status} />
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
        <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setDetailId(m.id)}>
          <Eye className="h-3.5 w-3.5" aria-hidden /> Voir le détail
        </Button>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4">
      {/* KPIs compacts */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Missions ouvertes" value={openCount} icon={ClipboardList} tone="warning"
          sub="planifiées ou en cours sur le terrain"
        />
        <KpiCard
          label="En cours" value={enCoursCount} icon={Footprints} tone="info"
          sub="agents mobilisés en ce moment"
        />
        <KpiCard
          label="Terminées" value={doneCount} icon={CheckCircle2} tone="success"
          sub="contrôles et veilles bouclés"
        />
        <KpiCard
          label="Anomalies signalées" value={anomalyTotal} icon={AlertTriangle}
          tone={anomalyTotal > 0 ? "danger" : "default"}
          sub="cibles en anomalie, toutes missions"
        />
      </div>

      {/* Liste des missions */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Footprints className="h-4 w-4 text-emerald-600" aria-hidden />
                Missions commanditées par {myBrand.name}
              </CardTitle>
              <CardDescription>
                {filtered.length} mission{filtered.length > 1 ? "s" : ""} sur {missions.length} · {targetsTotal} cible{targetsTotal > 1 ? "s" : ""} · 3 modes d&apos;affichage
              </CardDescription>
            </div>
            <Button size="sm" className="h-8 shrink-0 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Demander une mission
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select value={fType} onValueChange={setFType}>
              <SelectTrigger size="sm" className="w-[200px]" aria-label="Filtrer par type de mission">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="CONTROLE">Contrôle — mes stations</SelectItem>
                <SelectItem value="VEILLE_CONCURRENT">Veille — concurrent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey="portal-terrain-missions"
            columns={columns}
            rows={filtered}
            rowKey={(m) => m.id}
            emptyMessage="Aucune mission commanditée pour l'instant — demandez votre premier contrôle ou votre première veille avec « Demander une mission »."
            maxHeightClassName="max-h-[26rem]"
            onRowClick={(m) => setDetailId(m.id)}
            renderCard={renderMissionCard}
            nested={{
              groupKey: (m) => m.status,
              groupLabel: (gk, grows) => {
                const Meta = STATUS_META[gk as keyof typeof STATUS_META] ?? STATUS_META.PLANIFIEE
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
              groupSortValue: (gk) => STATUS_META[gk as keyof typeof STATUS_META]?.rank ?? 9,
              hideColumnKeyInGroups: "status",
              defaultOpen: "all",
            }}
          />
        </CardContent>
      </Card>

      {/* Dialogue : fiche de pilotage d'une mission */}
      {detailId && (
        <MissionDetailDialog
          key={detailId}
          missionId={detailId}
          myBrand={myBrand}
          agents={myActiveAgents}
          allMyAgents={agents}
          brandOf={brandOf}
          onClose={() => setDetailId(null)}
          onChanged={onChanged}
        />
      )}

      {/* Dialogue : demande de mission */}
      {createOpen && (
        <RequestMissionDialog
          brandSlug={brandSlug}
          brandOf={brandOf}
          agents={myActiveAgents}
          brands={brands}
          onClose={() => setCreateOpen(false)}
          onCreated={onChanged}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialogue : fiche de pilotage d'une mission (vue enseigne)
// ---------------------------------------------------------------------------

function MissionDetailDialog({
  missionId, myBrand, agents, allMyAgents, brandOf, onClose, onChanged,
}: {
  missionId: string
  myBrand: { name: string; color: string }
  agents: FieldAgentDTO[]
  allMyAgents: FieldAgentDTO[]
  brandOf: BrandLookup
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<MissionDetailDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
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

  // Déjà annulée : referme la confirmation
  useEffect(() => {
    if (detail && detail.status === "ANNULEE") setConfirmCancelOpen(false)
  }, [detail])

  // --- Réassignation (agents actifs de MON enseigne uniquement) ---
  const zoneAgents = useMemo(
    () => (detail ? agents.filter(a => a.zone === detail.zone) : []),
    [agents, detail]
  )
  const otherAgents = useMemo(
    () => (detail ? agents.filter(a => a.zone !== detail.zone) : []),
    [agents, detail]
  )
  // Agent courant non re-sélectionnable (inactif ou détaché) : affiché pour mémoire
  const staleCurrent = useMemo(() => {
    if (!detail?.agentId) return null
    const a = allMyAgents.find(x => x.id === detail.agentId)
    return a && !a.active ? a : null
  }, [allMyAgents, detail])

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
          description: "Elle n'est plus portée par un agent — réassignez-la depuis cette fiche.",
        })
      } else {
        const a = allMyAgents.find(x => x.id === target)
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
  }, [detail, reassignChanged, reassigning, agentSel, allMyAgents, onChanged])

  // --- Annulation : PATCH { status: "ANNULEE" } (statut explicite honoré) ---
  const canCancel = detail ? detail.status !== "ANNULEE" : false

  const cancel = useCallback(async () => {
    if (!detail || cancelling) return
    setCancelling(true)
    try {
      const r = await fetch(`/api/missions/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ANNULEE" }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`)
      toast.success("Mission annulée", {
        description: "« " + detail.title + " » est figée au statut ANNULÉE — les rapports déjà remontés restent consultables (historique terrain).",
      })
      setConfirmCancelOpen(false)
      setReloadKey(k => k + 1)
      onChanged()
    } catch (e) {
      toast.error("Annulation refusée", {
        description: e instanceof Error ? e.message : "Erreur inattendue.",
      })
    } finally {
      setCancelling(false)
    }
  }, [detail, cancelling, onChanged])

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base leading-snug">
            {detail ? detail.title : "Détail de la mission"}
          </DialogTitle>
          <DialogDescription>
            {detail
              ? `Fiche de mission — zone ${detail.zone} · ${detail.tasks.length} cible${detail.tasks.length > 1 ? "s" : ""}`
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

        {detail && (
          <div className="space-y-4">
            {/* Badges d'identité — commanditaire : mon enseigne */}
            <div className="flex flex-wrap items-center gap-1.5">
              <TypeBadge type={detail.type} />
              <MissionStatusBadge status={detail.status} />
              <Badge variant="secondary" className="gap-1.5 text-[11px] font-normal">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: myBrand.color }} aria-hidden />
                Commanditaire : {myBrand.name}
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
                      {staleCurrent && (
                        <SelectItem value={staleCurrent.id} disabled>
                          {staleCurrent.name} · {staleCurrent.code} (inactif)
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
                    Agents actifs de votre enseigne uniquement — la désactivation d&apos;un agent détache ses missions.
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
                  L&apos;annulation fige la mission au statut ANNULÉE — les rapports déjà remontés
                  restent consultables dans l&apos;historique terrain.
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
                            La mission passera au statut ANNULÉE : l&apos;agent ne pourra plus y saisir de
                            rapport, mais l&apos;historique déjà remonté est conservé.
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

            {/* Cibles & derniers rapports (lecture seule — pilotage fin côté back-office) */}
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
                  <TargetItem key={t.id} task={t} brandOf={brandOf} />
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

// ----- Cible + dernier rapport condensé (lecture seule) -----

function TargetItem({ task, brandOf }: { task: MissionTaskDTO; brandOf: BrandLookup }) {
  const competitor = task.competitorSlug ? brandOf(task.competitorSlug) : null
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
            {competitor ? ` · veille ${competitor.name}` : ""}
            {task.lat != null && task.lng != null ? ` · GPS ${task.lat.toFixed(3)}, ${task.lng.toFixed(3)}` : ""}
          </p>
        </div>
        <TaskStatusBadge status={task.status} />
      </div>
      {task.lastReport ? (
        <ReportSummary report={task.lastReport} />
      ) : (
        <p className="border-t px-2.5 py-1.5 text-[11px] italic text-muted-foreground/80">
          Aucun rapport de visite remonté pour cette cible.
        </p>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Dialogue : « Demander une mission » (création côté enseigne)
// ---------------------------------------------------------------------------

type TargetDraft = {
  stationCode: string
  stationName: string
  competitorSlug: string | null
  targetLabel: string
  lat: number | null
  lng: number | null
}

function RequestMissionDialog({
  brandSlug, brandOf, agents, brands, onClose, onCreated,
}: {
  brandSlug: string
  brandOf: BrandLookup
  agents: FieldAgentDTO[]
  brands: BrandDTO[] | null
  onClose: () => void
  onCreated: () => void
}) {
  const [type, setType] = useState<MissionType>("CONTROLE")
  const [title, setTitle] = useState("")
  const [zone, setZone] = useState("")
  const [competitorSlug, setCompetitorSlug] = useState("")
  const [agentId, setAgentId] = useState("none")
  const [dueDate, setDueDate] = useState("")
  const [instructions, setInstructions] = useState("")
  const [targets, setTargets] = useState<TargetDraft[]>([])
  const [search, setSearch] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Parc stations du périmètre (mon enseigne ou le concurrent) dans la zone :
  // chargé paresseusement, mis en cache par couple {enseigne|zone}.
  const [stations, setStations] = useState<StationDTO[] | null>(null)
  const [stationsKey, setStationsKey] = useState("")
  const [stationsFailed, setStationsFailed] = useState(false)
  const [stationsRetry, setStationsRetry] = useState(0)
  const stationsCache = useRef(new Map<string, StationDTO[]>())

  const myBrand = brandOf(brandSlug)
  const watchBrand = type === "CONTROLE" ? brandSlug : competitorSlug
  const watchBrandInfo = brandOf(watchBrand || null)

  // Le périmètre change → les cibles déjà choisies ne sont plus cohérentes
  useEffect(() => { setTargets([]) }, [type, competitorSlug, zone])

  useEffect(() => {
    if (!watchBrand || !zone) {
      setStations(null)
      setStationsKey("")
      setStationsFailed(false)
      return
    }
    const key = `${watchBrand}|${zone}`
    if (key === stationsKey) return
    const cached = stationsCache.current.get(key)
    if (cached) {
      setStations(cached)
      setStationsKey(key)
      setStationsFailed(false)
      return
    }
    const ac = new AbortController()
    setStations(null)
    setStationsFailed(false)
    fetch(`/api/stations?brand=${encodeURIComponent(watchBrand)}&gouvernorat=${encodeURIComponent(zone)}&limit=2200`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { stations: StationDTO[] }) => {
        stationsCache.current.set(key, j.stations)
        setStations(j.stations)
        setStationsKey(key)
      })
      .catch(e => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setStationsFailed(true)
      })
    return () => ac.abort()
  }, [watchBrand, zone, stationsKey, stationsRetry])

  const suggestions = useMemo(() => {
    if (!stations) return []
    const q = search.trim().toLowerCase()
    return stations
      .filter(s => s.status !== "CLOSED" && s.status !== "PROJECT")
      .filter(s => !q || `${s.name} ${s.code} ${s.delegation}`.toLowerCase().includes(q))
      .slice(0, 8)
  }, [stations, search])

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

  const zoneAgents = useMemo(
    () => (zone ? agents.filter(a => a.zone === zone) : []),
    [agents, zone]
  )
  const otherAgents = useMemo(
    () => (zone ? agents.filter(a => a.zone !== zone) : agents),
    [agents, zone]
  )
  const selectedAgent = agentId === "none" ? null : agents.find(a => a.id === agentId) ?? null

  const competitorName = brandOf(competitorSlug || null).name
  const suggestedTitle = type === "CONTROLE"
    ? (zone ? `Contrôle ${myBrand.name} — ${zone}` : "")
    : (competitorSlug && zone ? `Veille ${competitorName} — ${zone}` : "")
  const finalTitle = title.trim() || suggestedTitle

  const veilleOk = type === "CONTROLE" || (!!competitorSlug && competitorSlug !== brandSlug)
  const dueOk = !dueDate || /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
  const canSubmit = !!finalTitle && !!zone && veilleOk && targets.length > 0 && dueOk && !submitting

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
      toast.success("Mission demandée", {
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

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-emerald-600" aria-hidden />
            Demander une mission
          </DialogTitle>
          <DialogDescription>
            Contrôle de vos stations ou veille sur un concurrent — l&apos;API exige au moins
            une cible ({MAX_TARGETS} maximum), rapport remonté par l&apos;app mobile agent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* 1 — Type de mission */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Type de mission</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Type de mission">
              {(["CONTROLE", "VEILLE_CONCURRENT"] as MissionType[]).map(t => {
                const selected = type === t
                const isControl = t === "CONTROLE"
                const Icon = isControl ? <ShieldCheckMini /> : <EyeMini />
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
                    {Icon}
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-tight">
                        {isControl ? "Contrôle de mes stations" : "Veille concurrentielle"}
                      </span>
                      <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                        {isControl
                          ? "Vérifier la conformité des stations de mon enseigne (fiche propriétaire)."
                          : "Observer les stations d'une enseigne concurrente (fiche concurrent)."}
                      </span>
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
                  Vos agents actifs uniquement — sans agent, la mission est créée PLANIFIÉE.
                </p>
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
                  Renseignez {type === "VEILLE_CONCURRENT" ? "l'enseigne concurrente observée" : "votre enseigne"} et la
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
                      Chargement des stations {watchBrandInfo.name} en {zone}…
                    </div>
                  )}
                  {stationsFailed && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-red-300 p-3 text-xs text-red-600 dark:border-red-900 dark:text-red-400">
                      <span>Stations indisponibles — impossible de choisir les cibles.</span>
                      <Button
                        variant="outline" size="sm" className="h-6"
                        onClick={() => { setStationsFailed(false); setStationsRetry(k => k + 1) }}
                      >
                        Réessayer
                      </Button>
                    </div>
                  )}
                  {stations !== null && suggestions.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Aucune station {watchBrandInfo.name} en {zone} ne correspond à cette recherche.
                    </p>
                  )}
                  {suggestions.length > 0 && (
                    <ul className="max-h-48 space-y-1 overflow-y-auto pr-1" aria-label="Stations suggérées">
                      {suggestions.map(s => {
                        const already = targets.some(t => t.stationCode === s.code)
                        return (
                          <li key={s.code}>
                            <button
                              type="button"
                              onClick={() => addTarget(s)}
                              disabled={already || targets.length >= MAX_TARGETS}
                              className="flex w-full items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Ajouter la station ${s.name} (${s.code}) aux cibles`}
                            >
                              <Plus className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{s.name}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  <code className="font-mono">{s.code}</code> · {s.delegation}
                                </span>
                              </span>
                              {already && <span className="text-[10px] italic text-muted-foreground">déjà ciblée</span>}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {targets.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Cibles sélectionnées
                        </p>
                        <Button
                          variant="ghost" size="sm" className="h-6 px-2 text-[11px]"
                          onClick={() => setTargets([])}
                        >
                          Tout retirer
                        </Button>
                      </div>
                      <ul className="flex flex-wrap gap-1.5">
                        {targets.map(t => (
                          <li key={t.stationCode}>
                            <Badge variant="secondary" className="gap-1 pr-1 text-[11px]">
                              <span className="max-w-[180px] truncate">{t.targetLabel}</span>
                              <button
                                type="button"
                                onClick={() => removeTarget(t.stationCode)}
                                className="rounded-sm p-0.5 hover:bg-muted"
                                aria-label={`Retirer la cible ${t.targetLabel}`}
                              >
                                <X className="h-3 w-3" aria-hidden />
                              </button>
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => void submit()} disabled={!canSubmit} className="gap-1.5">
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Créer la mission
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Petites icônes des cartes radio de type (styling local)
function ShieldCheckMini() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
      <ShieldCheck className="h-4.5 w-4.5" aria-hidden />
    </span>
  )
}

function EyeMini() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400">
      <Eye className="h-4.5 w-4.5" aria-hidden />
    </span>
  )
}
