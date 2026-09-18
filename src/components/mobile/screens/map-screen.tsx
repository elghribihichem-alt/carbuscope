'use client'

// CarbuScope Mobile — Écran Carte (B.2.1 / B.3.1 / B.3.3)
// Recherche, « Autour de moi », carte des stations proches,
// alertes intelligentes rotatives (une visible à la fois, 4 s), mode hors ligne.

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Clock3, CloudOff, Droplets, LocateFixed, Navigation, Search, Zap } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TunisiaMap } from "@/components/map/tunisia-map"
import { cn } from "@/lib/utils"
import type { AppApi, StationWithDist } from "../shared"
import { SectionTitle, StationRow, fmtKm } from "../shared"

type SmartAlert = {
  icon: React.ComponentType<{ className?: string }>
  title: string
  sub: string
  tint: string
}

/** Alertes intelligentes (B.3.1) construites à partir des stations réellement proches */
function buildAlerts(nearby: StationWithDist[]): SmartAlert[] {
  const alerts: SmartAlert[] = []
  const open24 = nearby.find(s => s.open24 && s.brandSlug === "agil") ?? nearby.find(s => s.open24)
  if (open24) {
    alerts.push({
      icon: Clock3,
      title: `Station ${open24.brandName} ouverte 24h/24 à ${fmtKm(open24.distanceKm)}`,
      sub: `${open24.name} — ${open24.delegation}`,
      tint: "bg-emerald-50 text-emerald-600",
    })
  }
  const lavage = nearby.find(s => s.services.includes("lavage"))
  if (lavage) {
    alerts.push({
      icon: Droplets,
      title: `Lavage disponible sur votre trajet à ${fmtKm(lavage.distanceKm)}`,
      sub: `${lavage.name} — file estimée courte`,
      tint: "bg-amber-50 text-amber-600",
    })
  }
  const recharge = nearby.find(s => s.services.includes("recharge"))
  if (recharge) {
    alerts.push({
      icon: Zap,
      title: `Borne de recharge libre à ${fmtKm(recharge.distanceKm)}`,
      sub: `${recharge.name} — type 2 · 22 kW`,
      tint: "bg-purple-50 text-purple-600",
    })
  }
  if (!alerts.length) {
    alerts.push({ icon: Zap, title: "Borne de recharge libre à 5 km", sub: "Alerte CarbuScope", tint: "bg-emerald-50 text-emerald-600" })
  }
  return alerts
}

export function MapScreen({ api }: { api: AppApi }) {
  const [query, setQuery] = useState("")
  const [alertIdx, setAlertIdx] = useState(0)
  const alerts = useMemo(() => buildAlerts(api.nearby), [api.nearby])

  // Rotation automatique des alertes toutes les 4 s (une seule visible)
  useEffect(() => {
    if (alerts.length < 2) return
    const id = setInterval(() => setAlertIdx(i => (i + 1) % alerts.length), 4000)
    return () => clearInterval(id)
  }, [alerts.length])

  const nearest = api.nearby.slice(0, 5)
  const current = alerts[Math.min(alertIdx, alerts.length - 1)]
  const AlertIcon = current.icon

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
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ville, station, enseigne…"
            aria-label="Rechercher une ville, une station ou une enseigne"
            enterKeyHint="search"
            className="h-10 rounded-full border-slate-200 bg-slate-50 pl-10 pr-4 text-[13px] focus-visible:border-emerald-400 focus-visible:ring-emerald-500/30"
          />
        </form>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => toast.info("Position centrée sur Tunis — Centre", { description: "GPS simulé pour la démonstration." })}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-semibold text-emerald-700 shadow-sm"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            Autour de moi
          </button>
          <button
            type="button"
            onClick={() => toast.info("Ouvrez une fiche station puis appuyez sur « Itinéraire ».")}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-600 shadow-sm transition-colors hover:border-emerald-300 hover:text-emerald-700"
          >
            <Navigation className="h-3.5 w-3.5" />
            Itinéraire
          </button>

          {/* Mode hors ligne (B.3.3) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="status"
                className={cn(
                  "ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold shadow-sm transition-colors",
                  api.offline ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500"
                )}
              >
                <CloudOff className="h-3.5 w-3.5" />
                Hors ligne
                <Switch
                  checked={api.offline}
                  onCheckedChange={api.toggleOffline}
                  aria-label="Basculer le mode hors ligne"
                  className="h-4 w-7 scale-[0.85] data-[state=checked]:bg-amber-500"
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="max-w-[210px] border-amber-200 text-[11px] leading-snug">
              Cartes et fiches en cache — signalements synchronisés à la reconnexion.
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
            <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-amber-500/95 px-2 py-1 text-[10px] font-bold text-white shadow">
              <CloudOff className="h-3 w-3" />
              Mode hors ligne
            </span>
          )}
          <span className="absolute bottom-2 left-2 z-10 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-600 shadow backdrop-blur">
            {api.nearby.length} stations autour de vous
          </span>
        </div>

        {/* Alertes intelligentes (B.3.1) */}
        <div className="shrink-0 px-3 pt-3">
          <button
            type="button"
            onClick={() => setAlertIdx(i => (i + 1) % alerts.length)}
            aria-live="polite"
            aria-label="Alerte intelligente — appuyez pour voir la suivante"
            className="relative block w-full overflow-hidden rounded-2xl border border-emerald-200/80 bg-white p-2.5 text-left shadow-sm transition-shadow hover:shadow-md"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={alertIdx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="flex items-center gap-2.5 pr-16"
              >
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", current.tint)}>
                  <AlertIcon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-slate-800">{current.title}</span>
                  <span className="block truncate text-[11px] text-slate-400">{current.sub}</span>
                </span>
              </motion.div>
            </AnimatePresence>
            <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-red-50 px-2 py-[3px]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wide text-red-600">En direct</span>
            </span>
            <span className="absolute bottom-1.5 right-3 flex gap-1">
              {alerts.map((_, i) => (
                <span key={i} className={cn("h-1 w-1 rounded-full transition-colors", i === alertIdx ? "bg-emerald-500" : "bg-slate-200")} />
              ))}
            </span>
          </button>
        </div>

        {/* Stations les plus proches (B.2.1) */}
        <section className="shrink-0 px-3 pb-6 pt-3" aria-label="Stations les plus proches">
          <SectionTitle
            icon={Navigation}
            action={
              <button type="button" onClick={() => api.go("search")} className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700">
                Tout voir
              </button>
            }
          >
            Stations les plus proches
          </SectionTitle>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {nearest.map(s => (
                <StationRow key={s.id} station={s} onClick={() => api.openStation(s)} />
              ))}
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] leading-snug text-slate-400">
            Temps de trajet estimé à 35 km/h en zone urbaine · données vérifiées par la communauté
          </p>
        </section>
      </div>
    </div>
  )
}
