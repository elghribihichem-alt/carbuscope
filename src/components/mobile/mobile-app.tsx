'use client'

// CarbuScope Mobile — cœur applicatif : mini-routeur d'état, chargement des données
// (fetch unique /api/brands + /api/stations?status=ACTIVE&limit=1500), fiche en lazy,
// barre d'onglets (5 onglets), transitions framer-motion et Espace agent
// (veille terrain T28 : login code → missions → rapport → confirmation).

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Fuel, Gift, Map, Search, Tag, UserRound } from "lucide-react"
import { toast } from "sonner"
import { haversineKm } from "@/lib/geo"
import { useI18n } from "@/lib/i18n"
import type { BrandDTO, StationDTO, StationDetail, FieldAgentDTO, MissionDTO, MissionDetailDTO, MissionStatus, MissionTaskDTO, MissionTaskStatus, MissionsResponse } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { AppApi, Screen, StationWithDist, UserStats } from "./shared"
import { USER_POS } from "./shared"
import type { FuelPricesResponse } from "@/lib/types"
import { MapScreen } from "./screens/map-screen"
import { SearchScreen } from "./screens/search-screen"
import { StationScreen } from "./screens/station-screen"
import { ReportScreen } from "./screens/report-screen"
import { ReviewScreen } from "./screens/review-screen"
import { PromosScreen } from "./screens/promos-screen"
import { LoyaltyScreen } from "./screens/loyalty-screen"
import { ProfileScreen } from "./screens/profile-screen"
import { AlertsScreen } from "./screens/alerts-screen"
import { CompareScreen } from "./screens/compare-screen"
import { AgentLoginScreen } from "./screens/agent-login-screen"
import { AgentHomeScreen } from "./screens/agent-home-screen"
import { AgentMissionScreen } from "./screens/agent-mission-screen"
import { AgentReportScreen } from "./screens/agent-report-screen"
import { AgentSuccessScreen } from "./screens/agent-success-screen"
import type { AgentApi, AgentReportResult, ReportPayload } from "./agent-shared"
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
  const [prices, setPrices] = useState<FuelPricesResponse["current"]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<StationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [userStats, setUserStats] = useState<UserStats>({ reviews: 7, reports: 12, validated: 9 })
  const [offline, setOffline] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // ---------- Espace agent (T28 — veille terrain) ----------
  // Code agent persisté (localStorage « cs-agent-code ») ; la fiche agent
  // (code inclus) porte l'identité de session.
  const [agent, setAgent] = useState<FieldAgentDTO | null>(null)
  const [agentMissions, setAgentMissions] = useState<MissionDTO[]>([])
  const [agentMission, setAgentMission] = useState<MissionDetailDTO | null>(null)
  const [agentMissionLoading, setAgentMissionLoading] = useState(false)
  const [agentMissionError, setAgentMissionError] = useState<string | null>(null)
  const [agentTask, setAgentTask] = useState<MissionTaskDTO | null>(null)
  const [agentReportResult, setAgentReportResult] = useState<AgentReportResult | null>(null)
  const agentMissionReq = useRef(0) // anti-course : dernière requête de détail ouverte
  const agentMissionIdRef = useRef<string | null>(null)

  // Chargement initial : enseignes + stations actives (une seule fois)
  useEffect(() => {
    let alive = true
    const splash = new Promise<void>(res => setTimeout(res, 700))
    Promise.all([
      fetchJson<{ brands: BrandDTO[] }>("/api/brands"),
      fetchJson<{ stations: StationDTO[] }>("/api/stations?status=ACTIVE&limit=1500"),
      fetchJson<FuelPricesResponse>("/api/prices"),
      splash,
    ]).then(([b, s, p]) => {
      if (!alive) return
      if (b?.brands?.length) setBrands(b.brands)
      if (s?.stations?.length) setAllStations(s.stations)
      if (p?.current?.length) setPrices(p.current)
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

  // Session agent persistée : reconnexion silencieuse (setState uniquement dans le .then)
  useEffect(() => {
    let alive = true
    const saved = localStorage.getItem("cs-agent-code")
    if (!saved) return
    fetchJson<MissionsResponse>(`/api/missions?agentCode=${encodeURIComponent(saved)}`).then(d => {
      if (!alive || !d) return
      const a = d.agents.find(x => x.code === saved)
      if (!a) {
        localStorage.removeItem("cs-agent-code")
        return
      }
      setAgent(a)
      setAgentMissions(d.missions)
    })
    return () => {
      alive = false
    }
  }, [])

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

  const openCompare = () => {
    if (screen !== "comparateur") {
      setReturnTo(screen === "fiche" || screen === "signalement" || screen === "avis" || screen === "alertes" ? returnTo : screen)
    }
    setScreen("comparateur")
  }

  const go = (s: Screen) => setScreen(s)

  const back = () => {
    if (screen.startsWith("agent-")) {
      agentBack()
    } else if (screen === "fiche") {
      setScreen(returnTo)
      setSelected(null)
      setDetail(null)
    } else if (screen === "signalement" || screen === "avis") {
      setScreen("fiche")
    } else if (screen === "alertes") {
      setScreen("map")
    } else if (screen === "comparateur") {
      setScreen(returnTo === "comparateur" || returnTo === "fiche" ? "map" : returnTo)
    }
  }

  const setTab = (s: Screen) => {
    if (screen === "fiche") {
      setSelected(null)
      setDetail(null)
    }
    setScreen(s)
  }

  // ---------- Espace agent : navigation + actions (handlers d'événement) ----------

  const agentLogin = async (code: string): Promise<void> => {
    const d = await fetchJson<MissionsResponse>(`/api/missions?agentCode=${encodeURIComponent(code)}`)
    if (!d) throw new Error("Connexion impossible — vérifiez votre réseau.")
    const a = d.agents.find(x => x.code === code)
    if (!a) throw new Error("Code agent inconnu. Vérifiez votre saisie ou contactez votre superviseur.")
    localStorage.setItem("cs-agent-code", a.code)
    setAgent(a)
    setAgentMissions(d.missions)
    setAgentMission(null)
    setAgentMissionError(null)
    setAgentTask(null)
    setAgentReportResult(null)
    setScreen("agent-home")
    toast.success(`Bienvenue, ${a.name.split(" ")[0]} !`, {
      description: `${d.missions.length} mission(s) · zone ${a.zone}`,
    })
  }

  const agentLogout = () => {
    localStorage.removeItem("cs-agent-code")
    setAgent(null)
    setAgentMissions([])
    setAgentMission(null)
    setAgentMissionError(null)
    setAgentTask(null)
    setAgentReportResult(null)
    setScreen("profil")
    toast.info("Déconnecté de l'espace agent")
  }

  const openAgentSpace = () => setScreen(agent ? "agent-home" : "agent-login")

  const openAgentMission = (id: string) => {
    const req = ++agentMissionReq.current
    agentMissionIdRef.current = id
    setAgentMission(null)
    setAgentMissionError(null)
    setAgentMissionLoading(true)
    setScreen("agent-mission")
    fetchJson<{ mission: MissionDetailDTO }>(`/api/missions/${id}`).then(d => {
      if (req !== agentMissionReq.current) return
      setAgentMissionLoading(false)
      if (d?.mission) setAgentMission(d.mission)
      else setAgentMissionError("Impossible de charger la mission.")
    })
  }

  const retryAgentMission = () => {
    const id = agentMissionIdRef.current
    if (id) openAgentMission(id)
  }

  const openAgentReport = (task: MissionTaskDTO) => {
    setAgentTask(task)
    setScreen("agent-report")
  }

  const submitAgentReport = async (payload: ReportPayload): Promise<void> => {
    const code = agent?.code
    const task = agentTask
    if (!code || !task) throw new Error("Session agent expirée — reconnectez-vous.")
    const r = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, taskId: task.id, agentCode: code }),
    })
    const body = (await r.json().catch(() => null)) as
      | { taskStatus?: string; missionStatus?: string; error?: string }
      | null
    if (!r.ok || !body?.taskStatus) {
      throw new Error(body?.error ?? "Envoi impossible — réessayez.")
    }
    // Rafraîchit mission + liste (KPIs à jour) puis confirme
    const [detail, list] = await Promise.all([
      fetchJson<{ mission: MissionDetailDTO }>(`/api/missions/${task.missionId}`),
      fetchJson<MissionsResponse>(`/api/missions?agentCode=${encodeURIComponent(code)}`),
    ])
    agentMissionReq.current += 1 // annule toute requête de détail encore en vol
    if (detail?.mission) setAgentMission(detail.mission)
    if (list) {
      setAgentMissions(list.missions)
      const a = list.agents.find(x => x.code === code)
      if (a) setAgent(a)
    }
    setAgentReportResult({
      targetLabel: task.targetLabel,
      missionTitle: agentMission?.title ?? detail?.mission?.title ?? "Mission",
      taskStatus: body.taskStatus as MissionTaskStatus,
      missionStatus: (body.missionStatus ?? "EN_COURS") as MissionStatus,
    })
    setScreen("agent-success")
  }

  const agentBack = () => {
    if (screen === "agent-mission") setScreen("agent-home")
    else if (screen === "agent-report") setScreen("agent-mission")
    else if (screen === "agent-success") {
      setAgentReportResult(null)
      setScreen("agent-mission")
    } else setScreen("profil") // agent-login / agent-home
  }

  const agentGoHome = () => {
    setAgentReportResult(null)
    setScreen("agent-home")
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

  const agentApi: AgentApi = {
    agent,
    missions: agentMissions,
    mission: agentMission,
    missionLoading: agentMissionLoading,
    missionError: agentMissionError,
    retryMission: retryAgentMission,
    task: agentTask,
    reportResult: agentReportResult,
    prices,
    brands,
    login: agentLogin,
    logout: agentLogout,
    openMission: openAgentMission,
    openReport: openAgentReport,
    submitReport: submitAgentReport,
    back: agentBack,
    goHome: agentGoHome,
  }

  const api: AppApi = {
    brands,
    allStations: allWithDist,
    nearby,
    prices,
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
    openCompare,
    go,
    back,
    incUserStat,
    refreshDetail,
  }

  if (loading) return <SplashScreen />

  const pushed =
    screen === "fiche" || screen === "signalement" || screen === "avis" || screen === "alertes" || screen === "comparateur" ||
    screen.startsWith("agent-")

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
            {screen === "profil" && (
              <ProfileScreen
                api={api}
                agent={agent ? { code: agent.code, name: agent.name, brandSlug: agent.brandSlug, zone: agent.zone } : null}
                onOpenAgent={openAgentSpace}
              />
            )}
            {screen === "alertes" && <AlertsScreen api={api} />}
            {screen === "comparateur" && <CompareScreen api={api} />}
            {screen === "agent-login" && <AgentLoginScreen api={agentApi} />}
            {screen === "agent-home" && <AgentHomeScreen api={agentApi} />}
            {screen === "agent-mission" && <AgentMissionScreen api={agentApi} />}
            {screen === "agent-report" && <AgentReportScreen api={agentApi} />}
            {screen === "agent-success" && <AgentSuccessScreen api={agentApi} />}
          </motion.div>
        </AnimatePresence>
      </div>
      {!pushed && <TabBar active={screen} onSelect={setTab} />}
    </div>
  )
}
