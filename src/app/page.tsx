'use client'

// CarbuScope — « Le Waze du carburant » (cahier des charges v2.0)
// Page orchestratrice : 4 produits partageant une même base de données.
// Module A : Observatoire Web B2B (9 onglets) — Module B : Mobile B2C (aperçu)
// Module C : Portail Enseigne — Module D : Back-office plateforme.

import { useAppStore } from '@/store/app-store'
import { AppHeader } from '@/components/shell/app-header'
import { TabNav } from '@/components/shell/tab-nav'
import { AppFooter } from '@/components/shell/app-footer'
import { DashboardTab } from '@/components/dashboard/dashboard-tab'
import { CarteInteractiveTab } from '@/components/map/carte-interactive-tab'
import { StationsTab } from '@/components/stations/stations-tab'
import { CompetitionTab } from '@/components/competition/competition-tab'
import { CalculatorsTab } from '@/components/calculators/calculators-tab'
import { PricesTab } from '@/components/prices/prices-tab'
import { VeilleTab } from '@/components/veille/veille-tab'
import { ReportsTab } from '@/components/reports/reports-tab'
import { SettingsTab } from '@/components/settings/settings-tab'
import { MobileB2CView } from '@/components/mobile/mobile-b2c-view'
import { PortalView } from '@/components/portal/portal-view'
import { BackofficeView } from '@/components/backoffice/backoffice-view'

export default function Home() {
  const mode = useAppStore(s => s.mode)
  const tab = useAppStore(s => s.tab)

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader />
      {mode === 'observatoire' && <TabNav />}
      <main className="flex flex-1 flex-col" id="contenu">
        {mode === 'observatoire' && (
          <>
            {tab === 'dashboard' && <DashboardTab />}
            {tab === 'map' && <CarteInteractiveTab />}
            {tab === 'stations' && <StationsTab />}
            {tab === 'competition' && <CompetitionTab />}
            {tab === 'calculators' && <CalculatorsTab />}
            {tab === 'prices' && <PricesTab />}
            {tab === 'veille' && <VeilleTab />}
            {tab === 'reports' && <ReportsTab />}
            {tab === 'settings' && <SettingsTab />}
          </>
        )}
        {mode === 'portail' && <PortalView />}
        {mode === 'mobile' && <MobileB2CView />}
        {mode === 'backoffice' && <BackofficeView />}
      </main>
      <AppFooter />
    </div>
  )
}
