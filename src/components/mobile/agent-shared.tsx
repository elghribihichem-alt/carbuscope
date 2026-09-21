'use client'

// CarbuScope Mobile — Espace agent (T28 · veille terrain) — socle partagé
// Connexion par code agent, missions de contrôle / veille concurrentielle,
// rapports de visite. Identité pro : bandeau émeraude foncé « Espace agent »,
// badges enseigne, chiffres tabular-nums. UI 100 % française.

import type { LucideIcon } from "lucide-react"
import { ChevronLeft, Eye, Fuel, MapPin, Minus, Plus, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { BrandDot } from "./shared"
import type {
  BrandDTO,
  FieldAgentDTO,
  FuelPriceCurrent,
  MissionDTO,
  MissionDetailDTO,
  MissionStatus,
  MissionTaskDTO,
  MissionTaskStatus,
  MissionType,
  VisitReportInput,
} from "@/lib/types"

// ---------- Types (session agent) ----------

/** Résumé de l'agent connecté (consommé par la carte du profil) */
export type AgentSummary = { code: string; name: string; brandSlug: string; zone: string }

/** Résultat d'un POST /api/reports — alimente l'écran de confirmation */
export type AgentReportResult = {
  targetLabel: string
  missionTitle: string
  taskStatus: MissionTaskStatus
  missionStatus: MissionStatus
}

/** Champs du rapport de visite (taskId + agentCode ajoutés par le routeur) */
export type ReportPayload = Omit<VisitReportInput, "taskId" | "agentCode">

export interface AgentApi {
  agent: FieldAgentDTO | null
  missions: MissionDTO[]
  mission: MissionDetailDTO | null
  missionLoading: boolean
  missionError: string | null
  retryMission: () => void
  task: MissionTaskDTO | null
  reportResult: AgentReportResult | null
  prices: FuelPriceCurrent[] // prix du décret en vigueur (pré-remplissage + comparaison)
  brands: BrandDTO[]
  login: (code: string) => Promise<void>
  logout: () => void
  openMission: (id: string) => void
  openReport: (task: MissionTaskDTO) => void
  submitReport: (payload: ReportPayload) => Promise<void>
  back: () => void
  goHome: () => void
}

// ---------- Helpers ----------

// Date FR courte (réexport du socle mobile — ex. « 22 sept. 2026 »)
export { dateFr } from "./shared"

/** Millimes → « 1,885 DT » (fr, 3 décimales) */
export const fmtDt = (millimes: number): string => (millimes / 1000).toFixed(3).replace(".", ",")

export const isOverdue = (m: { dueDate: string | null; status: MissionStatus }): boolean =>
  !!m.dueDate && new Date(m.dueDate).getTime() < Date.now() && m.status !== "TERMINEE" && m.status !== "ANNULEE"

export const remainingTargets = (m: MissionDTO): number =>
  Math.max(0, m.tasksTotal - m.tasksDone - m.tasksAnomaly)

export const pluralFr = (n: number, one: string, many?: string): string =>
  n > 1 ? `${n} ${many ?? `${one}s`}` : `${n} ${one}`

export const complianceTone = (score: number): { label: string; chip: string } => {
  if (score >= 90) return { label: "Conforme", chip: "border-emerald-300/70 bg-emerald-50 text-emerald-700" }
  if (score >= 70) return { label: "À surveiller", chip: "border-amber-300/70 bg-amber-50 text-amber-700" }
  return { label: "Critique", chip: "border-red-300/70 bg-red-50 text-red-700" }
}

// ---------- Méta (badges) ----------

export const TYPE_META: Record<MissionType, { label: string; short: string; icon: LucideIcon; chip: string }> = {
  CONTROLE: {
    label: "Contrôle d'enseigne",
    short: "Contrôle",
    icon: ShieldCheck,
    chip: "border-emerald-300/70 bg-emerald-50 text-emerald-700",
  },
  VEILLE_CONCURRENT: {
    label: "Veille concurrentielle",
    short: "Veille",
    icon: Eye,
    chip: "border-orange-300/70 bg-orange-50 text-orange-700",
  },
}

export const MISSION_STATUS_META: Record<MissionStatus, { label: string; chip: string }> = {
  PLANIFIEE: { label: "Planifiée", chip: "border-slate-300 bg-slate-100 text-slate-600" },
  EN_COURS: { label: "En cours", chip: "border-amber-300/70 bg-amber-50 text-amber-700" },
  TERMINEE: { label: "Terminée", chip: "border-emerald-300/70 bg-emerald-100 text-emerald-800" },
  ANNULEE: { label: "Annulée", chip: "border-slate-300 bg-slate-50 text-slate-400" },
}

export const TASK_STATUS_META: Record<MissionTaskStatus, { label: string; chip: string }> = {
  TODO: { label: "À contrôler", chip: "border-emerald-400/80 bg-emerald-50/50 text-emerald-700" },
  FAITE: { label: "Faite", chip: "border-transparent bg-emerald-600 text-white" },
  ANOMALIE: { label: "Anomalie", chip: "border-transparent bg-red-500 text-white" },
}

export function MissionTypeBadge({ type, className }: { type: MissionType; className?: string }) {
  const meta = TYPE_META[type]
  const Icon = meta.icon
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-bold", meta.chip, className)}>
      <Icon className="h-3 w-3" />
      {meta.short}
    </span>
  )
}

export function MissionStatusBadge({ status, className }: { status: MissionStatus; className?: string }) {
  const meta = MISSION_STATUS_META[status]
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9.5px] font-bold", meta.chip, className)}>
      {meta.label}
    </span>
  )
}

export function TaskStatusBadge({ status, className }: { status: MissionTaskStatus; className?: string }) {
  const meta = TASK_STATUS_META[status]
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9.5px] font-bold", meta.chip, className)}>
      {meta.label}
    </span>
  )
}

// ---------- Atomes UI agent ----------

/** Bandeau supérieur « Espace agent » — dégradé émeraude foncé, logo, retour */
export function AgentBand({
  title, subtitle, onBack, right, children,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  right?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-700 px-2 pb-3 pt-2 text-white">
      <span aria-hidden className="absolute -end-10 -top-16 h-40 w-40 rounded-full bg-white/5" />
      <span aria-hidden className="absolute -start-14 -bottom-20 h-36 w-36 rounded-full bg-white/5" />
      <div className="relative flex items-center gap-1.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 active:bg-white/25"
          >
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
        )}
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
          <Fuel className="h-4.5 w-4.5 text-emerald-50" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] text-emerald-200/90">Espace agent · Veille terrain</p>
          <h1 className="truncate text-[14.5px] font-bold leading-tight text-white">{title}</h1>
          {subtitle && <p className="truncate text-[10.5px] font-medium leading-tight text-emerald-100/85">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </header>
  )
}

/** Ligne d'identité agent (code mono, enseigne, zone) — sous le bandeau */
export function AgentIdentityLine({ agent, brands }: { agent: FieldAgentDTO; brands: BrandDTO[] }) {
  const brand = brands.find(b => b.slug === agent.brandSlug)
  return (
    <div className="relative mt-2.5 flex flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-white/15 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-emerald-50">
        {agent.code}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-50">
        <BrandDot color={brand?.color ?? "#34d399"} />
        {brand?.name ?? agent.brandSlug}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-50">
        <MapPin className="h-3 w-3" />
        {agent.zone}
      </span>
    </div>
  )
}

/** Barre d'avancement d'une mission (émeraude = faites, rouge = anomalies) */
export function MissionProgressBar({ mission, className }: { mission: MissionDTO; className?: string }) {
  const total = Math.max(1, mission.tasksTotal)
  const treated = mission.tasksDone + mission.tasksAnomaly
  return (
    <div
      className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)}
      role="progressbar"
      aria-label="Avancement de la mission"
      aria-valuemin={0}
      aria-valuemax={mission.tasksTotal}
      aria-valuenow={treated}
    >
      <div className="h-full bg-emerald-500" style={{ width: `${(mission.tasksDone / total) * 100}%` }} />
      <div className="h-full bg-red-400" style={{ width: `${(mission.tasksAnomaly / total) * 100}%` }} />
    </div>
  )
}

/** Stepper −/+ (file d'attente, personnel en poste) */
export function Stepper({
  label, value, onChange, min = 0, max = 60, step = 1, unit, icon: Icon,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  icon?: LucideIcon
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
      {Icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold leading-tight text-slate-600">{label}</p>
        <p className="mt-0.5 text-[16px] font-extrabold leading-none tabular-nums text-slate-800">
          {value}
          {unit && <span className="ms-1 text-[10px] font-semibold text-slate-400">{unit}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          aria-label={`${label} : diminuer`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition-all hover:border-emerald-300 hover:text-emerald-700 active:scale-90 disabled:pointer-events-none disabled:opacity-35"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          aria-label={`${label} : augmenter`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition-all hover:border-emerald-300 hover:text-emerald-700 active:scale-90 disabled:pointer-events-none disabled:opacity-35"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/** Notation par points émeraude (propreté 1 → 5) */
export function DotsRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const editable = Boolean(onChange)
  return (
    <div
      className="flex items-center gap-2.5"
      role={editable ? "radiogroup" : undefined}
      aria-label="Propreté (1 à 5)"
    >
      {[1, 2, 3, 4, 5].map(i => {
        const on = i <= value
        const dot = (
          <span
            className={cn(
              "block h-4 w-4 rounded-full transition-all",
              on ? "bg-emerald-500" : "bg-slate-200",
              editable && "hover:scale-110",
              editable && i === value && "ring-2 ring-emerald-200 ring-offset-1"
            )}
          />
        )
        return editable ? (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={i === value}
            aria-label={`${i} sur 5`}
            onClick={() => {
              if (onChange) onChange(i)
            }}
            className="transition-transform active:scale-90"
          >
            {dot}
          </button>
        ) : (
          <span key={i}>{dot}</span>
        )
      })}
      <span className="text-[11px] font-bold tabular-nums text-slate-500">{value > 0 ? `${value}/5` : "—"}</span>
    </div>
  )
}
