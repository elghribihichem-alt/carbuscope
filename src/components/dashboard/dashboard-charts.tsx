'use client'

// CarbuScope — Graphiques du tableau de bord (module A.2.4)
// Histogramme gouvernorats, courbe services 5 ans, doughnut part de marché,
// barres empilées des mouvements concurrentiels 12 mois.

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts"
import { tooltipStyle, num, pct } from "@/lib/chart"
import { useChartPalette } from "@/hooks/use-chart-palette"
import type * as React from "react"
import { cn } from "@/lib/utils"
import { growthRate } from "./dashboard-utils"
import type { GouvernoratStatRow, MarketShareRow, MovementsStats, ServicesEvolution } from "@/lib/types"

/**
 * Palette sémantique du tableau de bord (T41 phase 6) : mine → color(1),
 * concurrent → gris neutre color(5), ambre → color(2), rouge → color(4),
 * prune → color(3) — les couleurs suivent le thème actif via useChartPalette.
 */
function useDashboardColors() {
  const palette = useChartPalette()
  return {
    palette,
    C: {
      mine: palette.color(1),
      concurrent: palette.color(5),
      ambre: palette.color(2),
      rouge: palette.color(4),
      prune: palette.color(3),
    },
  }
}
const LEGEND = { fontSize: 11, paddingTop: 6 }

// ---------------------------------------------------------------------------
// Histogramme : répartition des stations par gouvernorat (empilé mes / concurrents)
// ---------------------------------------------------------------------------
export function GouvBarChart({ rows, brandName }: { rows: GouvernoratStatRow[]; brandName: string }) {
  const { palette, C } = useDashboardColors()
  const TICK = { fontSize: 10, fill: palette.axis }
  // Recharts applique `angle` aux ticks à l'exécution mais ne l'expose pas dans ses types.
  const ANGLED_TICK = {
    ...TICK,
    angle: -35,
    textAnchor: "end",
  } as React.SVGProps<SVGTextElement>
  const data = rows.slice(0, 12).map(r => ({
    gouvernorat: r.gouvernorat,
    "Mes stations": r.mine,
    "Concurrents": r.competitors,
  }))
  return (
    <div className="h-72" role="img" aria-label={`Répartition des stations ${brandName} et concurrentes par gouvernorat`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.grid} />
          <XAxis
            dataKey="gouvernorat"
            tick={ANGLED_TICK}
            interval={0}
            height={58}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={TICK} axisLine={false} tickLine={false} width={38} allowDecimals={false} />
          <Tooltip
            contentStyle={tooltipStyle()}
            cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
            formatter={(v, n) => [num(Number(v)), String(n)]}
          />
          <Legend wrapperStyle={LEGEND} iconType="circle" iconSize={8} />
          <Bar dataKey="Mes stations" name={`Mes stations ${brandName}`} stackId="g" fill={C.mine} maxBarSize={26} />
          <Bar dataKey="Concurrents" stackId="g" fill={C.concurrent} radius={[3, 3, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Courbe : évolution des services sur 5 ans (6 services les plus dynamiques)
// ---------------------------------------------------------------------------
export function ServicesLineChart({ data }: { data: ServicesEvolution }) {
  const { palette } = useDashboardColors()
  const TICK = { fontSize: 10, fill: palette.axis }
  const series = [...data.series]
    .sort((a, b) => growthRate(b.values) - growthRate(a.values))
    .slice(0, 6)
  const chartData = data.years.map((y, i) => {
    const row: Record<string, number | string> = { annee: String(y) }
    for (const s of series) row[s.service] = s.values[i] ?? 0
    return row
  })
  return (
    <div className="h-72" role="img" aria-label="Évolution du nombre de stations équipées par service sur 5 ans">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.grid} />
          <XAxis dataKey="annee" tick={TICK} axisLine={false} tickLine={false} />
          <YAxis tick={TICK} axisLine={false} tickLine={false} width={38} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle()} formatter={(v, n) => [num(Number(v)), String(n)]} />
          <Legend wrapperStyle={LEGEND} iconType="circle" iconSize={8} />
          {series.map((s, i) => (
            <Line
              key={s.service}
              type="monotone"
              dataKey={s.service}
              stroke={palette.color(i + 1)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Doughnut : part de marché par enseigne (total national au centre)
// ---------------------------------------------------------------------------
export function MarketShareDonut({
  rows, totalNational, mySlug,
}: { rows: MarketShareRow[]; totalNational: number; mySlug: string }) {
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
      <div className="relative h-60 w-full max-w-[240px] shrink-0" role="img" aria-label="Part de marché par enseigne">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              contentStyle={tooltipStyle()}
              formatter={(v, n) => [`${num(Number(v))} stations`, String(n)]}
            />
            <Pie
              data={rows}
              dataKey="stations"
              nameKey="brand"
              innerRadius="60%"
              outerRadius="88%"
              paddingAngle={1.5}
              stroke="var(--card)"
              strokeWidth={2}
            >
              {rows.map(r => <Cell key={r.slug} fill={r.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-bold tabular-nums leading-none">{num(totalNational)}</p>
          <p className="mt-1 text-center text-[10px] uppercase leading-tight tracking-wide text-muted-foreground">
            stations<br />au national
          </p>
        </div>
      </div>
      <ul className="grid w-full gap-1.5" aria-label="Légende part de marché">
        {rows.map(r => (
          <li
            key={r.slug}
            className={cn(
              "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
              r.slug === mySlug ? "border-primary/40 bg-primary/5 font-semibold" : "border-transparent"
            )}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {r.brand}
              {r.slug === mySlug && <span className="ml-1.5 text-[10px] font-normal text-primary">(mon enseigne)</span>}
            </span>
            <span className="tabular-nums text-muted-foreground">{pct(r.sharePct)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Barres empilées : mouvements concurrentiels sur 12 mois
// ---------------------------------------------------------------------------
export function MovementsBarChart({ data }: { data: MovementsStats }) {
  const { palette, C } = useDashboardColors()
  const TICK = { fontSize: 10, fill: palette.axis }
  const chartData = data.months.map((m, i) => ({
    mois: m,
    "Ouvertures": data.openings[i] ?? 0,
    "Rénovations": data.renovations[i] ?? 0,
    "Fermetures": data.closures[i] ?? 0,
    "Rebrandings": data.rebrands[i] ?? 0,
  }))
  return (
    <div className="h-72" role="img" aria-label="Mouvements concurrentiels sur les 12 derniers mois">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.grid} />
          <XAxis dataKey="mois" tick={TICK} interval={0} axisLine={false} tickLine={false} />
          <YAxis tick={TICK} axisLine={false} tickLine={false} width={38} allowDecimals={false} />
          <Tooltip
            contentStyle={tooltipStyle()}
            cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
            formatter={(v, n) => [num(Number(v)), String(n)]}
          />
          <Legend wrapperStyle={LEGEND} iconType="circle" iconSize={8} />
          <Bar dataKey="Ouvertures" stackId="mv" fill={C.mine} maxBarSize={26} />
          <Bar dataKey="Rénovations" stackId="mv" fill={C.ambre} maxBarSize={26} />
          <Bar dataKey="Fermetures" stackId="mv" fill={C.rouge} maxBarSize={26} />
          <Bar dataKey="Rebrandings" stackId="mv" fill={C.prune} radius={[3, 3, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
