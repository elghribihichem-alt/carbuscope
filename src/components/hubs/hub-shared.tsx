'use client'

// ============================================================================
// CarbuScope — T54-Ca — socle partagé des volets « Mobility Hub Operations »
// (carte des TMP, gestion des services, base clients). Types des contrats
// /api/hubs/*, métadonnées FR (libellés + BADGES TONNÉS) et helpers de
// formatage (chiffres FR via `num` de src/lib/chart, dates FR, recherche
// accent-insensible — miroir du normalizeFr serveur).
//
// MAPPING BADGES (spec T54-Ca — palette émeraude/ambre/terracotta/zinc,
// BLEU/INDIGO INTERDIT) :
//   · Catégories de services :
//       LAVAGE    → émeraude (outline clair)
//       VIDANGE   → ambre
//       PNEUS     → terracotta
//       RECHARGE  → émeraude PLEIN (bg-emerald-600, texte blanc)
//       BOUTIQUE  → zinc (outline)
//       CAFÉ      → ambre clair (amber-100)
//       LAVERIE   → zinc (léger, bg-zinc-100)
//       RELAIS    → émeraude outline
//   · Statuts de service : ACTIVE émeraude · PAUSED ambre · CLOSED zinc.
//   · Statuts de hub     : ACTIVE émeraude · CONSTRUCTION ambre ·
//                          PLANNED zinc (contour) · CLOSED zinc plein.
//   · Types de véhicule  : UTILITAIRE zinc · BERLINE émeraude · SUV ambre ·
//                          POIDS_LOURD terracotta · ÉLECTRIQUE émeraude PLEIN
//                          avec icône Zap.
//   · Segments client    : FIDÈLE émeraude · RÉGULIER ambre · NOUVEAU zinc.
//   · Statuts intervention : DONE émeraude · SCHEDULED zinc · IN_PROGRESS
//                          ambre · CANCELLED terracotta.
// Chaque ton décline light/dark (charte rayon 0.625rem, textes [11px]).
// ============================================================================

import { Badge } from "@/components/ui/badge"
import { Zap } from "lucide-react"
import { num } from "@/lib/chart"

/* ============================== Contrats /api/hubs/* ============================== */

export interface HubDTO {
  id: string
  code: string
  name: string
  gouvernorat: string
  address: string
  lat: number
  lng: number
  status: string
  type: string
  openedAt: string | null
  surfaceM2: number | null
  dailyVehicles: number
  monthlyRevenue: number
  manager: string | null
  phone: string | null
  servicesCount: number
  activeServicesCount: number
  bookingsThisMonth: number
}

export interface HubServiceDTO {
  id: string
  hubId: string
  category: string
  name: string
  price: number | null
  status: string
  capacityPerDay: number | null
  bookingsThisMonth: number
  createdAt: string
}

export interface HubVehicleDTO {
  id: string
  hubId: string
  hubCode: string
  hubName: string
  plate: string
  brand: string
  model: string
  type: string
  clientName: string
  clientPhone: string
  segment: string
  lastVisit: string | null
  visitsCount: number
  estimatedRevenue: number
}

export interface HubInterventionDTO {
  id: string
  hubId: string
  hubCode: string
  hubName: string
  vehicleId: string | null
  serviceId: string | null
  serviceName: string | null
  serviceCategory: string | null
  type: string
  status: string
  price: number
  durationMin: number | null
  scheduledAt: string
}

export interface ClientsStatsDTO {
  total: number
  fidele: number
  regulier: number
  nouveau: number
  avgVisits: number
}

/* ============================== Statuts de hub ============================== */

export const HUB_STATUS_META: Readonly<
  Record<string, { label: string; dot: string; badge: string }>
> = {
  ACTIVE: {
    label: "Actif",
    dot: "bg-emerald-500",
    badge:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  },
  CONSTRUCTION: {
    label: "En construction",
    dot: "bg-amber-500",
    badge:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  },
  PLANNED: {
    label: "Planifié",
    dot: "bg-zinc-400",
    badge:
      "border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
  },
  CLOSED: {
    label: "Fermé",
    dot: "bg-zinc-500",
    badge:
      "border-zinc-400 bg-zinc-100 text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  },
}

export const HUB_TYPE_LABELS: Readonly<Record<string, string>> = {
  MULTISERVICE: "Multiservice",
  ROUTIER: "Routier",
  "RÉSIDENTIEL": "Résidentiel",
  AUTO: "Automatisé",
}

/** Options de filtre « type de hub » (4 types du schéma). */
export const HUB_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "MULTISERVICE", label: "Multiservice" },
  { value: "ROUTIER", label: "Routier" },
  { value: "RÉSIDENTIEL", label: "Résidentiel" },
  { value: "AUTO", label: "Automatisé" },
]

/** Les 24 gouvernorats (référentiel INS — même liste que la carte interactive). */
export const GOVS_24: readonly string[] = [
  "Tunis", "Ariana", "Ben Arous", "Manouba", "Nabeul", "Bizerte",
  "Sfax", "Sousse", "Monastir", "Mahdia", "Kairouan", "Zaghouan",
  "Béja", "Jendouba", "Le Kef", "Siliana", "Sidi Bouzid", "Kasserine",
  "Gabès", "Médenine", "Tataouine", "Gafsa", "Tozeur", "Kébili",
]

/* ============================== Services ============================== */

/** Ordre canonique des catégories (tableau + vue groupée). */
export const SERVICE_ORDER: readonly string[] = [
  "LAVAGE",
  "VIDANGE",
  "PNEUS",
  "RECHARGE",
  "BOUTIQUE",
  "CAFÉ",
  "LAVERIE",
  "RELAIS",
]

export const SERVICE_META: Readonly<
  Record<string, { label: string; badge: string }>
> = {
  LAVAGE: {
    label: "Lavage",
    badge:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  },
  VIDANGE: {
    label: "Vidange",
    badge:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  },
  PNEUS: {
    label: "Pneus",
    badge:
      "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400",
  },
  RECHARGE: {
    label: "Recharge VE",
    badge:
      "border-emerald-700 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600 dark:text-white",
  },
  BOUTIQUE: {
    label: "Boutique",
    badge:
      "border-zinc-300 bg-transparent text-zinc-600 dark:border-zinc-700 dark:text-zinc-400",
  },
  CAFÉ: {
    label: "Café",
    badge:
      "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-900/40 dark:text-amber-300",
  },
  LAVERIE: {
    label: "Laverie",
    badge:
      "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
  },
  RELAIS: {
    label: "Relais colis",
    badge:
      "border-emerald-300 bg-transparent text-emerald-700 dark:border-emerald-700 dark:text-emerald-400",
  },
}

export const SERVICE_STATUS_META: Readonly<
  Record<string, { label: string; badge: string }>
> = {
  ACTIVE: {
    label: "Actif",
    badge:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  },
  PAUSED: {
    label: "En pause",
    badge:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  },
  CLOSED: {
    label: "Clôturé",
    badge:
      "border-zinc-400 bg-zinc-100 text-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  },
}

/* ============================== Véhicules / clients ============================== */

export const VEHICLE_TYPE_META: Readonly<
  Record<string, { label: string; badge: string; ev?: boolean }>
> = {
  UTILITAIRE: {
    label: "Utilitaire",
    badge:
      "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
  },
  BERLINE: {
    label: "Berline",
    badge:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  },
  SUV: {
    label: "SUV",
    badge:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  },
  POIDS_LOURD: {
    label: "Poids lourd",
    badge:
      "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400",
  },
  "ÉLECTRIQUE": {
    label: "Électrique",
    badge:
      "border-emerald-700 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600 dark:text-white",
    ev: true,
  },
}

export const SEGMENT_META: Readonly<
  Record<string, { label: string; badge: string }>
> = {
  "FIDÈLE": {
    label: "Fidèle",
    badge:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  },
  "RÉGULIER": {
    label: "Régulier",
    badge:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  },
  NOUVEAU: {
    label: "Nouveau",
    badge:
      "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
  },
}

export const INTERVENTION_STATUS_META: Readonly<
  Record<string, { label: string; badge: string }>
> = {
  DONE: {
    label: "Réalisée",
    badge:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  },
  SCHEDULED: {
    label: "Planifiée",
    badge:
      "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
  },
  IN_PROGRESS: {
    label: "En cours",
    badge:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  },
  CANCELLED: {
    label: "Annulée",
    badge:
      "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400",
  },
}

export const INTERVENTION_TYPE_LABELS: Readonly<Record<string, string>> = {
  VIDANGE: "Vidange",
  LAVAGE: "Lavage",
  PNEUS: "Pneus",
  "RÉPARATION": "Réparation",
  "CONTRÔLE": "Contrôle",
  RECHARGE: "Recharge",
}

/* ============================== Helpers de formatage ============================== */

/** Date FR jj/mm/aaaa (même format que l'export CSV). */
export function dateFr(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("fr-FR").format(d)
}

/** Date FR relative (« il y a 3 jours ») — Intl.RelativeTimeFormat, miroir veille-utils. */
const rtf = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" })

export function relativeDateFr(iso: string | null): string {
  if (!iso) return "jamais"
  const t = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(t)) return "—"
  const min = Math.round(t / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return rtf.format(-min, "minute")
  const h = Math.round(min / 60)
  if (h < 24) return rtf.format(-h, "hour")
  const d = Math.round(h / 24)
  if (d < 31) return rtf.format(-d, "day")
  const m = Math.round(d / 30)
  if (m < 12) return rtf.format(-m, "month")
  return rtf.format(-Math.round(m / 12), "year")
}

/** DT → « 184,5 kDT » (1 décimale, virgule FR). */
export function kdt(v: number): string {
  return `${(v / 1000).toFixed(1).replace(".", ",")} kDT`
}

/** Prix DT → « 95 DT » (entier FR) ; null → « — » (vente libre). */
export function priceFr(v: number | null): string {
  if (v == null) return "—"
  return `${num(v)} DT`
}

/** Durée en minutes → « 45 min » / « 1 h 30 » ; null → « — ». */
export function durationFr(v: number | null): string {
  if (v == null) return "—"
  if (v < 60) return `${v} min`
  return `${Math.floor(v / 60)} h ${String(v % 60).padStart(2, "0")}`
}

/** Pourcentage FR 1 décimale (« 30,9 % »). */
export function pctFr(v: number): string {
  return `${v.toFixed(1).replace(".", ",")} %`
}

/** Recherche insensible à la casse et aux accents (miroir serveur). */
export function normalizeFr(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/* ============================== Petits composants ============================== */

/** Badge catégorie de service (mapping tonné documenté en tête de fichier). */
export function ServiceCategoryBadge({ category }: { category: string }) {
  const meta = SERVICE_META[category]
  if (!meta) return <Badge variant="outline" className="text-[11px]">{category}</Badge>
  return (
    <Badge variant="outline" className={`text-[11px] ${meta.badge}`}>
      {meta.label}
    </Badge>
  )
}

/** Badge statut de service (Actif / En pause / Clôturé). */
export function ServiceStatusBadge({ status }: { status: string }) {
  const meta = SERVICE_STATUS_META[status]
  if (!meta) return <Badge variant="outline" className="text-[11px]">{status}</Badge>
  return (
    <Badge variant="outline" className={`text-[11px] ${meta.badge}`}>
      {meta.label}
    </Badge>
  )
}

/** Badge type de véhicule (ÉLECTRIQUE = émeraude plein + icône Zap). */
export function VehicleTypeBadge({ type }: { type: string }) {
  const meta = VEHICLE_TYPE_META[type]
  if (!meta) return <Badge variant="outline" className="text-[11px]">{type}</Badge>
  return (
    <Badge variant="outline" className={`gap-1 text-[11px] ${meta.badge}`}>
      {meta.ev && <Zap className="h-3 w-3" aria-hidden />}
      {meta.label}
    </Badge>
  )
}

/** Badge segment de fidélité client (Fidèle / Régulier / Nouveau). */
export function SegmentBadge({ segment }: { segment: string }) {
  const meta = SEGMENT_META[segment]
  if (!meta) return <Badge variant="outline" className="text-[11px]">{segment}</Badge>
  return (
    <Badge variant="outline" className={`text-[11px] ${meta.badge}`}>
      {meta.label}
    </Badge>
  )
}

/** Badge statut d'intervention (Réalisée / Planifiée / En cours / Annulée). */
export function InterventionStatusBadge({ status }: { status: string }) {
  const meta = INTERVENTION_STATUS_META[status]
  if (!meta) return <Badge variant="outline" className="text-[11px]">{status}</Badge>
  return (
    <Badge variant="outline" className={`text-[11px] ${meta.badge}`}>
      {meta.label}
    </Badge>
  )
}

/** Badge statut de hub (Actif / En construction / Planifié / Fermé). */
export function HubStatusBadge({ status }: { status: string }) {
  const meta = HUB_STATUS_META[status]
  if (!meta) return <Badge variant="outline" className="text-[11px]">{status}</Badge>
  return (
    <Badge variant="outline" className={`text-[11px] ${meta.badge}`}>
      {meta.label}
    </Badge>
  )
}
