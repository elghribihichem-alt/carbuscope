'use client'

// CarbuScope — T54-B2 — volet « Scoring d'opportunités » du module Opportunity
// Radar. Classement pondéré des 24 gouvernorats (5 critères 0-100) + Top 50
// délégations, recherche accent-insensible, tri par critère, filtre région,
// drill-down délégations (Sheet), mini-carte SVG décorative de la Tunisie et
// simulation LOCALE des poids (what-if non persisté — même moteur scoring.ts
// partagé, recalcul instantané côté client). Les poids officiels sont pilotés
// par la Super Administration (OpportunityConfig via /api/radar/config).

import { useEffect, useMemo, useState } from "react"
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronsUpDown,
  Gauge,
  Info,
  MapPin,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trophy,
  TriangleAlert,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Slider } from "@/components/ui/slider"
import { Skeleton } from "@/components/shell/loading"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { num } from "@/lib/chart"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store/app-store"
import {
  GOV_CENTERS,
  REGION_LABELS,
  scoreAllDelegations,
  scoreGouvernorats,
  traficPondereParGouvernorat,
  type DelegationScore,
  type GovernoratScore,
  type RegionKey,
  type ScoringInputs,
  type ScoringWeights,
} from "@/lib/radar/scoring"

/* ============================== Types locaux ============================== */

type ScoringResponse = {
  weights: ScoringWeights
  threshold: { zoneBlanche: number; alert: number }
  gouvernorats: GovernoratScore[]
  engine: ScoringInputs
  generatedAt: string
}

type SortDir = "asc" | "desc"
type GovSortKey =
  | "rank"
  | "name"
  | "score"
  | "parc"
  | "pouvoir"
  | "trafic"
  | "concurrence"
  | "foncier"
  | "stations"
  | "veh1000"
type DelegSortKey = "rank" | "name" | "gouvernorat" | "score" | "parc" | "population"

/** Recherche insensible à la casse et aux accents (pattern normalizeFr). */
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

const fmt1 = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })

/** Couleur de la jauge de score : émeraude ≥ 70 · ambre 50-70 · terracotta < 50. */
const scoreTone = (score: number) =>
  score >= 70
    ? { bar: "bg-emerald-500 dark:bg-emerald-400", text: "text-emerald-700 dark:text-emerald-400" }
    : score >= 50
      ? { bar: "bg-amber-500 dark:bg-amber-400", text: "text-amber-700 dark:text-amber-400" }
      : { bar: "bg-[#e07856]", text: "text-[#b4552f] dark:text-[#e8a186]" }

/* ============================== Atomes UI ============================== */

/** Badge rond de rang : émeraude top 3 · ambre 4-10 · zinc au-delà. */
function RankBadge({ rank, className }: { rank: number; className?: string }) {
  const tone =
    rank <= 3
      ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900 dark:text-emerald-300"
      : rank <= 10
        ? "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-300"
        : "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums",
        tone,
        className,
      )}
      aria-label={`Rang ${rank}`}
    >
      {rank}
    </span>
  )
}

/** Jauge horizontale colorée + valeur (score total 0-100). */
function ScoreGauge({ score, className }: { score: number; className?: string }) {
  const tone = scoreTone(score)
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span
          className={cn("block h-full rounded-full transition-all", tone.bar)}
          style={{ width: `${Math.max(2, Math.min(100, score))}%` }}
        />
      </span>
      <span className={cn("shrink-0 text-xs font-bold tabular-nums", tone.text)}>{fmt1(score)}</span>
    </span>
  )
}

/** Cellule de critère compacte (masquée sous md) + infobulle FR. */
function CriterionCell({ value, label, detail }: { value: number; label: string; detail: string }) {
  return (
    <TableCell className="hidden p-2 md:table-cell">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-9 min-w-9 cursor-help items-center justify-center rounded-md border border-[var(--c-line)] bg-muted/30 px-1.5 text-xs font-semibold tabular-nums dark:border-zinc-800"
            aria-label={`${label} : ${fmt1(value)} sur 100. ${detail}`}
          >
            {Math.round(value)}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs leading-snug">
          <p className="font-semibold">{label} — {fmt1(value)}/100</p>
          <p className="mt-0.5 text-muted-foreground">{detail}</p>
        </TooltipContent>
      </Tooltip>
    </TableCell>
  )
}

/* ============================== Mini-carte SVG (décorative) ============================== */

/**
 * Mini-carte stylisée de la Tunisie — contour simplifié SVG EN DUR (échantillon
 * de la frontière, Djerba + Kerkennah), point émeraude du gouvernorat et
 * libellé. Décorative (pas de Leaflet — arbitrage T54-A0) : projection
 * équirectangulaire alignée sur la table GOV_CENTERS du moteur.
 */
const MAP_W = 140
const MAP_H = 264
const projX = (lng: number) => ((lng - 7.2) / 4.7) * MAP_W
const projY = (lat: number) => ((37.4 - lat) / 7.4) * MAP_H

const TUNISIA_PATH =
  "46.2,16.1 74.5,6.1 86.4,9.3 92.3,21.4 102.2,13.6 113.2,17.8 107.2,33.9 101.3,44.6 105.7,57.1 114.7,67.1 110.8,83.8 92.3,114.2 86.4,135.6 101.3,138.4 119.1,142.7 131.1,151.6 128.1,201.6 120.6,244.4 96.8,255.8 69.1,255.8 40.2,224.8 23.8,178.4 28.3,123.1 37.2,76.7 31.3,49.9 37.2,26.8"
const DJERBA_PATH = "104.9,126.3 110.8,128.4 111.1,134.9 106.6,133.4 104.3,128.8"
const KERKENNAH_PATH = "112.6,92.0 117.7,95.6 113.2,97.0"

function MiniTunisiaMap({ gouvernorat, score }: { gouvernorat: string; score: number }) {
  const center = GOV_CENTERS[gouvernorat]
  const cx = center ? projX(center[0]) : MAP_W / 2
  const cy = center ? projY(center[1]) : MAP_H / 2
  const tone = scoreTone(score)
  return (
    <svg
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      className="h-auto w-full max-w-[130px] text-emerald-700 dark:text-emerald-400"
      role="img"
      aria-label={`Localisation de ${gouvernorat} en Tunisie (carte décorative)`}
    >
      <title>{`Localisation de ${gouvernorat} en Tunisie`}</title>
      <polygon
        points={TUNISIA_PATH}
        fill="currentColor"
        fillOpacity={0.08}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <polygon points={DJERBA_PATH} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeWidth={1} />
      <polygon points={KERKENNAH_PATH} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeWidth={1} />
      {center && (
        <g>
          <circle cx={cx} cy={cy} r={9} fill="currentColor" fillOpacity={0.18} />
          <circle cx={cx} cy={cy} r={4} className={tone.bar} fill="currentColor" />
          <text x={cx + 11} y={cy + 3.5} fontSize={11} fontWeight={700} fill="currentColor">
            {gouvernorat}
          </text>
        </g>
      )}
    </svg>
  )
}

/* ============================== Sheet détail gouvernorat ============================== */

/** Critères du Sheet : `key` = champ du GovernoratScore (pouvoir), `wkey` =
 *  champ du ScoringWeights (purchasing) — noms distincts, mapping explicite. */
const CRITERIA_META: Array<{
  key: "parc" | "pouvoir" | "trafic" | "concurrence" | "foncier"
  wkey: keyof ScoringWeights
  label: string
}> = [
  { key: "parc", wkey: "parc", label: "Parc véhicules" },
  { key: "pouvoir", wkey: "purchasing", label: "Pouvoir d'achat" },
  { key: "trafic", wkey: "trafic", label: "Trafic routier" },
  { key: "concurrence", wkey: "concurrence", label: "Concurrence" },
  { key: "foncier", wkey: "foncier", label: "Foncier" },
]

/** Instantané figé à l'ouverture du Sheet (stable pendant l'animation). */
type SheetSnapshot = {
  row: GovernoratScore
  delegations: DelegationScore[]
  tmj: number
  weights: ScoringWeights
  land: { pricePerM2: number | null; availability: number } | null
  purchasingIndex: number | null
}

function GovDetailSheet({
  snapshot,
  open,
  onOpenChange,
}: {
  snapshot: SheetSnapshot | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const setNav = useAppStore(s => s.setNav)
  if (!snapshot) return null

  const { row, delegations, tmj, weights, land, purchasingIndex } = snapshot
  const ratio = row.stations > 0 ? row.vehicles / row.stations : row.vehicles
  const veh1000 = row.population > 0 ? (row.vehicles / row.population) * 1000 : 0

  const details: Record<string, string> = {
    parc: `${num(row.vehicles)} véhicules (référence INS) — poids ${fmt1(weights.parc)} %`,
    pouvoir: purchasingIndex != null
      ? `Indice ${fmt1(purchasingIndex)}/100 (estimation dérivée) — poids ${fmt1(weights.purchasing)} %`
      : `Indice non documenté — poids ${fmt1(weights.purchasing)} %`,
    trafic: `${num(Math.round(tmj))} véh./j de TMJ pondéré poids lourds — poids ${fmt1(weights.trafic)} %`,
    concurrence: `${fmt1(ratio)} véh./station · ${num(row.stations)} stations en service — poids ${fmt1(weights.concurrence)} %`,
    foncier: land
      ? `Disponibilité ${fmt1(land.availability)}/100${land.pricePerM2 ? ` · ${num(land.pricePerM2)} DT/m²` : ""} (estimation) — poids ${fmt1(weights.foncier)} %`
      : `Estimation foncière — poids ${fmt1(weights.foncier)} %`,
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-[var(--c-line)] bg-gradient-to-br from-emerald-50/70 to-amber-50/50 p-4 dark:border-zinc-800 dark:from-emerald-950/25 dark:to-amber-950/20 sm:p-6">
          <SheetDescription className="sr-only">Détail du gouvernorat {row.name}</SheetDescription>
          <div className="flex min-w-0 items-start gap-3">
            <RankBadge rank={row.rank} className="mt-0.5 h-9 w-9 text-sm" />
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-lg leading-tight">{row.name}</SheetTitle>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>{REGION_LABELS[row.region]}</span>
                <span aria-hidden>·</span>
                <span>{num(row.population)} hab.</span>
                <span aria-hidden>·</span>
                <span>{num(row.vehicles)} véhicules</span>
              </p>
            </div>
            <div className="shrink-0 text-end">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Score</p>
              <p className={cn("text-2xl font-extrabold tabular-nums leading-none", scoreTone(row.score).text)}>
                {fmt1(row.score)}
                <span className="text-xs font-medium text-muted-foreground">/100</span>
              </p>
            </div>
          </div>
          <div className="mt-3">
            <ScoreGauge score={row.score} />
          </div>
        </SheetHeader>

        <div className="min-w-0 space-y-4 p-4 sm:p-6">
          {/* Répartition des 5 critères (barres horizontales + poids) */}
          <section aria-label="Répartition des 5 critères">
            <h3 className="text-sm font-semibold">Répartition des 5 critères</h3>
            <ul className="mt-2 space-y-2">
              {CRITERIA_META.map(c => {
                const value = row[c.key] as number
                return (
                  <li key={c.key} className="flex min-w-0 items-center gap-3" title={details[c.key]}>
                    <span className="w-28 shrink-0 truncate text-xs font-medium">{c.label}</span>
                    <span className="w-11 shrink-0 text-end text-[11px] text-muted-foreground tabular-nums">
                      {fmt1(weights[c.wkey])} %
                    </span>
                    <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span
                        className={cn("block h-full rounded-full", scoreTone(value).bar)}
                        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
                      />
                    </span>
                    <span className="w-9 shrink-0 text-end text-xs font-bold tabular-nums">{fmt1(value)}</span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              Critères normalisés 0-100 · score = Σ (critère × poids / 100). Pouvoir d&apos;achat et foncier sont
              des estimations dérivées (badge « est. »).
            </p>
          </section>

          {/* Mini-carte décorative + indicateurs clés */}
          <section aria-label="Localisation et indicateurs" className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
            <Card className="flex min-w-0 items-center justify-center p-3">
              <MiniTunisiaMap gouvernorat={row.name} score={row.score} />
            </Card>
            <div className="grid min-w-0 grid-cols-2 content-start gap-3">
              {[
                { label: "Stations en service", value: num(row.stations) },
                { label: "Véh./station", value: fmt1(ratio) },
                { label: "Véhicules / 1 000 hab.", value: fmt1(veh1000) },
                { label: "TMJ pondéré", value: `${num(Math.round(tmj))} véh./j` },
              ].map(k => (
                <div key={k.label} className="rounded-lg border border-[var(--c-line)] bg-muted/25 p-3 dark:border-zinc-800">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{k.label}</p>
                  <p className="mt-1 text-sm font-bold tabular-nums">{k.value}</p>
                </div>
              ))}
              <p className="col-span-2 flex min-w-0 items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Carte décorative (contour simplifié) — la cartographie interactive se trouve dans le volet Zones
                blanches.
              </p>
            </div>
          </section>

          {/* Tableau imbriqué délégations (scroll max-h-96, scrollbar stylée) */}
          <section aria-label={`Délégations de ${row.name}`}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Délégations ({delegations.length})</h3>
              <Badge variant="outline" className="text-[11px]">
                critères est. au prorata population
              </Badge>
            </div>
            <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-[var(--c-line)] dark:border-zinc-800">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                  <TableRow>
                    <TableHead className="h-9 text-[11px]">Délégation</TableHead>
                    <TableHead className="h-9 text-[11px] text-end">Score</TableHead>
                    <TableHead className="hidden h-9 text-[11px] text-end sm:table-cell">Véhicules</TableHead>
                    <TableHead className="hidden h-9 text-[11px] text-end sm:table-cell">Population</TableHead>
                    <TableHead className="h-9 text-[11px] text-end">Parc</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {delegations.map(d => (
                    <TableRow key={`${d.gouvernorat}-${d.name}`}>
                      <TableCell className="py-2 text-xs font-medium">{d.name}</TableCell>
                      <TableCell className="py-2 text-end">
                        <span className={cn("text-xs font-bold tabular-nums", scoreTone(d.score).text)}>
                          {fmt1(d.score)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden py-2 text-end text-xs tabular-nums sm:table-cell">
                        {num(d.parc)}
                      </TableCell>
                      <TableCell className="hidden py-2 text-end text-xs tabular-nums sm:table-cell">
                        {num(d.population)}
                      </TableCell>
                      <TableCell className="py-2 text-end">
                        {d.estimated ? (
                          <Badge
                            variant="outline"
                            className="border-amber-300 bg-amber-50 px-1.5 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                          >
                            est.
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">réel</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {delegations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="p-4 text-center text-xs text-muted-foreground">
                        Aucune délégation documentée pour ce gouvernorat.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Raccourcis vers les autres volets du Radar */}
          <section aria-label="Actions" className="flex flex-col gap-2 pb-2 sm:flex-row">
            <Button
              variant="outline"
              className="h-11 min-h-11 min-w-0 flex-1 gap-1.5"
              onClick={() => {
                setNav("radar", "zones")
                onOpenChange(false)
              }}
            >
              <MapPin className="h-4 w-4" aria-hidden />
              Ouvrir zones blanches
            </Button>
            <Button
              className="h-11 min-h-11 min-w-0 flex-1 gap-1.5"
              onClick={() => {
                setNav("radar", "simulations")
                onOpenChange(false)
              }}
            >
              <Gauge className="h-4 w-4" aria-hidden />
              Simuler une implantation
            </Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ============================== Panneau what-if ============================== */

const SIM_META: Array<{ key: keyof ScoringWeights; label: string; est?: boolean }> = [
  { key: "parc", label: "Parc véhicules" },
  { key: "purchasing", label: "Pouvoir d'achat", est: true },
  { key: "trafic", label: "Trafic routier" },
  { key: "concurrence", label: "Concurrence" },
  { key: "foncier", label: "Foncier", est: true },
]

function WhatIfPanel({
  sim,
  official,
  sum,
  onChange,
  onReset,
  simulated,
}: {
  sim: ScoringWeights
  official: ScoringWeights
  sum: number
  onChange: (key: keyof ScoringWeights, value: number) => void
  onReset: () => void
  simulated: boolean
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
              Simulation de poids
              {simulated && (
                <Badge
                  variant="outline"
                  className="border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                >
                  simulation active
                </Badge>
              )}
            </h3>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Simulation locale — les poids officiels sont gérés par la Super Administration.
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-11 gap-1.5" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Réinitialiser
          </Button>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {SIM_META.map(m => {
            const pct = sum > 0 ? (sim[m.key] * 100) / sum : 0
            return (
              <div key={m.key} className="min-w-0">
                <div className="flex min-w-0 items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 text-xs font-medium">
                    <span className="truncate">{m.label}</span>
                    {m.est && (
                      <Badge
                        variant="outline"
                        className="h-4 shrink-0 border-amber-300 bg-amber-50 px-1 text-[9px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                      >
                        est.
                      </Badge>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    <span className="font-semibold tabular-nums text-foreground">{fmt1(pct)}</span>
                    {" % · "}
                    {sim[m.key]}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[sim[m.key]]}
                  onValueChange={v => onChange(m.key, v[0] ?? 0)}
                  className="mt-1.5"
                  aria-label={`Poids simulé du critère ${m.label} : ${sim[m.key]} sur 100, normalisé à ${fmt1(pct)} pour cent (officiel ${fmt1(official[m.key])})`}
                />
              </div>
            )
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Σ des curseurs = {sum} → normalisés à 100 % en direct · recalcul instantané du classement et du Top 50.
        </p>
      </CardContent>
    </Card>
  )
}

/* ============================== En-tête triable ============================== */

function SortHead({
  label,
  active,
  dir,
  onSort,
  className,
  align = "end",
}: {
  label: string
  active: boolean
  dir: SortDir
  onSort: () => void
  className?: string
  align?: "start" | "end"
}) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow
  return (
    <TableHead
      className={cn("h-11 p-0", align === "end" ? "text-end" : "text-start", className)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "flex h-11 min-h-11 w-full items-center gap-1 px-2 text-[11px] font-medium uppercase tracking-wide transition-colors hover:text-foreground",
          align === "end" ? "justify-end" : "justify-start",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="truncate">{label}</span>
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
      </button>
    </TableHead>
  )
}

/* ============================== Composant principal ============================== */

export function RadarScoring({ alertCount }: { alertCount: number | null }) {
  const [data, setData] = useState<ScoringResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Filtres / tri / modes.
  const [mode, setMode] = useState<"gouvernorats" | "delegations">("gouvernorats")
  const [search, setSearch] = useState("")
  const [region, setRegion] = useState<"TOUTES" | RegionKey>("TOUTES")
  const [govSort, setGovSort] = useState<{ key: GovSortKey; dir: SortDir }>({ key: "rank", dir: "asc" })
  const [delegSort, setDelegSort] = useState<{ key: DelegSortKey; dir: SortDir }>({ key: "rank", dir: "asc" })

  // Simulation locale des poids (what-if, non persisté) — null = poids officiels.
  const [sim, setSim] = useState<ScoringWeights | null>(null)

  // Sheet détail (instantané figé à l'ouverture — animation de sortie stable).
  const [sheetGov, setSheetGov] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<SheetSnapshot | null>(null)

  // Chargement abortable (pattern radar-zones : setState uniquement dans les
  // callbacks asynchrones, retry par reloadKey).
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

  // Poids effectifs : officiels tant que la simulation n'a pas démarré.
  const official = data?.weights ?? null
  const effective: ScoringWeights | null = sim ?? official
  const simulated =
    sim != null && official != null && JSON.stringify(sim) !== JSON.stringify(official)
  const simSum = effective
    ? effective.parc + effective.purchasing + effective.trafic + effective.concurrence + effective.foncier
    : 0

  // Recalcul instantané côté client (moteur partagé scoring.ts).
  const rows = useMemo(
    () => (data && effective ? scoreGouvernorats(data.engine, effective) : []),
    [data, effective],
  )
  const allDelegations = useMemo(
    () => (data && effective ? scoreAllDelegations(data.engine, effective) : []),
    [data, effective],
  )
  const tmjByGov = useMemo(() => (data ? traficPondereParGouvernorat(data.engine.roads) : null), [data])
  const regionByGov = useMemo(() => new Map(rows.map(r => [r.name, r.region])), [rows])

  const govValue = (r: GovernoratScore, key: GovSortKey): number | string => {
    if (key === "veh1000") return r.population > 0 ? (r.vehicles / r.population) * 1000 : 0
    return r[key] as number | string
  }

  // Filtre + tri des 24 gouvernorats.
  const filteredGovs = useMemo(() => {
    const q = norm(search.trim())
    const out = rows.filter(r => {
      if (region !== "TOUTES" && r.region !== region) return false
      if (q && !norm(r.name).includes(q)) return false
      return true
    })
    const dir = govSort.dir === "asc" ? 1 : -1
    out.sort((a, b) => {
      const va = govValue(a, govSort.key)
      const vb = govValue(b, govSort.key)
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), "fr") * dir
      }
      return (va - vb) * dir
    })
    return out
  }, [rows, search, region, govSort])

  // Top 50 délégations (filtré + trié, classement national conservé).
  const topDelegations = useMemo(() => {
    const q = norm(search.trim())
    const out = allDelegations.filter(d => {
      if (region !== "TOUTES" && regionByGov.get(d.gouvernorat) !== region) return false
      if (q && !norm(d.name).includes(q) && !norm(d.gouvernorat).includes(q)) return false
      return true
    })
    const dir = delegSort.dir === "asc" ? 1 : -1
    out.sort((a, b) => {
      const va = a[delegSort.key as keyof DelegationScore] as number | string
      const vb = b[delegSort.key as keyof DelegationScore] as number | string
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), "fr") * dir
      }
      return (va - vb) * dir
    })
    return out.slice(0, 50)
  }, [allDelegations, search, region, delegSort, regionByGov])

  // KPIs (sur le classement courant — simulation incluse).
  const kpis = useMemo(() => {
    if (rows.length === 0) return null
    const sorted = [...rows].sort((a, b) => a.score - b.score)
    const mid = Math.floor(sorted.length / 2)
    const median =
      sorted.length % 2 === 1
        ? sorted[mid].score
        : (sorted[mid - 1].score + sorted[mid].score) / 2
    const top = [...rows].sort((a, b) => b.score - a.score)[0]
    return { median, top }
  }, [rows])

  /** Ouvre le Sheet détail (instantané figé : critères, poids, délégations). */
  const openSheet = (name: string) => {
    if (!data || !effective) return
    const row = rows.find(r => r.name === name)
    if (!row) return
    const govInput = data.engine.governorats.find(g => g.name === name)
    setSnapshot({
      row,
      delegations: allDelegations.filter(d => d.gouvernorat === name),
      tmj: tmjByGov?.get(name) ?? 0,
      weights: effective,
      land: govInput?.land ?? null,
      purchasingIndex: govInput?.purchasing?.index ?? null,
    })
    setSheetGov(name)
  }

  /* ------------------- États de chargement / erreur ------------------- */

  if (data === null && error === null) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement du scoring d'opportunités…">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  if (data === null) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="font-semibold text-red-700 dark:text-red-400">
              <TriangleAlert className="mr-1.5 inline h-4 w-4" aria-hidden />
              Impossible de charger le scoring d&apos;opportunités
            </p>
            <p className="mt-1 text-sm text-red-600/90 dark:text-red-400/80">
              {error} — le moteur nécessite le référentiel des 24 gouvernorats.
            </p>
          </div>
          <Button variant="outline" className="h-11 min-h-11" onClick={() => setReloadKey(k => k + 1)}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  /* ------------------------------ Rendu ------------------------------ */

  const toggleGovSort = (key: GovSortKey) =>
    setGovSort(s =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "rank" || key === "name" ? "asc" : "desc" },
    )
  const toggleDelegSort = (key: DelegSortKey) =>
    setDelegSort(s =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "rank" || key === "name" || key === "gouvernorat" ? "asc" : "desc" },
    )

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- KPIs de tête ---- */}
      <section aria-label="Indicateurs clés" className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="min-w-0">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Zones détectées</p>
            <p className="mt-1 flex items-baseline gap-1.5 text-2xl font-extrabold tabular-nums leading-none">
              {alertCount ?? "—"}
              {alertCount != null && alertCount > 0 && (
                <TriangleAlert className="h-4 w-4 self-center text-[#e07856]" aria-hidden />
              )}
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              alertes radar non acquittées (bandeau en tête du module)
            </p>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Score médian</p>
            <p className={cn("mt-1 text-2xl font-extrabold tabular-nums leading-none", kpis ? scoreTone(kpis.median).text : "")}>
              {kpis ? fmt1(kpis.median) : "—"}
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              médiane des 24 gouvernorats (0-100)
            </p>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Top gouvernorat</p>
            {kpis ? (
              <div className="mt-1 min-w-0">
                <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-bold leading-none">
                  <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                  <span className="truncate">{kpis.top.name}</span>
                </p>
                <p className={cn("mt-1 text-lg font-extrabold tabular-nums leading-none", scoreTone(kpis.top.score).text)}>
                  {fmt1(kpis.top.score)}
                  <span className="text-[11px] font-medium text-muted-foreground"> /100</span>
                </p>
              </div>
            ) : (
              <p className="mt-1 text-2xl font-extrabold">—</p>
            )}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Poids actifs</p>
            <ul className="mt-1.5 flex min-w-0 flex-wrap gap-1">
              {SIM_META.map(m => (
                <li key={m.key}>
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1 px-1.5 text-[10px] tabular-nums",
                      simulated
                        ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                        : "border-[var(--c-line)] dark:border-zinc-800",
                    )}
                  >
                    {m.label.split(" ")[0]} {simSum > 0 ? fmt1((effective![m.key] * 100) / simSum) : 0}
                    {m.est ? " est." : ""}
                  </Badge>
                </li>
              ))}
            </ul>
            {simulated && <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">poids simulés (locaux)</p>}
          </CardContent>
        </Card>
      </section>

      {/* ---- Simulation de poids (what-if local, non persisté) ---- */}
      {effective && (
        <WhatIfPanel
          sim={effective}
          official={data.weights}
          sum={simSum}
          simulated={simulated}
          onChange={(key, value) => setSim(s => ({ ...(s ?? data.weights), [key]: value }))}
          onReset={() => setSim(null)}
        />
      )}

      {/* ---- Recherche accent-insensible + filtre région ---- */}
      <section aria-label="Filtres" className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={mode === "gouvernorats" ? "Rechercher un gouvernorat…" : "Rechercher une délégation…"}
            className="h-11 min-h-11 ps-9"
            aria-label="Recherche (insensible aux accents)"
            inputMode="search"
          />
        </div>
        <Select value={region} onValueChange={v => setRegion(v as "TOUTES" | RegionKey)}>
          <SelectTrigger className="h-11 min-h-11 w-full sm:w-44" aria-label="Filtre région">
            <SelectValue placeholder="Région" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TOUTES">Toutes les régions</SelectItem>
            {(Object.keys(REGION_LABELS) as RegionKey[]).map(r => (
              <SelectItem key={r} value={r}>
                {REGION_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {/* ---- Deux modes : Gouvernorats / Délégations Top 50 ---- */}
      <Tabs value={mode} onValueChange={v => setMode(v as "gouvernorats" | "delegations")}>
        <TabsList className="grid h-auto w-full grid-cols-2 p-1">
          <TabsTrigger value="gouvernorats" className="min-h-11 gap-1.5 text-xs sm:text-[13px]">
            Gouvernorats ({filteredGovs.length})
          </TabsTrigger>
          <TabsTrigger value="delegations" className="min-h-11 gap-1.5 text-xs sm:text-[13px]">
            Délégations — Top 50 ({topDelegations.length})
          </TabsTrigger>
        </TabsList>

        {/* ---- Mode Gouvernorats : 24 lignes classées ---- */}
        <TabsContent value="gouvernorats" className="mt-3">
          <TooltipProvider delayDuration={150}>
            <Card className="min-w-0 overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortHead label="Rang" active={govSort.key === "rank"} dir={govSort.dir} onSort={() => toggleGovSort("rank")} align="start" className="w-14" />
                        <SortHead label="Gouvernorat" active={govSort.key === "name"} dir={govSort.dir} onSort={() => toggleGovSort("name")} align="start" />
                        <SortHead label="Score" active={govSort.key === "score"} dir={govSort.dir} onSort={() => toggleGovSort("score")} />
                        <SortHead label="Parc" active={govSort.key === "parc"} dir={govSort.dir} onSort={() => toggleGovSort("parc")} className="hidden md:table-cell" />
                        <SortHead label="Pouvoir" active={govSort.key === "pouvoir"} dir={govSort.dir} onSort={() => toggleGovSort("pouvoir")} className="hidden md:table-cell" />
                        <SortHead label="Trafic" active={govSort.key === "trafic"} dir={govSort.dir} onSort={() => toggleGovSort("trafic")} className="hidden md:table-cell" />
                        <SortHead label="Concur." active={govSort.key === "concurrence"} dir={govSort.dir} onSort={() => toggleGovSort("concurrence")} className="hidden md:table-cell" />
                        <SortHead label="Foncier" active={govSort.key === "foncier"} dir={govSort.dir} onSort={() => toggleGovSort("foncier")} className="hidden md:table-cell" />
                        <SortHead label="Stations" active={govSort.key === "stations"} dir={govSort.dir} onSort={() => toggleGovSort("stations")} />
                        <SortHead label="Véh./1 000 hab." active={govSort.key === "veh1000"} dir={govSort.dir} onSort={() => toggleGovSort("veh1000")} className="hidden sm:table-cell" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredGovs.map(g => {
                        const veh1000 = g.population > 0 ? (g.vehicles / g.population) * 1000 : 0
                        const tmj = tmjByGov?.get(g.name) ?? 0
                        const ratio = g.stations > 0 ? g.vehicles / g.stations : g.vehicles
                        const land = data.engine.governorats.find(x => x.name === g.name)?.land
                        return (
                          <TableRow
                            key={g.name}
                            className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
                            onClick={() => openSheet(g.name)}
                          >
                            <TableCell className="p-2">
                              <RankBadge rank={g.rank} />
                            </TableCell>
                            <TableCell className="p-2">
                              <button
                                type="button"
                                className="flex h-11 min-h-11 min-w-0 max-w-[180px] flex-col items-start justify-center text-start"
                                onClick={() => openSheet(g.name)}
                                aria-label={`Ouvrir le détail de ${g.name} — score ${fmt1(g.score)} sur 100`}
                              >
                                <span className="truncate text-sm font-semibold">{g.name}</span>
                                <span className="truncate text-[10px] text-muted-foreground">
                                  {REGION_LABELS[g.region]}
                                </span>
                              </button>
                            </TableCell>
                            <TableCell className="w-32 p-2">
                              <ScoreGauge score={g.score} />
                            </TableCell>
                            <CriterionCell value={g.parc} label="Parc véhicules" detail={`${num(g.vehicles)} véhicules (référence INS) — poids ${fmt1(effective!.parc)} %`} />
                            <CriterionCell value={g.pouvoir} label="Pouvoir d'achat" detail={`Indice synthétique 0-100, estimation dérivée — poids ${fmt1(effective!.purchasing)} %`} />
                            <CriterionCell value={g.trafic} label="Trafic routier" detail={`${num(Math.round(tmj))} véh./j de TMJ pondéré poids lourds — poids ${fmt1(effective!.trafic)} %`} />
                            <CriterionCell value={g.concurrence} label="Concurrence" detail={`${fmt1(ratio)} véh./station · ${num(g.stations)} stations en service — poids ${fmt1(effective!.concurrence)} %`} />
                            <CriterionCell value={g.foncier} label="Foncier" detail={land ? `Disponibilité ${fmt1(land.availability)}/100${land.pricePerM2 ? ` · ${num(land.pricePerM2)} DT/m²` : ""} (est.) — poids ${fmt1(effective!.foncier)} %` : `Estimation foncière — poids ${fmt1(effective!.foncier)} %`} />
                            <TableCell className="p-2 text-end text-xs font-semibold tabular-nums">
                              {num(g.stations)}
                            </TableCell>
                            <TableCell className="hidden p-2 text-end text-xs tabular-nums sm:table-cell">
                              {fmt1(veh1000)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {filteredGovs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="p-6 text-center text-sm text-muted-foreground">
                            Aucun gouvernorat ne correspond à la recherche ou au filtre région.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TooltipProvider>
        </TabsContent>

        {/* ---- Mode Délégations : Top 50 ---- */}
        <TabsContent value="delegations" className="mt-3">
          <Card className="min-w-0 overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHead label="Rang" active={delegSort.key === "rank"} dir={delegSort.dir} onSort={() => toggleDelegSort("rank")} align="start" className="w-14" />
                      <SortHead label="Délégation" active={delegSort.key === "name"} dir={delegSort.dir} onSort={() => toggleDelegSort("name")} align="start" />
                      <SortHead label="Gouvernorat" active={delegSort.key === "gouvernorat"} dir={delegSort.dir} onSort={() => toggleDelegSort("gouvernorat")} align="start" />
                      <SortHead label="Score" active={delegSort.key === "score"} dir={delegSort.dir} onSort={() => toggleDelegSort("score")} />
                      <SortHead label="Véhicules" active={delegSort.key === "parc"} dir={delegSort.dir} onSort={() => toggleDelegSort("parc")} className="hidden sm:table-cell" />
                      <SortHead label="Population" active={delegSort.key === "population"} dir={delegSort.dir} onSort={() => toggleDelegSort("population")} className="hidden sm:table-cell" />
                      <TableHead className="h-11 text-end text-[11px] font-medium uppercase tracking-wide">Parc</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topDelegations.map(d => (
                      <TableRow
                        key={`${d.gouvernorat}-${d.name}`}
                        className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
                        onClick={() => openSheet(d.gouvernorat)}
                      >
                        <TableCell className="p-2">
                          <RankBadge rank={d.rank} />
                        </TableCell>
                        <TableCell className="p-2">
                          <button
                            type="button"
                            className="flex h-11 min-h-11 min-w-0 max-w-[180px] items-center text-start text-sm font-semibold"
                            onClick={() => openSheet(d.gouvernorat)}
                            aria-label={`Ouvrir le détail du gouvernorat ${d.gouvernorat} — délégation ${d.name}`}
                          >
                            <span className="truncate">{d.name}</span>
                          </button>
                        </TableCell>
                        <TableCell className="p-2 text-xs text-muted-foreground">{d.gouvernorat}</TableCell>
                        <TableCell className="w-32 p-2">
                          <ScoreGauge score={d.score} />
                        </TableCell>
                        <TableCell className="hidden p-2 text-end text-xs tabular-nums sm:table-cell">
                          {num(d.parc)}
                        </TableCell>
                        <TableCell className="hidden p-2 text-end text-xs tabular-nums sm:table-cell">
                          {num(d.population)}
                        </TableCell>
                        <TableCell className="p-2 text-end">
                          {d.estimated ? (
                            <Badge
                              variant="outline"
                              className="border-amber-300 bg-amber-50 px-1.5 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                            >
                              est.
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">réel</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {topDelegations.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                          Aucune délégation ne correspond à la recherche ou au filtre région.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            Classement « à la française » des 277 délégations — parc réel (DemographicDelegation) normalisé
            nationalement, autres critères estimés au prorata de la population du gouvernorat (badge « est. »).
          </p>
        </TabsContent>
      </Tabs>

      {/* ---- Sheet détail gouvernorat ---- */}
      <GovDetailSheet
        snapshot={snapshot}
        open={sheetGov !== null}
        onOpenChange={v => {
          if (!v) setSheetGov(null)
        }}
      />
    </div>
  )
}
