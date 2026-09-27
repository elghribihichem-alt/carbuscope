'use client'

// Module D — Back-office plateforme : le cœur opérationnel de la qualité de la donnée (agent 5-e)

import { useCallback, useEffect, useState } from "react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ServerCog, ShieldAlert, MapPin, Inbox } from "lucide-react"
import { useAppStore } from "@/store/app-store"
import type { ContributionDTO, MissionDTO } from "@/lib/types"
import { BoModeration } from "./bo-moderation"
import { BoSovereign } from "./bo-sovereign"
import { BoFreshness } from "./bo-freshness"
import { BoAgents } from "./bo-agents"
import { BoStats } from "./bo-stats"
import { BoAlerts } from "./bo-alerts"
import { BoDecrees } from "./bo-decrees"
import { BoMissions } from "./bo-missions"

export function BackofficeView() {
  // T46 — sous-navigation pilotée par la sidebar (store) : nav.backoffice ?? "moderation"
  const setNav = useAppStore(s => s.setNav)
  const tab = useAppStore(s => s.nav.backoffice) ?? "moderation"

  // File de modération partagée : compteur du bandeau + onglet Modération
  // (la sidebar affiche également ce compteur)
  const [pending, setPending] = useState<ContributionDTO[] | null>(null)
  const [pendingError, setPendingError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const loadPending = useCallback(async () => {
    try {
      const r = await fetch("/api/contributions?status=PENDING&limit=50")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as { contributions?: ContributionDTO[] }
      setPending(j.contributions ?? [])
      setPendingError(null)
    } catch {
      setPendingError("Impossible de charger la file de modération.")
    }
  }, [])

  useEffect(() => {
    void loadPending()
  }, [loadPending, reloadKey])

  // Compteur de missions ouvertes — T46 : le badge est porté par la sidebar,
  // la logique de comptage est conservée (le bandeau pourrait la réutiliser).
  const [openMissions, setOpenMissions] = useState<number | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/missions", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { missions?: MissionDTO[] }) => {
        const n = (j.missions ?? []).filter(m => m.status === "PLANIFIEE" || m.status === "EN_COURS").length
        setOpenMissions(n)
      })
      .catch(() => {})
    return () => ac.abort()
  }, [])

  const pendingCount = pending?.length ?? null
  const moderationLoading = pending === null && !pendingError
  const setTab = (v: string) => setNav("backoffice", v)

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Bandeau d'accueil du back-office */}
      <Card className="group overflow-hidden border-slate-300 bg-gradient-to-br from-slate-50 via-white to-emerald-50/50 dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/25">
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-100 shadow-sm transition-transform group-hover:scale-105 dark:bg-slate-200 dark:text-slate-900">
              <ServerCog className="h-5.5 w-5.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight">Back-office plateforme</h1>
              <p className="mt-1 max-w-2xl text-sm italic leading-relaxed text-muted-foreground">
                « Le cœur opérationnel : c&apos;est ici que se joue la qualité de la donnée. »
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={
                (pendingCount ?? 0) > 0
                  ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
                  : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
              }
            >
              <Inbox className="mr-1 h-3 w-3" aria-hidden />
              {pendingCount !== null ? `${pendingCount} signalement(s) en attente` : "File de modération…"}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <MapPin className="h-3 w-3" aria-hidden /> 24 gouvernorats
            </Badge>
            <Badge variant="outline" className="gap-1">
              <ShieldAlert className="h-3 w-3" aria-hidden /> 2 985 fiches stations
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Sections (8) — T46 : la sous-navigation (et ses compteurs de modération
          et de missions) est portée par la sidebar verticale, plus de barre
          d'onglets horizontale ici. */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsContent value="moderation" className="mt-0 space-y-4">
          <BoModeration
            pending={pending}
            loading={moderationLoading}
            error={pendingError}
            onRefresh={loadPending}
          />
        </TabsContent>
        <TabsContent value="sovereign" className="mt-0 space-y-4">
          <BoSovereign />
        </TabsContent>
        <TabsContent value="freshness" className="mt-0 space-y-4">
          <BoFreshness />
        </TabsContent>
        <TabsContent value="agents" className="mt-0 space-y-4">
          <BoAgents />
        </TabsContent>
        <TabsContent value="alerts" className="mt-0 space-y-4">
          <BoAlerts />
        </TabsContent>
        <TabsContent value="stats" className="mt-0 space-y-4">
          <BoStats />
        </TabsContent>
        <TabsContent value="decrees" className="mt-0 space-y-4">
          <BoDecrees />
        </TabsContent>
        <TabsContent value="missions" className="mt-0 space-y-4">
          <BoMissions />
        </TabsContent>
      </Tabs>
    </div>
  )
}
