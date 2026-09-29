'use client'

// T50 — Espace enseigne fusionné : UN seul espace « Portail enseigne » qui
// embarque les modules historiques, sélectionnés par nav.espace :
//   observatoire (11 onglets) · portail (tableau de bord enseigne) ·
//   shadow (Shadow Market) · backoffice (plateforme) · agents (aperçu
//   application agents terrain).
// La sidebar (blueprint 8 groupes) pilote nav.espace ; l'en-tête ne propose
// plus que 3 espaces produit.

import { useAppStore } from "@/store/app-store"
import { NAV_DEFAULTS } from "@/components/shell/app-sidebar"
import { DashboardTab } from "@/components/dashboard/dashboard-tab"
import { CarteInteractiveTab } from "@/components/map/carte-interactive-tab"
import { StationsTab } from "@/components/stations/stations-tab"
import { CompetitionTab } from "@/components/competition/competition-tab"
import { CalculatorsTab } from "@/components/calculators/calculators-tab"
import { ImplantationTab } from "@/components/implantation/implantation-tab"
import { PricesTab } from "@/components/prices/prices-tab"
import { VeilleTab } from "@/components/veille/veille-tab"
import { ReportsTab } from "@/components/reports/reports-tab"
import { SettingsTab } from "@/components/settings/settings-tab"
import { DemographieTerrain } from "@/components/demographie/demographie-terrain"
import { PortalView } from "@/components/portal/portal-view"
import { BackofficeView } from "@/components/backoffice/backoffice-view"
import { ShadowView } from "@/components/shadow/shadow-view"
import { MobileAgentView } from "@/components/mobile/mobile-agent-view"
import type { Espace } from "@/store/app-store"

const VALID_ESPACES: Espace[] = ["observatoire", "portail", "shadow", "backoffice", "agents"]

export function BrandSpaceView() {
  const tab = useAppStore(s => s.tab)
  const espaceBrut = useAppStore(s => s.nav.espace)
  const espace: Espace =
    espaceBrut && VALID_ESPACES.includes(espaceBrut as Espace)
      ? (espaceBrut as Espace)
      : (NAV_DEFAULTS.espace as Espace)

  // -- Observatoire B2B (11 onglets, verrous TAB_ACCESS gérés par chaque vue) --
  if (espace === "observatoire") {
    return (
      <>
        {tab === "dashboard" && <DashboardTab />}
        {tab === "map" && <CarteInteractiveTab />}
        {tab === "stations" && <StationsTab />}
        {tab === "competition" && <CompetitionTab />}
        {tab === "calculators" && <CalculatorsTab />}
        {tab === "implantation" && <ImplantationTab />}
        {tab === "prices" && <PricesTab />}
        {tab === "veille" && <VeilleTab />}
        {tab === "reports" && <ReportsTab />}
        {tab === "demographie" && <DemographieTerrain />}
        {tab === "settings" && <SettingsTab />}
      </>
    )
  }

  // -- Portail enseigne (tableau de bord, stations, avis, API) --
  if (espace === "portail") return <PortalView />

  // -- Shadow Market (marché parallèle) --
  if (espace === "shadow") return <ShadowView />

  // -- Back-office plateforme --
  if (espace === "backoffice") return <BackofficeView />

  // -- Aperçu application agents terrain --
  return <MobileAgentView />
}
