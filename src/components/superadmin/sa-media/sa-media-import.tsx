'use client'

// CarbuScope — Module Média (T60-g) : dialogue d'IMPORT CSV générique des
// volets SA Média (panneaux / trafic). Parsing CLIENT : en-tête contrôlé,
// table de prévisualisation (lignes valides + erreurs signalées), puis
// application LIGNE À LIGNE via la fonction fournie (POST/PATCH par ligne —
// pas d'API bulk dédiée pour les panneaux, itération acceptée en V1), avec
// compteurs succès/échec et toasts. Colle un CSV depuis Excel (séparateur « ; »).

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, FileUp, Loader2, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useSaMediaT } from "./sa-media-shared"

export interface CsvColumn {
  key: string
  label: string
  kind: "text" | "number"
}

export interface SaMediaCsvImportProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  expectedHeader: string[]
  columns: CsvColumn[]
  /** Applique UNE ligne — doit lever une Error avec un message FR en cas d'échec. */
  applyRow: (cells: Record<string, string>) => Promise<void>
  onDone: () => void
}

type RowStatus = "pending" | "running" | "ok" | "failed"

interface PreviewRow {
  index: number
  cells: Record<string, string>
  error: string | null
  status: RowStatus
}

export function SaMediaCsvImport({ open, onOpenChange, title, description, expectedHeader, columns, applyRow, onDone }: SaMediaCsvImportProps) {
  const { t } = useSaMediaT({})
  const [raw, setRaw] = useState("")
  const [busy, setBusy] = useState(false)
  const [statuses, setStatuses] = useState<Record<number, { status: RowStatus; error?: string }>>({})

  const rows = useMemo<PreviewRow[]>(() => {
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l !== "")
    if (lines.length === 0) return []
    const sep = lines[0].includes(";") ? ";" : "\t"
    const header = lines[0].split(sep).map(h => h.trim().toLowerCase())
    if (header.join(";") !== expectedHeader.join(";")) {
      return [{ index: 0, cells: {}, error: `En-tête invalide — attendu : ${expectedHeader.join(";")}`, status: "failed" }]
    }
    const out: PreviewRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(sep).map(c => c.trim())
      const rec: Record<string, string> = {}
      columns.forEach((c, j) => { rec[c.key] = cells[j] ?? "" })
      let error: string | null = null
      for (const c of columns) {
        const v = rec[c.key] ?? ""
        if (v === "") { error = `Colonne « ${c.label} » vide.`; break }
        if (c.kind === "number" && !Number.isFinite(Number(v.replace(",", ".")))) {
          error = `« ${c.label} » : valeur numérique attendue.`; break
        }
      }
      out.push({ index: i, cells: rec, error, status: "pending" })
    }
    return out
  }, [raw, columns, expectedHeader])

  const validRows = rows.filter(r => r.error === null)
  const headerError = rows.length > 0 && rows[0].index === 0 && rows[0].error !== null ? rows[0].error : null
  const applied = Object.values(statuses).filter(s => s.status === "ok").length
  const failed = Object.values(statuses).filter(s => s.status === "failed").length

  async function runImport() {
    if (busy || validRows.length === 0) return
    setBusy(true)
    const next: Record<number, { status: RowStatus; error?: string }> = {}
    setStatuses(next)
    let ok = 0, ko = 0, firstError: string | null = null
    for (const r of validRows) {
      setStatuses(s => ({ ...s, [r.index]: { status: "running" } }))
      try {
        await applyRow(r.cells)
        ok++
        setStatuses(s => ({ ...s, [r.index]: { status: "ok" } }))
      } catch (e) {
        ko++
        const msg = e instanceof Error ? e.message : "Erreur inconnue."
        if (!firstError) firstError = msg
        setStatuses(s => ({ ...s, [r.index]: { status: "failed", error: msg } }))
      }
    }
    setBusy(false)
    if (ok > 0) {
      toast.success(`Import appliqué : ${ok} ligne(s)`, { description: ko > 0 ? `${ko} échec(s) — ${firstError ?? ""}` : "Toutes les lignes valides ont été appliquées." })
      onDone()
    } else {
      toast.error("Échec de l'import", { description: firstError ?? "Aucune ligne appliquée." })
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!busy) onOpenChange(o) }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium">En-tête attendu (séparateur « ; ») :</p>
            <code className="block overflow-x-auto whitespace-nowrap rounded-md bg-zinc-100 px-2.5 py-1.5 font-mono text-[11px] dark:bg-zinc-800">
              {expectedHeader.join(";")}
            </code>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="csv-raw" className="text-xs font-medium">Collez le contenu CSV ici :</label>
            <Textarea
              id="csv-raw"
              value={raw}
              disabled={busy}
              onChange={e => { setRaw(e.target.value); setStatuses({}) }}
              placeholder={`${expectedHeader.join(";")}\n…`}
              className="min-h-28 font-mono text-xs"
            />
          </div>

          {rows.length > 0 && !headerError ? (
            <div className="overflow-x-auto">
              <div className="max-h-72 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      {columns.map(c => <TableHead key={c.key}>{c.label}</TableHead>)}
                      <TableHead className="min-w-40">État</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(r => {
                      const st = statuses[r.index] ?? { status: r.error ? "failed" as RowStatus : "pending" as RowStatus, error: r.error ?? undefined }
                      return (
                        <TableRow key={r.index}>
                          <TableCell className="text-xs tabular-nums text-muted-foreground">{r.index}</TableCell>
                          {columns.map(c => (
                            <TableCell key={c.key} className="font-mono text-xs">{r.cells[c.key] ?? "—"}</TableCell>
                          ))}
                          <TableCell>
                            {st.status === "ok" ? (
                              <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" aria-hidden /> Importée
                              </Badge>
                            ) : st.status === "failed" ? (
                              <span className="flex items-start gap-1 text-xs text-red-600 dark:text-red-400" title={st.error}>
                                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                <span className="max-w-56 truncate">{st.error}</span>
                              </span>
                            ) : st.status === "running" ? (
                              <Loader2 className="h-4 w-4 animate-spin text-amber-600" aria-label="En cours" />
                            ) : (
                              <span className="text-xs text-muted-foreground">à importer</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}

          {headerError ? (
            <p className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden /> {headerError}
            </p>
          ) : null}

          {applied + failed > 0 && (
            <p className="text-xs text-muted-foreground">
              Résultat : <span className="font-semibold text-emerald-700 dark:text-emerald-400">{applied} importée(s)</span>
              {" · "}
              <span className="font-semibold text-red-600 dark:text-red-400">{failed} échec(s)</span>
              {" · "}
              {validRows.length} ligne(s) valide(s)
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button disabled={busy || validRows.length === 0} onClick={() => void runImport()} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Importer {validRows.length > 0 ? `(${validRows.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
