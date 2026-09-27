'use client'

// Shadow Market — Analyse d'Impact, onglet « ⚖️ Cannibalisation » (T44-d).
// Croisement trafic captif officiel (traffic × 8 L) vs volume capté informel :
// barres comparées, jauge RadialBar du ratio, densité par anneau, mini-carte
// schématique SVG (cercles concentriques, points positionnés par distance
// réelle — angle déterministe) et texte d'analyse automatique.

import { useMemo } from "react"
import { Fuel, Scale, Users } from "lucide-react"
import type { ShadowMapStationDTO, ShadowStationImpactResponse, ShadowTypologyDTO } from "@/lib/types"
import { Bar, BarChart, CartesianGrid, Cell, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorState, TabSkeleton } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import {
  AssumptionNote, ShadowKpiCard, formatLJ, formatTnd, typologyLabel,
} from "../shadow-shared"
import {
  LITERS_PER_VEHICLE, RINGS, StationPicker, TipRow, TipShell, ringIndex,
} from "./impact-shared"

/** Angle déterministe (0–360°) dérivé du code du point — stable entre rendus. */
function angleFromCode(code: string): number {
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 360
  return h
}

const fmtPct = (v: number) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`

export function TabCannibalisation({
  stations, typologies, selectedCode, onSelect, impact, impactError,
}: {
  stations: ShadowMapStationDTO[]
  typologies: ShadowTypologyDTO[]
  selectedCode: string | null
  onSelect: (code: string) => void
  impact: ShadowStationImpactResponse | null
  impactError: string | null
}) {
  // Volume officiel captif de la station (L/j) : trafic × 8 L/véh./j.
  const officialLJ = impact ? impact.station.traffic * LITERS_PER_VEHICLE : 0
  const informalLJ = impact?.volumeStolenLJ ?? 0
  const ratioPct = impact?.capturedPct ?? 0
  const totalMarket = officialLJ + informalLJ

  const compareRows = useMemo(
    () =>
      impact
        ? [
            { name: "Trafic captif officiel", volume: Math.round(officialLJ), color: "#4CAF50" },
            { name: "Volume capté informel", volume: Math.round(informalLJ), color: "#E53935" },
          ]
        : [],
    [impact, officialLJ, informalLJ],
  )

  const rings = useMemo(() => {
    if (impact === null) return RINGS.map((r) => ({ ...r, points: 0 }))
    return RINGS.map((r, i) => ({
      ...r,
      points: impact.points.filter((p) => ringIndex(p.distanceM) === i).length,
    }))
  }, [impact])

  // Points pour la mini-carte (distance réelle, angle déterministe).
  const mapPoints = useMemo(() => {
    if (impact === null) return []
    return impact.points
      .map((p) => {
        const angle = (angleFromCode(p.code) * Math.PI) / 180
        const radius = Math.min(1, p.distanceM / 2000) * 140 // 2 km → 140 px
        return {
          ...p,
          x: 160 + radius * Math.cos(angle),
          y: 160 + radius * Math.sin(angle),
          color: typologies.find((t) => t.code === p.typologyCode)?.color ?? "#9E9E9E",
        }
      })
      .sort((a, b) => a.distanceM - b.distanceM)
  }, [impact, typologies])

  if (impactError !== null) {
    return (
      <div className="space-y-4">
        <StationPicker stations={stations} selectedCode={selectedCode} onSelect={onSelect} />
        <ErrorState message={impactError} retry={() => onSelect(selectedCode ?? stations[0]?.code ?? "")} />
      </div>
    )
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <StationPicker stations={stations} selectedCode={selectedCode} onSelect={onSelect} />

      <div className="space-y-4">
        {impact === null ? (
          <TabSkeleton title="Croisement des trafics pour la station sélectionnée…" />
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold">
                  ⚖️ Cannibalisation — {impact.station.name}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {impact.station.brandName} · {impact.station.delegation}
                  </span>
                </p>
                <p className="mt-1 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                  La station <strong>{impact.station.name}</strong> perd <strong style={{ color: "#E53935" }}>{formatTnd(impact.lossTnd)}/mois</strong>,
                  soit <strong>{fmtPct(impact.capturedPct)}</strong> de son trafic captif —{" "}
                  {num(impact.points.length)} point{impact.points.length > 1 ? "s" : ""} informel{impact.points.length > 1 ? "s" : ""} dont{" "}
                  <strong>{num(rings[0].points)}</strong> à moins de 500 m, <strong>{num(rings[1].points)}</strong> entre 500 m et 1 km
                  et <strong>{num(rings[2].points)}</strong> entre 1 et 2 km. Le marché informel capte{" "}
                  <strong>{formatLJ(impact.volumeStolenLJ)}</strong> contre un trafic captif officiel de{" "}
                  <strong>{formatLJ(officialLJ)}</strong> (≈ {num(impact.station.traffic)} véh./j × {LITERS_PER_VEHICLE} L).
                </p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <ShadowKpiCard value={fmtPct(ratioPct)} label="Ratio de cannibalisation" sub="part du marché captée" tone={ratioPct >= 20 ? "red" : ratioPct >= 8 ? "orange" : "yellow"} icon={Scale} />
              <ShadowKpiCard value={formatLJ(officialLJ)} label="Trafic captif officiel" sub={`${num(impact.station.traffic)} véh./j × ${LITERS_PER_VEHICLE} L`} tone="green" icon={Fuel} />
              <ShadowKpiCard value={formatLJ(informalLJ)} label="Volume capté informel" sub="litres/jour détournés" tone="red" icon={Users} />
              <ShadowKpiCard value={num(totalMarket > 0 ? Math.round((informalLJ / totalMarket) * 100) : 0) + " %"} label="Part informelle du bassin" sub="officiel + parallèle" tone="orange" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Comparaison officiel vs informel */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Trafic captif officiel vs volume capté informel</CardTitle>
                  <p className="text-xs text-muted-foreground">Litres/jour — le bas de la barre compare les deux canaux.</p>
                </CardHeader>
                <CardContent>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={compareRows} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
                        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          type="number"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickFormatter={(v: number) => `${num(v / 1000)}K L`}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={130}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        />
                        <Tooltip
                          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                          content={({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) => {
                            if (!active || !payload?.length) return null
                            const row = payload[0]?.payload as (typeof compareRows)[number] | undefined
                            if (!row) return null
                            return (
                              <TipShell title={row.name}>
                                <TipRow label="Volume" value={formatLJ(row.volume)} color={row.color} />
                              </TipShell>
                            )
                          }}
                        />
                        <Bar dataKey="volume" name="Volume" barSize={26} radius={[0, 4, 4, 0]}>
                          {compareRows.map((r) => (
                            <Cell key={r.name} fill={r.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Jauge */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Ratio de cannibalisation</CardTitle>
                  <p className="text-xs text-muted-foreground">Volume informel / marché total du bassin de la station.</p>
                </CardHeader>
                <CardContent>
                  <div className="relative h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadialBarChart
                        data={[{ name: "ratio", value: Math.min(100, Math.max(0, ratioPct)) }]}
                        innerRadius="66%"
                        outerRadius="100%"
                        startAngle={210}
                        endAngle={-30}
                      >
                        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                        <RadialBar
                          dataKey="value"
                          cornerRadius={8}
                          background={{ fill: "var(--muted)" }}
                          fill={ratioPct >= 20 ? "#E53935" : ratioPct >= 8 ? "#FF9800" : "#FFC107"}
                        />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-3xl font-bold tabular-nums">{fmtPct(ratioPct)}</p>
                      <p className="text-[11px] text-muted-foreground">du trafic capté</p>
                    </div>
                  </div>
                  <p className="text-center text-[11px] text-muted-foreground">
                    {ratioPct >= 20
                      ? "Cannibalisation critique — survie de la station menacée."
                      : ratioPct >= 8
                        ? "Cannibalisation modérée — marge durablement entamée."
                        : "Cannibalisation contenue — vigilance de routine."}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              {/* Densité par anneau */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Densité informelle par anneau</CardTitle>
                  <p className="text-xs text-muted-foreground">Nombre de points à 500 m / 1 km / 2 km.</p>
                </CardHeader>
                <CardContent>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rings} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="short"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        />
                        <YAxis
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                          width={26}
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        />
                        <Tooltip
                          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                          content={({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) => {
                            if (!active || !payload?.length) return null
                            const row = payload[0]?.payload as (typeof rings)[number] | undefined
                            if (!row) return null
                            return (
                              <TipShell title={row.label}>
                                <TipRow label="Points" value={num(row.points)} color={row.color} />
                              </TipShell>
                            )
                          }}
                        />
                        <Bar dataKey="points" name="Points" barSize={42} radius={[4, 4, 0, 0]}>
                          {rings.map((r) => (
                            <Cell key={r.label} fill={r.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Mini-carte schématique */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Mini-carte schématique — {impact.station.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Cercles concentriques 500 m / 1 km / 2 km — position des points par distance réelle (angle fictif déterministe).
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center gap-3 sm:flex-row">
                    <svg
                      viewBox="0 0 320 320"
                      className="h-64 w-64 shrink-0"
                      role="img"
                      aria-label={`Schéma des ${mapPoints.length} points informels autour de la station ${impact.station.name}`}
                    >
                      {/* Anneaux */}
                      {[500, 1000, 2000].map((m, i) => {
                        const r = (m / 2000) * 140
                        return (
                          <g key={m}>
                            <circle
                              cx={160}
                              cy={160}
                              r={r}
                              fill={i === 0 ? "#E5393508" : i === 1 ? "#FF980008" : "#FFC10708"}
                              stroke={RINGS[i].color}
                              strokeDasharray="4 4"
                              strokeWidth={1}
                            />
                            <text x={164} y={160 - r + 10} fontSize={8} fill="var(--muted-foreground)">
                              {m >= 1000 ? `${m / 1000} km` : `${m} m`}
                            </text>
                          </g>
                        )
                      })}
                      {/* Station au centre */}
                      <circle cx={160} cy={160} r={9} fill={impact.station.brandColor} stroke="var(--background)" strokeWidth={2} />
                      <text x={160} y={184} fontSize={8} fill="var(--muted-foreground)" textAnchor="middle">
                        station
                      </text>
                      {/* Points informels */}
                      {mapPoints.map((p) => (
                        <g key={p.id}>
                          <circle cx={p.x} cy={p.y} r={4} fill={p.color} stroke="var(--background)" strokeWidth={1}>
                            <title>{`${p.code} — ${typologyLabel(p.typologyCode)} · ${p.distanceM} m`}</title>
                          </circle>
                          {p.distanceM < 500 ? (
                            <circle cx={p.x} cy={p.y} r={7} fill="none" stroke={p.color} strokeOpacity={0.5} />
                          ) : null}
                        </g>
                      ))}
                    </svg>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="text-[11px] font-medium text-muted-foreground">Légende (typologies)</p>
                      <ul className="space-y-1">
                        {[...new Set(mapPoints.map((p) => p.typologyCode))].map((code) => (
                          <li key={code} className="flex items-center justify-between gap-2 text-xs">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: typologies.find((t) => t.code === code)?.color ?? "#9E9E9E" }}
                                aria-hidden
                              />
                              <span className="truncate">{typologyLabel(code)}</span>
                            </span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {num(mapPoints.filter((p) => p.typologyCode === code).length)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground">
                        Les points cerclés sont à moins de 500 m — seuil d&apos;alerte automatique.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <AssumptionNote>
              Trafic captif officiel = trafic journalier × {LITERS_PER_VEHICLE} L/véh./j (hypothèse pédagogique) ; le volume
              informel est la somme des captures attribuées (1 − d/2 km, plafond 3 stations). La mini-carte est
              schématique : les distances sont réelles, les angles sont fictifs mais stables (dérivés du code du point).
            </AssumptionNote>
          </>
        )}
      </div>
    </div>
  )
}
