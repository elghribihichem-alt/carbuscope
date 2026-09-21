'use client'

import * as React from "react"
import { useEffect, useState } from "react"
import { LayoutDashboard, Map, Fuel, Crosshair, Calculator, Banknote, Radar, FileText, Settings, Lock, Target, Users } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useAppStore, TAB_ACCESS, type Tab } from "@/store/app-store"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"

const TABS: { value: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { value: "map", label: "Carte interactive", icon: Map },
  { value: "stations", label: "Mes stations", icon: Fuel },
  { value: "competition", label: "Concurrence", icon: Crosshair },
  { value: "calculators", label: "Calculateurs", icon: Calculator },
  { value: "implantation", label: "Implantation", icon: Target },
  { value: "prices", label: "Prix & marges", icon: Banknote },
  { value: "veille", label: "Veille", icon: Radar },
  { value: "reports", label: "Rapports", icon: FileText },
  { value: "settings", label: "Paramètres", icon: Settings },
]

// Onglet conditionnel (T37 — volet « Paramétrage » de la Super Administration) :
// visible uniquement si le compte connecté dispose d'un accès démographie. La
// sonde légère /api/demographie/acces répond { access } | { access: null }.
const DEMOGRAPHIE_TAB: { value: Tab; label: string; icon: React.ComponentType<{ className?: string }> } = {
  value: "demographie",
  label: "Démographie",
  icon: Users,
}

export function TabNav() {
  const { tab, setTab, role, userId } = useAppStore()
  const [hasDemographie, setHasDemographie] = useState(false)

  // E-mail du compte démo connecté (gate de l'onglet conditionnel — la sonde
  // n'a de sens que pour un compte connu ; sinon l'onglet reste masqué).
  const email = userId ? DEMO_ACCOUNTS_MAP[userId]?.email ?? null : null

  useEffect(() => {
    if (!email) return
    let alive = true
    fetch(`/api/demographie/acces?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(j => {
        if (alive) setHasDemographie(Boolean(j?.access))
      })
      .catch(() => { if (alive) setHasDemographie(false) })
    return () => { alive = false }
  }, [email])

  const tabs = hasDemographie && email !== null
    ? [...TABS.slice(0, 9), DEMOGRAPHIE_TAB, TABS[9]]
    : TABS

  return (
    <TooltipProvider delayDuration={200}>
      <nav style={{ top: "var(--cs-header-h, 57px)" }} className="sticky z-30 border-b bg-background/95 backdrop-blur" aria-label="Navigation principale">
        <div className="mx-auto flex max-w-[1600px] items-center gap-1 overflow-x-auto px-4 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(t => {
            const allowed = TAB_ACCESS[t.value].includes(role)
            const btn = (
              <button
                key={t.value}
                disabled={!allowed}
                onClick={() => setTab(t.value)}
                className={`relative flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                  tab === t.value
                    ? "bg-emerald-600 text-white shadow-sm"
                    : allowed
                      ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                      : "cursor-not-allowed text-muted-foreground/50"
                }`}
                aria-current={tab === t.value ? "page" : undefined}
              >
                {allowed ? <t.icon className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}
                {t.label}
              </button>
            )
            if (!allowed) {
              return (
                <Tooltip key={t.value}>
                  <TooltipTrigger asChild>{btn}</TooltipTrigger>
                  <TooltipContent>
                    <p>Onglet réservé — rôle insuffisant</p>
                    <p className="text-[11px] text-muted-foreground">Changez de rôle dans l'en-tête (démo)</p>
                  </TooltipContent>
                </Tooltip>
              )
            }
            return btn
          })}
        </div>
      </nav>
    </TooltipProvider>
  )
}
