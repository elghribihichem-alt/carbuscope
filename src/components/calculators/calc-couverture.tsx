'use client'

// A.6.2 — Calculateur de couverture concurrentielle

import * as React from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Gauge, Lightbulb, MapPin, Plus, Radar, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { KpiCard } from "@/components/shell/kpi-card"
import { haversineKm } from "@/lib/geo"
import { SERVICE_LABELS, type StationDTO } from "@/lib/types"
import { AXIS_STYLE, GRID_STROKE, tooltipStyle } from "@/lib/chart"
import {
  ChartBlock,
  ParamsPanel,
  ResultsPanel,
  SaveScenarioBar,
  SelectParam,
  SliderParam,
  asNumber,
  asString,
  fmtDec,
  fmtInt,
  fmtKm,
  fmtPct,
  type InitialScenario,
} from "./calc-shared"

const NICHE_THRESHOLD = 30 // % — service proposé par moins de 30 % des concurrents du rayon

export interface CalcCouvertureProps {
  brandSlug: string
  onSave: (type: string, label: string, params: Record<string, unknown>, result: Record<string, unknown>) => void
  saving?: boolean
  initial?: InitialScenario | null
}

type ServiceStat = { service: string; label: string; pct: number; niche: boolean }

export function CalcCouverture({ brandSlug, onSave, saving, initial }: CalcCouvertureProps) {
  const p = initial?.params ?? {}
  const [myStations, setMyStations] = React.useState<StationDTO[] | null>(null)
  const [competitors, setCompetitors] = React.useState<StationDTO[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [stationId, setStationId] = React.useState(asString(p.stationId, ""))
  const [radius, setRadius] = React.useState(asNumber(p.radius, 10))

  React.useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/api/stations?brand=${encodeURIComponent(brandSlug)}&limit=400`).then((r) => r.json()),
      fetch(`/api/stations?limit=2200`).then((r) => r.json()),
    ])
      .then(([mine, all]: [{ stations?: StationDTO[] }, { stations?: StationDTO[] }]) => {
        if (cancelled) return
        const mineList = (mine.stations ?? []).filter((s) => s.status !== "CLOSED")
        const compList = (all.stations ?? []).filter(
          (s) => s.brandSlug !== brandSlug && s.status !== "CLOSED"
        )
        setMyStations(mineList)
        setCompetitors(compList)
        setStationId((prev) => (mineList.some((s) => s.id === prev) ? prev : (mineList[0]?.id ?? "")))
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les stations. Vérifiez votre connexion puis réessayez.")
      })
    return () => {
      cancelled = true
    }
  }, [brandSlug])

  const loading = myStations === null || competitors === null
  const myStation = myStations?.find((s) => s.id === stationId) ?? null

  // ---------- Analyse concurrentielle (haversine, client-side) ----------
  const analysis = React.useMemo(() => {
    if (!myStation || !competitors) return null
    const withDist = competitors
      .map((c) => ({ station: c, distanceKm: haversineKm(myStation.lat, myStation.lng, c.lat, c.lng) }))
      .filter((c) => c.distanceKm <= radius)
      .sort((a, b) => a.distanceKm - b.distanceKm)

    const inRadius = withDist.map((w) => w.station)
    const services = Object.keys(SERVICE_LABELS).map((slug) => {
      const pct = inRadius.length > 0 ? (inRadius.filter((c) => c.services.includes(slug)).length / inRadius.length) * 100 : 0
      return { service: slug, label: SERVICE_LABELS[slug], pct: Math.round(pct), niche: pct < NICHE_THRESHOLD }
    })

    return {
      competitorsInRadius: withDist,
      count: inRadius.length,
      nearest: withDist[0] ?? null,
      saturation: Math.min(100, Math.round((inRadius.length / 8) * 100)),
      services,
      niches: services.filter((s) => s.niche),
    }
  }, [myStation, competitors, radius])

  const saturationTone = !analysis
    ? "default"
    : analysis.saturation < 50
      ? "success"
      : analysis.saturation < 80
        ? "warning"
        : "danger"

  const stationOptions = (myStations ?? []).map((s) => ({
    value: s.id,
    label: `${s.name} (${s.code})`,
    description: `${s.gouvernorat} · ${s.delegation}`,
  }))

  const reset = () => {
    setStationId(myStations?.[0]?.id ?? "")
    setRadius(10)
  }

  const defaultLabel = myStation
    ? `Couverture — ${myStation.name} (rayon ${radius} km)`
    : "Couverture concurrentielle"

  const handleSave = (label: string) => {
    onSave(
      "couverture",
      label,
      {
        stationId,
        station: myStation ? `${myStation.name} (${myStation.code})` : "",
        gouvernorat: myStation?.gouvernorat ?? "",
        radius,
      },
      {
        competitors: analysis?.count ?? 0,
        nearestKm: analysis?.nearest ? Number(analysis.nearest.distanceKm.toFixed(2)) : null,
        saturation: analysis?.saturation ?? 0,
        niches: analysis?.niches.map((n) => n.label) ?? [],
      }
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <ParamsPanel
          icon={Radar}
          title="Paramètres"
          subtitle="Station de référence et rayon de chalandise — l'analyse se recalcule en direct"
        >
          <SelectParam
            label="Ma station de référence"
            value={stationId}
            onValueChange={setStationId}
            options={stationOptions}
            disabled={loading || stationOptions.length === 0}
            hint={
              loading
                ? "Chargement des stations de l'enseigne…"
                : stationOptions.length === 0
                  ? "Aucune station active pour cette enseigne."
                  : `${stationOptions.length} stations ${myStation?.brandName ?? ""}`
            }
          />
          <SliderParam
            label="Rayon de chalandise"
            value={radius}
            min={2}
            max={30}
            step={1}
            onValueChange={setRadius}
            format={(v) => fmtKm(v)}
            hint="Rayon d'analyse autour de la station de référence (géodésie haversine)"
          />
          {myStation && (
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{myStation.name}</p>
              <p className="mt-0.5">
                {myStation.address} · {myStation.gouvernorat}
              </p>
              <p className="mt-1">
                {myStation.services.length} services proposés · note {fmtDec(myStation.rating, 1).replace(".", ",")}/5
              </p>
            </div>
          )}
        </ParamsPanel>

        <ResultsPanel busy={loading}>
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
              {error}
            </div>
          ) : loading || !analysis ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <KpiCard
                  label="Concurrents dans le rayon"
                  value={fmtInt(analysis.count)}
                  icon={Radar}
                  tone="warning"
                  sub={`sur ${fmtInt(competitors?.length ?? 0)} concurrents nationaux`}
                />
                <KpiCard
                  label="Plus proche concurrent"
                  value={analysis.nearest ? fmtKm(analysis.nearest.distanceKm) : "—"}
                  icon={MapPin}
                  sub={analysis.nearest ? `${analysis.nearest.station.brandName} · ${analysis.nearest.station.name}` : "aucun dans le rayon"}
                />
                <KpiCard
                  label="Indice de saturation"
                  value={fmtPct(analysis.saturation)}
                  icon={Gauge}
                  tone={saturationTone}
                  sub={`${analysis.count} concurrents pour 8 places « normales »`}
                />
                <KpiCard
                  label="Niches identifiées"
                  value={fmtInt(analysis.niches.length)}
                  icon={Lightbulb}
                  tone="success"
                  sub={`services proposés par moins de ${NICHE_THRESHOLD} % des concurrents`}
                />
              </div>

              <div className="rounded-lg border bg-card p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Opportunités de différenciation
                </p>
                {analysis.niches.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Aucune niche détectée : les concurrents du rayon couvrent déjà l&apos;ensemble des services standards.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {analysis.niches.map((n) => {
                      const mine = myStation?.services.includes(n.service) ?? false
                      return (
                        <Badge
                          key={n.service}
                          variant="outline"
                          className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                        >
                          {!mine && <Plus className="h-3 w-3" />}
                          {n.label}
                          <span className="text-[10px] font-normal opacity-70">{n.pct} %</span>
                        </Badge>
                      )
                    })}
                  </div>
                )}
                {myStation && analysis.niches.length > 0 && (
                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                    Les services non proposés par votre station sont marqués d&apos;un « + » : ce sont des leviers de
                    différenciation immédiats face aux {analysis.count} concurrents du rayon.
                  </p>
                )}
              </div>

              <ChartBlock
                title="Services offerts par les concurrents du rayon"
                sub={`Part des ${analysis.count} concurrents dans un rayon de ${radius} km — en émeraude : niches < ${NICHE_THRESHOLD} %`}
                className="h-80 sm:h-80"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analysis.services} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={AXIS_STYLE.tick}
                      stroke={AXIS_STYLE.stroke}
                      tickLine={false}
                      tickFormatter={(v) => `${v} %`}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={{ ...AXIS_STYLE.tick, fontSize: 10.5 }}
                      stroke={AXIS_STYLE.stroke}
                      tickLine={false}
                      width={128}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      cursor={{ fill: "var(--muted)" }}
                      formatter={(v) => [`${v} % des concurrents`, "Pénétration"]}
                    />
                    <ReferenceLine x={NICHE_THRESHOLD} stroke="#d97706" strokeDasharray="4 3" />
                    <Bar dataKey="pct" name="Pénétration" barSize={14} radius={[0, 3, 3, 0]} isAnimationActive={false}>
                      <LabelList dataKey="pct" position="right" formatter={(v) => `${v} %`} style={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                      {analysis.services.map((s) => (
                        <Cell key={s.service} fill={s.niche ? "#059669" : "#64748b"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartBlock>
            </>
          )}
        </ResultsPanel>
      </div>

      <SaveScenarioBar defaultLabel={defaultLabel} initialLabel={initial?.label} saving={saving} onSave={handleSave} onReset={reset} />
    </div>
  )
}
