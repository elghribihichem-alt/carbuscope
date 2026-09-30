"use client"

// Shadow Market (T44-c) — onglet « 🌍 Carte Nationale » : vue globale Tunisie,
// heatmap de la fraude par gouvernorat + tous les points actifs, panneau
// latéral de classement des gouvernorats (clic → focus carte).

import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { ShadowMapResponse } from "@/lib/types"
import { GOV_CENTERS } from "@/components/map/tunisia-geo"
import { ShadowLevelBadge, formatTnd, formatLJ, LEVEL_COLORS } from "@/components/shadow/shadow-shared"
import { ShadowMap, type ShadowFocusTarget } from "./shadow-map"
import { MapPin, RotateCcw } from "lucide-react"

export function NationalTab({ data }: { data: ShadowMapResponse }) {
  const [focus, setFocus] = useState<ShadowFocusTarget | null>(null)
  const [selGov, setSelGov] = useState<string | null>(null)

  const ranked = useMemo(
    () => [...data.govHeat].sort((a, b) => b.lossTnd - a.lossTnd || b.points - a.points),
    [data.govHeat]
  )

  const focusGov = (gov: string) => {
    const c = GOV_CENTERS[gov]
    setSelGov(gov)
    if (c) setFocus({ lat: c[1], lng: c[0], km: 48 })
  }
  const resetFocus = () => {
    setFocus(null)
    setSelGov(null)
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* ---------- Carte nationale ---------- */}
      <Card className="xl:col-span-2">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>Heatmap nationale du marché parallèle</CardTitle>
              <CardDescription>
                {data.points.length} points actifs · disques proportionnels à la perte mensuelle par gouvernorat ·
                cliquez un point pour sa fiche terrain
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {selGov && (
                <Button size="sm" variant="outline" className="h-11 shrink-0 gap-1.5 text-xs" onClick={resetFocus}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Vue nationale
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ShadowMap
            points={data.points}
            govHeat={data.govHeat}
            showGovHeat
            typologies={data.typologies}
            focusOn={focus}
            csvContext="nationale"
            height="h-[620px]"
          />
        </CardContent>
      </Card>

      {/* ---------- Classement des gouvernorats ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Perte par gouvernorat</CardTitle>
          <CardDescription>
            {ranked.length} gouvernorats · clic = zoom sur la carte
            {selGov && <span className="font-semibold text-foreground"> · {selGov}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="max-h-[560px] space-y-1.5 overflow-y-auto pr-1.5 scroll-coffee">
            {ranked.map((g, i) => {
              const active = selGov === g.gouvernorat
              return (
                <li key={g.gouvernorat}>
                  <button
                    type="button"
                    onClick={() => focusGov(g.gouvernorat)}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      active
                        ? "border-[#E53935]/50 bg-[#E53935]/5"
                        : "border-transparent hover:border-stone-200 hover:bg-accent/60 dark:hover:border-stone-700"
                    }`}
                  >
                    <span className="w-5 shrink-0 text-right text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: LEVEL_COLORS[g.level] }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-sm font-semibold text-stone-900 dark:text-stone-50">
                        <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{g.gouvernorat}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {g.points} pts · {formatLJ(g.volumeLJ)} · {g.stationsThreatened} station{g.stationsThreatened > 1 ? "s" : ""} menacée{g.stationsThreatened > 1 ? "s" : ""}
                      </span>
                    </span>
                    <ShadowLevelBadge level={g.level} loss={g.lossTnd} />
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 border-t border-stone-100 pt-2 text-[11px] leading-relaxed text-muted-foreground dark:border-stone-800">
            Total national : <strong className="text-foreground">{formatTnd(ranked.reduce((s, g) => s + g.lossTnd, 0))}</strong> de perte mensuelle estimée.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
