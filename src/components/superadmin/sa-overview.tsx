'use client'

// Super Administration — Vue d'ensemble : KPIs SaaS, renouvellements,
// factures récentes et flux d'audit.
// T52-R1 — enrichissement prudent : bannière d'alertes proactives en tête
// (sa-overview-alertes), carte « Échéances & renouvellements » étendue aux
// factures en retard (jours de retard + pastilles de risque), courbe MRR
// 6 mois (sa-overview-mrr) et carte « Santé de la plateforme »
// (sa-overview-sante). Les 6 KPIs, les cartes factures/audit et les boutons
// de navigation interne restent strictement inchangés.

import { useEffect, useState } from "react"
import { Banknote, FileSignature, Receipt, AlertTriangle, UsersRound, Fuel, ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { KpiCard } from "@/components/shell/kpi-card"
import { fmtDT, PLAN_LABELS, INVOICE_STATUS_META, AUDIT_KIND_META, type SaasOverviewDTO, type SaasInvoiceDTO } from "@/lib/saas"
import { fmtDate, timeAgo, daysUntil } from "./sa-shared"
import { SaOverviewAlertes } from "./sa-overview-alertes"
import { SaOverviewMrr } from "./sa-overview-mrr"
import { SaOverviewSante } from "./sa-overview-sante"

/** Réponse /api/super/overview enrichie en T52-R1 (champs additifs optionnels). */
type SaasOverviewExt = SaasOverviewDTO & {
  overdueInvoices?: SaasInvoiceDTO[]
  mrrHistory?: { mois: string; mrr: number }[]
}

/** Pastille de risque d'une facture en retard (rouge au-delà de 30 j). */
function badgeRetard(jours: number): string {
  return jours >= 30
    ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
    : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
}

export function SaOverview({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [data, setData] = useState<SaasOverviewExt | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nav = (t: string) => onNavigate?.(t)

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
      <div className="space-y-4">
        <Skeleton className="h-12 rounded-lg" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    )
  }

  const { kpis } = data
  const overdue = data.overdueInvoices ?? []

  return (
    <div className="space-y-4">
      {/* Bannière d'alertes proactives (rien rendu si aucune alerte) */}
      <SaOverviewAlertes onNavigate={nav} />

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
        {/* Échéances & renouvellements (carte enrichie T52-R1) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Échéances &amp; renouvellements</span>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-teal-700 hover:text-teal-800 dark:text-teal-400"
                onClick={() => nav("contracts")}>
                Contrats <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 space-y-1.5 overflow-y-auto">
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
                      <Badge variant="outline" className={`mt-1 h-5 px-1.5 text-[10px] ${d < 0 || d <= 7 ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" : d <= 30 ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" : ""}`}>
                        {d < 0 ? `dépassé de ${Math.abs(d)} j` : `dans ${d} j`}
                      </Badge>
                    </div>
                  </div>
                )
              })}
              {data.renewals.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">Aucun renouvellement à venir.</p>
              )}

              {/* Factures en retard (T52-R1) */}
              <div className="flex items-center gap-2 pt-2 pb-0.5">
                <Receipt className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Factures en retard</p>
                {overdue.length > 0 && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] tabular-nums border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                    {overdue.length}
                  </Badge>
                )}
              </div>
              {overdue.map(inv => {
                const r = Math.abs(daysUntil(inv.dueAt))
                return (
                  <div key={inv.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r >= 30 ? "#dc2626" : "#d97706" }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs font-semibold leading-tight">{inv.number}</p>
                      <p className="truncate text-xs text-muted-foreground">{inv.brandName} · échue le {fmtDate(inv.dueAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums leading-none">{fmtDT(inv.amount)}</p>
                      <Badge variant="outline" className={`mt-1 h-5 px-1.5 text-[10px] ${badgeRetard(r)}`}>
                        retard de {r} j
                      </Badge>
                    </div>
                  </div>
                )
              })}
              {overdue.length === 0 && (
                <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                  Aucune facture en retard — portefeuille à jour.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Dernières factures */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Dernières factures</span>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-teal-700 hover:text-teal-800 dark:text-teal-400"
                onClick={() => nav("invoices")}>
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

      {/* Tendance MRR + santé de la plateforme (T52-R1) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SaOverviewMrr history={data.mrrHistory ?? []} />
        <SaOverviewSante />
      </div>

      {/* Flux d'audit */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>Activité récente de la plateforme</span>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-teal-700 hover:text-teal-800 dark:text-teal-400"
              onClick={() => nav("audit")}>
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
