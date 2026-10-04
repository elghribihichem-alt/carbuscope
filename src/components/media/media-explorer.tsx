'use client'

// CarbuScope — T60-e — EXPLORATEUR DE FACES (module Média, Portail enseigne).
// Orchestrateur : bandeau stats (visibles / complet / restreint / panneaux),
// layout 2 colonnes desktop (filtres w-64 à gauche, carte + tableau à droite ;
// mobile : filtres dans un Sheet), fetch GET /api/media/faces avec debounce
// 400 ms + AbortController, filtres cumulables du contrat, sélection + barre
// flottante (comparateur / édition en masse / handoff simulations), pile
// undo/redo (chaque action refait un PATCH journalisé côté serveur), export
// CSV léger (caps.export). La visibilité est résolue CÔTÉ SERVEUR : ce
// composant n'affiche que ce que l'API renvoie — les faces AGGREGE restent
// opaques (badge verrou, colonnes publiques uniquement).

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { ListFilter, Loader2, RotateCcw, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import {
  apiJson, dtFr, numFr, useLocalT, type LocalDict,
} from "@/components/media/media-shared"
import {
  FIELD_BY_KEY, MEDIA_CAPS, toMediaRole,
  type FaceAccess, type FaceDTO, type FaceFullDTO, type FacesListResponse,
  type PanelNestedDTO, type SavedFilterDTO,
} from "@/lib/media/shared"
import { useAppStore } from "@/store/app-store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { ExplorerFilters, type ExplorerFilterOptions } from "./explorer/explorer-filters"
import { ExplorerTable } from "./explorer/explorer-table"
import { ExplorerDetail } from "./explorer/explorer-detail"
import { ExplorerBulkDialog } from "./explorer/explorer-bulk"
import { ExplorerComparator } from "./explorer/explorer-comparator"
import {
  EMPTY_FILTERS, X_DICT, filtersToQuery, mergeDicts, type EditOp, type ExplorerFilterState,
} from "./explorer/explorer-shared"

// Fond cartographique Leaflet — montage client uniquement (pattern hub-carte).
const ExplorerLeafletMap = dynamic(() => import("./explorer/explorer-map").then(m => m.ExplorerLeafletMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-secondary/30 backdrop-blur-[2px]">
      <span className="inline-flex items-center gap-2 rounded-lg border bg-background/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Fond cartographique…
      </span>
    </div>
  ),
})

const E_DICT: LocalDict = {
  fr: {
    "e.error": "Erreur de chargement",
    "e.retry": "Réessayer",
    "e.stale": "Données affichées : dernier chargement réussi.",
    "e.empty.title": "Aucun panneau visible",
    "e.empty.desc": "Aucune face n'est visible dans votre périmètre pour l'instant.",
    "e.exported": "faces exportées (CSV).",
    "e.exportErr": "Export impossible.",
    "e.cmpMax": "Comparateur : 8 faces maximum.",
    "e.filters": "Filtres",
    "e.kpis.loading": "Chargement de l'explorateur…",
  },
  en: {
    "e.error": "Loading error",
    "e.retry": "Retry",
    "e.stale": "Displayed data: last successful load.",
    "e.empty.title": "No visible panel",
    "e.empty.desc": "No face is visible in your perimeter yet.",
    "e.exported": "faces exported (CSV).",
    "e.exportErr": "Export failed.",
    "e.cmpMax": "Comparator: 8 faces max.",
    "e.filters": "Filters",
    "e.kpis.loading": "Loading the explorer…",
  },
  ar: {
    "e.error": "خطأ في التحميل",
    "e.retry": "إعادة المحاولة",
    "e.stale": "البيانات المعروضة: آخر تحميل ناجح.",
    "e.empty.title": "لا لوحة مرئية",
    "e.empty.desc": "لا وجه مرئي في نطاقك حاليًا.",
    "e.exported": "أوجه تم تصديرها (CSV).",
    "e.exportErr": "تعذّر التصدير.",
    "e.cmpMax": "المقارن: 8 أوجه كحد أقصى.",
    "e.filters": "المرشحات",
    "e.kpis.loading": "تحميل المستكشف…",
  },
}

const EMPTY_OPTIONS: ExplorerFilterOptions = {
  gouvernorats: [], delegations: [], formats: [], technologies: [], statuts: [], supports: [],
}

const E_MERGED = mergeDicts(X_DICT, E_DICT)

export function MediaExplorer() {
  const { t } = useLocalT(E_MERGED)
  const session = useAppStore(s => s.session)
  const role = toMediaRole(session?.role ?? "VIEWER")
  const caps = MEDIA_CAPS[role]

  // ── Données (debounce 400 ms + AbortController, filtres cumulables) ──
  const [filters, setFilters] = useState<ExplorerFilterState>({ ...EMPTY_FILTERS })
  const [panels, setPanels] = useState<PanelNestedDTO[] | null>(null)
  const [stats, setStats] = useState<FacesListResponse["stats"] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [options, setOptions] = useState<ExplorerFilterOptions>({ ...EMPTY_OPTIONS })

  // ── Sélection / comparateur / fiche détail / masse / filtres mobiles ──
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)
  const [detail, setDetail] = useState<{ face: FaceDTO; panel: PanelNestedDTO } | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [mobileFilters, setMobileFilters] = useState(false)

  // ── Piles annuler/rétablir (chaque opération refait un PATCH audité) ──
  const [undoStack, setUndoStack] = useState<EditOp[]>([])
  const [redoStack, setRedoStack] = useState<EditOp[]>([])

  // ── Filtres sauvegardés du membre ──
  const [savedFilters, setSavedFilters] = useState<SavedFilterDTO[]>([])

  // Fetch principal : debounce 400 ms, requête abortable, options unionnées
  // (les options des Select ne rétrécissent jamais quand on filtre).
  useEffect(() => {
    let ctrl: AbortController | null = null
    const timer = setTimeout(() => {
      ctrl = new AbortController()
      setPending(true)
      const qs = filtersToQuery(filters)
      apiJson<FacesListResponse>(`/api/media/faces${qs ? `?${qs}` : ""}`, { signal: ctrl.signal })
        .then(d => {
          setPanels(d.panels)
          setStats(d.stats)
          setError(null)
          setOptions(prev => {
            const union = (a: string[], b: string[]) => Array.from(new Set([...a, ...b.filter(Boolean)])).sort((x, y) => x.localeCompare(y))
            return {
              gouvernorats: union(prev.gouvernorats, d.panels.map(p => p.governorat)),
              delegations: union(prev.delegations, d.panels.map(p => p.delegation)),
              formats: union(prev.formats, d.panels.map(p => p.format)),
              technologies: union(prev.technologies, d.panels.map(p => p.technology)),
              supports: union(prev.supports, d.panels.map(p => p.supportType)),
              statuts: union(prev.statuts, d.panels.flatMap(p => p.faces.map(f => (f.access === "FULL" ? f.status : f.statut)))),
            }
          })
        })
        .catch((e: unknown) => {
          if (e instanceof Error && e.name === "AbortError") return
          setError(e instanceof Error ? e.message : "Erreur inconnue")
        })
        .finally(() => setPending(false))
    }, 400)
    return () => {
      clearTimeout(timer)
      ctrl?.abort()
    }
  }, [filters, reloadKey])

  // Filtres sauvegardés (montage ; sauvegarde/suppression gérées localement dans le panneau).
  useEffect(() => {
    apiJson<{ filters: SavedFilterDTO[] }>("/api/media/filters")
      .then(d => setSavedFilters(d.filters ?? []))
      .catch(() => toast.error(t("x.sf.loadErr")))
  }, [])

  // Faces FULL filtrées + sélection DÉRIVÉE (aucun setState dans un effet :
  // les identifiants devenus invisibles sont filtrés au rendu).
  const fullFaceIds = useMemo(
    () => (panels ?? []).flatMap(p => p.faces.filter(f => f.access === "FULL").map(f => f.id)),
    [panels],
  )
  const visibleSet = useMemo(() => new Set(fullFaceIds), [fullFaceIds])
  const selection = useMemo(
    () => selectedIds.filter(id => visibleSet.has(id)),
    [selectedIds, visibleSet],
  )

  // ── Mise à jour locale d'une face (optimiste / vérité serveur) ──
  const applyFace = useCallback((face: FaceFullDTO) => {
    setPanels(prev =>
      (prev ?? []).map(p =>
        p.id === face.panelId ? { ...p, faces: p.faces.map(f => (f.id === face.id ? face : f)) } : p,
      ),
    )
    setDetail(prev => (prev && prev.face.id === face.id ? { ...prev, face } : prev))
  }, [])

  const applyLocalField = useCallback((faceId: string, field: string, value: number) => {
    setPanels(prev =>
      (prev ?? []).map(p => ({
        ...p,
        faces: p.faces.map(f => {
          if (f.id !== faceId || f.access !== "FULL") return f
          return { ...f, [field]: value } as FaceFullDTO
        }),
      })),
    )
  }, [])

  const findFace = useCallback((id: string): { panel: PanelNestedDTO; face: FaceDTO } | null => {
    for (const p of panels ?? []) for (const f of p.faces) if (f.id === id) return { panel: p, face: f }
    return null
  }, [panels])

  // ── Édition en ligne : optimiste + PATCH + rollback (rôles editFaces) ──
  const commit = useCallback((faceId: string, field: string, value: number) => {
    if (!caps.editFaces) return
    const ctx = findFace(faceId)
    if (!ctx || ctx.face.access !== "FULL") return
    const oldValue = (ctx.face as FaceFullDTO)[field as keyof FaceFullDTO] as number
    applyLocalField(faceId, field, value)
    apiJson<{ face: FaceFullDTO }>(`/api/media/faces/${faceId}`, {
      method: "PATCH",
      body: JSON.stringify({ field, value }),
    })
      .then(r => {
        applyFace(r.face)
        setUndoStack(prev => [...prev, { faceId, panelId: ctx.panel.id, faceCode: ctx.face.code, field, oldValue, newValue: value }])
        setRedoStack([])
        toast.success(`${ctx.face.code} · ${FIELD_BY_KEY[field]?.label ?? field} : ${numFr(value)} ${t("x.ed.saved")}`)
      })
      .catch((e: unknown) => {
        applyLocalField(faceId, field, oldValue)
        toast.error(e instanceof Error ? e.message : t("x.ed.saveErr"))
      })
  }, [applyFace, applyLocalField, caps.editFaces, findFace, t])

  // ── Annuler / Rétablir multi-niveaux (PATCH de la valeur inverse) ──
  const patchAndMove = useCallback((op: EditOp, value: number | string | boolean | null, dir: "undo" | "redo") => {
    apiJson<{ face: FaceFullDTO }>(`/api/media/faces/${op.faceId}`, {
      method: "PATCH",
      body: JSON.stringify({ field: op.field, value }),
    })
      .then(r => {
        applyFace(r.face)
        const flipped: EditOp = { ...op, oldValue: op.newValue, newValue: op.oldValue }
        if (dir === "undo") {
          setUndoStack(prev => prev.slice(0, -1))
          setRedoStack(prev => [...prev, flipped])
        } else {
          setRedoStack(prev => prev.slice(0, -1))
          setUndoStack(prev => [...prev, flipped])
        }
        const v = value === null ? "—" : typeof value === "number" ? numFr(value) : String(value)
        toast.success(`${op.faceCode} · ${FIELD_BY_KEY[op.field]?.label ?? op.field} → ${v}`)
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : t("x.ed.saveErr"))
      })
  }, [applyFace, t])

  const undo = useCallback(() => {
    const op = undoStack[undoStack.length - 1]
    if (!op) { toast.info(t("x.ed.undoEmpty")); return }
    void patchAndMove(op, op.oldValue, "undo")
  }, [patchAndMove, t, undoStack])

  const redo = useCallback(() => {
    const op = redoStack[redoStack.length - 1]
    if (!op) { toast.info(t("x.ed.redoEmpty")); return }
    void patchAndMove(op, op.newValue, "redo")
  }, [patchAndMove, t, redoStack])

  // ── Sélection (FULL uniquement — les faces AGGREGE sont verrouillées) ──
  const toggleSelect = useCallback((faceId: string, access?: FaceAccess) => {
    if (access === "AGGREGE") { toast.info(t("x.sel.fullOnly")); return }
    setSelectedIds(prev => (prev.includes(faceId) ? prev.filter(i => i !== faceId) : [...prev, faceId]))
  }, [t])

  const selectAll = useCallback(() => {
    setSelectedIds(prev => {
      if (fullFaceIds.length > 0 && fullFaceIds.every(id => prev.includes(id))) return []
      return fullFaceIds
    })
  }, [fullFaceIds])

  // ── Panier comparateur (max 8) + ouverture du dialogue ──
  const addCompare = useCallback((faceId: string) => {
    setCompareIds(prev => {
      if (prev.includes(faceId)) return prev.filter(i => i !== faceId)
      if (prev.length >= 8) { toast.error(t("e.cmpMax")); return prev }
      return [...prev, faceId]
    })
  }, [t])

  const openComparator = useCallback((ids: string[]) => {
    if (ids.length < 2 || ids.length > 8) return
    setCompareIds(ids)
    setCompareOpen(true)
  }, [])

  // ── Handoff vers l'assistant de simulation (contrat T60-f) ──
  const simulate = useCallback(() => {
    if (selection.length === 0) return
    useAppStore.getState().setNav("mediaHandoff", JSON.stringify({ faceIds: [...selection] }))
    useAppStore.getState().setNav("media", "simulations")
    toast.success(t("x.sim.handoff"))
  }, [selection, t])

  // ── Export CSV léger (client, faces visibles filtrées, labels FR) ──
  const exportCsv = useCallback(() => {
    if (!caps.export || panels === null) return
    try {
      const header = [
        "Code", "Panneau", "Ville", "Gouvernorat", "Format", "Technologie", "Statut", "Accès",
        "TMJA", "Audience/j", "ODV/j", "Prix/semaine (DT)", "Occupation 12m (%)",
        "Part de voix (%)", "Stations concurrentes", "Panneaux 1km",
      ]
      const lines: string[] = [header.join(";")]
      let count = 0
      for (const p of panels) {
        for (const f of p.faces) {
          if (f.access === "FULL") {
            lines.push([
              f.code, p.code, p.ville, p.governorat, p.format, p.technology, f.status, "Complet",
              f.tmja, f.audienceJournaliere, f.odvJournalieres, f.prixSemaine,
              f.tauxOccupation12m, f.partDeVoix, f.stationsConcurrentesRayon, f.panneauxRayon1km,
            ].join(";"))
          } else {
            lines.push([
              f.code, p.code, f.ville, f.governorat, f.format, f.technologie, f.statut, "Restreint",
              "", "", "", `${f.prixMin}-${f.prixMax}`, f.tauxOccupation12m, "",
              f.stationsConcurrentesRayon, f.panneauxRayon1km,
            ].join(";"))
          }
          count++
        }
      }
      const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `carbuscope-faces-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`${count} ${t("e.exported")}`)
    } catch {
      toast.error(t("e.exportErr"))
    }
  }, [caps.export, panels, t])

  // Ville/format par face (en-têtes du comparateur).
  const metaById = useMemo(() => {
    const map: Record<string, { ville: string; format: string }> = {}
    for (const p of panels ?? []) for (const f of p.faces) map[f.id] = { ville: p.ville, format: p.format }
    return map
  }, [panels])

  // ── Rendu ──
  if (error !== null && panels === null) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50">
        <CardContent className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">{t("e.error")}</p>
            <p className="text-sm text-red-600/90 dark:text-red-400/80">{error}</p>
          </div>
          <Button variant="outline" className="h-11 gap-2 text-sm" onClick={() => setReloadKey(k => k + 1)}>
            <RotateCcw className="h-4 w-4" aria-hidden /> {t("e.retry")}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      {/* — Bandeau stats (visible / complet / restreint / panneaux) — */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
          {stats === null && panels === null ? (
            <>
              <Skeleton className="h-6 w-24 rounded-md" />
              <Skeleton className="h-6 w-28 rounded-md" />
              <Skeleton className="h-6 w-24 rounded-md" />
              <span className="sr-only">{t("e.kpis.loading")}</span>
            </>
          ) : (
            <>
              <p className="flex items-center gap-1.5 text-sm">
                <span className="font-mono text-base font-bold tabular-nums text-[#b0563b]">{numFr(stats?.visible ?? 0)}</span>
                <span className="text-muted-foreground">{t("x.stats.visible")}</span>
              </p>
              <p className="flex items-center gap-1.5 text-sm">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-600" aria-hidden />
                <span className="font-mono text-base font-bold tabular-nums">{numFr(stats?.full ?? 0)}</span>
                <span className="text-muted-foreground">{t("x.stats.full")}</span>
              </p>
              <p className="flex items-center gap-1.5 text-sm">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                <span className="font-mono text-base font-bold tabular-nums">{numFr(stats?.aggrege ?? 0)}</span>
                <span className="text-muted-foreground">{t("x.stats.aggrege")}</span>
              </p>
              <p className="flex items-center gap-1.5 text-sm">
                <span className="font-mono text-base font-bold tabular-nums">{numFr(stats?.panneaux ?? 0)}</span>
                <span className="text-muted-foreground">{t("x.stats.panneaux")}</span>
              </p>
            </>
          )}
          {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
          {filtersToQuery(filters) !== "" && (
            <Badge variant="secondary" className="text-[10px]">{t("x.stats.filtered")}</Badge>
          )}
        </CardContent>
      </Card>

      {/* — Bandeau erreur « données périmées » (gardées affichées) — */}
      {error !== null && panels !== null && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-400">
              <TriangleAlert className="h-4 w-4" aria-hidden /> {error} — {t("e.stale")}
            </p>
            <Button variant="outline" className="h-11 gap-2 text-xs" onClick={() => setReloadKey(k => k + 1)}>
              <RotateCcw className="h-4 w-4" aria-hidden /> {t("e.retry")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* — Layout 2 colonnes : filtres | carte + tableau — */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        {/* Sidebar filtres (desktop) */}
        <Card className="hidden self-start lg:block">
          <CardContent className="max-h-[80vh] overflow-y-auto p-4 [scrollbar-width:thin]">
            <ExplorerFilters
              filters={filters}
              onFiltersChange={setFilters}
              options={options}
              saved={savedFilters}
              onSavedChange={setSavedFilters}
            />
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          {/* Bouton filtres (mobile) */}
          <Button
            variant="outline"
            className="h-11 w-full gap-2 text-sm lg:hidden"
            onClick={() => setMobileFilters(true)}
            aria-label={t("e.filters")}
          >
            <ListFilter className="h-4 w-4" aria-hidden /> {t("e.filters")}
            {Object.values(filters).some(v => v !== "") && (
              <Badge variant="secondary" className="tabular-nums text-[10px]">
                {Object.values(filters).filter(v => v !== "").length}
              </Badge>
            )}
          </Button>

          {/* Carte Leaflet (un CircleMarker par face) */}
          <Card className="overflow-hidden p-0">
            <div className="h-[320px] w-full md:h-[420px]">
              <ExplorerLeafletMap
                panels={panels ?? []}
                selectedIds={selection}
                onToggleSelect={toggleSelect}
                focusFaceId={detail?.face.id ?? null}
              />
            </div>
          </Card>

          {/* Tableau imbriqué + barre flottante de sélection */}
          <ExplorerTable
            panels={panels}
            pending={pending}
            canEditFaces={caps.editFaces}
            canExport={caps.export}
            fullFaceIds={fullFaceIds}
            selectedIds={selection}
            compareIds={compareIds}
            undoStack={undoStack}
            redoStack={redoStack}
            onToggleSelect={faceId => toggleSelect(faceId)}
            onSelectAll={selectAll}
            onClearSelection={() => setSelectedIds([])}
            onOpenDetail={(face, panel) => setDetail({ face, panel })}
            onAddCompare={addCompare}
            onCompare={openComparator}
            onSimulate={simulate}
            onBulk={() => setBulkOpen(true)}
            onUndo={undo}
            onRedo={redo}
            onExport={exportCsv}
            onResetFilters={() => setFilters({ ...EMPTY_FILTERS })}
            onCommit={commit}
          />
        </div>
      </div>

      {/* — Sheet filtres (mobile) — */}
      <Sheet open={mobileFilters} onOpenChange={setMobileFilters}>
        <SheetContent side="left" className="w-full overflow-y-auto p-0 sm:max-w-80">
          <SheetHeader className="border-b p-4">
            <SheetTitle className="text-base">{t("e.filters")}</SheetTitle>
            <SheetDescription className="sr-only">{t("x.filters.title")}</SheetDescription>
          </SheetHeader>
          <div className="p-4">
            <ExplorerFilters
              filters={filters}
              onFiltersChange={setFilters}
              options={options}
              saved={savedFilters}
              onSavedChange={setSavedFilters}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* — Fiche détail d'une face — */}
      <ExplorerDetail
        face={detail?.face ?? null}
        panel={detail?.panel ?? null}
        onOpenChange={o => { if (!o) setDetail(null) }}
      />

      {/* — Édition en masse (preview → apply) — */}
      <ExplorerBulkDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        ids={selectedIds}
        onApplied={() => setReloadKey(k => k + 1)}
      />

      {/* — Comparateur 2-8 faces — */}
      <ExplorerComparator
        open={compareOpen}
        onOpenChange={setCompareOpen}
        faceIds={compareIds}
        metaById={metaById}
      />
    </div>
  )
}
