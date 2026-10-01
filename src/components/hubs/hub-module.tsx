'use client'

// CarbuScope — T54-A2 — Module 2 « Mobility Hub Operations » : coque du module
// (spec verrouillée T54-A0). 5 volets pilotés par nav.hubs (?? "carte") via le
// store — même contrat que la sidebar (groupe « Mobility Hub Operations »,
// accent terracotta). Ce round : coque + cartes « Bientôt » honnêtes (contenu
// C1-C3), aucune fausse donnée.

import type * as React from "react"
import { BarChart3, LocateFixed, Map, Settings, Users, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useI18n, type DictKey } from "@/lib/i18n"
import { useAppStore } from "@/store/app-store"
import { ModuleSoonCard } from "@/components/shell/module-soon"

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
              Roadmap C1 → C3
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

        {/* Volet 1 — Carte des TMP (round C1). */}
        <TabsContent value="carte" className="mt-0 space-y-4">
          <ModuleSoonCard
            icon={Map}
            accent="terra"
            planned="C1"
            title="Carte des TMP"
            description="La carte stylisée du réseau des Terminaux Multi-Services et de leur environnement routier."
            bullets={[
              "Mini-carte stylisée des hubs (SVG, pas de 3D — arbitrage T54-A0)",
              "Statuts des sites : actifs, en construction, planifiés",
              "Trafic quotidien et gouvernorat de rattachement par hub",
            ]}
          />
        </TabsContent>

        {/* Volet 2 — Gestion des services (round C2). */}
        <TabsContent value="services" className="mt-0 space-y-4">
          <ModuleSoonCard
            icon={Wrench}
            accent="terra"
            planned="C2"
            title="Gestion des services"
            description="Le paramétrage opérationnel des services proposés dans chaque Terminal Multi-Services."
            bullets={[
              "CRUD des services par hub : lavage, vidange, pneus, recharge, boutique…",
              "Tarifs et statuts par service (actif, en pause)",
              "Tableau imbriqué hub → services, cohérent avec la charte des listes",
            ]}
          />
        </TabsContent>

        {/* Volet 3 — Base clients TMP (round C2). */}
        <TabsContent value="clients" className="mt-0 space-y-4">
          <ModuleSoonCard
            icon={Users}
            accent="terra"
            planned="C2"
            title="Base clients TMP"
            description="La clientèle véhicules des hubs : parcs, segments de fidélité et historique de visites."
            bullets={[
              "Fiches véhicules : plaque, segment (fidèle / régulier / nouveau), motorisation",
              "Historique des interventions et visites par véhicule",
              "Recherche par plaque, segment et hub de rattachement",
            ]}
          />
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
