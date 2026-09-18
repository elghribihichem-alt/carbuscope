'use client'

// CarbuScope Mobile — cœur applicatif : mini-routeur d'état, chargement des données
// (fetch unique /api/brands + /api/stations?status=ACTIVE&limit=1500), fiche en lazy,
// barre d'onglets (5 onglets) et transitions framer-motion.

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Fuel, Gift, Map, Search, Tag, UserRound } from "lucide-react"
import { toast } from "sonner"
import { haversineKm } from "@/lib/geo"
import { useI18n } from "@/lib/i18n"
import type { BrandDTO, StationDTO, StationDetail } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { AppApi, Screen, StationWithDist, UserStats } from "./shared"
import { USER_POS } from "./shared"
import { MapScreen } from "./screens/map-screen"
import { SearchScreen } from "./screens/search-screen"
import { StationScreen } from "./screens/station-screen"
import { ReportScreen } from "./screens/report-screen"
import { ReviewScreen } from "./screens/review-screen"
import { PromosScreen } from "./screens/promos-screen"
import { LoyaltyScreen } from "./screens/loyalty-screen"
import { ProfileScreen } from "./screens/profile-screen"
import { AlertsScreen } from "./screens/alerts-screen"
import type { DictKey } from "@/lib/i18n"

const TABS: { id: Screen; labelKey: DictKey; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { id: "map", labelKey: "tab.map", icon: Map },
  { id: "search", labelKey: "tab.search", icon: Search },
  { id: "promos", labelKey: "tab.promos", icon: Tag },
  { id: "fidelite", labelKey: "tab.fidelite", icon: Gift },
  { id: "profil", labelKey: "tab.profil", icon: UserRound },
]

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

/** Écran de démarrage (splash) pendant le chargement initial */
function SplashScreen() {
  const { t } = useI18n()
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-4 bg-gradient-to-b from-emerald-600 to-emerald-800 text-white">
      <motion.div
        animate={{ scale: [1, 1.07, 1] }}
        transition={{ repeat: Infinity, duration: 1.6 }}
        className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 ring-1 ring-white/30 backdrop-blur-sm"
      >
        <Fuel className="h-10 w-10" />
      </motion.div>
      <div className="text-center">
        <p className="text-xl font-extrabold tracking-tight">CarbuScope</p>
        <p className="text-[12px] text-emerald-100">{t("splash.tagline")}</p>
      </div>
      <div className="h-1 w-36 overflow-hidden rounded-full bg-white/20">
        <motion.div
          className="h-full w-1/2 rounded-full bg-white"
          animate={{ x: ["-110%", "230%"] }}
          transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
        />
      </div>
      <p className="absolute bottom-8 text-[10px] text-emerald-100/80">{t("splash.loading")}</p>
    </div>
  )
}

function TabBar({ active, onSelect }: { active: Screen; onSelect: (s: Screen) => void }) {
  const { t } = useI18n()
  return (
    <nav aria-label="Navigation principale" className="z-20 flex h-[62px] shrink-0 items-stretch border-t border-slate-200 bg-white/95 pb-1.5 backdrop-blur-md">
      {TABS.map(tab => {
        const Icon = tab.icon
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            aria-current={isActive ? "page" : undefined}
            className="relative flex flex-1 flex-col items-center justify-center gap-[3px] pt-1 outline-none transition-transform active:scale-95"
          >
            {isActive && <motion.span layoutId="tab-indicator" className="absolute top-0 h-[3px] w-9 rounded-full bg-emerald-500" />}
            <Icon className={cn("h-[21px] w-[21px]", isActive ? "text-emerald-600" : "text-slate-400")} strokeWidth={isActive ? 2.3 : 1.9} />
            <span className={cn("text-[9.5px] leading-none", isActive ? "font-bold text-emerald-700" : "font-medium text-slate-400")}>{t(tab.labelKey)}</span>
          </button>
        )
      })}
    </nav>
  )
}

export function MobileApp() {
  const { t, isRTL } = useI18n()
  const [screen, setScreen] = useState<Screen>("map")
  const [returnTo, setReturnTo] = useState<Screen>("map")
  const [selected, setSelected] = useState<StationWithDist | null>(null)
  const [brands, setBrands] = useState<BrandDTO[]>([])
  const [allStations, setAllStations] = useState<StationDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<StationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [userStats, setUserStats] = useState<UserStats>({ reviews: 7, reports: 12, validated: 9 })
  const [offline, setOffline] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Chargement initial : enseignes + stations actives (une seule fois)
  useEffect(() => {
    let alive = true
    const splash = new Promise<void>(res => setTimeout(res, 700))
    Promise.all([
      fetchJson<{ brands: BrandDTO[] }>("/api/brands"),
      fetchJson<{ stations: StationDTO[] }>("/api/stations?status=ACTIVE&limit=1500"),
      splash,
    ]).then(([b, s]) => {
      if (!alive) return
      if (b?.brands?.length) setBrands(b.brands)
      if (s?.stations?.length) setAllStations(s.stations)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  // Fiche détaillée : chargement différé à chaque changement de station (via .then — jamais sync)
  useEffect(() => {
    if (!selected) return
    const stationId = selected.id
    let alive = true
    fetchJson<StationDetail>(`/api/stations/${stationId}`).then(d => {
      if (!alive) return
      setDetail(d)
      setDetailLoading(false)
    })
    return () => {
      alive = false
    }
  }, [selected])

  // Distances (haversine) et « autour de moi » (< 12 km)
  const allWithDist = useMemo<StationWithDist[]>(
    () => allStations.map(s => ({ ...s, distanceKm: haversineKm(USER_POS.lat, USER_POS.lng, s.lat, s.lng) })),
    [allStations]
  )
  const nearby = useMemo(
    () => allWithDist.filter(s => s.distanceKm <= 12).sort((a, b) => a.distanceKm - b.distanceKm),
    [allWithDist]
  )

  // ---------- Navigation (mini-routeur) ----------
  const openStation = (s: StationDTO) => {
    setSelected({ ...s, distanceKm: haversineKm(USER_POS.lat, USER_POS.lng, s.lat, s.lng) })
    setDetail(null)
    setDetailLoading(true)
    setReturnTo(screen === "fiche" || screen === "signalement" || screen === "avis" ? returnTo : screen)
    setScreen("fiche")
  }

  const openSearch = (q: string) => {
    setSearchQuery(q)
    setScreen("search")
  }

  const go = (s: Screen) => setScreen(s)

  const back = () => {
    if (screen === "fiche") {
      setScreen(returnTo)
      setSelected(null)
      setDetail(null)
    } else if (screen === "signalement" || screen === "avis") {
      setScreen("fiche")
    } else if (screen === "alertes") {
      setScreen("map")
    }
  }

  const setTab = (s: Screen) => {
    if (screen === "fiche") {
      setSelected(null)
      setDetail(null)
    }
    setScreen(s)
  }

  const toggleOffline = () => {
    const next = !offline
    setOffline(next)
    if (next) {
      toast.info(t("offline.toastOn"), { description: t("offline.toastOnDesc") })
    } else {
      toast.success(t("offline.toastOff"))
    }
  }

  const incUserStat = (k: "reviews" | "reports") => {
    setUserStats(st => ({ ...st, [k]: st[k] + 1 }))
  }

  const refreshDetail = () => {
    if (!selected) return
    const stationId = selected.id
    fetchJson<StationDetail>(`/api/stations/${stationId}`).then(d => {
      if (d) setDetail(d)
    })
  }

  const api: AppApi = {
    brands,
    allStations: allWithDist,
    nearby,
    offline,
    toggleOffline,
    selected,
    detail,
    detailLoading,
    userStats,
    searchQuery,
    setSearchQuery,
    openStation,
    openSearch,
    go,
    back,
    incUserStat,
    refreshDetail,
  }

  if (loading) return <SplashScreen />

  const pushed = screen === "fiche" || screen === "signalement" || screen === "avis" || screen === "alertes"

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={screen}
            className="absolute inset-0 flex min-h-0 flex-col bg-[#f6f7f5]"
            initial={{ opacity: 0, x: isRTL ? -14 : 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: isRTL ? 10 : -10 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {screen === "map" && <MapScreen api={api} />}
            {screen === "search" && <SearchScreen api={api} />}
            {screen === "fiche" && <StationScreen api={api} />}
            {screen === "signalement" && <ReportScreen api={api} />}
            {screen === "avis" && <ReviewScreen api={api} />}
            {screen === "promos" && <PromosScreen api={api} />}
            {screen === "fidelite" && <LoyaltyScreen />}
            {screen === "profil" && <ProfileScreen api={api} />}
            {screen === "alertes" && <AlertsScreen api={api} />}
          </motion.div>
        </AnimatePresence>
      </div>
      {!pushed && <TabBar active={screen} onSelect={setTab} />}
    </div>
  )
}
