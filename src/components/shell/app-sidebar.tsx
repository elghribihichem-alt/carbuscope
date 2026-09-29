'use client'

// CarbuScope — T46 : Sidebar verticale « menus & sous-menus en accordéon ».
// Remplace les barres d'onglets horizontales (TabNav de l'observatoire +
// navigations internes des modules Portail / Shadow / Super Admin /
// Back-office). L'en-tête reste figé en haut de page ; la sidebar se colle
// sous lui, défile indépendamment et se replie en rail d'icônes.
// Mobile : panneau Sheet (déclenché par le bouton menu de l'en-tête).

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  LayoutDashboard, Map, Fuel, Banknote, Radar, Crosshair, Target, Calculator, Users, FileText,
  Settings, Lock, MapPinPlus, Clock, GitCompareArrows, Swords, Star, Store, PlugZap, Footprints,
  ShieldCheck, ClipboardList, Eye, BarChart3, TriangleAlert, Trophy, CalendarDays, Globe, MapPin,
  Route, Plus, List, RefreshCw, CircleCheck, Camera, TrendingDown, Landmark, Scale, TrendingUp,
  SlidersHorizontal, Building2, CalendarRange, Share2, KeyRound, Ruler, Tags, Bell,
  FileSignature, Layers, Receipt, UsersRound, Bot, MapPinned, ScrollText, Database, TimerReset,
  UserCog, ShieldAlert, Tag, Gift, UserRound, GitCompare, LogIn, Home, ChevronRight,
  PanelLeftClose, PanelLeftOpen, Search, LineChart, Building, Smartphone, ClipboardCheck,
  Crown, Ghost,
} from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useAppStore, TAB_ACCESS, SHADOW_MODULE_ROLES, PLATFORM_MODULE_ROLES, type Mode, type Tab } from "@/store/app-store"
import { useI18n, type DictKey } from "@/lib/i18n"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"
import { CALC_DEFS } from "@/components/calculators/calc-shared"
import { CarbuscopeLogo } from "./carbuscope-logo"

// ---------------------------------------------------------------------------
// Types du menu
// ---------------------------------------------------------------------------

type IconType = React.ComponentType<{ className?: string }>

interface NavChild {
  id: string
  icon: IconType
  label: string
  onSelect: () => void
  active: boolean
}

interface NavItem {
  id: string
  icon: IconType
  label: string
  onSelect: () => void
  active: boolean
  locked?: boolean
  /** Badge numérique (ex. file de modération, missions ouvertes). */
  badge?: number | null
  badgeTone?: "danger" | "accent"
  /** Sous-menu en accordéon : clé du store nav + enfants. */
  children?: NavChild[]
}

interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

interface MenuModel {
  title: string
  icon: IconType
  groups: NavGroup[]
}

/** Défauts de sous-navigation (contrat partagé avec les vues : nav[key] ?? défaut). */
export const NAV_DEFAULTS: Record<string, string> = {
  /** T50 — module actif de l'espace enseigne fusionné. */
  espace: "observatoire",
  portail: "dashboard",
  "portal-terrain": "missions",
  shadow: "overview",
  "shadow-overview": "kpis",
  "shadow-cartography": "national",
  "shadow-recensement": "nouveau",
  "shadow-impact": "station",
  "shadow-reports": "monthly",
  "shadow-settings": "access",
  superadmin: "overview",
  backoffice: "moderation",
  implantation: "zones",
  calculators: "trafic",
  mobile: "map",
  agents: "agent-login",
}

// ---------------------------------------------------------------------------
// Construction du menu selon le mode produit
// ---------------------------------------------------------------------------

function useMenu(mode: Mode): MenuModel {
  const { t } = useI18n()
  const tab = useAppStore(s => s.tab)
  const role = useAppStore(s => s.role)
  const userId = useAppStore(s => s.userId)
  const nav = useAppStore(s => s.nav)
  const setTab = useAppStore(s => s.setTab)
  const setNav = useAppStore(s => s.setNav)
  const setMobileNavOpen = useAppStore(s => s.setMobileNavOpen)

  const closeMobile = React.useCallback(() => setMobileNavOpen(false), [setMobileNavOpen])
  const cur = React.useCallback((key: string) => nav[key] ?? NAV_DEFAULTS[key] ?? "", [nav])

  // Onglet Démographie conditionnel (T37) : visible si le compte démo connecté
  // dispose d'un accès démographie (sonde /api/demographie/acces).
  // L'accès n'est écrit que dans les callbacks asynchrones (règle
  // react-hooks/set-state-in-effect) ; l'absence d'e-mail dérive `false`.
  const email = userId ? DEMO_ACCOUNTS_MAP[userId]?.email ?? null : null
  const [demographieAccess, setDemographieAccess] = useState(false)
  useEffect(() => {
    if (!email) return
    let alive = true
    fetch(`/api/demographie/acces?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(j => { if (alive) setDemographieAccess(Boolean(j?.access)) })
      .catch(() => {})
    return () => { alive = false }
  }, [email])
  const hasDemographie = email !== null && demographieAccess

  // Badges du back-office (file de modération + missions ouvertes) — écrits
  // uniquement dans les callbacks asynchrones ; hors mode back-office les
  // badges ne sont simplement pas rendus par le menu.
  const [boPending, setBoPending] = useState<number | null>(null)
  const [boMissions, setBoMissions] = useState<number | null>(null)
  useEffect(() => {
    // T50 : les badges back-office sont chargés dès l'espace enseigne (le
    // groupe G7 y est rendu), plus seulement dans l'ancien mode back-office.
    if (mode !== "portail") return
    let alive = true
    fetch("/api/contributions?status=PENDING&limit=50")
      .then(r => r.json())
      .then(j => { if (alive) setBoPending((j.contributions ?? []).length) })
      .catch(() => {})
    fetch("/api/missions")
      .then(r => r.json())
      .then(j => {
        if (!alive) return
        setBoMissions((j.missions ?? []).filter((m: { status: string }) => m.status === "PLANIFIEE" || m.status === "EN_COURS").length)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [mode])

  return useMemo(() => {
    // -- helpers -------------------------------------------------------------
    const leaf = (
      id: string, icon: IconType, label: string,
      active: boolean, onSelect: () => void, extra?: Partial<NavItem>,
    ): NavItem => ({ id, icon, label, active, onSelect, ...extra })

    const branch = (
      id: string, icon: IconType, label: string,
      parentActive: boolean, parentSelect: () => void,
      navKey: string, children: { id: string; icon: IconType; label: string }[],
      locked?: boolean,
    ): NavItem => ({
      id, icon, label, active: parentActive, locked,
      onSelect: parentSelect,
      children: children.map(c => ({
        id: c.id,
        icon: c.icon,
        label: c.label,
        active: parentActive && cur(navKey) === c.id,
        onSelect: () => {
          if (locked) return
          parentSelect()
          setNav(navKey, c.id)
          closeMobile()
        },
      })),
    })

    // -- ESPACE ENSEIGNE FUSIONNÉ (T50 — blueprint 8 groupes) -------------------
    // Un seul espace « portail » embarque : observatoire (G1, G2, G5, G8),
    // portail enseigne (G3), veille terrain + agents (G4), Shadow Market (G6),
    // back-office plateforme (G7). Le module actif est porté par nav.espace.
    if (mode === "portail") {
      const espace = cur("espace")
      const locked = (tb: Tab) => !TAB_ACCESS[tb].includes(role)
      const allowed = (tb: Tab) => !locked(tb)
      const go = (tb: Tab) => () => { setNav("espace", "observatoire"); setTab(tb); closeMobile() }

      const obsTab = (tb: Tab, icon: IconType, labelKey: DictKey): NavItem =>
        leaf(tb, icon, t(labelKey), espace === "observatoire" && tab === tb, allowed(tb) ? go(tb) : () => {}, { locked: locked(tb) })

      const obsBranch = (
        tb: Tab, icon: IconType, labelKey: DictKey, navKey: string,
        children: { id: string; icon: IconType; label: string }[],
      ): NavItem => {
        const isLocked = locked(tb)
        const select = () => { if (!isLocked) { setNav("espace", "observatoire"); setTab(tb); closeMobile() } }
        return branch(tb, icon, t(labelKey), espace === "observatoire" && tab === tb && !isLocked, select, navKey, children, isLocked)
      }

      // G3 — onglets internes du Portail enseigne.
      const pTab = (id: string, icon: IconType, label: string): NavItem =>
        leaf(id, icon, label, espace === "portail" && cur("portail") === id, () => { setNav("espace", "portail"); setNav("portail", id); closeMobile() })

      // G6 — sections Shadow Market (accordéons).
      const sBranch = (
        id: string, icon: IconType, label: string,
        children: { id: string; icon: IconType; label: string }[],
      ): NavItem =>
        branch(
          id, icon, label, espace === "shadow" && cur("shadow") === id,
          () => { setNav("espace", "shadow"); setNav("shadow", id); closeMobile() },
          `shadow-${id}`, children,
        )

      // G7 — outils du back-office plateforme.
      const boItem = (id: string, icon: IconType, label: string, extra?: Partial<NavItem>): NavItem =>
        leaf(id, icon, label, espace === "backoffice" && cur("backoffice") === id, () => { setNav("espace", "backoffice"); setNav("backoffice", id); closeMobile() }, extra)

      const analyseItems: NavItem[] = [
        obsTab("competition", Crosshair, "rm.tabs.competition"),
        obsBranch("implantation", Target, "rm.tabs.implantation", "implantation", [
          { id: "zones", icon: MapPinPlus, label: t("sb.sub.implantation.zones") },
          { id: "isochrones", icon: Clock, label: t("sb.sub.implantation.isochrones") },
          { id: "comparateur", icon: GitCompareArrows, label: t("sb.sub.implantation.comparateur") },
          { id: "cannibalisation", icon: Swords, label: t("sb.sub.implantation.cannibalisation") },
        ]),
        obsBranch("calculators", Calculator, "rm.tabs.calculators", "calculators",
          CALC_DEFS.map(def => ({
            id: def.id,
            icon: def.icon,
            label: t(`sb.sub.calculators.${def.id}` as DictKey),
          })),
        ),
      ]
      if (hasDemographie && email) {
        analyseItems.push(obsTab("demographie", Users, "rm.tabs.demographie"))
      }

      // Blueprint 8 groupes — G6 et G7 sont conditionnés aux rôles (T50).
      const groups: NavGroup[] = [
        {
          id: "f-pilotage", label: t("sb.groups.pilotage"), items: [
            obsTab("dashboard", LayoutDashboard, "rm.tabs.dashboard"),
            obsTab("map", Map, "rm.tabs.map"),
          ],
        },
        {
          id: "f-reseau", label: t("sb.groups.reseau"), items: [
            obsTab("stations", Fuel, "rm.tabs.stations"),
            obsTab("prices", Banknote, "rm.tabs.prices"),
            obsTab("veille", Radar, "rm.tabs.veille"),
          ],
        },
        {
          id: "f-enseigne", label: "Espace enseigne", items: [
            pTab("dashboard", LayoutDashboard, "Tableau de bord enseigne"),
            pTab("stations", Store, "Mes stations"),
            pTab("reviews", Star, "Avis & réputation"),
            pTab("api", PlugZap, "API & promotions"),
          ],
        },
        {
          id: "f-terrain", label: "Veille terrain", items: [
            branch(
              "terrain", Footprints, "Missions terrain",
              espace === "portail" && cur("portail") === "terrain",
              () => { setNav("espace", "portail"); setNav("portail", "terrain"); closeMobile() },
              "portal-terrain", [
                { id: "missions", icon: ClipboardList, label: "Mes missions" },
                { id: "own", icon: ShieldCheck, label: "Fiche propriétaire" },
                { id: "competitors", icon: Eye, label: "Fiches concurrents" },
              ],
            ),
            leaf("agents", Smartphone, "Application agents terrain", espace === "agents", () => { setNav("espace", "agents"); closeMobile() }),
          ],
        },
        { id: "f-analyse", label: t("sb.groups.analyse"), items: analyseItems },
      ]

      if (SHADOW_MODULE_ROLES.includes(role)) {
        groups.push({
          id: "f-shadow", label: "Shadow Market", items: [
            sBranch("overview", BarChart3, "Vue d'Ensemble", [
              { id: "kpis", icon: BarChart3, label: "Indicateurs Clés" },
              { id: "alerts", icon: TriangleAlert, label: "Alertes" },
              { id: "top", icon: Trophy, label: "Top 10 Menaces" },
              { id: "calendar", icon: CalendarDays, label: "Calendrier" },
            ]),
            sBranch("cartography", Map, "Cartographie", [
              { id: "national", icon: Globe, label: "Carte Nationale" },
              { id: "district", icon: Target, label: "Par District" },
              { id: "station", icon: MapPin, label: "Par Station" },
              { id: "road", icon: Route, label: "Par Axe Routier" },
              { id: "redzones", icon: TriangleAlert, label: "Zones Rouges" },
            ]),
            sBranch("recensement", ClipboardList, "Recensement", [
              { id: "nouveau", icon: Plus, label: "Nouveau Point" },
              { id: "liste", icon: List, label: "Liste des Points" },
              { id: "maj", icon: RefreshCw, label: "Mises à Jour" },
              { id: "audit", icon: Users, label: "Équipe d'Audit" },
              { id: "validation", icon: CircleCheck, label: "Validation" },
              { id: "galerie", icon: Camera, label: "Galerie Photos" },
            ]),
            sBranch("impact", TrendingDown, "Analyse d'Impact", [
              { id: "station", icon: Landmark, label: "Perte par Station" },
              { id: "region", icon: Map, label: "Perte par Région" },
              { id: "cannibalisation", icon: Scale, label: "Cannibalisation" },
              { id: "tendance", icon: TrendingUp, label: "Tendance" },
              { id: "simulation", icon: SlidersHorizontal, label: "Simulation" },
            ]),
            sBranch("reports", FileText, "Rapports", [
              { id: "monthly", icon: CalendarDays, label: "Rapport Mensuel" },
              { id: "brand", icon: Building2, label: "Rapport par Enseigne" },
              { id: "custom", icon: CalendarRange, label: "Rapport Personnalisé" },
              { id: "export", icon: Share2, label: "Export / Partage" },
            ]),
            sBranch("settings", Settings, "Paramètres", [
              { id: "access", icon: KeyRound, label: "Accès & Droits" },
              { id: "radii", icon: Ruler, label: "Rayons & Seuils" },
              { id: "typologies", icon: Tags, label: "Typologies" },
              { id: "notifications", icon: Bell, label: "Notifications" },
            ]),
          ],
        })
      }

      if (PLATFORM_MODULE_ROLES.includes(role)) {
        groups.push({
          id: "f-backoffice", label: "Back-office plateforme", items: [
            boItem("moderation", ShieldAlert, "Modération", { badge: boPending, badgeTone: "danger" }),
            boItem("sovereign", Database, "Données souveraines"),
            boItem("freshness", TimerReset, "Fraîcheur"),
            boItem("agents", UserCog, "Agents terrain"),
            boItem("alerts", Radar, "Veille & alertes"),
            boItem("stats", BarChart3, "Stats plateforme"),
            boItem("decrees", Banknote, "Prix & décrets"),
            boItem("missions", ClipboardList, "Missions", { badge: boMissions, badgeTone: "accent" }),
          ],
        })
      }

      groups.push({
        id: "f-gestion", label: t("sb.groups.gestion"), items: [
          obsTab("reports", FileText, "rm.tabs.reports"),
          obsTab("settings", Settings, "rm.tabs.settings"),
        ],
      })

      return {
        title: t("chrome.modePortail"),
        icon: Building,
        groups,
      }
    }

    // -- SUPER ADMIN ------------------------------------------------------------
    if (mode === "superadmin") {
      const saItem = (id: string, icon: IconType, label: string): NavItem =>
        leaf(id, icon, label, cur("superadmin") === id, () => { setNav("superadmin", id); closeMobile() })
      return {
        title: t("chrome.modeSuperadmin"),
        icon: Crown,
        groups: [{
          id: "superadmin", label: "Super Administration", items: [
            saItem("overview", LayoutDashboard, "Vue d'ensemble"),
            saItem("contracts", FileSignature, "Enseignes & contrats"),
            saItem("plans", Layers, "Plans & tarifs"),
            saItem("invoices", Receipt, "Facturation"),
            saItem("users", UsersRound, "Utilisateurs"),
            saItem("demo", BarChart3, "Démographie"),
            saItem("ai", Bot, "Agent IA"),
            saItem("carto", MapPinned, "Cartographie"),
            saItem("audit", ScrollText, "Journal d'audit"),
          ],
        }],
      }
    }

    // -- MOBILE B2C (aperçu téléphone) ------------------------------------------
    if (mode === "mobile") {
      const mItem = (id: string, icon: IconType, label: string): NavItem =>
        leaf(id, icon, label, cur("mobile") === id, () => { setNav("mobile", id); closeMobile() })
      return {
        title: t("chrome.modeMobile"),
        icon: Smartphone,
        groups: [{
          id: "mobile", label: t("sb.mobile.title"), items: [
            mItem("map", Map, "Carte"),
            mItem("search", Search, "Recherche"),
            mItem("promos", Tag, "Promotions"),
            mItem("fidelite", Gift, "Fidélité"),
            mItem("alertes", Bell, "Alertes"),
            mItem("comparateur", GitCompare, "Comparer"),
            mItem("profil", UserRound, "Profil"),
          ],
        }],
      }
    }

    // Repli défensif (union exhaustive : portail | mobile | superadmin) —
    // rend un menu vide plutôt qu'un crash si un mode inconnu apparaissait.
    return { title: t("chrome.modePortail"), icon: Building, groups: [] }
  }, [mode, tab, role, nav, hasDemographie, email, boPending, boMissions, t, setTab, setNav, closeMobile, cur])
}

// ---------------------------------------------------------------------------
// Rangée de menu (feuille ou accordéon) — version dépliée
// ---------------------------------------------------------------------------

function NavRow({
  item, open, onToggleOpen, dir,
}: {
  item: NavItem
  open: boolean
  onToggleOpen: () => void
  dir: string
}) {
  const { t } = useI18n()
  const hasChildren = (item.children?.length ?? 0) > 0

  const btn = (
    <button
      type="button"
      onClick={() => {
        if (item.locked) return
        item.onSelect()
        if (hasChildren) onToggleOpen()
      }}
      disabled={item.locked}
      aria-current={item.active ? "page" : undefined}
      aria-expanded={hasChildren ? open : undefined}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
        item.locked
          ? "cursor-not-allowed text-[var(--c-ink-ghost)]"
          : item.active
            ? "bg-[var(--c-brown)] text-[var(--primary-foreground)] shadow-sm"
            : "text-[var(--c-ink)] hover:bg-[var(--c-tint)]",
      )}
    >
      {item.locked ? (
        <Lock className="h-[17px] w-[17px] shrink-0" aria-hidden />
      ) : (
        <item.icon className="h-[17px] w-[17px] shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate text-start">{item.label}</span>
      {item.badge != null && item.badge > 0 && (
        <span
          className={cn(
            "flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums",
            item.badgeTone === "danger"
              ? "bg-[var(--c-terra)] text-white"
              : "bg-[var(--c-amber)]/25 text-[var(--c-amber)]",
            item.active && "ring-1 ring-white/40",
          )}
        >
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
      {hasChildren && (
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : dir === "rtl" ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden
        />
      )}
    </button>
  )

  return (
    <li>
      {item.locked ? (
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="right">
            <p>{t("sb.lockedHint")}</p>
            <p className="text-[11px] text-muted-foreground">{t("sb.lockedChange")}</p>
          </TooltipContent>
        </Tooltip>
      ) : btn}
      <AnimatePresence initial={false}>
        {open && hasChildren && (
          <motion.div
            key="submenu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <ul className="mx-3 my-1 space-y-0.5 border-s border-[var(--c-line)] ps-2">
              {item.children!.map(child => (
                <li key={child.id}>
                  <button
                    type="button"
                    onClick={child.onSelect}
                    disabled={item.locked}
                    aria-current={child.active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                      item.locked
                        ? "cursor-not-allowed text-[var(--c-ink-ghost)]"
                        : child.active
                          ? "bg-[var(--c-brown)]/12 font-semibold text-[var(--c-brown)]"
                          : "text-[var(--c-ink-muted)] hover:bg-[var(--c-tint)] hover:text-[var(--c-ink)]",
                    )}
                  >
                    <child.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 truncate text-start">{child.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Contenu de navigation (desktop déplié + Sheet mobile partagent ce rendu)
// ---------------------------------------------------------------------------

function SidebarGroups({
  menu, openMap, onToggleOpen, dir,
}: {
  menu: MenuModel
  openMap: Record<string, boolean>
  onToggleOpen: (id: string) => void
  dir: string
}) {
  return (
    <>
      {menu.groups.map(group => (
        <div key={group.id}>
          <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--c-ink-ghost)]">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map(item => (
              <NavRow
                key={item.id}
                item={item}
                open={openMap[item.id] ?? item.active}
                onToggleOpen={() => onToggleOpen(item.id)}
                dir={dir}
              />
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export function AppSidebar({ mode }: { mode: Mode }) {
  const { t, dir } = useI18n()
  const menu = useMenu(mode)
  const collapsed = useAppStore(s => s.sidebarCollapsed)
  const setSidebarCollapsed = useAppStore(s => s.setSidebarCollapsed)
  const mobileNavOpen = useAppStore(s => s.mobileNavOpen)
  const setMobileNavOpen = useAppStore(s => s.setMobileNavOpen)
  const setNav = useAppStore(s => s.setNav)

  // Accordéon : ouvert si contient l'élément actif, sauf fermeture manuelle.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({})
  const toggleOpen = (id: string) => {
    setOpenMap(m => {
      const current = m[id] ?? menu.groups.flatMap(g => g.items).find(i => i.id === id)?.active ?? false
      return { ...m, [id]: !current }
    })
  }

  // Raccourci clavier Ctrl/Cmd + B : replie/déplie la sidebar (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault()
        setSidebarCollapsed(!collapsed)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [collapsed, setSidebarCollapsed])

  // Les aperçus mobiles (maquette téléphone + colonnes marketing) gardent de
  // la place : leur sidebar n'apparaît qu'à partir de xl. T50 : l'aperçu
  // agents terrain vit dans l'espace enseigne (nav.espace === "agents").
  const espaceAgents = useAppStore(s => (s.nav.espace ?? NAV_DEFAULTS.espace) === "agents")
  const isPreviewMode = mode === "mobile" || (mode === "portail" && espaceAgents)
  const desktopVisibility = isPreviewMode ? "xl:flex" : "md:flex"

  const ModeIcon = menu.icon

  // Rail replié : aplatissement des groupes en pile d'icônes + séparateurs.
  const flatItems = menu.groups.flatMap((g, gi) =>
    g.items.map(item => ({ item, groupIndex: gi })))

  const railSelect = (item: NavItem) => {
    if (item.locked) return
    // Déplie la sidebar et ouvre l'accordéon du parent avant de naviguer.
    if (item.children?.length) {
      setSidebarCollapsed(false)
      setOpenMap(m => ({ ...m, [item.id]: true }))
    }
    item.onSelect()
  }

  return (
    <>
      {/* ---------- Desktop : colonne sticky sous l'en-tête ---------- */}
      <aside
        className={cn(
          "sticky top-[var(--cs-header-h,57px)] hidden shrink-0 flex-col self-start border-e border-[var(--c-line)] bg-[var(--c-paper)] transition-[width] duration-200",
          desktopVisibility,
          collapsed ? "w-16" : "w-[264px]",
        )}
        style={{ height: "calc(100dvh - var(--cs-header-h, 57px))" }}
        aria-label={`${menu.title} — ${t("sb.title")}`}
      >
        {collapsed ? (
          <>
            <div className="flex items-center justify-center pt-2.5">
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                aria-label={t("sb.expand")}
                title={t("sb.expand")}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--c-ink-muted)] transition-colors hover:bg-[var(--c-tint)] hover:text-[var(--c-ink)]"
              >
                <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden />
              </button>
            </div>
            <TooltipProvider delayDuration={150}>
              <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-2 scroll-coffee">
                {flatItems.map(({ item, groupIndex }, i) => (
                  <React.Fragment key={item.id}>
                    {i > 0 && flatItems[i - 1].groupIndex !== groupIndex && (
                      <span className="my-1 h-px w-8 shrink-0 bg-[var(--c-line)]" aria-hidden />
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => railSelect(item)}
                          disabled={item.locked}
                          aria-current={item.active ? "page" : undefined}
                          className={cn(
                            "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                            item.locked
                              ? "cursor-not-allowed text-[var(--c-ink-ghost)]"
                              : item.active
                                ? "bg-[var(--c-brown)] text-[var(--primary-foreground)] shadow-sm"
                                : "text-[var(--c-ink-muted)] hover:bg-[var(--c-tint)] hover:text-[var(--c-ink)]",
                          )}
                        >
                          {item.locked ? <Lock className="h-4 w-4" aria-hidden /> : <item.icon className="h-[18px] w-[18px]" aria-hidden />}
                          {item.badge != null && item.badge > 0 && (
                            <span
                              className={cn(
                                "absolute right-1 top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-[3px] text-[9px] font-bold tabular-nums",
                                item.badgeTone === "danger" ? "bg-[var(--c-terra)] text-white" : "bg-[var(--c-amber)] text-white",
                              )}
                            >
                              {item.badge > 99 ? "99" : item.badge}
                            </span>
                          )}
                          {item.children?.length && !item.locked ? (
                            <span className="absolute bottom-1 right-1 h-1 w-1 rounded-full bg-current opacity-50" aria-hidden />
                          ) : null}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side={dir === "rtl" ? "left" : "right"}>
                        <p className="font-medium">{item.label}</p>
                        {item.children?.length ? (
                          <p className="text-[11px] text-muted-foreground">{item.children.length} sous-sections</p>
                        ) : null}
                        {item.locked ? <p className="text-[11px] text-muted-foreground">{t("sb.lockedHint")}</p> : null}
                      </TooltipContent>
                    </Tooltip>
                  </React.Fragment>
                ))}
              </nav>
            </TooltipProvider>
          </>
        ) : (
          <>
            {/* En-tête de la colonne : espace produit courant */}
            <div className="flex items-center gap-2.5 border-b border-[var(--c-line-faint)] px-4 pb-3 pt-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--c-tint)] text-[var(--c-brown)]">
                <ModeIcon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-bold text-[var(--c-ink-deep)]">{menu.title}</p>
                <p className="text-[10.5px] text-[var(--c-ink-muted)]">{t("sb.title")}</p>
              </div>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                aria-label={t("sb.collapse")}
                title={`${t("sb.collapse")} (Ctrl+B)`}
                className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--c-ink-muted)] transition-colors hover:bg-[var(--c-tint)] hover:text-[var(--c-ink)]"
              >
                <PanelLeftClose className="h-[17px] w-[17px]" aria-hidden />
              </button>
            </div>

            <TooltipProvider delayDuration={200}>
              <nav className="flex-1 overflow-y-auto px-2 pb-4 scroll-coffee" aria-label={t("sb.title")}>
                <SidebarGroups menu={menu} openMap={openMap} onToggleOpen={toggleOpen} dir={dir} />
              </nav>
            </TooltipProvider>

            <div className="border-t border-[var(--c-line-faint)] px-3 py-2">
              <p className="flex items-center gap-1.5 text-[10px] text-[var(--c-ink-ghost)]">
                <CarbuscopeLogo size={16} />
                <span className="truncate">CarbuScope · v0.1</span>
              </p>
            </div>
          </>
        )}
      </aside>

      {/* ---------- Mobile : panneau coulissant (Sheet) ---------- */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side={dir === "rtl" ? "right" : "left"}
          className="w-[280px] gap-0 border-[var(--c-line)] bg-[var(--c-paper)] p-0"
        >
          <SheetHeader className="border-b border-[var(--c-line-faint)] px-4 py-3 text-start">
            <SheetTitle className="flex items-center gap-2.5 text-[13px] font-bold text-[var(--c-ink-deep)]">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--c-tint)] text-[var(--c-brown)]">
                <ModeIcon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate">{menu.title}</span>
                <span className="block text-[10.5px] font-medium text-[var(--c-ink-muted)]">{t("sb.title")}</span>
              </span>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-2 py-2 scroll-coffee">
            <TooltipProvider delayDuration={200}>
              <SidebarGroups
                menu={menu}
                openMap={openMap}
                onToggleOpen={toggleOpen}
                dir={dir}
              />
            </TooltipProvider>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
