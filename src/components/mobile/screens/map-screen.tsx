'use client'

// CarbuScope Mobile — Écran Carte (B.2.1 / B.3.1 / B.3.3)
// Recherche, « Autour de moi », carte des stations proches,
// alertes intelligentes personnalisées (une visible à la fois, 4 s), accès au
// centre d'alertes via la cloche, mode hors ligne.

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Bell, CloudOff, LocateFixed, Navigation, Search, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TunisiaMap } from "@/components/map/tunisia-map"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { AppApi } from "../shared"
import { SectionTitle, StationRow } from "../shared"
import { useAlertsStore } from "../alerts-store"
import { computeSmartAlerts } from "../smart-alerts"

export function MapScreen({ api }: { api: AppApi }) {
  const { t, lang } = useI18n()
  const [query, setQuery] = useState("")
  const [alertIdx, setAlertIdx] = useState(0)
  const prefs = useAlertsStore()

  // Alertes personnalisées (B.3.1) — recalculées selon les préférences persistées
  const allAlerts = useMemo(() => computeSmartAlerts(api.allStations, prefs, lang), [api.allStations, prefs, lang])
  const alerts = useMemo(() => allAlerts.slice(0, 5), [allAlerts])

  // Rotation automatique des alertes toutes les 4 s (une seule visible)
  useEffect(() => {
    if (alerts.length < 2) return
    const id = setInterval(() => setAlertIdx(i => (i + 1) % alerts.length), 4000)
    return () => clearInterval(id)
  }, [alerts.length])

  const nearest = api.nearby.slice(0, 5)
  const safeIdx = alerts.length ? Math.min(alertIdx, alerts.length - 1) : 0
  const current = alerts[safeIdx]
  const AlertIcon = current?.icon

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Barre de recherche + actions rapides (B.2.1) */}
      <div className="z-20 shrink-0 border-b border-slate-200/70 bg-white px-3 pb-2.5 pt-1">
        <form
          onSubmit={e => {
            e.preventDefault()
            api.openSearch(query)
          }}
          className="relative"
          role="search"
        >
          <Search aria-hidden className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t("map.searchPlaceholder")}
            aria-label={t("map.searchAria")}
            enterKeyHint="search"
            className="h-10 rounded-full border-slate-200 bg-slate-50 ps-10 pe-4 text-[13px] focus-visible:border-emerald-400 focus-visible:ring-emerald-500/30"
          />
        </form>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => toast.info(t("map.aroundMeToast"), { description: t("map.aroundMeToastDesc") })}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-semibold text-emerald-700 shadow-sm"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            {t("map.aroundMe")}
          </button>
          <button
            type="button"
            onClick={() => toast.info(t("map.routeToast"))}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-600 shadow-sm transition-colors hover:border-emerald-300 hover:text-emerald-700"
          >
            <Navigation className="h-3.5 w-3.5" />
            {t("map.route")}
          </button>

          {/* Centre d'alertes intelligentes (B.3.1) */}
          <button
            type="button"
            onClick={() => api.go("alertes")}
            aria-label={t("map.bellAria", { n: allAlerts.length })}
            className="relative ms-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-red-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-red-300 hover:text-red-600"
          >
            <Bell className="h-3.5 w-3.5 text-red-500" />
            {allAlerts.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {allAlerts.length > 9 ? "9+" : allAlerts.length}
              </span>
            )}
          </button>

          {/* Mode hors ligne (B.3.3) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="status"
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold shadow-sm transition-colors",
                  api.offline ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500"
                )}
              >
                <CloudOff className="h-3.5 w-3.5" />
                {t("offline.label")}
                <Switch
                  checked={api.offline}
                  onCheckedChange={api.toggleOffline}
                  aria-label={t("offline.mode")}
                  className="h-4 w-7 scale-[0.85] data-[state=checked]:bg-amber-500"
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="max-w-[210px] border-amber-200 text-[11px] leading-snug">
              {t("offline.tooltip")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Contenu défilant : carte + alertes + liste */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <div className="relative shrink-0">
          <TunisiaMap
            stations={api.nearby}
            fitTo={api.nearby}
            className="h-[340px] w-full"
            showLayerControl={false}
            tools={false}
            showLegend={false}
            layers={{ roads: true, traffic: false, zones: false, projects: false, fleet: false }}
            onViewDetail={api.openStation}
          />
          {api.offline && (
            <span className="absolute start-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-amber-500/95 px-2 py-1 text-[10px] font-bold text-white shadow">
              <CloudOff className="h-3 w-3" />
              {t("offline.mode")}
            </span>
          )}
          <span className="absolute bottom-2 start-2 z-10 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-600 shadow backdrop-blur">
            {t("map.stationsAround", { n: api.nearby.length })}
          </span>
        </div>

        {/* Alertes intelligentes (B.3.1) — rotation, clic = centre d'alertes */}
        <div className="shrink-0 px-3 pt-3">
          {current ? (
            <button
              type="button"
              onClick={() => api.go("alertes")}
              aria-live="polite"
              aria-label={t("map.noAlerts")}
              className="relative block w-full overflow-hidden rounded-2xl border border-emerald-200/80 bg-white p-2.5 text-start shadow-sm transition-shadow hover:shadow-md"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={safeIdx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-2.5 pr-16"
                >
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", current.tint)}>
                    {AlertIcon ? <AlertIcon className="h-[18px] w-[18px]" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-slate-800">{current.title}</span>
                    <span className="block truncate text-[11px] text-slate-400">{current.sub}</span>
                  </span>
                </motion.div>
              </AnimatePresence>
              <span className="absolute end-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-red-50 px-2 py-[3px]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wide text-red-600">{t("map.live")}</span>
              </span>
              <span className="absolute bottom-1.5 right-3 flex gap-1">
                {alerts.map((_, i) => (
                  <span key={i} className={cn("h-1 w-1 rounded-full transition-colors", i === safeIdx ? "bg-emerald-500" : "bg-slate-200")} />
                ))}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => api.go("alertes")}
              className="flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-slate-300 bg-white p-2.5 text-start shadow-sm transition-colors hover:border-emerald-400"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                <SlidersHorizontal className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-slate-700">{t("map.noAlerts")}</span>
                <span className="block truncate text-[11px] text-slate-400">{t("map.noAlertsSub")}</span>
              </span>
            </button>
          )}
        </div>

        {/* Stations les plus proches (B.2.1) */}
        <section className="shrink-0 px-3 pb-6 pt-3" aria-label={t("map.nearest")}>
          <SectionTitle
            icon={Navigation}
            action={
              <button type="button" onClick={() => api.go("search")} className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700">
                {t("common.seeAll")}
              </button>
            }
          >
            {t("map.nearest")}
          </SectionTitle>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {nearest.map(s => (
                <StationRow key={s.id} station={s} onClick={() => api.openStation(s)} />
              ))}
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] leading-snug text-slate-400">
            {t("map.travelNote")}
          </p>
        </section>
      </div>
    </div>
  )
}
