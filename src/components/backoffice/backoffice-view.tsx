'use client'

// Module D — Back-office plateforme : le cœur opérationnel de la qualité de la donnée (agent 5-e)

import { useCallback, useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ServerCog, ShieldAlert, Database, TimerReset, UserCog, BarChart3, MapPin, Inbox, Radar, Banknote,
} from "lucide-react"
import type { ContributionDTO } from "@/lib/types"
import { BoModeration } from "./bo-moderation"
import { BoSovereign } from "./bo-sovereign"
import { BoFreshness } from "./bo-freshness"
import { BoAgents } from "./bo-agents"
import { BoStats } from "./bo-stats"
import { BoAlerts } from "./bo-alerts"
import { BoDecrees } from "./bo-decrees"

export function BackofficeView() {
  // File de modération partagée : badge d'onglet + onglet Modération
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

  const pendingCount = pending?.length ?? null
  const moderationLoading = pending === null && !pendingError

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
              <ShieldAlert className="h-3 w-3" aria-hidden /> 1 814 fiches stations
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Navigation interne (7 onglets) */}
      <Tabs defaultValue="moderation" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-7">
          <TabsTrigger value="moderation" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <ShieldAlert className="h-4 w-4" aria-hidden /> Modération
            <Badge
              className="ml-0.5 h-4 min-w-4 rounded-full px-1 text-[10px] tabular-nums"
              variant={(pendingCount ?? 0) > 0 ? "destructive" : "secondary"}
            >
              {pendingCount ?? "…"}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="sovereign" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <Database className="h-4 w-4" aria-hidden /> Données souveraines
          </TabsTrigger>
          <TabsTrigger value="freshness" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <TimerReset className="h-4 w-4" aria-hidden /> Fraîcheur
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <UserCog className="h-4 w-4" aria-hidden /> Agents terrain
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <Radar className="h-4 w-4" aria-hidden /> Veille & alertes
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <BarChart3 className="h-4 w-4" aria-hidden /> Stats plateforme
          </TabsTrigger>
          <TabsTrigger value="decrees" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <Banknote className="h-4 w-4" aria-hidden /> Prix &amp; décrets
          </TabsTrigger>
        </TabsList>

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
      </Tabs>
    </div>
  )
}
