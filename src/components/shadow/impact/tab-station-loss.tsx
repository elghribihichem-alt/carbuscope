'use client'

// Shadow Market — Analyse d'Impact, onglet « 💸 Perte par Station » (T44-d).
// Sélection d'une station menacée → KPI de perte, points cannibalisateurs
// (triés par distance), camembert par typologie, barres par anneau de
// distance, stations voisines comparées.

import { useMemo } from "react"
import { Fuel, Layers, Percent, Users } from "lucide-react"
import type { ShadowMapStationDTO, ShadowStationImpactResponse, ShadowTypologyDTO } from "@/lib/types"
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ErrorState, TabSkeleton } from "@/components/shell/loading"
import { num, tooltipStyle } from "@/lib/chart"
import {
  AssumptionNote, ShadowKpiCard, ShadowLevelBadge, TypologyIcon, formatLJ, formatTnd, typologyLabel,
} from "../shadow-shared"
import { DAYS_PER_MONTH, RINGS, StationPicker, TipRow, TipShell, ringIndex } from "./impact-shared"

const fmtPct = (v: number) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`

export function TabStationLoss({
  stations, typologies, selectedCode, onSelect, impact, impactError,
}: {
  stations: ShadowMapStationDTO[]
  typologies: ShadowTypologyDTO[]
  selectedCode: string | null
  onSelect: (code: string) => void
  impact: ShadowStationImpactResponse | null
  impactError: string | null
}) {
  const margin = impact?.config.marginTndPerL ?? 0.19

  // Points cannibalisateurs triés par distance, avec perte attribuée.
  const rows = useMemo(() => {
    if (impact === null) return []
    return [...impact.points]
      .sort((a, b) => a.distanceM - b.distanceM)
      .map((p) => ({
        ...p,
        capturePct: p.volumeLJ > 0 ? (p.capturedLJ / p.volumeLJ) * 100 : 0,
        attributedLoss: p.capturedLJ * margin * DAYS_PER_MONTH,
      }))
  }, [impact, margin])

  // Perte par typologie (attribuée à cette station).
  const byTypology = useMemo(() => {
    if (impact === null) return []
    const map = new Map<string, { code: string; loss: number; count: number }>()
    for (const p of impact.points) {
      const loss = p.capturedLJ * margin * DAYS_PER_MONTH
      const cur = map.get(p.typologyCode) ?? { code: p.typologyCode, loss: 0, count: 0 }
      cur.loss += loss
      cur.count += 1
      map.set(p.typologyCode, cur)
    }
    return Array.from(map.values())
      .map((t) => ({
        ...t,
        label: typologyLabel(t.code),
        color: typologies.find((x) => x.code === t.code)?.color ?? "#9E9E9E",
      }))
      .sort((a, b) => b.loss - a.loss)
  }, [impact, margin, typologies])

  // Densité et perte par anneau de distance.
  const byRing = useMemo(() => {
    if (impact === null) return RINGS.map((r) => ({ ...r, points: 0, loss: 0 }))
    return RINGS.map((r, i) => {
      const pts = impact.points.filter((p) => ringIndex(p.distanceM) === i)
      return {
        ...r,
        points: pts.length,
        loss: pts.reduce((s, p) => s + p.capturedLJ * margin * DAYS_PER_MONTH, 0),
      }
    })
  }, [impact, margin])

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
      {/* Sélecteur */}
      <StationPicker stations={stations} selectedCode={selectedCode} onSelect={onSelect} />

      {/* Fiche station */}
      <div className="space-y-4">
        {impact === null ? (
          <TabSkeleton title="Calcul de l'impact pour la station sélectionnée…" />
        ) : (
          <>
            {/* En-tête station */}
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${impact.station.brandColor}1A`, color: impact.station.brandColor }}
                  >
                    <Fuel className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold leading-tight">{impact.station.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: impact.station.brandColor }} aria-hidden />
                        {impact.station.brandName}
                      </span>
                      <span>{impact.station.delegation} · {impact.station.gouvernorat}</span>
                      <span className="tabular-nums">trafic : {num(impact.station.traffic)} véh./j</span>
                    </p>
                  </div>
                </div>
                <ShadowLevelBadge level={impact.level} loss={impact.lossTnd} />
              </CardContent>
            </Card>

            {/* 4 KPI */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <ShadowKpiCard value={formatTnd(impact.lossTnd)} label="Perte estimée" sub="marge perdue / mois" tone="red" icon={Layers} />
              <ShadowKpiCard value={formatLJ(impact.volumeStolenLJ)} label="Volume volé" sub="litres/jour captés" tone="orange" icon={Fuel} />
              <ShadowKpiCard value={fmtPct(impact.capturedPct)} label="Trafic capté volé" sub="part du trafic informelle" tone={impact.capturedPct >= 20 ? "red" : impact.capturedPct >= 8 ? "orange" : "yellow"} icon={Percent} />
              <ShadowKpiCard value={num(impact.points.length)} label="Points dans le rayon" sub="≤ 2 km autour de la pompe" tone="yellow" icon={Users} />
            </div>

            {/* Points cannibalisateurs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Points cannibalisateurs ({rows.length}) — triés par distance</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Code</TableHead>
                        <TableHead>Typologie</TableHead>
                        <TableHead className="text-right">Distance</TableHead>
                        <TableHead className="text-right">Capture</TableHead>
                        <TableHead className="text-right">Volume capté</TableHead>
                        <TableHead className="text-right">Perte attribuée</TableHead>
                        <TableHead className="pr-4">Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-20 text-center text-sm text-muted-foreground">
                            Aucun point informel dans le rayon de 2 km.
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="pl-4 font-mono text-xs font-semibold tabular-nums">{p.code}</TableCell>
                            <TableCell>
                              <span className="flex items-center gap-1.5 text-xs">
                                <TypologyIcon code={p.typologyCode} className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                {typologyLabel(p.typologyCode)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{num(p.distanceM)} m</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{fmtPct(p.capturePct)}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{num(Math.round(p.capturedLJ))} L/j</TableCell>
                            <TableCell className="pr-0 text-right text-xs font-semibold tabular-nums" style={{ color: "#E53935" }}>
                              {formatTnd(p.attributedLoss)}
                            </TableCell>
                            <TableCell className="pr-4 text-[11px] text-muted-foreground">{p.active ? "actif" : "disparu"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Graphiques */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Perte par typologie</CardTitle>
                  <p className="text-xs text-muted-foreground">Perte attribuée par famille de vente informelle.</p>
                </CardHeader>
                <CardContent>
                  {byTypology.length === 0 ? (
                    <p className="py-10 text-center text-xs text-muted-foreground">Aucune donnée.</p>
                  ) : (
                    <div className="flex flex-col items-center gap-2 sm:flex-row">
                      <div className="h-52 w-40 shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={byTypology}
                              dataKey="loss"
                              nameKey="label"
                              innerRadius={30}
                              outerRadius={70}
                              paddingAngle={2}
                              stroke="var(--background)"
                            >
                              {byTypology.map((t) => (
                                <Cell key={t.code} fill={t.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              content={({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ name?: string; value?: number; payload?: unknown }> }) => {
                                if (!active || !payload?.length) return null
                                const row = payload[0]?.payload as (typeof byTypology)[number] | undefined
                                if (!row) return null
                                return (
                                  <TipShell title={row.label}>
                                    <TipRow label="Perte / mois" value={formatTnd(row.loss)} color={row.color} />
                                    <TipRow label="Points" value={num(row.count)} />
                                  </TipShell>
                                )
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <ul className="w-full space-y-1.5">
                        {byTypology.map((t) => (
                          <li key={t.code} className="flex items-center justify-between gap-2 text-xs">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
                              <span className="truncate">{t.label}</span>
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums" style={{ color: "#E53935" }}>
                              {formatTnd(t.loss)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Densité par anneau de distance</CardTitle>
                  <p className="text-xs text-muted-foreground">Points et perte selon l&apos;éloignement à la pompe.</p>
                </CardHeader>
                <CardContent>
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={byRing} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="short"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        />
                        <YAxis
                          yAxisId="left"
                          tickLine={false}
                          axisLine={false}
                          width={30}
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickFormatter={(v: number) => num(v)}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tickLine={false}
                          axisLine={false}
                          width={44}
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickFormatter={(v: number) => `${Math.round(v / 1000)}K`}
                        />
                        <Tooltip
                          cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                          content={({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) => {
                            if (!active || !payload?.length) return null
                            const row = payload[0]?.payload as (typeof byRing)[number] | undefined
                            if (!row) return null
                            return (
                              <TipShell title={row.label}>
                                <TipRow label="Points" value={num(row.points)} color={row.color} />
                                <TipRow label="Perte / mois" value={formatTnd(row.loss)} />
                              </TipShell>
                            )
                          }}
                        />
                        <Area
                          yAxisId="left"
                          dataKey="points"
                          name="Points"
                          stroke="#FF9800"
                          fill="#FF980033"
                          strokeWidth={2}
                        />
                        <Area
                          yAxisId="right"
                          dataKey="loss"
                          name="Perte"
                          stroke="#E53935"
                          fill="#E5393522"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#FF9800]" aria-hidden /> nb de points (gauche)</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#E53935]" aria-hidden /> perte DT/mois (droite)</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Hypothèses + stations voisines */}
            <AssumptionNote>
              Modèle d&apos;attribution : capture = 1 − d/2 km (d = distance point↔station), plafonnée aux 3 stations
              les plus proches de chaque point (Σ captures ≤ 1) ; perte = volume capté × {margin.toFixed(3).replace(".", ",")} DT/L ×{" "}
              {DAYS_PER_MONTH.toString().replace(".", ",")} jours. Rayon d&apos;analyse : 2 km.
            </AssumptionNote>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Stations voisines comparées</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Les 5 stations les plus proches — pour situer la perte dans le quartier.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Station</TableHead>
                      <TableHead>Enseigne</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                      <TableHead className="pr-4 text-right">Perte / mois</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {impact.nearbyStations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-16 text-center text-xs text-muted-foreground">
                          Aucune station voisine dans un rayon comparable.
                        </TableCell>
                      </TableRow>
                    ) : (
                      impact.nearbyStations.map((s) => (
                        <TableRow key={s.code}>
                          <TableCell className="pl-4 text-xs font-medium">{s.name}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1.5 text-xs">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.brandColor }} aria-hidden />
                              {s.brandName}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{num(s.points)}</TableCell>
                          <TableCell className="pr-4 text-right text-xs font-semibold tabular-nums" style={{ color: "#E53935" }}>
                            {formatTnd(s.lossTnd)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
