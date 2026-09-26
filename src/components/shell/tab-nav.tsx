'use client'

import * as React from "react"
import { useEffect, useState } from "react"
import { LayoutDashboard, Map, Fuel, Crosshair, Calculator, Banknote, Radar, FileText, Settings, Lock, Target, Users } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useAppStore, TAB_ACCESS, type Tab } from "@/store/app-store"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"
import { useI18n, type DictKey } from "@/lib/i18n"

// Libellés i18n (T41) : clés rm.tabs.* — le dictionnaire FR contient les
// libellés historiques EXACTS (repli automatique par clé → aucune régression FR).
const TABS: { value: Tab; labelKey: DictKey; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "dashboard", labelKey: "rm.tabs.dashboard", icon: LayoutDashboard },
  { value: "map", labelKey: "rm.tabs.map", icon: Map },
  { value: "stations", labelKey: "rm.tabs.stations", icon: Fuel },
  { value: "competition", labelKey: "rm.tabs.competition", icon: Crosshair },
  { value: "calculators", labelKey: "rm.tabs.calculators", icon: Calculator },
  { value: "implantation", labelKey: "rm.tabs.implantation", icon: Target },
  { value: "prices", labelKey: "rm.tabs.prices", icon: Banknote },
  { value: "veille", labelKey: "rm.tabs.veille", icon: Radar },
  { value: "reports", labelKey: "rm.tabs.reports", icon: FileText },
  { value: "settings", labelKey: "rm.tabs.settings", icon: Settings },
]

// Onglet conditionnel (T37 — volet « Paramétrage » de la Super Administration) :
// visible uniquement si le compte connecté dispose d'un accès démographie. La
// sonde légère /api/demographie/acces répond { access } | { access: null }.
const DEMOGRAPHIE_TAB: { value: Tab; labelKey: DictKey; icon: React.ComponentType<{ className?: string }> } = {
  value: "demographie",
  labelKey: "rm.tabs.demographie",
  icon: Users,
}

export function TabNav() {
  const { tab: activeTab, setTab, role, userId } = useAppStore()
  const { t } = useI18n()
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
      <nav style={{ top: "var(--cs-header-h, 57px)" }} className="sticky z-30 border-b border-[var(--c-line-2)] bg-[var(--c-paper)]/95 backdrop-blur" aria-label="Navigation principale">
        <div className="mx-auto flex max-w-[1600px] items-center gap-1 overflow-x-auto px-4 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(tab => {
            const allowed = TAB_ACCESS[tab.value].includes(role)
            const btn = (
              <button
                key={tab.value}
                disabled={!allowed}
                onClick={() => setTab(tab.value)}
                className={`relative flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                  activeTab === tab.value
                    ? "bg-[var(--c-brown)] text-[var(--primary-foreground)] shadow-sm"
                    : allowed
                      ? "text-[var(--c-ink-muted)] hover:bg-[var(--c-tint)] hover:text-[var(--c-ink)]"
                      : "cursor-not-allowed text-[var(--c-ink-ghost)]"
                }`}
                aria-current={activeTab === tab.value ? "page" : undefined}
              >
                {allowed ? <tab.icon className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}
                {t(tab.labelKey)}
              </button>
            )
            if (!allowed) {
              return (
                <Tooltip key={tab.value}>
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
