'use client'

// T51-c — Mobility Hub Operations : socle partagé du module.
// Types des réponses API /api/mobility/*, helpers de formatage FR, hooks de
// données (AbortController + setState uniquement dans les callbacks asynchrones),
// carte SVG de Tunisie à marqueurs TMP, badges de statut et cartes KPI.
// Palette : café + émeraude / ambre / terracotta / prune / ardoise — AUCUN bleu.

import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RotateCcw, TriangleAlert, type LucideIcon } from 'lucide-react'
import { MAP_W, MAP_H, project } from '@/lib/geo'
import { TUNISIA_BORDER, DJERBA, KERKENNAH, CITIES } from '@/components/map/tunisia-geo'
import {
  HUB_STATUS_LABELS, CONV_STATUS_LABELS,
  type HubDTO, type HubConversionDTO, type HubServiceRecordDTO, type HubVehicleDTO,
  type HubSettingDTO, type HubPriceItemDTO, type HubTireProductDTO, type HubDiagnosticTemplateDTO,
  type HubLoyaltyRuleDTO, type HubEquipmentDTO, type HubStockItemDTO,
} from '@/lib/t51-dto'

// ---------------------------------------------------------------------------
// Types des réponses API (contrats testés T51-a)
// ---------------------------------------------------------------------------

export interface HubStats {
  total: number
  operational: number
  construction: number
  pilotes: number
  ca30: number
  caCaptured: number
  conversions90: number
  confirmed90: number
  avgConversionRate: number
  vehicles: number
  equipmentAlerts: number
  stockAlerts: number
  avgRating: number
}
export interface HubsResponse { hubs: HubDTO[]; stats: HubStats | null }

export interface ByTypeStat { type: string; count: number; amount: number; avg: number }
export interface MonthlyServicesRow { month: string; ca: number; services: number; conversions: number }
export interface ConvStats { total: number; confirmed: number; proposed: number; lost: number; captured: number }
export interface ServicesResponse {
  records: HubServiceRecordDTO[]
  conversions: HubConversionDTO[]
  byType: ByTypeStat[]
  monthly: MonthlyServicesRow[]
  convStats: ConvStats
}

export interface LoyaltySummary {
  bronze: number
  argent: number
  or: number
  platine: number
  points: number
  avgServices: number
  avgSpent: number
  fuelMix: { ESSENCE: number; DIESEL: number; HYBRIDE: number; AUTRES: number }
}
export interface VehicleHistoryRow {
  vehicleId: string
  hubCode?: string
  type: string
  performedAt: string
  amount: number
  detail: string | null
}
export interface VehiclesResponse {
  vehicles: HubVehicleDTO[]
  history: VehicleHistoryRow[]
  loyalty: LoyaltySummary | null
  alerts: { urgent: number; info: number }
}

export interface AnalyticsMonthlyRow { month: string; ca: number; conversions: number; captured: number }
export interface AnalyticsByTypeRow { type: string; count: number; amount: number }
export interface TopConversionRow {
  plate: string
  reason: string
  amount: number
  station: string
  stationCode: string
  proposedAt: string
}
export interface StationCaptureRow { station: string; stationCode: string; amount: number; count: number }
export interface AnalyticsTotals {
  ca30: number
  captured: number
  conversions90: number
  confirmed90: number
  avgConversion: number
  avgRoi: number
  vehicles: number
}
export interface AnalyticsResponse {
  hubs: HubDTO[]
  monthly: AnalyticsMonthlyRow[]
  byType: AnalyticsByTypeRow[]
  topConversions: TopConversionRow[]
  stationCapture: StationCaptureRow[]
  totals: AnalyticsTotals | null
}

export interface SettingsResponse {
  setting: HubSettingDTO | null
  prices: HubPriceItemDTO[]
  tires: HubTireProductDTO[]
  templates: HubDiagnosticTemplateDTO[]
  loyalty: HubLoyaltyRuleDTO[]
  equipment: HubEquipmentDTO[]
  stocks: HubStockItemDTO[]
}

/** Types de prestation manipulables côté front. */
export type ServiceType = 'VIDANGE' | 'PNEUS_VENTE' | 'PNEUS_MONTAGE' | 'DIAGNOSTIC'

// ---------------------------------------------------------------------------
// Palette enseignes & statuts (aucun bleu — cf. charte CarbuScope)
// ---------------------------------------------------------------------------

export const BRAND_LABELS: Record<string, string> = {
  agil: 'Agil',
  totalenergies: 'TotalEnergies',
  shell: 'Shell',
  ola: 'Ola Energy',
  staroil: 'Star Oil',
}

/** Couleur de marqueur par enseigne (discret, pas de bleu). */
export const BRAND_MARKER_COLORS: Record<string, string> = {
  agil: '#059669',          // émeraude
  totalenergies: '#c2410c', // terracotta / rouge-orangé
  shell: '#d97706',         // jaune-ambre
  ola: '#0d9488',           // teal
  staroil: '#7e22ce',       // prune
}

export function brandMarkerColor(brandSlug: string): string {
  return BRAND_MARKER_COLORS[brandSlug] ?? '#7d6b58'
}

export function brandLabel(brandSlug: string): string {
  return BRAND_LABELS[brandSlug] ?? brandSlug.charAt(0).toUpperCase() + brandSlug.slice(1)
}

/** Couleurs sémantiques de statut TMP (émeraude=OK, ambre=pilote, ardoise=construction, terracotta=suspendu). */
export const HUB_STATUS_COLORS: Record<string, string> = {
  OPERATIONNEL: '#059669',
  PILOTE: '#d97706',
  EN_CONSTRUCTION: '#64748b',
  SUSPENDU: '#c2410c',
}

export const EQUIP_STATUS_LABELS: Record<string, string> = {
  OK: 'OK',
  VIGILANCE: 'Vigilance',
  ALERTE: 'Alerte',
}

// ---------------------------------------------------------------------------
// Formats FR
// ---------------------------------------------------------------------------

/** 5943 → « 5 943 DT » · 485000 → « 485 K DT » · 1200000 → « 1,2 M DT ». */
export function formatTnd(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M DT`
  if (abs >= 10_000) return `${Math.round(n / 1000).toLocaleString('fr-FR')} K DT`
  return `${Math.round(n).toLocaleString('fr-FR')} DT`
}

/** Montant unitaire d'une prestation : 89 → « 89 DT ». */
export function formatDt(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} DT`
}

export function fmtPct(n: number, digits = 0): string {
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: digits })} %`
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('fr-FR')
}

export function fmtRating(n: number): string {
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/5`
}

export const dateFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

export const dateTimeFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

/** Date relative : « il y a 3 j », « à l'instant ». */
export function relDateFr(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.round(h / 24)
  if (j < 60) return `il y a ${j} j`
  return `il y a ${Math.round(j / 30)} mois`
}

/** Mois d'écart (arrondi) entre une date ISO et maintenant. */
export function monthsSinceFr(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / (30 * 86_400_000)))
}

/** Filtré : fenêtre glissante de jours sur une date ISO. */
export function withinDays(iso: string, days: number | null): boolean {
  if (days == null) return true
  return Date.now() - new Date(iso).getTime() < days * 86_400_000
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** POST JSON vers les routes mobility — renvoie { ok, data?, error? }. */
export async function postMobility(
  url: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    const d = (await r.json().catch(() => null)) as Record<string, unknown> | null
    if (!r.ok || !d || d.ok !== true) {
      const msg = d && typeof d.error === 'string' ? d.error : `API ${url} [${r.status}]`
      return { ok: false, error: msg }
    }
    return { ok: true, data: d }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}

/** Liste scrollable stylée (charte : max-h-96 + scrollbar café). */
export const SCROLLABLE = 'max-h-96 overflow-y-auto scroll-coffee pr-1'

/** Tri générique par colonne (desc par défaut). */
export function sortBy<T>(rows: T[], key: keyof T, dir: 'asc' | 'desc'): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = a[key]
    const vb = b[key]
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign
    return String(va ?? '').localeCompare(String(vb ?? ''), 'fr') * sign
  })
}

// ---------------------------------------------------------------------------
// Hooks de données — fetch relatif + AbortController, setState uniquement
// dans les callbacks asynchrones (jamais de setState synchrone dans un effet).
// ---------------------------------------------------------------------------

/** GET /api/mobility/hubs — brandSlug vide/undefined = réseau national complet. */
export function useHubs(brandSlug?: string) {
  const [hubs, setHubs] = useState<HubDTO[] | null>(null)
  const [stats, setStats] = useState<HubStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    const ac = new AbortController()
    const run = async () => {
      try {
        const url = brandSlug
          ? `/api/mobility/hubs?brand=${encodeURIComponent(brandSlug)}`
          : '/api/mobility/hubs'
        const r = await fetch(url, { signal: ac.signal })
        if (!r.ok) throw new Error(`API /api/mobility/hubs [${r.status}]`)
        const d = (await r.json()) as HubsResponse
        if (ac.signal.aborted) return
        setHubs(d.hubs)
        setStats(d.stats)
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : 'Erreur inconnue')
      }
    }
    const t = setTimeout(() => { void run() }, 0)
    return () => { clearTimeout(t); ac.abort() }
  }, [brandSlug, tick])

  return { hubs, stats, error, loading: hubs === null && error === null, reload }
}

/**
 * GET /api/mobility/services — agrégation multi-TMP : la route ne filtre que
 * par un hubId unique, le hook fan-out en requêtes parallèles puis fusionne
 * records / conversions et recalcule les agrégats (byType, monthly, convStats).
 * hubIds = null → attente (données amont non prêtes) ; [] → aucun TMP.
 */
export function useServices(filters: { hubIds: string[] | null; limit?: number }) {
  const hubIds = filters.hubIds
  const limit = filters.limit ?? 400
  const [data, setData] = useState<ServicesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick(t => t + 1), [])
  const key = hubIds?.join(',') ?? 'pending'

  useEffect(() => {
    if (!hubIds || hubIds.length === 0) return
    const ac = new AbortController()
    const run = async () => {
      try {
        const parts = await Promise.all(
          hubIds.map(id =>
            fetch(`/api/mobility/services?hubId=${encodeURIComponent(id)}&limit=${limit}`, { signal: ac.signal })
              .then(async r => {
                if (!r.ok) throw new Error(`API /api/mobility/services [${r.status}]`)
                return (await r.json()) as ServicesResponse
              }),
          ),
        )
        if (ac.signal.aborted) return
        const records = parts.flatMap(p => p.records)
        const conversions = parts.flatMap(p => p.conversions)
        setData({
          records,
          conversions,
          byType: computeByType(records),
          monthly: computeMonthly(records, conversions),
          convStats: computeConvStats(conversions),
        })
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : 'Erreur inconnue')
      }
    }
    const t = setTimeout(() => { void run() }, 0)
    return () => { clearTimeout(t); ac.abort() }
  }, [key, limit, tick])

  return { data, error, loading: data === null && error === null && !!hubIds?.length, reload }
}

/** GET /api/mobility/vehicles — recherche q côté serveur (immat/propriétaire/modèle). */
export function useVehicles(filters: { q?: string }) {
  const q = filters.q ?? ''
  const [data, setData] = useState<VehiclesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    const ac = new AbortController()
    const run = async () => {
      try {
        const url = q ? `/api/mobility/vehicles?q=${encodeURIComponent(q)}` : '/api/mobility/vehicles'
        const r = await fetch(url, { signal: ac.signal })
        if (!r.ok) throw new Error(`API /api/mobility/vehicles [${r.status}]`)
        const d = (await r.json()) as VehiclesResponse
        if (ac.signal.aborted) return
        setData(d)
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : 'Erreur inconnue')
      }
    }
    const t = setTimeout(() => { void run() }, 0)
    return () => { clearTimeout(t); ac.abort() }
  }, [q, tick])

  return { data, error, loading: data === null && error === null, reload }
}

/** GET /api/mobility/analytics?brand= — tableau de bord comparatif de l'enseigne. */
export function useAnalytics(brandSlug: string) {
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    const ac = new AbortController()
    const run = async () => {
      try {
        const r = await fetch(`/api/mobility/analytics?brand=${encodeURIComponent(brandSlug)}`, { signal: ac.signal })
        if (!r.ok) throw new Error(`API /api/mobility/analytics [${r.status}]`)
        const d = (await r.json()) as AnalyticsResponse
        if (ac.signal.aborted) return
        setData(d)
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : 'Erreur inconnue')
      }
    }
    const t = setTimeout(() => { void run() }, 0)
    return () => { clearTimeout(t); ac.abort() }
  }, [brandSlug, tick])

  return { data, error, loading: data === null && error === null, reload }
}

/** GET /api/mobility/settings?brand= — réglage, tarifs, pneus, templates, fidélité, équipements. */
export function useHubSettings(brandSlug: string) {
  const [data, setData] = useState<SettingsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    const ac = new AbortController()
    const run = async () => {
      try {
        const r = await fetch(`/api/mobility/settings?brand=${encodeURIComponent(brandSlug)}`, { signal: ac.signal })
        if (!r.ok) throw new Error(`API /api/mobility/settings [${r.status}]`)
        const d = (await r.json()) as SettingsResponse
        if (ac.signal.aborted) return
        setData(d)
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : 'Erreur inconnue')
      }
    }
    const t = setTimeout(() => { void run() }, 0)
    return () => { clearTimeout(t); ac.abort() }
  }, [brandSlug, tick])

  return { data, error, loading: data === null && error === null, reload }
}

// --- agrégats recalculés côté client (fusion multi-hub du hook useServices) ---

function computeByType(records: HubServiceRecordDTO[]): ByTypeStat[] {
  return (['VIDANGE', 'PNEUS_VENTE', 'PNEUS_MONTAGE', 'DIAGNOSTIC'] as ServiceType[]).map(t => {
    const rows = records.filter(r => r.type === t)
    const amount = rows.reduce((s, r) => s + r.amount, 0)
    return {
      type: t,
      count: rows.length,
      amount: Math.round(amount),
      avg: rows.length ? Math.round(amount / rows.length) : 0,
    }
  })
}

function computeMonthly(records: HubServiceRecordDTO[], conversions: HubConversionDTO[]): MonthlyServicesRow[] {
  const now = Date.now()
  const day = 86_400_000
  const rows: MonthlyServicesRow[] = []
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now - (i + 1) * 30 * day)
    const end = new Date(now - i * 30 * day)
    const inRange = (d: Date) => d >= start && d < end
    const mr = records.filter(r => inRange(new Date(r.performedAt)))
    const mc = conversions.filter(c => inRange(new Date(c.proposedAt)) && c.status === 'CONFIRMEE')
    rows.push({
      month: new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(end),
      ca: Math.round(mr.reduce((s, r) => s + r.amount, 0)),
      services: mr.length,
      conversions: mc.length,
    })
  }
  return rows
}

function computeConvStats(conversions: HubConversionDTO[]): ConvStats {
  const confirmed = conversions.filter(c => c.status === 'CONFIRMEE')
  return {
    total: conversions.length,
    confirmed: confirmed.length,
    proposed: conversions.filter(c => c.status === 'PROPOSEE').length,
    lost: conversions.filter(c => c.status === 'PERDUE').length,
    captured: Math.round(confirmed.reduce((s, c) => s + c.amount, 0)),
  }
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  OPERATIONNEL: 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  PILOTE: 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  EN_CONSTRUCTION: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  SUSPENDU: 'border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300',
}

/** Badge de statut TMP (émeraude=opérationnel, ambre=pilote, ardoise=construction, terracotta=suspendu). */
export function HubStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`gap-1.5 whitespace-nowrap ${STATUS_STYLES[status] ?? STATUS_STYLES.EN_CONSTRUCTION}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: HUB_STATUS_COLORS[status] ?? '#64748b' }} aria-hidden />
      {HUB_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

const CONV_STYLES: Record<string, string> = {
  PROPOSEE: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  CONFIRMEE: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  PERDUE: 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
}

/** Badge de statut d'une conversion vers station classique. */
export function ConvStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`whitespace-nowrap ${CONV_STYLES[status] ?? CONV_STYLES.PROPOSEE}`}>
      {CONV_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

const EQUIP_STYLES: Record<string, string> = {
  OK: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  VIGILANCE: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  ALERTE: 'border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300',
}

/** Badge de statut d'un équipement de TMP (OK / Vigilance / Alerte). */
export function EquipStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`whitespace-nowrap ${EQUIP_STYLES[status] ?? EQUIP_STYLES.OK}`}>
      {EQUIP_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// KPI & états de chargement
// ---------------------------------------------------------------------------

const KPI_TONES: Record<string, string> = {
  emerald: '#059669',
  amber: '#d97706',
  terracotta: '#c2410c',
  violet: '#7e22ce',
  teal: '#0d9488',
  slate: '#64748b',
  neutral: '#7d6b58',
}

export type KpiTone = keyof typeof KPI_TONES

/** Carte KPI du module (barre colorée latérale + icône). */
export function MobilityKpi({
  value, label, sub, icon, tone = 'neutral', className,
}: {
  value: string
  label: string
  sub?: string
  icon?: LucideIcon
  tone?: KpiTone
  className?: string
}) {
  const toneColor = KPI_TONES[tone]
  const Icon = icon
  return (
    <Card className={`border-stone-200/80 bg-white/95 shadow-sm dark:border-stone-800 dark:bg-stone-900/95 ${className ?? ''}`}>
      <CardContent className="relative overflow-hidden p-4">
        <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: toneColor }} aria-hidden />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-stone-900 dark:text-stone-50">{value}</p>
            {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
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

/** Squelette de chargement d'un sous-module Mobility. */
export function MobilitySkeleton({ label = 'Chargement…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={label}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
      </div>
    </div>
  )
}

/** Erreur de chargement : Alert + bouton Réessayer. */
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <TriangleAlert className="h-4 w-4" aria-hidden />
      <AlertTitle>Erreur de chargement</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{message}</span>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Réessayer
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

/** Mini barre de progression (objectif, ROI…). */
export function MiniBar({ pct, color, className }: { pct: number; color?: string; className?: string }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-stone-200/80 dark:bg-stone-800 ${className ?? ''}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full transition-all" style={{ width: `${clamped}%`, backgroundColor: color ?? '#059669' }} />
    </div>
  )
}

/** Note explicative discrète. */
export function HintNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground dark:border-stone-700 dark:bg-stone-900">
      {children}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Carte SVG Tunisie — marqueurs TMP (couleur enseigne + pastille statut)
// ---------------------------------------------------------------------------

function borderToPath(pts: readonly [number, number][]): string {
  return (
    pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${project(p[0], p[1]).x.toFixed(1)} ${project(p[0], p[1]).y.toFixed(1)}`)
      .join(' ') + ' Z'
  )
}

const BORDER_PATH = borderToPath(TUNISIA_BORDER as [number, number][])
const DJERBA_PATH = borderToPath(DJERBA as [number, number][])
const KERKENNAH_PATH = borderToPath(KERKENNAH as [number, number][])
const MAJOR_CITIES = CITIES.filter(([, , , major]) => major).map(([name, lng, lat]) => ({
  name,
  ...project(lng, lat),
}))

interface HoverState {
  hub: HubDTO
  left: number
  top: number
}

/**
 * Carte nationale des TMP : fond Tunisie (map/tunisia-geo, jamais modifié),
 * marqueurs épingle colorés par enseigne, pastille intérieure = statut,
 * halo animé pour les TMP en construction, tooltip au survol, clic → onSelect.
 */
export function TunisiaHubMap({
  hubs, onSelect, height = 'h-[560px]', selectedCode = null, className,
}: {
  hubs: HubDTO[]
  onSelect?: (hub: HubDTO) => void
  height?: string
  selectedCode?: string | null
  className?: string
}) {
  const [hover, setHover] = useState<HoverState | null>(null)

  const markers = useMemo(
    () =>
      hubs.map(h => {
        const p = project(h.lng, h.lat)
        const brandColor = brandMarkerColor(h.brandSlug)
        const statusColor = HUB_STATUS_COLORS[h.status] ?? '#64748b'
        const isSelected = selectedCode === h.code
        const isConstruction = h.status === 'EN_CONSTRUCTION'
        const isSuspended = h.status === 'SUSPENDU'
        const tip = `${h.code} — ${h.name} · ${HUB_STATUS_LABELS[h.status] ?? h.status} · CA 30 j : ${formatTnd(h.ca30)}`
        return (
          <g
            key={h.id}
            transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
            className="cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label={tip}
            onClick={() => onSelect?.(h)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect?.(h)
              }
            }}
            onMouseEnter={e => {
              const r = (e.currentTarget as SVGGElement).getBoundingClientRect()
              setHover({ hub: h, left: r.left + r.width / 2, top: r.top })
            }}
            onMouseLeave={() => setHover(null)}
            onFocus={e => {
              const r = (e.currentTarget as SVGGElement).getBoundingClientRect()
              setHover({ hub: h, left: r.left + r.width / 2, top: r.top })
            }}
            onBlur={() => setHover(null)}
          >
            <title>{tip}</title>
            {/* halo pulsé pour les TMP en construction */}
            {isConstruction && (
              <circle r={10} fill={brandColor} opacity={0.35} className="animate-ping-slow pointer-events-none" aria-hidden />
            )}
            {/* sélection */}
            {isSelected && (
              <circle r={17} fill="none" stroke={brandColor} strokeWidth={1.6} strokeDasharray="3 2.5" aria-hidden />
            )}
            {/* épingle : pointe à la position exacte */}
            <path
              d="M0 0 C -5.2 -7.2, -9.2 -11, -9.2 -16.4 A 9.2 9.2 0 1 1 9.2 -16.4 C 9.2 -11, 5.2 -7.2, 0 0 Z"
              fill={brandColor}
              stroke="#ffffff"
              strokeWidth={1.1}
              opacity={isSuspended ? 0.55 : 0.95}
            />
            {/* pastille statut */}
            <circle cy={-16.4} r={3.4} fill="#ffffff" aria-hidden />
            <circle cy={-16.4} r={2.5} fill={statusColor} aria-hidden />
          </g>
        )
      }),
    [hubs, onSelect, selectedCode],
  )

  const legendBrands = useMemo(() => {
    const seen = new Map<string, string>()
    for (const h of hubs) if (!seen.has(h.brandSlug)) seen.set(h.brandSlug, brandMarkerColor(h.brandSlug))
    return [...seen.entries()].map(([slug, color]) => ({ slug, color, label: brandLabel(slug) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [hubs])

  const legendStatuses = useMemo(() => {
    const seen = new Set<string>()
    for (const h of hubs) seen.add(h.status)
    return [...seen].map(s => ({ status: s, color: HUB_STATUS_COLORS[s] ?? '#64748b', label: HUB_STATUS_LABELS[s] ?? s }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [hubs])

  return (
    <div className={className}>
      <div className={`relative w-full overflow-hidden rounded-xl border border-stone-200 bg-[var(--c-paper)] dark:border-stone-800 dark:bg-stone-950 ${height}`}>
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Carte des ${hubs.length} micro-hubs TMP en Tunisie`}
        >
          {/* fond géographique */}
          <path d={BORDER_PATH} className="map-land" stroke="var(--c-brown)" strokeWidth={1} strokeOpacity={0.4} />
          <path d={DJERBA_PATH} className="map-land" stroke="var(--c-brown)" strokeWidth={0.7} strokeOpacity={0.4} />
          <path d={KERKENNAH_PATH} className="map-land" stroke="var(--c-brown)" strokeWidth={0.7} strokeOpacity={0.4} />
          {/* villes repères */}
          {MAJOR_CITIES.map(c => (
            <g key={c.name}>
              <circle cx={c.x} cy={c.y} r={2.2} className="map-city" aria-hidden />
              <text x={c.x + 5} y={c.y + 3.5} fontSize={11} className="map-city-label">
                {c.name}
              </text>
            </g>
          ))}
          {/* marqueurs TMP */}
          {markers}
        </svg>

        {/* compteur discret */}
        <span className="absolute right-2 top-2 rounded-full border border-stone-300/70 bg-white/85 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-stone-600 dark:border-stone-700 dark:bg-stone-900/85 dark:text-stone-300">
          {hubs.length} TMP
        </span>
      </div>

      {/* légende enseignes + statuts */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {legendBrands.map(b => (
          <span key={b.slug} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
            {b.label}
          </span>
        ))}
        <span className="hidden h-4 w-px bg-stone-300 dark:bg-stone-700 sm:inline-block" aria-hidden />
        {legendStatuses.map(s => (
          <span key={s.status} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>

      {/* tooltip au survol (nom, code, statut, CA 30 j) */}
      {hover && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 -translate-y-full rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-lg dark:border-stone-700 dark:bg-stone-900"
          style={{
            left: Math.min(Math.max(hover.left, 110), typeof window !== 'undefined' ? window.innerWidth - 110 : hover.left),
            top: hover.top - 10,
          }}
          role="tooltip"
        >
          <p className="text-xs font-bold text-stone-900 dark:text-stone-50">{hover.hub.name}</p>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {hover.hub.code} · {hover.hub.gouvernorat} · {brandLabel(hover.hub.brandSlug)}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <HubStatusBadge status={hover.hub.status} />
            <span className="text-xs font-semibold tabular-nums text-stone-700 dark:text-stone-200">
              CA 30 j : {formatTnd(hover.hub.ca30)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
