'use client'

// CarbuScope — Module A.7 « Veille »
// Objectif (cahier des charges) : détecter et suivre les mouvements du marché.
// Alertes actives (timeline), graphique des mouvements 12 mois, historique + export CSV.

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { KpiCard } from "@/components/shell/kpi-card"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { tooltipStyle, num } from "@/lib/chart"
import { useChartPalette } from "@/hooks/use-chart-palette"
import type { AlertDTO, BrandDTO, MovementDTO, MovementsStats } from "@/lib/types"
import { Siren, Bell, Info, Radar } from "lucide-react"
import { AlertsTimeline } from "./alerts-timeline"
import { MovementsHistory } from "./movements-history"
import { RelancesCard } from "./relances-card"

const TICK = { fontSize: 10, fill: "var(--muted-foreground)" }

type VeilleData = {
  alerts: AlertDTO[]
  movements: MovementDTO[]
  stats: MovementsStats
  brands: BrandDTO[]
}

export function VeilleTab() {
  const palette = useChartPalette()
  const [data, setData] = useState<VeilleData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const get = async <T,>(url: string): Promise<T> => {
        const r = await fetch(url, { signal })
        if (!r.ok) throw new Error(`API ${url} [${r.status}]`)
        return (await r.json()) as T
      }
      const [alertsRes, movementsRes, statsRes, brandsRes] = await Promise.all([
        get<{ alerts: AlertDTO[] }>("/api/alerts?limit=60"),
        get<{ movements: MovementDTO[] }>("/api/movements?limit=200"),
        get<MovementsStats>("/api/stats/movements"),
        get<{ brands: BrandDTO[] }>("/api/brands"),
      ])
      setData({
        alerts: alertsRes.alerts,
        movements: movementsRes.movements,
        stats: statsRes,
        brands: brandsRes.brands,
      })
      setError(null)
    } catch (e) {
      if (signal.aborted) return
      setError(e instanceof Error ? e.message : "Erreur inconnue")
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    const t = setTimeout(() => { void load(ac.signal) }, 0)
    return () => { clearTimeout(t); ac.abort() }
  }, [load])

  const retry = useCallback(() => {
    void load(new AbortController().signal)
  }, [load])

  const brandColors = useMemo(() => {
    const map: Record<string, string> = {}
    for (const b of data?.brands ?? []) map[b.name] = b.color
    return map
  }, [data])

  if (error && !data) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState message={error} retry={retry} />
      </div>
    )
  }
  if (!data) return <TabSkeleton title="Chargement de la veille…" />

  const counts = {
    CRITICAL: data.alerts.filter(a => a.severity === "CRITICAL").length,
    MEDIUM: data.alerts.filter(a => a.severity === "MEDIUM").length,
    INFO: data.alerts.filter(a => a.severity === "INFO").length,
  }

  // Données du graphique des mouvements (A.7.2) : aires empilées + courbe re-brandings
  const chartData = data.stats.months.map((m, i) => ({
    mois: m,
    "Ouvertures": data.stats.openings[i] ?? 0,
    "Rénovations": data.stats.renovations[i] ?? 0,
    "Fermetures": data.stats.closures[i] ?? 0,
    "Rebrandings": data.stats.rebrands[i] ?? 0,
  }))

  return (
    <motion.div
      className="space-y-4 p-4 md:p-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight md:text-2xl">
            Veille concurrentielle
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Détecter et suivre les mouvements du marché : ouvertures, rénovations, fermetures et re-brandings.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 whitespace-nowrap">
          <Radar className="h-3.5 w-3.5 text-muted-foreground" />
          {num(data.alerts.length)} alertes actives
        </Badge>
      </div>

      {/* ---------- Résumé par sévérité ---------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Alertes critiques" value={num(counts.CRITICAL)} sub="Action immédiate requise" icon={Siren} tone="danger" />
        <KpiCard label="Alertes moyennes" value={num(counts.MEDIUM)} sub="À surveiller de près" icon={Bell} tone="warning" />
        <KpiCard label="Alertes info" value={num(counts.INFO)} sub="Pour information" icon={Info} tone="success" />
      </div>

      {/* ---------- Alertes actives (A.7.1) ---------- */}
      <AlertsTimeline alerts={data.alerts} brandColors={brandColors} />

      {/* ---------- Relances de fraîcheur J+7 (T43, cahier §3.2) ---------- */}
      <RelancesCard />

      {/* ---------- Mouvements 12 mois (A.7.2) ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Mouvements du marché — 12 derniers mois</CardTitle>
          <CardDescription>
            Ouvertures, rénovations et fermetures (aires empilées) · re-brandings (courbe)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72" role="img" aria-label="Mouvements du marché sur les 12 derniers mois">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.grid} />
                <XAxis dataKey="mois" tick={{ ...TICK, fill: palette.axis }} interval={0} axisLine={false} tickLine={false} />
                <YAxis tick={{ ...TICK, fill: palette.axis }} axisLine={false} tickLine={false} width={38} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle()} formatter={(v, n) => [num(Number(v)), String(n)]} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
                <Area type="monotone" dataKey="Ouvertures" stackId="mv" stroke={palette.color(1)} fill={palette.color(1)} fillOpacity={0.5} />
                <Area type="monotone" dataKey="Rénovations" stackId="mv" stroke={palette.color(2)} fill={palette.color(2)} fillOpacity={0.5} />
                <Area type="monotone" dataKey="Fermetures" stackId="mv" stroke={palette.color(4)} fill={palette.color(4)} fillOpacity={0.5} />
                <Line type="monotone" dataKey="Rebrandings" stroke={palette.color(3)} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Historique des mouvements (A.7.3) ---------- */}
      <MovementsHistory movements={data.movements} brandColors={brandColors} />
    </motion.div>
  )
}
