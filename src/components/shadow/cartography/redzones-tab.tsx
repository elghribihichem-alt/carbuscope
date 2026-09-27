"use client"

// Shadow Market (T44-c) — onglet « ⚠️ Zones Rouges » : vue filtrée sur les
// zones à densité élevée — bandeau d'alerte, cartes des zones, carte n'affichant
// QUE les points des zones rouges (cercles rouges), tableau triable points/perte.

import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { ShadowMapResponse, ShadowPointDTO } from "@/lib/types"
import { haversineKm } from "@/lib/geo"
import { formatTnd, SHADOW_COLORS } from "@/components/shadow/shadow-shared"
import { ShadowMap, type ShadowFocusTarget } from "./shadow-map"
import { TriangleAlert, Flame, ArrowUpDown, RotateCcw } from "lucide-react"

type SortKey = "points" | "lossTnd"

export function RedzonesTab({ data }: { data: ShadowMapResponse }) {
  const [sortKey, setSortKey] = useState<SortKey>("lossTnd")
  const [selected, setSelected] = useState<string | null>(null)
  const [focus, setFocus] = useState<ShadowFocusTarget | null>(null)

  const zones = useMemo(
    () => [...data.redZones].sort((a, b) => b[sortKey] - a[sortKey]),
    [data.redZones, sortKey]
  )

  // Points appartenant à une zone rouge (distance au centroïde < rayon)
  const zonePoints = useMemo(() => {
    const set = new Set<string>()
    for (const z of data.redZones) {
      for (const p of data.points) {
        if (haversineKm(z.lat, z.lng, p.lat, p.lng) * 1000 <= z.radiusM) set.add(p.id)
      }
    }
    return data.points.filter((p: ShadowPointDTO) => set.has(p.id))
  }, [data.redZones, data.points])

  const selectedZone = selected ? data.redZones.find(z => `${z.label}-${z.gouvernorat}` === selected) ?? null : null

  // Les points affichés : tous les points des zones, ou seulement la zone sélectionnée
  const shownPoints = useMemo(() => {
    if (!selectedZone) return zonePoints
    return zonePoints.filter(p => haversineKm(selectedZone.lat, selectedZone.lng, p.lat, p.lng) * 1000 <= selectedZone.radiusM)
  }, [selectedZone, zonePoints])

  const shownZones = useMemo(
    () => (selectedZone ? data.redZones.filter(z => z === selectedZone) : data.redZones),
    [selectedZone, data.redZones]
  )

  const totalLoss = data.redZones.reduce((s, z) => s + z.lossTnd, 0)
  const totalPoints = data.redZones.reduce((s, z) => s + z.points, 0)

  const toggleSort = (key: SortKey) => setSortKey(key)

  const selectZone = (z: typeof data.redZones[number], zoneKey: string) => {
    if (selected === zoneKey) {
      setSelected(null)
      setFocus(null)
    } else {
      setSelected(zoneKey)
      setFocus({ lat: z.lat, lng: z.lng, km: Math.max((z.radiusM / 1000) * 2.4, 2.2) })
    }
  }

  return (
    <div className="space-y-4">
      {/* ---------- Bandeau d'alerte ---------- */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E53935]/35 bg-[#E53935]/8 px-4 py-3" role="alert">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E53935]/15 text-[#E53935]">
          <TriangleAlert className="h-4.5 w-4.5" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-stone-800 dark:text-stone-200">
          <strong className="font-bold">{data.redZones.length} zones rouges actives</strong> — priorité contrôle
          douanes : <strong className="tabular-nums">{totalPoints} points</strong> concentrés et{" "}
          <strong className="tabular-nums">{formatTnd(totalLoss)}</strong> de perte mensuelle regroupés sur ces
          clusters (seuil de densité : {data.config.redZoneThreshold} points en grappe).
        </p>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#E53935]">
          <Flame className="h-3.5 w-3.5" aria-hidden />
          Action recommandée : contrôle sous 48 h
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ---------- Carte des zones rouges ---------- */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle>Carte des zones rouges</CardTitle>
                <CardDescription>
                  {selectedZone
                    ? `${selectedZone.label} (${selectedZone.gouvernorat}) — ${shownPoints.length} points dans un rayon de ${Math.round(selectedZone.radiusM)} m`
                    : `${shownPoints.length} points situés dans une zone rouge · cliquez une zone (carte ou liste) pour isoler son cluster`}
                </CardDescription>
              </div>
              {selectedZone && (
                <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 text-xs"
                  onClick={() => { setSelected(null); setFocus(null) }}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Toutes les zones
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ShadowMap
              points={shownPoints}
              redZones={shownZones}
              typologies={data.typologies}
              focusOn={focus}
              csvContext={selectedZone ? `zone-rouge-${selectedZone.label.toLowerCase().replace(/\s+/g, "-")}` : "zones-rouges"}
              height="h-[560px]"
            />
          </CardContent>
        </Card>

        {/* ---------- Cartes des zones ---------- */}
        <Card>
          <CardHeader>
            <CardTitle>Zones à densité élevée</CardTitle>
            <CardDescription>Classement par {sortKey === "lossTnd" ? "perte mensuelle" : "nombre de points"} · clic = focus</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1.5 scroll-coffee">
              {zones.map(z => {
                const key = `${z.label}-${z.gouvernorat}`
                const active = selected === key
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => selectZone(z, key)}
                      aria-pressed={active}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                        active
                          ? "border-[#E53935]/60 bg-[#E53935]/8"
                          : "border-stone-200 hover:border-[#E53935]/40 hover:bg-accent/50 dark:border-stone-700"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold text-stone-900 dark:text-stone-50">{z.label}</span>
                        <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: SHADOW_COLORS.red }}>
                          {formatTnd(z.lossTnd)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>{z.gouvernorat}</span>
                        <span aria-hidden>·</span>
                        <span className="tabular-nums">{z.points} points</span>
                        <span aria-hidden>·</span>
                        <span className="tabular-nums">rayon {Math.round(z.radiusM)} m</span>
                        {active && <Badge variant="outline" className="ml-auto h-5 border-[#E53935]/40 px-1.5 text-[10px] text-[#E53935]">isolée</Badge>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* ---------- Tableau triable ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>Détail des zones rouges</CardTitle>
              <CardDescription>{zones.length} zones · tri cliquable sur les colonnes points / perte</CardDescription>
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={sortKey === "points" ? "default" : "outline"}
                className="h-8 gap-1.5 text-xs"
                onClick={() => toggleSort("points")}
                aria-pressed={sortKey === "points"}
              >
                <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />
                Trier par points
              </Button>
              <Button
                size="sm"
                variant={sortKey === "lossTnd" ? "default" : "outline"}
                className="h-8 gap-1.5 text-xs"
                onClick={() => toggleSort("lossTnd")}
                aria-pressed={sortKey === "lossTnd"}
              >
                <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />
                Trier par perte
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Gouvernorat</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right">Rayon</TableHead>
                  <TableHead className="text-right">Perte / mois</TableHead>
                  <TableHead className="text-right">Perte / point</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map((z, i) => (
                  <TableRow
                    key={`${z.label}-${z.gouvernorat}`}
                    className="cursor-pointer"
                    onClick={() => selectZone(z, `${z.label}-${z.gouvernorat}`)}
                  >
                    <TableCell className="text-center text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{z.label}</TableCell>
                    <TableCell className="text-muted-foreground">{z.gouvernorat}</TableCell>
                    <TableCell className="text-right tabular-nums">{z.points}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Math.round(z.radiusM)} m</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums" style={{ color: SHADOW_COLORS.red }}>{formatTnd(z.lossTnd)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatTnd(z.lossTnd / Math.max(z.points, 1))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
