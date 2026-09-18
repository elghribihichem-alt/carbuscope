// CarbuScope Mobile — Moteur d'alertes intelligentes (B.3.1)
// Calcule les alertes personnalisées à partir des stations réellement proches et
// des préférences utilisateur (enseignes favorites, services surveillés, rayon,
// 24h/24). 100 % côté client : zéro appel serveur supplémentaire.

import type { ComponentType } from "react"
import { BadgeCheck, Clock3, Star, Wrench } from "lucide-react"
import { SERVICE_LABELS } from "@/lib/types"
import { SERVICE_ICONS } from "@/components/map/tunisia-map"
import type { StationWithDist } from "./shared"
import { fmtKm, fmtNote } from "./shared"

export type AlertKind = "open24" | "service" | "rating" | "fresh"

/** Préférences d'alertes persistées (localStorage via alerts-store) */
export interface AlertPrefs {
  favBrands: string[]
  watchedServices: string[]
  radiusKm: number
  open24Only: boolean
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  favBrands: [],
  watchedServices: ["lavage", "recharge"],
  radiusKm: 8,
  open24Only: false,
}

export interface SmartAlertCard {
  id: string
  kind: AlertKind
  icon: ComponentType<{ className?: string }>
  title: string
  sub: string
  tint: string
  station: StationWithDist
}

const RATING_THRESHOLD = 4.3
const RATING_MIN_REVIEWS = 5
const FRESH_DAYS = 30
const MAX_ALERTS = 14

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

/** Copie triée par distance croissante */
function byDistance(list: StationWithDist[]): StationWithDist[] {
  return [...list].sort((a, b) => a.distanceKm - b.distanceKm)
}

export function computeSmartAlerts(all: StationWithDist[], prefs: AlertPrefs): SmartAlertCard[] {
  const inRadius = all.filter(
    s => s.status === "ACTIVE" && s.distanceKm <= prefs.radiusKm && (!prefs.open24Only || s.open24)
  )
  const out: SmartAlertCard[] = []

  // 1) Stations ouvertes 24h/24 — priorité aux enseignes favorites (B.3.1)
  const pool = prefs.favBrands.length ? inRadius.filter(s => s.brandSlug != null && prefs.favBrands.includes(s.brandSlug)) : inRadius
  const open24 = byDistance(pool.filter(s => s.open24)).slice(0, prefs.favBrands.length ? 3 : 2)
  open24.forEach(s =>
    out.push({
      id: `${s.id}-open24`,
      kind: "open24",
      icon: Clock3,
      title: `Station ${s.brandName} ouverte 24h/24 à ${fmtKm(s.distanceKm)}`,
      sub: `${s.name} — ${s.delegation}`,
      tint: "bg-emerald-50 text-emerald-600",
      station: s,
    })
  )

  // 2) Services surveillés disponibles dans le rayon
  prefs.watchedServices.forEach(slug => {
    const st = byDistance(inRadius.filter(s => s.services.includes(slug)))[0]
    if (!st) return
    out.push({
      id: `${st.id}-svc-${slug}`,
      kind: "service",
      icon: SERVICE_ICONS[slug] ?? Wrench,
      title: `${SERVICE_LABELS[slug] ?? slug} disponible à ${fmtKm(st.distanceKm)}`,
      sub: `${st.name} — ${st.brandName}`,
      tint: slug === "recharge" ? "bg-purple-50 text-purple-600" : "bg-amber-50 text-amber-600",
      station: st,
    })
  })

  // 3) Stations très bien notées (qualité confirmée par la communauté)
  const rated = byDistance(inRadius.filter(s => s.rating >= RATING_THRESHOLD && s.reviewsCount >= RATING_MIN_REVIEWS)).slice(0, 2)
  rated.forEach(s =>
    out.push({
      id: `${s.id}-rating`,
      kind: "rating",
      icon: Star,
      title: `Station notée ${fmtNote(s.rating)}/5 à ${fmtKm(s.distanceKm)}`,
      sub: `${s.name} — ${s.reviewsCount} avis vérifiés`,
      tint: "bg-amber-50 text-amber-600",
      station: s,
    })
  )

  // 4) Fiches fraîchement vérifiées (données certifiées à jour)
  const fresh = byDistance(inRadius.filter(s => daysSince(s.lastVerified) <= FRESH_DAYS)).slice(0, 2)
  fresh.forEach(s => {
    const d = daysSince(s.lastVerified)
    out.push({
      id: `${s.id}-fresh`,
      kind: "fresh",
      icon: BadgeCheck,
      title: `Fiche vérifiée ${d === 0 ? "aujourd'hui" : `il y a ${d} j`} à ${fmtKm(s.distanceKm)}`,
      sub: `${s.name} — certifiée ${s.verifiedBy}`,
      tint: "bg-slate-100 text-slate-600",
      station: s,
    })
  })

  // Dédup (id = station + type), tri par distance, plafond
  const seen = new Set<string>()
  return out
    .filter(a => {
      if (seen.has(a.id)) return false
      seen.add(a.id)
      return true
    })
    .sort((a, b) => a.station.distanceKm - b.station.distanceKm)
    .slice(0, MAX_ALERTS)
}
