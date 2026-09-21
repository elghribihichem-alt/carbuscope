'use client'

// Super Administration — Journal d'audit : trace des actions sensibles
// (connexions, contrats, factures, comptes, prises de main, système),
// filtrable par type.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, RefreshCw, ScrollText } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AUDIT_KIND_META, type SaasAuditDTO } from "@/lib/saas"
import { fmtDate, timeAgo } from "./sa-shared"

const KIND_FILTERS = ["TOUT", "AUTH", "CONTRAT", "FACTURE", "UTILISATEUR", "IMPERSONATION", "SYSTEME"]

export function SaAudit() {
  const [events, setEvents] = useState<SaasAuditDTO[] | null>(null)
  const [filter, setFilter] = useState("TOUT")
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setRefreshing(true)
    try {
      const r = await fetch("/api/super/audit?limit=120")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      setEvents(j.events)
      setError(null)
    } catch {
      setError("Impossible de charger le journal d'audit.")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const counts = useMemo(() => {
    const c: Record<string, number> = { TOUT: events?.length ?? 0 }
    events?.forEach(e => { c[e.kind] = (c[e.kind] ?? 0) + 1 })
    return c
  }, [events])

  const rows = useMemo(
    () => (events ?? []).filter(e => filter === "TOUT" || e.kind === filter),
    [events, filter]
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ScrollText className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
          Journal d&apos;audit — actions sensibles
          <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1.5 px-2 text-xs"
            onClick={reload} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            {events ? `${rows.length} / ${events.length} événement(s)` : "Chargement…"}
          </Button>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1.5 pt-1" role="group" aria-label="Filtrer par type d'action">
          {KIND_FILTERS.map(k => {
            const meta = AUDIT_KIND_META[k]
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === k
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-border bg-background text-muted-foreground hover:border-teal-400 hover:text-foreground"
                }`}
                aria-pressed={filter === k}
              >
                {k === "TOUT" ? "Tout" : meta?.label ?? k} <span className="opacity-70">({counts[k] ?? 0})</span>
              </button>
            )
          })}
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!events && !error && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement du journal…
          </p>
        )}
        {events && (
          <ol className="max-h-[28rem] space-y-0 overflow-y-auto" aria-label="Événements d'audit">
            {rows.map(e => {
              const meta = AUDIT_KIND_META[e.kind]
              return (
                <li key={e.id} className="relative border-l border-border pl-5 pb-4 last:pb-0">
                  <span
                    className="absolute left-[-5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background"
                    style={{ backgroundColor: e.kind === "FACTURE" ? "#d97706" : e.kind === "IMPERSONATION" ? "#ea580c" : e.kind === "CONTRAT" ? "#059669" : e.kind === "UTILISATEUR" ? "#7c3aed" : e.kind === "AUTH" ? "#57534e" : "#a8a29e" }}
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
            {rows.length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">Aucun événement pour ce filtre.</li>
            )}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
