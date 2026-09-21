'use client'

// A.6.3 — Calculateur de parc automobile (demande potentielle)

import * as React from "react"
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { BatteryCharging, CalendarClock, Car, Fuel, Percent, Store, Users, Wrench } from "lucide-react"
import { KpiCard } from "@/components/shell/kpi-card"
import type { GovernoratRow } from "@/lib/types"
import { AXIS_STYLE, GRID_STROKE, tooltipStyle } from "@/lib/chart"
import {
  ChartBlock,
  ParamsPanel,
  ResultsPanel,
  SaveScenarioBar,
  SelectParam,
  asString,
  fmtDec,
  fmtInt,
  fmtPct,
  type InitialScenario,
} from "./calc-shared"

const CROISSANCE_ANNUELLE = 0.073 // +7,3 %/an (INS, ajusté)

export interface CalcParcProps {
  governorats: GovernoratRow[]
  onSave: (type: string, label: string, params: Record<string, unknown>, result: Record<string, unknown>) => void
  saving?: boolean
  initial?: InitialScenario | null
}

export function CalcParc({ governorats, onSave, saving, initial }: CalcParcProps) {
  const [gouvName, setGouvName] = React.useState(asString(initial?.params?.gouvernorat, governorats[0]?.name ?? "Tunis"))
  const row = governorats.find((g) => g.name === gouvName) ?? governorats[0]

  // ---------- Évolution du parc 2020 → 2026 (valeur 2026 = donnée réelle INS) ----------
  const LITRES_PAR_VEHICULE_AN = 32 * 365 * (6.5 / 100) // 32 km/j · 6,5 L/100 km
  const fleetData = React.useMemo(() => {
    if (!row) return []
    return Array.from({ length: 7 }, (_, i) => {
      const year = 2020 + i
      const v = Math.round(row.vehicles / Math.pow(1 + CROISSANCE_ANNUELLE, 2026 - year))
      return {
        annee: String(year),
        vehicules: v,
        litresM: Math.round((v * LITRES_PAR_VEHICULE_AN) / 100_000) / 10, // millions de L/an
      }
    })
  }, [row])

  // ---------- Demande potentielle ----------
  const litresAn = row ? row.vehicles * LITRES_PAR_VEHICULE_AN : 0
  const entretienAn = row ? row.vehicles * 1.2 : 0
  const ve = row ? row.vehicles * 0.009 : 0
  const bornes = Math.ceil(ve / 25)
  const densite = row && row.stations > 0 ? row.vehicles / row.stations : 0

  const reset = () => setGouvName(governorats[0]?.name ?? "Tunis")

  const defaultLabel = row ? `Parc automobile — ${row.name}` : "Parc automobile"

  const handleSave = (label: string) => {
    onSave(
      "parc-auto",
      label,
      { gouvernorat: gouvName },
      {
        vehicles: row?.vehicles ?? 0,
        litresAn: Math.round(litresAn),
        entretienAn: Math.round(entretienAn),
        ve: Math.round(ve),
        bornes,
      }
    )
  }

  if (!row) return null

  const litresDisplay =
    litresAn >= 1_000_000 ? `${fmtDec(litresAn / 1_000_000, 1)} M L/an` : `${fmtInt(litresAn)} L/an`

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <ParamsPanel icon={Car} title="Paramètres" subtitle="Données INS par gouvernorat — 24 gouvernorats disponibles">
          <SelectParam
            label="Gouvernorat"
            value={gouvName}
            onValueChange={setGouvName}
            options={governorats.map((g) => ({
              value: g.name,
              label: g.name,
              description: `${fmtInt(g.vehicles)} véhicules · ${g.delegationCount} délégations`,
            }))}
            hint="Trier par population décroissante (source : /api/governorats)"
          />
          <div className="space-y-2 rounded-md bg-muted/40 p-3 text-xs">
            <p className="font-medium text-foreground">Données officielles — {row.name}</p>
            <dl className="space-y-1.5 text-muted-foreground">
              <div className="flex justify-between gap-2">
                <dt>Population</dt>
                <dd className="font-medium tabular-nums text-foreground">{fmtInt(row.population)} hab.</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Véhicules immatriculés</dt>
                <dd className="font-medium tabular-nums text-foreground">{fmtInt(row.vehicles)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Taux de motorisation</dt>
                <dd className="font-medium tabular-nums text-foreground">{fmtPct(row.motorizationRate * 100)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Âge moyen du parc</dt>
                <dd className="font-medium tabular-nums text-foreground">{fmtDec(row.avgFleetAge, 1)} ans</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Stations en service</dt>
                <dd className="font-medium tabular-nums text-foreground">{fmtInt(row.stations)}</dd>
              </div>
            </dl>
          </div>
        </ParamsPanel>

        <ResultsPanel>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard
              label="Véhicules immatriculés"
              value={fmtInt(row.vehicles)}
              icon={Car}
              tone="success"
              trend={{ value: 7.3, label: " %/an" }}
              sub="croissance annuelle ajustée INS"
            />
            <KpiCard
              label="Population"
              value={fmtInt(row.population)}
              icon={Users}
              sub={`${row.delegationCount} délégations`}
            />
            <KpiCard
              label="Taux de motorisation"
              value={fmtPct(row.motorizationRate * 100)}
              icon={Percent}
              sub={`≈ ${fmtDec(row.motorizationRate, 2)} véh./habitant`}
            />
            <KpiCard
              label="Âge moyen du parc"
              value={`${fmtDec(row.avgFleetAge, 1)} ans`}
              icon={CalendarClock}
              sub="parc vieillissant = entretien accru"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard
              label="Demande carburant"
              value={litresDisplay}
              icon={Fuel}
              tone="warning"
              sub="32 km/j · 6,5 L/100 · 365 j"
            />
            <KpiCard
              label="Entretien / vidanges"
              value={`${fmtInt(entretienAn)}/an`}
              icon={Wrench}
              sub="1,2 vidange par véhicule et par an"
            />
            <KpiCard
              label="Bornes nécessaires"
              value={fmtInt(bornes)}
              icon={BatteryCharging}
              tone="info"
              sub={`${fmtInt(ve)} VE estimés · 1 borne / 25 VE`}
            />
            <KpiCard
              label="Densité stationnelle"
              value={densite > 0 ? fmtInt(densite) : "—"}
              icon={Store}
              sub="véhicules par station en service"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartBlock
              title="Évolution du parc automobile 2020 → 2026"
              sub={`Interpolation depuis la valeur 2026 réelle (${fmtInt(row.vehicles)} véhicules) avec une croissance de +7,3 %/an`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={fleetData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="annee" tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} tickLine={false} dy={4} />
                  <YAxis
                    tick={AXIS_STYLE.tick}
                    stroke={AXIS_STYLE.stroke}
                    tickLine={false}
                    width={64}
                    tickFormatter={(v) => fmtInt(Number(v))}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle()}
                    formatter={(v) => [`${fmtInt(Number(v))} véhicules`, "Parc immatriculé"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="vehicules"
                    stroke="#059669"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#059669" }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartBlock>

            <ChartBlock
              title="Projection de la demande en carburant"
              sub={`Litres/an dérivés du parc (32 km/j · 6,5 L/100 km) — ${litresDisplay} en 2026`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fleetData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="parcGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d97706" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#d97706" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="annee" tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} tickLine={false} dy={4} />
                  <YAxis
                    tick={AXIS_STYLE.tick}
                    stroke={AXIS_STYLE.stroke}
                    tickLine={false}
                    width={56}
                    tickFormatter={(v) => `${fmtDec(Number(v), 1)} M`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle()}
                    formatter={(v) => [`${fmtDec(Number(v), 1)} M L/an`, "Demande potentielle"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="litresM"
                    stroke="#d97706"
                    strokeWidth={2.5}
                    fill="url(#parcGradient)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartBlock>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">Lecture du résultat</p>
            <p className="mt-1">
              À {row.name}, un parc de {fmtInt(row.vehicles)} véhicules génère une demande potentielle d&apos;environ{" "}
              <span className="font-medium text-foreground">{litresDisplay}</span> de carburant,{" "}
              <span className="font-medium text-foreground">{fmtInt(entretienAn)} interventions d&apos;entretien</span>{" "}
              par an et un besoin de <span className="font-medium text-foreground">{fmtInt(bornes)} bornes</span> de
              recharge pour accompagner l&apos;électrification (0,9 % du parc).
            </p>
          </div>
        </ResultsPanel>
      </div>

      <SaveScenarioBar defaultLabel={defaultLabel} initialLabel={initial?.label} saving={saving} onSave={handleSave} onReset={reset} />
    </div>
  )
}
