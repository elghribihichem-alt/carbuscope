'use client'

// CarbuScope — T54-A2/B1 — Module 1 « Opportunity Radar » : coque du module
// (spec verrouillée T54-A0). 6 volets pilotés par nav.radar (?? "zones") via le
// store — même contrat que la sidebar (groupe « Opportunity Radar », accent
// ambre). Le volet « zones » fusionne l'ex-branche Implantation (voir
// radar-zones.tsx) ; les 5 autres rendent ce round une carte « Bientôt » honnête
// (contenu B2/B3) — aucune fausse donnée.

import type * as React from "react"
import { Calculator, FileSearch, Gauge, Handshake, LayoutGrid, MapPinPlus, Radar } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useI18n, type DictKey } from "@/lib/i18n"
import { useAppStore } from "@/store/app-store"
import { ModuleSoonCard } from "@/components/shell/module-soon"
import { RadarZones, RADAR_ZONE_TOOLS } from "./radar-zones"

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
              Roadmap B2 → B3
            </Badge>
          </div>
        </CardContent>
      </Card>

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

        {/* Volets 2-6 — coques honnêtes en attente des rounds B2/B3. */}
        <TabsContent value="scoring" className="mt-0 space-y-4">
          <ModuleSoonCard
            icon={Gauge}
            accent="amber"
            planned="B2"
            title="Scoring d'opportunités"
            description="Le classement pondéré des 24 gouvernorats par potentiel d'implantation, prêt à arbitrer vos décisions réseau."
            bullets={[
              "Score à 5 critères : parc véhicules, pouvoir d'achat, trafic, concurrence, foncier",
              "Top 50 des opportunités avec filtres et drill-down par délégation",
              "Pouvoir d'achat et foncier en estimation (badge « est. »), éditables par la Super Admin",
              "Poids des critères pilotés par OpportunityConfig (30 / 20 / 25 / 15 / 10)",
            ]}
          />
        </TabsContent>
        <TabsContent value="formats" className="mt-0 space-y-4">
          <ModuleSoonCard
            icon={LayoutGrid}
            accent="amber"
            planned="B3"
            title="Formats recommandés"
            description="Le bon format de station pour chaque profil de zone détectée par le Radar."
            bullets={[
              "Formats par profil : station classique, compacte, auto 24-30, food store",
              "Prescriptions indicatives par format (surface, services, flux)",
              "Rattachement direct au palier d'équipement du gouvernorat",
            ]}
          />
        </TabsContent>
        <TabsContent value="faisabilite" className="mt-0 space-y-4">
          <ModuleSoonCard
            icon={FileSearch}
            accent="amber"
            planned="B3"
            title="Études de faisabilité"
            description="Le dossier de faisabilité d'un site retenu, de la checklist terrain à l'export."
            bullets={[
              "Checklist terrain complète : accès, raccordements, autorisations",
              "Cartes d'études en SVG stylisé (pas de 3D, arbitrage T54-A0)",
              "Export PDF sur template V1 (génération IA prévue en V2)",
            ]}
          />
        </TabsContent>
        <TabsContent value="simulations" className="mt-0 space-y-4">
          <ModuleSoonCard
            icon={Calculator}
            accent="amber"
            planned="B3"
            title="Simulations de rentabilité"
            description="Le calculateur marge / volume pour chiffrer un projet avant d'engager les études."
            bullets={[
              "Calculateur de rentabilité : volumes, marges, point d'équilibre",
              "Scénarios comparés et sensibilité aux hypothèses prix / trafic",
              "Sauvegarde des scénarios dans vos calculs (SavedCalculation)",
            ]}
          />
        </TabsContent>
        <TabsContent value="franchise" className="mt-0 space-y-4">
          <ModuleSoonCard
            icon={Handshake}
            accent="amber"
            planned="B3"
            title="Franchise"
            description="Le développement par candidats franchisés, suivi de bout en bout depuis le portail enseigne."
            bullets={[
              "Candidatures internes : pipeline de suivi (saisie publique prévue en V2)",
              "Kit franchise : pièces juridiques, financières, techniques et formation",
              "Contrats : droits d'entrée, royalties, statuts et échéances",
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
