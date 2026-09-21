'use client'

// Super Administration — Facturation : registre des factures SaaS avec filtres
// de statut et encaissement (marque PAYEE, journalisé en audit).

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Banknote, Loader2, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { useAppStore } from "@/store/app-store"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"
import { fmtDT, INVOICE_STATUS_META, type SaasInvoiceDTO } from "@/lib/saas"
import { fmtDate, daysUntil } from "./sa-shared"

const FILTERS = [
  { value: "TOUTES", label: "Toutes" },
  { value: "PAYEE", label: "Payées" },
  { value: "IMPAYEE", label: "Impayées" },
  { value: "RETARD", label: "En retard" },
]

export function SaInvoices() {
  const userId = useAppStore(s => s.userId)
  const actor = userId ? DEMO_ACCOUNTS_MAP[userId]?.email ?? "system" : "system"
  const [invoices, setInvoices] = useState<SaasInvoiceDTO[] | null>(null)
  const [filter, setFilter] = useState("TOUTES")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setRefreshing(true)
    try {
      const r = await fetch("/api/super/invoices")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      setInvoices(j.invoices)
      setError(null)
    } catch {
      setError("Impossible de charger la facturation.")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const counts = useMemo(() => {
    const c: Record<string, number> = { TOUTES: invoices?.length ?? 0, PAYEE: 0, IMPAYEE: 0, RETARD: 0 }
    invoices?.forEach(i => { c[i.status] = (c[i.status] ?? 0) + 1 })
    return c
  }, [invoices])

  const rows = useMemo(
    () => (invoices ?? []).filter(i => filter === "TOUTES" || i.status === filter),
    [invoices, filter]
  )

  const filteredTotal = useMemo(() => rows.reduce((s, i) => s + i.amount, 0), [rows])

  async function markPaid(inv: SaasInvoiceDTO) {
    setBusyId(inv.id)
    try {
      const r = await fetch(`/api/super/invoices/${inv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAYEE", actor }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        throw new Error(j?.error ?? "Erreur")
      }
      toast.success(`Facture ${inv.number} encaissée`, { description: `${inv.brandName} · ${fmtDT(inv.amount)}.` })
      await reload()
    } catch (e) {
      toast.error(e instanceof Error && e.message !== "Erreur" ? e.message : "Échec de l'encaissement.")
    } finally {
      setBusyId(null)
    }
  }

  const columns = useMemo<DataViewColumn<SaasInvoiceDTO>[]>(() => [
    {
      key: "number",
      header: "Facture",
      render: i => <span className="font-mono text-xs font-semibold">{i.number}</span>,
      sortValue: i => i.number,
    },
    {
      key: "brand",
      header: "Enseigne",
      render: i => (
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: i.color }} aria-hidden />
          <span className="text-sm font-medium">{i.brandName}</span>
        </div>
      ),
      sortValue: i => i.brandName,
    },
    {
      key: "issued",
      header: "Émise le",
      render: i => <span className="text-sm">{fmtDate(i.issuedAt)}</span>,
      sortValue: i => new Date(i.issuedAt).getTime(),
      hideInCards: true,
    },
    {
      key: "due",
      header: "Échéance",
      render: i => {
        const d = daysUntil(i.dueAt)
        return (
          <div className="text-sm">
            <p>{fmtDate(i.dueAt)}</p>
            {i.status !== "PAYEE" && (
              <p className={`text-[11px] ${d < 0 ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                {d < 0 ? `retard de ${Math.abs(d)} j` : `dans ${d} j`}
              </p>
            )}
          </div>
        )
      },
      sortValue: i => new Date(i.dueAt).getTime(),
    },
    {
      key: "amount",
      header: "Montant",
      align: "right",
      render: i => <span className="tabular-nums font-bold">{fmtDT(i.amount)}</span>,
      sortValue: i => i.amount,
    },
    {
      key: "status",
      header: "Statut",
      render: i => {
        const meta = INVOICE_STATUS_META[i.status]
        return (
          <Badge variant="outline" className={`text-[10px] ${meta?.className ?? ""}`}>
            {meta?.label ?? i.status}
          </Badge>
        )
      },
      sortValue: i => i.status,
    },
    {
      key: "actions",
      header: "Encaisser",
      align: "center",
      sortDisabled: true,
      render: i => {
        if (i.status === "PAYEE") {
          return <span className="text-[11px] text-muted-foreground">{i.paidAt ? `payée le ${fmtDate(i.paidAt)}` : "—"}</span>
        }
        if (busyId === i.id) {
          return <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" aria-label="Encaissement…" />
        }
        return (
          <Button variant="outline" size="sm" className="h-7 gap-1 border-emerald-300 px-2 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
            onClick={() => markPaid(i)} aria-label={`Encaisser la facture ${i.number}`}>
            <Banknote className="h-3.5 w-3.5" aria-hidden /> Encaisser
          </Button>
        )
      },
    },
  ], [busyId, markPaid])

  if (error) {
    return <Card><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card>
  }
  if (!invoices) {
    return <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement de la facturation…</CardContent></Card>
  }

  return (
    <div className="space-y-3">
      {/* Filtres de statut */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par statut">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.value
                ? "border-teal-600 bg-teal-600 text-white"
                : "border-border bg-background text-muted-foreground hover:border-teal-400 hover:text-foreground"
            }`}
            aria-pressed={filter === f.value}
          >
            {f.label} <span className="opacity-70">({counts[f.value] ?? 0})</span>
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {rows.length} facture(s) · {fmtDT(filteredTotal)}
        </span>
      </div>

      <DataViews<SaasInvoiceDTO>
        viewKey="sa-invoices"
        rows={rows}
        rowKey={i => i.id}
        columns={columns}
        nested={{
          groupKey: i => i.status,
          groupLabel: (key, rs) => {
            const meta = INVOICE_STATUS_META[key]
            return (
              <span className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[10px] ${meta?.className ?? ""}`}>{meta?.label ?? key}</Badge>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {rs.length} · {fmtDT(rs.reduce((s, i) => s + i.amount, 0))}
                </span>
              </span>
            )
          },
          groupSortValue: key => ["RETARD", "IMPAYEE", "PAYEE"].indexOf(key),
          hideColumnKeyInGroups: "status",
          defaultOpen: "all",
        }}
        renderCard={i => (
          <div className="space-y-2.5 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold">{i.number}</span>
              {(() => { const meta = INVOICE_STATUS_META[i.status]; return (
                <Badge variant="outline" className={`shrink-0 text-[10px] ${meta?.className ?? ""}`}>{meta?.label ?? i.status}</Badge>
              ) })()}
            </div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="h-2 w-2 rounded-full" style={{ background: i.color }} aria-hidden />
              {i.brandName}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Échéance : {fmtDate(i.dueAt)}</span>
              <span className="text-sm font-bold tabular-nums text-foreground">{fmtDT(i.amount)}</span>
            </div>
            {i.status !== "PAYEE" && (
              <Button variant="outline" size="sm" className="w-full gap-1 border-emerald-300 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                onClick={() => markPaid(i)} disabled={busyId === i.id}>
                <Banknote className="h-3.5 w-3.5" aria-hidden /> Encaisser
              </Button>
            )}
          </div>
        )}
        cardColumns={3}
        maxHeightClassName="max-h-[30rem]"
        emptyMessage="Aucune facture pour ce filtre."
        toolbarExtra={
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={reload} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden /> Actualiser
          </Button>
        }
      />
    </div>
  )
}
