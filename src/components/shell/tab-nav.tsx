'use client'

import * as React from "react"
import { LayoutDashboard, Map, Fuel, Crosshair, Calculator, Banknote, Radar, FileText, Settings, Lock, Target } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useAppStore, TAB_ACCESS, type Tab } from "@/store/app-store"

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

export function TabNav() {
  const { tab, setTab, role } = useAppStore()

  return (
    <TooltipProvider delayDuration={200}>
      <nav style={{ top: "var(--cs-header-h, 57px)" }} className="sticky z-30 border-b bg-background/95 backdrop-blur" aria-label="Navigation principale">
        <div className="mx-auto flex max-w-[1600px] items-center gap-1 overflow-x-auto px-4 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(t => {
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
