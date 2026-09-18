"use client"

// T22 — Onglet « Prix & marges » (observatoire B2B) : le carburant est un marché
// réglementé — prix pompe et marge détaillant fixés par décret ministériel,
// identiques pour toutes les enseignes. Cet onglet restitue l'observatoire des
// décrets (historique, variations) et le simulateur d'impact marge qui rend
// concrète l'entrée « marge par litre » du calculateur de rentabilité (A.6.4).

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Banknote, TrendingUp, TrendingDown, Minus, Scale, Fuel, Flame, Cylinder,
  CalendarClock, Info, Loader2, RefreshCw, Gauge, Landmark, Sparkles, ArrowRight,
} from "lucide-react"
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceDot,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { AXIS_STYLE, GRID_STROKE, tooltipStyle } from "@/lib/chart"
import type { FuelPriceCurrent, FuelPricesResponse, FuelType } from "@/lib/types"
import { cn } from "@/lib/utils"

// ---------- Constantes métier ----------

const FUEL_META: Record<FuelType, {
  label: string
  unit: string
  color: string // trait du graphique
  chip: string // badge léger
  icon: React.ComponentType<{ className?: string }>
}> = {
  ESSENCE: {
    label: "Essence sans plomb",
    unit: "DT/L",
    color: "#059669", // émeraude
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    icon: Fuel,
  },
  GAZOLE: {
    label: "Gazole",
    unit: "DT/L",
    color: "#d97706", // ambre
    chip: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400",
    icon: Flame,
  },
  GPL: {
    label: "GPL",
    unit: "DT/kg",
    color: "#c2410c", // terracotta
    chip: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-400",
    icon: Cylinder,
  },
}

/** 2650 millimes → « 2,650 » (DT/L). */
const fmtPrice = (millimes: number) => (millimes / 1000).toFixed(3).replace(".", ",")
/** 145 millimes → « 145 m » (notation marché). */
const fmtMillimes = (m: number) => `${m} m`

const fmtDateFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })

const NUM = new Intl.NumberFormat("fr-FR")

// ---------- Onglet ----------

export function PricesTab() {
  const [data, setData] = useState<FuelPricesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/prices", { cache: "no-store" })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setData((await r.json()) as FuelPricesResponse)
      setError(null)
    } catch {
      setError("Impossible de charger l'observatoire des prix.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading && !data) {
    return (
      <div className="space-y-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <Card className="m-6 border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50">
        <CardContent className="flex items-center justify-between gap-4 p-5">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>Réessayer</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* En-tête de l'onglet */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold leading-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <Banknote className="h-5 w-5" aria-hidden />
            </span>
            Prix &amp; marges — marché réglementé tunisien
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Prix pompe et marge détaillant fixés par décret ministériel, identiques sur tout le territoire.
            Historique des décrets, variations et impact sur la marge de vos stations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.totals.lastChangeAt && (
            <Badge variant="outline" className="gap-1.5 border-border/70 bg-muted/40">
              <CalendarClock className="h-3 w-3" aria-hidden />
              Dernier décret : {fmtDateFr(data.totals.lastChangeAt)}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="gap-1.5"
            aria-label="Rafraîchir l'observatoire des prix"
          >
            {loading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              : <RefreshCw className="h-3.5 w-3.5 transition-transform hover:rotate-180" aria-hidden />}
            Rafraîchir
          </Button>
        </div>
      </div>

      {/* Bandeau pédagogique */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50/80 to-transparent px-4 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:from-amber-950/40 dark:text-amber-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          <strong>Marché réglementé :</strong> la marge du détaillant est la même pour toutes les enseignes —
          un décret ne change pas votre marge au litre. Vos leviers : le <strong>volume distribué</strong> (trafic captif)
          et les <strong>services annexes</strong>. Utilisez le simulateur ci-dessous pour chiffrer.
        </p>
      </div>

      {data && (
        <>
          {/* Cartes prix courant par carburant */}
          <div className="grid gap-3 md:grid-cols-3">
            {data.current.map(c => (
              <CurrentPriceCard key={c.fuelType} c={c} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            {/* Historique des décrets */}
            <div className="lg:col-span-3">
              <PriceHistoryChart data={data} />
            </div>
            {/* Simulateur d'impact marge */}
            <div className="lg:col-span-2">
              <MarginSimulator current={data.current} />
            </div>
          </div>

          {/* Tableau chronologique des décrets */}
          <DecreesTable data={data} />
        </>
      )}
    </div>
  )
}

// ---------- Carte « prix courant » ----------

function CurrentPriceCard({ c }: { c: FuelPriceCurrent }) {
  const meta = FUEL_META[c.fuelType]
  const Icon = meta.icon
  const up = (c.deltaMillimes ?? 0) > 0
  const down = (c.deltaMillimes ?? 0) < 0
  const flat = c.deltaMillimes === 0

  return (
    <Card className="group relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
      {/* halo décoratif couleur carburant */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-[0.08] transition-transform group-hover:scale-125"
        style={{ background: meta.color }}
        aria-hidden
      />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-sm"
              style={{ background: meta.color }}
            >
              <Icon className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight">{meta.label}</p>
              <p className="text-[11px] text-muted-foreground">
                en vigueur depuis {fmtDateFr(c.effectiveAt)} · {c.daysSince} j
              </p>
            </div>
          </div>
          {flat ? (
            <Badge variant="outline" className="gap-1 border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              <Minus className="h-3 w-3" aria-hidden /> Stable
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className={cn(
                "gap-1",
                up
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
              )}
            >
              {up ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
              {c.deltaMillimes !== null && (c.deltaMillimes > 0 ? "+" : "")}{fmtMillimes(c.deltaMillimes ?? 0)}
              {c.deltaPct !== null && <span className="opacity-70">({c.deltaPct > 0 ? "+" : ""}{c.deltaPct.toLocaleString("fr-FR")} %)</span>}
            </Badge>
          )}
        </div>

        <div className="mt-4 flex items-baseline gap-1.5">
          <p className="text-4xl font-black tabular-nums tracking-tight">{fmtPrice(c.priceMillimes)}</p>
          <p className="text-sm font-medium text-muted-foreground">{meta.unit}</p>
        </div>
        <p className="sr-only">
          {meta.label} : {fmtPrice(c.priceMillimes)} dinars par litre, variation {(c.deltaMillimes ?? 0)} millimes
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
          <Badge variant="outline" className={cn("gap-1", meta.chip)}>
            <Scale className="h-3 w-3" aria-hidden /> Marge détaillant : {fmtMillimes(c.marginMillimes)}/L
          </Badge>
          {c.prevPriceMillimes !== null && (
            <Badge variant="outline" className="gap-1 border-border/70 bg-muted/40 text-muted-foreground">
              précédent : {fmtPrice(c.prevPriceMillimes)}
            </Badge>
          )}
        </div>
        {c.decreeNote && (
          <p className="mt-2 truncate text-[11px] italic text-muted-foreground/80" title={c.decreeNote}>
            « {c.decreeNote} »
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Graphique historique ----------

function PriceHistoryChart({ data }: { data: FuelPricesResponse }) {
  const [visible, setVisible] = useState<Record<FuelType, boolean>>({
    ESSENCE: true, GAZOLE: true, GPL: true,
  })

  // Série par date de décret : une ligne par carburant, valeurs en DT.
  const series = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>()
    for (const h of data.history) {
      const key = h.effectiveAt.slice(0, 10)
      const row = byDate.get(key) ?? { date: key, dateLabel: fmtDateFr(h.effectiveAt) }
      row[h.fuelType] = h.priceMillimes / 1000
      byDate.set(key, row)
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [data.history])

  // Points de changement (pour pastilles) : dates où un carburant visible a bougé.
  const changeDots = useMemo(() => {
    const dots: { date: string; fuel: FuelType; value: number }[] = []
    const prev = new Map<FuelType, number>()
    for (const h of data.history) {
      const p = prev.get(h.fuelType)
      if (p !== undefined && p !== h.priceMillimes && visible[h.fuelType]) {
        dots.push({ date: h.effectiveAt.slice(0, 10), fuel: h.fuelType, value: h.priceMillimes / 1000 })
      }
      prev.set(h.fuelType, h.priceMillimes)
    }
    return dots
  }, [data.history, visible])

  const anyVisible = Object.values(visible).some(Boolean)

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base leading-tight">Historique des décrets — 2021 → aujourd&apos;hui</CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              Prix pompe par carburant (DT/{`L`}) — chaque marche = un décret ministériel
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(FUEL_META) as FuelType[]).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setVisible(v => ({ ...v, [f]: !v[f] }))}
                aria-pressed={visible[f]}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                  visible[f]
                    ? "border-border bg-background shadow-sm hover:bg-muted/60"
                    : "border-transparent bg-muted/40 text-muted-foreground/60 hover:bg-muted",
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: visible[f] ? FUEL_META[f].color : "#94a3b8" }}
                  aria-hidden
                />
                {FUEL_META[f].label.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[340px] pl-0">
        {anyVisible ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                tick={{ ...AXIS_STYLE, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={{ ...AXIS_STYLE, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(v: number) => v.toFixed(2)}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={tooltipStyle()}
                formatter={(value: number | string, name: string) => [
                  `${Number(value).toFixed(3).replace(".", ",")} DT`,
                  FUEL_META[name as FuelType]?.label ?? name,
                ]}
              />
              {(Object.keys(FUEL_META) as FuelType[]).filter(f => visible[f]).map(f => (
                <Line
                  key={f}
                  type="stepAfter"
                  dataKey={f}
                  stroke={FUEL_META[f].color}
                  strokeWidth={2.2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                />
              ))}
              {changeDots.map((d, i) => (
                <ReferenceDot
                  key={`${d.date}-${d.fuel}-${i}`}
                  x={d.date}
                  y={d.value}
                  r={3.5}
                  fill={FUEL_META[d.fuel].color}
                  stroke="var(--background)"
                  strokeWidth={1.5}
                  // dataKey inutile ici : les points s'affichent sur leur série
                  ifOverflow="extendDomain"
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sélectionnez au moins un carburant.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Simulateur d'impact marge (A.6.4 — « marge par litre ») ----------

function MarginSimulator({ current }: { current: FuelPriceCurrent[] }) {
  // Paramètres (défauts réalistes station tunisienne).
  const [mainFuel, setMainFuel] = useState<FuelType>("GAZOLE")
  const [traffic, setTraffic] = useState(900) // véh/j captifs
  const [litresPerVeh, setLitresPerVeh] = useState(32) // L pleins moyens
  const [fillRate, setFillRate] = useState(70) // % des véhicules qui font le plein
  const [shareMain, setShareMain] = useState(65) // % essence vs gazole du volume
  const [includeSecondary, setIncludeSecondary] = useState(true)

  const priceByFuel = useMemo(
    () => Object.fromEntries(current.map(c => [c.fuelType, c])) as Record<FuelType, FuelPriceCurrent>,
    [current],
  )

  const main = priceByFuel[mainFuel]
  const secondaryFuel: FuelType = mainFuel === "ESSENCE" ? "GAZOLE" : "ESSENCE"
  const secondary = priceByFuel[secondaryFuel]

  // Volumes annuels.
  const fuelingsPerDay = (traffic * fillRate) / 100
  const litresMainPerYear = fuelingsPerDay * litresPerVeh * (shareMain / 100) * 365
  const litresSecondaryPerYear = includeSecondary
    ? fuelingsPerDay * litresPerVeh * ((100 - shareMain) / 100) * 365
    : 0

  const marginMainPerYear = litresMainPerYear * (main?.marginMillimes ?? 0) / 1000 // DT
  const marginSecondaryPerYear = litresSecondaryPerYear * (secondary?.marginMillimes ?? 0) / 1000
  const marginTotal = marginMainPerYear + marginSecondaryPerYear

  // Sensibilités.
  const plus5Volume = marginTotal * 0.05
  const oneMoreVehiclePerDay = (litresPerVeh * (fillRate / 100) * 365) * (
    (shareMain / 100) * (main?.marginMillimes ?? 0) / 1000
    + (includeSecondary ? ((100 - shareMain) / 100) * (secondary?.marginMillimes ?? 0) / 1000 : 0)
  ) // DT/an par véhicule/jour supplémentaire

  const fmtDT = (v: number) => `${NUM.format(Math.round(v))} DT`

  const savePreset = () => {
    toast.success("Scénario marge copié", {
      description: `Marge annuelle : ${fmtDT(marginTotal)} — ${NUM.format(Math.round(litresMainPerYear + litresSecondaryPerYear))} L/an.`,
    })
  }

  return (
    <Card className="h-full border-emerald-200/70 dark:border-emerald-900/60">
      <CardHeader className="bg-gradient-to-br from-emerald-50/70 via-transparent to-transparent pb-3 dark:from-emerald-950/40">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <Gauge className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-base leading-tight">Simulateur d&apos;impact marge</CardTitle>
              <CardDescription className="mt-0.5 text-xs">
                La « marge par litre » du calculateur de rentabilité (A.6.4), chiffrée pour une station
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
            <Landmark className="h-3 w-3" aria-hidden /> Marge réglementée
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Carburant principal */}
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(FUEL_META) as FuelType[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setMainFuel(f)}
              aria-pressed={mainFuel === f}
              className={cn(
                "rounded-lg border px-2 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                mainFuel === f
                  ? "border-emerald-400 bg-emerald-50 shadow-sm dark:border-emerald-700 dark:bg-emerald-950/60"
                  : "border-border/70 hover:bg-muted/50",
              )}
            >
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: FUEL_META[f].color }} aria-hidden />
                <span className="text-xs font-semibold">{FUEL_META[f].label.split(" ")[0]}</span>
              </span>
              <span className="mt-0.5 block text-[10px] tabular-nums text-muted-foreground">
                marge {fmtMillimes(priceByFuel[f]?.marginMillimes ?? 0)}/L
              </span>
            </button>
          ))}
        </div>

        {/* Curseurs */}
        <div className="space-y-3.5">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="sim-traffic" className="text-xs font-medium">Trafic captif</Label>
              <span className="text-xs font-bold tabular-nums">{NUM.format(traffic)} véh/j</span>
            </div>
            <Slider
              id="sim-traffic"
              value={[traffic]} min={100} max={4000} step={50}
              onValueChange={([v]) => setTraffic(v)}
              className="mt-1.5"
              aria-label="Trafic captif en véhicules par jour"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="sim-litres" className="text-xs font-medium">Plein moyen</Label>
              <span className="text-xs font-bold tabular-nums">{litresPerVeh} L</span>
            </div>
            <Slider
              id="sim-litres"
              value={[litresPerVeh]} min={10} max={80} step={1}
              onValueChange={([v]) => setLitresPerVeh(v)}
              className="mt-1.5"
              aria-label="Plein moyen en litres"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="sim-fill" className="text-xs font-medium">Taux de clients qui font le plein</Label>
              <span className="text-xs font-bold tabular-nums">{fillRate} %</span>
            </div>
            <Slider
              id="sim-fill"
              value={[fillRate]} min={10} max={100} step={5}
              onValueChange={([v]) => setFillRate(v)}
              className="mt-1.5"
              aria-label="Taux de clients qui font le plein"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="sim-share" className="text-xs font-medium">
                Part {FUEL_META[mainFuel].label.split(" ")[0].toLowerCase()}
              </Label>
              <span className="text-xs font-bold tabular-nums">{shareMain} %</span>
            </div>
            <Slider
              id="sim-share"
              value={[shareMain]} min={10} max={100} step={5}
              onValueChange={([v]) => setShareMain(v)}
              className="mt-1.5"
              aria-label={`Part du carburant principal en pourcentage`}
            />
            {includeSecondary && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                reste {100 - shareMain} % en {FUEL_META[secondaryFuel].label.toLowerCase()}
              </p>
            )}
          </div>
          {mainFuel !== "GPL" && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
              <Label htmlFor="sim-secondary" className="text-xs leading-snug">
                Inclure {FUEL_META[secondaryFuel].label.toLowerCase()} (secondaire)
              </Label>
              <Switch
                id="sim-secondary"
                checked={includeSecondary}
                onCheckedChange={setIncludeSecondary}
                aria-label="Inclure le carburant secondaire"
              />
            </div>
          )}
        </div>

        {/* Résultats */}
        <div className="space-y-2 rounded-xl border bg-gradient-to-br from-muted/50 to-transparent p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Volume annuel distribué</p>
            <p className="text-sm font-bold tabular-nums">
              {NUM.format(Math.round(litresMainPerYear + litresSecondaryPerYear))} L
            </p>
          </div>
          <div className="flex items-baseline justify-between gap-2 border-t pt-2">
            <p className="text-xs font-medium text-muted-foreground">Marge carburant / an</p>
            <p className="text-2xl font-black tabular-nums text-emerald-700 dark:text-emerald-400">
              {fmtDT(marginTotal)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t pt-2">
            <div className="rounded-lg bg-background/70 p-2">
              <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3 w-3" aria-hidden /> +5 % de volume
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                +{fmtDT(plus5Volume)}/an
              </p>
            </div>
            <div className="rounded-lg bg-background/70 p-2">
              <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <ArrowRight className="h-3 w-3" aria-hidden /> +1 véh/j captif
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400">
                +{fmtDT(oneMoreVehiclePerDay)}/an
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:border-emerald-800 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
          onClick={savePreset}
        >
          <Banknote className="h-3.5 w-3.5" aria-hidden />
          Noter ce scénario
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------- Tableau chronologique des décrets ----------

function DecreesTable({ data }: { data: FuelPricesResponse }) {
  // Lignes triées par date décroissante, ancien → nouveau prix par carburant.
  const rows = useMemo(() => {
    const prev = new Map<string, { price: number; note: string | null; at: string }>()
    return [...data.history]
      .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))
      .map(h => {
        const p = prev.get(h.fuelType)
        prev.set(h.fuelType, { price: h.priceMillimes, note: h.decreeNote, at: h.effectiveAt })
        return {
          ...h,
          prevPrice: p?.price ?? null,
          delta: p ? h.priceMillimes - p.price : null,
        }
      })
  }, [data.history])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Registre des décrets</CardTitle>
        <CardDescription className="text-xs">
          {data.totals.decrees} décrets référencés depuis 2021 — {data.totals.nextReviewLabel}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr className="border-b text-left">
                <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                <th className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Carburant</th>
                <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ancien</th>
                <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nouveau</th>
                <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Δ</th>
                <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Marge</th>
                <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contexte</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const meta = FUEL_META[r.fuelType]
                const delta = r.delta
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-b/60 transition-colors hover:bg-muted/50",
                      i % 2 === 1 && "bg-muted/20",
                    )}
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-xs tabular-nums">{fmtDateFr(r.effectiveAt)}</td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} aria-hidden />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-muted-foreground">
                      {r.prevPrice !== null ? fmtPrice(r.prevPrice) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right text-xs font-bold tabular-nums">{fmtPrice(r.priceMillimes)}</td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums">
                      {delta === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : delta === 0 ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          0
                        </span>
                      ) : (
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 font-semibold",
                            delta > 0
                              ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
                          )}
                        >
                          {delta > 0 ? "+" : ""}{fmtMillimes(delta)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-muted-foreground">
                      {fmtMillimes(r.marginMillimes)}/L
                    </td>
                    <td className="max-w-56 truncate px-4 py-2 text-xs italic text-muted-foreground/80" title={r.decreeNote ?? ""}>
                      {r.decreeNote ?? "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
