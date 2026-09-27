'use client'

// Shadow Market — Analyse d'Impact (T44-d), section 4 du module.
// 5 onglets : Perte par Station · Perte par Région · Cannibalisation ·
// Tendance · Simulation. La station sélectionnée (et sa fiche d'impact)
// est portée par ce conteneur : les onglets « Perte par Station » et
// « Cannibalisation » partagent le même sélecteur et les mêmes données.

import { useEffect, useState } from "react"
import type { ShadowMapResponse, ShadowMapStationDTO, ShadowStationImpactResponse, ShadowTypologyDTO } from "@/lib/types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabStationLoss } from "./tab-station-loss"
import { TabRegionLoss } from "./tab-region-loss"
import { TabCannibalisation } from "./tab-cannibalisation"
import { TabTrend } from "./tab-trend"
import { TabSimulation } from "./tab-simulation"

export function ShadowImpact() {
  const [tab, setTab] = useState("station")

  // ---- Référentiel stations menacées (une seule requête /api/shadow/map) ----
  const [stations, setStations] = useState<ShadowMapStationDTO[] | null>(null)
  const [typologies, setTypologies] = useState<ShadowTypologyDTO[]>([])
  const [selectedCode, setSelectedCode] = useState<string | null>(null)

  // ---- Fiche d'impact de la station sélectionnée (partagée) ----
  const [impact, setImpact] = useState<ShadowStationImpactResponse | null>(null)
  const [errByCode, setErrByCode] = useState<{ code: string; message: string } | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/shadow/map", { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json() as Promise<ShadowMapResponse>
      })
      .then((json) => {
        const sorted = [...(json.stations ?? [])].sort((a, b) => b.lossTnd - a.lossTnd)
        setStations(sorted)
        setTypologies(json.typologies ?? [])
        // Sélection par défaut : la station la plus menacée du pays.
        setSelectedCode((prev) => prev ?? sorted[0]?.code ?? null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setStations([])
      })
    return () => ctrl.abort()
  }, [])

  useEffect(() => {
    if (selectedCode === null) return
    const ctrl = new AbortController()
    fetch(`/api/shadow/impact/station?code=${encodeURIComponent(selectedCode)}`, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json() as Promise<ShadowStationImpactResponse>
      })
      .then((json) => {
        setImpact(json)
        setErrByCode(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setErrByCode({ code: selectedCode, message: e instanceof Error ? e.message : "Erreur inconnue" })
      })
    return () => ctrl.abort()
  }, [selectedCode])

  // Fiche affichable : uniquement si elle correspond à la station sélectionnée
  // (pendant le rechargement, la fiche précédente est écartée → squelette).
  const shownImpact = impact !== null && impact.station.code === selectedCode ? impact : null
  const shownError = errByCode !== null && errByCode.code === selectedCode ? errByCode.message : null

  const stationList = stations ?? []
  const selectStation = (code: string) => setSelectedCode(code)

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-stone-100 p-1 dark:bg-stone-900">
        <TabsTrigger value="station" className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:text-stone-900 dark:data-[state=active]:bg-stone-800 dark:data-[state=active]:text-stone-50 sm:text-[13px]">
          <span aria-hidden>💸</span> Perte par Station
        </TabsTrigger>
        <TabsTrigger value="region" className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:text-stone-900 dark:data-[state=active]:bg-stone-800 dark:data-[state=active]:text-stone-50 sm:text-[13px]">
          <span aria-hidden>📉</span> Perte par Région
        </TabsTrigger>
        <TabsTrigger value="cannibalisation" className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:text-stone-900 dark:data-[state=active]:bg-stone-800 dark:data-[state=active]:text-stone-50 sm:text-[13px]">
          <span aria-hidden>⚖️</span> Cannibalisation
        </TabsTrigger>
        <TabsTrigger value="tendance" className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:text-stone-900 dark:data-[state=active]:bg-stone-800 dark:data-[state=active]:text-stone-50 sm:text-[13px]">
          <span aria-hidden>📈</span> Tendance
        </TabsTrigger>
        <TabsTrigger value="simulation" className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:text-stone-900 dark:data-[state=active]:bg-stone-800 dark:data-[state=active]:text-stone-50 sm:text-[13px]">
          <span aria-hidden>🎯</span> Simulation
        </TabsTrigger>
      </TabsList>

      <TabsContent value="station" className="mt-0">
        <TabStationLoss
          stations={stationList}
          typologies={typologies}
          selectedCode={selectedCode}
          onSelect={selectStation}
          impact={shownImpact}
          impactError={shownError}
        />
      </TabsContent>
      <TabsContent value="region" className="mt-0">
        <TabRegionLoss />
      </TabsContent>
      <TabsContent value="cannibalisation" className="mt-0">
        <TabCannibalisation
          stations={stationList}
          typologies={typologies}
          selectedCode={selectedCode}
          onSelect={selectStation}
          impact={shownImpact}
          impactError={shownError}
        />
      </TabsContent>
      <TabsContent value="tendance" className="mt-0">
        <TabTrend />
      </TabsContent>
      <TabsContent value="simulation" className="mt-0">
        <TabSimulation stations={stationList} stationImpactTraffic={shownImpact?.station.traffic ?? null} />
      </TabsContent>
    </Tabs>
  )
}
