'use client'

// CarbuScope — T54-A2/B1 → B2/B3 → B3b (TERMINÉ) — Module 1 « Opportunity
// Radar » : coque du module (spec verrouillée T54-A0). 6 volets pilotés par
// nav.radar (?? "zones") via le store — même contrat que la sidebar (groupe
// « Opportunity Radar », accent ambre). Le volet « zones » fusionne l'ex-
// branche Implantation (radar-zones) ; le volet « scoring » est le moteur
// 5 critères + Top 50 délégations + alertes (T54-B2) ; les volets « formats »
// et « simulations » (T54-B3a) recommandent les formats d'implantation et
// chiffrent la rentabilité (handoff léger nav.radarSim = JSON
// { gouvernorat, format } entre les deux volets) ; les volets « faisabilité »
// et « franchise » (T54-B3b) closent le module : étude 4 axes + SVG +
// checklist terrain + export PDF, et pipeline candidatures / kit / contrats.
// MODULE 1 COMPLET : 6/6 volets réels. En tête de module : bandeau discret
// des alertes de zone non acquittées (détection idempotente /api/radar/alerts,
// acquittement session, toast au 1er chargement).

import { useEffect, useRef, useState } from "react"
import type * as React from "react"
import { Calculator, FileSearch, Gauge, Handshake, LayoutGrid, MapPinPlus, Radar } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useI18n, type DictKey } from "@/lib/i18n"
import { useAppStore } from "@/store/app-store"
import { RadarZones, RADAR_ZONE_TOOLS } from "./radar-zones"
import { RadarScoring } from "./radar-scoring"
import { RadarFormats } from "./radar-formats"
import { RadarSimulations } from "./radar-simulations"
import { RadarFaisabilite } from "./radar-faisabilite"
import { RadarFranchise } from "./radar-franchise"
import { RadarAlertsBanner, type ZoneAlertRow } from "./radar-alerts-banner"

/** Les 6 volets du Radar (spec T54-A0 — n'ont pas vocation à changer). */
const RADAR_SUBTABS: ReadonlyArray<{ id: string; icon: React.ComponentType<{ className?: string }>; labelKey: DictKey }> = [
  { id: "zones", icon: MapPinPlus, labelKey: "sb.radar.zones" },
  { id: "scoring", icon: Gauge, labelKey: "sb.radar.scoring" },
  { id: "formats", icon: LayoutGrid, labelKey: "sb.radar.formats" },
  { id: "faisabilite", icon: FileSearch, labelKey: "sb.radar.faisabilite" },
  { id: "simulations", icon: Calculator, labelKey: "sb.radar.simulations" },
  { id: "franchise", icon: Handshake, labelKey: "sb.radar.franchise" },
]

const SUB_IDS = new Set<string>([...RADAR_SUBTABS.map(s => s.id), ...RADAR_ZONE_TOOLS])

export function RadarModule({ brandSlug }: { brandSlug: string }) {
  const { t } = useI18n()
  const setNav = useAppStore(s => s.setNav)
  const raw = useAppStore(s => s.nav.radar) ?? "zones"
  // Handoff formats → simulations : JSON léger { gouvernorat, format } posé
  // dans nav.radarSim par le bouton « Simuler ce format » (volet formats) et
  // consommé à la MONTURE du volet simulations (Radix Tabs remonte le volet à
  // chaque activation — l'état initial du calculateur est donc pré-rempli).
  const simHandoff = useAppStore(s => s.nav.radarSim) ?? ""

  // ---- Alertes de zone (T54-B2) : passe de détection idempotente au montage
  // du module, bandeau discret + Sheet d'acquittement + toast au 1er
  // chargement si des alertes sont actives. setState uniquement dans les
  // callbacks asynchrones (pattern radar-zones). ----
  const [alerts, setAlerts] = useState<ZoneAlertRow[] | null>(null)
  const [alertsLoading, setAlertsLoading] = useState(true)
  const firstLoad = useRef(true)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/radar/alerts", { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`/api/radar/alerts → ${r.status}`)
        return (await r.json()) as { alerts: ZoneAlertRow[]; newCount: number }
      })
      .then(d => {
        setAlerts(d.alerts)
        setAlertsLoading(false)
        if (firstLoad.current) {
          firstLoad.current = false
          const unack = d.alerts.filter(a => !a.acknowledged).length
          const actives = d.newCount > 0 ? d.newCount : unack
          if (actives > 0) {
            toast(`Radar : ${actives} alerte${actives > 1 ? "s" : ""} de zone active${actives > 1 ? "s" : ""}`, {
              description: "Opportunités fortes, zones blanches à fort potentiel ou signaux fonciers à examiner.",
            })
          }
        }
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setAlertsLoading(false)
      })
    return () => ctrl.abort()
  }, [])

  /** Acquitte / désacquitte une alerte (PATCH session) — retourne le succès. */
  const acknowledge = async (id: string, acknowledged: boolean): Promise<boolean> => {
    try {
      const r = await fetch("/api/radar/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acknowledged }),
      })
      const body = (await r.json().catch(() => ({}))) as { alert?: ZoneAlertRow; error?: string }
      if (!r.ok || !body.alert) {
        toast.error(body.error ?? "Acquittement impossible — réessayez.")
        return false
      }
      const maj = body.alert
      setAlerts(prev => (prev ? prev.map(a => (a.id === id ? { ...a, ...maj } : a)) : prev))
      if (acknowledged) {
        toast.success("Alerte acquittée", { description: maj.message })
      } else {
        toast.info("Acquittement annulé", { description: `L'alerte ${maj.gouvernorat} redevient active.` })
      }
      return true
    } catch {
      toast.error("Acquittement impossible — vérifiez votre connexion.")
      return false
    }
  }

  const unackCount = alerts?.filter(a => !a.acknowledged).length ?? null

  // nav.radar peut porter un id de volet (6) OU un id d'outil terrain du volet
  // « zones » (isochrones / comparateur / cannibalisation) : dans ce cas le
  // sous-onglet principal reste « zones » (2e niveau interne, cf. radar-zones).
  const activeSub = SUB_IDS.has(raw) ? raw : "zones"
  const mainTab = (RADAR_ZONE_TOOLS as readonly string[]).includes(activeSub) ? "zones" : activeSub

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- En-tête du module (dégradé subtil émeraude → ambre, motif
              bandeau du back-office T53-T6b) ---- */}
      <Card className="overflow-hidden border-amber-200 bg-gradient-to-br from-emerald-50/70 via-white to-amber-50/80 dark:border-amber-900/60 dark:from-emerald-950/25 dark:via-transparent dark:to-amber-950/30">
        <CardContent className="flex flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 shadow-sm dark:bg-amber-950 dark:text-amber-400"
              aria-hidden
            >
              <Radar className="h-5.5 w-5.5" />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold leading-tight">{t("sb.radar.title")}</h1>
                <Badge
                  variant="outline"
                  className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                >
                  Module
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {t("sb.radar.desc")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 text-[11px]">
              6 volets · zones blanches incluses
            </Badge>
            <Badge variant="secondary" className="text-[11px]">
              Module complet · B2 + B3 actifs
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ---- Bandeau discret des alertes de zone (T54-B2, tous volets) ---- */}
      <RadarAlertsBanner alerts={alerts} loading={alertsLoading} onAcknowledge={acknowledge} />

      {/* ---- 6 sous-onglets (pilotés par nav.radar, synchronisés sidebar) ---- */}
      <Tabs value={mainTab} onValueChange={v => setNav("radar", v)} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-3 lg:grid-cols-6">
          {RADAR_SUBTABS.map(st => (
            <TabsTrigger
              key={st.id}
              value={st.id}
              className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:text-[13px]"
            >
              <st.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{t(st.labelKey)}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Volet 1 — Zones blanches : fusion réelle de l'ex-module Implantation. */}
        <TabsContent value="zones" className="mt-0 space-y-4">
          <RadarZones brandSlug={brandSlug} />
        </TabsContent>

        {/* Volet 2 — Scoring d'opportunités (T54-B2) : moteur 5 critères,
            Top 50 délégations, simulation de poids locale. */}
        <TabsContent value="scoring" className="mt-0 space-y-4">
          <RadarScoring alertCount={unackCount} />
        </TabsContent>
        {/* Volet 3 — Formats recommandés (T54-B3a) : classement des 5 formats
            réels par gouvernorat (adéquation + justifications + comparateur). */}
        <TabsContent value="formats" className="mt-0 space-y-4">
          <RadarFormats />
        </TabsContent>
        <TabsContent value="faisabilite" className="mt-0 space-y-4">
          <RadarFaisabilite />
        </TabsContent>
        <TabsContent value="simulations" className="mt-0 space-y-4">
          <RadarSimulations prefill={simHandoff} />
        </TabsContent>
        <TabsContent value="franchise" className="mt-0 space-y-4">
          <RadarFranchise brandSlug={brandSlug} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
