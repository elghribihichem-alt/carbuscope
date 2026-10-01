'use client'

// CarbuScope — T54-B1 — volet « Zones blanches » du module Opportunity Radar :
// FUSION de l'ex-branche « Implantation » (T54-A0, arbitrage n°1). Les
// composants gelés de src/components/implantation/* sont RÉUTILISÉS par import
// (jamais copiés ni modifiés) : ZonesBlanches en vue principale, et
// Isochrones / ComparateurGouvernorats / Cannibalisation comme outils terrain
// de second niveau, pilotés par nav.radar (zones | isochrones | comparateur |
// cannibalisation) — valeurs lues aussi par la coque radar-module.tsx.
// L'onglet historique ImplantationTab reste inchangé pour l'observatoire
// (défense deep-link), la sidebar n'y mène plus.

import { useEffect, useMemo, useState } from "react"
import type * as React from "react"
import { ArrowLeft, ChevronRight, Clock, GitCompareArrows, Swords, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/shell/loading"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { useI18n } from "@/lib/i18n"
import { num } from "@/lib/chart"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store/app-store"
import type { BrandDTO, GovernoratRow, StationDTO } from "@/lib/types"
import { computeGovStats, inService, type ImplantationData } from "@/components/implantation/implantation-shared"
import { ZonesBlanches } from "@/components/implantation/zones-blanches"
import { Isochrones } from "@/components/implantation/isochrones"
import { ComparateurGouvernorats } from "@/components/implantation/comparateur-gouvernorats"
import { Cannibalisation } from "@/components/implantation/cannibalisation"

/** Outils terrain absorbés (2e niveau du volet « zones »). */
export const RADAR_ZONE_TOOLS = ["isochrones", "comparateur", "cannibalisation"] as const

const TOOL_IDS = new Set<string>(["zones", ...RADAR_ZONE_TOOLS])

/* ------------------------------------------------------------------ */
/* Rangée de 3 mini-cartes KPI « outils terrain » (lanceurs réels :    */
/* chaque carte bascule nav.radar vers l'outil, KPI calculé sur les    */
/* données chargées — aucune donnée simulée).                          */
/* ------------------------------------------------------------------ */

function ToolLauncher({
  icon: Icon,
  title,
  tagline,
  kpiValue,
  kpiLabel,
  active,
  onSelect,
  ariaLabel,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  tagline: string
  kpiValue: string
  kpiLabel: string
  active: boolean
  onSelect: () => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "group flex min-w-0 flex-col gap-3 rounded-xl border p-4 text-start shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-amber-400 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-950/40"
          : "border-[var(--c-line)] bg-card hover:border-amber-300 hover:bg-amber-50/40 dark:border-zinc-800 dark:hover:border-amber-800 dark:hover:bg-amber-950/25",
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
            active
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
              : "bg-amber-50 text-amber-700 group-hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:group-hover:bg-amber-900",
          )}
          aria-hidden
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{title}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{tagline}</span>
        </span>
        <ChevronRight
          className={cn(
            "ml-auto h-4 w-4 shrink-0 transition-transform",
            active ? "rotate-90 text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          )}
          aria-hidden
        />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-bold leading-none tabular-nums">{kpiValue}</span>
        <span className="mt-1 block text-xs leading-snug text-muted-foreground">{kpiLabel}</span>
      </span>
      <span
        className={cn(
          "mt-auto inline-flex items-center gap-1 text-xs font-medium",
          active ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
        )}
      >
        {active ? "Outil ouvert — cliquer pour revenir aux zones" : "Ouvrir l'outil"}
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Volet « zones » — coque de fusion                                   */
/* ------------------------------------------------------------------ */

export function RadarZones({ brandSlug }: { brandSlug: string }) {
  const { t } = useI18n()
  const setNav = useAppStore(s => s.setNav)
  const raw = useAppStore(s => s.nav.radar) ?? "zones"
  const zoneView = TOOL_IDS.has(raw) ? raw : "zones"

  // Chargement unique des 3 endpoints (pattern ImplantationTab : abortable,
  // retry par reloadKey, setState uniquement dans les callbacks asynchrones).
  const [data, setData] = useState<ImplantationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

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

  // KPI réels des 3 outils (calculés sur les données chargées).
  const kpis = useMemo(() => {
    if (!data) return null
    const inServiceCount = data.stations.filter(inService).length
    const brandName = data.brands.find(b => b.slug === brandSlug)?.name ?? brandSlug
    const brandStations = data.stations.filter(s => s.brandSlug === brandSlug && inService(s)).length
    return { inServiceCount, govCount: data.governorats.length, brandStations, brandName }
  }, [data, brandSlug])

  if (data === null && error === null) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement du volet Zones blanches…">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <Skeleton className="h-72 rounded-lg" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (data === null) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="font-semibold text-red-700 dark:text-red-400">
              <TriangleAlert className="mr-1.5 inline h-4 w-4" aria-hidden />
              Impossible de charger les données du volet
            </p>
            <p className="mt-1 text-sm text-red-600/90 dark:text-red-400/80">
              {error} — le périmètre (gouvernorats, stations, enseignes) est indispensable aux zones blanches.
            </p>
          </div>
          <Button variant="outline" className="h-11 gap-1.5" onClick={() => setReloadKey(k => k + 1)}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  const toolMeta = kpis
    ? [
        {
          id: "isochrones" as const,
          icon: Clock,
          title: t("sb.sub.implantation.isochrones"),
          tagline: "Chalandise 5 / 10 / 15 min",
          kpiValue: num(kpis.inServiceCount),
          kpiLabel: "stations en service analysables",
          openDesc: "Temps de trajet autour d'une station en service ou d'un site candidat libre.",
        },
        {
          id: "comparateur" as const,
          icon: GitCompareArrows,
          title: t("sb.sub.implantation.comparateur"),
          tagline: "Marchés côte à côte",
          kpiValue: num(kpis.govCount),
          kpiLabel: "gouvernorats comparables",
          openDesc: "Parcs, motorisation, couverture et opportunités de deux marchés en vis-à-vis.",
        },
        {
          id: "cannibalisation" as const,
          icon: Swords,
          title: t("sb.sub.implantation.cannibalisation"),
          tagline: "Risque de proximité",
          kpiValue: num(kpis.brandStations),
          kpiLabel: `stations ${kpis.brandName} en service`,
          openDesc: `Stations de l'enseigne ${kpis.brandName} trop proches entre elles — risque de captation mutuelle.`,
        },
      ]
    : []

  return (
    <div className="min-w-0 space-y-4">
      {/* Rangée des 3 outils terrain absorbés (ex-G5 Implantation) — KPI réels,
          bascule nav.radar vers le second niveau du volet. */}
      <section aria-label="Outils terrain du volet Zones blanches">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          {toolMeta.map(tool => (
            <ToolLauncher
              key={tool.id}
              icon={tool.icon}
              title={tool.title}
              tagline={tool.tagline}
              kpiValue={tool.kpiValue}
              kpiLabel={tool.kpiLabel}
              active={zoneView === tool.id}
              onSelect={() => setNav("radar", zoneView === tool.id ? "zones" : tool.id)}
              ariaLabel={`${tool.title} : ${tool.kpiValue} ${tool.kpiLabel}. ${
                zoneView === tool.id ? "Outil actuellement ouvert" : "Ouvrir l'outil"
              }`}
            />
          ))}
        </div>
      </section>

      {/* Second niveau : Vue zones (défaut) / Isochrones / Comparateur /
          Cannibalisation — Radix Tabs sans TabsList (navigation par cartes et
          bouton retour), piloté par nav.radar. */}
      <Tabs value={zoneView} onValueChange={v => setNav("radar", v)}>
        <TabsContent value="zones" className="mt-0 space-y-4">
          {govStats ? (
            <ZonesBlanches result={govStats} />
          ) : (
            <Card>
              <CardContent className="p-4 sm:p-6">
                <Skeleton className="h-64 rounded-lg" />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {(["isochrones", "comparateur", "cannibalisation"] as const).map(id => (
          <TabsContent key={id} value={id} className="mt-0 space-y-4">
            {/* Bandeau retour + titre de l'outil ouvert */}
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 shrink-0 gap-1.5"
                  onClick={() => setNav("radar", "zones")}
                  aria-label="Revenir à la vue Zones blanches"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">{t("sb.sub.implantation.zones")}</span>
                  <span className="sm:hidden">Retour</span>
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{toolMeta.find(tool => tool.id === id)?.title}</span>
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                    >
                      Outil terrain
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {toolMeta.find(tool => tool.id === id)?.openDesc}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Composants gelés T53 — réutilisés à l'identique */}
            {id === "isochrones" && <Isochrones data={data} brandSlug={brandSlug} />}
            {id === "comparateur" && (
              <>
                {govStats ? (
                  <ComparateurGouvernorats result={govStats} brandSlug={brandSlug} />
                ) : (
                  <Card>
                    <CardContent className="p-6">
                      <Skeleton className="h-64 rounded-lg" />
                    </CardContent>
                  </Card>
                )}
              </>
            )}
            {id === "cannibalisation" && <Cannibalisation data={data} brandSlug={brandSlug} />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
