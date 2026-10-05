'use client'

// CarbuScope — T60-f — Volet « Simulations » du module Média (portail enseigne).
// Liste (KPIs brouillons/envoyées/archivées + filtres + actions) et assistant
// de campagne en 5 étapes (SimWizard). Handoff explorateur : nav.mediaHandoff
// (JSON {faceIds}) lu à la MONTURE → création + ouverture étape 2 présélectionnée.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Archive,
  ArchiveRestore,
  CircleAlert,
  Copy,
  FileText,
  FolderOpen,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { MEDIA_CAPS, toMediaRole, type SimulationDTO } from "@/lib/media/shared"
import { useAppStore } from "@/store/app-store"
import { apiJson, dateFr, SIM_STATUS_META, useLocalT } from "./media-shared"
import { SimWizard } from "./simulations/sim-wizard"

const DICT = {
  fr: {
    title: "Simulations de campagne",
    desc: "Bâtissez et budgétez vos campagnes d'affichage urbain : sélection de faces, paramétrage, moteur d'audience, rapport et diffusion. L'état est conservé à chaque étape.",
    "kpi.brouillons": "Brouillons",
    "kpi.envoyees": "Envoyées",
    "kpi.archivees": "Archivées",
    new: "Nouvelle simulation",
    empty: "Aucune simulation pour l'instant",
    emptyHint: "Créez une première simulation depuis l'explorateur de faces ou le bouton « Nouvelle simulation ».",
    "col.name": "Nom",
    "col.client": "Client",
    "col.periode": "Période",
    "col.faces": "Faces",
    "col.statut": "Statut",
    "col.maj": "Dernière MAJ",
    "col.actions": "Actions",
    "act.open": "Ouvrir l'assistant",
    "act.duplicate": "Dupliquer",
    "act.archive": "Archiver",
    "act.reopen": "Rouvrir",
    "act.delete": "Supprimer",
    "confirm.archive": "Archiver cette simulation ?",
    "confirm.archiveDesc": "Elle quitte le fil actif et reste consultable via le filtre « Archivées ». Réouverture possible à tout moment.",
    "confirm.delete": "Supprimer cette simulation ?",
    "confirm.deleteDesc": "Action définitive — la simulation, sa sélection et ses résultats seront effacés.",
    "confirm.continue": "Continuer",
    cancel: "Annuler",
    "filter.show": "Afficher :",
    "err.load": "Chargement des simulations impossible",
    "err.action": "Action impossible",
    "ok.duplicated": "Simulation dupliquée (nouveau brouillon)",
    "ok.archived": "Simulation archivée",
    "ok.reopened": "Simulation rouverte (brouillon)",
    "ok.deleted": "Simulation supprimée",
    "ok.created": "Nouvelle simulation créée",
    handoffCreated: "Simulation créée depuis l'explorateur — faces présélectionnées",
    retry: "Réessayer",
    noPerms: "Votre rôle ne permet pas de créer des simulations — consultation seule.",
  },
  en: {
    title: "Campaign simulations",
    desc: "Build and budget your urban display campaigns: face selection, parameters, audience engine, report and sharing. State is saved at each step.",
    "kpi.brouillons": "Drafts",
    "kpi.envoyees": "Sent",
    "kpi.archivees": "Archived",
    new: "New simulation",
    empty: "No simulation yet",
    emptyHint: "Create a first simulation from the face explorer or the “New simulation” button.",
    "col.name": "Name",
    "col.client": "Client",
    "col.periode": "Period",
    "col.faces": "Faces",
    "col.statut": "Status",
    "col.maj": "Last update",
    "col.actions": "Actions",
    "act.open": "Open wizard",
    "act.duplicate": "Duplicate",
    "act.archive": "Archive",
    "act.reopen": "Reopen",
    "act.delete": "Delete",
    "confirm.archive": "Archive this simulation?",
    "confirm.archiveDesc": "It leaves the active feed and remains reachable via the “Archived” filter. Reopening is always possible.",
    "confirm.delete": "Delete this simulation?",
    "confirm.deleteDesc": "Definitive action — the simulation, its selection and its results will be erased.",
    "confirm.continue": "Continue",
    cancel: "Cancel",
    "filter.show": "Show:",
    "err.load": "Failed to load simulations",
    "err.action": "Action failed",
    "ok.duplicated": "Simulation duplicated (new draft)",
    "ok.archived": "Simulation archived",
    "ok.reopened": "Simulation reopened (draft)",
    "ok.deleted": "Simulation deleted",
    "ok.created": "New simulation created",
    handoffCreated: "Simulation created from the explorer — faces preselected",
    retry: "Retry",
    noPerms: "Your role cannot create simulations — read-only.",
  },
  ar: {
    title: "محاكات الحملات",
    "kpi.brouillons": "مسودات",
    "kpi.envoyees": "مرسلة",
    "kpi.archivees": "مؤرشفة",
    new: "محاكاة جديدة",
    empty: "لا توجد محاكات",
    "col.name": "الاسم",
    "col.client": "العميل",
    "col.periode": "الفترة",
    "col.faces": "الأوجه",
    "col.statut": "الحالة",
    "col.maj": "آخر تحديث",
    "act.open": "فتح المساعد",
    "act.duplicate": "تكرار",
    "act.archive": "أرشفة",
    "act.reopen": "إعادة فتح",
    "act.delete": "حذف",
    "confirm.delete": "حذف هذه المحاكاة؟",
    cancel: "إلغاء",
    "ok.archived": "تمت الأرشفة",
    "ok.reopened": "أعيد الفتح",
    "ok.deleted": "تم الحذف",
    retry: "إعادة المحاولة",
  },
}

const STATUS_FILTERS: ReadonlyArray<{ id: string; labelKey: string; dot: string }> = [
  { id: "BROUILLON", labelKey: "kpi.brouillons", dot: "bg-zinc-400" },
  { id: "ENVOYEE", labelKey: "kpi.envoyees", dot: "bg-[#059669]" },
  { id: "ARCHIVEE", labelKey: "kpi.archivees", dot: "bg-zinc-300" },
]

export function MediaSimulations({ brandSlug: _brandSlug }: { brandSlug: string }) {
  const { t } = useLocalT(DICT)
  const session = useAppStore(s => s.session)
  const caps = MEDIA_CAPS[toMediaRole(session?.role ?? "VIEWER")]
  const nav = useAppStore(s => s.nav)
  const setNav = useAppStore(s => s.setNav)

  const [sims, setSims] = useState<SimulationDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<Record<string, boolean>>({ BROUILLON: true, ENVOYEE: true, ARCHIVEE: false })
  const [wizard, setWizard] = useState<{ sim: SimulationDTO; initialFaceIds?: string[] } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await apiJson<{ simulations: SimulationDTO[] }>("/api/media/simulations")
      setSims(r.simulations)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "error")
    }
  }, [])

  useEffect(() => {
    void (async () => {
      await refresh()
    })()
  }, [refresh])

  // ─────────── Handoff explorateur (nav.mediaHandoff, lu une seule fois) ───────────
  const handoffDone = useRef(false)
  useEffect(() => {
    if (handoffDone.current) return
    const raw = nav.mediaHandoff
    if (!raw) return
    handoffDone.current = true
    setNav("mediaHandoff", "")
    let faceIds: string[] = []
    try {
      const parsed = JSON.parse(raw) as { faceIds?: unknown }
      if (Array.isArray(parsed.faceIds)) {
        faceIds = parsed.faceIds.filter((x): x is string => typeof x === "string")
      }
    } catch {
      faceIds = []
    }
    if (faceIds.length === 0 || !caps.createSimulation) return
    void (async () => {
      try {
        const r = await apiJson<{ simulation: SimulationDTO }>("/api/media/simulations", {
          method: "POST",
          body: JSON.stringify({ name: "Simulation depuis l'explorateur" }),
        })
        setWizard({ sim: r.simulation, initialFaceIds: faceIds })
        void refresh()
        toast.success(t("handoffCreated"))
      } catch (e) {
        toast.error(t("err.action"), { description: e instanceof Error ? e.message : undefined })
      }
    })()
  }, [])

  // ─────────── Mutations ───────────
  async function createSim() {
    try {
      const r = await apiJson<{ simulation: SimulationDTO }>("/api/media/simulations", {
        method: "POST",
        body: JSON.stringify({}),
      })
      setWizard({ sim: r.simulation })
      void refresh()
      toast.success(t("ok.created"))
    } catch (e) {
      toast.error(t("err.action"), { description: e instanceof Error ? e.message : undefined })
    }
  }

  async function duplicateSim(id: string) {
    try {
      await apiJson(`/api/media/simulations/${id}`, { method: "POST" })
      await refresh()
      toast.success(t("ok.duplicated"))
    } catch (e) {
      toast.error(t("err.action"), { description: e instanceof Error ? e.message : undefined })
    }
  }

  async function patchStatus(id: string, status: "ARCHIVEE" | "BROUILLON") {
    try {
      await apiJson(`/api/media/simulations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })
      await refresh()
      toast.success(status === "ARCHIVEE" ? t("ok.archived") : t("ok.reopened"))
    } catch (e) {
      toast.error(t("err.action"), { description: e instanceof Error ? e.message : undefined })
    }
  }

  async function deleteSim(id: string) {
    try {
      await apiJson(`/api/media/simulations/${id}`, { method: "DELETE" })
      await refresh()
      toast.success(t("ok.deleted"))
    } catch (e) {
      toast.error(t("err.action"), { description: e instanceof Error ? e.message : undefined })
    }
  }

  async function openSim(id: string) {
    try {
      const r = await apiJson<{ simulation: SimulationDTO }>(`/api/media/simulations/${id}`)
      setWizard({ sim: r.simulation })
    } catch (e) {
      toast.error(t("err.load"), { description: e instanceof Error ? e.message : undefined })
    }
  }

  const counts = useMemo(() => {
    const list = sims ?? []
    return {
      BROUILLON: list.filter(s => s.status === "BROUILLON").length,
      ENVOYEE: list.filter(s => s.status === "ENVOYEE").length,
      ARCHIVEE: list.filter(s => s.status === "ARCHIVEE").length,
    }
  }, [sims])

  const visible = useMemo(() => {
    const list = sims ?? []
    return list.filter(s => active[s.status] !== false)
  }, [sims, active])

  // ─────────── Assistant ouvert ───────────
  if (wizard) {
    return (
      <SimWizard
        key={wizard.sim.id}
        sim={wizard.sim}
        initialFaceIds={wizard.initialFaceIds}
        onClose={() => {
          setWizard(null)
          void refresh()
        }}
      />
    )
  }

  const kpiCards: { key: "BROUILLON" | "ENVOYEE" | "ARCHIVEE"; className: string }[] = [
    { key: "BROUILLON", className: "text-zinc-700 dark:text-zinc-300" },
    { key: "ENVOYEE", className: "text-[#059669] dark:text-emerald-400" },
    { key: "ARCHIVEE", className: "text-zinc-500 dark:text-zinc-400" },
  ]

  return (
    <div className="space-y-4">
      {/* En-tête + KPIs + création */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-tight">{t("title")}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("desc")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid grid-cols-3 gap-2">
              {kpiCards.map(k => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setActive(prev => ({ ...prev, [k.key]: prev[k.key] === false }))}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-center transition-colors hover:border-[#059669] dark:border-zinc-800 dark:hover:border-emerald-700"
                  aria-pressed={active[k.key] !== false}
                >
                  <p className={cn("text-lg font-bold tabular-nums leading-none", k.className)}>
                    {counts[k.key].toLocaleString("fr-FR")}
                  </p>
                  <p className="mt-1 text-[10px] font-medium text-muted-foreground">{t(k.labelKey)}</p>
                </button>
              ))}
            </div>
            {caps.createSimulation ? (
              <Button
                type="button"
                size="lg"
                onClick={createSim}
                className="h-11 gap-2 bg-[#059669] text-white hover:bg-[#047857] dark:bg-emerald-700 dark:hover:bg-emerald-600"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {t("new")}
              </Button>
            ) : (
              <p className="max-w-40 text-[11px] leading-snug text-muted-foreground">{t("noPerms")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filtres statut */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("filter.show")}</span>
        {STATUS_FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActive(prev => ({ ...prev, [f.id]: prev[f.id] === false }))}
            aria-pressed={active[f.id] !== false}
            className={cn(
              "flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active[f.id] !== false
                ? "border-zinc-400 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
                : "border-zinc-200 text-zinc-400 hover:text-zinc-600 dark:border-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-300",
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", f.dot)} aria-hidden />
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {/* Liste */}
      {error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <CircleAlert className="h-6 w-6 text-[#b0563b]" aria-hidden />
            <p className="text-sm text-muted-foreground">{t("err.load")}</p>
            <Button type="button" variant="outline" onClick={() => void refresh()} className="h-10">
              {t("retry")}
            </Button>
          </CardContent>
        </Card>
      ) : sims === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <FileText className="h-6 w-6 text-zinc-400" aria-hidden />
            <p className="text-sm font-medium">{t("empty")}</p>
            <p className="max-w-md text-xs text-muted-foreground">{t("emptyHint")}</p>
            {caps.createSimulation && sims.length === 0 ? (
              <Button type="button" size="sm" onClick={createSim} className="mt-2 h-9 gap-1.5 bg-[#059669] text-white hover:bg-[#047857]">
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t("new")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 pb-2">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("col.name")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("col.client")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("col.periode")}</TableHead>
                    <TableHead className="text-right">{t("col.faces")}</TableHead>
                    <TableHead>{t("col.statut")}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t("col.maj")}</TableHead>
                    <TableHead className="text-right">{t("col.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map(sim => {
                    const meta = SIM_STATUS_META[sim.status] ?? SIM_STATUS_META.BROUILLON
                    const canArchive = sim.status !== "ARCHIVEE"
                    return (
                      <SimulationRow
                        key={sim.id}
                        sim={sim}
                        meta={meta}
                        canArchive={canArchive}
                        canDelete={caps.createSimulation}
                        t={t}
                        onOpen={() => void openSim(sim.id)}
                        onDuplicate={() => void duplicateSim(sim.id)}
                        onArchive={() => void patchStatus(sim.id, "ARCHIVEE")}
                        onReopen={() => void patchStatus(sim.id, "BROUILLON")}
                        onDelete={() => void deleteSim(sim.id)}
                      />
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/** Ligne de simulation : actions avec confirmations (AlertDialog). */
function SimulationRow({ sim, meta, canArchive, canDelete, t, onOpen, onDuplicate, onArchive, onReopen, onDelete }: {
  sim: SimulationDTO
  meta: { label: string; className: string }
  canArchive: boolean
  canDelete: boolean
  t: (key: string) => string
  onOpen: () => void
  onDuplicate: () => void
  onArchive: () => void
  onReopen: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  return (
    <TableRow className="group">
      <TableCell className="max-w-56">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-h-11 items-center gap-2 text-left font-medium hover:text-[#059669] dark:hover:text-emerald-400"
          title={t("act.open")}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-[#059669]" aria-hidden />
          <span className="truncate">{sim.name}</span>
        </button>
      </TableCell>
      <TableCell className="hidden max-w-40 truncate text-xs text-muted-foreground sm:table-cell">
        {sim.client ?? "—"}
      </TableCell>
      <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
        {dateFr(sim.dateStart)} → {dateFr(sim.dateEnd)}
      </TableCell>
      <TableCell className="text-right tabular-nums text-xs">
        {sim.selections.length.toLocaleString("fr-FR")}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={cn("whitespace-nowrap", meta.className)}>
          {meta.label}
        </Badge>
      </TableCell>
      <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
        {dateFr(sim.updatedAt)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDuplicate}
            className="h-9 w-9 p-0 text-muted-foreground hover:text-[#059669]"
            aria-label={t("act.duplicate")}
            title={t("act.duplicate")}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
          </Button>
          {canArchive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmArchive(true)}
              className="h-9 w-9 p-0 text-muted-foreground hover:text-[#d97706]"
              aria-label={t("act.archive")}
              title={t("act.archive")}
            >
              <Archive className="h-3.5 w-3.5" aria-hidden />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReopen}
              className="h-9 w-9 p-0 text-muted-foreground hover:text-[#059669]"
              aria-label={t("act.reopen")}
              title={t("act.reopen")}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            </Button>
          )}
          {canDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="h-9 w-9 p-0 text-muted-foreground hover:text-[#b0563b]"
              aria-label={t("act.delete")}
              title={t("act.delete")}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>
      </TableCell>

      {/* Confirmation archivage / réouverture */}
      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ArchiveRestore className="h-4 w-4 text-[#d97706]" aria-hidden />
              {t("confirm.archive")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirm.archiveDesc")} — « {sim.name} »
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onArchive}
              className="h-10 bg-[#d97706] text-white hover:bg-[#b45309] dark:bg-amber-700 dark:hover:bg-amber-600"
            >
              {t("confirm.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation suppression */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-[#b0563b]" aria-hidden />
              {t("confirm.delete")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirm.deleteDesc")} — « {sim.name} »
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="h-10 bg-[#b0563b] text-white hover:bg-[#98482f] dark:bg-[#7a3c2a] dark:hover:bg-[#8a4530]"
            >
              {t("act.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TableRow>
  )
}
