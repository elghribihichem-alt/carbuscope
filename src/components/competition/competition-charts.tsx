'use client'

// CarbuScope — graphiques du module Concurrence (A.5.2).
// Doughnut part de marché · barres horizontales densité de services · aire lissée ouvertures 12 mois.

import * as React from "react"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis,
} from "recharts"
import { ChartContainer } from "@/components/ui/chart"
import { SERVICE_LABELS } from "@/lib/types"
import type { CompetitionStats, MarketShareRow } from "@/lib/types"
import { num, tooltipStyle } from "@/lib/chart"

const SLATE = "#94a3b8" // ardoise clair — concurrents
const EMERALD = "#059669" // émeraude — mon réseau

export function fmtPct(v: number): string {
  return `${v.toFixed(1).replace(".", ",")} %`
}

type TipFnProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }

function ChartTip({ title, rows }: { title: React.ReactNode; rows: { name: string; value: string; color?: string }[] }) {
  return (
    <div className="px-3 py-2 text-xs" style={tooltipStyle()}>
      <p className="mb-1 font-medium text-popover-foreground">{title}</p>
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-6">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              {r.color ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} aria-hidden /> : null}
              {r.name}
            </span>
            <span className="font-semibold tabular-nums text-popover-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Doughnut : part de marché par enseigne ---------------- */

export function MarketShareDoughnut({ rows, mySlug }: { rows: MarketShareRow[]; mySlug: string }) {
  const myRow = rows.find((r) => r.slug === mySlug)

  const renderTip = (props: TipFnProps) => {
    if (!props.active || !props.payload?.length) return null
    const row = props.payload[0]?.payload as MarketShareRow | undefined
    if (!row) return null
    return (
      <ChartTip
        title={row.brand}
        rows={[
          { name: "Stations", value: num(row.stations), color: row.color },
          { name: "Part de marché", value: fmtPct(row.sharePct), color: row.color },
        ]}
      />
    )
  }

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[300px]">
      <ChartContainer config={{}} className="aspect-square h-full w-full">
        <PieChart>
          <Tooltip content={renderTip} />
          <Pie
            data={rows}
            dataKey="sharePct"
            nameKey="brand"
            innerRadius="60%"
            outerRadius="88%"
            paddingAngle={2}
            minAngle={2}
          >
            {rows.map((r) => (
              <Cell key={r.slug} fill={r.color} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-2xl font-bold tabular-nums leading-none">{myRow ? fmtPct(myRow.sharePct) : "—"}</p>
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          mon réseau · {myRow ? num(myRow.stations) : "?"} stations
        </p>
      </div>
    </div>
  )
}

/* ------- Barres horizontales groupées : densité de services concurrents ------- */

export function ServicesDensityChart({ data }: { data: CompetitionStats["servicesDensity"] }) {
  const rows = data.map((d) => ({
    service: SERVICE_LABELS[d.service] ?? d.service,
    concurrents: d.competitorsPct,
    monReseau: d.minePct,
  }))

  const renderTip = (props: TipFnProps) => {
    if (!props.active || !props.payload?.length) return null
    const row = props.payload[0]?.payload as (typeof rows)[number] | undefined
    if (!row) return null
    return (
      <ChartTip
        title={row.service}
        rows={[
          { name: "Concurrents", value: fmtPct(row.concurrents), color: SLATE },
          { name: "Mon réseau", value: fmtPct(row.monReseau), color: EMERALD },
        ]}
      />
    )
  }

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SLATE }} aria-hidden />
          Concurrents
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: EMERALD }} aria-hidden />
          Mon réseau
        </span>
      </div>
      <ChartContainer config={{}} className="aspect-auto h-[304px] w-full">
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }} barGap={3}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v: number) => `${v} %`}
            tickLine={false}
            axisLine={false}
          />
          <YAxis type="category" dataKey="service" width={104} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <Tooltip content={renderTip} />
          <Bar dataKey="concurrents" name="Concurrents" fill={SLATE} radius={[0, 3, 3, 0]} barSize={10} />
          <Bar dataKey="monReseau" name="Mon réseau" fill={EMERALD} radius={[0, 3, 3, 0]} barSize={10} />
        </BarChart>
      </ChartContainer>
    </div>
  )
}

/* ------------- Aire lissée : ouvertures concurrentes sur 12 mois ------------- */

export function OpeningsAreaChart({ months, values }: { months: string[]; values: number[] }) {
  const gradientId = React.useId().replace(/[^a-zA-Z0-9]/g, "")
  const rows = months.map((m, i) => ({ mois: m, ouvertures: values[i] ?? 0 }))

  const renderTip = (props: TipFnProps) => {
    if (!props.active || !props.payload?.length) return null
    const row = props.payload[0]?.payload as (typeof rows)[number] | undefined
    if (!row) return null
    return <ChartTip title={row.mois} rows={[{ name: "Ouvertures concurrentes", value: num(row.ouvertures), color: EMERALD }]} />
  }

  return (
    <ChartContainer config={{}} className="aspect-video h-auto w-full">
      <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={EMERALD} stopOpacity={0.32} />
            <stop offset="100%" stopColor={EMERALD} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="mois" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} width={26} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <Tooltip content={renderTip} />
        <Area
          type="monotone"
          dataKey="ouvertures"
          name="Ouvertures"
          stroke={EMERALD}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ChartContainer>
  )
}
