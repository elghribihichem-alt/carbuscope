'use client'

// CarbuScope — T60-e — Dialog d'édition EN MASSE (barre de sélection ≥ 1 face
// FULL). Contrat POST /api/media/faces/bulk : étape 1 « Prévisualiser »
// (preview: true → anciennes valeurs, RIEN n'est écrit), étape 2 « Confirmer »
// (apply → { ok, updated } — une entrée d'audit PAR ligne côté serveur).
// Champ limité aux champs GESTIONNAIRE du registre FACE_FIELDS (la validation
// serveur rejette tout le reste — le client n'expose que le légal).

import { useEffect, useState } from "react"
import { Loader2, Layers, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { apiJson, numFr, useLocalT } from "@/components/media/media-shared"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FACE_FIELDS, type FieldDef } from "@/lib/media/shared"
import { X_DICT } from "./explorer-shared"

interface BulkPreviewResponse {
  preview: true
  count: number
  changes: { id: string; code: string; oldValue: number | string | boolean | null }[]
}

const EDITABLE_FIELDS: FieldDef[] = FACE_FIELDS.filter(f => f.edit === "GESTIONNAIRE")

export interface ExplorerBulkProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Faces sélectionnées (FULL uniquement — vérifié côté conteneur ET serveur). */
  ids: string[]
  /** Après application : le conteneur rafraîchit la liste. */
  onApplied: () => void
}

export function ExplorerBulkDialog({ open, onOpenChange, ids, onApplied }: ExplorerBulkProps) {
  const { t } = useLocalT(X_DICT)
  const [field, setField] = useState<string>("tmja")
  const [value, setValue] = useState("")
  const [preview, setPreview] = useState<BulkPreviewResponse | null>(null)
  const [busy, setBusy] = useState<"none" | "preview" | "apply">("none")

  // Réinitialise le dialogue à chaque ouverture (pas d'état résiduel).
  useEffect(() => {
    if (open) {
      setField("tmja")
      setValue("")
      setPreview(null)
      setBusy("none")
    }
  }, [open])

  const def = EDITABLE_FIELDS.find(f => f.key === field) ?? null
  const numValue = Number(value.replace(",", "."))
  const valueOk =
    def !== null && value.trim() !== "" && Number.isFinite(numValue) &&
    (def.min === undefined || numValue >= def.min) && (def.max === undefined || numValue <= def.max)

  const runPreview = async () => {
    if (!valueOk || busy !== "none") return
    setBusy("preview")
    try {
      const r = await apiJson<BulkPreviewResponse>("/api/media/faces/bulk", {
        method: "POST",
        body: JSON.stringify({ ids, field, value: def?.type === "int" ? Math.trunc(numValue) : numValue, preview: true }),
      })
      setPreview(r)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("x.ed.saveErr"))
    } finally {
      setBusy("none")
    }
  }

  const runApply = async () => {
    if (!preview || !valueOk || busy !== "none") return
    setBusy("apply")
    try {
      const r = await apiJson<{ ok: boolean; updated: number }>("/api/media/faces/bulk", {
        method: "POST",
        body: JSON.stringify({ ids, field, value: def?.type === "int" ? Math.trunc(numValue) : numValue }),
      })
      toast.success(`${r.updated} ${t("x.bulk.applied")}`)
      onApplied()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("x.ed.saveErr"))
    } finally {
      setBusy("none")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-[#b0563b]" aria-hidden /> {t("x.bulk.title")}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">{t("x.bulk.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">
            <span className="text-sm font-bold tabular-nums text-foreground">{ids.length}</span>{" "}
            {t("x.bulk.count")}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-field" className="text-xs font-medium text-muted-foreground">{t("x.bulk.field")}</Label>
            <Select value={field} onValueChange={v => { setField(v); setPreview(null) }}>
              <SelectTrigger id="bulk-field" className="h-11 w-full text-sm" aria-label={t("x.bulk.field")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EDITABLE_FIELDS.map(f => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-value" className="text-xs font-medium text-muted-foreground">{t("x.bulk.value")}</Label>
            <Input
              id="bulk-value"
              type="number"
              inputMode="decimal"
              className="h-11 text-sm tabular-nums"
              placeholder={def ? `${numFr(def.min ?? 0)} – ${numFr(def.max ?? 0)}` : ""}
              value={value}
              onChange={e => { setValue(e.target.value); setPreview(null) }}
              min={def?.min}
              max={def?.max}
              aria-invalid={!valueOk}
            />
            {def && (
              <p className="text-[10px] text-muted-foreground">
                {def.type === "int" ? "entier" : "décimal"} · min {numFr(def.min ?? 0)} · max {numFr(def.max ?? 0)}
              </p>
            )}
          </div>

          {!valueOk && value.trim() !== "" && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-[#b0563b]">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> {t("x.ed.invalid")}
            </p>
          )}

          {preview && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {t("x.bulk.previewHint")} — {preview.count} {t("x.bulk.count")}
              </p>
              <div className="max-h-56 overflow-y-auto rounded-lg border [scrollbar-width:thin]">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted">
                    <TableRow>
                      <TableHead className="h-9 text-[11px]">{t("x.tbl.face")}</TableHead>
                      <TableHead className="h-9 text-right text-[11px]">{t("x.bulk.oldValue")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.changes.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="py-2 font-mono text-[12px]">{c.code}</TableCell>
                        <TableCell className="py-2 text-right text-[13px] tabular-nums">
                          {c.oldValue === null || c.oldValue === undefined ? "—" : numFr(Number(c.oldValue))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="h-11 flex-1 gap-2 text-sm"
            onClick={() => void runPreview()}
            disabled={!valueOk || busy !== "none"}
            aria-label={t("x.bulk.preview")}
          >
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t("x.bulk.preview")}
          </Button>
          <Button
            className="h-11 flex-1 gap-2 text-sm"
            onClick={() => void runApply()}
            disabled={preview === null || busy !== "none"}
            aria-label={t("x.bulk.apply")}
          >
            {busy === "apply" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t("x.bulk.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
