'use client'

// T55-C-a — Hubs > Services > registre par type (vidanges / pneus /
// diagnostics). Gabarit partagé paramétré par type pour éviter la
// duplication : SectionHeader « registre réel », 4 KPIs (interventions sur
// la période filtrée, CA, panier moyen, durée moyenne), filtres hub/période/
// recherche, table DataViews groupable par TMP (CA par hub en tête de
// groupe), export CSV (pattern T5b : BOM UTF-8, « ; », décimales virgule),
// Sheet de détail par intervention.
// Spécificités : diagnostics → statistiques des codes défaut (parse du champ
// detail) ; pneus → top 5 dimensions vendues + CA par dimension.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { ChartContainer } from "@/components/ui/chart"
import { KpiCard } from "@/components/shell/kpi-card"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { num, tooltipStyle } from "@/lib/chart"
import { toast } from "sonner"
import { useAppStore } from "@/store/app-store"
import { Banknote, Bot, CircleDot, Clock, Download, Fuel, Search, TrendingUp, Wrench } from "lucide-react"
import { useHubs } from "./hubs-shared"
import { SectionHeader } from "@/components/radar/radar-shared"

// ---------- Types (contrat /api/hubs/interventions) ----------
export interface InterventionRow {
  id: string
  serviceType: string
  detail: string | null
  priceDt: number
  durationMin: number | null
  createdAt: string
  hub: { code: string; name: string; gouvernorat: string; brandSlug: string }
  vehicle: { plate: string; brand: string; model: string | null; km: number } | null
}

export interface InterventionsResponse {
  interventions: InterventionRow[]
  meta: {
    total: number
    caTotal: number
    panierMoyen: number
    dureeMoyenne: number
    byType: { type: string; count: number; ca: number }[]
    byHub: { code: string; name: string; count: number; ca: number }[]
  }
  filters: { brand: string | null; hubId: string | null; type: string | null; from: string | null }
}

// ---------- Métadonnées par type de service ----------
export const SERVICE_META: Record<string, { label: string; plural: string; description: string; icon: React.ComponentType<{ className?: string }>; badge: string }> = {
  VIDANGE: {
    label: "Vidange",
    plural: "Vidanges",
    description: "Chaque vidange express enregistrée en caisse TMP (huile, filtre, boîte) avec prix réel, durée et véhicule client — le service d'entrée du parc automobile.",
    icon: Fuel,
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  },
  PNEUS: {
    label: "Pneus",
    plural: "Pneus",
    description: "Ventes et montages de pneus par TMP : dimensions, quantités et chiffre d'affaires réel — les rotations les plus montées en atelier.",
    icon: CircleDot,
    badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  },
  DIAGNOSTIC: {
    label: "Diagnostic",
    plural: "Diagnostics",
    description: "Diagnostics électroniques et lectures de codes défaut par TMP : chaque rapport est un capteur direct de l'état du parc automobile tunisien.",
    icon: Bot,
    badge: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400",
  },
}

// ---------- Helpers locaux ----------
const money = (v: number) => `${num(v)} DT`
/** Décimal à la française pour l'export CSV (virgule, pas de séparateur de milliers). */
export const decFr = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",")
export const dateFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso))
const normalizeFr = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

/** Extrait le code défaut OBD (P0401…) d'un libellé de diagnostic, sinon null. */
export function parseDefectCode(detail: string): string | null {
  const m = detail.match(/\b([PCBU]\d{3,5})\b/i)
  return m ? m[1].toUpperCase() : null
}

/** Extrait une dimension de pneu (« 195/65 R15 ») d'un détail de vente. */
export function parseTireSize(detail: string): string | null {
  const m = detail.match(/(\d{3}\s*\/\s*\d{2}\s*R\s*\d{2})/i)
  return m ? m[1].replace(/\s+/g, "").toUpperCase() : null
}

/** Extrait la quantité vendue (« 2× 195/65 R15 » → 2). */
export function parseQuantity(detail: string): number {
  const m = detail.match(/(\d+)\s*[×x]/i)
  return m ? Number(m[1]) : 1
}

// ---------- Hook local ----------
export function useInterventions(params: { brand: string | null; hubId: string | null; type: string; from: string | null }) {
  const [data, setData] = useState<InterventionsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])
  useEffect(() => {
    let alive = true
    const qs = new URLSearchParams()
    if (params.brand) qs.set("brand", params.brand)
    if (params.hubId) qs.set("hubId", params.hubId)
    if (params.type) qs.set("type", params.type)
    if (params.from) qs.set("from", params.from)
    qs.set("limit", "500")
    fetch(`/api/hubs/interventions?${qs.toString()}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: InterventionsResponse) => { if (alive) { setData(d); setError(null) } })
      .catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [params.brand, params.hubId, params.type, params.from, reloadKey])
  return { data, error, reload }
}

// ---------- Export CSV (pattern T5b — veille-utils) ----------
function exportInterventionsCsv(rows: InterventionRow[], scope: string) {
  if (rows.length === 0) {
    toast.info("Rien à exporter", { description: "Aucune intervention ne correspond aux filtres actuels." })
    return
  }
  const esc = (s: string) => `"${s.replaceAll('"', '""')}"`
  const header = ["Date", "Type", "TMP", "Véhicule", "Marque", "Détail", "Prix (DT)", "Durée (min)"]
  const lines = rows.map(i =>
    [
      dateFr(i.createdAt),
      SERVICE_META[i.serviceType]?.label ?? i.serviceType,
      `${i.hub.code} — ${i.hub.name}`,
      i.vehicle?.plate ?? "—",
      i.vehicle ? `${i.vehicle.brand}${i.vehicle.model ? ` ${i.vehicle.model}` : ""}` : "—",
      i.detail ?? "",
      decFr(i.priceDt),
      i.durationMin != null ? String(i.durationMin) : "",
    ].map(esc).join(";"),
  )
  const csv = "\uFEFF" + [header.join(";"), ...lines].join("\r\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `carbuscope-interventions-${scope}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  toast.success("Registre exporté", { description: `${num(rows.length)} interventions filtrées (${scope}) — CSV UTF-8, séparateur « ; ».` })
}

// ---------- Périodes ----------
type PeriodKey = "30" | "90" | "all"
const PERIOD_META: Record<PeriodKey, { label: string; days: number | null }> = {
  "30": { label: "30 jours", days: 30 },
  "90": { label: "90 jours", days: 90 },
  all: { label: "Tout l'historique", days: null },
}
const periodFrom = (p: PeriodKey): string | null =>
  PERIOD_META[p].days ? new Date(Date.now() - PERIOD_META[p].days! * 86400000).toISOString() : null

/* ================================================================== */
/*  Registre par type de service (gabarit partagé)                     */
/* ================================================================== */
export function HubsServicesRegistry({ type }: { type: "vidanges" | "pneus" | "diagnostics" }) {
  const brandSlug = useAppStore(s => s.brandSlug)
  const serviceType = type === "vidanges" ? "VIDANGE" : type === "pneus" ? "PNEUS" : "DIAGNOSTIC"
  const meta = SERVICE_META[serviceType]

  // Filtres d'interface (le hook porte la refetch).
  const [hubId, setHubId] = useState<string | null>(null)
  const [period, setPeriod] = useState<PeriodKey>("all")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<InterventionRow | null>(null)

  const from = periodFrom(period)
  const { data, error, reload } = useInterventions({ brand: brandSlug, hubId, type: serviceType, from })
  const { data: hubsData } = useHubs(brandSlug) // hubs du périmètre enseigne (filtre)

  // Recherche locale (détail / plaque / hub) sur la page chargée (limit 500).
  const rows = useMemo(() => {
    if (!data) return []
    const q = normalizeFr(search.trim())
    if (!q) return data.interventions
    return data.interventions.filter(i =>
      normalizeFr(i.detail ?? "").includes(q) ||
      normalizeFr(i.vehicle?.plate ?? "").includes(q) ||
      normalizeFr(i.hub.name).includes(q) ||
      normalizeFr(i.hub.code).includes(q),
    )
  }, [data, search])

  // Diagnostics : regroupement des codes défaut (parse P-codes, sinon détail exact).
  const defectStats = useMemo(() => {
    if (serviceType !== "DIAGNOSTIC" || !data) return []
    const m = new Map<string, { name: string; count: number; sample: string }>()
    for (const i of data.interventions) {
      const d = i.detail ?? "—"
      const code = parseDefectCode(d)
      const key = code ?? d
      const cur = m.get(key) ?? { name: code ?? d, count: 0, sample: d }
      cur.count++
      m.set(key, cur)
    }
    return [...m.values()].sort((a, b) => b.count - a.count).slice(0, 8)
  }, [data, serviceType])

  // Pneus : regroupement par dimension (ventes + CA par dimension).
  const tireStats = useMemo(() => {
    if (serviceType !== "PNEUS" || !data) return []
    const m = new Map<string, { size: string; sales: number; count: number; ca: number }>()
    for (const i of data.interventions) {
      const d = i.detail ?? ""
      const size = parseTireSize(d) ?? (d || "—")
      const cur = m.get(size) ?? { size, sales: 0, count: 0, ca: 0 }
      cur.sales += parseQuantity(d)
      cur.count++
      cur.ca += i.priceDt
      m.set(size, cur)
    }
    return [...m.values()].sort((a, b) => b.ca - a.ca)
  }, [data, serviceType])

  const scopeLabel = hubId ? (hubsData?.hubs.find(h => h.id === hubId)?.code ?? "hub") : (brandSlug ?? "national")

  if (error && !data) return <div className="p-1"><ErrorState message={`Registre ${meta.plural.toLowerCase()} indisponible (${error}).`} retry={reload} /></div>
  if (!data) return <TabSkeleton title={`Chargement du registre ${meta.plural.toLowerCase()}…`} />

  const m = data.meta

  /* ---------- Colonnes DataViews ---------- */
  const columns: DataViewColumn<InterventionRow>[] = [
    {
      key: "date", header: "Date", sortValue: i => i.createdAt,
      render: i => <span className="whitespace-nowrap text-xs tabular-nums">{dateFr(i.createdAt)}</span>,
    },
    {
      key: "hub", header: "TMP", sortValue: i => i.hub.code,
      render: i => (
        <div className="min-w-0">
          <p className="font-medium tabular-nums">{i.hub.code}</p>
          <p className="truncate text-[11px] text-muted-foreground">{i.hub.name} · {i.hub.gouvernorat}</p>
        </div>
      ),
    },
    {
      key: "vehicle", header: "Véhicule", sortValue: i => i.vehicle?.plate ?? "",
      render: i => i.vehicle ? (
        <div className="min-w-0">
          <p className="font-medium tabular-nums">{i.vehicle.plate}</p>
          <p className="truncate text-[11px] text-muted-foreground">{i.vehicle.brand}{i.vehicle.model ? ` ${i.vehicle.model}` : ""}</p>
        </div>
      ) : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      key: "detail", header: "Détail", sortValue: i => i.detail ?? "",
      render: i => <span className="text-xs leading-snug">{i.detail ?? "—"}</span>,
    },
    {
      key: "price", header: "Prix", align: "right", sortValue: i => i.priceDt, hideInCards: true,
      render: i => <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{money(i.priceDt)}</span>,
    },
    {
      key: "duration", header: "Durée", align: "right", sortValue: i => i.durationMin ?? 0, hideInCards: true,
      render: i => <span className="whitespace-nowrap text-xs tabular-nums">{i.durationMin != null ? `${i.durationMin} min` : "—"}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <SectionHeader
        title={`${meta.plural} — registre des interventions`}
        description={meta.description}
        icon={meta.icon}
        badge="Registre réel"
      />

      {/* KPIs — calculés sur l'ensemble filtré côté serveur */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={`Interventions ${meta.plural.toLowerCase()}`} value={num(m.total)} sub={period === "all" ? "tout l'historique du périmètre" : `sur ${PERIOD_META[period].label.toLowerCase()}`} icon={Wrench} />
        <KpiCard label="CA total" value={money(m.caTotal)} sub="chiffre d'affaires du registre filtré" icon={Banknote} tone="success" />
        <KpiCard label="Panier moyen" value={money(m.panierMoyen)} sub="par intervention" icon={TrendingUp} />
        <KpiCard label="Durée moyenne" value={`${num(m.dureeMoyenne)} min`} sub="temps de prestation en atelier" icon={Clock} />
      </div>

      {/* Filtres : hub + période + recherche */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
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
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher (détail, plaque, TMP)…"
                className="min-h-11 pl-9"
                aria-label="Recherche dans le registre"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par période">
            {(Object.keys(PERIOD_META) as PeriodKey[]).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setPeriod(k)}
                className={`min-h-11 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${period === k ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "border-border bg-background hover:bg-muted"}`}
              >
                {PERIOD_META[k].label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Diagnostics : statistiques des codes défaut */}
      {serviceType === "DIAGNOSTIC" && defectStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Codes défaut et motifs de diagnostic</CardTitle>
            <CardDescription>
              Regroupement du registre : les codes OBD (P0401…) sont extraits du libellé de prestation ;
              les passages sans code sont groupés par motif exact.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="aspect-auto h-[300px] w-full">
              <BarChart data={defectStats} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => num(v)} />
                <YAxis type="category" dataKey="name" width={150} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0]?.payload as (typeof defectStats)[number] | undefined
                    if (!row) return null
                    return (
                      <div className="px-3 py-2 text-xs" style={tooltipStyle()}>
                        <p className="font-medium text-popover-foreground">{row.name}</p>
                        <p className="text-muted-foreground">{num(row.count)} diagnostics</p>
                      </div>
                    )
                  }}
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                />
                <Bar dataKey="count" name="Diagnostics" barSize={14} radius={[0, 3, 3, 0]}>
                  {defectStats.map((r, idx) => (
                    <Cell key={r.name} fill={idx < 3 ? "#059669" : "#c98a2d"} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Lecture honnête : le seed V1 documente les libellés de prestation (« Lecture défauts moteur (P0401) ») —
              les codes sont donc parsés, pas inventés.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pneus : top dimensions vendues + CA par dimension */}
      {serviceType === "PNEUS" && tireStats.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">Top dimensions vendues</CardTitle>
              <CardDescription>
                Quantités (préfixe « 2× … » du libellé) et chiffre d&apos;affaires par dimension — les dimensions
                les plus montées en atelier.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dimension</TableHead>
                      <TableHead className="text-right">Pneus vendus</TableHead>
                      <TableHead className="text-right">Interventions</TableHead>
                      <TableHead className="text-right">CA</TableHead>
                      <TableHead className="text-right">Panier moyen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tireStats.map(d => (
                      <TableRow key={d.size}>
                        <TableCell className="font-medium tabular-nums">{d.size}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(d.sales)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(d.count)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{money(d.ca)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(d.ca / Math.max(1, d.count))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Dimensions les plus montées</CardTitle>
              <CardDescription>Top 5 par quantité de pneus vendus.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              {tireStats.slice().sort((a, b) => b.sales - a.sales).slice(0, 5).map((d, idx) => (
                <button
                  key={d.size}
                  type="button"
                  onClick={() => setSearch(d.size.replace("/", " ").replace("R", " R"))}
                  className={`min-h-11 rounded-full border px-3.5 py-2 text-xs font-medium tabular-nums transition-colors ${idx === 0 ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300" : "border-border bg-background hover:bg-muted"}`}
                  title={`Filtrer le registre sur la dimension ${d.size}`}
                >
                  {d.size} · {num(d.sales)} pneus
                </button>
              ))}
              <p className="mt-2 w-full text-[11px] leading-relaxed text-muted-foreground">
                Cliquez une dimension pour filtrer le registre ci-dessous.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Registre — table riche, vue groupée par TMP (CA par hub), export CSV */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Registre des {meta.plural.toLowerCase()}</CardTitle>
          <CardDescription>
            {num(rows.length)} interventions affichées (sur {num(m.total)} filtrées) · cliquez une ligne pour la fiche
            complète · vue « Arborescence » groupée par TMP avec CA par hub.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey={`hubs-services-${type}`}
            columns={columns}
            rows={rows}
            rowKey={i => i.id}
            onRowClick={i => setSelected(i)}
            emptyMessage="Aucune intervention ne correspond aux filtres (le TMP en construction n'a pas encore de caisse)."
            maxHeightClassName="max-h-[26rem]"
            nested={{
              groupKey: i => i.hub.code,
              groupLabel: (gk, grows) => {
                const ca = grows.reduce((s, i) => s + i.priceDt, 0)
                const hubName = grows[0]?.hub.name ?? ""
                return (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span className="tabular-nums font-semibold">{gk}</span>
                    <span className="text-[11px] font-normal text-muted-foreground">— {hubName}</span>
                    <span className="ml-1 text-[11px] font-normal text-primary/70">
                      · {num(grows.length)} interventions · CA {money(ca)}
                    </span>
                  </span>
                )
              },
              groupSortValue: (gk, grows) => 1e12 - grows.reduce((s, i) => s + i.priceDt, 0), // CA décroissant
              hideColumnKeyInGroups: "hub",
              defaultOpen: "first",
            }}
            toolbarExtra={
              <Button type="button" variant="outline" className="min-h-11 gap-1.5" onClick={() => exportInterventionsCsv(rows, scopeLabel)}>
                <Download className="h-4 w-4" aria-hidden />
                Export CSV
              </Button>
            }
            renderCard={i => (
              <Card className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setSelected(i)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold tabular-nums">{i.vehicle?.plate ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {i.vehicle ? `${i.vehicle.brand}${i.vehicle.model ? ` ${i.vehicle.model}` : ""}` : "véhicule retiré"}
                      </p>
                    </div>
                    <Badge variant="outline" className={`shrink-0 ${meta.badge}`}>{meta.label}</Badge>
                  </div>
                  <p className="mt-2 text-xs">{i.detail ?? "—"}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">{dateFr(i.createdAt)} · {i.hub.code}</span>
                    <span className="font-semibold tabular-nums text-foreground">{money(i.priceDt)}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          />
        </CardContent>
      </Card>

      {/* Fiche intervention (Sheet) */}
      <InterventionSheet intervention={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

/* ---------------- Fiche détaillée d'une intervention ---------------- */
function InterventionSheet({ intervention, onClose }: { intervention: InterventionRow | null; onClose: () => void }) {
  const i = intervention
  return (
    <Sheet open={i !== null} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {i && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
                <Badge variant="outline" className={SERVICE_META[i.serviceType]?.badge}>
                  {SERVICE_META[i.serviceType]?.label ?? i.serviceType}
                </Badge>
                <span className="tabular-nums">{money(i.priceDt)}</span>
              </SheetTitle>
              <SheetDescription>
                Intervention enregistrée le {dateFr(i.createdAt)} · durée {i.durationMin != null ? `${i.durationMin} min` : "non renseignée"}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-6">
              {/* Détail de la prestation */}
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prestation</p>
                <p className="mt-1 text-sm font-medium">{i.detail ?? "—"}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Prix encaissé</p>
                    <p className="font-semibold tabular-nums">{money(i.priceDt)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Durée atelier</p>
                    <p className="font-semibold tabular-nums">{i.durationMin != null ? `${i.durationMin} min` : "—"}</p>
                  </div>
                </div>
              </div>

              {/* Véhicule lié */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Véhicule client</p>
                {i.vehicle ? (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Immatriculation", value: i.vehicle.plate },
                      { label: "Marque", value: i.vehicle.brand },
                      { label: "Modèle", value: i.vehicle.model ?? "—" },
                      { label: "Kilométrage", value: `${num(i.vehicle.km)} km` },
                    ].map(k => (
                      <div key={k.label} className="rounded-lg border p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums">{k.value}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Véhicule retiré de la base (intervention historique).</p>
                )}
              </div>

              {/* Hub d'origine */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Micro-hub</p>
                <div className="rounded-lg border p-3">
                  <p className="text-sm font-bold"><span className="tabular-nums">{i.hub.code}</span> — {i.hub.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{i.hub.gouvernorat} · réseau {i.hub.brandSlug}</p>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Fiche issue du registre réel des interventions (aucune donnée recalculée) — la fiche véhicule complète
                (historique, fidélité, conversions) vit dans « Base clients TMP ».
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
