'use client'

// Shadow Market — Analyse d'Impact, onglet « 🎯 Simulation » (T44-d).
// « What if » prix : périmètre (national / gouvernorat / station), baisse du
// prix pompe (slider + input), durée en semaines → POST impact/simulation →
// KPI, courbe baseline vs projeté, hypothèses et interprétation automatique.

import { useMemo, useState } from "react"
import { FlaskConical, Play, RotateCcw, Sparkles, TrendingDown, TrendingUp } from "lucide-react"
import { toast } from "sonner"
import type { ShadowMapStationDTO, ShadowSimulationResponse } from "@/lib/types"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { AssumptionNote, SectionHeader, ShadowKpiCard, formatTnd } from "../shadow-shared"
import { LITERS_PER_VEHICLE, TipRow, TipShell } from "./impact-shared"
import { num } from "@/lib/chart"

const GOVS = [
  "Ariana", "Béja", "Ben Arous", "Bizerte", "Gabès", "Gafsa", "Jendouba", "Kairouan",
  "Kasserine", "Kébili", "Le Kef", "Mahdia", "Manouba", "Médenine", "Monastir", "Nabeul",
  "Sfax", "Sidi Bouzid", "Siliana", "Sousse", "Tataouine", "Tozeur", "Tunis", "Zaghouan",
]

type Scope = "national" | "gouvernorat" | "station"

export function TabSimulation({ stations, stationImpactTraffic }: { stations: ShadowMapStationDTO[]; stationImpactTraffic?: number | null }) {
  const [scope, setScope] = useState<Scope>("national")
  const [gouvernorat, setGouvernorat] = useState("Médenine")
  const [stationCode, setStationCode] = useState<string>("")
  const [priceCut, setPriceCut] = useState(200)
  const [weeks, setWeeks] = useState(12)

  const [result, setResult] = useState<ShadowSimulationResponse | null>(null)
  const [busy, setBusy] = useState(false)

  const stationOptions = useMemo(() => [...stations].sort((a, b) => b.lossTnd - a.lossTnd).slice(0, 150), [stations])

  const runSimulation = async () => {
    if (priceCut <= 0) {
      toast.error("Baisse de prix nulle", { description: "Choisissez une baisse supérieure à 0 millime pour simuler." })
      return
    }
    setBusy(true)
    try {
      const body: Record<string, unknown> = { priceCutMillimes: Math.round(priceCut), weeks: Math.round(weeks) }
      if (scope === "gouvernorat") body.gouvernorat = gouvernorat
      if (scope === "station") {
        if (stationCode === "") {
          toast.error("Station requise", { description: "Sélectionnez la station à simuler." })
          setBusy(false)
          return
        }
        body.stationCode = stationCode
      }
      const res = await fetch("/api/shadow/impact/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as ShadowSimulationResponse & { error?: string }
      if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`)
      setResult(json)
      toast.success("Simulation terminée", { description: `${json.scopeLabel} — ${json.curve.length} semaines modélisées.` })
    } catch (e) {
      toast.error("Simulation impossible", { description: e instanceof Error ? e.message : "Erreur inconnue" })
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setScope("national")
    setGouvernorat("Médenine")
    setStationCode("")
    setPriceCut(200)
    setWeeks(12)
    setResult(null)
  }

  // Interprétation automatique.
  const interpretation = useMemo(() => {
    if (result === null) return null
    const reductionPct = result.baseline.lossTnd > 0
      ? ((result.baseline.lossTnd - result.projected.lossTnd) / result.baseline.lossTnd) * 100
      : 0
    const cut = result.assumptions.priceCutMillimes
    const cutTnd = (cut / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 3 })
    let costNote: string
    if (scope === "station" && stationImpactTraffic != null && stationImpactTraffic > 0) {
      const cost = (cut / 1000) * stationImpactTraffic * LITERS_PER_VEHICLE * 30.4
      costNote = `à comparer au coût direct de la baisse : ${formatTnd(cost)}/mois de marge concédée sur le volume officiel (${num(stationImpactTraffic)} véh./j × ${LITERS_PER_VEHICLE} L × 30,4 j).`
    } else {
      costNote = "le coût direct de la baisse sur le volume officiel n'est pas agrégé à ce périmètre — comparez avec la marge récupérée avant toute décision tarifaire."
    }
    return { reductionPct, cutTnd, costNote }
  }, [result, scope, stationImpactTraffic])

  const scopeLabel =
    scope === "national" ? "National" : scope === "gouvernorat" ? gouvernorat : stationOptions.find((s) => s.code === stationCode)?.name ?? "Station"

  return (
    <div className="space-y-4">
      <SectionHeader
        emoji="🎯"
        title="Simulation « what if » — prix"
        description="Que se passerait-il si le prix à la pompe baissait ? Modèle pédagogique d'élasticité du marché parallèle (aucune donnée réelle n'est modifiée)."
      />

      {/* grid-cols-1 explicite (= minmax(0,1fr)) : sans lui, la piste implicite
          « auto » déborde à 390 px (max-content de la carte Paramètres). */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Paramètres */}
        <Card className="lg:sticky lg:top-32">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FlaskConical className="h-4 w-4" aria-hidden /> Paramètres
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Périmètre</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger className="w-full" aria-label="Périmètre de la simulation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="national">National</SelectItem>
                  <SelectItem value="gouvernorat">Gouvernorat</SelectItem>
                  <SelectItem value="station">Station</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === "gouvernorat" ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Gouvernorat</Label>
                <Select value={gouvernorat} onValueChange={setGouvernorat}>
                  <SelectTrigger className="w-full" aria-label="Gouvernorat de la simulation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {GOVS.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {scope === "station" ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Station (top 150 menacées)</Label>
                <Select value={stationCode || undefined} onValueChange={setStationCode}>
                  <SelectTrigger className="w-full" aria-label="Station à simuler">
                    <SelectValue placeholder="Sélectionner…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {stationOptions.map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.name} — {formatTnd(s.lossTnd)}/mois
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label className="text-xs font-medium">Baisse du prix pompe</Label>
                <span className="text-sm font-semibold tabular-nums" style={{ color: "#E53935" }}>
                  −{priceCut.toLocaleString("fr-FR")} mill.
                </span>
              </div>
              <Slider
                value={[priceCut]}
                min={0}
                max={400}
                step={10}
                onValueChange={(v) => setPriceCut(v[0] ?? priceCut)}
                aria-label="Baisse du prix en millimes par litre"
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={400}
                  step={10}
                  value={priceCut}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    setPriceCut(Number.isFinite(n) ? Math.min(400, Math.max(0, Math.round(n))) : 0)
                  }}
                  className="h-9 w-24 tabular-nums"
                  aria-label="Baisse du prix (saisie)"
                />
                <span className="text-xs tabular-nums text-muted-foreground">
                  = −{(priceCut / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 3 })} DT/L
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label className="text-xs font-medium">Durée simulée</Label>
                <span className="text-sm font-semibold tabular-nums">{weeks} semaines</span>
              </div>
              <Slider
                value={[weeks]}
                min={4}
                max={24}
                step={1}
                onValueChange={(v) => setWeeks(v[0] ?? weeks)}
                aria-label="Durée de la simulation en semaines"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={runSimulation} disabled={busy}>
                <Play className="h-4 w-4" aria-hidden />
                {busy ? "Simulation…" : "Lancer la simulation"}
              </Button>
              <Button variant="ghost" onClick={reset} disabled={busy}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Réinitialiser
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Périmètre courant : <span className="font-medium">{scopeLabel}</span> — la réponse du
              marché informel est progressive (transfert de clients semaine après semaine).
            </p>
          </CardContent>
        </Card>

        {/* Résultats */}
        <div className="space-y-4">
          {result === null ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
                <Sparkles className="h-8 w-8 text-stone-400" aria-hidden />
                <p className="text-sm font-medium">Aucune simulation lancée</p>
                <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                  Réglez le périmètre, la baisse du prix pompe (0–400 millimes) et la durée (4–24 semaines),
                  puis lancez la simulation : la perte de référence, la perte projetée et la marge
                  récupérée s&apos;afficheront ici.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* KPI */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ShadowKpiCard
                  value={formatTnd(result.baseline.lossTnd)}
                  label="Perte actuelle (référence)"
                  sub={`${num(result.baseline.points)} points · ${result.scopeLabel}`}
                  tone="red"
                  icon={TrendingDown}
                />
                <ShadowKpiCard
                  value={formatTnd(result.projected.lossTnd)}
                  label="Perte projetée"
                  sub={`${num(result.projected.points)} points résiduels`}
                  tone="orange"
                  icon={TrendingDown}
                />
                <ShadowKpiCard
                  value={formatTnd(result.projected.recoveredTnd)}
                  label="Marge récupérée"
                  sub="par mois en régime établi"
                  tone="green"
                  icon={TrendingUp}
                />
              </div>

              {/* Courbe */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Trajectoire de la perte ({result.curve.length} semaines)</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Aire rouge : perte sans action · aire verte : perte projetée avec la baisse de prix.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={result.curve} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="week"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickFormatter={(v: number) => `S${v}`}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          width={52}
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          domain={["dataMin", "dataMax"]}
                          tickFormatter={(v: number) => `${Math.round(v / 1000)} K`}
                        />
                        <Tooltip
                          cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                          content={({ active, payload, label }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }>; label?: number }) => {
                            if (!active || !payload?.length) return null
                            const row = payload[0]?.payload as (typeof result.curve)[number] | undefined
                            if (!row) return null
                            return (
                              <TipShell title={`Semaine ${label}`}>
                                <TipRow label="Référence" value={formatTnd(row.baselineTnd)} color="#E53935" />
                                <TipRow label="Projeté" value={formatTnd(row.projectedTnd)} color="#4CAF50" />
                                <TipRow
                                  label="Écart"
                                  value={formatTnd(row.baselineTnd - row.projectedTnd)}
                                />
                              </TipShell>
                            )
                          }}
                        />
                        <Area dataKey="baselineTnd" name="Référence" stroke="#E53935" fill="#E5393522" strokeWidth={2} />
                        <Area dataKey="projectedTnd" name="Projeté" stroke="#4CAF50" fill="#4CAF5022" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Interprétation + hypothèses */}
              {interpretation !== null ? (
                <Card className="border-stone-300 dark:border-stone-700">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-amber-500" aria-hidden /> Interprétation automatique
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                      Une baisse de <strong>{interpretation.cutTnd} DT/L</strong> ({result.assumptions.priceCutMillimes.toLocaleString("fr-FR")} millimes)
                      réduirait le marché parallèle de{" "}
                      <strong style={{ color: "#4CAF50" }}>
                        {interpretation.reductionPct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
                      </strong>{" "}
                      sur {result.curve.length} semaines dans le périmètre « {result.scopeLabel} », récupérant environ{" "}
                      <strong style={{ color: "#4CAF50" }}>{formatTnd(result.projected.recoveredTnd)}/mois</strong> de marge —{" "}
                      {interpretation.costNote}
                    </p>
                  </CardContent>
                </Card>
              ) : null}

              <AssumptionNote>
                Hypothèses : élasticité {result.assumptions.elasticity.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} pt de
                transfert par millime ; sensibilité informelle {result.assumptions.informalSensitivity} % ;{" "}
                {result.assumptions.note} Modèle purement indicatif — à confronter aux données terrain avant toute décision.
              </AssumptionNote>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
