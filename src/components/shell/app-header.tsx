'use client'

import * as React from "react"
import { useEffect, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Bell, Moon, Sun, Building2, LineChart, Smartphone, ShieldCheck, ChevronDown } from "lucide-react"
import { useTheme } from "next-themes"
import { useAppStore, type Mode, type Role, ROLE_LABELS } from "@/store/app-store"
import type { BrandDTO, AlertDTO } from "@/lib/types"
import { CarbuscopeLogo } from "./carbuscope-logo"

const MODES: { value: Mode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "observatoire", label: "Observatoire B2B", icon: LineChart },
  { value: "portail", label: "Portail enseigne", icon: Building2 },
  { value: "mobile", label: "Mobile B2C", icon: Smartphone },
  { value: "backoffice", label: "Back-office", icon: ShieldCheck },
]

const ROLES: Role[] = ["ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER"]

export function AppHeader() {
  const { mode, setMode, brandSlug, setBrandSlug, role, setRole, setTab, tab } = useAppStore()
  const { theme, setTheme } = useTheme()
  const [brands, setBrands] = useState<BrandDTO[]>([])
  const [alerts, setAlerts] = useState<AlertDTO[]>([])

  useEffect(() => {
    fetch("/api/brands").then(r => r.json()).then(d => setBrands(d.brands ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/alerts?brand=${brandSlug}&limit=6`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setAlerts(d.alerts ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [brandSlug])

  const critical = alerts.filter(a => a.severity === "CRITICAL").length
  const currentBrand = brands.find(b => b.slug === brandSlug)

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        {/* Identité */}
        <div className="flex items-center gap-2.5">
          <CarbuscopeLogo size={36} />
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight">Carbu<span className="text-emerald-600">Scope</span></p>
            <p className="hidden text-[11px] text-muted-foreground sm:block">L'observatoire du carburant — Tunisie</p>
          </div>
        </div>

        {/* Sélecteur de mode produit */}
        <nav className="order-3 w-full sm:order-none sm:w-auto" aria-label="Produit">
          <div className="flex items-center gap-0.5 rounded-lg border bg-muted/50 p-0.5">
            {MODES.map(m => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${mode === m.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                aria-pressed={mode === m.value}
              >
                <m.icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{m.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Enseigne connectée */}
          <div className="flex items-center gap-1.5">
            {currentBrand && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: currentBrand.color }} />}
            <Select value={brandSlug} onValueChange={setBrandSlug}>
              <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Enseigne connectée">
                <SelectValue placeholder="Enseigne" />
              </SelectTrigger>
              <SelectContent>
                {brands.map(b => (
                  <SelectItem key={b.slug} value={b.slug}>
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: b.color }} />
                      {b.name} <span className="text-muted-foreground">({b.stationCount})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rôle */}
          <Select value={role} onValueChange={v => setRole(v as Role)}>
            <SelectTrigger className="h-8 w-[160px] text-xs" aria-label="Rôle">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map(r => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Cloche d'alertes */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="relative h-8 w-8" aria-label="Alertes actives">
                <Bell className="h-4 w-4" />
                {critical > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                    {critical}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="border-b px-3 py-2 text-sm font-semibold">Dernières alertes</div>
              <div className="max-h-80 overflow-y-auto">
                {alerts.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Aucune alerte récente.</p>}
                {alerts.slice(0, 5).map(a => (
                  <button key={a.id} className="block w-full border-b px-3 py-2 text-left hover:bg-accent"
                    onClick={() => { setMode("observatoire"); setTab("veille") }}>
                    <p className="flex items-center gap-2 text-xs font-medium">
                      <span className={`h-1.5 w-1.5 rounded-full ${a.severity === "CRITICAL" ? "bg-destructive" : a.severity === "MEDIUM" ? "bg-amber-500" : "bg-emerald-500"}`} />
                      {a.title}
                    </p>
                    <p className="mt-0.5 pl-3.5 text-[11px] text-muted-foreground">{a.gouvernorat} · {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(a.date))}</p>
                  </button>
                ))}
              </div>
              <button className="w-full px-3 py-2 text-center text-xs font-medium text-emerald-700 hover:bg-accent"
                onClick={() => { setMode("observatoire"); setTab("veille") }}>
                Voir tout l'onglet Veille
              </button>
            </PopoverContent>
          </Popover>

          {/* Thème */}
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Basculer le thème">
            <Sun className="hidden h-4 w-4 dark:block" />
            <Moon className="h-4 w-4 dark:hidden" />
          </Button>

          <Badge variant="outline" className="hidden h-8 items-center gap-1 bg-emerald-50 text-[11px] font-medium text-emerald-700 lg:inline-flex dark:bg-emerald-950 dark:text-emerald-400">
            {tab === "settings" && mode === "observatoire" ? "Démo" : "Démo"} v0.1
            <ChevronDown className="h-3 w-3 opacity-40" />
          </Badge>
        </div>
      </div>
    </header>
  )
}
