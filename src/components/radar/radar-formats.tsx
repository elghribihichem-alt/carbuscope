'use client'

// CarbuScope — T54-B3a — volet « Formats recommandés » du module Opportunity
// Radar. Pour chaque gouvernorat (profil réel /api/radar/scoring — 5 critères
// 0-100), le moteur pur src/lib/radar/formats.ts classe les 5 formats réels
// d'implantation avec un score d'adéquation et 2-3 justifications FR. Bouton
// « Simuler ce format » → volet Simulations PRÉ-REMPLI via un handoff léger
// dans le store de navigation (nav.radarSim = JSON { gouvernorat, format }).
// Comparateur : Sheet large avec tableau imbriqué des 5 formats.

import { useEffect, useMemo, useState } from "react"
import type * as React from "react"
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Fuel,
  GitCompareArrows,
  Info,
  Lightbulb,
  LocateFixed,
  Radar,
  Store,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/shell/loading"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { num } from "@/lib/chart"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store/app-store"
import {
  zoneBlancheRatioThreshold,
  type GovernoratScore,
  type RegionKey,
  type ScoringInputs,
  type ScoringWeights,
} from "@/lib/radar/scoring"
import {
  recommendFormats,
  simDefaultsFor,
  STATION_FORMATS,
  type FormatIconKey,
  type FormatRecommendation,
} from "@/lib/radar/formats"

/* ============================== Types locaux ============================== */

type ScoringResponse = {
  weights: ScoringWeights
  threshold: { zoneBlanche: number; alert: number }
  gouvernorats: GovernoratScore[]
  engine: ScoringInputs
  generatedAt: string
}

const REGION_LABELS: Record<RegionKey, string> = {
  GRAND_TUNIS: "Grand Tunis",
  NORD: "Nord",
  CENTRE: "Centre",
  SUD: "Sud",
}

const fmt1 = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })

/** Icône lucide par format (clé de la lib pure). */
const FORMAT_ICONS: Record<FormatIconKey, LucideIcon> = {
  fuel: Fuel,
  zap: Zap,
  clock: Clock,
  store: Store,
  locate: LocateFixed,
}

/** Ton d'un critère 0-100 (badge profil + jauge). */
const tone = (v: number) =>
  v >= 70
    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
    : v >= 45
      ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
      : "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"

/** Couleur de la jauge d'adéquation (émeraude ≥ 70 · ambre 50-70 · terracotta). */
const gaugeTone = (v: number) =>
  v >= 70
    ? { bar: "bg-emerald-500 dark:bg-emerald-400", text: "text-emerald-700 dark:text-emerald-400" }
    : v >= 50
      ? { bar: "bg-amber-500 dark:bg-amber-400", text: "text-amber-700 dark:text-amber-400" }
      : { bar: "bg-[#e07856]", text: "text-[#b4552f] dark:text-[#e8a186]" }

/* ============================== Atomes ============================== */

/** Badge rond de rang : émeraude n°1 · ambre n°2 · zinc 3+. */
function RankBadge({ rank }: { rank: number }) {
  const t =
    rank === 1
      ? "border-emerald-400 bg-emerald-500 text-white dark:border-emerald-600 dark:bg-emerald-600"
      : rank === 2
        ? "border-amber-400 bg-amber-500 text-white dark:border-amber-600 dark:bg-amber-600"
        : "border-zinc-300 bg-zinc-200 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums",
        t,
      )}
      aria-label={`Recommandation n°${rank}`}
    >
      {rank}
    </span>
  )
}

/** Jauge d'adéquation horizontale + valeur. */
function AdequacyGauge({ value, className }: { value: number; className?: string }) {
  const g = gaugeTone(value)
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full transition-all", g.bar)} style={{ width: `${value}%` }} />
      </div>
      <span className={cn("shrink-0 text-xs font-bold tabular-nums", g.text)}>
        {fmt1(value)}
        <span className="text-[10px] font-normal text-muted-foreground">/100</span>
      </span>
    </div>
  )
}

/** Badge d'un critère du profil (trafic/parc/pouvoir/foncier/concurrence).
 *  Valeur bornée 0-100 à l'affichage (défensif — cf. formats.ts). */
function ProfileBadge({ label, value, est }: { label: string; value: number; est?: boolean }) {
  const shown = Math.max(0, Math.min(100, value))
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium tabular-nums",
        tone(shown),
      )}
      title={`${label} : ${fmt1(shown)}/100${est ? " (estimation V1)" : ""}`}
    >
      <span className="truncate">{label}</span>
      <span className="font-bold">{fmt1(shown)}</span>
      {est && <span className="text-[9px] font-normal opacity-70">est.</span>}
    </span>
  )
}

/* ============================== Carte format ============================== */

function FormatCard({
  reco,
  gouvernorat,
  onSimulate,
}: {
  reco: FormatRecommendation
  gouvernorat: string
  onSimulate: (gouvernorat: string, formatId: string) => void
}) {
  const f = reco.format
  const Icon = FORMAT_ICONS[f.iconKey]
  const charges = simDefaultsFor(f.id).charges
  const chargesTot = charges.personnel + charges.loyer + charges.energie + charges.assurance

  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <CardContent className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
        {/* En-tête : rang + icône + nom */}
        <div className="flex min-w-0 items-start gap-3">
          <RankBadge rank={reco.rank} />
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold leading-tight">{f.nom}</h3>
            <p className="text-[11px] text-muted-foreground">{f.slogan}</p>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">{f.description}</p>

        {/* Adéquation */}
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Adéquation au profil {gouvernorat}
          </p>
          <AdequacyGauge value={reco.adequation} />
        </div>

        {/* Caractéristiques */}
        <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg border bg-muted/30 p-3 text-xs">
          <div className="col-span-2 flex min-w-0 justify-between gap-2">
            <dt className="text-muted-foreground">Pistes</dt>
            <dd className="font-semibold">{f.pistes}</dd>
          </div>
          <div className="col-span-2 flex min-w-0 justify-between gap-2">
            <dt className="text-muted-foreground">Surface</dt>
            <dd className="font-semibold tabular-nums">
              {num(f.surfaceMin)} – {num(f.surfaceMax)} m²
            </dd>
          </div>
          <div className="col-span-2 flex min-w-0 justify-between gap-2">
            <dt className="text-muted-foreground">CAPEX</dt>
            <dd className="font-semibold tabular-nums">
              {(f.capexMin / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} –{" "}
              {(f.capexMax / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} MDT
            </dd>
          </div>
          <div className="flex min-w-0 justify-between gap-2">
            <dt className="text-muted-foreground">Délai</dt>
            <dd className="font-semibold tabular-nums">
              {f.delaiMin} – {f.delaiMax} mois
            </dd>
          </div>
          <div className="flex min-w-0 justify-between gap-2">
            <dt className="text-muted-foreground">Charges (est.)</dt>
            <dd className="font-semibold tabular-nums">{num(chargesTot)} DT/mois</dd>
          </div>
        </dl>

        {/* Services */}
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {f.services.map(s => (
            <Badge key={s} variant="secondary" className="text-[10px] font-medium">
              {s}
            </Badge>
          ))}
        </div>

        {/* Justifications */}
        <div className="min-w-0 space-y-1.5">
          <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Lightbulb className="h-3 w-3 text-amber-600 dark:text-amber-400" aria-hidden />
            Pourquoi ce classement
          </p>
          <ul className="space-y-1">
            {reco.justifications.map(j => (
              <li
                key={j}
                className="flex items-start gap-1.5 rounded-md border border-amber-200/60 bg-amber-50/50 px-2 py-1 text-[11px] leading-snug text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300"
              >
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <span className="min-w-0">{j}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Action */}
        <Button
          className="mt-auto h-11 w-full gap-1.5"
          onClick={() => onSimulate(gouvernorat, f.id)}
        >
          Simuler ce format
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </CardContent>
    </Card>
  )
}

/* ============================== Comparateur (Sheet) ============================== */

function CompareSheet({
  open,
  onOpenChange,
  gouvernorat,
  recos,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  gouvernorat: string
  recos: FormatRecommendation[]
}) {
  // Colonnes triées par adéquation décroissante (recommandé d'abord).
  const cols = [...recos].sort((a, b) => b.adequation - a.adequation)

  const rows: { label: string; render: (r: FormatRecommendation) => React.ReactNode }[] = [
    {
      label: "Adéquation",
      render: r => (
        <span className="flex items-center gap-1.5">
          <span className="block h-1.5 w-10 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span
              className={cn("block h-full rounded-full", gaugeTone(r.adequation).bar)}
              style={{ width: `${r.adequation}%` }}
            />
          </span>
          <span className="text-xs font-bold tabular-nums">{fmt1(r.adequation)}/100</span>
        </span>
      ),
    },
    { label: "Pistes", render: r => <span className="text-xs font-medium">{r.format.pistes}</span> },
    {
      label: "Surface",
      render: r => (
        <span className="text-xs font-medium tabular-nums">
          {num(r.format.surfaceMin)} – {num(r.format.surfaceMax)} m²
        </span>
      ),
    },
    {
      label: "CAPEX",
      render: r => (
        <span className="text-xs font-medium tabular-nums">
          {(r.format.capexMin / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} –{" "}
          {(r.format.capexMax / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} MDT
        </span>
      ),
    },
    {
      label: "Délai de réalisation",
      render: r => (
        <span className="text-xs font-medium tabular-nums">
          {r.format.delaiMin} – {r.format.delaiMax} mois
        </span>
      ),
    },
    {
      label: "Charges fixes (est.)",
      render: r => {
        const c = simDefaultsFor(r.format.id).charges
        return (
          <span className="text-xs font-medium tabular-nums">
            {num(c.personnel + c.loyer + c.energie + c.assurance)} DT/mois
          </span>
        )
      },
    },
    {
      label: "Droit d'entrée (est.)",
      render: r => (
        <span className="text-xs font-medium tabular-nums">
          {num(simDefaultsFor(r.format.id).droitEntree)} DT
        </span>
      ),
    },
    {
      label: "Part services/food",
      render: r => (
        <span className="text-xs font-medium tabular-nums">
          {simDefaultsFor(r.format.id).partServices} % par défaut
        </span>
      ),
    },
    {
      label: "Services emblématiques",
      render: r => (
        <span className="flex flex-wrap gap-1">
          {r.format.services.map(s => (
            <Badge key={s} variant="secondary" className="text-[9px]">
              {s}
            </Badge>
          ))}
        </span>
      ),
    },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <SheetHeader className="border-b bg-gradient-to-br from-emerald-50/70 to-amber-50/60 p-4 dark:from-emerald-950/25 dark:to-amber-950/20 sm:p-6">
          <SheetDescription className="sr-only">
            Comparateur des cinq formats de station pour le gouvernorat {gouvernorat}
          </SheetDescription>
          <SheetTitle className="flex min-w-0 items-center gap-2 text-base">
            <GitCompareArrows className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            Comparateur des formats — {gouvernorat}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Colonnes triées par adéquation décroissante au profil du gouvernorat. Valeurs
            indicatives (est.) à affiner en étude de faisabilité.
          </p>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 w-36 bg-background">Caractéristique</TableHead>
                {cols.map(c => (
                  <TableHead key={c.format.id} className="min-w-[120px]">
                    <span className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold leading-tight">{c.format.nom}</span>
                      <span className="text-[10px] font-normal text-muted-foreground">
                        reco n°{c.rank}
                      </span>
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.label}>
                  <TableCell className="sticky left-0 z-10 bg-background text-[11px] font-medium text-muted-foreground">
                    {row.label}
                  </TableCell>
                  {cols.map(c => (
                    <TableCell key={c.format.id}>{row.render(c)}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ============================== Volet ============================== */

export function RadarFormats() {
  const setNav = useAppStore(s => s.setNav)

  const [data, setData] = useState<ScoringResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selected, setSelected] = useState<string>("")
  const [compareOpen, setCompareOpen] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/radar/scoring", { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`/api/radar/scoring → ${r.status}`)
        return (await r.json()) as ScoringResponse
      })
      .then(d => {
        setData(d)
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [reloadKey])

  // Gouvernorat sélectionné — défaut : le mieux classé (rang 1).
  const govs = data?.gouvernorats ?? []
  const current = useMemo(
    () => govs.find(g => g.name === selected) ?? govs[0] ?? null,
    [govs, selected],
  )

  // Seuil zone blanche (3ᵉ quartile du ratio véh./station, moteur T54-B2).
  const zoneThreshold = useMemo(
    () => (data ? zoneBlancheRatioThreshold(data.engine) : 0),
    [data],
  )

  const recos = useMemo(
    () =>
      current
        ? recommendFormats(
            {
              name: current.name,
              parc: current.parc,
              pouvoir: current.pouvoir,
              trafic: current.trafic,
              concurrence: current.concurrence,
              foncier: current.foncier,
              vehicles: current.vehicles,
              stations: current.stations,
              score: current.score,
              rank: current.rank,
            },
            zoneThreshold,
          )
        : [],
    [current, zoneThreshold],
  )

  /** Handoff léger vers le volet Simulations (documenté) : le JSON
   *  { gouvernorat, format } est posé dans nav.radarSim avant de basculer
   *  l'onglet — le volet le consomme à son montage (useState initialisateur). */
  const simulate = (gouvernorat: string, formatId: string) => {
    setNav("radarSim", JSON.stringify({ gouvernorat, format: formatId }))
    setNav("radar", "simulations")
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#b4552f]">
            <TriangleAlert className="h-4 w-4" aria-hidden />
            Formats indisponibles
          </p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" className="h-11" onClick={() => setReloadKey(k => k + 1)}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!data || !current) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {STATION_FORMATS.map(f => (
          <Skeleton key={f.id} className="h-96 w-full" />
        ))}
      </div>
    )
  }

  const ratio = current.stations > 0 ? current.vehicles / current.stations : 0
  const zoneBlanche = zoneThreshold > 0 && ratio > zoneThreshold

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- Sélecteur gouvernorat + comparateur ---- */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-1.5 lg:max-w-sm lg:flex-1">
            <label
              htmlFor="radar-formats-gouv"
              className="text-xs font-medium text-muted-foreground"
            >
              Gouvernorat à analyser
            </label>
            <Select value={current.name} onValueChange={v => setSelected(v)}>
              <SelectTrigger id="radar-formats-gouv" className="h-11 w-full" aria-label="Gouvernorat">
                <SelectValue placeholder="Choisir un gouvernorat" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {govs.map(g => (
                  <SelectItem key={g.name} value={g.name}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate">{g.name}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        n°{g.rank} · {fmt1(g.score)}/100
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            className="h-11 shrink-0 gap-1.5"
            onClick={() => setCompareOpen(true)}
          >
            <GitCompareArrows className="h-4 w-4" aria-hidden />
            Comparer les formats
          </Button>
        </CardContent>
      </Card>

      {/* ---- Profil du gouvernorat (critères réels du scoring T54-B2) ---- */}
      <Card className="border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 to-amber-50/40 dark:border-emerald-900/50 dark:from-emerald-950/20 dark:to-amber-950/15">
        <CardContent className="space-y-3 p-4 sm:p-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Radar className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <h2 className="text-sm font-bold">Profil — {current.name}</h2>
            <Badge variant="secondary" className="text-[11px]">
              {REGION_LABELS[current.region]}
            </Badge>
            <Badge
              variant="outline"
              className="border-emerald-300 bg-emerald-50 text-[11px] text-emerald-700 tabular-nums dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
            >
              Score {fmt1(current.score)}/100 · rang {current.rank}/24
            </Badge>
            {zoneBlanche && (
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-50 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
              >
                Zone blanche
              </Badge>
            )}
            <span className="ml-auto hidden text-[11px] text-muted-foreground tabular-nums sm:block">
              {num(current.vehicles)} véhicules · {num(current.stations)} stations en service
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            <ProfileBadge label="Trafic" value={current.trafic} />
            <ProfileBadge label="Parc" value={current.parc} />
            <ProfileBadge label="Pouvoir" value={current.pouvoir} est />
            <ProfileBadge label="Foncier" value={current.foncier} est />
            <ProfileBadge label="Concurrence" value={current.concurrence} />
          </div>
          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            Critères normalisés 0-100 du moteur de scoring (poids officiels de la Super
            Administration). Pouvoir d&apos;achat et foncier sont des estimations V1
            (badge « est. ») — les règles de recommandation sont documentées dans le moteur.
          </p>
        </CardContent>
      </Card>

      {/* ---- Cartes des 5 formats classés ---- */}
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {recos.map(reco => (
          <FormatCard
            key={reco.format.id}
            reco={reco}
            gouvernorat={current.name}
            onSimulate={simulate}
          />
        ))}
      </div>

      <CompareSheet
        open={compareOpen}
        onOpenChange={setCompareOpen}
        gouvernorat={current.name}
        recos={recos}
      />
    </div>
  )
}
