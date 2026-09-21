'use client'

// A.6.1 — Calculateur de potentiel de trafic captif

import * as React from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Car, CarFront, Gauge, Percent, Truck } from "lucide-react"
import { KpiCard } from "@/components/shell/kpi-card"
import type { GovernoratRow, RoadDTO } from "@/lib/types"
import { AXIS_STYLE, GRID_STROKE, tooltipStyle } from "@/lib/chart"
import {
  ChartBlock,
  MONTHS_COEF,
  MONTHS_FR,
  ParamsPanel,
  ResultsPanel,
  SaveScenarioBar,
  SelectParam,
  SliderParam,
  asNumber,
  asString,
  fmtDec,
  fmtInt,
  fmtPct,
  type InitialScenario,
} from "./calc-shared"

const SAISONS: { value: string; label: string; coef: number }[] = [
  { value: "MOYENNE", label: "Moyenne annuelle", coef: 1 },
  { value: "ETE", label: "Été (pic)", coef: 1.18 },
  { value: "HIVER", label: "Hiver", coef: 0.88 },
]

export interface CalcTrafficProps {
  roads: RoadDTO[]
  governorats: GovernoratRow[]
  onSave: (type: string, label: string, params: Record<string, unknown>, result: Record<string, unknown>) => void
  saving?: boolean
  initial?: InitialScenario | null
}

export function CalcTraffic({ roads, governorats, onSave, saving, initial }: CalcTrafficProps) {
  const defaultRoad = roads[0]
  const p = initial?.params ?? {}

  const [gouvernorat, setGouvernorat] = React.useState(asString(p.gouvernorat, governorats[0]?.name ?? "Tunis"))
  const [roadId, setRoadId] = React.useState(asString(p.axe, defaultRoad?.id ?? ""))
  const [tmj, setTmj] = React.useState(asNumber(p.tmj, defaultRoad?.tmj ?? 20000))
  const [plPct, setPlPct] = React.useState(asNumber(p.plPct, defaultRoad?.heavyVehiclePct ?? 20))
  const [distance, setDistance] = React.useState(asNumber(p.distance, 0))
  const [saison, setSaison] = React.useState(asString(p.saison, "MOYENNE"))

  const road = roads.find((r) => r.id === roadId) ?? defaultRoad

  const handleRoadChange = (id: string) => {
    const r = roads.find((x) => x.id === id)
    setRoadId(id)
    if (r) {
      setTmj(r.tmj)
      setPlPct(r.heavyVehiclePct)
    }
  }

  const reset = () => {
    setGouvernorat(governorats[0]?.name ?? "Tunis")
    setRoadId(defaultRoad?.id ?? "")
    setTmj(defaultRoad?.tmj ?? 20000)
    setPlPct(defaultRoad?.heavyVehiclePct ?? 20)
    setDistance(0)
    setSaison("MOYENNE")
  }

  // ---------- Calculs (formules A.6.1) ----------
  const pl = plPct / 100
  const captureVl = 0.022 - (distance / 20) * (0.022 - 0.004) // 2,2 % → 0,4 % sur 20 km
  const capturePl = 0.035 - (distance / 20) * (0.035 - 0.008) // 3,5 % → 0,8 % sur 20 km
  const captifVl = tmj * (1 - pl) * captureVl
  const captifPl = tmj * pl * capturePl
  const captifTotal = captifVl + captifPl
  const saisonCoef = SAISONS.find((s) => s.value === saison)?.coef ?? 1
  const captureGlobale = tmj > 0 ? (captifTotal / tmj) * 100 : 0

  const saisonData = React.useMemo(
    () =>
      MONTHS_FR.map((m, i) => ({
        mois: m,
        captifs: Math.round(captifTotal * MONTHS_COEF[i]),
        coef: MONTHS_COEF[i],
      })),
    [captifTotal]
  )

  const roadOptions = roads.map((r) => ({
    value: r.id,
    label: `${r.code} — ${r.name}`,
    description: `TMJ ${fmtInt(r.tmj)} véh/j · ${r.heavyVehiclePct} % PL`,
  }))

  const defaultLabel = `Trafic captif — ${road?.code ?? "axe"} (${fmtInt(tmj)} véh/j)`

  const handleSave = (label: string) => {
    onSave(
      "trafic-captif",
      label,
      { gouvernorat, axe: road?.code ?? "", tmj, plPct, distance, saison },
      {
        captifVl: Math.round(captifVl),
        captifPl: Math.round(captifPl),
        captifTotal: Math.round(captifTotal),
        capturePct: Number(captureGlobale.toFixed(2)),
      }
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <ParamsPanel icon={Gauge} title="Paramètres" subtitle="Axe routier, profil de trafic et contexte saisonnier">
          <SelectParam
            label="Gouvernorat cible"
            value={gouvernorat}
            onValueChange={setGouvernorat}
            options={governorats.map((g) => ({ value: g.name, label: g.name }))}
          />
          <SelectParam
            label="Axe routier le plus proche"
            value={roadId}
            onValueChange={handleRoadChange}
            options={roadOptions}
            hint={road ? `${road.type} · ${fmtInt(road.tmj)} véh/j · ${road.heavyVehiclePct} % de poids lourds` : undefined}
          />
          <SliderParam
            label="TMJ — trafic moyen journalier"
            value={tmj}
            min={2000}
            max={60000}
            step={500}
            onValueChange={setTmj}
            format={(v) => `${fmtInt(v)} véh/j`}
          />
          <SliderParam
            label="Taux de poids lourds"
            value={plPct}
            min={5}
            max={40}
            step={1}
            onValueChange={setPlPct}
            format={(v) => fmtPct(v)}
          />
          <SliderParam
            label="Distance au péage / échangeur"
            value={distance}
            min={0}
            max={20}
            step={0.5}
            onValueChange={setDistance}
            format={(v) => `${fmtDec(v, 1)} km`}
            hint="Taux de capture VL : 2,2 % à 0 km → 0,4 % à 20 km · PL : 3,5 % → 0,8 %"
          />
          <SelectParam
            label="Saisonnalité de référence"
            value={saison}
            onValueChange={setSaison}
            options={SAISONS.map((s) => ({
              value: s.value,
              label: s.label,
              description: `coefficient × ${fmtDec(s.coef, 2).replace(".", ",")}`,
            }))}
          />
        </ParamsPanel>

        <ResultsPanel>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard
              label="Véhicules/jour captifs"
              value={fmtInt(captifTotal * saisonCoef)}
              icon={CarFront}
              tone="success"
              sub={`VL ${fmtInt(captifVl * saisonCoef)} + PL ${fmtInt(captifPl * saisonCoef)}`}
            />
            <KpiCard
              label="Captif VL / jour"
              value={fmtInt(captifVl * saisonCoef)}
              icon={Car}
              sub={`${fmtDec((1 - pl) * 100, 0)} % du trafic léger`}
            />
            <KpiCard
              label="Captif PL / jour"
              value={fmtInt(captifPl * saisonCoef)}
              icon={Truck}
              sub="taux de capture PL renforcé"
            />
            <KpiCard
              label="Taux de capture"
              value={fmtPct(captureGlobale, 2)}
              icon={Percent}
              sub={`à ${fmtDec(distance, 1).replace(".", ",")} km de l'échangeur`}
            />
          </div>

          <ChartBlock
            title="Courbe de saisonnalité — 12 mois"
            sub="Véhicules captifs par jour, appliqués au coefficient mensuel JICA/OMMP (pointillés = moyenne annuelle)"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={saisonData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="mois" tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} tickLine={false} dy={4} />
                <YAxis
                  tick={AXIS_STYLE.tick}
                  stroke={AXIS_STYLE.stroke}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v) => fmtInt(Number(v))}
                />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  formatter={(v) => [`${fmtInt(Number(v))} véh/j`, "Captifs"]}
                  labelFormatter={(l) => `Mois : ${l}`}
                />
                <ReferenceLine
                  y={captifTotal}
                  stroke="#64748b"
                  strokeDasharray="5 4"
                  label={{ value: "moyenne", fill: "#64748b", fontSize: 10, position: "insideTopRight" }}
                />
                <Line
                  type="monotone"
                  dataKey="captifs"
                  stroke="#059669"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: "#059669" }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartBlock>

          <div className="rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">Lecture du résultat</p>
            <p className="mt-1">
              Sur l&apos;axe <span className="font-medium text-foreground">{road?.code}</span> ({fmtInt(tmj)} véh/j,{" "}
              {plPct} % PL), un positionnement à {fmtDec(distance, 1).replace(".", ",")} km du péage capture{" "}
              <span className="font-medium text-foreground">{fmtInt(captifTotal * saisonCoef)} véhicules/jour</span> en
              période {SAISONS.find((s) => s.value === saison)?.label.toLowerCase() ?? "moyenne"}, dont{" "}
              {fmtInt(captifVl * saisonCoef)} légers et {fmtInt(captifPl * saisonCoef)} poids lourds. Le pic de juillet
              atteint {fmtInt(captifTotal * 1.18)} captifs/jour.
            </p>
          </div>
        </ResultsPanel>
      </div>

      <SaveScenarioBar defaultLabel={defaultLabel} initialLabel={initial?.label} saving={saving} onSave={handleSave} onReset={reset} />
    </div>
  )
}
