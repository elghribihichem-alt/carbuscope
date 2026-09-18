'use client'

// A.6.4 — Calculateur de rentabilité prévisionnelle

import * as React from "react"
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Banknote, Coins, Download, Fuel, Flame, Hourglass, Scale, Timer, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { KpiCard } from "@/components/shell/kpi-card"
import { AXIS_STYLE, GRID_STROKE, tooltipStyle } from "@/lib/chart"
import type { FuelPricesResponse } from "@/lib/types"
import { cn } from "@/lib/utils"
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
  factor: ScenarioFactor,
  prixLitre: number
): ScenarioResult {
  const t = trafic * factor
  const c = (conversion * factor) / 100
  const litresAn = t * 365 * c * (panierCarburant / prixLitre)
  const caCarburant = litresAn * prixLitre
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

  // Prix officiel du décret (A.6.4 × observatoire des prix) : le prix pompe
  // est réglementé — le calculateur le pré-remplit depuis /api/prices au lieu
  // d'une constante figée, et propose la marge détaillant réglementée.
  const [fuel, setFuel] = React.useState<"ESSENCE" | "GAZOLE">(
    p.fuel === "GAZOLE" ? "GAZOLE" : "ESSENCE"
  )
  const [prixLitre, setPrixLitre] = React.useState(asNumber(p.prixLitre, PRIX_LITRE_TND))
  const [decree, setDecree] = React.useState<FuelPricesResponse["current"]>([])

  React.useEffect(() => {
    const ac = new AbortController()
    fetch("/api/prices", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: FuelPricesResponse) => setDecree(j.current))
      .catch(() => {})
    return () => ac.abort()
  }, [])

  const decreeFuel = decree.find(d => d.fuelType === fuel) ?? null

  /** Applique le décret en vigueur : prix pompe + marge détaillant réglementée. */
  const applyDecree = () => {
    if (!decreeFuel) return
    setPrixLitre(decreeFuel.priceMillimes / 1000)
    setMargeLitre(decreeFuel.marginMillimes / 1000)
  }

  const median = computeScenario(trafic, conversion, panierCarburant, margeLitre, panierBoutique, charges, 1, prixLitre)
  const pessimiste = computeScenario(trafic, conversion, panierCarburant, margeLitre, panierBoutique, charges, 0.75, prixLitre)
  const optimiste = computeScenario(trafic, conversion, panierCarburant, margeLitre, panierBoutique, charges, 1.25, prixLitre)

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
    setFuel("ESSENCE")
    setPrixLitre(PRIX_LITRE_TND)
  }

  const defaultLabel = `Rentabilité — investissement ${fmtInt(invest)} TND`

  const handleSave = (label: string) => {
    onSave(
      "rentabilite",
      label,
      { invest, trafic, conversion, panierCarburant, margeLitre, panierBoutique, charges, fuel, prixLitre },
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
          {/* Prix officiel du décret — champ pré-rempli depuis /api/prices */}
          <div className="rounded-lg border border-amber-200/70 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                <Scale className="h-3.5 w-3.5" aria-hidden /> Prix officiel (décret)
              </p>
              {decreeFuel && (
                <Badge variant="outline" className="h-5 border-amber-300 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
                  depuis {new Date(decreeFuel.effectiveAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                </Badge>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["ESSENCE", "GAZOLE"] as const).map(f => {
                const Icon = f === "ESSENCE" ? Fuel : Flame
                const active = fuel === f
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFuel(f)}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
                      active
                        ? f === "ESSENCE"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-400/50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                          : "border-amber-300 bg-amber-100 text-amber-800 ring-1 ring-amber-400/50 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {f === "ESSENCE" ? "Essence" : "Gazole"}
                  </button>
                )
              })}
            </div>
            {decreeFuel ? (
              <>
                <p className="mt-2 text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/90">
                  Décret en vigueur : <strong className="tabular-nums">{fmtDec(decreeFuel.priceMillimes / 1000, 3)} TND/L</strong>
                  {" — marge détaillant "}
                  <strong className="tabular-nums">{fmtDec(decreeFuel.marginMillimes / 1000, 3)} TND/L</strong>.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 w-full gap-1.5 border-amber-300 text-[11px] text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-900 dark:text-amber-400 dark:hover:bg-amber-950"
                  onClick={applyDecree}
                >
                  <Scale className="h-3 w-3" aria-hidden />
                  Appliquer le décret (prix + marge)
                </Button>
              </>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Décret indisponible — saisissez le prix manuellement.
              </p>
            )}
            <div className="mt-2">
              <NumberParam
                label="Prix du litre appliqué"
                value={prixLitre}
                onValueChange={setPrixLitre}
                suffix="TND/L"
                step={0.005}
                hint={decreeFuel ? `décret : ${fmtDec(decreeFuel.priceMillimes / 1000, 3)} TND/L` : "prix pompe en vigueur"}
              />
              {decreeFuel && Math.abs(prixLitre - decreeFuel.priceMillimes / 1000) > 0.0005 && (
                <p className="text-[10px] leading-tight text-amber-700 dark:text-amber-400">
                  Écart avec le décret en vigueur — prix réglementé, à utiliser pour simulation uniquement.
                </p>
              )}
            </div>
          </div>
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
            hint={`≈ ${fmtInt(panierCarburant / prixLitre)} L au prix appliqué (${fmtDec(prixLitre, 3)} TND/L)`}
          />
          <NumberParam
            label="Marge par litre"
            value={margeLitre}
            onValueChange={setMargeLitre}
            suffix="TND/L"
            step={0.01}
            hint={decreeFuel ? `marge décret : ${fmtDec(decreeFuel.marginMillimes / 1000, 3)} TND/L` : undefined}
          />
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
