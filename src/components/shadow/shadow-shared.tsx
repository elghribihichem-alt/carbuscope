'use client'

// Shadow Market (T44) — socle partagé du module : couleurs métier, badges,
// format TND, KPI, typologies, en-têtes de section. Les 6 sections s'appuient
// toutes sur ce fichier — ne pas dupliquer ces éléments ailleurs.
//
// Charte métier (validée par la direction) :
//   rouge  #E53935  menace critique (perte > 20 000 DT/mois)
//   orange #FF9800  menace modérée (5 000 – 20 000 DT)
//   jaune  #FFC107  vigilance (< 5 000 DT)
//   vert   #4CAF50  zone calme / aucun point
//   prune  #7C3AED  information & navigation (usage parcimonieux) — T53-T6a :
//                   était #2196F3 (bleu), requalifié prune conformément à la
//                   palette app (bleu/indigo interdits) ; clé `blue` conservée
//                   pour la stabilité des signatures (aucun consommateur à
//                   toucher).
//   gris   #9E9E9E  inactif / non renseigné

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Fuel, Store, Truck, Warehouse, Wrench, ShoppingBasket, CircleAlert, TrendingDown, TrendingUp, Users, Camera, Ban, Eye, Flame, Layers, type LucideIcon } from "lucide-react"
import type { ShadowLevel } from "@/lib/types"

// ---------------------------------------------------------------------------
// Couleurs métier
// ---------------------------------------------------------------------------

export const SHADOW_COLORS = {
  red: "#E53935",
  orange: "#FF9800",
  yellow: "#FFC107",
  green: "#4CAF50",
  blue: "#7C3AED",
  gray: "#9E9E9E",
} as const

export const LEVEL_COLORS: Record<ShadowLevel, string> = {
  RED: SHADOW_COLORS.red,
  ORANGE: SHADOW_COLORS.orange,
  YELLOW: SHADOW_COLORS.yellow,
  GREEN: SHADOW_COLORS.green,
}

export const LEVEL_LABELS: Record<ShadowLevel, string> = {
  RED: "Critique",
  ORANGE: "Modéré",
  YELLOW: "Vigilance",
  GREEN: "Calme",
}

/** Niveau de menace à partir d'une perte mensuelle (DT) et des seuils configurés. */
export function levelFromLoss(lossTnd: number, redTnd = 20000, orangeTnd = 5000): ShadowLevel {
  if (lossTnd >= redTnd) return "RED"
  if (lossTnd >= orangeTnd) return "ORANGE"
  if (lossTnd > 0) return "YELLOW"
  return "GREEN"
}

// ---------------------------------------------------------------------------
// Typologies (icônes lucide par code — miroir des libellés seedés)
// ---------------------------------------------------------------------------

export const TYPOLOGY_ICONS: Record<string, LucideIcon> = {
  BIDONS: Fuel,
  KIOSQUE: Store,
  CAMION_CITERNE: Truck,
  STATION_PIRATE: Warehouse,
  GARAGE: Wrench,
  EPICERIE: ShoppingBasket,
}

export const TYPOLOGY_LABELS: Record<string, string> = {
  BIDONS: "Bidons bord de route",
  KIOSQUE: "Kiosque / épicerie",
  CAMION_CITERNE: "Camion-citerne",
  STATION_PIRATE: "Station pirate",
  GARAGE: "Garage",
  EPICERIE: "Boutique / épicerie",
}

export const TYPOLOGY_PHOTOS: Record<string, string> = {
  BIDONS: "/images/shadow/bidons-route.png",
  KIOSQUE: "/images/shadow/kiosque-essence.png",
  CAMION_CITERNE: "/images/shadow/camion-citerne.png",
  STATION_PIRATE: "/images/shadow/station-pirate.png",
  GARAGE: "/images/shadow/garage-clandestin.png",
  EPICERIE: "/images/shadow/epicerie-fuel.png",
}

export function TypologyIcon({ code, className }: { code: string; className?: string }) {
  const Icon = TYPOLOGY_ICONS[code] ?? CircleAlert
  return <Icon className={className} aria-hidden />
}

export function typologyLabel(code: string, fallback?: string): string {
  return TYPOLOGY_LABELS[code] ?? fallback ?? code
}

// ---------------------------------------------------------------------------
// Formatage
// ---------------------------------------------------------------------------

/** 1234567 → « 1,2 M DT » · 340000 → « 340 K DT » · 8500 → « 8 500 DT » */
export function formatTnd(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M DT`
  if (abs >= 10_000) return `${Math.round(n / 1000).toLocaleString("fr-FR")} K DT`
  return `${Math.round(n).toLocaleString("fr-FR")} DT`
}

/** Volume litres/jour : 12500 → « 12 500 L/j ». */
export function formatLJ(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} L/j`
}

/** Prix en millimes : 1480 → « 1 480 mill. » (≈ 1,480 DT). */
export function formatMillimes(n: number | null | undefined): string {
  if (n == null) return "—"
  return `${n.toLocaleString("fr-FR")} mill.`
}

export function formatPct(n: number, digits = 0): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString("fr-FR", { maximumFractionDigits: digits })} %`
}

/** Date relative courte en français : « il y a 3 j », « à l'instant ». */
export function relDateFr(iso: string): string {
  const d = new Date(iso).getTime()
  const diffMs = Date.now() - d
  const min = Math.round(diffMs / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.round(h / 24)
  if (j < 30) return `il y a ${j} j`
  const mois = Math.round(j / 30)
  return `il y a ${mois} mois`
}

export const dateFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso))

/** « 2026-09 » → « sept. 2026 ». */
export function monthLabelFr(month: string): string {
  const [y, m] = month.split("-")
  const d = new Date(Number(y), Number(m) - 1, 1)
  return new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" }).format(d)
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export function ShadowLevelBadge({ level, loss }: { level: ShadowLevel; loss?: number }) {
  const color = LEVEL_COLORS[level]
  const label = LEVEL_LABELS[level]
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="gap-1.5 border-transparent px-2 font-semibold text-white"
            style={{ backgroundColor: color }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-white/90" aria-hidden />
            {label}
            {loss != null && loss > 0 ? ` · ${formatTnd(loss)}` : ""}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Niveau de menace : {label}</p>
          {loss != null && loss > 0 && <p className="text-[11px] text-muted-foreground">Perte estimée : {formatTnd(loss)}/mois</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const STATUS_STYLES: Record<string, string> = {
  BRUT: "border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300",
  VERIFIE: "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  VALIDE: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  REJETE: "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
  // T53-T6a : slate → zinc (harmonisation neutres, pattern T53-T4b/T5b).
  DOUBLON: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
}

const STATUS_DOT: Record<string, string> = {
  BRUT: SHADOW_COLORS.gray,
  VERIFIE: SHADOW_COLORS.yellow,
  VALIDE: SHADOW_COLORS.green,
  REJETE: SHADOW_COLORS.red,
  DOUBLON: SHADOW_COLORS.blue,
}

export function ShadowStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    BRUT: "Brut", VERIFIE: "Vérifié", VALIDE: "Validé", REJETE: "Rejeté", DOUBLON: "Doublon",
  }
  return (
    <Badge variant="outline" className={`gap-1.5 ${STATUS_STYLES[status] ?? STATUS_STYLES.BRUT}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_DOT[status] ?? SHADOW_COLORS.gray }} aria-hidden />
      {labels[status] ?? status}
    </Badge>
  )
}

const KIND_ICONS: Record<string, LucideIcon> = {
  APPARITION: CircleAlert,
  DISPARITION: Ban,
  REAPPARITION: Eye,
  VOLUME: TrendingUp,
  PRIX: Layers,
  TYPE: Fuel,
  DEPLACEMENT: TrendingDown,
  STATUT: Users,
}

export function UpdateKindIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = KIND_ICONS[kind] ?? CircleAlert
  return <Icon className={className} aria-hidden />
}

export const ALERT_KIND_LABELS: Record<string, string> = {
  NEW_POINTS: "Nouveaux points",
  FIRE_RISK: "Danger incendie",
  SURGE: "Recrudescence",
  NEUTRALISE: "Neutralisation",
  DENSITE: "Densité anormale",
}

export function SeverityDot({ severity }: { severity: string }) {
  const color =
    severity === "CRITICAL" ? SHADOW_COLORS.red : severity === "MEDIUM" ? SHADOW_COLORS.orange : SHADOW_COLORS.yellow
  return <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
}

// ---------------------------------------------------------------------------
// KPI carte (variante « war room » du module — barre colorée + tendance)
// ---------------------------------------------------------------------------

export function ShadowKpiCard({
  value,
  label,
  sub,
  tone = "neutral",
  trend,
  trendLabel,
  icon,
  onClick,
}: {
  value: string
  label: string
  sub?: string
  tone?: "red" | "orange" | "yellow" | "green" | "neutral"
  trend?: number
  trendLabel?: string
  icon?: LucideIcon
  onClick?: () => void
}) {
  const toneColor =
    tone === "red" ? SHADOW_COLORS.red : tone === "orange" ? SHADOW_COLORS.orange : tone === "yellow" ? SHADOW_COLORS.yellow : tone === "green" ? SHADOW_COLORS.green : SHADOW_COLORS.gray
  const Icon = icon
  return (
    <Card
      className={`group border-stone-200/80 bg-white/95 shadow-sm transition-shadow dark:border-stone-800 dark:bg-stone-900/95 ${onClick ? "cursor-pointer hover:shadow-md" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <CardContent className="relative overflow-hidden p-4">
        <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: toneColor }} aria-hidden />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-stone-900 dark:text-stone-50">{value}</p>
            {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
            {trend != null && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold" style={{ color: trend > 0 ? SHADOW_COLORS.red : SHADOW_COLORS.green }}>
                {trend > 0 ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
                {formatPct(trend, 1)}
                {trendLabel ? <span className="font-normal text-muted-foreground">{trendLabel}</span> : null}
              </p>
            )}
          </div>
          {Icon && (
            <div className="rounded-lg p-2" style={{ backgroundColor: `${toneColor}1A`, color: toneColor }}>
              <Icon className="h-4.5 w-4.5" aria-hidden />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// En-tête de section (titre + description + actions)
// ---------------------------------------------------------------------------

export function SectionHeader({
  emoji,
  title,
  description,
  actions,
}: {
  emoji?: string
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
          {emoji ? <span aria-hidden>{emoji}</span> : null}
          {title}
        </h2>
        {description && <p className="mt-0.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** Petit bloc « hypothèses de calcul » réutilisé par les analyses d'impact. */
export function AssumptionNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground dark:border-stone-700 dark:bg-stone-900">
      <Flame className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

/** Photo terrain (placeholder élégant si absente). */
export function ShadowPhoto({
  url,
  alt,
  className = "h-40 w-full object-cover",
  typology,
}: {
  url: string | null
  alt: string
  className?: string
  typology?: string
}) {
  if (url) return <img src={url} alt={alt} className={className} loading="lazy" />
  return (
    <div className={`flex items-center justify-center bg-stone-100 dark:bg-stone-800 ${className}`} role="img" aria-label={alt}>
      <div className="flex flex-col items-center gap-1.5 text-stone-400">
        <Camera className="h-6 w-6" aria-hidden />
        <span className="text-[10px] font-medium">{typology ? typologyLabel(typology) : "Photo terrain"}</span>
      </div>
    </div>
  )
}
