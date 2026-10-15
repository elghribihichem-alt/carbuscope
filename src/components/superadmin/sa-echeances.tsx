'use client'

// T48-a — Super Administration · Échéances & relances (menu Commercial).
// Deux onglets Tabs (patron multi-pages demandé par l'utilisateur) :
//   ① « Renouvellements de contrats » — saasContract.renewsAt des contrats
//      ACTIF/ESSAI, jours restants et tarif mensuel ;
//   ② « Factures en retard » — saasInvoice au statut effectif RETARD avec
//      bouton « Relancer » (PATCH /api/super/echeances?id=… — même logique
//      que la relance groupée : compteur +1, date de relance, audit FACTURE).
// KPIs : renouvellements à 30 jours, factures en retard, montant en retard.

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle, Banknote, Bell, CalendarRange, Loader2, RefreshCw,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { KpiCard } from "@/components/shell/kpi-card"
import { PLAN_LABELS, fmtDT } from "@/lib/saas"
import { fmtDate, timeAgo } from "./sa-shared"

// ---------------------------------------------------------------- DTO locaux

interface RenewalRow {
  id: string
  brandSlug: string
  brandName: string
  plan: string
  status: string
  renewsAt: string
  daysLeft: number
  monthlyFee: number
}

interface OverdueRow {
  id: string
  invoiceNumber: string
  brandName: string
  brandSlug: string
  color: string
  amountTnd: number
  dueAt: string
  daysLate: number
  reminderCount: number
  lastReminderAt: string | null
}

interface EcheancesData {
  renewals: RenewalRow[]
  overdue: OverdueRow[]
  stats: { renewals30: number; overdueCount: number; overdueAmount: number }
}

/** Badge « dans X j » d'un renouvellement (teinte selon l'imminence). */
function RenewalCountdown({ daysLeft }: { daysLeft: number }) {
  const cls = daysLeft < 0
    ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
    : daysLeft <= 7
      ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
      : daysLeft <= 30
        ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
  return (
    <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${cls}`}>
      {daysLeft < 0 ? `dépassé de ${Math.abs(daysLeft)} j` : daysLeft === 0 ? "aujourd'hui" : `dans ${daysLeft} j`}
    </Badge>
  )
}

// ---------------------------------------------------------------- Onglet

export function SaEcheances() {
  const [data, setData] = useState<EcheancesData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setRefreshing(true)
    try {
      const r = await fetch("/api/super/echeances")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = (await r.json()) as EcheancesData
      setData(d)
      setError(null)
    } catch {
      setError("Impossible de calculer les échéances du portefeuille.")
      toast.error("Impossible de calculer les échéances du portefeuille.")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  /** Relance unitaire d'une facture en retard (pattern relance-all). */
  const relancer = useCallback(async (row: OverdueRow) => {
    if (busyId) return
    setBusyId(row.id)
    try {
      const r = await fetch(`/api/super/echeances?id=${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "relancer" }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error ?? `Erreur ${r.status}`)
      toast.success(`Relance envoyée : ${row.invoiceNumber}`, {
        description: `${row.brandName} — ${fmtDT(row.amountTnd)} impayés (relance n° ${j?.invoice?.reminderCount ?? row.reminderCount + 1}).`,
      })
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la relance.")
    } finally {
      setBusyId(null)
    }
  }, [busyId, reload])

  // ---- Colonnes : renouvellements de contrats
  const renewalColumns = useMemo<DataViewColumn<RenewalRow>[]>(() => [
    {
      key: "brand",
      header: "Enseigne",
      render: r => (
        <div className="flex items-center gap-2">
          <span className="font-semibold">{r.brandName}</span>
          <Badge variant="outline" className="text-[10px]">{PLAN_LABELS[r.plan] ?? r.plan}</Badge>
          {r.status === "ESSAI" && (
            <Badge variant="outline" className="text-[10px] border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300">
              Fin d&apos;essai
            </Badge>
          )}
        </div>
      ),
      sortValue: r => r.brandName,
    },
    {
      key: "renewsAt",
      header: "Échéance",
      render: r => <span className="text-sm">{fmtDate(r.renewsAt)}</span>,
      sortValue: r => new Date(r.renewsAt).getTime(),
    },
    {
      key: "daysLeft",
      header: "Compte à rebours",
      align: "center",
      render: r => <RenewalCountdown daysLeft={r.daysLeft} />,
      sortValue: r => r.daysLeft,
      cardLabel: "Échéance",
    },
    {
      key: "fee",
      header: "Tarif mensuel",
      align: "right",
      render: r => (
        r.monthlyFee > 0
          ? <span className="font-semibold tabular-nums">{fmtDT(r.monthlyFee)}<span className="text-muted-foreground">/mois</span></span>
          : <span className="text-muted-foreground">— (essai)</span>
      ),
      sortValue: r => r.monthlyFee,
    },
  ], [])

  // ---- Colonnes : factures en retard
  const overdueColumns = useMemo<DataViewColumn<OverdueRow>[]>(() => [
    {
      key: "invoice",
      header: "Facture",
      render: o => (
        <span className="flex items-center gap-2 font-semibold tabular-nums">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.color }} aria-hidden />
          {o.invoiceNumber}
        </span>
      ),
      sortValue: o => o.invoiceNumber,
    },
    {
      key: "brand",
      header: "Enseigne",
      render: o => <span className="text-sm font-medium">{o.brandName}</span>,
      sortValue: o => o.brandName,
    },
    {
      key: "amount",
      header: "Montant",
      align: "right",
      render: o => <span className="font-semibold tabular-nums">{fmtDT(o.amountTnd)}</span>,
      sortValue: o => o.amountTnd,
    },
    {
      key: "dueAt",
      header: "Échéance",
      render: o => <span className="text-sm">{fmtDate(o.dueAt)}</span>,
      sortValue: o => new Date(o.dueAt).getTime(),
    },
    {
      key: "daysLate",
      header: "Retard",
      align: "center",
      render: o => (
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {o.daysLate === 0 ? "aujourd'hui" : `${o.daysLate} j de retard`}
        </Badge>
      ),
      sortValue: o => o.daysLate,
      cardLabel: "Retard",
    },
    {
      key: "reminders",
      header: "Relances",
      align: "center",
      render: o => (
        <div className="text-xs">
          <p className="font-semibold tabular-nums">{o.reminderCount}</p>
          {o.lastReminderAt && <p className="text-[10px] text-muted-foreground">{timeAgo(o.lastReminderAt)}</p>}
        </div>
      ),
      sortValue: o => o.reminderCount,
      hideInCards: true,
    },
    {
      key: "actions",
      header: "Actions",
      align: "center",
      sortDisabled: true,
      render: o => {
        if (busyId === o.id) {
          return <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" aria-label="Relance en cours…" />
        }
        return (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 border-amber-300 px-2 text-xs text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
            onClick={() => relancer(o)}
            aria-label={`Relancer la facture ${o.invoiceNumber} de ${o.brandName}`}
            title="Envoyer une relance (compteur +1, audit FACTURE)"
          >
            <Bell className="h-3.5 w-3.5" aria-hidden /> Relancer
          </Button>
        )
      },
    },
  ], [busyId, relancer])

  if (error) {
    return <Card><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card>
  }
  if (!data) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calcul des échéances du portefeuille…
        </CardContent>
      </Card>
    )
  }

  const stats = data.stats

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Renouvellements à 30 j"
          value={stats.renewals30}
          icon={CalendarRange}
          tone={stats.renewals30 > 0 ? "warning" : "success"}
          sub={stats.renewals30 > 0 ? "Contrats à préparer (essais inclus)" : "Aucune échéance imminente"}
        />
        <KpiCard
          label="Factures en retard"
          value={stats.overdueCount}
          icon={AlertTriangle}
          tone={stats.overdueCount > 0 ? "danger" : "success"}
          sub={stats.overdueCount > 0 ? "Relances recommandées" : "Aucun retard"}
        />
        <KpiCard
          label="Montant en retard"
          value={fmtDT(stats.overdueAmount)}
          icon={Banknote}
          tone={stats.overdueAmount > 0 ? "danger" : "success"}
          sub="Encaissement à sécuriser"
        />
      </div>

      {/* Bandeau d'alerte global */}
      {stats.overdueCount > 0 && (
        <Card className="border-red-300 dark:border-red-800">
          <CardContent className="flex items-center gap-2.5 p-3.5 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
            <p>
              <span className="font-semibold">Recouvrement prioritaire :</span>{" "}
              {stats.overdueCount} facture(s) dépassée(s) pour un total de {fmtDT(stats.overdueAmount)}.
              Utilisez « Relancer » facture par facture — chaque relance est journalisée (audit FACTURE).
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="renouvellements">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="renouvellements" className="gap-1.5">
              <CalendarRange className="h-3.5 w-3.5" aria-hidden />
              Renouvellements de contrats
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{data.renewals.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="retards" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              Factures en retard
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{data.overdue.length}</Badge>
            </TabsTrigger>
          </TabsList>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={reload} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden /> Actualiser
          </Button>
        </div>

        {/* ① Renouvellements */}
        <TabsContent value="renouvellements" className="mt-3">
          <DataViews<RenewalRow>
            viewKey="sa-echeances-renouvellements"
            rows={data.renewals}
            rowKey={r => r.id}
            columns={renewalColumns}
            renderCard={r => (
              <div className="space-y-2.5 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold">{r.brandName}</p>
                  <RenewalCountdown daysLeft={r.daysLeft} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <p>Plan : <span className="font-semibold text-foreground">{PLAN_LABELS[r.plan] ?? r.plan}</span></p>
                  <p className="text-right">Échéance : <span className="font-semibold text-foreground">{fmtDate(r.renewsAt)}</span></p>
                  <p className="col-span-2">Tarif : <span className="font-semibold tabular-nums text-foreground">{r.monthlyFee > 0 ? `${fmtDT(r.monthlyFee)}/mois` : "essai gratuit"}</span></p>
                </div>
              </div>
            )}
            cardColumns={2}
            maxHeightClassName="max-h-[30rem]"
            emptyMessage="Aucun renouvellement à surveiller (contrats actifs et essais)."
          />
        </TabsContent>

        {/* ② Factures en retard */}
        <TabsContent value="retards" className="mt-3">
          <DataViews<OverdueRow>
            viewKey="sa-echeances-retards"
            rows={data.overdue}
            rowKey={o => o.id}
            columns={overdueColumns}
            nested={{
              groupKey: o => o.brandName,
              groupLabel: (key, rs) => (
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{key}</span>
                  <span className="text-xs text-muted-foreground">
                    {rs.length} facture(s) · {fmtDT(rs.reduce((s, o) => s + o.amountTnd, 0))}
                  </span>
                </span>
              ),
              groupSortValue: key => key,
              defaultOpen: "all",
            }}
            renderCard={o => (
              <div className="space-y-2.5 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 truncate font-semibold tabular-nums">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.color }} aria-hidden />
                    {o.invoiceNumber}
                  </span>
                  <Badge variant="outline" className="shrink-0 h-5 px-1.5 text-[10px] border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                    {o.daysLate} j
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <p className="truncate">Enseigne : <span className="font-semibold text-foreground">{o.brandName}</span></p>
                  <p className="text-right font-semibold tabular-nums text-foreground">{fmtDT(o.amountTnd)}</p>
                  <p>Échéance : <span className="font-semibold text-foreground">{fmtDate(o.dueAt)}</span></p>
                  <p className="text-right">Relances : <span className="font-semibold text-foreground">{o.reminderCount}</span></p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-full gap-1 border-amber-300 text-xs text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
                  disabled={busyId === o.id}
                  onClick={() => relancer(o)}
                  aria-label={`Relancer la facture ${o.invoiceNumber}`}
                >
                  {busyId === o.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    : <Bell className="h-3.5 w-3.5" aria-hidden />}
                  Relancer
                </Button>
              </div>
            )}
            cardColumns={2}
            maxHeightClassName="max-h-[30rem]"
            emptyMessage="Aucune facture en retard — encaissement à jour."
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
