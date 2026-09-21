'use client'

// Super Administration — Enseignes & contrats : plans, statuts, sièges, quotas,
// renouvellements et facturation par enseigne cliente. Actions : suspension /
// réactivation (les comptes utilisateurs suivent le contrat).

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Ban, CheckCircle2, Loader2, RefreshCw, TriangleAlert } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { useAppStore } from "@/store/app-store"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"
import { fmtDT, PLAN_LABELS, CONTRACT_STATUS_META, type SaasContractDTO, type SaasUserDTO } from "@/lib/saas"
import { fmtDate, daysUntil } from "./sa-shared"

type Row = SaasContractDTO & { activeUsers: number }

export function SaContracts() {
  const userId = useAppStore(s => s.userId)
  const actor = userId ? DEMO_ACCOUNTS_MAP[userId]?.email ?? "system" : "system"
  const [contracts, setContracts] = useState<SaasContractDTO[] | null>(null)
  const [users, setUsers] = useState<SaasUserDTO[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setRefreshing(true)
    try {
      const [rc, ru] = await Promise.all([
        fetch("/api/super/contracts").then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))),
        fetch("/api/super/users").then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))),
      ])
      setContracts(rc.contracts)
      setUsers(ru.users)
      setError(null)
    } catch {
      setError("Impossible de charger les contrats.")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const rows = useMemo<Row[]>(() => {
    if (!contracts || !users) return []
    return contracts.map(c => ({
      ...c,
      activeUsers: users.filter(u => u.brandSlug === c.brandSlug && u.active).length,
    }))
  }, [contracts, users])

  async function changeStatus(c: Row, status: string) {
    setBusyId(c.id)
    try {
      const r = await fetch(`/api/super/contracts/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, actor }),
      })
      if (!r.ok) throw new Error(await r.text())
      const labels: Record<string, string> = { ACTIF: "réactivé", SUSPENDU: "suspendu", RESILIE: "résilié", ESSAI: "passé en essai" }
      toast.success(`Contrat ${c.brandName} ${labels[status] ?? status}`, {
        description: status === "SUSPENDU"
          ? "Les comptes utilisateurs de l'enseigne ont été suspendus."
          : "Les comptes utilisateurs ont été mis à jour.",
      })
      await reload()
    } catch {
      toast.error("Échec de la mise à jour du contrat.")
    } finally {
      setBusyId(null)
    }
  }

  const columns = useMemo<DataViewColumn<Row>[]>(() => [
    {
      key: "brand",
      header: "Enseigne",
      render: c => (
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
          <span className="font-semibold">{c.brandName}</span>
          <Badge variant="outline" className="text-[10px]">{PLAN_LABELS[c.plan] ?? c.plan}</Badge>
        </div>
      ),
      sortValue: c => c.brandName,
    },
    {
      key: "status",
      header: "Statut",
      render: c => {
        const meta = CONTRACT_STATUS_META[c.status]
        return (
          <Badge variant="outline" className={`text-[10px] ${meta?.className ?? ""}`}>
            {meta?.label ?? c.status}
          </Badge>
        )
      },
      sortValue: c => c.status,
    },
    {
      key: "contact",
      header: "Contact",
      render: c => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-tight">{c.contactName}</p>
          <p className="truncate text-xs text-muted-foreground">{c.contactEmail}</p>
        </div>
      ),
      sortValue: c => c.contactName,
      hideInCards: true,
    },
    {
      key: "fee",
      header: "Tarif",
      align: "right",
      render: c => (
        c.monthlyFee > 0 ? (
          <span className="tabular-nums font-semibold">
            {fmtDT(c.monthlyFee)}<span className="text-muted-foreground">/mois</span>
          </span>
        ) : <span className="text-muted-foreground">—</span>
      ),
      sortValue: c => c.monthlyFee,
    },
    {
      key: "seats",
      header: "Sièges",
      align: "center",
      render: c => (
        <span className="tabular-nums text-sm">
          <span className={c.activeUsers > c.seats ? "font-bold text-red-600" : "font-semibold"}>{c.activeUsers}</span>
          <span className="text-muted-foreground"> / {c.seats}</span>
        </span>
      ),
      sortValue: c => c.activeUsers / Math.max(1, c.seats),
      cardLabel: "Sièges actifs",
    },
    {
      key: "quota",
      header: "Stations",
      align: "center",
      render: c => (
        <span className="tabular-nums text-sm">
          <span className={c.stationCount > c.stationQuota ? "font-bold text-red-600" : "font-semibold"}>{c.stationCount}</span>
          <span className="text-muted-foreground"> / {c.stationQuota}</span>
        </span>
      ),
      sortValue: c => c.stationCount / Math.max(1, c.stationQuota),
      cardLabel: "Quota stations",
      hideInCards: true,
    },
    {
      key: "renews",
      header: "Renouvellement",
      render: c => {
        const d = daysUntil(c.renewsAt)
        return (
          <div className="text-sm">
            <p>{fmtDate(c.renewsAt)}</p>
            {c.status !== "RESILIE" && (
              <p className={`text-[11px] ${d < 0 ? "font-medium text-red-600" : d <= 30 ? "text-amber-600" : "text-muted-foreground"}`}>
                {d < 0 ? `dépassé de ${Math.abs(d)} j` : `dans ${d} j`}
              </p>
            )}
          </div>
        )
      },
      sortValue: c => new Date(c.renewsAt).getTime(),
    },
    {
      key: "billing",
      header: "Facturation",
      align: "right",
      render: c => (
        <div className="text-sm">
          <p className="tabular-nums font-semibold">{fmtDT(c.totalBilled)}</p>
          {c.unpaidCount > 0 && (
            <p className="text-[11px] font-medium text-red-600">{c.unpaidCount} impayée(s) · {fmtDT(c.unpaidTotal)}</p>
          )}
        </div>
      ),
      sortValue: c => c.unpaidTotal,
      hideInCards: true,
    },
    {
      key: "actions",
      header: "Actions",
      align: "center",
      sortDisabled: true,
      render: c => {
        if (busyId === c.id) {
          return <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" aria-label="Mise à jour…" />
        }
        return (
          <div className="flex items-center justify-center gap-1.5">
            {c.status === "SUSPENDU" ? (
              <Button variant="outline" size="sm" className="h-7 gap-1 border-emerald-300 px-2 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                onClick={() => changeStatus(c, "ACTIF")} aria-label={`Réactiver le contrat ${c.brandName}`}>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Réactiver
              </Button>
            ) : c.status !== "RESILIE" ? (
              <Button variant="outline" size="sm" className="h-7 gap-1 border-amber-300 px-2 text-xs text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
                onClick={() => changeStatus(c, "SUSPENDU")} aria-label={`Suspendre le contrat ${c.brandName}`}>
                <Ban className="h-3.5 w-3.5" aria-hidden /> Suspendre
              </Button>
            ) : null}
          </div>
        )
      },
    },
  ], [busyId, changeStatus])

  if (error) {
    return <Card><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card>
  }
  if (!contracts || !users) {
    return <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement des contrats…</CardContent></Card>
  }

  return (
    <div className="space-y-3">
      {rows.some(r => r.unpaidCount > 0 && r.status !== "SUSPENDU") && (
        <Card className="border-amber-300 dark:border-amber-800">
          <CardContent className="flex items-center gap-2.5 p-3.5 text-sm">
            <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <p>
              <span className="font-semibold">Encaissements en attente :</span>{" "}
              {rows.filter(r => r.unpaidCount > 0 && r.status !== "SUSPENDU").map(r => `${r.brandName} (${r.unpaidCount})`).join(" · ")}.
              Encaissez depuis l&apos;onglet Facturation ou suspendez le contrat.
            </p>
          </CardContent>
        </Card>
      )}

      <DataViews<Row>
        viewKey="sa-contracts"
        rows={rows}
        rowKey={r => r.id}
        columns={columns}
        nested={{
          groupKey: r => r.status,
          groupLabel: (key, rs) => {
            const meta = CONTRACT_STATUS_META[key]
            return (
              <span className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[10px] ${meta?.className ?? ""}`}>{meta?.label ?? key}</Badge>
                <span className="text-xs text-muted-foreground">{rs.length} contrat(s)</span>
              </span>
            )
          },
          groupSortValue: key => ["ACTIF", "ESSAI", "SUSPENDU", "RESILIE"].indexOf(key),
          hideColumnKeyInGroups: "status",
          defaultOpen: "all",
        }}
        renderCard={c => (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                <p className="truncate font-semibold">{c.brandName}</p>
              </div>
              {(() => { const meta = CONTRACT_STATUS_META[c.status]; return (
                <Badge variant="outline" className={`shrink-0 text-[10px] ${meta?.className ?? ""}`}>{meta?.label ?? c.status}</Badge>
              ) })()}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{PLAN_LABELS[c.plan] ?? c.plan}</span>
              <span className="font-bold tabular-nums">{c.monthlyFee > 0 ? `${fmtDT(c.monthlyFee)}/mois` : "—"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <p>Sièges : <span className="font-semibold text-foreground">{c.activeUsers}/{c.seats}</span></p>
              <p>Renouv. : <span className="font-semibold text-foreground">{fmtDate(c.renewsAt)}</span></p>
              <p>Contact : <span className="font-semibold text-foreground">{c.contactName}</span></p>
              <p>Impayé : <span className={c.unpaidCount > 0 ? "font-semibold text-red-600" : "font-semibold text-foreground"}>{c.unpaidCount > 0 ? fmtDT(c.unpaidTotal) : "—"}</span></p>
            </div>
          </div>
        )}
        cardColumns={2}
        maxHeightClassName="max-h-[30rem]"
        emptyMessage="Aucun contrat."
        toolbarExtra={
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={reload} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden /> Actualiser
          </Button>
        }
      />
    </div>
  )
}
