'use client'

// T51-b — Radar d'Opportunités : socle partagé du module (types locaux,
// formatage FR, hooks de données /api/opportunity/*, carte de Tunisie à
// bulles, badge de score, gauge de pipeline). Les 6 sous-modules s'appuient
// tous sur ce fichier — ne pas dupliquer ces éléments ailleurs.
//
// Charte : émeraude = OK / opportunité, ambre = vigilance, terracotta =
// alerte / priorité, teal = information. Aucun bleu/indigo.

import * as React from "react"
import { useCallback, useEffect, useState } from "react"
import { RotateCw, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { MAP_H, MAP_W, project } from "@/lib/geo"
import { TUNISIA_BORDER, DJERBA, KERKENNAH, CITIES } from "@/components/map/tunisia-geo"
import {
  FORMAT_LABELS,
  ZONE_STATUS_LABELS,
  type FeasibilityStudyDTO,
  type FranchiseCandidateDTO,
  type FranchiseContractDTO,
  type FranchiseKitItemDTO,
  type OpportunityAlertDTO,
  type OpportunitySettingDTO,
  type OpportunityZoneDTO,
  type RentabilitySimulationDTO,
} from "@/lib/t51-dto"

// ---------------------------------------------------------------------------
// Types locaux (contrats des réponses API)
// ---------------------------------------------------------------------------

export interface OppStats {
  total: number
  whiteZones: number
  avgScore: number
  topScore: number
  critical: number
  byFormat: { STATION: number; MICRO_HUB_EXPRESS: number; MOBILITY_HUB: number }
  pipeline: { IDENTIFIEE: number; QUALIFIEE: number; ETUDE: number; SIGNEE: number; EQUIPEE: number }
}

export interface OppZonesPayload {
  zones: OpportunityZoneDTO[]
  settings: OpportunitySettingDTO | null
  alerts: OpportunityAlertDTO[]
  stats: OppStats
}

/** Zone allégée renvoyée par GET /api/opportunity/etude. */
export interface EtudeZone {
  id: string
  zoneName: string
  delegation: string
  gouvernorat: string
  recommendedFormat: string
  scoreGlobal: number
  trafficDaily: number
}

export interface EtudePayload {
  zone: EtudeZone
  study: FeasibilityStudyDTO | null
  simulations: RentabilitySimulationDTO[]
}

/** Ligne « franchisé actif » calculée serveur (GET /api/opportunity/franchise). */
export interface FranchiseRow {
  hubId: string
  code: string
  name: string
  franchisee: string
  gouvernorat: string
  status: string
  openedAt: string
  rating: number
  contractRef: string | null
  ca30: number
  services30: number
  conversions90: number
  conversionRate: number
  caCaptured: number
  roiPct: number
}

export interface FranchisePayload {
  candidates: FranchiseCandidateDTO[]
  contracts: FranchiseContractDTO[]
  kit: FranchiseKitItemDTO[]
  franchises: FranchiseRow[]
}

// ---------------------------------------------------------------------------
// Formatage FR
// ---------------------------------------------------------------------------

const nf = new Intl.NumberFormat("fr-FR")

/** 1234567 → « 1 234 567 ». */
export const oppNum = (n: number): string => nf.format(Math.round(n))

/** 2800000 → « 2,8 M DT » · 340000 → « 340 K DT » · 8500 → « 8 500 DT ». */
export function oppDt(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M DT`
  if (abs >= 10_000) return `${Math.round(n / 1000).toLocaleString("fr-FR")} K DT`
  return `${Math.round(n).toLocaleString("fr-FR")} DT`
}

/** 12.5 → « 12,5 » · 6 → « 6 ». */
export const oppDec = (n: number): string =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })

/** 6.5 → « 6,5 % ». */
export const oppPct = (n: number, digits = 1): string =>
  `${n.toLocaleString("fr-FR", { maximumFractionDigits: digits })} %`

/** 8.4 → « 8,4 km ». */
export const oppKm = (n: number): string => `${oppDec(n)} km`

export const oppDateFr = (iso: string): string =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso))

/** Date relative courte : « il y a 3 j ». */
export function oppRelFr(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.round(h / 24)
  if (j < 30) return `il y a ${j} j`
  return `il y a ${Math.round(j / 30)} mois`
}

// ---------------------------------------------------------------------------
// Tonalités métier (pas de bleu)
// ---------------------------------------------------------------------------

export type OppTone = "danger" | "warning" | "ok" | "info"

/** Tonalité hex (terracotta / ambre / émeraude / teal). */
export const TONE_HEX: Record<OppTone, string> = {
  danger: "#b0563b",
  warning: "#c98a2d",
  ok: "#059669",
  info: "#0d9488",
}

/** Classes de badge par tonalité (claro + dark). */
export const TONE_BADGE: Record<OppTone, string> = {
  ok: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  danger: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
  info: "border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300",
}

/** Tonalité d'un score pondéré : ≥ 70 émeraude, ≥ 55 ambre, sinon terracotta. */
export function scoreTone(score: number): OppTone {
  if (score >= 70) return "ok"
  if (score >= 55) return "warning"
  return "danger"
}

/** Tonalité par format recommandé. */
export const FORMAT_TONE: Record<string, OppTone> = {
  STATION: "info",
  MICRO_HUB_EXPRESS: "warning",
  MOBILITY_HUB: "ok",
}

/** Styles de liste scrollable (charte : max-h-96 + scrollbar fine). */
export const oppScrollList =
  "max-h-96 overflow-y-auto pr-1 [scrollbar-width:thin] " +
  "[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full " +
  "[&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-700"

/** Libellé de tonalité (légendes de cartes). */
export const TONE_LABEL: Record<OppTone, string> = {
  ok: "Émeraude — fort potentiel",
  warning: "Ambre — potentiel moyen",
  danger: "Terracotta — à instruire",
  info: "Teal — informatif",
}

// ---------------------------------------------------------------------------
// Critères de scoring (poids issus du paramétrage enseigne / SA)
// ---------------------------------------------------------------------------

export interface CriterionMeta {
  key: "scorePark" | "scorePower" | "scoreTraffic" | "scoreCompetition" | "scoreFoncier"
  label: string
  weight: number
}

/** Les 5 critères avec leurs poids (paramétrage ou défaut 30/20/25/15/10). */
export function criteriaMeta(settings: OpportunitySettingDTO | null): CriterionMeta[] {
  const w = settings
    ? {
        park: settings.weightPark,
        power: settings.weightPower,
        traffic: settings.weightTraffic,
        competition: settings.weightCompetition,
        foncier: settings.weightFoncier,
      }
    : { park: 0.3, power: 0.2, traffic: 0.25, competition: 0.15, foncier: 0.1 }
  return [
    { key: "scorePark", label: "Parc automobile", weight: w.park },
    { key: "scorePower", label: "Pouvoir d'achat", weight: w.power },
    { key: "scoreTraffic", label: "Trafic routier", weight: w.traffic },
    { key: "scoreCompetition", label: "Concurrence", weight: w.competition },
    { key: "scoreFoncier", label: "Foncier", weight: w.foncier },
  ]
}

// ---------------------------------------------------------------------------
// Référentiel routier (TMJ indicatifs — onglet Trafic)
// ---------------------------------------------------------------------------

export const ROAD_AXES: { code: string; label: string; tmj: number }[] = [
  { code: "A1", label: "A1 — Tunis · Sousse · Sfax", tmj: 28000 },
  { code: "RN1", label: "RN1 — Tunis · Bizerte", tmj: 14500 },
  { code: "A3", label: "A3 — Tunis · Oued Zarga", tmj: 14000 },
  { code: "A4", label: "A4 — Tunis · Korba · Menzel Temime", tmj: 9500 },
  { code: "RN2", label: "RN2 — Tunis · Ghardimaou", tmj: 9000 },
  { code: "A2", label: "A2 — Tunis · Bou Salem", tmj: 11500 },
  { code: "RN3", label: "RN3 — Tunis · Pichon · Makthar", tmj: 7500 },
  { code: "RN10", label: "RN10 — Sousse · Kairouan · Kasrine", tmj: 8000 },
  { code: "RN12", label: "RN12 — Sousse · Sidi Bouzid · Gafsa", tmj: 6000 },
  { code: "RN13", label: "RN13 — Sfax · Gabès · Médenine", tmj: 8500 },
  { code: "RN14", label: "RN14 — Tunis · Zaghouan · Makthar", tmj: 5000 },
  { code: "RN15", label: "RN15 — Gabès · Kébili · Tozeur", tmj: 4000 },
]

// ---------------------------------------------------------------------------
// Hooks de données (fetch relatifs, AbortController, setState async uniquement)
// ---------------------------------------------------------------------------

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError"
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()) as T
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: string } | null
    throw new Error(j?.error ?? `HTTP ${r.status}`)
  }
  return (await r.json()) as T
}

/** GET /api/opportunity/zones?brand= — zones + paramétrage + alertes + stats. */
export function useZones(brandSlug: string) {
  const [load, setLoad] = useState<{ brand: string; data: OppZonesPayload | null; error: string | null } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    getJson<OppZonesPayload>(`/api/opportunity/zones?brand=${encodeURIComponent(brandSlug)}`, ac.signal)
      .then(j =>
        setLoad({
          brand: brandSlug,
          data: { zones: j.zones ?? [], settings: j.settings ?? null, alerts: j.alerts ?? [], stats: j.stats },
          error: null,
        })
      )
      .catch(e => {
        if (isAbort(e)) return
        setLoad({ brand: brandSlug, data: null, error: "Impossible de charger les zones d'opportunités." })
      })
    return () => ac.abort()
  }, [brandSlug, reloadKey])

  const reload = useCallback(() => setReloadKey(k => k + 1), [])
  const ready = load && load.brand === brandSlug ? load : null
  return { data: ready?.data ?? null, error: ready?.error ?? null, reload }
}

/** GET /api/opportunity/etude?zoneId= + POST (génération IA 20 pages + 3 scénarios). */
export function useEtude(zoneId: string | null) {
  const [load, setLoad] = useState<{ zoneId: string; data: EtudePayload | null; error: string | null } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!zoneId) return
    const ac = new AbortController()
    getJson<EtudePayload>(`/api/opportunity/etude?zoneId=${encodeURIComponent(zoneId)}`, ac.signal)
      .then(j => setLoad({ zoneId, data: j, error: null }))
      .catch(e => {
        if (isAbort(e)) return
        setLoad({ zoneId, data: null, error: "Impossible de charger l'étude de faisabilité de la zone." })
      })
    return () => ac.abort()
  }, [zoneId, reloadKey])

  /** Génère (ou régénère) l'étude + les 3 scénarios — retourne vrai si succès. */
  const generate = useCallback(
    async (brandSlug: string, actor?: string): Promise<boolean> => {
      if (!zoneId) return false
      setGenerating(true)
      try {
        await postJson<{ ok: boolean }>("/api/opportunity/etude", { zoneId, brandSlug, actor })
        setReloadKey(k => k + 1)
        return true
      } catch {
        return false
      } finally {
        setGenerating(false)
      }
    },
    [zoneId]
  )

  const reload = useCallback(() => setReloadKey(k => k + 1), [])
  const ready = load && load.zoneId === zoneId ? load : null
  return { data: ready?.data ?? null, error: ready?.error ?? null, reload, generating, generate }
}

/** GET/POST /api/opportunity/franchise — candidats, contrats, kit, franchisés. */
export function useFranchise(brandSlug: string) {
  const [load, setLoad] = useState<{ brand: string; data: FranchisePayload | null; error: string | null } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const ac = new AbortController()
    getJson<FranchisePayload>(`/api/opportunity/franchise?brand=${encodeURIComponent(brandSlug)}`, ac.signal)
      .then(j => setLoad({ brand: brandSlug, data: j, error: null }))
      .catch(e => {
        if (isAbort(e)) return
        setLoad({ brand: brandSlug, data: null, error: "Impossible de charger le module franchise." })
      })
    return () => ac.abort()
  }, [brandSlug, reloadKey])

  const patchData = useCallback((fn: (d: FranchisePayload) => FranchisePayload) => {
    setLoad(prev => (prev && prev.data ? { ...prev, data: fn(prev.data) } : prev))
  }, [])

  /** Change le statut d'un candidat (maj locale + POST). */
  const updateCandidate = useCallback(
    async (candidateId: string, status: string): Promise<boolean> => {
      setBusy(true)
      try {
        await postJson<{ ok: boolean }>("/api/opportunity/franchise", {
          action: "maj-candidat",
          candidateId,
          status,
        })
        patchData(d => ({
          ...d,
          candidates: d.candidates.map(c => (c.id === candidateId ? { ...c, status } : c)),
        }))
        return true
      } catch {
        return false
      } finally {
        setBusy(false)
      }
    },
    [patchData]
  )

  /** Génère un contrat type — retourne le contrat ou null. */
  const generateContract = useCallback(
    async (p: {
      candidateId: string
      entryFee?: number
      royaltyPct?: number
      durationYears?: number
      actor?: string
    }): Promise<FranchiseContractDTO | null> => {
      setBusy(true)
      try {
        const j = await postJson<{ ok: boolean; contract: FranchiseContractDTO; candidateStatus: string }>(
          "/api/opportunity/franchise",
          { action: "generer-contrat", brandSlug, ...p }
        )
        patchData(d => ({
          ...d,
          contracts: [j.contract, ...d.contracts],
          candidates: d.candidates.map(c =>
            c.id === p.candidateId ? { ...c, status: j.candidateStatus } : c
          ),
        }))
        return j.contract
      } catch {
        return null
      } finally {
        setBusy(false)
      }
    },
    [brandSlug, patchData]
  )

  /** Active/désactive un élément du kit de démarrage. */
  const toggleKitItem = useCallback(
    async (itemId: string, active: boolean): Promise<boolean> => {
      setBusy(true)
      try {
        await postJson<{ ok: boolean }>("/api/opportunity/franchise", { action: "maj-kit", itemId, active })
        patchData(d => ({ ...d, kit: d.kit.map(k => (k.id === itemId ? { ...k, active } : k)) }))
        return true
      } catch {
        return false
      } finally {
        setBusy(false)
      }
    },
    [patchData]
  )

  const reload = useCallback(() => setReloadKey(k => k + 1), [])
  const ready = load && load.brand === brandSlug ? load : null
  return {
    data: ready?.data ?? null,
    error: ready?.error ?? null,
    reload,
    busy,
    updateCandidate,
    generateContract,
    toggleKitItem,
  }
}

/** GET/POST /api/opportunity/alerts — alertes du radar (lecture incluse). */
export function useAlerts() {
  const [alerts, setAlerts] = useState<OpportunityAlertDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    getJson<{ alerts: OpportunityAlertDTO[] }>("/api/opportunity/alerts", ac.signal)
      .then(j => {
        setAlerts(j.alerts ?? [])
        setError(null)
      })
      .catch(e => {
        if (isAbort(e)) return
        setError("Impossible de charger les alertes du radar.")
      })
    return () => ac.abort()
  }, [reloadKey])

  const markRead = useCallback(async (alertId: string) => {
    setAlerts(prev => (prev ? prev.map(a => (a.id === alertId ? { ...a, read: true } : a)) : prev))
    try {
      await postJson<{ ok: boolean }>("/api/opportunity/alerts", { action: "lire", alertId })
    } catch {
      /* la maj locale reste affichée ; la prochaine lecture resynchronisera */
    }
  }, [])

  const markAllRead = useCallback(async () => {
    setAlerts(prev => (prev ? prev.map(a => ({ ...a, read: true })) : prev))
    try {
      await postJson<{ ok: boolean }>("/api/opportunity/alerts", { action: "lire-toutes" })
    } catch {
      /* idem */
    }
  }, [])

  return { alerts, error, markRead, markAllRead }
}

// ---------------------------------------------------------------------------
// Composants partagés
// ---------------------------------------------------------------------------

/** Badge de score pondéré /100 coloré par palier (70/55). */
export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const tone = scoreTone(score)
  return (
    <Badge variant="outline" className={cn("gap-1 px-2 font-semibold tabular-nums", TONE_BADGE[tone], className)}>
      {score}
      <span className="text-[10px] font-normal opacity-70">/100</span>
    </Badge>
  )
}

/** Badge de format recommandé (station / micro-station express / mobility hub). */
export function FormatBadge({ format, className }: { format: string; className?: string }) {
  const tone = FORMAT_TONE[format] ?? "info"
  return (
    <Badge variant="outline" className={cn("gap-1.5 px-2", TONE_BADGE[tone], className)}>
      {FORMAT_LABELS[format] ?? format}
    </Badge>
  )
}

/** Mini barre de progression (score 0-100). */
export function ScoreBar({ value, tone, className }: { value: number; tone?: OppTone; className?: string }) {
  const t = tone ?? scoreTone(value)
  return (
    <span
      className={cn("block h-1.5 overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Score ${Math.round(value)} sur 100`}
    >
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: TONE_HEX[t] }}
      />
    </span>
  )
}

/** Badge de statut pipeline (IDENTIFIEE → EQUIPEE). */
export function ZoneStatusBadge({ status, className }: { status: string; className?: string }) {
  const styles: Record<string, string> = {
    IDENTIFIEE: "border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300",
    QUALIFIEE: TONE_BADGE.warning,
    ETUDE: TONE_BADGE.info,
    SIGNEE: "border-emerald-400 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
    EQUIPEE: TONE_BADGE.ok,
  }
  return (
    <Badge variant="outline" className={cn("gap-1.5 px-2", styles[status] ?? styles.IDENTIFIEE, className)}>
      {ZONE_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

/** Gauge de pipeline : barre segmentée proportionnelle IDENTIFIEE → EQUIPEE. */
export function PipelineGauge({
  pipeline,
  total,
  className,
}: {
  pipeline: OppStats["pipeline"]
  total: number
  className?: string
}) {
  const stages: { key: string; tone: OppTone | null }[] = [
    { key: "IDENTIFIEE", tone: null },
    { key: "QUALIFIEE", tone: "warning" },
    { key: "ETUDE", tone: "info" },
    { key: "SIGNEE", tone: null },
    { key: "EQUIPEE", tone: "ok" },
  ]
  const colors: Record<string, string> = {
    IDENTIFIEE: "#a8a29e",
    QUALIFIEE: TONE_HEX.warning,
    ETUDE: TONE_HEX.info,
    SIGNEE: "#34d399",
    EQUIPEE: TONE_HEX.ok,
  }
  const sum = stages.reduce((s, st) => s + (pipeline[st.key as keyof OppStats["pipeline"]] ?? 0), 0) || 1
  return (
    <div className={className}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Répartition du pipeline d'opportunités">
        {stages.map(st => {
          const v = pipeline[st.key as keyof OppStats["pipeline"]] ?? 0
          if (v <= 0) return null
          return (
            <span
              key={st.key}
              className="h-full"
              style={{ width: `${(v / sum) * 100}%`, backgroundColor: colors[st.key] }}
              title={`${ZONE_STATUS_LABELS[st.key]} : ${v}`}
            />
          )
        })}
      </div>
      <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {stages.map(st => {
          const v = pipeline[st.key as keyof OppStats["pipeline"]] ?? 0
          return (
            <li key={st.key} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[st.key] }} aria-hidden />
              {ZONE_STATUS_LABELS[st.key]}
              <span className="font-semibold tabular-nums text-foreground">{v}</span>
            </li>
          )
        })}
        <li className="ml-auto font-semibold tabular-nums">{total} zones</li>
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Carte de Tunisie à bulles (SVG viewBox 520×1000, frontières stylisées)
// ---------------------------------------------------------------------------

export interface BubblePoint {
  lat: number
  lng: number
  value: number
  label: string
  /** Ligne secondaire du tooltip (ex. « Score 72/100 · 8 400 véh. »). */
  sub?: string
  tone: OppTone
}

export interface BubbleLegendItem {
  tone: OppTone
  label: string
}

/** Path SVG d'un polygone géo ([lng, lat]) via project(). */
function polyPath(points: [number, number][]): string {
  return (
    points
      .map(([lng, lat], i) => {
        const p = project(lng, lat)
        return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`
      })
      .join(" ") + " Z"
  )
}

const BORDER_PATH = polyPath(TUNISIA_BORDER)
const DJERBA_PATH = polyPath(DJERBA)
const KERKENNAH_PATH = polyPath(KERKENNAH)
const MAJOR_CITIES = CITIES.filter(c => c[3])

/**
 * Carte de Tunisie à bulles : frontière + îles stylisées, bulles positionnées
 * via project() dont le rayon suit la racine carrée de `value` (clamp 6-26),
 * couleur par tonalité, tooltip au survol + légende optionnelle.
 */
export function TunisiaBubbleMap({
  points,
  height = 560,
  valueLabel = "Valeur",
  unit = "",
  legend,
  ariaLabel = "Carte de Tunisie",
  className,
}: {
  points: BubblePoint[]
  height?: number
  valueLabel?: string
  unit?: string
  legend?: BubbleLegendItem[]
  ariaLabel?: string
  className?: string
}) {
  const [hovered, setHovered] = useState<{ p: BubblePoint; x: number; y: number } | null>(null)
  const maxV = Math.max(1, ...points.map(p => Math.abs(p.value)))

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className={cn("relative overflow-hidden rounded-lg border bg-stone-50 dark:bg-stone-900/40")}>
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className="h-full w-full"
          style={{ height }}
          role="img"
          aria-label={ariaLabel}
        >
          {/* fond + frontières */}
          <path
            d={BORDER_PATH}
            className="fill-stone-100 stroke-stone-300 dark:fill-stone-800/70 dark:stroke-stone-600"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          <path
            d={DJERBA_PATH}
            className="fill-stone-100 stroke-stone-300 dark:fill-stone-800/70 dark:stroke-stone-600"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <path
            d={KERKENNAH_PATH}
            className="fill-stone-100 stroke-stone-300 dark:fill-stone-800/70 dark:stroke-stone-600"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {/* villes repères */}
          {MAJOR_CITIES.map(([name, lng, lat]) => {
            const p = project(lng, lat)
            return (
              <g key={name}>
                <circle cx={p.x} cy={p.y} r={3} className="fill-stone-400 dark:fill-stone-500" />
                <text
                  x={p.x + 6}
                  y={p.y - 5}
                  className="fill-stone-400 dark:fill-stone-500"
                  fontSize={15}
                  fontWeight={600}
                >
                  {name}
                </text>
              </g>
            )
          })}
          {/* bulles (rayon ∝ √valeur, clamp 6-26) */}
          {points.map(pt => {
            const p = project(pt.lng, pt.lat)
            const r = Math.min(26, Math.max(6, 6 + 20 * Math.sqrt(Math.abs(pt.value) / maxV)))
            const isHover = hovered?.p === pt
            return (
              <circle
                key={`${pt.label}-${pt.lat}-${pt.lng}`}
                cx={p.x}
                cy={p.y}
                r={r}
                fill={TONE_HEX[pt.tone]}
                fillOpacity={isHover ? 0.95 : 0.72}
                stroke={TONE_HEX[pt.tone]}
                strokeWidth={isHover ? 2.5 : 1}
                className="cursor-pointer transition-all"
                onMouseEnter={() => setHovered({ p: pt, x: p.x, y: p.y })}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered({ p: pt, x: p.x, y: p.y })}
                onBlur={() => setHovered(null)}
                tabIndex={0}
                aria-label={`${pt.label} — ${valueLabel} ${oppNum(pt.value)}${unit}`}
              >
                <title>{`${pt.label} — ${valueLabel} : ${oppNum(pt.value)}${unit}`}</title>
              </circle>
            )
          })}
        </svg>
        {/* tooltip de survol (coin haut-droit, hors flux SVG) */}
        {hovered && (
          <div className="pointer-events-none absolute right-2 top-2 max-w-[220px] rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-md backdrop-blur">
            <p className="font-semibold leading-tight">{hovered.p.label}</p>
            <p className="mt-0.5 tabular-nums text-muted-foreground">
              {valueLabel} : <span className="font-semibold text-foreground">{oppNum(hovered.p.value)}{unit}</span>
            </p>
            {hovered.p.sub && <p className="mt-0.5 leading-snug text-muted-foreground">{hovered.p.sub}</p>}
          </div>
        )}
      </div>
      {legend && legend.length > 0 && (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {legend.map(l => (
            <li key={l.tone + l.label} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TONE_HEX[l.tone] }} aria-hidden />
              {l.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// États vides / erreurs / skeletons
// ---------------------------------------------------------------------------

/** Alerte d'erreur + bouton Réessayer (charte du module). */
export function OppError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden />
      <AlertTitle>Erreur de chargement</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} className="mt-2 gap-1.5">
            <RotateCw className="h-3.5 w-3.5" aria-hidden /> Réessayer
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

/** État vide standardisé du module. */
export function OppEmpty({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-5.5 w-5.5" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {children && <div className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{children}</div>}
        </div>
        {action}
      </CardContent>
    </Card>
  )
}

/** Skeleton standard d'un sous-module (KPI + carte). */
export function OppSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement du module…">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-xl" />
        ))}
      </div>
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </CardContent>
      </Card>
    </div>
  )
}
