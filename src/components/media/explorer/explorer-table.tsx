'use client'

// CarbuScope — T60-e — tableau imbriqué de l'explorateur (niveau PARENT =
// panneaux, colonnes agrégées + chevron d'expansion ; niveau ENFANT = faces,
// avec TMJA / audience / ODV éditables en ligne selon caps + registre
// FACE_FIELDS). Les faces AGGREGE n'affichent QUE les colonnes publiques
// (fourchette prix ±30 %, occupation, concurrents) + badge verrou — les
// autres cellules sont « ⸻ » grisées : RIEN n'est masqué côté client, le
// serveur ne l'a jamais envoyé. Barre flottante de sélection (N faces ·
// X formats · Y villes) : comparateur (2-8), édition en masse (preview puis
// apply côté serveur), handoff « Simuler ces faces ». Annuler/Rétablir
// multi-niveaux : chaque action refait un PATCH (journalisé en audit).

import { Fragment, useMemo, useState } from "react"
import {
  Calculator, ChevronDown, ChevronRight, Download, Eye, GitCompareArrows, Info,
  Loader2, Lock, Pencil, Redo2, Scale, TriangleAlert, Undo2, X,
} from "lucide-react"
import { toast } from "sonner"
import {
  FACE_STATUS_META, PANEL_STATUS_META, editableCellClass, numFr, pctFr, useLocalT,
} from "@/components/media/media-shared"
import {
  FIELD_BY_KEY, type FaceDTO, type FaceFullDTO, type PanelNestedDTO,
} from "@/lib/media/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { X_DICT, type EditOp } from "./explorer-shared"

const DASH = "⸻" // colonne masquée pour une face en visibilité restreinte

export interface ExplorerTableProps {
  panels: PanelNestedDTO[] | null
  pending: boolean
  canEditFaces: boolean
  canExport: boolean
  /** Faces FULL filtrées (tout sélectionner). */
  fullFaceIds: string[]
  selectedIds: string[]
  compareIds: string[]
  undoStack: EditOp[]
  redoStack: EditOp[]
  onToggleSelect: (faceId: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onOpenDetail: (face: FaceDTO, panel: PanelNestedDTO) => void
  onAddCompare: (faceId: string) => void
  onCompare: (ids: string[]) => void
  onSimulate: () => void
  onBulk: () => void
  onUndo: () => void
  onRedo: () => void
  onExport: () => void
  onResetFilters: () => void
  onCommit: (faceId: string, field: string, value: number) => void
}

export function ExplorerTable(props: ExplorerTableProps) {
  const { t } = useLocalT(X_DICT)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpand = (panelId: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(panelId)) next.delete(panelId)
      else next.add(panelId)
      return next
    })

  const { panels, selectedIds, fullFaceIds, compareIds, pending, canEditFaces, canExport } = props

  // Compteur live de la sélection : X formats · Y villes (faces FULL).
  const selStats = useMemo(() => {
    if (panels === null) return { formats: 0, villes: 0 }
    const sel = new Set(selectedIds)
    const formats = new Set<string>()
    const villes = new Set<string>()
    for (const p of panels) {
      for (const f of p.faces) {
        if (sel.has(f.id)) {
          formats.add(p.format)
          villes.add(p.ville)
        }
      }
    }
    return { formats: formats.size, villes: villes.size }
  }, [panels, selectedIds])

  const allChecked = fullFaceIds.length > 0 && selectedIds.length >= fullFaceIds.length

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardContent className="space-y-0 p-0">
        {/* — Barre d'outils : sélection globale, undo/redo, panier comparateur, export — */}
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent">
            <Checkbox
              checked={allChecked ? true : selectedIds.length > 0 ? "indeterminate" : false}
              onCheckedChange={() => props.onSelectAll()}
              aria-label={t("x.tbl.selectAll")}
            />
            <span className="hidden sm:inline">{t("x.tbl.selectAll")}</span>
          </label>

          <div className="ms-auto flex flex-wrap items-center gap-2">
            {/* Annuler / Rétablir — chaque action refait un PATCH journalisé */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="relative h-11 w-11"
                  onClick={props.onUndo}
                  disabled={props.undoStack.length === 0}
                  aria-label={t("x.ed.undo")}
                >
                  <Undo2 className="h-4 w-4" aria-hidden />
                  {props.undoStack.length > 0 && (
                    <Badge variant="secondary" className="absolute -end-1 -top-1 h-4 min-w-4 px-1 text-[9px] tabular-nums">{props.undoStack.length}</Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("x.ed.undo")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="relative h-11 w-11"
                  onClick={props.onRedo}
                  disabled={props.redoStack.length === 0}
                  aria-label={t("x.ed.redo")}
                >
                  <Redo2 className="h-4 w-4" aria-hidden />
                  {props.redoStack.length > 0 && (
                    <Badge variant="secondary" className="absolute -end-1 -top-1 h-4 min-w-4 px-1 text-[9px] tabular-nums">{props.redoStack.length}</Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("x.ed.redo")}</TooltipContent>
            </Tooltip>

            {/* Panier comparateur (ajouts depuis les lignes de face, max 8) */}
            <Button
              variant="outline"
              className="h-11 gap-2 text-sm"
              onClick={() => props.onCompare(compareIds)}
              disabled={compareIds.length < 2 || compareIds.length > 8}
              aria-label={`${t("x.tbl.compareFull")} (${compareIds.length}/8)`}
            >
              <Scale className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t("x.sel.compare")}</span>
              <Badge variant="secondary" className="tabular-nums text-[10px]">{compareIds.length}/8</Badge>
            </Button>

            {canExport && (
              <Button
                variant="outline"
                className="h-11 gap-2 text-sm"
                onClick={props.onExport}
                aria-label="Export CSV"
              >
                <Download className="h-4 w-4" aria-hidden />
                <span className="hidden md:inline">CSV</span>
              </Button>
            )}
            {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
          </div>
        </div>

        {/* — Tableau imbriqué panneaux → faces — */}
        <div className="overflow-x-auto">
          <Table className="min-w-[880px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" aria-label={t("x.tbl.selectAll")} />
                <TableHead className="h-10 text-[11px]">{t("x.tbl.code")}</TableHead>
                <TableHead className="h-10 text-[11px]">{t("x.tbl.orientation")}</TableHead>
                <TableHead className="h-10 text-[11px]">{t("x.tbl.tmja")}</TableHead>
                <TableHead className="h-10 text-[11px]">{t("x.tbl.audience")}</TableHead>
                <TableHead className="h-10 text-[11px]">{t("x.tbl.odv")}</TableHead>
                <TableHead className="h-10 text-right text-[11px]">{t("x.tbl.prix")}</TableHead>
                <TableHead className="h-10 text-right text-[11px]">{t("x.tbl.occup")}</TableHead>
                <TableHead className="h-10 text-right text-[11px]">{t("x.tbl.concur")}</TableHead>
                <TableHead className="h-10 text-right text-[11px]">{t("x.tbl.sov")}</TableHead>
                <TableHead className="h-10 text-[11px]">{t("x.tbl.statut")}</TableHead>
                <TableHead className="h-10 text-right text-[11px]">{t("x.tbl.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {panels === null ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell colSpan={12} className="py-3">
                      <Skeleton className="h-8 w-full rounded-md" />
                    </TableCell>
                  </TableRow>
                ))
              ) : panels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-10">
                    <div className="mx-auto max-w-sm space-y-1.5 text-center">
                      <TriangleAlert className="mx-auto h-5 w-5 text-amber-500" aria-hidden />
                      <p className="text-sm font-medium">{t("x.tbl.empty")}</p>
                      <p className="text-xs text-muted-foreground">{t("x.tbl.emptyHint")}</p>
                      <Button variant="outline" className="mt-2 h-11 text-sm" onClick={props.onResetFilters}>
                        {t("x.filters.reset")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                panels.map(panel => {
                  const isOpen = expanded.has(panel.id)
                  const nbAgg = panel.nbFaces - panel.nbFacesFull
                  return (
                    <Fragment key={panel.id}>
                      {/* — Ligne PARENT (panneau, colonnes agrégées) — */}
                      <TableRow
                        className="cursor-pointer bg-muted/40 hover:bg-muted/70"
                        onClick={() => toggleExpand(panel.id)}
                      >
                        <TableCell className="py-2.5">
                          <button
                            type="button"
                            className="flex h-11 w-11 items-center justify-center rounded-md transition-colors hover:bg-accent"
                            onClick={e => { e.stopPropagation(); toggleExpand(panel.id) }}
                            aria-expanded={isOpen}
                            aria-label={`${t("x.tbl.expand")} — ${panel.code}`}
                          >
                            {isOpen
                              ? <ChevronDown className="h-4 w-4" aria-hidden />
                              : <ChevronRight className="h-4 w-4" aria-hidden />}
                          </button>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                              <span className="font-mono text-[11px] text-muted-foreground">{panel.code}</span>
                              <span className="truncate">{panel.name}</span>
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {panel.ville} · {panel.governorat}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground">
                          <span className="tabular-nums">{panel.nbFaces} {t("x.tbl.faces")}</span>
                          <br />
                          <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{panel.nbFacesDispo} {t("x.tbl.dispo")}</span>
                        </TableCell>
                        <TableCell className="py-2.5 text-sm tabular-nums">
                          {panel.traficMax === null ? "—" : numFr(panel.traficMax)}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm tabular-nums">
                          {panel.audienceCumulee === null ? "—" : numFr(panel.audienceCumulee)}
                        </TableCell>
                        <TableCell className="py-2.5 text-[11px] leading-tight">
                          <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{panel.nbFacesFull}</span>
                          {" complet"}
                          {nbAgg > 0 && (
                            <>
                              {" · "}
                              <span className="tabular-nums text-amber-600 dark:text-amber-400">{nbAgg}</span>
                              {" restreint"}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-right text-sm tabular-nums">
                          {panel.prixMin === null || panel.prixMax === null
                            ? "—"
                            : `${numFr(panel.prixMin)}–${numFr(panel.prixMax)} DT`}
                        </TableCell>
                        <TableCell className="py-2.5 text-right text-sm text-muted-foreground">—</TableCell>
                        <TableCell className="py-2.5 text-right text-sm text-muted-foreground">—</TableCell>
                        <TableCell className="py-2.5 text-right text-sm tabular-nums">
                          {panel.partDeVoix === null ? "—" : pctFr(panel.partDeVoix)}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <PanelStatusBadge status={panel.status} />
                        </TableCell>
                        <TableCell className="py-2.5" />
                      </TableRow>

                      {/* — Lignes ENFANT (faces) — */}
                      {isOpen && panel.faces.map(face => (
                        <FaceRow
                          key={face.id}
                          face={face}
                          panel={panel}
                          selected={selectedIds.includes(face.id)}
                          inCompare={compareIds.includes(face.id)}
                          canEditFaces={canEditFaces}
                          onToggleSelect={props.onToggleSelect}
                          onOpenDetail={props.onOpenDetail}
                          onAddCompare={props.onAddCompare}
                          onCommit={props.onCommit}
                        />
                      ))}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* — Barre flottante de sélection (N ≥ 1) — */}
      {selectedIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-3 z-50 flex justify-center px-3" role="toolbar" aria-label={t("x.sel.selected")}>
          <div className="flex w-full max-w-3xl flex-col items-stretch gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium">
              <span className="text-sm font-bold tabular-nums text-[#b0563b]">{selectedIds.length}</span>
              <span>{selectedIds.length > 1 ? t("x.sel.selected") : t("x.sel.selectedF")}</span>
              <span className="text-muted-foreground">·</span>
              <span className="tabular-nums text-muted-foreground">{selStats.formats} {t("x.sel.formats")}</span>
              <span className="text-muted-foreground">·</span>
              <span className="tabular-nums text-muted-foreground">{selStats.villes} {t("x.sel.villes")}</span>
            </p>
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="h-11 gap-2 text-xs sm:text-sm"
                onClick={() => props.onCompare(selectedIds)}
                disabled={selectedIds.length < 2 || selectedIds.length > 8}
                aria-label={t("x.sel.compare")}
              >
                <GitCompareArrows className="h-4 w-4" aria-hidden />
                {t("x.sel.compare")} (2-8)
              </Button>
              <Button
                variant="outline"
                className="h-11 gap-2 text-xs sm:text-sm"
                onClick={props.onBulk}
                aria-label={t("x.sel.bulk")}
              >
                <Pencil className="h-4 w-4" aria-hidden />
                {t("x.sel.bulk")}
              </Button>
              <Button
                className="h-11 gap-2 bg-[#b0563b] text-xs text-white hover:bg-[#96482f] sm:text-sm"
                onClick={props.onSimulate}
                aria-label={t("x.sel.simulate")}
              >
                <Calculator className="h-4 w-4" aria-hidden />
                {t("x.sel.simulate")}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                onClick={props.onClearSelection}
                aria-label={t("x.sel.clear")}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─────────────────── Badge statut panneau ───────────────────

function PanelStatusBadge({ status }: { status: string }) {
  const meta = PANEL_STATUS_META[status]
  if (!meta) return <Badge variant="outline" className="text-[10px]">{status}</Badge>
  return <Badge variant="outline" className={`text-[10px] ${meta.className}`}>{meta.label}</Badge>
}

// ─────────────────── Ligne ENFANT (face) ───────────────────

interface FaceRowProps {
  face: FaceDTO
  panel: PanelNestedDTO
  selected: boolean
  inCompare: boolean
  canEditFaces: boolean
  onToggleSelect: (faceId: string) => void
  onOpenDetail: (face: FaceDTO, panel: PanelNestedDTO) => void
  onAddCompare: (faceId: string) => void
  onCommit: (faceId: string, field: string, value: number) => void
}

function FaceRow({ face, panel, selected, inCompare, canEditFaces, onToggleSelect, onOpenDetail, onAddCompare, onCommit }: FaceRowProps) {
  const { t } = useLocalT(X_DICT)
  const isFull = face.access === "FULL"

  return (
    <TableRow className={selected ? "bg-[#fdeee8]/50 dark:bg-[#2a1a13]/40" : "hover:bg-accent/40"}>
      {/* Sélection (FULL uniquement) / verrou (AGGREGE) */}
      <TableCell className="py-1.5">
        {isFull ? (
          <div className="flex h-11 w-11 items-center justify-center">
            <Checkbox
              checked={selected}
              onCheckedChange={() => onToggleSelect(face.id)}
              aria-label={`${t("x.tbl.selectOne")} ${face.code}`}
              className="h-5 w-5"
            />
          </div>
        ) : (
          <div className="flex h-11 w-11 items-center justify-center" title={t("x.map.restricted")}>
            <Lock className="h-4 w-4 text-amber-500" aria-label={t("x.map.restricted")} />
          </div>
        )}
      </TableCell>

      {/* Code face (indenté sous le panneau) */}
      <TableCell className="py-1.5">
        <div className="flex items-center gap-2 ps-3">
          <span className="h-4 w-3 shrink-0 rounded-sm border-s-2 border-b-2 border-muted-foreground/30" aria-hidden />
          <span className="font-mono text-[12px] font-medium">{face.code}</span>
        </div>
      </TableCell>

      <TableCell className="py-1.5 text-[12px] tabular-nums">
        {isFull ? face.orientation : <span className="text-muted-foreground/60">{DASH}</span>}
      </TableCell>

      {/* TMJA / audience / ODV — éditables en ligne (caps + registre) */}
      {isFull ? (
        <>
          <EditableCell face={face} field="tmja" canEdit={canEditFaces} onCommit={onCommit} align="left" />
          <EditableCell face={face} field="audienceJournaliere" canEdit={canEditFaces} onCommit={onCommit} align="left" />
          <EditableCell face={face} field="odvJournalieres" canEdit={canEditFaces} onCommit={onCommit} align="left" />
        </>
      ) : (
        <>
          <MaskedCell />
          <MaskedCell />
          <MaskedCell />
        </>
      )}

      {/* Prix / occupation / concurrents / SOV */}
      {isFull ? (
        <>
          <ReservedCell value={`${numFr(face.prixSemaine)} DT`} tooltip={t("x.ed.reservedSA")} align="right" />
          <ReservedCell value={pctFr(face.tauxOccupation12m)} tooltip={t("x.ed.reservedData")} align="right" />
          <ReservedCell value={numFr(face.stationsConcurrentesRayon)} tooltip={t("x.ed.reservedData")} align="right" />
          <ComputedCell value={pctFr(face.partDeVoix)} align="right" />
        </>
      ) : (
        <>
          <TableCell className="py-1.5 text-right text-[12px] tabular-nums">
            {numFr(face.prixMin)}–{numFr(face.prixMax)} DT
          </TableCell>
          <TableCell className="py-1.5 text-right text-[12px] tabular-nums">{pctFr(face.tauxOccupation12m)}</TableCell>
          <TableCell className="py-1.5 text-right text-[12px] tabular-nums">{numFr(face.stationsConcurrentesRayon)}</TableCell>
          <MaskedCell align="right" />
        </>
      )}

      {/* Statut */}
      <TableCell className="py-1.5">
        <FaceStatusBadge status={isFull ? face.status : face.statut} />
      </TableCell>

      {/* Actions : détails + ajout au comparateur */}
      <TableCell className="py-1.5">
        <div className="flex items-center justify-end gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                onClick={() => onOpenDetail(face, panel)}
                aria-label={`${t("x.tbl.details")} ${face.code}`}
              >
                <Eye className="h-4 w-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("x.tbl.details")}</TooltipContent>
          </Tooltip>
          {isFull ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-11 w-11 ${inCompare ? "text-[#b0563b]" : ""}`}
                  onClick={() => onAddCompare(face.id)}
                  aria-label={`${t("x.tbl.compare")} ${face.code}`}
                >
                  <Scale className="h-4 w-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("x.tbl.compare")}</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground/40" disabled aria-label={t("x.map.restricted")}>
                  <Scale className="h-4 w-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("x.map.restricted")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

function FaceStatusBadge({ status }: { status: string }) {
  const meta = FACE_STATUS_META[status]
  if (!meta) return <Badge variant="outline" className="text-[10px]">{status}</Badge>
  return <Badge variant="outline" className={`text-[10px] ${meta.className}`}>{meta.label}</Badge>
}

/** Cellule masquée (face AGGREGE — donnée jamais reçue). */
function MaskedCell({ align = "left" }: { align?: "left" | "right" }) {
  return (
    <TableCell className={`py-1.5 text-[12px] text-muted-foreground/60 ${align === "right" ? "text-right" : ""}`}>
      {DASH}
    </TableCell>
  )
}

/** Cellule réservée (SA / donnée réservée) : grisée + tooltip. */
function ReservedCell({ value, tooltip, align = "left" }: { value: string; tooltip: string; align?: "left" | "right" }) {
  return (
    <TableCell className={`py-1.5 ${align === "right" ? "text-right" : ""}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex min-h-6 cursor-help items-center gap-1 text-[12px] tabular-nums opacity-60">
            <Lock className="h-3 w-3 shrink-0" aria-hidden /> {value}
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TableCell>
  )
}

/** Cellule calculée par le moteur (ex. part de voix) : grisée + tooltip. */
function ComputedCell({ value, align = "left" }: { value: string; align?: "left" | "right" }) {
  return (
    <TableCell className={`py-1.5 ${align === "right" ? "text-right" : ""}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex min-h-6 cursor-help items-center gap-1 text-[12px] tabular-nums opacity-60">
            <Calculator className="h-3 w-3 shrink-0" aria-hidden /> {value}
          </span>
        </TooltipTrigger>
        <TooltipContent>Calculé par le moteur</TooltipContent>
      </Tooltip>
    </TableCell>
  )
}

// ─────────────────── Cellule éditable en ligne ───────────────────

interface EditableCellProps {
  face: FaceFullDTO
  field: string
  canEdit: boolean
  onCommit: (faceId: string, field: string, value: number) => void
  align: "left" | "right"
}

/** Cellule éditable : indicateur discret au survol (editableCellClass + crayon),
 *  clic → Input inline (focus auto), Entrée valide, Échap annule, blur valide.
 *  L'optimisme + PATCH + rollback vivent dans le conteneur (onCommit). */
function EditableCell({ face, field, canEdit, onCommit, align }: EditableCellProps) {
  const { t } = useLocalT(X_DICT)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const value = (face as unknown as Record<string, unknown>)[field] as number
  const def = FIELD_BY_KEY[field]

  if (!canEdit) {
    // Pas le rôle : même présentation que les cellules réservées.
    return <ReservedCell value={numFr(value)} tooltip={t("x.ed.reservedSA")} align={align} />
  }

  const open = () => {
    setDraft(String(value))
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const n = Number(draft.replace(",", "."))
    if (!Number.isFinite(n) || n === value) return
    if (def?.min !== undefined && n < def.min) { toast.error(`${t("x.ed.invalid")} — min ${numFr(def.min)}`); return }
    if (def?.max !== undefined && n > def.max) { toast.error(`${t("x.ed.invalid")} — max ${numFr(def.max)}`); return }
    if (def?.type === "int" && !Number.isInteger(n)) { toast.error(`${t("x.ed.invalid")} — entier attendu`); return }
    onCommit(face.id, field, def?.type === "int" ? Math.trunc(n) : n)
  }

  if (editing) {
    return (
      <TableCell className={`py-1 ${align === "right" ? "text-right" : ""}`}>
        <Input
          type="number"
          inputMode="decimal"
          autoFocus
          className="h-9 w-28 text-[13px] tabular-nums"
          value={draft}
          min={def?.min}
          max={def?.max}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") setEditing(false)
          }}
          onBlur={commit}
          aria-label={`${def?.label ?? field} — ${face.code}`}
        />
      </TableCell>
    )
  }

  return (
    <TableCell className={`py-1.5 ${align === "right" ? "text-right" : ""}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`group inline-flex min-h-8 min-w-11 items-center gap-1 rounded-md px-1.5 text-[13px] font-medium tabular-nums ${editableCellClass}`}
            onClick={open}
            aria-label={`${def?.label ?? field} : ${numFr(value)} — ${t("x.ed.editable")}`}
          >
            <Pencil className="h-3 w-3 shrink-0 text-amber-500 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            {numFr(value)}
          </button>
        </TooltipTrigger>
        <TooltipContent>{t("x.ed.editable")}</TooltipContent>
      </Tooltip>
    </TableCell>
  )
}
