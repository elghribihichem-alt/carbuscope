'use client'

// CarbuScope Mobile — Centre d'alertes intelligentes (B.3.1 étendu)
// Fil d'alertes personnalisées + préférences persistantes (enseignes favorites,
// services surveillés, rayon de veille, 24h/24). Alertes calculées côté client
// à partir des stations chargées — zéro appel serveur supplémentaire.

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { BellOff, ChevronRight, RotateCcw, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useI18n } from "@/lib/i18n"
import { SERVICE_ICONS } from "@/components/map/tunisia-map"
import { cn } from "@/lib/utils"
import type { AppApi } from "../shared"
import { BrandDot, ScreenHeader, SectionTitle, driveMinutes, fmtKm } from "../shared"
import { useAlertsStore } from "../alerts-store"
import { computeSmartAlerts, type SmartAlertCard } from "../smart-alerts"

const SERVICES = ["boutique", "gonflage", "toilettes", "atm", "cafe", "lavage", "vidange", "atelier", "recharge"]

function AlertCard({ alert, index, onOpen, t }: { alert: SmartAlertCard; index: number; onOpen: () => void; t: ReturnType<typeof useI18n>["t"] }) {
  const Icon = alert.icon
  return (
    <motion.button
      type="button"
      layout
      onClick={onOpen}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.04, 0.3) }}
      className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-start shadow-sm transition-colors hover:border-emerald-300 active:bg-emerald-50/60"
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", alert.tint)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="inline-block rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-slate-500">
          {t(`alert.kind.${alert.kind}`)}
        </span>
        <span className="mt-1 block text-[13px] font-semibold leading-snug text-slate-800">{alert.title}</span>
        <span className="mt-0.5 block truncate text-[11px] text-slate-400">{alert.sub}</span>
        <span className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium">
          <span className="text-emerald-700">{fmtKm(alert.station.distanceKm)}</span>
          <span aria-hidden className="text-slate-300">·</span>
          <span className="text-slate-500">{driveMinutes(alert.station.distanceKm)} {t("common.min")}</span>
          <span aria-hidden className="text-slate-300">·</span>
          <BrandDot color={alert.station.brandColor} />
          <span className="truncate text-slate-500">{alert.station.brandName}</span>
        </span>
      </span>
      <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-slate-300 rtl:rotate-180" />
    </motion.button>
  )
}

export function AlertsScreen({ api }: { api: AppApi }) {
  const { t, lang, locale, svc } = useI18n()
  const prefs = useAlertsStore()
  const [showPrefs, setShowPrefs] = useState(false)
  const [computedAt] = useState(() =>
    new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
  )

  const alerts = useMemo(() => computeSmartAlerts(api.allStations, prefs, lang), [api.allStations, prefs, lang])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScreenHeader
        title={t("alerts.title")}
        subtitle={alerts.length === 1
          ? t("alerts.subtitleOne", { n: alerts.length, km: prefs.radiusKm })
          : t("alerts.subtitleMany", { n: alerts.length, km: prefs.radiusKm })}
        onBack={api.back}
        right={
          <button
            type="button"
            onClick={() => setShowPrefs(v => !v)}
            aria-label={showPrefs ? t("alerts.hidePrefs") : t("alerts.showPrefs")}
            aria-expanded={showPrefs}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
              showPrefs ? "bg-emerald-50 text-emerald-600" : "text-slate-500 hover:bg-slate-100 active:bg-slate-200"
            )}
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" />
          </button>
        }
      />

      {/* Bandeau « en direct » */}
      <div className="z-10 flex shrink-0 items-center gap-2 border-b border-emerald-100/70 bg-emerald-50/50 px-3 py-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        <p className="text-[11.5px] font-semibold text-emerald-800" aria-live="polite">
          {alerts.length === 1 ? t("alerts.liveOne", { n: alerts.length }) : t("alerts.liveMany", { n: alerts.length })}
        </p>
        <span className="ms-auto shrink-0 text-[10px] font-medium text-slate-400">{t("alerts.computedAt", { time: computedAt })}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">

        {/* Préférences (B.3.1) — repliables */}
        <AnimatePresence initial={false}>
          {showPrefs && (
            <motion.section
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="overflow-hidden"
              aria-label={t("alerts.prefsTitle")}
            >
              <div className="m-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[13px] font-bold text-slate-800">{t("alerts.prefsTitle")}</p>
                  <button
                    type="button"
                    onClick={() => {
                      prefs.resetPrefs()
                      toast.success(t("alerts.resetToast"), { description: t("alerts.resetToastDesc") })
                    }}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-semibold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t("alerts.reset")}
                  </button>
                </div>

                {/* Enseignes favorites */}
                <SectionTitle>{t("alerts.favBrands")}</SectionTitle>
                <div className="mb-3.5 flex flex-wrap gap-1.5">
                  {api.brands.map(b => {
                    const active = prefs.favBrands.includes(b.slug)
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => prefs.toggleFavBrand(b.slug)}
                        aria-pressed={active}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-95",
                          active ? "border-transparent text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        )}
                        style={active ? { backgroundColor: b.color } : undefined}
                      >
                        {!active && <BrandDot color={b.color} />}
                        {b.name}
                      </button>
                    )
                  })}
                </div>

                {/* Services surveillés */}
                <SectionTitle>{t("alerts.watchedServices")}</SectionTitle>
                <div className="mb-3.5 flex flex-wrap gap-1.5">
                  {SERVICES.map(slug => {
                    const Icon = SERVICE_ICONS[slug]
                    const active = prefs.watchedServices.includes(slug)
                    return (
                      <button
                        key={slug}
                        type="button"
                        onClick={() => prefs.toggleWatchedService(slug)}
                        aria-pressed={active}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-95",
                          active
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                        )}
                      >
                        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                        {svc(slug)}
                      </button>
                    )
                  })}
                </div>

                {/* Rayon de veille */}
                <SectionTitle>{t("alerts.radius")}</SectionTitle>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-medium text-slate-600">{t("alerts.maxDistance")}</span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                    {prefs.radiusKm} km
                  </span>
                </div>
                <Slider
                  value={[prefs.radiusKm]}
                  onValueChange={v => prefs.setRadiusKm(v[0] ?? prefs.radiusKm)}
                  min={2}
                  max={20}
                  step={1}
                  aria-label={t("alerts.radiusAria")}
                  className="mb-4"
                />

                {/* 24h/24 uniquement */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-slate-700">{t("alerts.open24Only")}</p>
                    <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">
                      {t("alerts.open24OnlyDesc")}
                    </p>
                  </div>
                  <Switch
                    checked={prefs.open24Only}
                    onCheckedChange={prefs.setOpen24Only}
                    aria-label={t("alerts.open24OnlyAria")}
                  />
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Fil d'alertes */}
        {alerts.length > 0 ? (
          <div className="flex flex-col gap-2 px-3 pb-6 pt-3">
            <AnimatePresence initial={false}>
              {alerts.map((a, i) => (
                <AlertCard key={a.id} alert={a} index={i} onOpen={() => api.openStation(a.station)} t={t} />
              ))}
            </AnimatePresence>
            <p className="mt-1 text-center text-[10px] leading-snug text-slate-400">
              {t("alerts.footnote")}
            </p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <BellOff className="h-7 w-7" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-slate-700">{t("alerts.emptyTitle")}</p>
              <p className="mt-1 text-[11px] leading-snug text-slate-400">
                {t("alerts.emptyDesc")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPrefs(true)}
              className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 active:scale-95"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t("alerts.emptyCta")}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
