'use client'

// Super Administration — Module Démographie (T37) : barre import/export des
// volets Gouvernorats et Délégations. Export : JSON, CSV, XLS (SheetJS), XML,
// PDF (jsPDF+autotable), Word (.doc) — généré côté navigateur. Import :
// JSON, CSV, XLS/XLSX, XML — analysé, normalisé (alias FR), confirmé dans une
// boîte de dialogue puis appliqué via POST /api/super/demographie (action
// « import », validations serveur + audit DEMOGRAPHIE).

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

export function DemographieIoBar({ scope, title, columns, rows, actor, onRefresh }: {
  scope: "gouvernorats" | "delegations"
  title: string
  columns: ExportColumn[]
  rows: ExportRow[]
  actor: string
  onRefresh: () => void | Promise<void>
}) {
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const acceptRef = useRef<string>(".json,.csv,.xls,.xlsx,.xml")

  const scopeLabel = scope === "gouvernorats" ? "gouvernorats" : "délégations"

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
          description: "L'en-tête doit porter les colonnes attendues (Gouvernorat, Population, Urbain…).",
        })
        return
      }
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
      const label = IMPORT_FORMATS.find(f => f.value === pending.format)?.label ?? pending.format.toUpperCase()
      toast.success(`Import ${label} appliqué`, {
        description: `${j.updated} ${scopeLabel} mise(s) à jour${j.skipped?.length ? `, ${j.skipped.length} inconnue(s)` : ""}${j.errors?.length ? `, ${j.errors.length} rejetée(s)` : ""}.`,
      })
      if (Array.isArray(j.skipped) && j.skipped.length > 0) {
        toast.warning(`${j.skipped.length} ligne(s) inconnue(s)`, {
          description: j.skipped.slice(0, 3).join(" · ") + (j.skipped.length > 3 ? " …" : ""),
        })
      }
      if (Array.isArray(j.errors) && j.errors.length > 0) {
        toast.error(`${j.errors.length} ligne(s) rejetée(s)`, {
          description: `${j.errors[0].label} — ${j.errors[0].error}`,
        })
      }
      setPending(null)
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

      {/* Confirmation d'import */}
      <AlertDialog open={pending !== null} onOpenChange={open => { if (!open && !busy) setPending(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-emerald-600" aria-hidden />
              Importer {(IMPORT_FORMATS.find(f => f.value === pending?.format)?.label ?? "")} — {scopeLabel}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2.5">
                <p>
                  <strong>{pending?.rows.length ?? 0} ligne(s)</strong> détectée(s) sur {pending?.parsed.rows.length ?? 0} dans le
                  fichier. Les valeurs renseignées remplaceront celles du tableau {scope === "gouvernorats" ? "des gouvernorats" : "des délégations"} ;
                  les lignes inconnues seront ignorées, les valeurs invalides rejetées avec message.
                </p>
                {pending && pending.unknownHeaders.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Colonnes ignorées : {pending.unknownHeaders.slice(0, 6).join(" · ")}
                    {pending.unknownHeaders.length > 6 ? " …" : ""}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Chaque ligne appliquée est validée serveur (types, 0-100 %, urbain + rural = 100 %) et
                  journalisée dans l&apos;audit « Démographie ».
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={e => { e.preventDefault(); void confirmImport() }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
              {busy ? "Import en cours…" : `Importer ${pending?.rows.length ?? 0} ligne(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
