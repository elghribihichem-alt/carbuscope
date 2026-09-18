'use client'

// CarbuScope Mobile (Module B) — éléments partagés : types, helpers, atomes UI
// Toutes les couleurs respectent la charte : émeraude, ambre, rouge, prune, or, ardoise.

import { useState } from "react"
import { Camera, ChevronLeft, ChevronRight, Heart, Image as ImageIcon, Star, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SERVICE_LABELS, type BrandDTO, type StationDTO, type StationDetail, type FuelPriceCurrent } from "@/lib/types"
import { useI18n } from "@/lib/i18n"
import { SERVICE_ICONS } from "@/components/map/tunisia-map"
import { useFavoritesStore } from "./favorites-store"
import { relativeDate } from "@/lib/i18n"

// ---------- Types ----------

export type Screen =
  | "map" | "search" | "promos" | "fidelite" | "profil"
  | "fiche" | "signalement" | "avis" | "alertes" | "comparateur"

export type StationWithDist = StationDTO & { distanceKm: number }

export type UserStats = { reviews: number; reports: number; validated: number }

export interface AppApi {
  brands: BrandDTO[]
  allStations: StationWithDist[]
  nearby: StationWithDist[]
  prices: FuelPriceCurrent[] // prix nationaux en vigueur (T22)
  offline: boolean
  toggleOffline: () => void
  selected: StationWithDist | null
  detail: StationDetail | null
  detailLoading: boolean
  userStats: UserStats
  searchQuery: string
  setSearchQuery: (q: string) => void
  openStation: (s: StationDTO) => void
  openSearch: (q: string) => void
  openCompare: () => void
  go: (s: Screen) => void
  back: () => void
  incUserStat: (k: "reviews" | "reports") => void
  refreshDetail: () => void
}

/** Position GPS simulée de l'utilisateur (démonstration) : Tunis — Centre */
export const USER_POS = { lat: 36.8065, lng: 10.1815, label: "Tunis — Centre" }

// ---------- Helpers ----------

/** Temps de trajet estimé (35 km/h moyenne urbaine) */
export function driveMinutes(km: number): number {
  return Math.max(1, Math.round((km / 35) * 60))
}

export function fmtKm(km: number): string {
  const v = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10
  return `${String(v).replace(".", ",")} km`
}

export function fmtNote(n: number): string {
  return n.toFixed(1).replace(".", ",")
}

export function relativeFr(iso: string): string {
  return relativeDate("fr", iso)
}

export function dateFr(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso))
}

function toggleIn<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set)
  if (next.has(v)) next.delete(v)
  else next.add(v)
  return next
}
export { toggleIn }

// ---------- Atomes UI ----------

type IconType = React.ComponentType<{ className?: string }>

/** Étoiles cliquables (ou simple affichage si onChange absent) */
export function StarRating({
  value, onChange, size = "sm", className,
}: {
  value: number
  onChange?: (v: number) => void
  size?: "xs" | "sm" | "md" | "lg"
  className?: string
}) {
  const { t } = useI18n()
  const sizes: Record<string, string> = { xs: "h-3 w-3", sm: "h-4 w-4", md: "h-5 w-5", lg: "h-8 w-8" }
  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role={onChange ? "radiogroup" : undefined}
      aria-label={onChange ? t("review.tapStars") : `${fmtNote(value)} / 5`}
    >
      {[1, 2, 3, 4, 5].map(i =>
        onChange ? (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            aria-label={`${i}/5`}
            className="transition-transform hover:scale-110 active:scale-95"
          >
            <Star className={cn(sizes[size], i <= value ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-300")} />
          </button>
        ) : (
          <Star key={i} className={cn(sizes[size], i <= value ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-300")} />
        )
      )}
    </div>
  )
}

/** Pastille circulaire aux couleurs de l'enseigne */
export function BrandMark({ color, name, className }: { color: string; name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full text-[13px] font-bold text-white shadow-sm", className)}
      style={{ backgroundColor: color }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

export function BrandDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)} style={{ backgroundColor: color }} />
}

/** Chip service (icône + libellé localisé) */
export function ServicePill({ slug, className }: { slug: string; className?: string }) {
  const { svc } = useI18n()
  const Icon = SERVICE_ICONS[slug]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600", className)}>
      {Icon ? <Icon className="h-3 w-3 text-slate-400" /> : null}
      {svc(slug)}
    </span>
  )
}

/** Ligne de résultat station (listes carte / recherche) — cœur si favorite */
export function StationRow({ station, onClick }: { station: StationWithDist; onClick?: () => void }) {
  const isFav = useFavoritesStore(st => st.stationIds.includes(station.id))
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-start transition-colors hover:bg-emerald-50/70 active:bg-emerald-100/70"
    >
      <BrandMark color={station.brandColor} name={station.brandName} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold leading-tight text-slate-800">{station.name}</span>
          {isFav && (
            <Heart className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" aria-label={t("common.favoriteStation")} />
          )}
          {station.open24 && (
            <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-px text-[9px] font-bold text-emerald-700">{t("common.open24h")}</span>
          )}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[11px] leading-none text-slate-500">
          <span className="font-semibold text-emerald-700">{fmtKm(station.distanceKm)}</span>
          <span aria-hidden>·</span>
          <span>{driveMinutes(station.distanceKm)} {t("common.min")}</span>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-0.5">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span className="font-medium text-slate-700">{fmtNote(station.rating)}</span>
            <span className="text-slate-400">({station.reviewsCount})</span>
          </span>
        </span>
        <span className="mt-1.5 flex flex-wrap gap-1">
          {station.services.slice(0, 3).map(slug => <ServicePill key={slug} slug={slug} />)}
          {station.services.length > 3 && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              +{station.services.length - 3}
            </span>
          )}
        </span>
      </span>
      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300 rtl:rotate-180" />
    </button>
  )
}

/** En-tête d'écran (avec bouton retour pour les écrans poussés) */
export function ScreenHeader({
  title, subtitle, onBack, right,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  right?: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-slate-200/80 bg-white px-2">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={t("common.back")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-200"
        >
          <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-bold leading-tight text-slate-800">{title}</h1>
        {subtitle && <p className="truncate text-[11px] leading-tight text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

/** Titre de section dans un écran */
export function SectionTitle({ icon: Icon, children, action }: { icon?: IconType; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      {Icon ? <Icon className="h-3.5 w-3.5 text-emerald-600" /> : null}
      <h2 className="text-[11.5px] font-bold uppercase tracking-wide text-slate-500">{children}</h2>
      <span className="ms-auto">{action}</span>
    </div>
  )
}

/** Barre de contexte station (écrans signalement / avis) */
export function StationContextBar({ station }: { station: StationWithDist }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <BrandMark color={station.brandColor} name={station.brandName} className="h-9 w-9 text-sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-800">{station.name}</p>
        <p className="truncate text-[11px] text-slate-400">{station.address}</p>
      </div>
      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
        {fmtKm(station.distanceKm)} · {driveMinutes(station.distanceKm)} {t("common.min")}
      </span>
    </div>
  )
}

/** Mock d'ajout de photo (signalement / avis) */
export function PhotoMock({ label, fileName = "IMG_2481.jpg" }: { label?: string; fileName?: string }) {
  const { t } = useI18n()
  const [added, setAdded] = useState(false)
  const addLabel = label ?? t("report.photo")
  if (added) {
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 p-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
          <ImageIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-slate-700">{fileName}</span>
          <span className="block text-[10px] text-slate-400">36,80 N — 10,18 E</span>
        </span>
        <button
          type="button"
          onClick={() => setAdded(false)}
          aria-label={t("report.photo")}
          className="shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setAdded(true)}
      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3 text-[12px] font-medium text-slate-500 transition-colors hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"
    >
      <Camera className="h-4 w-4" />
      {addLabel}
    </button>
  )
}
