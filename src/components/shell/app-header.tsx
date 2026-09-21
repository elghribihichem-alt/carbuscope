'use client'

import * as React from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Bell, Moon, Sun, Building2, LineChart, Smartphone, ShieldCheck, ChevronDown, LogOut, Zap } from "lucide-react"
import { toast } from "sonner"
import { useTheme } from "next-themes"
import { useAppStore, ROLE_LABELS, type Mode, type Role } from "@/store/app-store"
import { DEMO_ACCOUNTS, DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"
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
  const { mode, setMode, brandSlug, setBrandSlug, role, setRole, setTab, userId, login, logout } = useAppStore()
  const { theme, setTheme } = useTheme()
  const [brands, setBrands] = useState<BrandDTO[]>([])
  const [alerts, setAlerts] = useState<AlertDTO[]>([])
  const headerRef = useRef<HTMLElement>(null)
  const account = userId ? DEMO_ACCOUNTS_MAP[userId] : null

  /** Bascule vers un autre profil de démonstration (sélecteur démo). */
  function switchProfile(id: string) {
    const acc = DEMO_ACCOUNTS_MAP[id]
    if (!acc || id === userId) return
    login(id)
    toast.info(`Profil changé : ${acc.name}`, {
      description: `${acc.jobTitle} — ${acc.brandName}.`,
    })
  }

  // Publie la hauteur réelle de l'en-tête (peut passer à 2 lignes selon la largeur)
  // pour que la navigation d'onglets se colle SOUS lui sans être recouverte.
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty("--cs-header-h", `${Math.round(el.getBoundingClientRect().height)}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
    <header ref={headerRef} className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
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

          {/* Compte connecté — sélecteur démo fonctionnel (profil / déconnexion) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-lg border bg-background px-1.5 py-1 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                aria-label="Menu du compte connecté"
              >
                {account ? (
                  <>
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: account.color }}
                      aria-hidden
                    >
                      {account.initials}
                    </span>
                    <span className="hidden max-w-[110px] truncate sm:inline">{account.name}</span>
                    <span className="hidden text-muted-foreground md:inline">· {ROLE_LABELS[account.role]}</span>
                  </>
                ) : (
                  <span className="px-1.5 py-1">Démo</span>
                )}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {account ? (
                <>
                  <DropdownMenuLabel className="flex items-center gap-3 py-2.5">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: account.color }}
                      aria-hidden
                    >
                      {account.initials}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{account.name}</span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">{account.email}</span>
                    </span>
                  </DropdownMenuLabel>
                  <div className="px-2 pb-2">
                    <Badge variant="outline" className="bg-emerald-50 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                      {ROLE_LABELS[account.role]} · {account.brandName}
                    </Badge>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Sélecteur démo — changer de profil
                  </DropdownMenuLabel>
                  {DEMO_ACCOUNTS.filter(a => a.id !== account.id).map(a => (
                    <DropdownMenuItem key={a.id} onSelect={() => switchProfile(a.id)} className="gap-3 py-2">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: a.color }}
                        aria-hidden
                      >
                        {a.initials}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">{a.name}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">{a.jobTitle} · {a.brandName}</span>
                      </span>
                      <Zap className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <div className="flex items-center justify-between px-2 py-1.5 text-[10px] text-muted-foreground">
                    <span>Démo v0.1 — données d&apos;illustration</span>
                  </div>
                  <DropdownMenuItem
                    onSelect={() => { logout(); toast.info("Vous êtes déconnecté", { description: "À bientôt sur CarbuScope." }) }}
                    className="gap-2 py-2 text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Se déconnecter
                  </DropdownMenuItem>
                </>
              ) : (
                <div className="p-2 text-sm text-muted-foreground">Aucun compte connecté.</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
