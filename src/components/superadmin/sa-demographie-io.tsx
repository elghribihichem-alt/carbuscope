'use client'

// Super Administration — Module Démographie (T37/T45) : barre import/export
// des volets Gouvernorats, Délégations et Cités. Export : JSON, CSV, XLS
// (SheetJS), XML, PDF (jsPDF+autotable), Word (.doc) — généré côté navigateur.
// Import : JSON, CSV, XLS/XLSX, XML — analysé, normalisé (alias FR), confirmé
// dans une boîte de dialogue puis appliqué via POST /api/super/demographie
// (action « import », validations serveur + audit DEMOGRAPHIE). Le
// compte-rendu détaillé par ligne ({ updated, created, warnings, errors })
// s'affiche dans la même boîte de dialogue (T45).

import { useRef, useState } from "react"
import { toast } from "sonner"
import {
  Download, FileCode, FileJson, FileSpreadsheet, FileText, FileType2, Loader2, Upload,
} from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  type ExportColumn, type ExportFormat, type ExportRow, type ImportFormat, type ParsedImport,
  EXPORT_FORMATS, IMPORT_FORMATS, exportDemographie, normalizeImportRows, parseImportFile,
} from "@/lib/demographie-io"

interface PendingImport {
  format: ImportFormat
  parsed: ParsedImport
  rows: ExportRow[]
  unknownHeaders: string[]
}

/** Compte-rendu d'import renvoyé par le serveur (T45). */
interface ImportReport {
  updated: number
  created: number
  warnings: { label: string; warning: string }[]
  errors: { label: string; error: string }[]
  skipped: string[]
}

export function DemographieIoBar({ scope, title, columns, rows, actor, onRefresh }: {
  scope: "gouvernorats" | "delegations" | "cites"
  title: string
  columns: ExportColumn[]
  rows: ExportRow[]
  actor: string
  onRefresh: () => void | Promise<void>
}) {
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const acceptRef = useRef<string>(".json,.csv,.xls,.xlsx,.xml")

  const scopeLabel = scope === "gouvernorats" ? "gouvernorats" : scope === "cites" ? "cités" : "délégations"
  const scopeTable = scope === "gouvernorats" ? "des gouvernorats" : scope === "cites" ? "des cités" : "des délégations"

  const doExport = async (format: ExportFormat) => {
    const meta = EXPORT_FORMATS.find(f => f.value === format)
    try {
      const filename = await exportDemographie({ format, scope, title, columns, rows })
      toast.success(`${meta?.label ?? format.toUpperCase()} exporté`, {
        description: `${filename} — ${rows.length} ligne(s).`,
      })
    } catch (e) {
      toast.error("Échec de l'export", { description: e instanceof Error ? e.message : "Erreur inconnue." })
    }
  }

  const pickFile = (accept: string) => {
    acceptRef.current = accept
    fileRef.current?.click()
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const parsed = await parseImportFile(file)
      const { rows: normRows, unknownHeaders } = normalizeImportRows(scope, parsed)
      if (normRows.length === 0) {
        toast.error("Aucune ligne exploitable", {
          description: "L'en-tête doit porter les colonnes attendues (Gouvernorat, Délégation, Cité, Population…).",
        })
        return
      }
      setReport(null)
      setPending({ format: parsed.format, parsed, rows: normRows, unknownHeaders })
    } catch (e) {
      toast.error("Fichier illisible", { description: e instanceof Error ? e.message : "Erreur inconnue." })
    }
  }

  const confirmImport = async () => {
    if (!pending) return
    setBusy(true)
    try {
      const r = await fetch("/api/super/demographie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", scope, format: pending.format, rows: pending.rows, actor }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || typeof j?.updated !== "number") {
        throw new Error(j?.error ?? "Échec de l'import")
      }
      const detail: ImportReport = {
        updated: j.updated,
        created: typeof j.created === "number" ? j.created : 0,
        warnings: Array.isArray(j.warnings) ? j.warnings : [],
        errors: Array.isArray(j.errors) ? j.errors : [],
        skipped: Array.isArray(j.skipped) ? j.skipped : [],
      }
      setReport(detail)
      const label = IMPORT_FORMATS.find(f => f.value === pending.format)?.label ?? pending.format.toUpperCase()
      toast.success(`Import ${label} appliqué`, {
        description: `${detail.updated} ${scopeLabel} mise(s) à jour${detail.created > 0 ? `, ${detail.created} créée(s)` : ""}${detail.warnings.length ? `, ${detail.warnings.length} avertissement(s)` : ""}${detail.errors.length ? `, ${detail.errors.length} rejetée(s)` : ""}.`,
      })
      if (detail.warnings.length > 0) {
        toast.warning(`${detail.warnings.length} avertissement(s) de cohérence`, {
          description: detail.warnings.slice(0, 2).map(w => `${w.label} — ${w.warning}`).join(" · ") + (detail.warnings.length > 2 ? " …" : ""),
        })
      }
      if (detail.errors.length > 0) {
        toast.error(`${detail.errors.length} ligne(s) rejetée(s)`, {
          description: `${detail.errors[0].label} — ${detail.errors[0].error}`,
        })
      }
      await onRefresh()
    } catch (e) {
      toast.error("Import impossible", { description: e instanceof Error ? e.message : "Erreur inconnue." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept={acceptRef.current}
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={e => {
          const file = e.target.files?.[0]
          e.target.value = "" // permet de re-sélectionner le même fichier
          void onFile(file)
        }}
      />

      <div className="flex items-center gap-2">
        {/* Export — 6 formats */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" title="Exporter le tableau (JSON, CSV, XLS, XML, PDF, Word)">
              <Download className="h-3.5 w-3.5" aria-hidden /> Exporter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Exporter {rows.length} ligne(s)</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {EXPORT_FORMATS.map(f => (
              <DropdownMenuItem key={f.value} onSelect={() => void doExport(f.value)} className="gap-2.5">
                {f.value === "json" ? <FileJson className="h-4 w-4 text-emerald-600" aria-hidden />
                  : f.value === "csv" ? <FileSpreadsheet className="h-4 w-4 text-teal-600" aria-hidden />
                  : f.value === "xls" ? <FileSpreadsheet className="h-4 w-4 text-emerald-700" aria-hidden />
                  : f.value === "xml" ? <FileCode className="h-4 w-4 text-violet-600" aria-hidden />
                  : f.value === "pdf" ? <FileText className="h-4 w-4 text-amber-600" aria-hidden />
                  : <FileType2 className="h-4 w-4 text-orange-700" aria-hidden />}
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold">{f.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{f.hint}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Import — 4 formats analysables */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" title="Importer des valeurs (JSON, CSV, XLS, XML)">
              <Upload className="h-3.5 w-3.5" aria-hidden /> Importer
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Importer des valeurs</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {IMPORT_FORMATS.map(f => (
              <DropdownMenuItem key={f.value} onSelect={() => pickFile(`.${f.ext}`)} className="gap-2.5">
                {f.value === "json" ? <FileJson className="h-4 w-4 text-emerald-600" aria-hidden />
                  : f.value === "csv" ? <FileSpreadsheet className="h-4 w-4 text-teal-600" aria-hidden />
                  : f.value === "xls" ? <FileSpreadsheet className="h-4 w-4 text-emerald-700" aria-hidden />
                  : <FileCode className="h-4 w-4 text-violet-600" aria-hidden />}
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold">{f.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{f.hint}</span>
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-[10.5px] leading-snug text-muted-foreground">
              PDF et Word sont des formats de restitution — l&apos;import accepte JSON, CSV, XLS et XML.
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Confirmation d'import — puis compte-rendu détaillé (T45) */}
      <AlertDialog open={pending !== null} onOpenChange={open => { if (!open && !busy) setPending(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-emerald-600" aria-hidden />
              {report
                ? `Import ${scopeLabel} — compte-rendu`
                : <>Importer {(IMPORT_FORMATS.find(f => f.value === pending?.format)?.label ?? "")} — {scopeLabel}</>}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2.5">
                {report ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        { label: "Mises à jour", value: report.updated, cls: "text-emerald-700 dark:text-emerald-400" },
                        { label: "Créées", value: report.created, cls: "text-teal-700 dark:text-teal-400" },
                        { label: "Avertissements", value: report.warnings.length, cls: "text-amber-700 dark:text-amber-400" },
                        { label: "Rejetées", value: report.errors.length, cls: "text-red-700 dark:text-red-400" },
                      ].map(s => (
                        <div key={s.label} className="rounded-lg border bg-muted/30 p-2.5 text-center">
                          <p className={`text-lg font-bold leading-none tabular-nums ${s.cls}`}>{s.value}</p>
                          <p className="mt-1 text-[10.5px] leading-tight text-muted-foreground">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    {report.warnings.length > 0 && (
                      <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-lg border border-amber-300/70 bg-amber-50/70 p-2.5 dark:border-amber-800 dark:bg-amber-950/40">
                        {report.warnings.map((w, i) => (
                          <p key={i} className="text-[11px] leading-snug text-amber-800 dark:text-amber-300">
                            <strong className="font-semibold">{w.label}</strong> — {w.warning}
                          </p>
                        ))}
                      </div>
                    )}
                    {report.errors.length > 0 && (
                      <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-lg border border-red-300/70 bg-red-50/70 p-2.5 dark:border-red-800 dark:bg-red-950/40">
                        {report.errors.map((e, i) => (
                          <p key={i} className="text-[11px] leading-snug text-red-800 dark:text-red-300">
                            <strong className="font-semibold">{e.label}</strong> — {e.error}
                          </p>
                        ))}
                      </div>
                    )}
                    {report.skipped.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Lignes inconnues ignorées : {report.skipped.slice(0, 4).join(" · ")}
                        {report.skipped.length > 4 ? " …" : ""}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Les lignes appliquées sont journalisées dans l&apos;audit « Démographie » ; le tableau a été rafraîchi.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <strong>{pending?.rows.length ?? 0} ligne(s)</strong> détectée(s) sur {pending?.parsed.rows.length ?? 0} dans le
                      fichier. Les valeurs renseignées remplaceront celles du tableau {scopeTable} ;
                      {scope === "cites"
                        ? " une cité inconnue sera créée, une ligne invalide sera rejetée avec message."
                        : " les lignes inconnues seront ignorées, les valeurs invalides rejetées avec message."}
                    </p>
                    {pending && pending.unknownHeaders.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Colonnes ignorées : {pending.unknownHeaders.slice(0, 6).join(" · ")}
                        {pending.unknownHeaders.length > 6 ? " …" : ""}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Chaque ligne appliquée est validée serveur (types, 0-100 %{scope !== "cites" ? ", urbain + rural = 100 %" : ""})
                      et journalisée dans l&apos;audit « Démographie ». La cohérence du parc (véhicules vs population) est
                      vérifiée : un dépassement est signalé sans bloquer la ligne.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {report ? (
              <AlertDialogAction className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setPending(null)}>
                Fermer
              </AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  disabled={busy}
                  onClick={e => { e.preventDefault(); void confirmImport() }}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                  {busy ? "Import en cours…" : `Importer ${pending?.rows.length ?? 0} ligne(s)`}
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
