'use client'

// Super Administration — Facturation : encours, taux de recouvrement et
// vieillissement de l'encours (T52-R2). Vue synthétique minée du module
// historique sa-billing (KPI encaissé / en attente / en retard) et recalculée
// sur les données réelles du registre SaaS actif (/api/super/invoices) :
// composant purement présentationnel, sans fetch ni mutation.

import { useMemo } from "react"
import { Banknote, Clock, ReceiptText, TriangleAlert } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiCard } from "@/components/shell/kpi-card"
import { fmtDT, type SaasInvoiceDTO } from "@/lib/saas"
import { daysUntil } from "./sa-shared"

// ---------- Vieillissement de l'encours ----------

type BucketKey = "A_ECHOIR" | "J30" | "J60" | "J90" | "PLUS90"

const BUCKETS: { key: BucketKey; label: string; bar: string }[] = [
  { key: "A_ECHOIR", label: "À échoir (non dû)", bar: "bg-teal-500" },
  { key: "J30", label: "1–30 j de retard", bar: "bg-amber-400" },
  { key: "J60", label: "31–60 j de retard", bar: "bg-orange-500" },
  { key: "J90", label: "61–90 j de retard", bar: "bg-red-500" },
  { key: "PLUS90", label: "Plus de 90 j", bar: "bg-red-700" },
]

function bucketOf(i: SaasInvoiceDTO): BucketKey {
  if (i.status === "PAYEE") return "A_ECHOIR" // jamais comptée (filtre en amont)
  if (i.status !== "RETARD") return "A_ECHOIR" // IMPAYEE : pas encore échue
  const late = Math.max(1, Math.abs(Math.min(0, daysUntil(i.dueAt))))
  if (late <= 30) return "J30"
  if (late <= 60) return "J60"
  if (late <= 90) return "J90"
  return "PLUS90"
}

// ---------- Composant ----------

export function SaInvoicesRecap({ invoices }: { invoices: SaasInvoiceDTO[] }) {
  const stats = useMemo(() => {
    let encaisse = 0
    let encours = 0
    let retardTotal = 0
    let retardCount = 0
    let payeesCount = 0
    let nonEchu = 0
    const buckets = new Map<BucketKey, { count: number; amount: number }>()
    for (const i of invoices) {
      if (i.status === "PAYEE") {
        encaisse += i.amount
        payeesCount += 1
        continue
      }
      encours += i.amount
      if (i.status === "RETARD") {
        retardTotal += i.amount
        retardCount += 1
      } else {
        nonEchu += i.amount
      }
      const k = bucketOf(i)
      const b = buckets.get(k) ?? { count: 0, amount: 0 }
      b.count += 1
      b.amount += i.amount
      buckets.set(k, b)
    }
    const facture = encaisse + encours
    const recouvrement = facture > 0 ? Math.round((encaisse / facture) * 100) : 100
    const maxAmount = Math.max(0, ...BUCKETS.map(b => buckets.get(b.key)?.amount ?? 0))
    return { encaisse, encours, retardTotal, retardCount, payeesCount, nonEchu, facture, recouvrement, buckets, maxAmount }
  }, [invoices])

  const rows = BUCKETS.filter(b => (stats.buckets.get(b.key)?.count ?? 0) > 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Encours &amp; recouvrement</CardTitle>
        <CardDescription>
          {invoices.length} facture(s) au registre — {stats.payeesCount} encaissée(s),{" "}
          {invoices.length - stats.payeesCount} impayée(s) dont {stats.retardCount} en retard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Facturé" value={fmtDT(stats.facture)} icon={ReceiptText} tone="default"
            sub="Total du registre, tous statuts" />
          <KpiCard label="Encaissé" value={fmtDT(stats.encaisse)} icon={Banknote} tone="success"
            sub={`${stats.payeesCount} facture(s) réglée(s)`} />
          <KpiCard label="Encours impayé" value={fmtDT(stats.encours)} icon={Clock} tone="warning"
            sub={`dont ${fmtDT(stats.nonEchu)} à échoir`} />
          <KpiCard label="En retard" value={stats.retardCount > 0 ? fmtDT(stats.retardTotal) : "0 DT"}
            icon={TriangleAlert} tone={stats.retardCount > 0 ? "danger" : "default"}
            sub={stats.retardCount > 0 ? `${stats.retardCount} facture(s) à relancer` : "aucun retard"} />
        </div>

        {/* Taux de recouvrement */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Taux de recouvrement</p>
            <p className="text-sm font-bold tabular-nums">{stats.recouvrement} %</p>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={stats.recouvrement}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Taux de recouvrement des factures"
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${stats.recouvrement}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {fmtDT(stats.encaisse)} encaissés sur {fmtDT(stats.facture)} facturés.
          </p>
        </div>

        {/* Vieillissement de l'encours */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Vieillissement de l&apos;encours
          </p>
          {stats.encours === 0 ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
              Aucun encours — toutes les factures du registre sont encaissées.
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map(b => {
                const d = stats.buckets.get(b.key)!
                const pct = stats.maxAmount > 0 ? Math.max(4, Math.round((d.amount / stats.maxAmount) * 100)) : 0
                return (
                  <li
                    key={b.key}
                    className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 sm:grid-cols-[9rem_1fr_auto]"
                    aria-label={`${b.label} : ${d.count} facture(s), ${fmtDT(d.amount)}`}
                  >
                    <p className="truncate text-xs font-medium">{b.label}</p>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${b.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">{d.count}</span>{" "}
                      facture(s) · {fmtDT(d.amount)}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
