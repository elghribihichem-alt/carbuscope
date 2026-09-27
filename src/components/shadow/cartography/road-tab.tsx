"use client"

// Shadow Market (T44-c) — onglet « 🛣️ Par Axe Routier » : vue linéaire
// schématique d'un axe (points projetés sur l'axe, distance le long de l'axe
// en km, écart latéral au-dessus/en-dessous) + carte avec le tracé et les
// points à moins de 3 km + barres de perte par axe.

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, type TooltipProps,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { ShadowMapResponse, ShadowPointDTO } from "@/lib/types"
import { tooltipStyle } from "@/lib/chart"
import { formatTnd, formatLJ, TypologyIcon, typologyLabel, SHADOW_COLORS } from "@/components/shadow/shadow-shared"
import { ShadowMap, type RoadTrace } from "./shadow-map"
import { projectOnPolyline, polylineLengthKm } from "./shadow-cart-utils"
import { Loader2, Route, Gauge, TriangleAlert } from "lucide-react"

const ROAD_TYPE_STYLES: Record<string, { color: string; label: string }> = {
  AUTOROUTE: { color: "#d97706", label: "Autoroute" },
  RN: { color: "#e07856", label: "Route nationale" },
  GP: { color: "#9ca3af", label: "Grand chemin" },
}

interface LinearPoint {
  p: ShadowPointDTO
  alongKm: number
  lateralKm: number
  distanceKm: number
}

export function RoadTab({ data }: { data: ShadowMapResponse }) {
  // Segments géométriques des axes — chargés paresseusement (une seule fois)
  const [segments, setSegments] = useState<Record<string, [number, number][]> | null>(null)
  const [segError, setSegError] = useState<string | null>(null)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)

  const loadSegments = useCallback(async (signal: AbortSignal) => {
    try {
      const r = await fetch("/api/roads", { signal })
      if (!r.ok) throw new Error(`API /api/roads [${r.status}]`)
      const d = (await r.json()) as { roads: { code: string; segments: [number, number][] }[] }
      const m: Record<string, [number, number][]> = {}
      for (const rd of d.roads) m[rd.code] = rd.segments
      setSegments(m)
      setSegError(null)
    } catch (e) {
      if (signal.aborted) return
      setSegError(e instanceof Error ? e.message : "Erreur inconnue")
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    const t = setTimeout(() => { void loadSegments(ac.signal) }, 0)
    return () => { clearTimeout(t); ac.abort() }
  }, [loadSegments])

  const roads = useMemo(() => [...data.roads].sort((a, b) => b.lossTnd - a.lossTnd), [data.roads])
  const selectedRoad = selectedCode ? data.roads.find(r => r.code === selectedCode) ?? null : null
  const effective = selectedRoad ?? roads[0] ?? null

  const roadSegments = effective && segments ? segments[effective.code] ?? null : null

  // ----- Points à moins de 3 km de l'axe sélectionné + projection linéaire -----
  const nearPoints = useMemo(() => {
    if (!roadSegments) return { pts: [] as ShadowPointDTO[], linear: [] as LinearPoint[] }
    const pts: ShadowPointDTO[] = []
    const linear: LinearPoint[] = []
    for (const p of data.points) {
      const proj = projectOnPolyline(p.lng, p.lat, roadSegments)
      if (proj.distanceKm <= 3) {
        pts.push(p)
        linear.push({ p, alongKm: proj.alongKm, lateralKm: proj.lateralKm, distanceKm: proj.distanceKm })
      }
    }
    return { pts, linear }
  }, [roadSegments, data.points])

  const totalKm = roadSegments ? polylineLengthKm(roadSegments) : 0

  const roadTrace = useMemo<RoadTrace | null>(
    () => (effective && roadSegments ? { code: effective.code, type: effective.type, segments: roadSegments } : null),
    [effective, roadSegments]
  )
  const roadFocus = useMemo(() => {
    if (!roadSegments || !roadSegments.length) return null
    const mid = roadSegments[Math.floor(roadSegments.length / 2)]
    // km = demi-largeur souhaitée : ~ toute la longueur de l'axe dans le cadre
    return { lat: mid[1], lng: mid[0], km: Math.max(totalKm / 2.2, 12) }
  }, [roadSegments, totalKm])

  const chartData = roads.map(r => ({
    code: r.code,
    name: r.name.length > 34 ? `${r.name.slice(0, 32)}…` : r.name,
    perte: r.lossTnd,
    points: r.points,
    type: r.type,
    color: ROAD_TYPE_STYLES[r.type]?.color ?? SHADOW_COLORS.gray,
  }))

  return (
    <div className="space-y-4">
      {/* ---------- Sélection d'axe + barres de perte ---------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Perte mensuelle par axe routier</CardTitle>
            <CardDescription>
              {roads.length} axes suivis · cliquez une barre ou un axe de la liste pour l&apos;analyser
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64" role="img" aria-label="Perte mensuelle par axe routier">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 12, left: 42, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="code" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false} tickLine={false} width={70}
                    tickFormatter={(v: number) => formatTnd(v)}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    content={({ active, payload }: TooltipProps<number, string>) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload as (typeof chartData)[number]
                      return (
                        <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg" style={tooltipStyle()}>
                          <p className="font-semibold text-popover-foreground">{d.code} — {d.name}</p>
                          <p className="mt-0.5 text-muted-foreground">
                            {formatTnd(d.perte)}/mois · {d.points} points · {ROAD_TYPE_STYLES[d.type]?.label ?? d.type}
                          </p>
                        </div>
                      )
                    }}
                  />
                  <Bar
                    dataKey="perte"
                    radius={[4, 4, 0, 0]}
                    onClick={state => { const code = (state as { code?: string })?.code; if (code) setSelectedCode(code) }}
                    className="cursor-pointer"
                  >
                    {chartData.map(d => (
                      <Cell
                        key={d.code}
                        fill={d.code === effective?.code ? d.color : `${d.color}66`}
                        stroke={d.code === effective?.code ? d.color : "transparent"}
                        strokeWidth={d.code === effective?.code ? 1.5 : 0}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Liste des axes */}
        <Card>
          <CardHeader>
            <CardTitle>Axes routiers</CardTitle>
            <CardDescription>Triés par perte — trafic moyen journalier (TMJ)</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="max-h-64 space-y-1 overflow-y-auto pr-1.5 scroll-coffee">
              {roads.map(r => {
                const active = effective?.code === r.code
                const style = ROAD_TYPE_STYLES[r.type] ?? ROAD_TYPE_STYLES.GP
                return (
                  <li key={r.code}>
                    <button
                      type="button"
                      onClick={() => setSelectedCode(r.code)}
                      aria-pressed={active}
                      className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                        active
                          ? "border-stone-400 bg-accent/70 dark:border-stone-500"
                          : "border-transparent hover:border-stone-200 hover:bg-accent/50 dark:hover:border-stone-700"
                      }`}
                    >
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${style.color}22`, color: style.color }}>
                        {r.code}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-stone-900 dark:text-stone-50">{r.name}</span>
                        <span className="block text-[10px] tabular-nums text-muted-foreground">
                          {r.points} pts · TMJ {r.tmj.toLocaleString("fr-FR")}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: SHADOW_COLORS.red }}>{formatTnd(r.lossTnd)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* ---------- Carte + vue linéaire de l'axe sélectionné ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Route className="h-4 w-4 text-muted-foreground" aria-hidden />
                {effective ? `${effective.code} — ${effective.name}` : "Axe routier"}
              </CardTitle>
              <CardDescription>
                {effective && (
                  <>
                    {ROAD_TYPE_STYLES[effective.type]?.label ?? effective.type} · TMJ {effective.tmj.toLocaleString("fr-FR")} véh./j ·{" "}
                    {nearPoints.pts.length} points à moins de 3 km · {formatTnd(effective.lossTnd)}/mois
                  </>
                )}
              </CardDescription>
            </div>
            {effective && (
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-1.5">
                  <Gauge className="h-3 w-3" aria-hidden />
                  {Math.round(totalKm)} km suivis
                </Badge>
                <Badge variant="outline" className="gap-1.5 border-[#E53935]/40 text-[#E53935]">
                  <TriangleAlert className="h-3 w-3" aria-hidden />
                  {formatTnd(effective.lossTnd)}/mois
                </Badge>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {segError && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Impossible de charger le tracé des axes ({segError}) — la vue linéaire est indisponible.
            </p>
          )}
          {!segments && !segError && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Chargement du tracé des axes routiers…
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ShadowMap
                points={nearPoints.pts}
                typologies={data.typologies}
                roadTrace={roadTrace}
                focusOn={roadFocus}
                csvContext={effective ? `axe-${effective.code.toLowerCase()}` : "axe"}
                height="h-[460px]"
              />
            </div>
            <div className="lg:col-span-2">
              <LinearAxisView
                points={nearPoints.linear}
                totalKm={totalKm}
                code={effective?.code ?? ""}
                typologyColors={typologyColorMap(data.typologies)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vue linéaire schématique de l'axe
// ---------------------------------------------------------------------------

const LINEAR_W = 560
const LINEAR_H = 240
const AXIS_Y = LINEAR_H / 2
const MAX_LAT_KM = 2.6 // écart latéral maximal représenté
const PX_PER_KM_Y = 78

function typologyColorMap(typologies: ShadowMapResponse["typologies"]): Record<string, string> {
  const m: Record<string, string> = {
    BIDONS: "#FF9800", KIOSQUE: "#FFC107", CAMION_CITERNE: "#E53935",
    STATION_PIRATE: "#B71C1C", GARAGE: "#FF7043", EPICERIE: "#9E9E9E",
  }
  for (const t of typologies) if (t.color) m[t.code] = t.color
  return m
}

function LinearAxisView({
  points, totalKm, code, typologyColors,
}: {
  points: LinearPoint[]
  totalKm: number
  code: string
  typologyColors: Record<string, string>
}) {
  const scale = (km: number) => (totalKm > 0 ? (km / totalKm) * (LINEAR_W - 28) + 14 : 14)
  const yOf = (latKm: number) => {
    const clamped = Math.max(-MAX_LAT_KM, Math.min(MAX_LAT_KM, latKm))
    return AXIS_Y - (clamped / MAX_LAT_KM) * PX_PER_KM_Y
  }
  const step = totalKm > 400 ? 100 : totalKm > 150 ? 50 : totalKm > 60 ? 20 : 10
  const ticks: number[] = []
  for (let km = 0; km <= totalKm; km += step) ticks.push(km)

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 dark:border-stone-800 dark:bg-stone-900/60">
      <p className="mb-1 text-xs font-semibold text-stone-700 dark:text-stone-300">
        Vue linéaire {code} <span className="font-normal text-muted-foreground">· {points.length} pts · ≤ 3 km de l&apos;axe</span>
      </p>
      <svg viewBox={`0 0 ${LINEAR_W} ${LINEAR_H}`} className="h-auto w-full" role="img" aria-label={`Vue linéaire schématique de l'axe ${code} — points informels positionnés par distance le long de l'axe`}>
        {/* bande latérale ±3 km */}
        <rect x={10} y={AXIS_Y - PX_PER_KM_Y} width={LINEAR_W - 20} height={PX_PER_KM_Y * 2} rx={8} fill="var(--muted)" opacity={0.45} />
        <line x1={10} y1={AXIS_Y - PX_PER_KM_Y / 2} x2={LINEAR_W - 10} y2={AXIS_Y - PX_PER_KM_Y / 2} stroke="var(--border)" strokeDasharray="3 4" />
        <line x1={10} y1={AXIS_Y + PX_PER_KM_Y / 2} x2={LINEAR_W - 10} y2={AXIS_Y + PX_PER_KM_Y / 2} stroke="var(--border)" strokeDasharray="3 4" />
        {/* échelle latérale */}
        <text x={14} y={AXIS_Y - PX_PER_KM_Y + 12} fontSize={9} fill="var(--muted-foreground)">− 2,6 km (ouest)</text>
        <text x={14} y={AXIS_Y + PX_PER_KM_Y - 4} fontSize={9} fill="var(--muted-foreground)">+ 2,6 km (est)</text>
        {/* l'axe */}
        <line x1={12} y1={AXIS_Y} x2={LINEAR_W - 12} y2={AXIS_Y} stroke="#d97706" strokeWidth={3} strokeLinecap="round" />
        {/* repères km */}
        {ticks.map(km => (
          <g key={km}>
            <line x1={scale(km)} y1={AXIS_Y - 4} x2={scale(km)} y2={AXIS_Y + 4} stroke="#d97706" strokeWidth={1.5} />
            <text x={scale(km)} y={LINEAR_H - 8} fontSize={9} textAnchor="middle" fill="var(--muted-foreground)">{km} km</text>
          </g>
        ))}
        {/* points projetés */}
        {points.map(pt => {
          const x = scale(pt.alongKm)
          const y = yOf(pt.lateralKm)
          const color = typologyColors[pt.p.typologyCode] ?? SHADOW_COLORS.gray
          const r = Math.max(2.2, Math.min(4.2, Math.sqrt(pt.p.volumeLJ) / 12))
          return (
            <g key={pt.p.id} className="cursor-help">
              <title>{`${pt.p.code} · ${typologyLabel(pt.p.typologyCode)} · ${formatLJ(pt.p.volumeLJ)} · ${formatTnd(pt.p.lossTnd)}/mois · à ${pt.distanceKm.toFixed(1)} km de l'axe (PK ${pt.alongKm.toFixed(0)})`}</title>
              <line x1={x} y1={AXIS_Y} x2={x} y2={y} stroke={color} strokeWidth={0.7} opacity={0.5} />
              <circle cx={x} cy={y} r={r} fill={color} stroke="white" strokeWidth={0.7} opacity={0.95} />
            </g>
          )
        })}
        {points.length === 0 && (
          <text x={LINEAR_W / 2} y={AXIS_Y - 14} fontSize={11} textAnchor="middle" fill="var(--muted-foreground)">
            aucun point à moins de 3 km de cet axe
          </text>
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><TypologyIcon code="BIDONS" className="h-3 w-3" />Bidons</span>
        <span className="inline-flex items-center gap-1"><TypologyIcon code="KIOSQUE" className="h-3 w-3" />Kiosque</span>
        <span className="inline-flex items-center gap-1"><TypologyIcon code="CAMION_CITERNE" className="h-3 w-3" />Camion-citerne</span>
        <span className="inline-flex items-center gap-1"><TypologyIcon code="STATION_PIRATE" className="h-3 w-3" />Station pirate</span>
        <span className="inline-flex items-center gap-1"><TypologyIcon code="GARAGE" className="h-3 w-3" />Garage</span>
        <span className="ml-auto italic">taille du point ∝ volume L/j · hauteur = écart latéral</span>
      </div>
    </div>
  )
}
