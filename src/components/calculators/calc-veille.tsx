'use client'

// A.6.6 — Calculateur de veille concurrentielle (enseigne cible)

import * as React from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Activity, CalendarClock, DoorClosed, DoorOpen, Eye, Hammer, Repeat2, Target, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { SeverityBadge, ImpactBadge } from "@/components/shell/badges"
import { MOVEMENT_TYPE_LABELS, type AlertDTO, type BrandDTO, type MovementDTO } from "@/lib/types"
import { AXIS_STYLE, GRID_STROKE, tooltipStyle } from "@/lib/chart"
import {
  ParamsPanel,
  ResultsPanel,
  SaveScenarioBar,
  SelectParam,
  asNumber,
  asString,
  fmtDateFr,
  fmtInt,
  type InitialScenario,
} from "./calc-shared"

const TYPE_COLORS: Record<string, string> = {
  OPENING: "#059669",
  RENOVATION: "#d97706",
  CLOSURE: "#dc2626",
  REBRAND: "#9333ea",
}

/** Ordre des séries du BarChart mensuel (aligné sur TYPE_COLORS) */
const SERIES = [
  { key: "Ouvertures", color: TYPE_COLORS.OPENING },
  { key: "Rénovations", color: TYPE_COLORS.RENOVATION },
  { key: "Fermetures", color: TYPE_COLORS.CLOSURE },
  { key: "Re-branding", color: TYPE_COLORS.REBRAND },
] as const

function lastMonths(n: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }),
    })
  }
  return out
}

export interface CalcVeilleProps {
  brands: BrandDTO[]
  onSave: (type: string, label: string, params: Record<string, unknown>, result: Record<string, unknown>) => void
  saving?: boolean
  initial?: InitialScenario | null
}

export function CalcVeille({ brands, onSave, saving, initial }: CalcVeilleProps) {
  const p = initial?.params ?? {}
  const defaultBrand = brands.find((b) => !b.isIndependents)?.name ?? brands[0]?.name ?? ""

  const [brandName, setBrandName] = React.useState(asString(p.brand, defaultBrand))
  const [periodMonths, setPeriodMonths] = React.useState(asNumber(p.periodMonths, 6))

  const [movements, setMovements] = React.useState<MovementDTO[] | null>(null)
  const [alerts, setAlerts] = React.useState<AlertDTO[] | null>(null)
  const [dataBrand, setDataBrand] = React.useState<string>("")
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/api/movements?brand=${encodeURIComponent(brandName)}&limit=100`).then((r) => r.json()),
      fetch(`/api/alerts?limit=60`).then((r) => r.json()),
    ])
      .then(([m, a]: [{ movements?: MovementDTO[] }, { alerts?: AlertDTO[] }]) => {
        if (cancelled) return
        setMovements(m.movements ?? [])
        setAlerts(a.alerts ?? [])
        setDataBrand(brandName)
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les mouvements et alertes de veille.")
      })
    return () => {
      cancelled = true
    }
  }, [brandName])

  const stale = dataBrand !== brandName
  const loading = movements === null || alerts === null

  // ---------- Filtrage par période (mois alignés) ----------
  const months = React.useMemo(() => lastMonths(periodMonths), [periodMonths])
  const sinceMs = React.useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() - (periodMonths - 1), 1).getTime()
  }, [periodMonths])

  const inPeriod = React.useMemo(
    () => (movements ?? []).filter((m) => new Date(m.date).getTime() >= sinceMs),
    [movements, sinceMs]
  )

  const counts = React.useMemo(() => {
    const c = { OPENING: 0, RENOVATION: 0, CLOSURE: 0, REBRAND: 0 } as Record<string, number>
    for (const m of inPeriod) c[m.type] = (c[m.type] ?? 0) + 1
    return c
  }, [inPeriod])

  const monthly = React.useMemo(
    () =>
      months.map((mo) => {
        const bucket = inPeriod.filter((m) => m.date.slice(0, 7) === mo.key)
        return {
          mois: mo.label,
          Ouvertures: bucket.filter((m) => m.type === "OPENING").length,
          Rénovations: bucket.filter((m) => m.type === "RENOVATION").length,
          Fermetures: bucket.filter((m) => m.type === "CLOSURE").length,
          "Re-branding": bucket.filter((m) => m.type === "REBRAND").length,
        }
      }),
    [months, inPeriod]
  )

  const relatedAlerts = React.useMemo(
    () => (alerts ?? []).filter((a) => a.brand === brandName).slice(0, 5),
    [alerts, brandName]
  )

  // ---------- Axes stratégiques adverses (déduction automatique) ----------
  const strategy = React.useMemo(() => {
    const byGouvOpen: Record<string, number> = {}
    for (const m of inPeriod) {
      if (m.type === "OPENING") byGouvOpen[m.gouvernorat] = (byGouvOpen[m.gouvernorat] ?? 0) + 1
    }
    const topGouv = Object.entries(byGouvOpen).sort((a, b) => b[1] - a[1])[0]
    const rebrands = counts.REBRAND
    const fort = inPeriod.filter((m) => m.impact === "Fort").length
    const peakMonth = monthly.reduce((best, m) => {
      const total = m.Ouvertures + m.Rénovations + m.Fermetures + m["Re-branding"]
      const bestTotal = best ? best.Ouvertures + best.Rénovations + best.Fermetures + best["Re-branding"] : -1
      return total > bestTotal ? m : best
    }, monthly[0])
    const peakTotal = peakMonth
      ? peakMonth.Ouvertures + peakMonth.Rénovations + peakMonth.Fermetures + peakMonth["Re-branding"]
      : 0

    const lines: { icon: typeof Target; text: string }[] = []
    if (topGouv) {
      lines.push({ icon: Target, text: `Zone d'expansion prioritaire : ${topGouv[0]} (${topGouv[1]} ouverture${topGouv[1] > 1 ? "s" : ""} sur la période).` })
    }
    if (rebrands > 0) {
      lines.push({ icon: Repeat2, text: `Reprise d'enseignes : ${rebrands} station${rebrands > 1 ? "s" : ""} re-brandée${rebrands > 1 ? "s" : ""} vers ${brandName} — stratégie de rachat de réseaux.` })
    }
    if (peakMonth && peakTotal > 0) {
      lines.push({ icon: CalendarClock, text: `Pic d'activité : ${peakMonth.mois} avec ${peakTotal} mouvement${peakTotal > 1 ? "s" : ""} enregistré${peakTotal > 1 ? "s" : ""}.` })
    }
    if (fort > 0) {
      lines.push({ icon: Zap, text: `Impact fort : ${fort} mouvement${fort > 1 ? "s" : ""} à fort impact identifié${fort > 1 ? "s" : ""} — surveillance renforcée recommandée.` })
    }
    return lines
  }, [inPeriod, counts, monthly, brandName])

  const brandOptions = brands.map((b) => ({
    value: b.name,
    label: b.name,
    description: `${b.stationCount} stations · ${b.isIndependents ? "réseau indépendant" : "enseigne structurée"}`,
  }))

  // Colonnes des mouvements (DataViews : Tableau / Cartes / Arborescence par type)
  const mvtColumns: DataViewColumn<MovementDTO>[] = [
    {
      key: "date", header: "Date",
      sortValue: (m) => new Date(m.date).getTime(),
      className: "whitespace-nowrap",
      render: (m) => <span className="text-xs tabular-nums">{fmtDateFr(m.date)}</span>,
    },
    {
      key: "type", header: "Type",
      sortValue: (m) => MOVEMENT_TYPE_LABELS[m.type] ?? m.type,
      render: (m) => (
        <Badge variant="outline" className="text-[11px]" style={{ borderColor: TYPE_COLORS[m.type], color: TYPE_COLORS[m.type] }}>
          {MOVEMENT_TYPE_LABELS[m.type] ?? m.type}
        </Badge>
      ),
    },
    {
      key: "station", header: "Station",
      sortValue: (m) => m.station,
      render: (m) => <span className="text-xs font-medium">{m.station}</span>,
    },
    {
      key: "gouvernorat", header: "Gouvernorat",
      sortValue: (m) => m.gouvernorat,
      render: (m) => <span className="text-xs">{m.gouvernorat}</span>,
    },
    {
      key: "impact", header: "Impact", align: "right",
      sortValue: (m) => m.impact,
      render: (m) => <ImpactBadge impact={m.impact} />,
    },
  ]

  const reset = () => {
    setBrandName(defaultBrand)
    setPeriodMonths(6)
  }

  const defaultLabel = `Veille — ${brandName} (${periodMonths} mois)`

  const handleSave = (label: string) => {
    onSave(
      "veille-concurrentielle",
      label,
      { brand: brandName, periodMonths },
      {
        ouvertures: counts.OPENING,
        renovations: counts.RENOVATION,
        fermetures: counts.CLOSURE,
        rebrands: counts.REBRAND,
        mouvements: inPeriod.length,
      }
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <ParamsPanel icon={Eye} title="Paramètres" subtitle="Enseigne surveillée et fenêtre d'analyse">
          <SelectParam
            label="Enseigne cible"
            value={brandName}
            onValueChange={setBrandName}
            options={brandOptions}
            hint="Mouvements enregistrés dans la base de veille CarbuScope"
          />
          <SelectParam
            label="Période d'analyse"
            value={String(periodMonths)}
            onValueChange={(v) => setPeriodMonths(Number(v))}
            options={[
              { value: "3", label: "3 derniers mois" },
              { value: "6", label: "6 derniers mois" },
              { value: "12", label: "12 derniers mois" },
            ]}
          />
          {brandName && (
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Cible : {brandName}</p>
              <p className="mt-0.5">
                {inPeriod.length} mouvement{inPeriod.length > 1 ? "s" : ""} sur les {periodMonths} derniers mois ·{" "}
                {relatedAlerts.length} alerte{relatedAlerts.length > 1 ? "s" : ""} liée{relatedAlerts.length > 1 ? "s" : ""}
              </p>
            </div>
          )}
        </ParamsPanel>

        <ResultsPanel busy={loading || stale}>
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
              {error}
            </div>
          ) : loading ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-56 rounded-lg" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <KpiCard label="Ouvertures" value={fmtInt(counts.OPENING)} icon={DoorOpen} tone="warning" sub="nouvelles stations cible" />
                <KpiCard label="Rénovations" value={fmtInt(counts.RENOVATION)} icon={Hammer} sub="modernisations de réseau" />
                <KpiCard label="Fermetures" value={fmtInt(counts.CLOSURE)} icon={DoorClosed} tone="danger" sub="retraits du réseau" />
                <KpiCard label="Mouvements suivis" value={fmtInt(inPeriod.length)} icon={Activity} tone="info" sub={`sur ${periodMonths} mois`} />
              </div>

              <div className="rounded-lg border bg-card p-4">
                <p className="text-sm font-semibold">Mouvements mensuels de {brandName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Répartition mensuelle empilée par type — ouvertures, rénovations, fermetures, re-branding
                </p>
                <div className="mt-3 h-60 w-full sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="mois" tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} tickLine={false} dy={4} />
                      <YAxis
                        allowDecimals={false}
                        tick={AXIS_STYLE.tick}
                        stroke={AXIS_STYLE.stroke}
                        tickLine={false}
                        width={32}
                      />
                      <Tooltip contentStyle={tooltipStyle()} cursor={{ fill: "var(--muted)" }} />
                      {SERIES.map((s, i) => (
                        <Bar
                          key={s.key}
                          dataKey={s.key}
                          stackId="mvts"
                          fill={s.color}
                          barSize={26}
                          radius={i === 3 ? [3, 3, 0, 0] : undefined}
                          isAnimationActive={false}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border bg-card p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Target className="h-4 w-4 text-primary" />
                    Axes stratégiques adverses
                  </p>
                  {strategy.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Aucun mouvement significatif sur la période : la cible semble en phase de consolidation.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {strategy.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                          <s.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          <span>{s.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-lg border bg-card p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Eye className="h-4 w-4 text-primary" />
                    Alertes liées à {brandName}
                  </p>
                  {relatedAlerts.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">Aucune alerte active liée à cette enseigne.</p>
                  ) : (
                    <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                      {relatedAlerts.map((a) => (
                        <li key={a.id} className="rounded-md border p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-medium leading-snug">{a.title}</p>
                            <SeverityBadge severity={String(a.severity)} />
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {a.gouvernorat} · {fmtDateFr(a.date)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Mouvements détectés — DataViews : 3 modes d'affichage, arborescence par type */}
              <div className="rounded-lg border bg-card">
                <div className="border-b p-3 pb-2.5">
                  <p className="text-sm font-semibold">Mouvements détectés</p>
                  <p className="text-xs text-muted-foreground">
                    {inPeriod.length} mouvement{inPeriod.length > 1 ? "s" : ""} de {brandName} sur {periodMonths} mois · 3 modes
                    d&apos;affichage
                  </p>
                </div>
                <div className="p-3">
                  <DataViews
                    viewKey="calc-veille"
                    columns={mvtColumns}
                    rows={inPeriod}
                    rowKey={(m) => m.id}
                    emptyMessage="Aucun mouvement enregistré sur la période sélectionnée."
                    maxHeightClassName="max-h-72"
                    nested={{
                      groupKey: (m) => m.type,
                      groupLabel: (gk, grows) => {
                        const forts = grows.filter((m) => m.impact === "Fort").length
                        return (
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[gk] ?? "#94a3b8" }} aria-hidden />
                            {MOVEMENT_TYPE_LABELS[gk] ?? gk}
                            <span className="ml-1 text-[11px] font-normal text-primary/70">
                              — {grows.length} mouvement{grows.length > 1 ? "s" : ""}
                              {forts > 0 ? ` · ${forts} à fort impact` : ""}
                            </span>
                          </span>
                        )
                      },
                      groupSortValue: (_gk, grows) => grows.length,
                      hideColumnKeyInGroups: "type",
                      defaultOpen: "first",
                    }}
                    renderCard={(m) => (
                      <Card className="overflow-hidden">
                        <CardContent className="p-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="outline" className="text-[11px]" style={{ borderColor: TYPE_COLORS[m.type], color: TYPE_COLORS[m.type] }}>
                              {MOVEMENT_TYPE_LABELS[m.type] ?? m.type}
                            </Badge>
                            <span className="text-[11px] tabular-nums text-muted-foreground">{fmtDateFr(m.date)}</span>
                          </div>
                          <p className="mt-2 text-sm font-semibold leading-snug">{m.station}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{m.gouvernorat}</p>
                          <div className="mt-2 border-t pt-2">
                            <ImpactBadge impact={m.impact} />
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  />
                </div>
              </div>
            </>
          )}
        </ResultsPanel>
      </div>

      <SaveScenarioBar defaultLabel={defaultLabel} initialLabel={initial?.label} saving={saving} onSave={handleSave} onReset={reset} />
    </div>
  )
}
