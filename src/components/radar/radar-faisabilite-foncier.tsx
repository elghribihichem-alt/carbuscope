'use client'

// T55-B3-a — Études de faisabilité > « foncier » : table réelle depuis
// /api/radar/indicators (GET land + ppa). Prix du m² (badge « est. » si
// valeur estimée), disponibilité en ScoreBar, source (updatedBy + date),
// tri par prix croissant / disponibilité décroissante (chips). KPIs : prix
// médian national, moyenne de disponibilité, top 3 du rapport dispo/prix.
// Croisement : badge « zone blanche » quand le gouvernorat correspondant
// (via useRadarZones) est en palier BLANCHE ou SOUS — jointure client.

import { useEffect, useMemo, useState } from "react"
import { ArrowDownNarrowWide, ArrowUpNarrowWide, Landmark, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { ErrorState } from "@/components/shell/loading"
import { ScoreBar } from "@/components/implantation/implantation-shared"
import type { PalierKey } from "@/components/implantation/implantation-shared"
import { num } from "@/lib/chart"
import type { RadarZoneDTO } from "@/lib/radar-scoring"
import { SectionHeader } from "./radar-shared"

/* ---------- Types du contrat /api/radar/indicators ---------- */

interface LandIndicatorRow {
  gouvernorat: string
  landPriceDt: number
  landAvailPct: number
  estimated: boolean
  updatedBy: string | null
  updatedAt: string
}

interface IndicatorsResponse {
  land: LandIndicatorRow[]
  ppa: { gouvernorat: string; ppaIndex: number; estimated: boolean; updatedBy: string | null; updatedAt: string }[]
}

/** Ligne enrichie par la jointure Radar (palier + score + enseigne). */
interface FoncierRow extends LandIndicatorRow {
  palier: PalierKey | null
  score: number | null
  blanche: boolean
}

type FoncierSort = "prix" | "dispo"

const dateFr = (iso: string): string =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })

const fmtSource = (r: FoncierRow): string =>
  r.updatedBy ? `${r.updatedBy} · ${dateFr(r.updatedAt)}` : `estimation initiale · ${dateFr(r.updatedAt)}`

export function FaisabiliteFoncier({ zones }: { zones: RadarZoneDTO[] }) {
  const [data, setData] = useState<IndicatorsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [sort, setSort] = useState<FoncierSort>("prix")

  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()
    fetch("/api/radar/indicators", { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: IndicatorsResponse) => { if (alive) { setData(j); setError(null) } })
      .catch(e => {
        if (e instanceof Error && e.name === "AbortError") return
        if (alive) setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => { alive = false; ctrl.abort() }
  }, [reloadKey])

  // Jointure client : gouvernorat → zone Radar (palier + score).
  const rows = useMemo<FoncierRow[]>(() => {
    if (!data) return []
    const byGov = new Map(zones.map(z => [z.gouvernorat, z]))
    return data.land.map(l => {
      const z = byGov.get(l.gouvernorat)
      return {
        ...l,
        palier: (z?.palier as PalierKey | undefined) ?? null,
        score: z?.score ?? null,
        blanche: z?.palier === "BLANCHE" || z?.palier === "SOUS",
      }
    })
  }, [data, zones])

  const sorted = useMemo(() => {
    if (sort === "prix") return [...rows].sort((a, b) => a.landPriceDt - b.landPriceDt)
    return [...rows].sort((a, b) => b.landAvailPct - a.landAvailPct)
  }, [rows, sort])

  // KPIs — médiane (R-7) et moyenne.
  const kpis = useMemo(() => {
    if (rows.length === 0) return { median: 0, avgAvail: 0, top3: [] as FoncierRow[] }
    const prices = [...rows].map(r => r.landPriceDt).sort((a, b) => a - b)
    const mid = Math.floor(prices.length / 2)
    const median = prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2)
    const avgAvail = Math.round(rows.reduce((s, r) => s + r.landAvailPct, 0) / rows.length)
    // Rapport dispo / prix : disponibilité élevée ET m² abordable.
    const top3 = [...rows]
      .sort((a, b) => (b.landAvailPct / Math.max(1, b.landPriceDt)) - (a.landAvailPct / Math.max(1, a.landPriceDt)))
      .slice(0, 3)
    return { median, avgAvail, top3 }
  }, [rows])

  const columns: DataViewColumn<FoncierRow>[] = [
    {
      key: "gouvernorat", header: "Gouvernorat",
      sortValue: r => r.gouvernorat,
      render: r => (
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            {r.gouvernorat}
            {r.blanche && (
              <Badge variant="outline" className="h-5 border-amber-300 bg-amber-50 px-1.5 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                zone blanche
              </Badge>
            )}
          </p>
          {r.score !== null && (
            <p className="text-[11px] text-muted-foreground">score Radar {r.score}/100</p>
          )}
        </div>
      ),
    },
    {
      key: "prix", header: "Prix du m²", align: "right",
      sortValue: r => r.landPriceDt,
      render: r => (
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums">
          {num(r.landPriceDt)} DT
          {r.estimated && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground">est.</Badge>
          )}
        </span>
      ),
    },
    {
      key: "dispo", header: "Disponibilité", sortValue: r => r.landAvailPct,
      render: r => (
        <span className="inline-flex w-32 items-center gap-2">
          <ScoreBar value={r.landAvailPct} color="#059669" className="flex-1" />
          <span className="w-9 text-right text-xs font-semibold tabular-nums">{r.landAvailPct} %</span>
        </span>
      ),
    },
    {
      key: "source", header: "Source",
      sortValue: r => r.updatedBy ?? "",
      render: r => <span className="text-[11px] text-muted-foreground">{fmtSource(r)}</span>,
    },
  ]

  if (error && !data) {
    return <div className="p-1"><ErrorState message={`Indicateurs fonciers indisponibles (${error}).`} retry={() => setReloadKey(k => k + 1)} /></div>
  }
  if (!data) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          Chargement des indicateurs fonciers et du pouvoir d&apos;achat…
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Analyse foncière"
        description="Prix du m² et disponibilité des parcelles par gouvernorat — indicateurs V1 estimés puis édités par la Super Administration (badge « est. »), croisés au palier du Radar pour repérer les zones blanches où le foncier reste accessible."
        icon={Landmark}
        badge="Données réelles · éditables en SA"
      />

      {/* KPIs foncier */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Prix médian national" value={`${num(kpis.median)} DT/m²`} sub={`${rows.length} gouvernorats indicés`} icon={Landmark} />
        <KpiCard label="Disponibilité moyenne" value={`${kpis.avgAvail} %`} sub="parcelles recherchées disponibles" icon={Landmark} tone="success" />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Meilleur rapport dispo / prix</CardTitle>
            <CardDescription className="text-[11px]">disponibilité élevée, m² abordable.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {kpis.top3.map(r => (
              <Badge key={r.gouvernorat} variant="outline" className="h-6 border-emerald-300 bg-emerald-50 px-2 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                {r.gouvernorat} · {r.landAvailPct} % · {num(r.landPriceDt)} DT
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Table des indicateurs fonciers réels */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Foncier par gouvernorat — données réelles</CardTitle>
          <CardDescription>
            Prix du m² et disponibilité des parcelles · badge « est. » tant que la Super Administration n&apos;a pas
            édité la valeur · « zone blanche » = palier Radar BLANCHE ou SOUS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey="radar-faisabilite-foncier"
            columns={columns}
            rows={sorted}
            rowKey={r => r.gouvernorat}
            emptyMessage="Aucun indicateur foncier chargé."
            maxHeightClassName="max-h-[26rem]"
            toolbarExtra={
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tri du foncier">
                <span className="mr-1 hidden text-xs text-muted-foreground sm:inline">Tri :</span>
                {([
                  { key: "prix" as FoncierSort, label: "Prix croissant", icon: ArrowUpNarrowWide },
                  { key: "dispo" as FoncierSort, label: "Dispo décroissante", icon: ArrowDownNarrowWide },
                ]).map(s => {
                  const active = sort === s.key
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setSort(s.key)}
                      aria-pressed={active}
                      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                        active
                          ? "border-emerald-400 bg-emerald-100 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-900 dark:text-emerald-200"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <s.icon className="h-3.5 w-3.5" aria-hidden />
                      {s.label}
                    </button>
                  )
                })}
              </div>
            }
            renderCard={r => (
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                        {r.gouvernorat}
                        {r.blanche && (
                          <Badge variant="outline" className="h-5 border-amber-300 bg-amber-50 px-1.5 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                            zone blanche
                          </Badge>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{fmtSource(r)}</p>
                    </div>
                    <p className="text-sm font-bold tabular-nums">
                      {num(r.landPriceDt)} DT/m²
                      {r.estimated && <span className="ml-1 text-[10px] font-normal text-muted-foreground">est.</span>}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <ScoreBar value={r.landAvailPct} color="#059669" className="flex-1" />
                    <span className="text-xs font-semibold tabular-nums">{r.landAvailPct} % dispo</span>
                  </div>
                </CardContent>
              </Card>
            )}
          />
        </CardContent>
      </Card>
    </div>
  )
}
