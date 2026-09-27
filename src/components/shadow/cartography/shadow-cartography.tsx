"use client"

// Shadow Market (T44-c) — section « Cartographie » : 5 onglets.
//   🌍 Carte Nationale · 🎯 Par District · 📍 Par Station ·
//   🛣️ Par Axe Routier · ⚠️ Zones Rouges
// Chargement unique de /api/shadow/map (pattern AbortController + setState
// après await), segments routiers chargés paresseusement par l'onglet axe.

import { useCallback, useEffect, useState } from "react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { useAppStore } from "@/store/app-store"
import { SectionHeader } from "@/components/shadow/shadow-shared"
import type { ShadowMapResponse } from "@/lib/types"
import { NationalTab } from "./national-tab"
import { DistrictTab } from "./district-tab"
import { StationTab } from "./station-tab"
import { RoadTab } from "./road-tab"
import { RedzonesTab } from "./redzones-tab"

export function ShadowCartography() {
  // Onglet actif piloté par la sidebar (store T46, clé « shadow-cartography »).
  const setNav = useAppStore(s => s.setNav)
  const tab = useAppStore(s => s.nav["shadow-cartography"]) ?? "national"
  const [data, setData] = useState<ShadowMapResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const r = await fetch("/api/shadow/map", { signal })
      if (!r.ok) throw new Error(`API /api/shadow/map [${r.status}]`)
      const d = (await r.json()) as ShadowMapResponse
      setData(d)
      setError(null)
    } catch (e) {
      if (signal.aborted) return
      setError(e instanceof Error ? e.message : "Erreur inconnue")
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    const t = setTimeout(() => { void load(ac.signal) }, 0)
    return () => { clearTimeout(t); ac.abort() }
  }, [load])

  const retry = useCallback(() => {
    void load(new AbortController().signal)
  }, [load])

  if (error && !data) return <ErrorState message={error} retry={retry} />
  if (!data) return <TabSkeleton title="Chargement de la cartographie du marché parallèle…" />

  return (
    <div className="space-y-4">
      <SectionHeader
        emoji="🗺️"
        title="Cartographie du marché parallèle"
        description={`${data.points.length} points informels géolocalisés, ${data.stations.length} stations menacées, ${data.redZones.length} zones rouges — analyse nationale, par district, par station et par axe routier.`}
      />
      {/* Contenu de l'onglet actif — la navigation (5 onglets) est portée par la sidebar */}
      <Tabs value={tab} onValueChange={v => setNav("shadow-cartography", v)}>
        <TabsContent value="national" className="mt-4">
          <NationalTab data={data} />
        </TabsContent>
        <TabsContent value="district" className="mt-4">
          <DistrictTab data={data} />
        </TabsContent>
        <TabsContent value="station" className="mt-4">
          <StationTab data={data} />
        </TabsContent>
        <TabsContent value="road" className="mt-4">
          <RoadTab data={data} />
        </TabsContent>
        <TabsContent value="redzones" className="mt-4">
          <RedzonesTab data={data} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
