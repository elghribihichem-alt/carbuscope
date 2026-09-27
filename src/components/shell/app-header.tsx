'use client'

import * as React from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Bell, Building2, LineChart, Smartphone, ShieldCheck, Crown, ClipboardCheck, Ghost } from "lucide-react"
import { ThemeToggle } from "@/components/app/theme-toggle"
import { LangToggle } from "@/components/app/lang-toggle"
import { UserMenu } from "@/components/auth/user-menu"
import { useI18n } from "@/lib/i18n"
import { useAppStore, type Mode } from "@/store/app-store"
import type { BrandDTO, AlertDTO } from "@/lib/types"
import { CarbuscopeLogo } from "./carbuscope-logo"

const MODES: { value: Mode; labelKey: "chrome.modeObservatoire" | "chrome.modePortail" | "chrome.modeMobile" | "chrome.modeAgents" | "chrome.modeBackoffice" | "chrome.modeSuperadmin" | "chrome.modeShadow"; icon: React.ComponentType<{ className?: string }>; superOnly?: boolean }[] = [
  { value: "observatoire", labelKey: "chrome.modeObservatoire", icon: LineChart },
  { value: "portail", labelKey: "chrome.modePortail", icon: Building2 },
  { value: "mobile", labelKey: "chrome.modeMobile", icon: Smartphone },
  { value: "agents", labelKey: "chrome.modeAgents", icon: ClipboardCheck },
  { value: "backoffice", labelKey: "chrome.modeBackoffice", icon: ShieldCheck },
  { value: "shadow", labelKey: "chrome.modeShadow", icon: Ghost },
  { value: "superadmin", labelKey: "chrome.modeSuperadmin", icon: Crown, superOnly: true },
]

export function AppHeader() {
  const { mode, setMode, brandSlug, setBrandSlug, setTab, session } = useAppStore()
  const { t } = useI18n()
  const [brands, setBrands] = useState<BrandDTO[]>([])
  const [alerts, setAlerts] = useState<AlertDTO[]>([])
  const headerRef = useRef<HTMLElement>(null)
  // L'espace Super Administration est réservé au compte racine : le bouton
  // « Super Admin » du sélecteur de mode n'apparaît que pour ce profil.
  const isSuperAdmin = session?.role === "SUPER_ADMIN"

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

          {/* Compte connecté — V7 : profil de session, sécurité 2FA, changement de compte, déconnexion */}
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
