'use client'

// A.6.4 — Calculateur de rentabilité prévisionnelle

import * as React from "react"
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Banknote, Coins, Download, Fuel, Hourglass, Timer, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { KpiCard } from "@/components/shell/kpi-card"
import { AXIS_STYLE, GRID_STROKE, tooltipStyle } from "@/lib/chart"
import {
  ChartBlock,
  NumberParam,
  PRIX_LITRE_TND,
  ParamsPanel,
  ResultsPanel,
  SaveScenarioBar,
  SliderParam,
  asNumber,
  fmtDec,
  fmtInt,
  fmtPct,
  fmtTnd,
  type InitialScenario,
} from "./calc-shared"

const MARGE_BOUTIQUE = 0.3

export interface CalcRentabiliteProps {
  onSave: (type: string, label: string, params: Record<string, unknown>, result: Record<string, unknown>) => void
  saving?: boolean
  initial?: InitialScenario | null
  /** Dernier trafic captif disponible (scénario A.6.1 sauvegardé) */
  importableTraffic: number | null
}

type ScenarioFactor = 0.75 | 1 | 1.25

interface ScenarioResult {
  litresAn: number
  caCarburant: number
  caBoutique: number
  caAnnuel: number
  margeCarburant: number
  margeBoutique: number
  margeNette: number
  margeMensuelle: number
}

function computeScenario(
  trafic: number,
  conversion: number,
  panierCarburant: number,
  margeLitre: number,
  panierBoutique: number,
  charges: number,
  factor: ScenarioFactor
): ScenarioResult {
  const t = trafic * factor
  const c = (conversion * factor) / 100
  const litresAn = t * 365 * c * (panierCarburant / PRIX_LITRE_TND)
  const caCarburant = litresAn * PRIX_LITRE_TND
  const margeCarburant = litresAn * margeLitre
  const caBoutique = t * 365 * c * panierBoutique
  const margeBoutique = caBoutique * MARGE_BOUTIQUE
  const margeNette = margeCarburant + margeBoutique - charges
  return {
    litresAn,
    caCarburant,
    caBoutique,
    caAnnuel: caCarburant + caBoutique,
    margeCarburant,
    margeBoutique,
    margeNette,
    margeMensuelle: margeNette / 12,
  }
}

export function CalcRentabilite({ onSave, saving, initial, importableTraffic }: CalcRentabiliteProps) {
  const p = initial?.params ?? {}
  const [invest, setInvest] = React.useState(asNumber(p.invest, 2_500_000))
  const [trafic, setTrafic] = React.useState(asNumber(p.trafic, 3000))
  const [conversion, setConversion] = React.useState(asNumber(p.conversion, 6))
  const [panierCarburant, setPanierCarburant] = React.useState(asNumber(p.panierCarburant, 48))
  const [margeLitre, setMargeLitre] = React.useState(asNumber(p.margeLitre, 0.18))
  const [panierBoutique, setPanierBoutique] = React.useState(asNumber(p.panierBoutique, 9))
  const [charges, setCharges] = React.useState(asNumber(p.charges, 850_000))

  const median = computeScenario(trafic, conversion, panierCarburant, margeLitre, panierBoutique, charges, 1)
  const pessimiste = computeScenario(trafic, conversion, panierCarburant, margeLitre, panierBoutique, charges, 0.75)
  const optimiste = computeScenario(trafic, conversion, panierCarburant, margeLitre, panierBoutique, charges, 1.25)

  const seuilMois = median.margeMensuelle > 0 ? invest / median.margeMensuelle : Number.POSITIVE_INFINITY
  const triPct = invest > 0 ? (median.margeNette / invest) * 100 : 0

  // ---------- Cash-flow cumulé sur 10 ans ----------
  const cashflow = React.useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => ({
        annee: i === 0 ? "Départ" : `An ${i}`,
        cumul: Math.round(-invest + i * median.margeNette),
      })),
    [invest, median.margeNette]
  )

  // Partage rouge/émeraude du dégradé : position du zéro dans la boîte du graphique
  const dataMin = Math.min(-invest, -invest + 10 * median.margeNette, 0)
  const dataMax = Math.max(-invest, -invest + 10 * median.margeNette, 0)
  const zeroOffset = dataMax > dataMin ? 1 - (0 - dataMin) / (dataMax - dataMin) : 1

  const paybackText = (months: number): string => {
    if (!Number.isFinite(months) || months > 240) return "> 20 ans"
    const y = Math.floor(months / 12)
    const m = Math.round(months % 12)
    if (y <= 0) return `${m} mois`
    return `${y} an${y > 1 ? "s" : ""}${m > 0 ? ` ${m} mois` : ""}`
  }

  const reset = () => {
    setInvest(2_500_000)
    setTrafic(3000)
    setConversion(6)
    setPanierCarburant(48)
    setMargeLitre(0.18)
    setPanierBoutique(9)
    setCharges(850_000)
  }

  const defaultLabel = `Rentabilité — investissement ${fmtInt(invest)} TND`

  const handleSave = (label: string) => {
    onSave(
      "rentabilite",
      label,
      { invest, trafic, conversion, panierCarburant, margeLitre, panierBoutique, charges },
      {
        margeNette: Math.round(median.margeNette),
        seuilMois: Number.isFinite(seuilMois) ? Math.round(seuilMois) : -1,
        triPct: Number(triPct.toFixed(2)),
        litresAn: Math.round(median.litresAn),
        caAnnuel: Math.round(median.caAnnuel),
      }
    )
  }

  const scenarioCards: {
    key: string
    label: string
    factor: string
    tone: string
    border: string
    data: ScenarioResult
  }[] = [
    {
      key: "pessimiste",
      label: "Pessimiste",
      factor: "trafic et conversion × 0,75",
      tone: "text-red-600",
      border: "border-l-red-600",
      data: pessimiste,
    },
    {
      key: "median",
      label: "Médian",
      factor: "hypothèses saisies",
      tone: "text-amber-600",
      border: "border-l-amber-500",
      data: median,
    },
    {
      key: "optimiste",
      label: "Optimiste",
      factor: "trafic et conversion × 1,25",
      tone: "text-emerald-600",
      border: "border-l-emerald-600",
      data: optimiste,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <ParamsPanel icon={Coins} title="Paramètres" subtitle="Hypothèses financières — les résultats se recalculent en direct">
          <NumberParam
            label="Investissement initial"
            value={invest}
            onValueChange={setInvest}
            suffix="TND"
            step={100_000}
            hint="terrain, génie civil, équipements et licences"
          />
          <div className="space-y-1.5">
            <NumberParam label="Trafic captif" value={trafic} onValueChange={setTrafic} suffix="véh/j" step={100} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full text-xs"
              disabled={importableTraffic === null}
              onClick={() => importableTraffic !== null && setTrafic(Math.round(importableTraffic))}
            >
              <Download className="h-3.5 w-3.5" />
              Importer depuis calculateur trafic
              {importableTraffic !== null && (
                <span className="text-[10px] text-muted-foreground">({fmtInt(importableTraffic)} véh/j)</span>
              )}
            </Button>
            {importableTraffic === null && (
              <p className="text-[11px] leading-tight text-muted-foreground">
                Sauvegardez un scénario dans le calculateur « Trafic captif » pour activer l&apos;import.
              </p>
            )}
          </div>
          <SliderParam
            label="Taux de conversion en client"
            value={conversion}
            min={2}
            max={15}
            step={0.5}
            onValueChange={setConversion}
            format={(v) => fmtPct(v, 1)}
            hint="part du trafic captif qui s'arrête à la station"
          />
          <NumberParam
            label="Panier moyen carburant"
            value={panierCarburant}
            onValueChange={setPanierCarburant}
            suffix="TND"
            step={1}
            hint={`prix de référence : ${fmtDec(PRIX_LITRE_TND, 2)} TND/L`}
          />
          <NumberParam label="Marge par litre" value={margeLitre} onValueChange={setMargeLitre} suffix="TND/L" step={0.01} />
          <NumberParam
            label="Panier moyen boutique"
            value={panierBoutique}
            onValueChange={setPanierBoutique}
            suffix="TND"
            step={1}
            hint="marge boutique appliquée : 30 %"
          />
          <NumberParam
            label="Charges annuelles d'exploitation"
            value={charges}
            onValueChange={setCharges}
            suffix="TND/an"
            step={50_000}
            hint="personnel, énergie, maintenance, loyers"
          />
        </ParamsPanel>

        <ResultsPanel>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <KpiCard
              label="Marge nette / an"
              value={fmtTnd(median.margeNette)}
              icon={Coins}
              tone={median.margeNette >= 0 ? "success" : "danger"}
              sub={`CA annuel ${fmtTnd(median.caAnnuel)}`}
            />
            <KpiCard
              label="Seuil de rentabilité"
              value={seuilMois <= 120 ? `${fmtInt(seuilMois)} mois` : paybackText(seuilMois)}
              icon={Timer}
              tone={seuilMois <= 36 ? "success" : seuilMois <= 120 ? "warning" : "danger"}
              sub={`marge mensuelle ${fmtTnd(median.margeMensuelle)}`}
            />
            <KpiCard
              label="TRI simplifié"
              value={fmtPct(triPct, 1)}
              icon={TrendingUp}
              tone={triPct >= 15 ? "success" : triPct >= 8 ? "warning" : "danger"}
              sub="marge annuelle ÷ investissement"
            />
            <KpiCard label="Payback" value={paybackText(seuilMois)} icon={Hourglass} sub="récupération de l'investissement" />
            <KpiCard
              label="Litres vendus / an"
              value={fmtInt(median.litresAn)}
              icon={Fuel}
              sub={`${fmtInt(median.litresAn / 365)} L/jour`}
            />
            <KpiCard
              label="CA annuel total"
              value={fmtTnd(median.caAnnuel)}
              icon={Banknote}
              sub={`carburant ${fmtTnd(median.caCarburant)} + boutique ${fmtTnd(median.caBoutique)}`}
            />
          </div>

          <ChartBlock
            title="Cash-flow cumulé sur 10 ans"
            sub="Investissement décaissé au départ puis marge nette capitalisée — zone rouge avant le seuil, émeraude après"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflow} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashflowGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={0} stopColor="#059669" stopOpacity={0.4} />
                    <stop offset={zeroOffset} stopColor="#059669" stopOpacity={0.4} />
                    <stop offset={zeroOffset} stopColor="#dc2626" stopOpacity={0.3} />
                    <stop offset={1} stopColor="#dc2626" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="annee" tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} tickLine={false} dy={4} />
                <YAxis
                  tick={AXIS_STYLE.tick}
                  stroke={AXIS_STYLE.stroke}
                  tickLine={false}
                  width={80}
                  tickFormatter={(v) => `${fmtInt(Number(v) / 1000)} k`}
                />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  formatter={(v) => [fmtTnd(Number(v)), "Cash-flow cumulé"]}
                  labelFormatter={(l) => `${l}`}
                />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="2 2" />
                <Area
                  type="monotone"
                  dataKey="cumul"
                  stroke="#059669"
                  strokeWidth={2}
                  fill="url(#cashflowGradient)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartBlock>

          <div className="grid gap-3 md:grid-cols-3">
            {scenarioCards.map((s) => (
              <Card key={s.key} className={s.border}>
                <CardContent className="p-4">
                  <p className={`text-sm font-semibold ${s.tone}`}>{s.label}</p>
                  <p className="text-[11px] text-muted-foreground">{s.factor}</p>
                  <dl className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Marge nette/an</dt>
                      <dd className="font-semibold tabular-nums">{fmtTnd(s.data.margeNette)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">TRI</dt>
                      <dd className="font-semibold tabular-nums">
                        {invest > 0 ? fmtPct((s.data.margeNette / invest) * 100, 1) : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Seuil</dt>
                      <dd className="font-semibold tabular-nums">
                        {s.data.margeMensuelle > 0 ? `${fmtInt(invest / s.data.margeMensuelle)} mois` : "non atteint"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Litres/an</dt>
                      <dd className="font-semibold tabular-nums">{fmtInt(s.data.litresAn)}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        </ResultsPanel>
      </div>

      <SaveScenarioBar defaultLabel={defaultLabel} initialLabel={initial?.label} saving={saving} onSave={handleSave} onReset={reset} />
    </div>
  )
}
