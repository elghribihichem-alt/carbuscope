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
import { Bell, Building2, LineChart, Smartphone, ShieldCheck, Crown, ChevronDown, ClipboardCheck, LogOut, Zap } from "lucide-react"
import { toast } from "sonner"
import { ThemeToggle } from "@/components/app/theme-toggle"
import { LangToggle } from "@/components/app/lang-toggle"
import { useI18n } from "@/lib/i18n"
import { useAppStore, ROLE_LABELS, type Mode, type Role } from "@/store/app-store"
import { DEMO_ACCOUNTS, DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"
import type { BrandDTO, AlertDTO } from "@/lib/types"
import { CarbuscopeLogo } from "./carbuscope-logo"

const MODES: { value: Mode; labelKey: "chrome.modeObservatoire" | "chrome.modePortail" | "chrome.modeMobile" | "chrome.modeAgents" | "chrome.modeBackoffice" | "chrome.modeSuperadmin"; icon: React.ComponentType<{ className?: string }>; superOnly?: boolean }[] = [
  { value: "observatoire", labelKey: "chrome.modeObservatoire", icon: LineChart },
  { value: "portail", labelKey: "chrome.modePortail", icon: Building2 },
  { value: "mobile", labelKey: "chrome.modeMobile", icon: Smartphone },
  { value: "agents", labelKey: "chrome.modeAgents", icon: ClipboardCheck },
  { value: "backoffice", labelKey: "chrome.modeBackoffice", icon: ShieldCheck },
  { value: "superadmin", labelKey: "chrome.modeSuperadmin", icon: Crown, superOnly: true },
]

const ROLES: Role[] = ["ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER"]

export function AppHeader() {
  const { mode, setMode, brandSlug, setBrandSlug, role, setRole, setTab, userId, login, logout } = useAppStore()
  const { t } = useI18n()
  const [brands, setBrands] = useState<BrandDTO[]>([])
  const [alerts, setAlerts] = useState<AlertDTO[]>([])
  const headerRef = useRef<HTMLElement>(null)
  const account = userId ? DEMO_ACCOUNTS_MAP[userId] : null
  // L'espace Super Administration est réservé au compte racine : le bouton
  // « Super Admin » du sélecteur de mode n'apparaît que pour ce profil.
  const isSuperAdmin = account?.isSuperAdmin === true

  /** Bascule vers un autre profil de démonstration (sélecteur démo). */
  function switchProfile(id: string) {
    const acc = DEMO_ACCOUNTS_MAP[id]
    if (!acc || id === userId) return
    login(id)
    toast.info(`${t('chrome.profileChanged')} : ${acc.name}`, {
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
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-[var(--c-line-2)] bg-[var(--c-paper)]/92 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        {/* Identité */}
        <div className="flex items-center gap-2.5">
          <CarbuscopeLogo size={36} />
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight text-[var(--c-ink-deep)]">Carbu<span className="text-[var(--c-brown)]">Scope</span></p>
            <p className="hidden text-[11px] text-[var(--c-ink-muted)] sm:block">{t('chrome.tagline')}</p>
          </div>
        </div>

        {/* Sélecteur de mode produit (Super Admin réservé au compte racine) */}
        <nav className="order-3 w-full sm:order-none sm:w-auto" aria-label={t('chrome.product')}>
          <div className="flex items-center gap-0.5 rounded-lg border border-[var(--c-line)] bg-[var(--c-tint)]/60 p-0.5">
            {MODES.filter(m => !m.superOnly || isSuperAdmin).map(m => {
              const label = t(m.labelKey)
              return (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                aria-label={label}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  mode === m.value
                    ? m.value === "superadmin"
                      ? "bg-[var(--c-coffee)] text-[var(--sidebar-foreground)] shadow-sm"
                      : "bg-[var(--c-paper)] text-[var(--c-ink-deep)] shadow-sm"
                    : "text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"
                }`}
                aria-pressed={mode === m.value}
                title={m.superOnly ? t('chrome.superadminHint') : undefined}
              >
                <m.icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{label}</span>
              </button>
              )
            })}
          </div>
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Enseigne connectée */}
          <div className="flex items-center gap-1.5">
            {currentBrand && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: currentBrand.color }} />}
            <Select value={brandSlug} onValueChange={setBrandSlug}>
              <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={t('chrome.brand')}>
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
            <SelectTrigger className="h-8 w-[160px] text-xs" aria-label={t('chrome.role')}>
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
              <Button variant="outline" size="icon" className="relative h-8 w-8" aria-label={t('chrome.alerts')}>
                <Bell className="h-4 w-4" />
                {critical > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--c-terra)] px-1 text-[10px] font-bold text-white">
                    {critical}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="border-b border-[var(--c-line-faint)] px-3 py-2 text-sm font-semibold text-[var(--c-ink-deep)]">{t('chrome.alertsRecent')}</div>
              <div className="max-h-80 overflow-y-auto scroll-coffee">
                {alerts.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">{t('chrome.alertsEmpty')}</p>}
                {alerts.slice(0, 5).map(a => (
                  <button key={a.id} className="block w-full border-b border-[var(--c-line-faint)] px-3 py-2 text-left hover:bg-[var(--c-tint)]"
                    onClick={() => { setMode("observatoire"); setTab("veille") }}>
                    <p className="flex items-center gap-2 text-xs font-medium text-[var(--c-ink)]">
                      <span className={`h-1.5 w-1.5 rounded-full ${a.severity === "CRITICAL" ? "bg-[var(--c-terra)]" : a.severity === "MEDIUM" ? "bg-[var(--c-amber)]" : "bg-[var(--c-green)]"}`} />
                      {a.title}
                    </p>
                    <p className="mt-0.5 pl-3.5 text-[11px] text-[var(--c-ink-muted)]">{a.gouvernorat} · {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(a.date))}</p>
                  </button>
                ))}
              </div>
              <button className="w-full px-3 py-2 text-center text-xs font-medium text-[var(--c-brown)] hover:bg-[var(--c-tint)]"
                onClick={() => { setMode("observatoire"); setTab("veille") }}>
                {t('chrome.alertsAll')}
              </button>
            </PopoverContent>
          </Popover>

          {/* Langue (FR · العربية · EN) */}
          <LangToggle />

          {/* Thème (4 thèmes café) */}
          <ThemeToggle />

          {/* Compte connecté — sélecteur démo fonctionnel (profil / déconnexion) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-lg border border-[var(--c-line-2)] bg-[var(--c-paper)] px-1.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--c-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-brown)]/60"
                aria-label={t('chrome.account')}
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
                    <span className="hidden text-[var(--c-ink-muted)] md:inline">· {ROLE_LABELS[account.role]}</span>
                  </>
                ) : (
                  <span className="px-1.5 py-1">{t('chrome.demo')}</span>
                )}
                <ChevronDown className="h-3.5 w-3.5 text-[var(--c-ink-muted)]" aria-hidden />
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
                    <Badge variant="outline" className="bg-[var(--a-em-50)] text-[10px] font-medium text-[var(--a-em-700)] dark:bg-[var(--a-em-950)] dark:text-[var(--a-em-400)]">
                      {ROLE_LABELS[account.role]} · {account.brandName}
                    </Badge>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-[var(--c-ink-muted)]">
                    {t('chrome.demoSwitch')}
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
                      <Zap className="h-3 w-3 shrink-0 text-[var(--c-amber)]" aria-hidden />
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <div className="flex items-center justify-between px-2 py-1.5 text-[10px] text-[var(--c-ink-muted)]">
                    <span>{t('chrome.demoVersion')}</span>
                  </div>
                  <DropdownMenuItem
                    onSelect={() => { logout(); toast.info(t('chrome.logoutToastTitle'), { description: t('chrome.logoutToastDesc') }) }}
                    className="gap-2 py-2 text-[var(--c-terra)] focus:text-[var(--c-terra)]"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    {t('chrome.logout')}
                  </DropdownMenuItem>
                </>
              ) : (
                <div className="p-2 text-sm text-muted-foreground">{t('chrome.noAccount')}</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
