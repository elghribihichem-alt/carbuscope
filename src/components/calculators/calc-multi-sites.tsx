'use client'

// A.6.5 — Calculateur de comparaison multi-sites (2 à 10 sites, score composite)

import * as React from "react"
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ArrowDownUp, MapPinned, Plus, Trash2, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import type { GovernoratRow } from "@/lib/types"
import { AXIS_STYLE, GRID_STROKE, tooltipStyle } from "@/lib/chart"
import {
  ResultsPanel,
  SaveScenarioBar,
  asNumber,
  asString,
  fmtInt,
  fmtTnd,
  type InitialScenario,
} from "./calc-shared"

const MAX_SITES = 10
const MIN_SITES = 2

/** Médailles : or / argent (ardoise) / bronze (terracotta) */
const MEDALS = ["#d9a514", "#64748b", "#e07856"]
const OTHER_BAR = "#94a3b8"

interface Site {
  id: string
  nom: string
  gouvernorat: string
  tmj: number
  concurrents: number
  invest: number
}

export interface CalcMultiSitesProps {
  governorats: GovernoratRow[]
  onSave: (type: string, label: string, params: Record<string, unknown>, result: Record<string, unknown>) => void
  saving?: boolean
  initial?: InitialScenario | null
}

function makeDefaultSites(governorats: GovernoratRow[]): Site[] {
  const g1 = governorats[0]?.name ?? "Tunis"
  const g2 = governorats[1]?.name ?? "Sfax"
  return [
    { id: "s1", nom: "Site 1 — Échangeur autoroute", gouvernorat: g1, tmj: 28000, concurrents: 6, invest: 2_500_000 },
    { id: "s2", nom: "Site 2 — Entrée de ville", gouvernorat: g2, tmj: 15000, concurrents: 4, invest: 2_100_000 },
  ]
}

export function CalcMultiSites({ governorats, onSave, saving, initial }: CalcMultiSitesProps) {
  const p = initial?.params ?? {}
  const rawSites = Array.isArray(p.sites) ? p.sites : []

  const [sites, setSites] = React.useState<Site[]>(() => {
    if (rawSites.length >= MIN_SITES) {
      return rawSites.map((s, i) => ({
        id: `s${i}`,
        nom: asString((s as Record<string, unknown>).nom, `Site ${i + 1}`),
        gouvernorat: asString((s as Record<string, unknown>).gouvernorat, governorats[0]?.name ?? "Tunis"),
        tmj: asNumber((s as Record<string, unknown>).tmj, 10000),
        concurrents: asNumber((s as Record<string, unknown>).concurrents, 5),
        invest: asNumber((s as Record<string, unknown>).invest, 2_000_000),
      }))
    }
    return makeDefaultSites(governorats)
  })
  const uidRef = React.useRef(100)

  const updateSite = (id: string, patch: Partial<Site>) =>
    setSites((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const addSite = () => {
    if (sites.length >= MAX_SITES) return
    uidRef.current += 1
    const n = sites.length + 1
    setSites((prev) => [
      ...prev,
      {
        id: `s${uidRef.current}`,
        nom: `Site ${n}`,
        gouvernorat: governorats[Math.min(n, governorats.length - 1)]?.name ?? governorats[0]?.name ?? "Tunis",
        tmj: 12000,
        concurrents: 5,
        invest: 2_000_000,
      },
    ])
  }

  const removeSite = (id: string) => {
    if (sites.length <= MIN_SITES) return
    setSites((prev) => prev.filter((s) => s.id !== id))
  }

  // ---------- Score composite (normalisation min-max sur les candidats, /100) ----------
  const ranked = React.useMemo(() => {
    const minMax = (v: number, min: number, max: number): number =>
      max > min ? (v - min) / (max - min) : 0.5 // critère non discriminant → neutre
    const tmjs = sites.map((s) => s.tmj)
    const concs = sites.map((s) => s.concurrents)
    const invs = sites.map((s) => s.invest)
    const motors = sites.map((s) => governorats.find((g) => g.name === s.gouvernorat)?.motorizationRate ?? 0)
    const [minT, maxT] = [Math.min(...tmjs), Math.max(...tmjs)]
    const [minC, maxC] = [Math.min(...concs), Math.max(...concs)]
    const [minI, maxI] = [Math.min(...invs), Math.max(...invs)]
    const [minM, maxM] = [Math.min(...motors), Math.max(...motors)]
    return sites
      .map((s, idx) => {
        const score =
          100 *
          (minMax(s.tmj, minT, maxT) * 0.4 +
            (1 - minMax(s.concurrents, minC, maxC)) * 0.3 +
            minMax(motors[idx], minM, maxM) * 0.15 +
            (1 - minMax(s.invest, minI, maxI)) * 0.15)
        return { ...s, score: Math.round(score * 10) / 10 }
      })
      .sort((a, b) => b.score - a.score)
  }, [sites, governorats])

  const chartData = ranked.map((r, i) => ({
    nom: r.nom.length > 22 ? `${r.nom.slice(0, 21)}…` : r.nom,
    score: r.score,
    fill: i < 3 ? MEDALS[i] : OTHER_BAR,
  }))

  // Lignes du comparateur : rang figé à l'issue du classement initial.
  const tableRows = ranked.map((r, i) => ({ ...r, rank: i + 1 }))

  const best = ranked[0]
  const avgScore = ranked.length > 0 ? ranked.reduce((s, r) => s + r.score, 0) / ranked.length : 0
  const ecart = ranked.length > 1 ? best.score - ranked[ranked.length - 1].score : 0

  const reset = () => setSites(makeDefaultSites(governorats))
  const defaultLabel = `Multi-sites — ${sites.length} candidats (meilleur : ${best?.nom ?? "—"})`

  // Colonnes du comparateur (DataViews : Tableau / Cartes / Arborescence par gouvernorat)
  const columns: DataViewColumn<(typeof tableRows)[number]>[] = [
    {
      key: "rank", header: "Rang",
      sortValue: (r) => r.rank,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: r.rank <= 3 ? MEDALS[r.rank - 1] : "var(--muted)" }}
            aria-hidden="true"
          />
          {r.rank}
        </span>
      ),
    },
    {
      key: "nom", header: "Site",
      sortValue: (r) => r.nom,
      render: (r) => <span className="text-xs font-medium">{r.nom}</span>,
    },
    {
      key: "gouvernorat", header: "Gouvernorat",
      sortValue: (r) => r.gouvernorat,
      render: (r) => <span className="text-xs">{r.gouvernorat}</span>,
    },
    {
      key: "tmj", header: "TMJ", align: "right",
      sortValue: (r) => r.tmj,
      render: (r) => <span className="text-xs tabular-nums">{fmtInt(r.tmj)}</span>,
    },
    {
      key: "concurrents", header: "Conc. 5 km", align: "right",
      sortValue: (r) => r.concurrents,
      render: (r) => <span className="text-xs tabular-nums">{r.concurrents}</span>,
    },
    {
      key: "invest", header: "Investissement", align: "right",
      sortValue: (r) => r.invest,
      render: (r) => <span className="text-xs tabular-nums">{fmtTnd(r.invest)}</span>,
    },
    {
      key: "score", header: "Score", align: "right",
      sortValue: (r) => r.score,
      render: (r) => <span className="text-xs font-bold tabular-nums">{r.score}/100</span>,
    },
  ]

  const handleSave = (label: string) => {
    onSave(
      "multi-sites",
      label,
      {
        sites: sites.map((s) => ({
          nom: s.nom,
          gouvernorat: s.gouvernorat,
          tmj: s.tmj,
          concurrents: s.concurrents,
          invest: s.invest,
        })),
      },
      { ranking: ranked.map((r) => ({ nom: r.nom, gouvernorat: r.gouvernorat, score: r.score })) }
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-2 text-sm font-semibold">
            <span className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <MapPinned className="h-4 w-4" />
              </span>
              Sites candidats
              <span className="text-xs font-normal text-muted-foreground">
                ({sites.length}/{MAX_SITES})
              </span>
            </span>
            <Button size="sm" variant="outline" className="h-8" onClick={addSite} disabled={sites.length >= MAX_SITES}>
              <Plus className="h-4 w-4" />
              Ajouter un site
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sites.map((s, idx) => (
            <div
              key={s.id}
              className="grid grid-cols-2 items-end gap-2 rounded-lg border p-3 md:grid-cols-[minmax(180px,1fr)_minmax(150px,200px)_repeat(3,minmax(100px,130px))_40px]"
            >
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Nom du site {idx + 1}</Label>
                <Input
                  value={s.nom}
                  onChange={(e) => updateSite(s.id, { nom: e.target.value })}
                  className="h-8 text-xs"
                  aria-label={`Nom du site ${idx + 1}`}
                  maxLength={60}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Gouvernorat</Label>
                <Select
                  value={s.gouvernorat}
                  onValueChange={(v) => updateSite(s.id, { gouvernorat: v })}
                >
                  <SelectTrigger size="sm" className="h-8 w-full text-xs" aria-label={`Gouvernorat du site ${idx + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {governorats.map((g) => (
                      <SelectItem key={g.name} value={g.name} className="text-xs">
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">TMJ estimé</Label>
                <Input
                  type="number"
                  value={s.tmj}
                  min={0}
                  step={500}
                  onChange={(e) => updateSite(s.id, { tmj: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-8 text-xs tabular-nums"
                  aria-label={`TMJ estimé du site ${idx + 1}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Concurrents 5 km</Label>
                <Input
                  type="number"
                  value={s.concurrents}
                  min={0}
                  step={1}
                  onChange={(e) => updateSite(s.id, { concurrents: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-8 text-xs tabular-nums"
                  aria-label={`Concurrents à 5 km du site ${idx + 1}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Investissement</Label>
                <Input
                  type="number"
                  value={s.invest}
                  min={0}
                  step={50_000}
                  onChange={(e) => updateSite(s.id, { invest: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-8 text-xs tabular-nums"
                  aria-label={`Investissement du site ${idx + 1}`}
                />
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-red-600"
                onClick={() => removeSite(s.id)}
                disabled={sites.length <= MIN_SITES}
                aria-label={`Supprimer le site ${idx + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Score composite = TMJ (40 %) + absence de concurrence (30 %) + motorisation du gouvernorat (15 %) +
            sobriété de l&apos;investissement (15 %) — critères normalisés min-max entre les candidats, score /100.
          </p>
        </CardContent>
      </Card>

      <ResultsPanel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard label="Meilleur site" value={best?.nom ?? "—"} icon={Trophy} tone="success" sub={best ? `${best.gouvernorat} · score ${best.score}/100` : undefined} />
          <KpiCard label="Score moyen" value={`${fmtInt(avgScore)}/100`} icon={MapPinned} sub={`${sites.length} sites candidats`} />
          <KpiCard label="Écart 1ᵉʳ / dernier" value={`${fmtInt(ecart)} pts`} icon={ArrowDownUp} tone="warning" sub="dispersion des scores" />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-semibold">Classement</p>
            <ol className="mt-3 space-y-2">
              {ranked.map((r, i) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border p-2.5"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: i < 3 ? MEDALS[i] : "var(--muted)" }}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.nom}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.gouvernorat} · TMJ {fmtInt(r.tmj)} · {r.concurrents} concurrents · {fmtTnd(r.invest)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">{r.score}/100</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-semibold">Scores comparés</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Score composite sur 100 — médailles pour le podium</p>
            <div className="mt-3 w-full" style={{ height: Math.max(220, sites.length * 44) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={AXIS_STYLE.tick}
                    stroke={AXIS_STYLE.stroke}
                    tickLine={false}
                    tickFormatter={(v) => `${v}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="nom"
                    tick={{ ...AXIS_STYLE.tick, fontSize: 10.5 }}
                    stroke={AXIS_STYLE.stroke}
                    tickLine={false}
                    width={150}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle()}
                    cursor={{ fill: "var(--muted)" }}
                    formatter={(v) => [`${v}/100`, "Score composite"]}
                  />
                  <Bar dataKey="score" barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    <LabelList dataKey="score" position="right" formatter={(v) => `${v}`} style={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                    {chartData.map((d) => (
                      <Cell key={d.nom} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Comparateur des sites candidats — 3 modes d'affichage */}
        <DataViews
          viewKey="calc-multi-sites"
          columns={columns}
          rows={tableRows}
          rowKey={(r) => r.id}
          emptyMessage="Ajoutez au moins deux sites candidats pour comparer."
          nested={{
            groupKey: (r) => r.gouvernorat,
            groupLabel: (gk, grows) => {
              const avg = grows.reduce((s, r) => s + r.score, 0) / (grows.length || 1)
              const bestRow = grows.reduce((acc, r) => (r.score > acc.score ? r : acc), grows[0])
              return (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <MapPinned className="h-3.5 w-3.5 text-primary/70" aria-hidden />
                  {gk}
                  <span className="ml-1 text-[11px] font-normal text-primary/70">
                    — {grows.length} site{grows.length > 1 ? "s" : ""} · score moyen {fmtInt(avg)}/100 · meilleur : {bestRow?.nom ?? "—"}
                  </span>
                </span>
              )
            },
            groupSortValue: (_gk, grows) => grows.length,
            hideColumnKeyInGroups: "gouvernorat",
            defaultOpen: "first",
          }}
          renderCard={(r) => (
            <Card className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: r.rank <= 3 ? MEDALS[r.rank - 1] : "var(--muted)" }}
                    aria-hidden="true"
                  >
                    {r.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.nom}</p>
                    <p className="text-[11px] text-muted-foreground">{r.gouvernorat}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">{r.score}/100</span>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
                  <div>
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">TMJ</dt>
                    <dd className="mt-0.5 text-xs font-semibold tabular-nums">{fmtInt(r.tmj)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Conc. 5 km</dt>
                    <dd className="mt-0.5 text-xs font-semibold tabular-nums">{r.concurrents}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Invest.</dt>
                    <dd className="mt-0.5 text-xs font-semibold tabular-nums">{fmtTnd(r.invest)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}
        />
      </ResultsPanel>

      <SaveScenarioBar defaultLabel={defaultLabel} initialLabel={initial?.label} saving={saving} onSave={handleSave} onReset={reset} />
    </div>
  )
}
