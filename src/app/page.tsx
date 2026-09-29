'use client'

// CarbuScope — « Le Waze du carburant » (cahier des charges v2.0)
// Page orchestratrice — T50 : 3 espaces produit partageant une même base :
//   · Portail enseigne (fusion Observatoire + Portail + Back-office + Shadow
//     + Agents terrain — blueprint 8 groupes, naviguée par nav.espace)
//   · Mobile B2C (aperçu)
//   · Super Administration (réservée au compte racine)
// V7 : accès conditionné à une session réelle (cookie signé, /api/auth/session).

import { useSyncExternalStore, useEffect, useState } from "react"
import { useAppStore, type Role } from '@/store/app-store'
import { useI18n } from '@/lib/i18n'
import { useDeepLinks } from '@/hooks/use-deep-links'
import { AppHeader } from '@/components/shell/app-header'
import { AppSidebar } from '@/components/shell/app-sidebar'
import { AppFooter } from '@/components/shell/app-footer'
import { BrandSpaceView } from '@/components/fused/brand-space-view'
import { MobileB2CView } from '@/components/mobile/mobile-b2c-view'
import { SuperAdminView } from '@/components/superadmin/superadmin-view'
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
  const session = useAppStore(s => s.session)
  const authStatus = useAppStore(s => s.authStatus)
  const setSession = useAppStore(s => s.setSession)
  const setAuthStatus = useAppStore(s => s.setAuthStatus)
  const setRole = useAppStore(s => s.setRole)
  const setBrandSlug = useAppStore(s => s.setBrandSlug)
  const { dir } = useI18n()

  // T41 phase 7 — deep-links : restaure #mode=…&tab=… au chargement et reflète
  // l'état de navigation dans l'URL (replaceState, discret). T50 : les modes
  // historiques du hash sont convertis vers l'espace fusionné.
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
  // profil qui s'y retrouverait est ramené à l'espace enseigne (garde défensive).
  const isSuperAdmin = session?.role === "SUPER_ADMIN"
  const effectiveMode = mode === 'superadmin' && !isSuperAdmin ? 'portail' : mode

  // Attend l'hydratation : évite tout écart pendant la restauration de la
  // session persistée (localStorage), puis révèle écran de connexion ou app.
  const mounted = useHydrated()

  if (!mounted || !booted) return <AuthSplash />
  if (authStatus !== "auth" || !session) return <LoginGate />

  return (
    <div dir={dir} className="flex min-h-screen flex-col bg-[var(--c-page)] text-foreground">
      {/* En-tête figé (sticky top-0) : identité, 3 espaces produit, alertes, compte */}
      <AppHeader />
      {/* T46 — navigation verticale en accordéon (desktop) + Sheet (mobile).
          La sidebar se colle sous l'en-tête figé et défile indépendamment. */}
      <div className="flex flex-1 items-stretch">
        <AppSidebar mode={effectiveMode} />
        <main className="flex min-w-0 flex-1 flex-col" id="contenu">
        {effectiveMode === 'portail' && <BrandSpaceView />}
        {effectiveMode === 'mobile' && <MobileB2CView />}
        {effectiveMode === 'superadmin' && <SuperAdminView />}
        </main>
      </div>
      <AppFooter />
    </div>
  )
}
