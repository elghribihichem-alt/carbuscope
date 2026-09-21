'use client'

// CarbuScope — Éléments partagés du module Calculateurs (A.6)

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BookmarkPlus, RotateCcw, Route, Radar, Car, Coins, MapPinned, Eye, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SavedCalculationDTO } from "@/lib/types"

// ---------- Identifiants & définitions des calculateurs ----------

export type CalcId = "trafic" | "couverture" | "parc" | "rentabilite" | "multi-sites" | "veille"

export const CALC_DEFS: {
  id: CalcId
  saveType: string
  title: string
  description: string
  icon: LucideIcon
  tint: string
}[] = [
  {
    id: "trafic",
    saveType: "trafic-captif",
    title: "Trafic captif",
    description: "Potentiel de captation VL/PL d'un axe routier, avec saisonnalité.",
    icon: Route,
    tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  },
  {
    id: "couverture",
    saveType: "couverture",
    title: "Couverture concurrentielle",
    description: "Saturation et niches de différenciation autour d'une station.",
    icon: Radar,
    tint: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  },
  {
    id: "parc",
    saveType: "parc-auto",
    title: "Parc automobile",
    description: "Demande carburant, entretien et recharge par gouvernorat.",
    icon: Car,
    tint: "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-400",
  },
  {
    id: "rentabilite",
    saveType: "rentabilite",
    title: "Rentabilité prévisionnelle",
    description: "Marge, seuil de rentabilité, TRI et cash-flow sur 10 ans.",
    icon: Coins,
    tint: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  },
  {
    id: "multi-sites",
    saveType: "multi-sites",
    title: "Comparaison multi-sites",
    description: "Score composite et classement de 2 à 10 sites candidats.",
    icon: MapPinned,
    tint: "bg-[#d9a514]/15 text-[#8a6d10] dark:bg-[#d9a514]/20 dark:text-[#e5c762]",
  },
  {
    id: "veille",
    saveType: "veille-concurrentielle",
    title: "Veille concurrentielle",
    description: "Mouvements et axes stratégiques d'une enseigne cible.",
    icon: Eye,
    tint: "bg-[#e07856]/15 text-[#b8542f] dark:bg-[#e07856]/20 dark:text-[#e8a084]",
  },
]

export const CALC_BY_SAVE_TYPE: Record<string, CalcId> = Object.fromEntries(
  CALC_DEFS.map((d) => [d.saveType, d.id])
)

export const CALC_LABELS: Record<string, string> = Object.fromEntries(CALC_DEFS.map((d) => [d.saveType, d.title]))

// ---------- Formatage (fr-FR) ----------

export const fmtInt = (v: number): string =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number.isFinite(v) ? v : 0)

export const fmtDec = (v: number, digits = 1): string =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    Number.isFinite(v) ? v : 0
  )

export const fmtTnd = (v: number): string => `${fmtInt(v)} TND`
export const fmtPct = (v: number, digits = 0): string => `${fmtDec(v, digits)} %`
export const fmtKm = (v: number): string => `${fmtDec(v, 1)} km`

export const fmtDateFr = (iso: string): string =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })

// ---------- Constantes métier ----------

export const MONTHS_FR = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."]

/** Coefficients saisonniers mensuels (JICA / OMMP) — A.6.1 */
export const MONTHS_COEF = [0.85, 0.86, 0.92, 0.98, 1.05, 1.12, 1.18, 1.15, 1.02, 0.95, 0.88, 0.9]

export const PRIX_LITRE_TND = 2.5

// ---------- Panneaux de mise en page ----------

export function ParamsPanel({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

export function ResultsPanel({ children, busy }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <div className={cn("space-y-4 transition-opacity", busy && "pointer-events-none opacity-50")} aria-live="polite">
      {children}
    </div>
  )
}

export function ChartBlock({
  title,
  sub,
  children,
  className,
  style,
}: {
  title: string
  sub?: string
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-semibold">{title}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      <div className={cn("mt-3 h-60 w-full sm:h-64", className)} style={style}>{children}</div>
    </div>
  )
}

// ---------- Contrôles de paramètres ----------

export function SliderParam({
  label,
  value,
  min,
  max,
  step = 1,
  onValueChange,
  format,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onValueChange: (v: number) => void
  format?: (v: number) => string
  hint?: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs font-medium">{label}</Label>
        <span className="text-sm font-semibold tabular-nums text-primary">{format ? format(value) : fmtInt(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onValueChange(v[0] ?? value)}
        aria-label={label}
      />
      {hint && <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function NumberParam({
  label,
  value,
  onValueChange,
  suffix,
  step = 1,
  hint,
}: {
  label: string
  value: number
  onValueChange: (v: number) => void
  suffix?: string
  step?: number
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : 0}
          min={0}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value)
            onValueChange(Number.isFinite(n) && n >= 0 ? n : 0)
          }}
          className="h-9 tabular-nums"
          aria-label={label}
        />
        {suffix && <span className="shrink-0 text-xs font-medium text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function SelectParam({
  label,
  value,
  onValueChange,
  options,
  hint,
  disabled,
}: {
  label: string
  value: string
  onValueChange: (v: string) => void
  options: { value: string; label: string; description?: string }[]
  hint?: string
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <span className="flex flex-col">
                <span className="truncate">{o.label}</span>
                {o.description && <span className="text-[11px] text-muted-foreground">{o.description}</span>}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ---------- Barre de sauvegarde / réinitialisation ----------

export function SaveScenarioBar({
  defaultLabel,
  initialLabel,
  saving,
  onSave,
  onReset,
  extra,
}: {
  defaultLabel: string
  initialLabel?: string
  saving?: boolean
  onSave: (label: string) => void
  onReset: () => void
  extra?: React.ReactNode
}) {
  const [label, setLabel] = React.useState(initialLabel ?? "")
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={`scenario-name-${defaultLabel}`} className="text-xs font-medium">
            Nom du scénario (optionnel)
          </Label>
          <Input
            id={`scenario-name-${defaultLabel}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={defaultLabel}
            className="h-9"
            maxLength={80}
          />
        </div>
        {extra}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onSave(label.trim() || defaultLabel)} disabled={saving} className="h-9">
            <BookmarkPlus className="h-4 w-4" />
            {saving ? "Sauvegarde…" : "Sauvegarder le scénario"}
          </Button>
          <Button variant="outline" onClick={onReset} className="h-9">
            <RotateCcw className="h-4 w-4" />
            Réinitialiser
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- Utilitaires ----------

export function asNumber(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback
}

export type InitialScenario = Pick<SavedCalculationDTO, "label" | "params" | "result">
