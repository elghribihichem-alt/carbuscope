'use client'

// D.2.5 — Statistiques plateforme : KPIs, part de marché (doughnut), contributions par type

import { useEffect, useMemo, useState } from "react"
import {
  Users, MessageSquarePlus, Target, CheckCircle2, Store, PieChart as PieIcon, BarChart3,
} from "lucide-react"
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis,
  CartesianGrid,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { KpiCard } from "@/components/shell/kpi-card"
import { CHART_PALETTE, AXIS_STYLE, GRID_STROKE, tooltipStyle } from "@/lib/chart"
import { CONTRIBUTION_TYPE_LABELS, type ContributionDTO, type MarketShareRow } from "@/lib/types"
import { num, pct } from "@/components/settings/settings-shared"

const TYPE_SHORT: Record<string, string> = {
  CLOSED: "Fermée",
  SERVICE_UNAVAILABLE: "Service",
  PRICE_ABNORMAL: "Prix",
  PUMP_BROKEN: "Pompe",
  QUEUE: "File",
  CLEANLINESS: "Propreté",
}

export function BoStats() {
  const [contributions, setContributions] = useState<ContributionDTO[] | null>(null)
  const [marketShare, setMarketShare] = useState<MarketShareRow[] | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/contributions?limit=100", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { contributions?: ContributionDTO[] }) => { setContributions(j.contributions ?? []) })
      .catch(() => {})
    return () => ac.abort()
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/stats/market-share", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { data?: MarketShareRow[] }) => { setMarketShare(j.data ?? []) })
      .catch(() => {})
    return () => ac.abort()
  }, [])

  // Contributions reçues + répartition par type
  const byType = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of contributions ?? []) counts.set(c.type, (counts.get(c.type) ?? 0) + 1)
    return [...counts.entries()].map(([type, value]) => ({
      type,
      label: TYPE_SHORT[type] ?? type,
      value,
    }))
  }, [contributions])

  const stationsSuivies = useMemo(
    () => (marketShare ?? []).reduce((acc, r) => acc + (r.stations || 0), 0),
    [marketShare]
  )

  const loading = contributions === null || marketShare === null

  return (
    <div className="space-y-4">
      {/* 5 KPIs plateforme */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Utilisateurs actifs"
          value={num(24800)}
          icon={Users}
          tone="info"
          trend={{ value: 18, label: " %" }}
          sub="Base B2C mobile (trimestre)"
        />
        <KpiCard
          label="Contributions reçues"
          value={contributions ? num(contributions.length) : "…"}
          icon={MessageSquarePlus}
          tone="warning"
          sub="Signalements des automobilistes"
        />
        <KpiCard label="Taux de couverture" value="97,8 %" icon={Store} tone="success" sub="Cible : > 95 %" />
        <KpiCard label="Taux de précision" value="96,4 %" icon={Target} tone="success" sub="Cible : > 95 %" />
        <KpiCard
          label="Stations suivies"
          value={stationsSuivies > 0 ? num(stationsSuivies) : "1 814"}
          icon={CheckCircle2}
          tone="default"
          sub="Toutes enseignes confondues"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Part de marché — doughnut */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieIcon className="h-4 w-4 text-emerald-600" aria-hidden /> Part de marché par enseigne
            </CardTitle>
            <CardDescription>Répartition des stations actives (1 814 fiches, 6 enseignes + indépendants).</CardDescription>
          </CardHeader>
          <CardContent>
            {loading || !marketShare ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={marketShare}
                      dataKey="sharePct"
                      nameKey="brand"
                      innerRadius="52%"
                      outerRadius="78%"
                      paddingAngle={2}
                      stroke="var(--background)"
                      strokeWidth={2}
                    >
                      {marketShare.map(row => (
                        <Cell key={row.slug} fill={row.color || CHART_PALETTE[0]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      formatter={(value: number, name: string, entry: { payload?: MarketShareRow }) => [
                        `${pct(value)} · ${entry?.payload?.stations ?? 0} stations`,
                        name,
                      ]}
                    />
                    <Legend
                      formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>}
                      iconType="circle"
                      iconSize={8}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contributions par type — bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-amber-600" aria-hidden /> Contributions par type
            </CardTitle>
            <CardDescription>
              {contributions ? `${contributions.length} signalements` : "Chargement…"} — tous statuts confondus.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : byType.length === 0 ? (
              <p className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                Aucune contribution enregistrée.
              </p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byType} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={AXIS_STYLE.tick}
                      stroke={AXIS_STYLE.stroke}
                      interval={0}
                      angle={-22}
                      textAnchor="end"
                      height={44}
                    />
                    <YAxis tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} allowDecimals={false} />
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                      formatter={(value: number, _name: string, entry: { payload?: { type: string } }) => [
                        `${value} signalement(s)`,
                        CONTRIBUTION_TYPE_LABELS[entry?.payload?.type ?? ""] ?? "Type",
                      ]}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
                      {byType.map((_, i) => (
                        <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
