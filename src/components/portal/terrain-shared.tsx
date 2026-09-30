'use client'

// CarbuScope — Veille terrain du portail enseigne (T28, onglet « Veille terrain »)
// Helpers partagés entre les sections : formatage prix millimes → dinars, badges
// de type/statut, étoiles de propreté, seuils de conformité, lookup enseigne.
// Palette : émeraude (primaire), ambre, terracotta, prune, ardoise — pas de bleu.

import { Badge } from "@/components/ui/badge"
import { Eye, ShieldCheck, Star } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { MissionStatus, MissionTaskStatus, MissionType, VisitReportDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

// ---------- Constantes ----------

export const NEUTRAL_DOT = "#94a3b8"
export const DAY_MS = 86_400_000
export const MAX_TARGETS = 30

/** Prix en millimes → « 1,885 DT » (3 décimales, format fr) */
export const fmtDt = (millimes: number): string =>
  `${(millimes / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} DT`

/** Écart signé en millimes → « +20 millimes » / « −20 millimes » */
export const fmtMillimesDelta = (delta: number): string =>
  `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)} millimes`

/** Nombre décimal éventuel en virgule française (propreté « 3,5/5 »), pattern fmt1 (T53-T5). */
export const fmtNote = (v: number): string =>
  v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })

/** Recherche insensible à la casse et aux accents (« gabes » → « Gabès », pattern T53-T3). */
export const normalizeFr = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

/** Mission dépassée : échéance passée et mission non fermée */
export const isMissionOverdue = (m: { dueDate: string | null; status: MissionStatus }): boolean => {
  if (!m.dueDate || m.status === "TERMINEE" || m.status === "ANNULEE") return false
  const due = new Date(m.dueDate)
  due.setHours(23, 59, 59, 999)
  return due.getTime() < Date.now()
}

/** Lookup enseigne (nom + couleur) à partir de la liste /api/brands */
export type BrandLookup = (slug: string | null) => { name: string; color: string }

export const makeBrandLookup = (brands: { slug: string; name: string; color: string }[] | null): BrandLookup =>
  (slug) => {
    const b = brands?.find(x => x.slug === slug)
    return { name: b?.name ?? slug ?? "—", color: b?.color ?? NEUTRAL_DOT }
  }

// ---------- Métadonnées métier ----------

export const MISSION_TYPES: MissionType[] = ["CONTROLE", "VEILLE_CONCURRENT"]
export const MISSION_STATUSES: MissionStatus[] = ["PLANIFIEE", "EN_COURS", "TERMINEE", "ANNULEE"]
export const TASK_STATUSES: MissionTaskStatus[] = ["TODO", "FAITE", "ANOMALIE"]

export const TYPE_META: Record<MissionType, {
  label: string
  chip: string
  icon: LucideIcon
  iconBg: string
  cardTitle: string
  cardDesc: string
}> = {
  CONTROLE: {
    label: "Contrôle",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    icon: ShieldCheck,
    iconBg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    cardTitle: "Contrôle de mes stations",
    cardDesc: "Vérifier la conformité des stations de mon enseigne (fiche propriétaire).",
  },
  VEILLE_CONCURRENT: {
    label: "Veille",
    chip: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-400",
    icon: Eye,
    iconBg: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
    cardTitle: "Veille concurrentielle",
    cardDesc: "Observer les stations d'une enseigne concurrente (fiche concurrent).",
  },
}

export const STATUS_META: Record<MissionStatus, { label: string; chip: string; dot: string; rank: number }> = {
  EN_COURS: {
    label: "En cours",
    chip: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    dot: "bg-amber-500",
    rank: 0,
  },
  PLANIFIEE: {
    label: "Planifiée",
    // T53-T5 : neutres slate → zinc (harmonisation design system, pattern T53-T4b)
    chip: "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
    dot: "bg-zinc-400",
    rank: 1,
  },
  TERMINEE: {
    label: "Terminée",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    dot: "bg-emerald-500",
    rank: 2,
  },
  ANNULEE: {
    label: "Annulée",
    chip: "border-dashed border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-500",
    dot: "bg-zinc-300",
    rank: 3,
  },
}

export const TASK_STATUS_META: Record<MissionTaskStatus, { label: string; chip: string }> = {
  TODO: {
    label: "À faire",
    chip: "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
  },
  FAITE: {
    label: "Réalisée",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  },
  ANOMALIE: {
    label: "Anomalie",
    chip: "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400",
  },
}

// ---------- Petits composants de rendu ----------

export function TypeBadge({ type }: { type: MissionType }) {
  const Meta = TYPE_META[type] ?? TYPE_META.CONTROLE
  const Icon = Meta.icon
  return (
    <Badge variant="outline" className={cn("gap-1 text-[11px]", Meta.chip)}>
      <Icon className="h-3 w-3" aria-hidden />
      {Meta.label}
    </Badge>
  )
}

export function MissionStatusBadge({ status }: { status: MissionStatus }) {
  const Meta = STATUS_META[status] ?? STATUS_META.PLANIFIEE
  return <Badge variant="outline" className={cn("text-[11px]", Meta.chip)}>{Meta.label}</Badge>
}

export function TaskStatusBadge({ status }: { status: MissionTaskStatus }) {
  const Meta = TASK_STATUS_META[status] ?? TASK_STATUS_META.TODO
  return <Badge variant="outline" className={cn("text-[11px]", Meta.chip)}>{Meta.label}</Badge>
}

/** Point de couleur enseigne + nom (utilisé partout dans les fiches) */
export function BrandDot({
  color, name, className,
}: { color: string; name?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)}>
      <span
        className="h-2 w-2 shrink-0 rounded-full border border-black/10 dark:border-white/20"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {name && <span className="truncate">{name}</span>}
    </span>
  )
}

/** Conformité : badge seuils < 70 rouge · 70-89 ambre · ≥ 90 émeraude */
export function ComplianceBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>
  const cls = score < 70
    ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
    : score < 90
      ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
      : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
  return (
    <Badge variant="outline" className={cn("tabular-nums", cls)} title={`Score de conformité : ${score} %`}>
      {score} %
    </Badge>
  )
}

/** Propreté : 5 étoiles ambrées (remplies = arrondi de la note) */
export function CleanlinessStars({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>
  const rounded = Math.round(value)
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`Propreté : ${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} sur 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3 w-3",
            i < rounded ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
          )}
          aria-hidden
        />
      ))}
      <span className="ml-1 text-[11px] tabular-nums text-muted-foreground">
        {value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}/5
      </span>
    </span>
  )
}

// ---------- Agrégats partagés (fiche propriétaire, notes d'intelligence) ----------

/** Ligne « station contrôlée » dérivée des cibles des missions CONTROLE de mon enseigne */
export type OwnControlRow = {
  taskId: string
  missionId: string
  missionTitle: string
  missionStatus: MissionStatus
  zone: string
  targetLabel: string
  stationName: string
  stationCode: string | null
  taskStatus: MissionTaskStatus
  /** dernier rapport de visite remonté pour cette cible (null = pas encore visitée) */
  report: VisitReportDTO | null
}

/** Agrège un ensemble de lignes en statistiques de conformité (fiche propriétaire) */
export function aggregateOwnStats(rows: OwnControlRow[]) {
  const withReport = rows.filter(r => r.report !== null)
  const scores = withReport.map(r => r.report!.complianceScore).filter((v): v is number => v != null)
  const cleans = withReport.map(r => r.report!.cleanliness).filter((v): v is number => v != null)
  const queues = withReport.map(r => r.report!.queueMinutes).filter((v): v is number => v != null)
  const anomalyCount = rows.filter(r => r.taskStatus === "ANOMALIE").length
  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
  return {
    visitedCount: withReport.length,
    targetsCount: rows.length,
    anomalyPct: rows.length > 0 ? (anomalyCount / rows.length) * 100 : null,
    anomalyCount,
    complianceAvg: avg(scores),
    cleanlinessAvg: avg(cleans),
    queueAvg: avg(queues),
  }
}
