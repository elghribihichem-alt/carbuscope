'use client'

// CarbuScope — Onglet « Veille terrain » du portail enseigne (T28) :
// module en 3 sections — « Mes missions » (missions commanditées par mon
// enseigne), « Fiche propriétaire » (conformité de mon réseau vue par mes
// agents de contrôle) et « Fiches concurrents » (intelligence concurrentielle).
// Les données partagées (brands, missions de mon enseigne, agrégat des
// rapports de contrôle) sont chargées ici une seule fois et descendues aux
// sections ; les alertes qualité de la fiche propriétaire deep-linkent vers
// la fiche de pilotage de la mission concernée (section « Mes missions »).

import { useCallback, useEffect, useMemo, useState } from "react"
import { ClipboardList, Eye, Footprints, ShieldCheck, UserRound } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shell/loading"
import { useAppStore } from "@/store/app-store"
import { num } from "@/components/settings/settings-shared"
import type { BrandDTO, MissionDetailDTO, MissionsResponse } from "@/lib/types"
import {
  aggregateOwnStats, makeBrandLookup, OwnControlRow,
} from "./terrain-shared"
import { TerrainMissions } from "./terrain-missions"
import { TerrainOwnSheet } from "./terrain-own"
import { TerrainCompetitorsSheet } from "./terrain-competitors"

export function PortalTerrain({ brandSlug }: { brandSlug: string }) {
  // Sous-navigation interne (T62 : onglets visibles in-page + entrée directe
  // sidebar, pattern T57) — store T46, clé « portal-terrain » :
  // missions | own | competitors
  const setNav = useAppStore(s => s.setNav)
  const section = useAppStore(s => s.nav["portal-terrain"]) ?? "missions"
  const setSection = useCallback((v: string) => setNav("portal-terrain", v), [setNav])

  // Données partagées
  const [brands, setBrands] = useState<BrandDTO[] | null>(null)
  const [missionsData, setMissionsData] = useState<MissionsResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Agrégat « fiche propriétaire » : cibles des missions CONTROLE + derniers rapports.
  // Charge avec clé de périmètre (dérivée) — pendant le (re)chargement ou si le
  // périmètre a changé, rows vaut null (skeleton) sans setState synchrone dans l'effet.
  const [controlsLoad, setControlsLoad] = useState<{
    key: string
    rows: OwnControlRow[] | null
    error: string | null
  } | null>(null)
  const [controlsReloadKey, setControlsReloadKey] = useState(0)

  // Deep-link : alerte qualité → fiche de pilotage de la mission (section A)
  const [pendingMissionId, setPendingMissionId] = useState<string | null>(null)

  // ----- Missions de mon enseigne + enseignes (chargement bloquant / annexe) -----
  useEffect(() => {
    const ac = new AbortController()
    fetch(`/api/missions?brand=${encodeURIComponent(brandSlug)}`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: MissionsResponse) => { setMissionsData(j); setLoadError(null) })
      .catch(e => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setLoadError("Impossible de charger vos missions de veille terrain.")
      })
    fetch("/api/brands", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { brands: BrandDTO[] }) => setBrands(j.brands))
      .catch(() => {})
    return () => ac.abort()
  }, [brandSlug, reloadKey])

  const missions = useMemo(() => missionsData?.missions ?? [], [missionsData])
  const myAgents = useMemo(
    () => (missionsData?.agents ?? []).filter(a => a.brandSlug === brandSlug),
    [missionsData, brandSlug]
  )
  const brandOf = useMemo(() => makeBrandLookup(brands), [brands])
  const myBrand = useMemo(
    () => brands?.find(b => b.slug === brandSlug) ?? null,
    [brands, brandSlug]
  )

  // ----- Détails des missions CONTROLE (non annulées) → lignes « station contrôlée » -----
  const controleKey = useMemo(
    () => missions
      .filter(m => m.type === "CONTROLE" && m.status !== "ANNULEE")
      .map(m => m.id)
      .join(","),
    [missions]
  )

  useEffect(() => {
    if (controleKey === "") return
    const ac = new AbortController()
    Promise.all(
      controleKey.split(",").map(id =>
        fetch(`/api/missions/${id}`, { signal: ac.signal })
          .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .then((j: { mission: MissionDetailDTO }) => j.mission)
      )
    )
      .then(details => {
        const rows: OwnControlRow[] = []
        for (const m of details) {
          for (const t of m.tasks) {
            rows.push({
              taskId: t.id,
              missionId: m.id,
              missionTitle: m.title,
              missionStatus: m.status,
              zone: m.zone,
              targetLabel: t.targetLabel,
              stationName: t.stationName,
              stationCode: t.stationCode,
              taskStatus: t.status,
              report: t.lastReport,
            })
          }
        }
        setControlsLoad({ key: controleKey, rows, error: null })
      })
      .catch(e => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setControlsLoad({
          key: controleKey,
          rows: null,
          error: "Impossible de charger les rapports de contrôle de vos stations.",
        })
      })
    return () => ac.abort()
  }, [controleKey, controlsReloadKey, reloadKey])

  // Dérivation clé/périmètre : null = chargement, [] = aucun contrôle, sinon lignes
  const ownControls = controleKey === ""
    ? []
    : controlsLoad && controlsLoad.key === controleKey
      ? controlsLoad.rows
      : null
  const ownError = controleKey === ""
    ? null
    : controlsLoad && controlsLoad.key === controleKey
      ? controlsLoad.error
      : null

  const ownStats = useMemo(
    () => (ownControls ? aggregateOwnStats(ownControls) : null),
    [ownControls]
  )
  const ownQueueAvg = ownStats?.queueAvg ?? null

  // ----- Callbacks partagés -----
  const onChanged = useCallback(() => setReloadKey(k => k + 1), [])
  const retryControls = useCallback(() => {
    setControlsLoad(null)
    setControlsReloadKey(k => k + 1)
  }, [])
  const onPendingConsumed = useCallback(() => setPendingMissionId(null), [])
  const onOpenMission = useCallback((missionId: string) => {
    setSection("missions")
    setPendingMissionId(missionId)
  }, [setSection])

  // ----- États de chargement / erreur du module -----
  if (loadError && !missionsData) {
    return <ErrorState message={loadError} retry={onChanged} />
  }

  if (!missionsData) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement de la veille terrain…">
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />)}
        </div>
        <Card>
          <CardContent className="space-y-2 p-6">
            <Skeleton className="h-5 w-64" />
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </CardContent>
        </Card>
      </div>
    )
  }

  const activeAgents = myAgents.filter(a => a.active).length
  const targetsTotal = missions.reduce((a, m) => a + m.tasksTotal, 0)

  return (
    <div className="space-y-4">
      {/* Bandeau d'introduction du module veille terrain */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 md:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <Footprints className="h-5.5 w-5.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold leading-tight">Veille terrain</h2>
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                  Agents de zone
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Vos agents de zone réalisent des missions de contrôle de vos stations (fiche
                propriétaire) et de veille concurrentielle (fiches concurrents) — les rapports
                de visite remontent depuis l&apos;application mobile « Espace agent ».
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden />
              <div className="text-sm">
                <p className="font-semibold leading-none">
                  {activeAgents} agent{activeAgents > 1 ? "s" : ""} de zone
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {num(myAgents.length)} au total · actifs de votre enseigne
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden />
              <div className="text-sm">
                <p className="font-semibold leading-none">{num(missions.length)} missions</p>
                <p className="mt-1 text-xs text-muted-foreground">{num(targetsTotal)} cibles suivies</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* T62 — Onglets visibles de la veille terrain (pattern T57 Radar/
          Hubs) : les 3 volets (Mes missions / Fiche propriétaire / Fiches
          concurrents) sont pilotés par nav["portal-terrain"] — la sidebar
          (entrée directe) et les onglets in-page partagent la même valeur,
          les deep-links internes (onOpenMission) restent inchangés. */}
      <Tabs value={section} onValueChange={setSection} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1">
          <TabsTrigger
            value="missions"
            className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:text-[13px]"
          >
            <ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">Mes missions</span>
          </TabsTrigger>
          <TabsTrigger
            value="own"
            className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:text-[13px]"
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">Fiche propriétaire</span>
          </TabsTrigger>
          <TabsTrigger
            value="competitors"
            className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:text-[13px]"
          >
            <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">Fiches concurrents</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="missions" className="mt-0 space-y-4">
          <TerrainMissions
            brandSlug={brandSlug}
            missions={missions}
            agents={myAgents}
            brands={brands}
            brandOf={brandOf}
            pendingMissionId={pendingMissionId}
            onPendingConsumed={onPendingConsumed}
            onChanged={onChanged}
          />
        </TabsContent>
        <TabsContent value="own" className="mt-0 space-y-4">
          <TerrainOwnSheet
            brandSlug={brandSlug}
            brand={myBrand}
            rows={ownControls}
            error={ownError}
            retry={retryControls}
            onOpenMission={onOpenMission}
          />
        </TabsContent>
        <TabsContent value="competitors" className="mt-0 space-y-4">
          <TerrainCompetitorsSheet
            brandSlug={brandSlug}
            brands={brands}
            brandOf={brandOf}
            ownQueueAvg={ownQueueAvg}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
