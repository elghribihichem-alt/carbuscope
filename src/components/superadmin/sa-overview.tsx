'use client'

// Super Administration — Vue d'ensemble : KPIs SaaS, renouvellements,
// factures récentes et flux d'audit.

import { useEffect, useState } from "react"
import { Banknote, FileSignature, Receipt, AlertTriangle, UsersRound, Fuel, ArrowRight, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { KpiCard } from "@/components/shell/kpi-card"
import { fmtDT, PLAN_LABELS, INVOICE_STATUS_META, AUDIT_KIND_META, type SaasOverviewDTO } from "@/lib/saas"
import { fmtDate, timeAgo, daysUntil } from "./sa-shared"

export function SaOverview({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [data, setData] = useState<SaasOverviewDTO | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/super/overview", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch(e => { if (e.name !== "AbortError") setError("Impossible de charger les indicateurs SaaS.") })
    return () => ac.abort()
  }, [])

  if (error) {
    return <Card><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card>
  }
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    )
  }

  const { kpis } = data

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiCard
          label="MRR"
          value={fmtDT(kpis.mrr)}
          icon={Banknote}
          tone="success"
          sub={`ARR annualisé ${fmtDT(kpis.arr)}`}
        />
        <KpiCard
          label="Contrats actifs"
          value={kpis.activeContracts}
          icon={FileSignature}
          tone="info"
          sub={`${kpis.trials} essai en cours · ${kpis.suspended} suspendu`}
        />
        <KpiCard
          label="Encaissement en attente"
          value={fmtDT(kpis.unpaidTotal)}
          icon={Receipt}
          tone={kpis.invoicesOverdue > 0 ? "danger" : "warning"}
          sub={`${kpis.invoicesUnpaid} factures impayées`}
        />
        <KpiCard
          label="Factures en retard"
          value={kpis.invoicesOverdue}
          icon={AlertTriangle}
          tone={kpis.invoicesOverdue > 0 ? "danger" : "success"}
          sub={kpis.invoicesOverdue > 0 ? "Relances recommandées" : "Aucun incident"}
        />
        <KpiCard
          label="Utilisateurs actifs"
          value={kpis.activeUsers}
          icon={UsersRound}
          sub="Toutes enseignes confondues"
        />
        <KpiCard
          label="Stations gérées"
          value={kpis.stationsManaged}
          icon={Fuel}
          sub="Contrats actifs uniquement"
        />
      </div>

      {/* Grille responsive — grid-cols-1 explicite (minmax(0,1fr)) : sans base,
          la piste « auto » de la grille laissait déborder les cartes en 390 px. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Prochains renouvellements */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Prochains renouvellements</span>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-teal-700 hover:text-teal-800 dark:text-teal-400"
                onClick={() => onNavigate?.("contracts")}>
                Contrats <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {data.renewals.map(c => {
              const d = daysUntil(c.renewsAt)
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight">{c.brandName}</p>
                    <p className="text-xs text-muted-foreground">{PLAN_LABELS[c.plan] ?? c.plan} · {fmtDate(c.renewsAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums leading-none">{fmtDT(c.monthlyFee)}</p>
                    <Badge variant="outline" className={`mt-1 h-5 px-1.5 text-[10px] ${d < 0 ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" : d <= 30 ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" : ""}`}>
                      {d < 0 ? `dépassé de ${Math.abs(d)} j` : `dans ${d} j`}
                    </Badge>
                  </div>
                </div>
              )
            })}
            {data.renewals.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">Aucun renouvellement à venir.</p>
            )}
          </CardContent>
        </Card>

        {/* Dernières factures */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Dernières factures</span>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-teal-700 hover:text-teal-800 dark:text-teal-400"
                onClick={() => onNavigate?.("invoices")}>
                Facturation <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {data.recentInvoices.map(inv => {
              const meta = INVOICE_STATUS_META[inv.status]
              return (
                <div key={inv.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: inv.color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-semibold leading-tight">{inv.number}</p>
                    <p className="truncate text-xs text-muted-foreground">{inv.brandName} · émise le {fmtDate(inv.issuedAt)}</p>
                  </div>
                  <p className="text-sm font-bold tabular-nums">{fmtDT(inv.amount)}</p>
                  <Badge variant="outline" className={`shrink-0 text-[10px] ${meta?.className ?? ""}`}>
                    {meta?.label ?? inv.status}
                  </Badge>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Flux d'audit */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>Activité récente de la plateforme</span>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-teal-700 hover:text-teal-800 dark:text-teal-400"
              onClick={() => onNavigate?.("audit")}>
              Journal complet <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {data.audit.map(e => {
              const meta = AUDIT_KIND_META[e.kind]
              return (
                <li key={e.id} className="flex items-start gap-3 rounded-lg border px-3 py-2">
                  <Badge variant="outline" className={`mt-0.5 shrink-0 text-[10px] ${meta?.className ?? ""}`}>
                    {meta?.label ?? e.kind}
                  </Badge>
                  <p className="min-w-0 flex-1 text-sm leading-snug">{e.message}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground" title={`${e.actor} · ${fmtDate(e.createdAt)}`}>
                    {timeAgo(e.createdAt)}
                  </span>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
