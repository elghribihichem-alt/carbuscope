"use client"

// Shadow Market (T44-c) — onglet « 📍 Par Station » : sélection d'une station
// menacée (recherche ou classement) → la carte focus la station, trace les
// cercles 500 m / 1 km / 2 km, colore les points par anneau et le panneau
// détaille la répartition + la liste des points dans le rayon.

import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import type { ShadowMapResponse, ShadowMapStationDTO, ShadowPointDTO, ShadowLevel } from "@/lib/types"
import { haversineKm } from "@/lib/geo"
import {
  ShadowLevelBadge, typologyLabel, formatTnd, formatLJ,
  SHADOW_COLORS, LEVEL_COLORS,
} from "@/components/shadow/shadow-shared"
import { ShadowMap } from "./shadow-map"
import { Search, MapPin, Gauge, TrendingDown, Target } from "lucide-react"

const RING_LABELS = ["dans 500 m", "500 m – 1 km", "1 – 2 km"]
const RING_LEVELS: ShadowLevel[] = ["RED", "ORANGE", "YELLOW"]

export function StationTab({ data }: { data: ShadowMapResponse }) {
  const [query, setQuery] = useState("")
  const [selectedCode, setSelectedCode] = useState<string | null>(null)

  // Stations les plus menacées d'abord (perte mensuelle décroissante)
  const ranked = useMemo(
    () => [...data.stations].sort((a, b) => b.lossTnd - a.lossTnd),
    [data.stations]
  )
  // Sélection effective : station choisie, sinon la plus menacée par défaut (dérivé, sans effet)
  const station: ShadowMapStationDTO | null =
    (selectedCode ? data.stations.find(s => s.code === selectedCode) ?? null : null) ?? ranked[0] ?? null

  const q = query.trim().toLowerCase()
  const suggestions = useMemo(() => {
    if (!q) return ranked.slice(0, 30)
    return ranked
      .filter(s => `${s.name} ${s.brandName} ${s.gouvernorat} ${s.delegation} ${s.code}`.toLowerCase().includes(q))
      .slice(0, 30)
  }, [q, ranked])

  const radii = data.config.radiiM

  // ----- Répartition des points par anneau autour de la station sélectionnée -----
  const around = useMemo(() => {
    if (!station) return null
    const maxR = radii[radii.length - 1]
    const stats = radii.map(() => ({ count: 0, loss: 0, volume: 0 }))
    const detailed: { p: ShadowPointDTO; dM: number; ring: number }[] = []
    for (const p of data.points) {
      const dM = haversineKm(station.lat, station.lng, p.lat, p.lng) * 1000
      if (dM > maxR) continue
      let ring = -1
      for (let i = 0; i < radii.length; i++) {
        if (dM <= radii[i]) { ring = i; break }
      }
      if (ring >= 0) {
        stats[ring].count++
        stats[ring].loss += p.lossTnd
        stats[ring].volume += p.volumeLJ
      }
      detailed.push({ p, dM, ring })
    }
    detailed.sort((a, b) => a.dM - b.dM)
    return { stats, detailed }
  }, [station, data.points, radii])

  // ----- Stations proches à afficher sur la carte (contexte ± 6 km) -----
  const nearbyStations = useMemo(() => {
    if (!station) return []
    return data.stations.filter(s => haversineKm(station.lat, station.lng, s.lat, s.lng) <= 6)
  }, [station, data.stations])

  const stationFocus = useMemo(
    () => (station ? { lat: station.lat, lng: station.lng, km: 2.6 } : null),
    [station]
  )
  const stationRadii = useMemo(
    () => (station ? { lat: station.lat, lng: station.lng, radiiM: radii } : null),
    [station, radii]
  )

  if (!station || !around) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Aucune station menacée dans le périmètre.</p>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ---------- Carte + rayons ---------- */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" aria-hidden />
              Rayon de cannibalisation — {station.name}
            </CardTitle>
            <CardDescription>
              Cercles {radii.map(r => (r >= 1000 ? `${r / 1000} km` : `${r} m`)).join(" / ")} · points colorés par
              anneau (rouge = le plus proche) · les points hors 2 km gardent leur couleur de typologie
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ShadowMap
              points={data.points}
              stations={nearbyStations}
              typologies={data.typologies}
              focusOn={stationFocus}
              stationRadii={stationRadii}
              csvContext={`station-${station.code.toLowerCase()}`}
              height="h-[560px]"
            />
          </CardContent>
        </Card>

        {/* ---------- Sélecteur de station ---------- */}
        <Card>
          <CardHeader>
            <CardTitle>Stations menacées</CardTitle>
            <CardDescription>Classement par perte mensuelle — {data.stations.length} stations concernées</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Rechercher (nom, enseigne, gouvernorat)…"
                className="h-9 pl-8 text-xs"
                aria-label="Rechercher une station"
              />
            </div>
            <ul className="max-h-[440px] space-y-1 overflow-y-auto pr-1.5 scroll-coffee">
              {suggestions.map((s, i) => {
                const active = s.code === station.code
                return (
                  <li key={s.code}>
                    <button
                      type="button"
                      onClick={() => setSelectedCode(s.code)}
                      aria-pressed={active}
                      className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                        active
                          ? "border-[#E53935]/50 bg-[#E53935]/5"
                          : "border-transparent hover:border-stone-200 hover:bg-accent/60 dark:hover:border-stone-700"
                      }`}
                    >
                      <span className="w-4 shrink-0 text-right text-[11px] font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.brandColor }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-stone-900 dark:text-stone-50">{s.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{s.brandName} · {s.gouvernorat} · {s.delegation}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-xs font-semibold tabular-nums" style={{ color: SHADOW_COLORS.red }}>{formatTnd(s.lossTnd)}</span>
                        <span className="block text-[10px] tabular-nums text-muted-foreground">{s.points} pts</span>
                      </span>
                    </button>
                  </li>
                )
              })}
              {suggestions.length === 0 && (
                <li className="py-6 text-center text-xs text-muted-foreground">Aucune station ne correspond à « {query} ».</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* ---------- Fiche station + répartition par anneau + points ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Fiche station</CardTitle>
            <CardDescription>{station.code} · périmètre de cannibalisation {radii[radii.length - 1] / 1000} km</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2.5">
              <span className="mt-1 h-3 w-3 shrink-0 rotate-45 rounded-[2px]" style={{ backgroundColor: station.brandColor }} aria-hidden />
              <div className="min-w-0">
                <p className="text-base font-bold leading-tight text-stone-900 dark:text-stone-50">{station.name}</p>
                <p className="text-xs text-muted-foreground">{station.brandName} · {station.gouvernorat} · {station.delegation}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ShadowLevelBadge level={station.level} loss={station.lossTnd} />
              <Badge variant="outline" className="gap-1.5 text-[11px]">
                <Gauge className="h-3 w-3" aria-hidden />
                {station.points} point{station.points > 1 ? "s" : ""} à moins de {radii[radii.length - 1] / 1000} km
              </Badge>
              <Badge variant="outline" className="gap-1.5 text-[11px]">
                <MapPin className="h-3 w-3" aria-hidden />
                {station.gouvernorat}
              </Badge>
            </div>
            <div className="rounded-lg border border-[#E53935]/25 bg-[#E53935]/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                Perte de marge mensuelle estimée
              </p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums" style={{ color: SHADOW_COLORS.red }}>
                {formatTnd(station.lossTnd)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Hypothèse : part du volume informel captée selon la distance (max {data.config.cannibRadiusM / 1000} km).
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Répartition par anneau</CardTitle>
            <CardDescription>Points informels et pertes attribuées par couronne de distance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {around.stats.map((s, i) => {
              const maxCount = Math.max(...around.stats.map(x => x.count), 1)
              return (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-50">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LEVEL_COLORS[RING_LEVELS[i]] }} aria-hidden />
                      {RING_LABELS[i]}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {s.count} pts · {formatLJ(s.volume)} ·{" "}
                      <strong className="text-foreground">{formatTnd(s.loss)}/mois</strong>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800" role="progressbar" aria-valuenow={s.count} aria-valuemin={0} aria-valuemax={maxCount} aria-label={`${RING_LABELS[i]} : ${s.count} points`}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(s.count / maxCount) * 100}%`, backgroundColor: ["#E53935", "#FF9800", "#FFC107"][i] }}
                    />
                  </div>
                </div>
              )
            })}
            <p className="border-t border-stone-100 pt-2 text-[11px] leading-relaxed text-muted-foreground dark:border-stone-800">
              Les points dans les 500 m captent l&apos;essentiel du trafic de la station ; au-delà de 2 km, la
              cannibalisation est jugée négligeable (seuil configuré : {data.config.cannibRadiusM / 1000} km).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Points dans le rayon ({around.detailed.length})</CardTitle>
            <CardDescription>Triés par distance à la station</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="max-h-80 space-y-1 overflow-y-auto pr-1.5 scroll-coffee">
              {around.detailed.map(({ p, dM, ring }) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-xs hover:border-stone-200 hover:bg-accent/50 dark:hover:border-stone-700"
                  title={`${p.code} — ${typologyLabel(p.typologyCode)} — ${p.notes}`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: ring >= 0 ? ["#E53935", "#FF9800", "#FFC107"][ring] : "#9E9E9E" }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-stone-900 dark:text-stone-50">{p.code}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">{typologyLabel(p.typologyCode)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block tabular-nums font-semibold text-stone-900 dark:text-stone-50">{Math.round(dM)} m</span>
                    <span className="block tabular-nums text-[10px] text-muted-foreground">{formatLJ(p.volumeLJ)} · {formatTnd(p.lossTnd)}</span>
                  </span>
                </li>
              ))}
              {around.detailed.length === 0 && (
                <li className="py-6 text-center text-xs text-muted-foreground">Aucun point dans un rayon de {radii[radii.length - 1] / 1000} km.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
