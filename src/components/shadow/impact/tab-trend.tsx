'use client'

// Shadow Market — Analyse d'Impact, onglet « 📈 Tendance » (T44-d).
// 12 mois d'évolution : ComposedChart (Area points actifs + Line perte en
// axe droit, ReferenceLine sur les mois à note), AreaChart naissances vs
// neutralisations, KPI d'évolution vs mois précédent, filtre gouvernorat.

import { useEffect, useMemo, useState } from "react"
import { CircleAlert, Layers, TrendingDown, TrendingUp, Users } from "lucide-react"
import type { ShadowMonthlyStatDTO } from "@/lib/types"
import {
  Area, AreaChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ErrorState, TabSkeleton } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import { SectionHeader, ShadowKpiCard, formatTnd, monthLabelFr } from "../shadow-shared"
import { TipRow, TipShell } from "./impact-shared"

const GOVS = [
  "Ariana", "Béja", "Ben Arous", "Bizerte", "Gabès", "Gafsa", "Jendouba", "Kairouan",
  "Kasserine", "Kébili", "Le Kef", "Mahdia", "Manouba", "Médenine", "Monastir", "Nabeul",
  "Sfax", "Sidi Bouzid", "Siliana", "Sousse", "Tataouine", "Tozeur", "Tunis", "Zaghouan",
]

export function TabTrend() {
  const [gouvernorat, setGouvernorat] = useState("all")
  const [monthly, setMonthly] = useState<ShadowMonthlyStatDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    const q = gouvernorat === "all" ? "" : `?gouvernorat=${encodeURIComponent(gouvernorat)}`
    fetch(`/api/shadow/impact/trend${q}`, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json() as Promise<{ monthly: ShadowMonthlyStatDTO[] }>
      })
      .then((json) => {
        setMonthly(json.monthly ?? [])
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [gouvernorat, reloadKey])

  const chartRows = useMemo(() => {
    if (monthly === null) return []
    return monthly.map((m) => ({
      ...m,
      label: monthLabelFr(m.month),
      flagged: m.note != null && m.note !== "",
    }))
  }, [monthly])

  // Évolution dernier mois vs précédent.
  const deltas = useMemo(() => {
    if (chartRows.length < 2) return null
    const last = chartRows[chartRows.length - 1]
    const prev = chartRows[chartRows.length - 2]
    const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0)
    return {
      lastLabel: last.label,
      activePoints: last.activePoints,
      activeTrend: pct(last.activePoints, prev.activePoints),
      loss: last.estLossTnd,
      lossTrend: pct(last.estLossTnd, prev.estLossTnd),
      newPoints: last.newPoints,
      closedPoints: last.closedPoints,
    }
  }, [chartRows])

  if (error !== null) {
    return <ErrorState message={error} retry={() => setReloadKey((k) => k + 1)} />
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        emoji="📈"
        title="Tendance sur 12 mois"
        description="Évolution du marché parallèle : points actifs, perte estimée, naissances et neutralisations."
        actions={
          <div className="space-y-1">
            <Label className="sr-only">Gouvernorat</Label>
            <Select value={gouvernorat} onValueChange={setGouvernorat}>
              <SelectTrigger className="h-9 w-44" aria-label="Filtrer la tendance par gouvernorat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">National (tous)</SelectItem>
                {GOVS.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {monthly === null ? (
        <TabSkeleton title="Chargement de la série mensuelle…" />
      ) : (
        <>
          {/* KPI mois vs précédent */}
          {deltas !== null ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <ShadowKpiCard
                value={num(deltas.activePoints)}
                label={`Points actifs — ${deltas.lastLabel}`}
                trend={deltas.activeTrend}
                trendLabel="vs mois préc."
                tone="yellow"
                icon={Users}
              />
              <ShadowKpiCard
                value={formatTnd(deltas.loss)}
                label={`Perte estimée — ${deltas.lastLabel}`}
                trend={deltas.lossTrend}
                trendLabel="vs mois préc."
                tone="red"
                icon={Layers}
              />
              <ShadowKpiCard value={num(deltas.newPoints)} label="Naissances" sub="nouveaux points ce mois" tone="orange" icon={TrendingUp} />
              <ShadowKpiCard value={num(deltas.closedPoints)} label="Neutralisations" sub="points disparus ce mois" tone="green" icon={TrendingDown} />
            </div>
          ) : null}

          {/* ComposedChart points + perte */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Points actifs et perte estimée</CardTitle>
              <p className="text-xs text-muted-foreground">
                Aire : points actifs (axe gauche) · ligne : perte DT/mois (axe droit). Les mois marqués
                d&apos;un repère portent une note (Ramadan, pic estival, rentrée…).
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartRows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      yAxisId="left"
                      tickLine={false}
                      axisLine={false}
                      width={34}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      tickFormatter={(v: number) => num(v)}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      tickFormatter={(v: number) => `${Math.round(v / 1000)} K`}
                    />
                    <Tooltip
                      cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                      content={({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) => {
                        if (!active || !payload?.length) return null
                        const row = payload[0]?.payload as (typeof chartRows)[number] | undefined
                        if (!row) return null
                        return (
                          <TipShell title={row.label}>
                            <TipRow label="Points actifs" value={num(row.activePoints)} color="#FF9800" />
                            <TipRow label="Perte / mois" value={formatTnd(row.estLossTnd)} color="#E53935" />
                            <TipRow label="Naissances" value={num(row.newPoints)} color="#FFC107" />
                            <TipRow label="Neutralisations" value={num(row.closedPoints)} color="#4CAF50" />
                            {row.flagged ? (
                              <p className="mt-1 flex items-start gap-1.5 max-w-52 rounded bg-muted px-1.5 py-1 text-[10px] leading-snug text-muted-foreground">
                                <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                                {row.note}
                              </p>
                            ) : null}
                          </TipShell>
                        )
                      }}
                    />
                    {chartRows.filter((r) => r.flagged).map((r) => (
                      <ReferenceLine
                        key={r.month}
                        x={r.label}
                        yAxisId="left"
                        stroke="var(--muted-foreground)"
                        strokeDasharray="2 4"
                        label={{ value: "◆", position: "top", fontSize: 10, fill: "var(--muted-foreground)" }}
                      />
                    ))}
                    <Area
                      yAxisId="left"
                      dataKey="activePoints"
                      name="Points actifs"
                      stroke="#FF9800"
                      fill="#FF980033"
                      strokeWidth={2}
                    />
                    <Line
                      yAxisId="right"
                      dataKey="estLossTnd"
                      name="Perte DT/mois"
                      stroke="#E53935"
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: "#E53935" }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#FF9800]" aria-hidden /> points actifs (gauche)</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#E53935]" aria-hidden /> perte DT/mois (droite)</span>
                <span className="flex items-center gap-1">◆ mois à note (survollez pour la lire)</span>
              </div>
            </CardContent>
          </Card>

          {/* Naissances vs neutralisations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Naissances vs neutralisations</CardTitle>
              <p className="text-xs text-muted-foreground">
                Nouveaux points détectés (ambre) contre disparitions constatées (vert) — l&apos;écart
                mesure l&apos;expansion nette du marché parallèle.
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartRows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      width={30}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    />
                    <Tooltip
                      cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                      content={({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) => {
                        if (!active || !payload?.length) return null
                        const row = payload[0]?.payload as (typeof chartRows)[number] | undefined
                        if (!row) return null
                        return (
                          <TipShell title={row.label}>
                            <TipRow label="Naissances" value={num(row.newPoints)} color="#FFC107" />
                            <TipRow label="Neutralisations" value={num(row.closedPoints)} color="#4CAF50" />
                            <TipRow label="Solde net" value={`${row.newPoints - row.closedPoints > 0 ? "+" : ""}${num(row.newPoints - row.closedPoints)}`} />
                            {row.flagged ? (
                              <p className="mt-1 max-w-52 rounded bg-muted px-1.5 py-1 text-[10px] leading-snug text-muted-foreground">{row.note}</p>
                            ) : null}
                          </TipShell>
                        )
                      }}
                    />
                    <Area dataKey="newPoints" name="Naissances" stroke="#FFC107" fill="#FFC10733" strokeWidth={2} />
                    <Area dataKey="closedPoints" name="Neutralisations" stroke="#4CAF50" fill="#4CAF5026" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Notes de saisonnalité */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Notes de saisonnalité</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {chartRows.filter((r) => r.flagged).length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucune note de contexte sur la période.</p>
              ) : (
                <ul className="space-y-1.5">
                  {chartRows.filter((r) => r.flagged).map((r) => (
                    <li key={r.month} className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5 shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums dark:bg-stone-800">
                        {r.label}
                      </span>
                      <span className="text-muted-foreground">{r.note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
