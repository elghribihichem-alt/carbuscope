'use client'

// Super Administration — Journal d'audit : trace des actions sensibles
// (connexions, sécurité, contrats, factures, comptes, prises de main, système,
// agent IA, démographie), filtrable par type (chips avec compteurs), cherchable
// en texte libre sur le message et l'acteur (T52-R3, exécutée côté serveur),
// paginé côté serveur (T32 : page/pageSize, le filtre par type repart de la
// page 1) et exportable en CSV (T52-R3 — pattern R2b : BOM UTF-8 + « ; »).

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Download, Loader2, RefreshCw, ScrollText, Search, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AUDIT_KIND_META, type SaasAuditDTO } from "@/lib/saas"
import { fmtDate, timeAgo } from "./sa-shared"

const KIND_FILTERS = ["TOUT", "AUTH", "SECURITE", "CONTRAT", "FACTURE", "UTILISATEUR", "IMPERSONATION", "SYSTEME", "AGENT_IA", "DEMOGRAPHIE"]
const PAGE_SIZES = [8, 16, 24, 48]

// T52-R3 — « SECURITE » est journalisé par l'ancien logAudit (sa-server.ts :
// connexions, réinitialisations 2FA) mais absent d'AUDIT_KIND_META (lib/saas.ts
// n'étant modifiable qu'en additif strict, le meta est défini localement).
const KIND_META_LOCAL: Record<string, { label: string; className: string }> = {
  SECURITE: { label: "Sécurité", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
}
const kindMeta = (k: string) => AUDIT_KIND_META[k] ?? KIND_META_LOCAL[k]

/** Pastille de timeline par type (lecture rapide, mêmes teintes que les badges). */
const KIND_DOT: Record<string, string> = {
  AGENT_IA: "#0f766e",
  DEMOGRAPHIE: "#be123c",
  FACTURE: "#d97706",
  IMPERSONATION: "#ea580c",
  CONTRAT: "#059669",
  UTILISATEUR: "#7c3aed",
  AUTH: "#57534e",
  SECURITE: "#dc2626",
  SYSTEME: "#a8a29e",
}

// ---------- Export CSV (pattern R2b : BOM UTF-8 + séparateur « ; ») ----------

function csvEscape(v: string | number): string {
  const s = String(v ?? "")
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvEscape).join(";")
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`\ufeff${content}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Collecte TOUTES les pages du filtre actif (100 par requête, garde 500 —
 *  le journal de démonstration compte quelques dizaines d'événements). */
async function fetchAllEvents(kind: string, q: string): Promise<SaasAuditDTO[]> {
  const out: SaasAuditDTO[] = []
  const MAX_PAGES = 5
  for (let p = 1; p <= MAX_PAGES; p += 1) {
    const qs = `page=${p}&pageSize=100${kind !== "TOUT" ? `&kind=${encodeURIComponent(kind)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`
    const r = await fetch(`/api/super/audit?${qs}`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j: AuditPage = await r.json()
    out.push(...j.events)
    if (out.length >= j.total) break
  }
  return out
}

interface AuditPage {
  events: SaasAuditDTO[]
  total: number
  page: number
  pageSize: number
  kindCounts: Record<string, number>
}

export function SaAudit() {
  const [data, setData] = useState<AuditPage | null>(null)
  const [filter, setFilter] = useState("TOUT")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [applied, setApplied] = useState("")
  const [exporting, setExporting] = useState(false)

  // Recherche texte débouncée (350 ms) : le setState vit dans le callback du
  // timer, jamais dans le corps de l'effet.
  useEffect(() => {
    const t = setTimeout(() => setApplied(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  // Charge une page du journal (pattern reload des autres onglets : état de
  // chargement géré dans la fonction, l'effet ne fait que déclencher).
  const fetchPage = useCallback(async (p: number, ps: number, k: string, q: string) => {
    setRefreshing(true)
    try {
      const qs = `page=${p}&pageSize=${ps}${k !== "TOUT" ? `&kind=${encodeURIComponent(k)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`
      const r = await fetch(`/api/super/audit?${qs}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j: AuditPage = await r.json()
      setData(j)
      setError(null)
      // Page au-delà de la dernière (données réduites) : recaler proprement.
      const last = Math.max(1, Math.ceil(j.total / j.pageSize))
      if (j.total > 0 && j.page > last) setPage(last)
    } catch {
      setError("Impossible de charger le journal d'audit.")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void fetchPage(page, pageSize, filter, applied)
  }, [fetchPage, page, pageSize, filter, applied])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  function changeFilter(k: string) {
    setFilter(k)
    setPage(1) // le filtre par type repart toujours de la page 1
  }

  function changePageSize(v: string) {
    setPageSize(Number(v))
    setPage(1)
  }

  /** Export CSV de TOUT le filtre actif (type + recherche), pages assemblées. */
  async function handleExport() {
    if (exporting || !data || data.total === 0) return
    setExporting(true)
    try {
      const rows = await fetchAllEvents(filter, applied)
      if (rows.length === 0) throw new Error("Aucun événement à exporter")
      const lines: string[] = [
        csvRow(["Date", "Heure", "Type", "Acteur", "Enseigne", "Message"]),
      ]
      for (const e of rows) {
        const d = new Date(e.createdAt)
        lines.push(csvRow([
          d.toLocaleDateString("fr-FR"),
          d.toLocaleTimeString("fr-FR"),
          kindMeta(e.kind)?.label ?? e.kind,
          e.actor,
          e.brandSlug ?? "",
          e.message,
        ]))
      }
      const scopeParts = [
        filter !== "TOUT" ? `type-${filter.toLowerCase()}` : "tous-types",
        applied ? `recherche-${csvEscape(applied).slice(0, 24)}` : null,
      ].filter(Boolean)
      const filename = `carbuscope-audit-${scopeParts.join("-")}-${todayStamp()}.csv`
      downloadCsv(filename, lines.join("\r\n"))
      toast.success(`Export CSV téléchargé (${rows.length} événement(s))`, {
        description: `${filename} — filtre ${filter !== "TOUT" ? kindMeta(filter)?.label?.toLowerCase() ?? filter : "tous types"}${applied ? ` · recherche « ${applied} »` : ""}.`,
      })
    } catch (e2) {
      toast.error("Échec de l'export du journal d'audit.", {
        description: e2 instanceof Error ? e2.message : "Erreur inconnue.",
      })
    } finally {
      setExporting(false)
    }
  }

  const searching = search.trim() !== ""

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ScrollText className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
          Journal d&apos;audit — actions sensibles
          <span className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => { void fetchPage(page, pageSize, filter, applied) }} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
              {data ? `${data.total} événement(s)` : "Chargement…"}
            </Button>
            <Button
              variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => { void handleExport() }}
              disabled={exporting || !data || data.total === 0}
              title={!data || data.total === 0 ? "Aucun événement à exporter" : "Exporter tout le filtre actif au format CSV (BOM UTF-8, séparateur « ; »)"}
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
              Exporter CSV
            </Button>
          </span>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1.5 pt-1" role="group" aria-label="Filtrer par type d'action">
          {KIND_FILTERS.map(k => {
            const meta = kindMeta(k)
            const count = data?.kindCounts?.[k] ?? 0
            return (
              <button
                key={k}
                onClick={() => changeFilter(k)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === k
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-border bg-background text-muted-foreground hover:border-teal-400 hover:text-foreground"
                }`}
                aria-pressed={filter === k}
              >
                {k === "TOUT" ? "Tout" : meta?.label ?? k} <span className="opacity-70">({count})</span>
              </button>
            )
          })}
        </div>
        <div className="relative pt-1.5">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher dans les messages et les acteurs…"
            className="pl-8 pr-9 text-sm"
            aria-label="Rechercher dans le journal d'audit"
            maxLength={80}
          />
          {searching && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!data && !error && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement du journal…
          </p>
        )}
        {data && (
          <>
            {searching && (
              <p className="pb-3 text-xs text-muted-foreground" aria-live="polite">
                {data.total} résultat(s) pour « {applied} »{filter !== "TOUT" ? ` · type ${kindMeta(filter)?.label ?? filter}` : ""}
                {refreshing ? " — recherche…" : ""}
              </p>
            )}
            <ol className="max-h-96 space-y-0 overflow-y-auto" aria-label="Événements d'audit">
              {data.events.map(e => {
                const meta = kindMeta(e.kind)
                return (
                  <li key={e.id} className="relative border-l border-border pl-5 pb-4 last:pb-0">
                    <span
                      className="absolute left-[-5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background"
                      style={{ backgroundColor: KIND_DOT[e.kind] ?? "#a8a29e" }}
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${meta?.className ?? ""}`}>
                        {meta?.label ?? e.kind}
                      </Badge>
                      {e.brandSlug && (
                        <Badge variant="outline" className="font-mono text-[9px] text-muted-foreground">
                          {e.brandSlug}
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground" title={fmtDate(e.createdAt)}>
                        {timeAgo(e.createdAt)}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">{e.actor}</span>
                    </div>
                    <p className="mt-1 text-sm leading-snug">{e.message}</p>
                  </li>
                )
              })}
              {data.events.length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  {searching ? "Aucun événement ne correspond à cette recherche." : "Aucun événement pour ce filtre."}
                </li>
              )}
            </ol>

            {/* Pagination (T32) */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  aria-label="Page précédente"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  aria-label="Page suivante"
                >
                  Suivant <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                Page {page} sur {totalPages} · {data.total} événement(s) au total
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground" id="sa-audit-pagesize-label">Par page</span>
                <Select value={String(pageSize)} onValueChange={changePageSize}>
                  <SelectTrigger
                    className="h-7 w-[4.5rem] text-xs"
                    aria-label="Événements par page"
                    aria-labelledby="sa-audit-pagesize-label"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map(s => (
                      <SelectItem key={s} value={String(s)} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
