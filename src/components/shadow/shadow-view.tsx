'use client'

// Shadow Market (T44) — shell du module « marché parallèle du carburant ».
// 6 sections : Vue d'Ensemble · Cartographie · Recensement · Analyse d'Impact ·
// Rapports · Paramètres. Accessible à la Super Administration (vision
// nationale) et aux enseignes (leurs pertes) — le périmètre est déterminé par
// la session serveur, le sélecteur d'enseigne de l'en-tête sert de lentille
// pour la Super Administration uniquement.

import * as React from "react"
import { useState } from "react"
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

const SECTIONS = [
  { id: "overview", emoji: "📈", label: "Vue d'Ensemble" },
  { id: "cartography", emoji: "🗺️", label: "Cartographie" },
  { id: "recensement", emoji: "📋", label: "Recensement" },
  { id: "impact", emoji: "💰", label: "Analyse d'Impact" },
  { id: "reports", emoji: "📑", label: "Rapports" },
  { id: "settings", emoji: "⚙️", label: "Paramètres" },
] as const

type SectionId = (typeof SECTIONS)[number]["id"]

export function ShadowView() {
  const [section, setSection] = useState<SectionId>("overview")
  const session = useAppStore(s => s.session)
  const brandSlug = useAppStore(s => s.brandSlug)
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

      {/* Navigation des 6 sections */}
      <nav
        className="sticky top-[var(--cs-header-h,57px)] z-30 border-b border-stone-200 bg-white/95 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95"
        aria-label="Navigation Shadow Market"
      >
        <div className="mx-auto flex max-w-[1600px] items-center gap-1 overflow-x-auto px-1 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? "true" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                section === s.id
                  ? "bg-stone-900 text-white shadow-sm dark:bg-white dark:text-stone-900"
                  : "text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
              }`}
            >
              <span aria-hidden>{s.emoji}</span>
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Contenu de la section active */}
      {section === "overview" && <ShadowOverview onNavigate={id => setSection(id as SectionId)} />}
      {section === "cartography" && <ShadowCartography />}
      {section === "recensement" && <ShadowRecensement onNavigate={id => setSection(id as SectionId)} />}
      {section === "impact" && <ShadowImpact />}
      {section === "reports" && <ShadowReports />}
      {section === "settings" && <ShadowSettings />}
    </div>
  )
}
