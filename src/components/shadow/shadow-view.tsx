'use client'

// Shadow Market (T44) — shell du module « marché parallèle du carburant ».
// 6 sections : Vue d'Ensemble · Cartographie · Recensement · Analyse d'Impact ·
// Rapports · Paramètres. Accessible à la Super Administration (vision
// nationale) et aux enseignes (leurs pertes) — le périmètre est déterminé par
// la session serveur, le sélecteur d'enseigne de l'en-tête sert de lentille
// pour la Super Administration uniquement.

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Ghost, Crown, Building2, ShieldAlert } from "lucide-react"
import { useAppStore } from "@/store/app-store"
import { ShadowOverview } from "./overview/shadow-overview"
import { ShadowCartography } from "./cartography/shadow-cartography"
import { ShadowRecensement } from "./recensement/shadow-recensement"
import { ShadowImpact } from "./impact/shadow-impact"
import { ShadowReports } from "./reports/shadow-reports"
import { ShadowSettings } from "./settings/shadow-settings"

type SectionId = "overview" | "cartography" | "recensement" | "impact" | "reports" | "settings"

export function ShadowView() {
  const session = useAppStore(s => s.session)
  const brandSlug = useAppStore(s => s.brandSlug)
  const setNav = useAppStore(s => s.setNav)
  // Section active pilotée par la sidebar (store T46, clé « shadow »).
  const section = (useAppStore(s => s.nav.shadow) ?? "overview") as SectionId
  const setSection = (id: string) => setNav("shadow", id)
  const isSuperAdmin = session?.role === "SUPER_ADMIN"

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Bandeau « war room » du marché parallèle */}
      <Card className="border-stone-300 bg-gradient-to-br from-stone-900 via-stone-900 to-stone-800 text-white dark:border-stone-700">
        <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#E53935]/15 text-[#ff6f6a]">
              <Ghost className="h-5.5 w-5.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold leading-tight tracking-tight">
                  <span aria-hidden>🗺️</span> Shadow Market — Marché parallèle
                </h1>
                <Badge variant="outline" className="border-[#E53935]/40 bg-[#E53935]/10 text-[#ff8a86]">
                  Module d&apos;intelligence
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-300">
                Recensement et cartographie des vendeurs clandestins de carburant (garages, boutiques, bidons bord de
                route) — près de <strong className="text-white">40 %</strong> du marché formel grignoté. Suivi des
                pertes, zones rouges et campagnes de recensement terrain.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-lg border border-stone-700 bg-stone-800/60 px-4 py-3">
              {isSuperAdmin ? (
                <>
                  <Crown className="h-4 w-4 text-amber-400" aria-hidden />
                  <div className="text-sm">
                    <p className="font-semibold leading-none text-white">Vision nationale</p>
                    <p className="mt-1 text-xs text-stone-400">Super Administration — lentille : {brandSlug}</p>
                  </div>
                </>
              ) : (
                <>
                  <Building2 className="h-4 w-4 text-stone-300" aria-hidden />
                  <div className="text-sm">
                    <p className="font-semibold leading-none text-white">{session?.brandName ?? "Enseigne"}</p>
                    <p className="mt-1 text-xs text-stone-400">Périmètre : vos stations uniquement</p>
                  </div>
                </>
              )}
            </div>
            {!isSuperAdmin && (
              <div className="flex items-center gap-2 rounded-lg border border-stone-700 bg-stone-800/60 px-3 py-3 text-xs text-stone-400">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                Données nationales agrégées, pertes filtrées sur votre enseigne.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Contenu de la section active — la navigation des 6 sections est portée par la sidebar */}
      {section === "overview" && <ShadowOverview onNavigate={setSection} />}
      {section === "cartography" && <ShadowCartography />}
      {section === "recensement" && <ShadowRecensement onNavigate={setSection} />}
      {section === "impact" && <ShadowImpact />}
      {section === "reports" && <ShadowReports />}
      {section === "settings" && <ShadowSettings />}
    </div>
  )
}
