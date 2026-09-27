'use client'

// CarbuScope — « Le Waze du carburant » (cahier des charges v2.0)
// Page orchestratrice : 4 produits partageant une même base de données.
// T44 : + module Shadow Market (marché parallèle — SA & enseignes).
// Module A : Observatoire Web B2B (10 onglets) — Module B : Mobile B2C (aperçu)
// Module C : Portail Enseigne — Module D : Back-office plateforme.
// V7 : accès conditionné à une session réelle (cookie signé, /api/auth/session).

import { useSyncExternalStore, useEffect, useState } from "react"
import { useAppStore, type Role } from '@/store/app-store'
import { useI18n } from '@/lib/i18n'
import { useDeepLinks } from '@/hooks/use-deep-links'
import { AppHeader } from '@/components/shell/app-header'
import { TabNav } from '@/components/shell/tab-nav'
import { AppFooter } from '@/components/shell/app-footer'
import { DashboardTab } from '@/components/dashboard/dashboard-tab'
import { CarteInteractiveTab } from '@/components/map/carte-interactive-tab'
import { StationsTab } from '@/components/stations/stations-tab'
import { CompetitionTab } from '@/components/competition/competition-tab'
import { CalculatorsTab } from '@/components/calculators/calculators-tab'
import { ImplantationTab } from '@/components/implantation/implantation-tab'
import { PricesTab } from '@/components/prices/prices-tab'
import { VeilleTab } from '@/components/veille/veille-tab'
import { ReportsTab } from '@/components/reports/reports-tab'
import { SettingsTab } from '@/components/settings/settings-tab'
import { DemographieTerrain } from '@/components/demographie/demographie-terrain'
import { MobileB2CView } from '@/components/mobile/mobile-b2c-view'
import { MobileAgentView } from '@/components/mobile/mobile-agent-view'
import { PortalView } from '@/components/portal/portal-view'
import { BackofficeView } from '@/components/backoffice/backoffice-view'
import { SuperAdminView } from '@/components/superadmin/superadmin-view'
import { ShadowView } from '@/components/shadow/shadow-view'
import { LoginGate } from '@/components/auth/login-gate'
import { AuthSplash } from '@/components/auth/login-screen'
import type { SessionUser } from '@/lib/types'

// Détection d'hydratation sûre : faux pendant le rendu serveur / première passe
// client, vrai ensuite — sans setState dans un effet (règle react-hooks).
const emptySubscribe = () => () => {}
function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
}

export default function Home() {
  const mode = useAppStore(s => s.mode)
  const tab = useAppStore(s => s.tab)
  const session = useAppStore(s => s.session)
  const authStatus = useAppStore(s => s.authStatus)
  const setSession = useAppStore(s => s.setSession)
  const setAuthStatus = useAppStore(s => s.setAuthStatus)
  const setRole = useAppStore(s => s.setRole)
  const setBrandSlug = useAppStore(s => s.setBrandSlug)
  const { dir } = useI18n()

  // T41 phase 7 — deep-links : restaure #mode=…&tab=… au chargement et reflète
  // l'état de navigation dans l'URL (replaceState, discret).
  useDeepLinks()

  // V7 — bootstrap de session : le cookie httpOnly signé fait foi. Une session
  // serveur valide rouvre l'application ; sinon l'écran de connexion réapparaît.
  const [booted, setBooted] = useState(false)
  useEffect(() => {
    let alive = true
    fetch("/api/auth/session")
      .then(r => r.json())
      .then((d: { user?: SessionUser | null }) => {
        if (!alive) return
        if (d.user) {
          setSession(d.user)
          setAuthStatus("auth")
          // Rôle « métier » pour les onglets de l'observatoire : la racine Super
          // Admin navigue comme un administrateur complet (convention démo).
          setRole(d.user.role === "SUPER_ADMIN" ? "ADMIN" : (d.user.role as Role))
          if (d.user.brandSlug) setBrandSlug(d.user.brandSlug)
        }
        setBooted(true)
      })
      .catch(() => { if (alive) setBooted(true) })
    return () => { alive = false }
  }, [])

  // L'espace Super Administration est réservé au compte racine — tout autre
  // profil qui s'y retrouverait est ramené à l'observatoire (garde défensive).
  const isSuperAdmin = session?.role === "SUPER_ADMIN"
  const effectiveMode = mode === 'superadmin' && !isSuperAdmin ? 'observatoire' : mode

  // Attend l'hydratation : évite tout écart pendant la restauration de la
  // session persistée (localStorage), puis révèle écran de connexion ou app.
  const mounted = useHydrated()

  if (!mounted || !booted) return <AuthSplash />
  if (authStatus !== "auth" || !session) return <LoginGate />

  return (
    <div dir={dir} className="flex min-h-screen flex-col bg-[var(--c-page)] text-foreground">
      <AppHeader />
      {effectiveMode === 'observatoire' && <TabNav />}
      <main className="flex flex-1 flex-col" id="contenu">
        {effectiveMode === 'observatoire' && (
          <>
            {tab === 'dashboard' && <DashboardTab />}
            {tab === 'map' && <CarteInteractiveTab />}
            {tab === 'stations' && <StationsTab />}
            {tab === 'competition' && <CompetitionTab />}
            {tab === 'calculators' && <CalculatorsTab />}
            {tab === 'implantation' && <ImplantationTab />}
            {tab === 'prices' && <PricesTab />}
            {tab === 'veille' && <VeilleTab />}
            {tab === 'reports' && <ReportsTab />}
            {tab === 'demographie' && <DemographieTerrain />}
            {tab === 'settings' && <SettingsTab />}
          </>
        )}
        {effectiveMode === 'portail' && <PortalView />}
        {effectiveMode === 'mobile' && <MobileB2CView />}
        {effectiveMode === 'agents' && <MobileAgentView />}
        {effectiveMode === 'backoffice' && <BackofficeView />}
        {effectiveMode === 'superadmin' && <SuperAdminView />}
        {effectiveMode === 'shadow' && <ShadowView />}
      </main>
      <AppFooter />
    </div>
  )
}
