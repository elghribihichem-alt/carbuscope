'use client'

// CarbuScope — Module A.x (T29, enrichi Task ID: 9) — onglet « Implantation » :
// le cockpit des décisions d'implantation pour Direction Expansion / Commerciale / Admin.
// 4 outils : zones blanches, isochrones 5/10/15 min, comparateur de gouvernorats,
// score de cannibalisation. Chargement unique des 3 endpoints, partagé via props.

import { useEffect, useMemo, useState } from "react"
import { Clock, GitCompareArrows, MapPinPlus, Swords, Target } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton, TabSkeleton, ErrorState } from "@/components/shell/loading"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAppStore } from "@/store/app-store"
import type { BrandDTO, GovernoratRow, StationDTO } from "@/lib/types"
import { num } from "@/lib/chart"
import { computeGovStats, type ImplantationData } from "./implantation-shared"
import { ZonesBlanches } from "./zones-blanches"
import { Isochrones } from "./isochrones"
import { ComparateurGouvernorats } from "./comparateur-gouvernorats"
import { Cannibalisation } from "./cannibalisation"

const SECTION_TABS = [
  { value: "zones", label: "Zones blanches", icon: MapPinPlus },
  { value: "isochrones", label: "Isochrones", icon: Clock },
  { value: "comparateur", label: "Comparateur", icon: GitCompareArrows },
  { value: "cannibalisation", label: "Cannibalisation", icon: Swords },
] as const

export function ImplantationTab() {
  const brandSlug = useAppStore((s) => s.brandSlug)

  const [data, setData] = useState<ImplantationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Chargement unique des 3 endpoints (abortable, retry par reloadKey).
  // setState uniquement dans les callbacks asynchrones — jamais synchrone dans l'effet.
  useEffect(() => {
    const ctrl = new AbortController()
    const get = async <T,>(path: string): Promise<T> => {
      const res = await fetch(path, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`${path} → ${res.status}`)
      return res.json() as Promise<T>
    }
    Promise.all([
      get<{ governorats: GovernoratRow[] }>("/api/governorats"),
      get<{ stations: StationDTO[]; total: number }>("/api/stations?limit=2200"),
      get<{ brands: BrandDTO[] }>("/api/brands"),
    ])
      .then(([g, s, b]) => {
        setData({ governorats: g.governorats, stations: s.stations, brands: b.brands })
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [reloadKey])

  const govStats = useMemo(() => (data ? computeGovStats(data) : null), [data])

  if (data === null && error === null) {
    return <TabSkeleton title="Chargement du module Implantation…" />
  }
  if (data === null) {
    return (
      <ErrorState
        message={`Impossible de charger le périmètre d'implantation (${error}).`}
        retry={() => setReloadKey((k) => k + 1)}
      />
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* En-tête de l'onglet */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Target className="h-4.5 w-4.5" />
            </span>
            Implantation — détecter, comparer, arbitrer
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Le cockpit des décisions d&apos;implantation : zones blanches, isochrones de chalandise,
            comparaison de marchés et risque de cannibalisation, calculés sur les données réelles du
            réseau tunisien.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1 tabular-nums">
          {num(data.governorats.length)} gouvernorats · {num(data.stations.length)} stations ·{" "}
          {num(data.brands.length)} enseignes
        </Badge>
      </header>

      {/* Sous-navigation des 4 outils */}
      <Tabs defaultValue="zones">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4 sm:w-auto">
          {SECTION_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-1.5 text-xs sm:text-sm">
              <t.icon className="h-3.5 w-3.5" aria-hidden />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="zones" className="mt-4">
          {govStats ? (
            <ZonesBlanches result={govStats} />
          ) : (
            <Card><CardContent className="p-6"><Skeleton className="h-64 rounded-lg" /></CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="isochrones" className="mt-4">
          <Isochrones data={data} brandSlug={brandSlug} />
        </TabsContent>

        <TabsContent value="comparateur" className="mt-4">
          {govStats ? (
            <ComparateurGouvernorats result={govStats} brandSlug={brandSlug} />
          ) : (
            <Card><CardContent className="p-6"><Skeleton className="h-64 rounded-lg" /></CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="cannibalisation" className="mt-4">
          <Cannibalisation data={data} brandSlug={brandSlug} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
