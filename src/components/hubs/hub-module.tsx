'use client'

// CarbuScope — T54-A2 → T54-Ca (volets 1-3/5) — Module 2 « Mobility Hub
// Operations » : coque du module (spec verrouillée T54-A0). 5 volets pilotés
// par nav.hubs (?? "carte") via le store — même contrat que la sidebar
// (groupe « Mobility Hub Operations », accent terracotta).
// Volets RÉELS depuis T54-Ca : « Carte des TMP » (Leaflet + filtres + Sheet
// détail + handoffs), « Gestion des services » (CRUD + transitions + clôture
// définitive) et « Base clients TMP » (recherche/pagination/segment/
// historique/export CSV). Handoff inter-volets : nav.hubsSel = hubId posé par
// la carte (boutons du Sheet détail) et consommé à la MONTURE des volets
// services/clients (pattern nav.radarSim de B3a — Radix Tabs remonte le volet
// à chaque activation). Volets 4-5 : cartes « Bientôt » honnêtes (C1/C3).

import type * as React from "react"
import { BarChart3, LocateFixed, Map, Settings, Users, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useI18n, type DictKey } from "@/lib/i18n"
import { useAppStore } from "@/store/app-store"
import { ModuleSoonCard } from "@/components/shell/module-soon"
import { HubCarte } from "./hub-carte"
import { HubServices } from "./hub-services"
import { HubClients } from "./hub-clients"

/** Les 5 volets du module TMP (spec T54-A0). */
const HUB_SUBTABS: ReadonlyArray<{ id: string; icon: React.ComponentType<{ className?: string }>; labelKey: DictKey }> = [
  { id: "carte", icon: Map, labelKey: "sb.hubs.carte" },
  { id: "services", icon: Wrench, labelKey: "sb.hubs.services" },
  { id: "clients", icon: Users, labelKey: "sb.hubs.clients" },
  { id: "analytics", icon: BarChart3, labelKey: "sb.hubs.analytics" },
  { id: "parametres", icon: Settings, labelKey: "sb.hubs.parametres" },
]

const HUB_IDS = new Set(HUB_SUBTABS.map(s => s.id))

export function HubModule() {
  const { t } = useI18n()
  const setNav = useAppStore(s => s.setNav)
  const raw = useAppStore(s => s.nav.hubs) ?? "carte"
  const tab = HUB_IDS.has(raw) ? raw : "carte"
  // Handoff carte → services/clients : hub présélectionné posé dans nav.hubsSel
  // (boutons « Gérer les services » / « Base clients » du Sheet détail) et
  // consommé à la monture des volets concernés.
  const hubsSel = useAppStore(s => s.nav.hubsSel) ?? ""

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- En-tête du module (accent terracotta, dégradé subtil
              ambre → orange, motif bandeau du back-office T53-T6b) ---- */}
      <Card className="overflow-hidden border-orange-200 bg-gradient-to-br from-amber-50/70 via-white to-orange-50/80 dark:border-orange-900/60 dark:from-amber-950/25 dark:via-transparent dark:to-orange-950/30">
        <CardContent className="flex flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-700 shadow-sm dark:bg-orange-950 dark:text-orange-400"
              aria-hidden
            >
              <LocateFixed className="h-5.5 w-5.5" />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold leading-tight">{t("sb.hubs.title")}</h1>
                <Badge
                  variant="outline"
                  className="border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400"
                >
                  Module
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {t("sb.hubs.desc")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 text-[11px]">
              5 volets · Terminaux Multi-Services
            </Badge>
            <Badge variant="secondary" className="text-[11px]">
              Carte · Services · Clients actifs
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ---- 5 sous-onglets (pilotés par nav.hubs, synchronisés sidebar) ---- */}
      <Tabs value={tab} onValueChange={v => setNav("hubs", v)} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-3 lg:grid-cols-5">
          {HUB_SUBTABS.map(st => (
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

        {/* Volet 1 — Carte des TMP (T54-Ca) : Leaflet réelle + filtres +
            Sheet détail + handoffs vers services/clients. */}
        <TabsContent value="carte" className="mt-0 space-y-4">
          <HubCarte />
        </TabsContent>

        {/* Volet 2 — Gestion des services (T54-Ca) : CRUD complet,
            pause/reprise libres, clôture définitive AlertDialog. */}
        <TabsContent value="services" className="mt-0 space-y-4">
          <HubServices preselect={hubsSel} />
        </TabsContent>

        {/* Volet 3 — Base clients TMP (T54-Ca) : recherche/pagination,
            segment éditable, historique, export CSV. */}
        <TabsContent value="clients" className="mt-0 space-y-4">
          <HubClients preselect={hubsSel} />
        </TabsContent>

        {/* Volet 4 — Analytics & conversions (round C3). */}
        <TabsContent value="analytics" className="mt-0 space-y-4">
          <ModuleSoonCard
            icon={BarChart3}
            accent="terra"
            planned="C3"
            title="Analytics & conversions"
            description="La mesure de l'efficacité commerciale des hubs, du passage capteur à la fidélisation."
            bullets={[
              "Funnel capteurs → visites → services → fidélisation",
              "Conversions par source : radar de passage, capteur, campagne, borne digitale",
              "Graphiques thémés (recharts) et valeurs de panier consolidées",
            ]}
          />
        </TabsContent>

        {/* Volet 5 — Paramètres TMP (round C1). */}
        <TabsContent value="parametres" className="mt-0 space-y-4">
          <ModuleSoonCard
            icon={Settings}
            accent="terra"
            planned="C1"
            title="Paramètres TMP"
            description="La configuration d'exploitation des hubs : horaires, capacités et tarifs de base."
            bullets={[
              "Configuration par hub : horaires, surface, capacité d'accueil",
              "Tarifs de base et seuils d'alerte d'exploitation",
              "Cycle de vie des sites (planifié → construction → actif)",
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
