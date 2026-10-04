'use client'

// CarbuScope — Module Média (T60-g) : ÉDITION EN MASSE des faces (SA) avec
// PRÉVISUALISATION obligatoire. POST /api/media/faces/bulk { ids, field,
// value, preview? } — preview: true → anciennes valeurs retournées, rien
// n'est écrit ; puis application (une entrée d'audit par ligne modifiée).

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Eye, Loader2, Rows3 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { apiJson, numFr } from "@/components/media/media-shared"
import { FACE_FIELDS, FIELD_BY_KEY } from "@/lib/media/shared"
import { useSaMediaT } from "./sa-media-shared"

const DICT = {
  fr: {
    title: "Édition en masse",
    desc: "Appliquer une même valeur à plusieurs faces. La prévisualisation est obligatoire avant application.",
    "f.field": "Champ à modifier",
    "f.value": "Nouvelle valeur",
    preview: "Prévisualiser",
    apply: "Appliquer",
    "preview.title": "Aperçu des changements",
    "preview.count": "face(s) concernée(s)",
    "preview.old": "Ancienne valeur",
    "preview.new": "Nouvelle valeur",
    "preview.hint": "Rien n'est encore enregistré — vérifiez puis appliquez.",
    "err.value": "Valeur invalide pour ce champ.",
    applied: "Édition en masse appliquée",
    "preview.none": "Aucune face éditable dans la sélection.",
    legend: "Une entrée d'audit sera journalisée pour chaque ligne modifiée.",
  },
  en: {
    title: "Bulk edit",
    desc: "Apply one value to several faces. Preview is mandatory before applying.",
    "f.field": "Field to edit",
    "f.value": "New value",
    preview: "Preview",
    apply: "Apply",
    "preview.title": "Change preview",
    "preview.count": "face(s) affected",
    "preview.old": "Old value",
    "preview.new": "New value",
    "preview.hint": "Nothing is saved yet — check then apply.",
    "err.value": "Invalid value for this field.",
    applied: "Bulk edit applied",
    "preview.none": "No editable face in the selection.",
    legend: "An audit entry will be logged for each modified row.",
  },
  ar: {
    title: "تعديل جماعي",
    desc: "تطبيق قيمة واحدة على عدة أوجه. المعاينة إلزامية قبل التطبيق.",
    "f.field": "الحقل",
    "f.value": "القيمة الجديدة",
    preview: "معاينة",
    apply: "تطبيق",
    "preview.title": "معاينة التغييرات",
    "preview.count": "وجه/أوجه معنية",
    "preview.old": "القيمة القديمة",
    "preview.new": "القيمة الجديدة",
    "preview.hint": "لم يُحفظ شيء بعد.",
    "err.value": "قيمة غير صالحة.",
    applied: "تم تطبيق التعديل الجماعي",
    "preview.none": "لا أوجه قابلة للتعديل.",
    legend: "سيُسجَّل تدقيق لكل سطر معدَّل.",
  },
}

interface BulkPreviewResponse {
  preview: true
  count: number
  changes: { id: string; code: string; oldValue: number | string | boolean | null }[]
}

export interface SaMediaBulkEditProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Faces présélectionnées (id + code) — le dialogue affiche les codes. */
  faces: { id: string; code: string }[]
  onDone: () => void
}

const BULKABLE = FACE_FIELDS.filter(f => f.edit !== "CALCULE")

const fmtVal = (v: number | string | boolean | null): string =>
  v === null ? "—" : typeof v === "boolean" ? (v ? "oui" : "non") : typeof v === "number" ? numFr(v) : v

export function SaMediaBulkEdit({ open, onOpenChange, faces, onDone }: SaMediaBulkEditProps) {
  const { t } = useSaMediaT(DICT)
  const [fieldKey, setFieldKey] = useState("tmja")
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [previewData, setPreviewData] = useState<BulkPreviewResponse | null>(null)

  const def = FIELD_BY_KEY[fieldKey]

  const typedValue = useMemo<number | string | boolean | null>(() => {
    if (!def) return null
    if (def.type === "bool") return value === "true"
    if (def.type === "int" || def.type === "float") {
      const n = Number(value.replace(",", "."))
      return value.trim() !== "" && Number.isFinite(n) ? n : null
    }
    return value.trim()
  }, [def, value])

  function reset() {
    setPreviewData(null)
    setValue("")
  }

  async function doPreview() {
    if (busy || !def || typedValue === null) { toast.error(t("err.value")); return }
    setBusy(true)
    try {
      const r = await apiJson<BulkPreviewResponse>("/api/media/faces/bulk", {
        method: "POST",
        body: JSON.stringify({ ids: faces.map(f => f.id), field: fieldKey, value: typedValue, preview: true }),
      })
      if (r.count === 0) {
        toast.error(t("preview.none"))
        setPreviewData(null)
      } else {
        setPreviewData(r)
      }
    } catch (e) {
      toast.error("Échec de la prévisualisation", { description: e instanceof Error ? e.message : "Erreur inconnue." })
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (busy || !previewData || typedValue === null) return
    setBusy(true)
    try {
      const r = await apiJson<{ ok: true; updated: number }>("/api/media/faces/bulk", {
        method: "POST",
        body: JSON.stringify({ ids: faces.map(f => f.id), field: fieldKey, value: typedValue }),
      })
      toast.success(t("applied"), { description: `${r.updated} face(s) — ${def?.label} → ${fmtVal(typedValue)}` })
      onDone()
      onOpenChange(false)
      reset()
    } catch (e) {
      toast.error("Échec de l'application", { description: e instanceof Error ? e.message : "Erreur inconnue." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!busy) { onOpenChange(o); if (!o) reset() } }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rows3 className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden /> {t("title")}
            <Badge variant="outline" className="font-mono">{faces.length} face(s)</Badge>
          </DialogTitle>
          <DialogDescription>{t("desc")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("f.field")}</Label>
            <Select
              value={fieldKey}
              onValueChange={v => { setFieldKey(v); setPreviewData(null) }}
              disabled={busy}
            >
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {BULKABLE.map(f => (
                  <SelectItem key={f.key} value={f.key}>
                    <span className="text-xs">{f.label}</span>
                    <span className="ml-1 text-[10px] text-muted-foreground">({f.group.toLowerCase()})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-value">{t("f.value")}</Label>
            {def?.type === "bool" ? (
              <Select value={value || "false"} onValueChange={v => { setValue(v); setPreviewData(null) }} disabled={busy}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">oui</SelectItem>
                  <SelectItem value="false">non</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="bulk-value"
                type={def && (def.type === "int" || def.type === "float") ? "number" : "text"}
                inputMode={def && (def.type === "int" || def.type === "float") ? "decimal" : undefined}
                step={def?.type === "float" ? "any" : "1"}
                value={value}
                disabled={busy}
                onChange={e => { setValue(e.target.value); setPreviewData(null) }}
                className="h-10 tabular-nums"
              />
            )}
            {def?.min !== undefined && def.max !== undefined ? (
              <p className="text-[11px] text-muted-foreground">Min {def.min} · max {def.max}</p>
            ) : null}
          </div>
        </div>

        {previewData ? (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Eye className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden /> {t("preview.title")}
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                {previewData.count} {t("preview.count")}
              </Badge>
            </p>
            <p className="text-xs text-muted-foreground">{t("preview.hint")}</p>
            <div className="max-h-60 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>{t("preview.old")}</TableHead>
                    <TableHead>{t("preview.new")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.changes.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.code}</TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground line-through decoration-zinc-400/70">{fmtVal(c.oldValue)}</TableCell>
                      <TableCell className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{fmtVal(typedValue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
            <Rows3 className="h-3.5 w-3.5 shrink-0" aria-hidden /> {t("legend")}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          {!previewData ? (
            <Button disabled={busy || typedValue === null || faces.length === 0} onClick={() => void doPreview()} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              {t("preview")}
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => void apply()} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {t("apply")} ({previewData.count})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
