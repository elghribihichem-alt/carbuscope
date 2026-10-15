'use client'

// T55-C-a — Hubs > Services > Conversions : registre réel des orientations
// TMP → station classique. KPIs (total, converties, taux, CA attribué),
// entonnoir proportionnel ORIENTE → CONVERTI / PERDU, filtres statut (chips)
// + hub, table enrichie (véhicule, hub d'origine, station, valeur) et
// ACTIONS : qualification d'une orientation (« Converti » avec valeur DT
// modifiable, « Perdu ») via PATCH /api/hubs/conversions — session requise,
// audit HUBS/CONVERSION_STATUS, toast + rechargement, Loader2 pendant l'appel.
// Le statut (chips) filtre la table côté client (≤ 120 lignes) : les KPIs et
// l'entonnoir restent toujours calculés sur le périmètre hub/enseigne complet.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import { toast } from "sonner"
import { useAppStore } from "@/store/app-store"
import { ArrowRightLeft, Banknote, CheckCircle2, Download, Gauge, Loader2, TrendingUp, XCircle } from "lucide-react"
import { useHubs } from "./hubs-shared"
import { SectionHeader } from "@/components/radar/radar-shared"
import { dateFr, decFr } from "./hubs-services-registry"

// ---------- Types (contrat /api/hubs/conversions) ----------
export interface ConversionRow {
  id: string
  stationCode: string | null
  detail: string
  status: string
  valueDt: number
  createdAt: string
  vehicle: { plate: string; brand: string; model: string | null }
  hub: { code: string; name: string; gouvernorat: string } | null
}

export interface ConversionsResponse {
  conversions: ConversionRow[]
  meta: {
    total: number
    funnel: { ORIENTE: number; CONVERTI: number; PERDU: number }
    valueTotal: number
    valueConverted: number
    conversionRatePct: number
  }
  filters: { brand: string | null; hubId: string | null; status: string | null }
}

// ---------- Statuts ----------
const STATUS_META: Record<string, { label: string; badge: string; block: string; dot: string }> = {
  ORIENTE: {
    label: "Orienté",
    badge: "border-stone-300 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300",
    block: "bg-stone-200 dark:bg-stone-800",
    dot: "#a8a29e",
  },
  CONVERTI: {
    label: "Converti",
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    block: "bg-emerald-500",
    dot: "#059669",
  },
  PERDU: {
    label: "Perdu",
    badge: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
    block: "bg-red-500",
    dot: "#dc2626",
  },
}

const money = (v: number) => `${num(v)} DT`

// ---------- Hook local ----------
export function useConversions(params: { brand: string | null; hubId: string | null }) {
  const [data, setData] = useState<ConversionsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])
  useEffect(() => {
    let alive = true
    const qs = new URLSearchParams()
    if (params.brand) qs.set("brand", params.brand)
    if (params.hubId) qs.set("hubId", params.hubId)
    fetch(`/api/hubs/conversions?${qs.toString()}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ConversionsResponse) => { if (alive) { setData(d); setError(null) } })
      .catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [params.brand, params.hubId, reloadKey])
  return { data, error, reload }
}

// ---------- Export CSV (pattern T5b) ----------
function exportConversionsCsv(rows: ConversionRow[], scope: string) {
  if (rows.length === 0) {
    toast.info("Rien à exporter", { description: "Aucune conversion ne correspond aux filtres actuels." })
    return
  }
  const esc = (s: string) => `"${s.replaceAll('"', '""')}"`
  const header = ["Date", "Véhicule", "Hub d'origine", "Station destination", "Détail", "Statut", "Valeur (DT)"]
  const lines = rows.map(c =>
    [
      dateFr(c.createdAt),
      c.vehicle.plate,
      c.hub ? `${c.hub.code} — ${c.hub.name}` : "—",
      c.stationCode ?? "—",
      c.detail,
      STATUS_META[c.status]?.label ?? c.status,
      decFr(c.valueDt),
    ].map(esc).join(";"),
  )
  const csv = "\uFEFF" + [header.join(";"), ...lines].join("\r\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `carbuscope-conversions-${scope}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  toast.success("Registre exporté", { description: `${num(rows.length)} conversions filtrées (${scope}) — CSV UTF-8, séparateur « ; ».` })
}

/* ================================================================== */
/*  Onglet « conversions »                                             */
/* ================================================================== */
export function HubsServicesConversions() {
  const brandSlug = useAppStore(s => s.brandSlug)
  const [hubId, setHubId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const { data, error, reload } = useConversions({ brand: brandSlug, hubId })
  const { data: hubsData } = useHubs(brandSlug)

  // Qualification en cours (PATCH) : id de la conversion, null sinon.
  const [pending, setPending] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ conversion: ConversionRow; target: "CONVERTI" | "PERDU" } | null>(null)
  const [valueDt, setValueDt] = useState("0")

  // Filtre statut appliqué côté client (KPIs/entonnoir = périmètre complet).
  const rows = useMemo(() => {
    if (!data) return []
    return statusFilter ? data.conversions.filter(c => c.status === statusFilter) : data.conversions
  }, [data, statusFilter])

  const scopeLabel = hubId ? (hubsData?.hubs.find(h => h.id === hubId)?.code ?? "hub") : (brandSlug ?? "national")

  if (error && !data) return <div className="p-1"><ErrorState message={`Registre des conversions indisponible (${error}).`} retry={reload} /></div>
  if (!data) return <TabSkeleton title="Chargement du registre des conversions…" />

  const m = data.meta
  const funnelTotal = Math.max(1, m.funnel.ORIENTE + m.funnel.CONVERTI + m.funnel.PERDU)

  /* ---------- PATCH : qualification d'une orientation ---------- */
  const submitQualification = async () => {
    if (!confirm) return
    const { conversion, target } = confirm
    setPending(conversion.id)
    try {
      const res = await fetch("/api/hubs/conversions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: conversion.id,
          status: target,
          valueDt: target === "CONVERTI" ? Number(valueDt.replace(",", ".")) || 0 : undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      toast.success(
        target === "CONVERTI" ? "Conversion confirmée" : "Orientation classée perdue",
        {
          description: target === "CONVERTI"
            ? `${conversion.vehicle.plate} · ${conversion.detail} — ${money(Number(valueDt.replace(",", ".")) || 0)} attribués à la station.`
            : `${conversion.vehicle.plate} · ${conversion.detail} — le client n'a pas donné suite.`,
        },
      )
      setConfirm(null)
      reload()
    } catch (e) {
      toast.error("Qualification impossible", { description: e instanceof Error ? e.message : "Réessayez." })
    } finally {
      setPending(null)
    }
  }

  /* ---------- Colonnes ---------- */
  const columns: DataViewColumn<ConversionRow>[] = [
    {
      key: "date", header: "Date", sortValue: c => c.createdAt,
      render: c => <span className="whitespace-nowrap text-xs tabular-nums">{dateFr(c.createdAt)}</span>,
    },
    {
      key: "vehicle", header: "Véhicule", sortValue: c => c.vehicle.plate,
      render: c => (
        <div className="min-w-0">
          <p className="font-medium tabular-nums">{c.vehicle.plate}</p>
          <p className="truncate text-[11px] text-muted-foreground">{c.vehicle.brand}{c.vehicle.model ? ` ${c.vehicle.model}` : ""}</p>
        </div>
      ),
    },
    {
      key: "hub", header: "Hub d'origine", sortValue: c => c.hub?.code ?? "",
      render: c => c.hub ? (
        <div className="min-w-0">
          <p className="font-medium tabular-nums">{c.hub.code}</p>
          <p className="truncate text-[11px] text-muted-foreground">{c.hub.gouvernorat}</p>
        </div>
      ) : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      key: "station", header: "Station destination", sortValue: c => c.stationCode ?? "",
      render: c => c.stationCode
        ? <span className="font-medium tabular-nums text-xs">{c.stationCode}</span>
        : <span className="text-xs text-muted-foreground">non affectée</span>,
    },
    {
      key: "detail", header: "Détail", sortValue: c => c.detail,
      render: c => <span className="text-xs leading-snug">{c.detail}</span>,
    },
    {
      key: "status", header: "Statut", sortValue: c => c.status,
      render: c => <Badge variant="outline" className={STATUS_META[c.status]?.badge ?? ""}>{STATUS_META[c.status]?.label ?? c.status}</Badge>,
    },
    {
      key: "value", header: "Valeur", align: "right", sortValue: c => c.valueDt, hideInCards: true,
      render: c => <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{c.valueDt > 0 ? money(c.valueDt) : "—"}</span>,
    },
    {
      key: "actions", header: "Actions", sortValue: c => c.status, hideInCards: true,
      render: c => c.status === "ORIENTE" ? (
        <div className="flex items-center gap-1.5">
          <Button
            type="button" variant="outline" size="sm"
            className="min-h-9 gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
            disabled={pending !== null}
            onClick={e => {
              e.stopPropagation()
              setValueDt(String(c.valueDt || 0))
              setConfirm({ conversion: c, target: "CONVERTI" })
            }}
          >
            {pending === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
            Converti
          </Button>
          <Button
            type="button" variant="outline" size="sm"
            className="min-h-9 gap-1 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            disabled={pending !== null}
            onClick={e => {
              e.stopPropagation()
              setConfirm({ conversion: c, target: "PERDU" })
            }}
          >
            {pending === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}
            Perdu
          </Button>
        </div>
      ) : (
        <span className="text-[11px] text-muted-foreground">{c.status === "CONVERTI" ? "qualifiée" : "clôturée"}</span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Conversions vers les stations"
        description="Le KPI central du module : chaque client diagnostiqué au TMP et orienté vers une station classique du réseau, suivi jusqu'à conversion — traçabilité hub → station, valeur attribuée et qualification par l'enseigne."
        icon={ArrowRightLeft}
        badge="Registre réel"
      />

      {/* KPIs — périmètre hub/enseigne complet (indépendants des chips statut) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Orientations" value={num(m.total)} sub="clients TMP orientés vers une station" icon={ArrowRightLeft} />
        <KpiCard label="Converties" value={num(m.funnel.CONVERTI)} sub={`${num(m.funnel.ORIENTE)} en attente · ${num(m.funnel.PERDU)} perdues`} icon={CheckCircle2} tone="success" />
        <KpiCard label="Taux de conversion" value={`${String(m.conversionRatePct).replace(".", ",")} %`} sub="converties / orientations totales" icon={Gauge} tone="warning" />
        <KpiCard label="CA attribué" value={money(m.valueConverted)} sub="chiffre d'affaires stations d'origine TMP" icon={Banknote} tone="success" />
      </div>

      {/* Entonnoir proportionnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Entonnoir de conversion</CardTitle>
          <CardDescription>
            Trois blocs proportionnels au volume réel — la largeur suit le nombre d&apos;orientations de chaque statut.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-11 flex-wrap overflow-hidden rounded-lg border" role="img" aria-label={`Entonnoir : ${m.funnel.ORIENTE} orientées, ${m.funnel.CONVERTI} converties, ${m.funnel.PERDU} perdues`}>
            {(["ORIENTE", "CONVERTI", "PERDU"] as const).map(s => {
              const count = m.funnel[s]
              const share = Math.round((count / funnelTotal) * 100)
              const meta = STATUS_META[s]
              return (
                <div
                  key={s}
                  className="flex min-w-[7rem] flex-col justify-center gap-0.5 px-3 py-2 text-white/95"
                  style={{ flexGrow: Math.max(count, 1), backgroundColor: meta.dot }}
                >
                  <p className="flex items-baseline gap-1.5 text-xs font-bold uppercase tracking-wide">
                    {meta.label}
                    <span className="text-base tabular-nums">{num(count)}</span>
                    <span className="font-normal opacity-80 tabular-nums">{share} %</span>
                  </p>
                  {s === "CONVERTI" && <p className="text-[11px] opacity-85 tabular-nums">{money(m.valueConverted)} attribués</p>}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Les orientations encore « ORIENTE » sont à qualifier par l&apos;enseigne (boutons du registre) — la valeur
            n&apos;est figée qu&apos;au passage à « CONVERTI ».
          </p>
        </CardContent>
      </Card>

      {/* Filtres : statut (chips) + hub */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par statut">
            <button
              type="button"
              onClick={() => setStatusFilter(null)}
              className={`min-h-11 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${statusFilter === null ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "border-border bg-background hover:bg-muted"}`}
            >
              Tous ({num(m.total)})
            </button>
            {(Object.keys(STATUS_META) as string[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                className={`min-h-11 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${statusFilter === s ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "border-border bg-background hover:bg-muted"}`}
              >
                {STATUS_META[s].label} ({num(m.funnel[s as keyof typeof m.funnel])})
              </button>
            ))}
          </div>
          <Select value={hubId ?? "all"} onValueChange={v => setHubId(v === "all" ? null : v)}>
            <SelectTrigger className="min-h-11 w-full sm:w-64" aria-label="Filtrer par micro-hub">
              <SelectValue placeholder="Tous les TMP" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="min-h-11">Tous les TMP ({num(hubsData?.hubs.length ?? 0)})</SelectItem>
              {hubsData?.hubs.map(h => (
                <SelectItem key={h.id} value={h.id} className="min-h-11">
                  {h.code} — {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Registre des conversions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Registre des orientations</CardTitle>
          <CardDescription>
            {num(rows.length)} conversions affichées (sur {num(m.total)} du périmètre) · les orientations en attente
            peuvent être qualifiées (« Converti » avec valeur DT, ou « Perdu ») — action auditée.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey="hubs-services-conversions"
            columns={columns}
            rows={rows}
            rowKey={c => c.id}
            emptyMessage="Aucune conversion ne correspond aux filtres."
            maxHeightClassName="max-h-[26rem]"
            sortDisabled
            toolbarExtra={
              <Button type="button" variant="outline" className="min-h-11 gap-1.5" onClick={() => exportConversionsCsv(rows, scopeLabel)}>
                <Download className="h-4 w-4" aria-hidden />
                Export CSV
              </Button>
            }
            renderCard={c => (
              <Card className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setConfirm(c.status === "ORIENTE" ? { conversion: c, target: "CONVERTI" } : null)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold tabular-nums">{c.vehicle.plate}</p>
                      <p className="text-[11px] text-muted-foreground">{c.hub?.code ?? "—"} → {c.stationCode ?? "station non affectée"}</p>
                    </div>
                    <Badge variant="outline" className={`shrink-0 ${STATUS_META[c.status]?.badge ?? ""}`}>{STATUS_META[c.status]?.label ?? c.status}</Badge>
                  </div>
                  <p className="mt-2 text-xs">{c.detail}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">{dateFr(c.createdAt)}</span>
                    <span className="font-semibold tabular-nums text-foreground">{c.valueDt > 0 ? money(c.valueDt) : "—"}</span>
                  </div>
                  {c.status === "ORIENTE" && (
                    <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                      Cliquez pour qualifier cette orientation…
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          />
        </CardContent>
      </Card>

      {/* Dialogue de confirmation (valeur DT modifiable pour « Converti ») */}
      <Dialog open={confirm !== null} onOpenChange={o => { if (!o && pending === null) setConfirm(null) }}>
        <DialogContent className="sm:max-w-md">
          {confirm && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  {confirm.target === "CONVERTI" ? (
                    <><CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden /> Confirmer la conversion</>
                  ) : (
                    <><XCircle className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden /> Classer l&apos;orientation « perdue »</>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {confirm.conversion.vehicle.plate} ({confirm.conversion.vehicle.brand}) ·{" "}
                  {confirm.conversion.hub ? `${confirm.conversion.hub.code} → ` : ""}
                  {confirm.conversion.stationCode ?? "station non affectée"} · {confirm.conversion.detail}
                </DialogDescription>
              </DialogHeader>

              {confirm.target === "CONVERTI" && (
                <div className="space-y-2">
                  <Label htmlFor="conv-value" className="text-xs">
                    CA attribué à la station (DT)
                  </Label>
                  <Input
                    id="conv-value"
                    type="number" min={0} step="0.5" inputMode="decimal"
                    value={valueDt}
                    onChange={e => setValueDt(e.target.value)}
                    className="min-h-11 tabular-nums"
                    disabled={pending !== null}
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Valeur saisie par l&apos;enseigne (facture station) — elle fige le CA attribué de cette conversion
                    et alimente l&apos;entonnoir. Laisser 0 équivaut à une conversion non chiffrée.
                  </p>
                </div>
              )}
              {confirm.target === "PERDU" && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Le client n&apos;a pas donné suite à l&apos;orientation : la conversion passe au statut « PERDU »
                  (définitif, traçable dans l&apos;audit). La valeur attribuée est remise à zéro.
                </p>
              )}

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirm(null)} disabled={pending !== null}>
                  Annuler
                </Button>
                <Button
                  type="button"
                  className={`min-h-11 gap-1.5 ${confirm.target === "CONVERTI" ? "" : "border-red-300 bg-red-600 text-white hover:bg-red-700"}`}
                  onClick={() => void submitQualification()}
                  disabled={pending !== null}
                >
                  {pending !== null && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {confirm.target === "CONVERTI" ? "Confirmer la conversion" : "Confirmer la perte"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
