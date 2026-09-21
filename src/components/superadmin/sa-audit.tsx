'use client'

// Super Administration — Journal d'audit : trace des actions sensibles
// (connexions, contrats, factures, comptes, prises de main, système, agent IA),
// filtrable par type et paginé côté serveur (T32 : page/pageSize, le filtre
// par type repart de la page 1).

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, ScrollText } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AUDIT_KIND_META, type SaasAuditDTO } from "@/lib/saas"
import { fmtDate, timeAgo } from "./sa-shared"

const KIND_FILTERS = ["TOUT", "AUTH", "CONTRAT", "FACTURE", "UTILISATEUR", "IMPERSONATION", "SYSTEME", "AGENT_IA", "DEMOGRAPHIE"]
const PAGE_SIZES = [8, 16, 24]

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

  // Charge une page du journal (pattern reload des autres onglets : état de
  // chargement géré dans la fonction, l'effet ne fait que déclencher).
  const fetchPage = useCallback(async (p: number, ps: number, k: string) => {
    setRefreshing(true)
    try {
      const qs = `page=${p}&pageSize=${ps}${k !== "TOUT" ? `&kind=${k}` : ""}`
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
    void fetchPage(page, pageSize, filter)
  }, [fetchPage, page, pageSize, filter])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  function changeFilter(k: string) {
    setFilter(k)
    setPage(1) // le filtre par type repart toujours de la page 1
  }

  function changePageSize(v: string) {
    setPageSize(Number(v))
    setPage(1)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ScrollText className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
          Journal d&apos;audit — actions sensibles
          <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1.5 px-2 text-xs"
            onClick={() => { void fetchPage(page, pageSize, filter) }} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            {data ? `${data.total} événement(s)` : "Chargement…"}
          </Button>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1.5 pt-1" role="group" aria-label="Filtrer par type d'action">
          {KIND_FILTERS.map(k => {
            const meta = AUDIT_KIND_META[k]
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
            <ol className="max-h-[28rem] space-y-0 overflow-y-auto" aria-label="Événements d'audit">
              {data.events.map(e => {
                const meta = AUDIT_KIND_META[e.kind]
                return (
                  <li key={e.id} className="relative border-l border-border pl-5 pb-4 last:pb-0">
                    <span
                      className="absolute left-[-5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background"
                      style={{ backgroundColor: e.kind === "AGENT_IA" ? "#0f766e" : e.kind === "DEMOGRAPHIE" ? "#be123c" : e.kind === "FACTURE" ? "#d97706" : e.kind === "IMPERSONATION" ? "#ea580c" : e.kind === "CONTRAT" ? "#059669" : e.kind === "UTILISATEUR" ? "#7c3aed" : e.kind === "AUTH" ? "#57534e" : "#a8a29e" }}
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${meta?.className ?? ""}`}>
                        {meta?.label ?? e.kind}
                      </Badge>
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
                <li className="py-6 text-center text-sm text-muted-foreground">Aucun événement pour ce filtre.</li>
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
