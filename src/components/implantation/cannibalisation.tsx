'use client'

// CarbuScope — Implantation (Task ID: 9) / outil 4 : « Score de cannibalisation ».
// Stations de l'enseigne trop proches d'un concurrent (< seuil) :
// calcul client haversine avec pré-filtrage bbox, score 0-100
// (proximité 45 pts · densité 30 pts · pression trafic 25 pts),
// KPI réseau, pires cas filtrables et liste des paires par station.

import { useMemo, useState } from "react"
import { Crosshair, Gauge, MapPin, Radar, ShieldCheck, Swords, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { cn } from "@/lib/utils"
import { haversineKm } from "@/lib/geo"
import type { StationDTO } from "@/lib/types"
import {
  BrandDot, NoteCell, fmtDist, fmtKm, inService, median, num,
  type ImplantationData,
} from "./implantation-shared"

/* ============================== Constantes ============================== */

const SEUIL_OPTIONS = [
  { value: "0.5", label: "500 m" },
  { value: "1", label: "1 km" },
  { value: "2", label: "2 km" },
] as const

type Risk = "high" | "watch" | "ok"
const RISK_META: Record<Risk, { label: string; badge: string; color: string; rank: number }> = {
  high: {
    label: "Risque élevé",
    badge: "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400",
    color: "#dc2626",
    rank: 0,
  },
  watch: {
    label: "À surveiller",
    badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    color: "#d97706",
    rank: 1,
  },
  ok: {
    label: "Faible",
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    color: "#059669",
    rank: 2,
  },
}

/** Seuil en dessous duquel un concurrent est dit co-localisé (coordonnées identiques). */
const COLOC_KM = 0.05

/** Score 0-100 — proximité 45 pts · densité 30 pts · pression trafic 25 pts. */
function cannibalisationScore(
  nearestKm: number, seuilKm: number, count: number, compTraffic: number, myTraffic: number
): number {
  const proximity = (1 - Math.min(nearestKm / seuilKm, 1)) * 45
  const density = Math.min(count / 6, 1) * 30
  // Pression : trafic cumulé des concurrents ÷ trafic de ma station (cap ×2, neutre si non renseigné).
  const pressure = myTraffic > 0 ? (Math.min(compTraffic / myTraffic, 2) / 2) * 25 : 0
  return Math.round(proximity + density + pressure)
}

const riskOf = (score: number): Risk => (score >= 70 ? "high" : score >= 40 ? "watch" : "ok")

/* ============================== Types calcul ============================== */

type StationAnalysis = {
  station: StationDTO
  /** Concurrents dans le seuil, triés par distance croissante. */
  comps: { c: StationDTO; d: number }[]
  nearestKm: number | null
  count: number
  compTraffic: number
  score: number
  risk: Risk
}

type PairRow = {
  myCode: string
  myName: string
  myGov: string
  compCode: string
  compName: string
  compBrand: string
  compSlug: string | null
  compColor: string
  compTraffic: number
  compRating: number
  compReviews: number
  distanceKm: number
  isNearest: boolean
  countInSeuil: number
  score: number
  risk: Risk
}

export function Cannibalisation({ data, brandSlug }: { data: ImplantationData; brandSlug: string }) {
  const [brand, setBrand] = useState<string | null>(null)
  const [seuil, setSeuil] = useState<string>("1")
  const [focus, setFocus] = useState<string | null>(null)

  const selectedBrand = brand ?? brandSlug
  const seuilKm = Number.parseFloat(seuil)
  const myBrand = data.brands.find((b) => b.slug === selectedBrand)

  /* ---- Une seule passe de calcul par (enseigne, seuil) ---- */
  const analysis = useMemo<{ stations: StationAnalysis[]; pairs: PairRow[] }>(() => {
    const my = data.stations.filter((s) => s.brandSlug === selectedBrand && inService(s))
    const comps = data.stations.filter((s) => s.status === "ACTIVE" && s.brandSlug !== selectedBrand)

    const stations: StationAnalysis[] = []
    const pairs: PairRow[] = []

    for (const m of my) {
      // Pré-filtrage bbox (évite haversine sur tout le parc national)
      const dLat = seuilKm / 111 + 0.02
      const dLng = seuilKm / (111 * Math.max(Math.cos((m.lat * Math.PI) / 180), 0.2)) + 0.02
      const found: { c: StationDTO; d: number }[] = []
      for (const c of comps) {
        if (Math.abs(c.lat - m.lat) > dLat || Math.abs(c.lng - m.lng) > dLng) continue
        const d = haversineKm(m.lat, m.lng, c.lat, c.lng)
        if (d <= seuilKm) found.push({ c, d })
      }
      found.sort((a, b) => a.d - b.d)

      const compTraffic = found.reduce((sum, f) => sum + f.c.traffic, 0)
      const nearestKm = found.length > 0 ? found[0].d : null
      const score = nearestKm !== null
        ? cannibalisationScore(nearestKm, seuilKm, found.length, compTraffic, m.traffic)
        : 0
      const risk: Risk = found.length === 0 ? "ok" : riskOf(score)

      stations.push({ station: m, comps: found, nearestKm, count: found.length, compTraffic, score, risk })

      for (const { c, d } of found) {
        pairs.push({
          myCode: m.code, myName: m.name, myGov: m.gouvernorat,
          compCode: c.code, compName: c.name, compBrand: c.brandName, compSlug: c.brandSlug,
          compColor: c.brandColor, compTraffic: c.traffic, compRating: c.rating, compReviews: c.reviewsCount,
          distanceKm: d, isNearest: d === nearestKm, countInSeuil: found.length, score, risk,
        })
      }
    }

    // Pires scores d'abord, puis concurrent le plus proche
    pairs.sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm)
    return { stations, pairs }
  }, [data.stations, selectedBrand, seuilKm])

  const exposed = useMemo(() => analysis.stations.filter((s) => s.count > 0), [analysis])
  const total = analysis.stations.length
  const pctExposed = total > 0 ? (exposed.length / total) * 100 : 0
  const medianNearest = useMemo(() => median(exposed.map((s) => s.nearestKm ?? 0)), [exposed])
  const worst = useMemo(
    () => [...exposed].sort((a, b) => b.score - a.score).slice(0, 3),
    [exposed]
  )
  const priorityCount = exposed.filter((s) => s.score >= 70).length
  const safe = total - exposed.length

  const shownPairs = useMemo(
    () => (focus ? analysis.pairs.filter((p) => p.myCode === focus) : analysis.pairs),
    [analysis.pairs, focus]
  )
  const focusName = focus ? analysis.stations.find((s) => s.station.code === focus)?.station.name : null

  /* ---- Colonnes ---- */
  const columns: DataViewColumn<PairRow>[] = [
    {
      key: "myStation", header: "Ma station",
      sortValue: (p) => p.myName,
      render: (p) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{p.myName}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            <span className="font-mono">{p.myCode}</span> · {p.myGov}
          </p>
        </div>
      ),
    },
    {
      key: "concurrent", header: "Concurrent",
      sortValue: (p) => p.compName,
      render: (p) => (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs">
          <BrandDot color={p.compColor} />
          <span className="truncate font-medium" title={p.compName}>{p.compName}</span>
          <span className="hidden truncate text-muted-foreground sm:inline">· {p.compBrand}</span>
          {p.isNearest && (
            <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px] text-primary">
              le plus proche
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "distance", header: "Distance", align: "right",
      sortValue: (p) => p.distanceKm,
      render: (p) => (
        <span
          className={cn("text-sm font-semibold tabular-nums", p.distanceKm < seuilKm / 3 && "text-red-600 dark:text-red-400")}
          title={p.distanceKm < COLOC_KM ? "Coordonnées identiques dans le recensement — distance réelle 0 m" : undefined}
        >
          {p.distanceKm < COLOC_KM ? "0 m · co-localisé" : fmtDist(p.distanceKm)}
        </span>
      ),
    },
    {
      key: "traffic", header: "Trafic concurrent", align: "right",
      sortValue: (p) => p.compTraffic,
      render: (p) => <span className="text-sm tabular-nums">{num(p.compTraffic)}</span>,
    },
    {
      key: "count", header: "Conc. < seuil", align: "right",
      sortValue: (p) => p.countInSeuil,
      render: (p) => <span className="text-sm tabular-nums">×{p.countInSeuil}</span>,
    },
    {
      key: "score", header: "Score", align: "right",
      sortValue: (p) => p.score,
      render: (p) => (
        <span className="flex items-center justify-end gap-2">
          <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.min(p.score, 100)}%`, backgroundColor: RISK_META[p.risk].color }}
            />
          </span>
          <span className="w-7 text-right text-sm font-semibold tabular-nums">{p.score}</span>
        </span>
      ),
    },
    {
      key: "risk", header: "Risque",
      sortValue: (p) => RISK_META[p.risk].rank,
      render: (p) => (
        <Badge variant="outline" className={RISK_META[p.risk].badge}>{RISK_META[p.risk].label}</Badge>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {/* Paramètres : enseigne + seuil */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Swords className="h-4 w-4 text-primary" aria-hidden />
            Cannibalisation du réseau
          </CardTitle>
          <CardDescription>
            Concurrents = autres enseignes, stations ACTIVES · mes stations en service
            (ACTIVE + RÉNOVATION) · distances haversine, une seule passe de calcul par paramétrage.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Enseigne analysée</p>
            <Select value={selectedBrand} onValueChange={(v) => { setBrand(v); setFocus(null) }}>
              <SelectTrigger size="sm" className="w-[230px]" aria-label="Enseigne analysée">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.brands.map((b) => (
                  <SelectItem key={b.slug} value={b.slug}>
                    <span className="inline-flex items-center gap-1.5">
                      <BrandDot color={b.color} />
                      {b.name}
                      <span className="text-[11px] text-muted-foreground">· {num(b.stationCount)} stations</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Seuil de proximité</p>
            <Select value={seuil} onValueChange={setSeuil}>
              <SelectTrigger size="sm" className="w-[130px]" aria-label="Seuil de distance des concurrents">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEUIL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="max-w-md text-[11px] leading-snug text-muted-foreground">
            Score 0-100 : proximité du concurrent le plus proche (45 pts) · densité concurrente dans
            le seuil (30 pts, cap à 6) · pression trafic concurrent ÷ trafic de la station (25 pts,
            cap ×2, neutre si trafic non renseigné). Risque : rouge ≥ 70 · ambre ≥ 40 · émeraude sinon.
          </p>
          <p
            className="flex w-full items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] leading-snug text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
            role="note"
          >
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Données : les coordonnées du recensement sont arrondies (une même adresse de grille
            partagée par plusieurs stations). Les paires à « 0 m · co-localisé » partagent
            exactement le même point — les seuils 500 m / 1 km / 2 km capturent donc les mêmes
            paires, séparées sinon d&apos;au moins ~9 km.
          </p>
        </CardContent>
      </Card>

      {total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <MapPin className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm font-medium">
              Aucune station en service pour « {myBrand?.name ?? selectedBrand} »
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              Choisissez une autre enseigne pour lancer l&apos;analyse de cannibalisation.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI réseau */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Stations exposées"
              value={num(exposed.length)}
              icon={Radar}
              tone={pctExposed > 50 ? "warning" : "default"}
              sub={`sur ${num(total)} stations en service · ${pctExposed.toFixed(0)} % du réseau`}
            />
            <KpiCard
              label="Distance médiane"
              value={medianNearest !== null ? fmtKm(medianNearest) : "—"}
              icon={Crosshair}
              sub="au concurrent le plus proche (stations exposées)"
            />
            <KpiCard
              label="Concurrents recensés"
              value={num(analysis.pairs.length)}
              icon={Swords}
              tone="info"
              sub={`à moins de ${SEUIL_OPTIONS.find((o) => o.value === seuil)?.label ?? seuil}`}
            />
            <KpiCard
              label="Priorités (score ≥ 70)"
              value={num(priorityCount)}
              icon={TriangleAlert}
              tone={priorityCount > 0 ? "danger" : "success"}
              sub={priorityCount > 0 ? "stations à arbitrer en premier" : `réseau à l'aise · ${num(safe)} stations sans concurrent`}
            />
          </div>

          {/* Synthèse + pires cas filtrables */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs leading-relaxed">
                <Swords className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="font-semibold text-primary">{pctExposed.toFixed(0)} %</span> du réseau
                  {myBrand ? ` ${myBrand.name}` : ""} ({num(exposed.length)} stations sur {num(total)}) a un
                  concurrent à moins de {SEUIL_OPTIONS.find((o) => o.value === seuil)?.label ?? seuil} —
                  priorité : {priorityCount > 0
                    ? `${num(priorityCount)} station${priorityCount > 1 ? "s" : ""} au score ≥ 70`
                    : "aucune station au score ≥ 70"}.
                </span>
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Pires cas :</span>
                {worst.length === 0 && (
                  <span className="text-xs italic text-muted-foreground">aucune station exposée à ce seuil.</span>
                )}
                {worst.map((w) => (
                  <button
                    key={w.station.code}
                    type="button"
                    onClick={() => setFocus(focus === w.station.code ? null : w.station.code)}
                    aria-pressed={focus === w.station.code}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      focus === w.station.code
                        ? "border-red-400 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                        : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
                    )}
                    aria-label={`Filtrer sur ${w.station.name}, score ${w.score} sur 100`}
                  >
                    <TriangleAlert className="h-3 w-3" aria-hidden />
                    <span className="max-w-[160px] truncate">{w.station.name}</span>
                    <span className="tabular-nums opacity-70">{w.score}/100</span>
                  </button>
                ))}
                {focus && focusName && (
                  <button
                    type="button"
                    onClick={() => setFocus(null)}
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                    aria-label="Retirer le filtre sur la station"
                  >
                    Filtre : <span className="max-w-[160px] truncate font-medium">{focusName}</span> ×
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Liste des paires, nested par station de mon enseigne */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Paires station / concurrent</CardTitle>
              <CardDescription>
                {shownPairs.length} paire{shownPairs.length > 1 ? "s" : ""}· {focus
                  ? "filtrées sur une station"
                  : `${num(exposed.length)} stations exposées · ${num(safe)} sans concurrent (non listées)`}
                {" "}· 3 modes d&apos;affichage · nested par station
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataViews
                viewKey="implantation-cannibalisation"
                columns={columns}
                rows={shownPairs}
                rowKey={(p) => `${p.myCode}-${p.compCode}`}
                emptyMessage={
                  focus
                    ? "Aucun concurrent sous le seuil pour cette station."
                    : `Aucun concurrent à moins de ${SEUIL_OPTIONS.find((o) => o.value === seuil)?.label ?? seuil} — réseau à l'aise à ce seuil.`
                }
                maxHeightClassName="max-h-[26rem]"
                nested={{
                  groupKey: (p) => p.myCode,
                  groupLabel: (gk, grows) => {
                    const first = grows[0]
                    const nearest = grows.reduce((min, p) => Math.min(min, p.distanceKm), Infinity)
                    const risk = RISK_META[first?.risk ?? "ok"]
                    return (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-medium">{first?.myName}</span>
                        <span className="font-mono text-[11px] font-normal text-primary/70">{gk}</span>
                        <span className="text-[11px] font-normal text-primary/70">
                          · {first?.myGov} — {grows.length} concurrent{grows.length > 1 ? "s" : ""} · plus proche{" "}
                          {fmtDist(nearest)} · score {first?.score}/100
                        </span>
                        <Badge variant="outline" className={risk.badge}>{risk.label}</Badge>
                      </span>
                    )
                  },
                  groupSortValue: (_gk, grows) => 100 - (grows[0]?.score ?? 0),
                  hideColumnKeyInGroups: "myStation",
                  defaultOpen: "first",
                }}
                renderCard={(p) => (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" aria-hidden />
                            {p.myName}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            <span className="font-mono">{p.myCode}</span> · {p.myGov}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn("shrink-0", RISK_META[p.risk].badge)}>
                          {RISK_META[p.risk].label}
                        </Badge>
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-xs">
                        <BrandDot color={p.compColor} />
                        <span className="truncate font-medium" title={p.compName}>{p.compName}</span>
                        <span className="text-muted-foreground">· {p.compBrand}</span>
                        {p.isNearest && (
                          <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px] text-primary">le plus proche</Badge>
                        )}
                      </p>
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Distance</dt>
                          <dd className="font-semibold tabular-nums" title={p.distanceKm < COLOC_KM ? "Coordonnées identiques — distance réelle 0 m" : undefined}>
                            {p.distanceKm < COLOC_KM ? "0 m · co-loc." : fmtDist(p.distanceKm)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Trafic conc.</dt>
                          <dd className="font-semibold tabular-nums">{num(p.compTraffic)}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Conc. &lt; seuil</dt>
                          <dd className="font-semibold tabular-nums">×{p.countInSeuil}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Score</dt>
                          <dd className="flex items-center gap-1.5 font-semibold tabular-nums">
                            {p.score}
                            <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted" aria-hidden>
                              <span
                                className="block h-full rounded-full"
                                style={{ width: `${Math.min(p.score, 100)}%`, backgroundColor: RISK_META[p.risk].color }}
                              />
                            </span>
                          </dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>
                )}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
