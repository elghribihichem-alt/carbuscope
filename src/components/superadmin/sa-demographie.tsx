'use client'

// Super Administration — Module Démographie (T35 + T37) : statistiques
// territoriales de la Tunisie, structuré en TROIS volets :
//  · « Gouvernorats » — 24 lignes (vue gouvernorat), édition en ligne avec
//    complément automatique urbain↔rural et hommes↔femmes ;
//  · « Délégations » — 277 lignes (vue délégation) éditables au clic, groupes
//    INS 2024 + modélisateur camembert/histogramme ;
//  · « Paramétrage » — visibilité du module pour les utilisateurs (effet
//    immédiat : onglet « Démographie » de leur Observatoire B2B).
// Import (JSON/CSV/XLS/XML) et export (JSON/CSV/XLS/XML/PDF/Word) par volet.
// Fenêtre sur les données du terrain — administré par la super-administratrice.

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AnimatePresence, motion } from "framer-motion"
import {
  BarChart3, ChevronDown, ChevronRight, Info, Loader2, PieChart as PieIcon,
  RotateCcw, Search, SlidersHorizontal, Table2, Users, List,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAppStore } from "@/store/app-store"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"
import { VEHICLE_CATEGORIES, type DemographicAccessDTO, type DemographicDelegationDTO, type DemographicGouvernoratDTO } from "@/lib/saas"
import { fmtDate, timeAgo } from "./sa-shared"
import { DemographieGouvernoratsPanel, GOV_EXPORT_COLUMNS } from "@/components/demographie/demographie-gouvernorats"
import { DemographieIoBar } from "./sa-demographie-io"
import { SaDemographieParametrage } from "./sa-demographie-parametrage"
import type { ExportColumn, ExportRow } from "@/lib/demographie-io"

// ---- Helpers de format / parsing (fr) ----

const fmtInt = (v: number) => new Intl.NumberFormat("fr-FR").format(v)
const fmtPct = (v: number) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`
const fmtChart = (v: number, decimals: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: decimals })

/** « 52 400 » ou « 78,5 » → nombre (espaces et virgule acceptés). */
function parseNumFr(raw: string): number {
  const t = raw.trim().replace(/\s/g, "").replace(",", ".")
  if (t === "") return NaN
  const v = Number(t)
  return Number.isFinite(v) ? v : NaN
}

/** Recherche insensible à la casse et aux accents. */
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

// Champs éditables du tableau (l'ordre suit les colonnes).
const EDIT_INT_FIELDS = ["population", ...VEHICLE_CATEGORIES.map(v => v.key)]
const TOAST_LABELS: Record<string, string> = {
  population: "population",
  urbanPct: "taux urbain",
  ruralPct: "taux rural",
  ...Object.fromEntries(VEHICLE_CATEGORIES.map(v => [v.key, v.short.toLowerCase()])),
}

const GOV_TOAST_LABELS: Record<string, string> = {
  population: "population",
  menPct: "part des hommes",
  womenPct: "part des femmes",
  areaKm2: "superficie",
  urbanPct: "taux urbain",
  ruralPct: "taux rural",
  vehicles: "parc automobile",
  motorizationRate: "taux de motorisation",
  avgFleetAge: "âge du parc",
}

// Palette du modélisateur (aucun bleu ni indigo).
const CHART_COLORS = ["#059669", "#f59e0b", "#7c3aed", "#0d9488", "#ea580c", "#e11d48", "#65a30d", "#c026d3", "#78716c"]

// Indicateurs modélisables : gouvernorats (INS 2024 + parc historique) et
// délégations (une fois alimentées).
const INDICATORS: { key: string; label: string; unit: string; decimals: number }[] = [
  { key: "population", label: "Population", unit: "hab.", decimals: 0 },
  { key: "urbanPct", label: "Taux d'urbanisation", unit: "%", decimals: 1 },
  { key: "ruralPct", label: "Taux de ruralité", unit: "%", decimals: 1 },
  { key: "menPct", label: "Part des hommes", unit: "%", decimals: 1 },
  { key: "womenPct", label: "Part des femmes", unit: "%", decimals: 1 },
  { key: "areaKm2", label: "Superficie", unit: "km²", decimals: 0 },
  { key: "vehicles", label: "Parc automobile (total)", unit: "véh.", decimals: 0 },
  { key: "motorizationRate", label: "Taux de motorisation", unit: "%", decimals: 1 },
  { key: "avgFleetAge", label: "Âge moyen du parc", unit: "ans", decimals: 1 },
  ...VEHICLE_CATEGORIES.map(v => ({ key: v.key, label: v.label, unit: "véh.", decimals: 0 })),
]
const VEHICLE_KEYS = new Set(VEHICLE_CATEGORIES.map(v => v.key))

interface DemographicPage {
  governorats: DemographicGouvernoratDTO[]
  delegations: DemographicDelegationDTO[]
  access: DemographicAccessDTO[]
}

type EditKind = "int" | "pct"

// Colonnes d'export du volet Délégations (l'identité gouvernorat+délégation
// sert de clé à l'import).
const DELEG_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "gouvernorat", label: "Gouvernorat", type: "text" },
  { key: "isoCode", label: "Code ISO", type: "text" },
  { key: "delegation", label: "Délégation", type: "text" },
  { key: "population", label: "Population", type: "int" },
  { key: "urbanPct", label: "Urbain (%)", type: "pct" },
  { key: "ruralPct", label: "Rural (%)", type: "pct" },
  { key: "vehiclesLight", label: "Véh. légères", type: "int" },
  { key: "vehiclesUtility", label: "Utilitaires", type: "int" },
  { key: "vehiclesHeavy", label: "Poids lourds", type: "int" },
  { key: "vehiclesBuses", label: "Autocars", type: "int" },
  { key: "vehiclesMotorcycles", label: "Deux-roues", type: "int" },
  { key: "updatedBy", label: "Modifié par", type: "text" },
  { key: "updatedAtLabel", label: "Modifié le", type: "text" },
]

/** Ligne d'export d'une délégation (métadonnées pré-formatées). */
function mapDelegRow(r: DemographicDelegationDTO): ExportRow {
  return {
    gouvernorat: r.gouvernorat,
    isoCode: r.isoCode,
    delegation: r.delegation,
    population: r.population,
    urbanPct: r.urbanPct,
    ruralPct: r.ruralPct,
    vehiclesLight: r.vehiclesLight,
    vehiclesUtility: r.vehiclesUtility,
    vehiclesHeavy: r.vehiclesHeavy,
    vehiclesBuses: r.vehiclesBuses,
    vehiclesMotorcycles: r.vehiclesMotorcycles,
    updatedBy: r.updatedBy ?? "",
    updatedAtLabel: r.updatedAt ? fmtDate(r.updatedAt) : "",
  }
}

/** Ligne d'export d'un gouvernorat (métadonnées pré-formatées). */
function mapGovRow(g: DemographicGouvernoratDTO): ExportRow {
  return {
    name: g.name,
    isoCode: g.isoCode ?? "",
    population: g.population,
    menPct: g.menPct,
    womenPct: g.womenPct,
    areaKm2: g.areaKm2,
    urbanPct: g.urbanPct,
    ruralPct: g.ruralPct,
    vehicles: g.vehicles,
    motorizationRate: g.motorizationRate,
    avgFleetAge: g.avgFleetAge,
    delegationCount: g.delegationCount,
    estimatedLabel: g.estimated ? "est." : "",
    updatedBy: g.updatedBy ?? "",
    updatedAtLabel: g.updatedAt ? fmtDate(g.updatedAt) : "",
  }
}

// ---- Cellule éditable en ligne (volet Délégations — partagée avec la vue
// « Démographie » de l'Observatoire B2B des utilisateurs autorisés) ----

export function EditableCell({ row, field, kind, ariaName, onCommit }: {
  row: DemographicDelegationDTO
  field: string
  kind: EditKind
  ariaName: string
  onCommit: (row: DemographicDelegationDTO, field: string, v: number | null) => void
}) {
  const value = (row as unknown as Record<string, number | null>)[field] ?? null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const display = value === null ? "—" : kind === "pct" ? fmtPct(value) : fmtInt(value)

  const tryCommit = (fromBlur: boolean) => {
    const t = draft.trim()
    if (t === "") {
      setEditing(false)
      if (value !== null) onCommit(row, field, null)
      return
    }
    const v = parseNumFr(t)
    const invalid = !Number.isFinite(v)
      || (kind === "pct" && (v < 0 || v > 100))
      || (kind === "int" && (!Number.isInteger(v) || v < 0))
    if (invalid) {
      if (fromBlur) { setEditing(false); return }
      toast.error(kind === "pct" ? "Le taux doit être un nombre entre 0 et 100" : "Nombre entier positif attendu")
      return
    }
    setEditing(false)
    if (v !== value) onCommit(row, field, v)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); tryCommit(false) }
          if (e.key === "Escape") { e.preventDefault(); setEditing(false) }
        }}
        onBlur={() => tryCommit(true)}
        inputMode={kind === "int" ? "numeric" : "decimal"}
        className="h-8 w-full min-w-0 rounded-md border border-emerald-400 bg-background px-2 text-right font-mono text-xs tabular-nums shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-emerald-600"
        aria-label={ariaName}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value === null ? "" : String(value)); setEditing(true) }}
      className={`inline-flex h-8 w-full items-center justify-end rounded-md px-2 font-mono text-xs tabular-nums transition-colors hover:bg-emerald-100/80 hover:font-semibold dark:hover:bg-emerald-950/70 ${value === null ? "text-muted-foreground/50" : "text-foreground"}`}
      title="Cliquer pour modifier"
      aria-label={`${ariaName} : ${value === null ? "non renseigné" : display} — cliquer pour modifier`}
    >
      {display}
    </button>
  )
}

// ---- Camembert (SVG donut, top 8 + Autres) ----

function ChartPie({ items, unit, decimals, total }: {
  items: { label: string; value: number }[]
  unit: string
  decimals: number
  total: number
}) {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, 8)
  const rest = sorted.slice(8)
  const slices = rest.length > 0
    ? [...top, { label: `Autres (${rest.length})`, value: rest.reduce((s, x) => s + x.value, 0) }]
    : top
  const R = 56
  const C = 2 * Math.PI * R
  // Calcul pur des segments (part cumulée, sans mutation) : camembert = donut
  // SVG en traits circulaires, départ à 12 h (rotation -90°).
  const segments = slices.reduce<{ label: string; value: number; frac: number; start: number }[]>((list, s) => {
    const prev = list.length > 0 ? list[list.length - 1] : null
    const start = prev ? prev.start + prev.frac : 0
    const frac = total > 0 ? s.value / total : 0
    return [...list, { label: s.label, value: s.value, frac, start }]
  }, [])

  return (
    <div className="flex flex-col items-center gap-6 lg:flex-row lg:gap-10">
      <svg viewBox="0 0 160 160" className="h-44 w-44 shrink-0" role="img"
        aria-label={`Camembert : ${slices.length} parts, total ${fmtChart(total, decimals)} ${unit}`}>
        <g transform="rotate(-90 80 80)">
          {segments.map((s, i) => {
            const len = s.frac * C
            if (len <= 0) return null
            return (
              <motion.circle
                key={s.label}
                cx={80} cy={80} r={R}
                fill="none"
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={26}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-s.start * C}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
              />
            )
          })}
        </g>
        <text x={80} y={74} textAnchor="middle" className="fill-foreground text-[13px] font-bold">
          {fmtChart(total, decimals)}
        </text>
        <text x={80} y={90} textAnchor="middle" className="fill-muted-foreground text-[9px]">
          {unit}
        </text>
      </svg>
      <ul className="grid w-full max-w-lg grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate" title={s.label}>{s.label}</span>
            <span className="font-mono tabular-nums text-muted-foreground">{fmtChart(s.value, decimals)}</span>
            <span className="w-14 text-right font-mono tabular-nums text-muted-foreground/70">
              {total > 0 ? `${((s.value / total) * 100).toFixed(1).replace(".", ",")} %` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---- Histogramme horizontal (top 12, barres animées) ----

function ChartBars({ items, unit, decimals }: {
  items: { label: string; value: number }[]
  unit: string
  decimals: number
}) {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  const shown = sorted.slice(0, 12)
  const maxV = shown[0]?.value ?? 0

  return (
    <div className="space-y-2">
      {shown.map((x, i) => (
        <div key={x.label} className="flex items-center gap-3">
          <span className="w-36 shrink-0 truncate text-right text-xs" title={x.label}>{x.label}</span>
          <div className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-muted">
            <motion.div
              className="h-full rounded-md bg-emerald-600"
              style={{ opacity: 1 - Math.min(i, 8) * 0.08 }}
              initial={{ width: 0 }}
              animate={{ width: `${maxV > 0 ? Math.max((x.value / maxV) * 100, 2) : 0}%` }}
              transition={{ duration: 0.45, delay: i * 0.04, ease: "easeOut" }}
            />
            <span className="absolute inset-y-0 right-2 flex items-center font-mono text-[10px] tabular-nums text-foreground/80">
              {fmtChart(x.value, decimals)} {unit}
            </span>
          </div>
        </div>
      ))}
      {sorted.length > shown.length && (
        <p className="pl-[10.5rem] text-[11px] text-muted-foreground">… et {sorted.length - shown.length} autres</p>
      )}
    </div>
  )
}

// ---- Composant principal (9e onglet « Démographie », 3 volets) ----

export function SaDemographie() {
  const userId = useAppStore(s => s.userId)
  const actor = userId ? DEMO_ACCOUNTS_MAP[userId]?.email ?? "system" : "system"

  const [data, setData] = useState<DemographicPage | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState("")
  const [govFilter, setGovFilter] = useState("TOUS")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [resetArmed, setResetArmed] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [volet, setVolet] = useState("gouvernorats")

  // Modélisateur
  const [indicator, setIndicator] = useState("population")
  const [perimeter, setPerimeter] = useState("GOUVERNORATS")
  const [chartType, setChartType] = useState<"pie" | "bars">("pie")

  useEffect(() => {
    let alive = true
    fetch("/api/super/demographie")
      .then(async r => {
        const j = await r.json().catch(() => null)
        if (!r.ok || !j?.governorats) throw new Error(j?.error ?? "Impossible de charger le référentiel démographique")
        if (alive) setData({ governorats: j.governorats, delegations: j.delegations ?? [], access: j.access ?? [] })
      })
      .catch(e => { if (alive) setLoadError(e instanceof Error ? e.message : "Erreur inconnue") })
    return () => { alive = false }
  }, [reloadKey])

  useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current) }, [])

  /** Recharge le référentiel complet (après import, changement de visibilité…). */
  const refresh = () => setReloadKey(k => k + 1)

  // ---- Données dérivées ----

  const rowsByGov = useMemo(() => {
    if (!data) return []
    return data.governorats.map(gov => ({
      gov,
      rows: data.delegations.filter(d => d.gouvernorat === gov.name),
    }))
  }, [data])

  const filtering = query.trim() !== "" || govFilter !== "TOUS"

  const visibleGroups = useMemo(() => {
    const q = norm(query.trim())
    return rowsByGov
      .filter(({ gov }) => govFilter === "TOUS" || govFilter === gov.name)
      .map(({ gov, rows }) => {
        if (!q) return { gov, rows }
        if (norm(gov.name).includes(q)) return { gov, rows }
        return { gov, rows: rows.filter(r => norm(r.delegation).includes(q)) }
      })
      .filter(({ rows }) => rows.length > 0)
  }, [rowsByGov, query, govFilter])

  const visibleRows = useMemo(() => visibleGroups.reduce((n, g) => n + g.rows.length, 0), [visibleGroups])

  const isCollapsed = (name: string) => (filtering ? false : collapsed.has(name))

  const filledCells = useMemo(() => {
    if (!data) return 0
    const keys = ["population", "urbanPct", "ruralPct", ...EDIT_INT_FIELDS.slice(1)]
    return data.delegations.reduce(
      (n, d) => n + keys.filter(k => (d as unknown as Record<string, number | null>)[k] !== null).length, 0
    )
  }, [data])
  const totalCells = data ? data.delegations.length * 8 : 0

  /** Lignes d'export du volet Délégations = vue filtrée courante. */
  const delegationExportRows = useMemo(
    () => visibleGroups.flatMap(({ rows }) => rows.map(mapDelegRow)),
    [visibleGroups]
  )

  const chartMeta = INDICATORS.find(i => i.key === indicator) ?? INDICATORS[0]
  const pieAllowed = chartMeta.unit !== "%"

  const chart = useMemo(() => {
    const items: { label: string; value: number }[] = []
    if (data) {
      if (perimeter === "GOUVERNORATS") {
        for (const g of data.governorats) {
          const v = (g as unknown as Record<string, number | null>)[chartMeta.key] ?? null
          if (v !== null) items.push({ label: g.name, value: v })
        }
      } else {
        for (const d of data.delegations) {
          if (d.gouvernorat !== perimeter) continue
          const v = (d as unknown as Record<string, number | null>)[chartMeta.key] ?? null
          if (v !== null) items.push({ label: d.delegation, value: v })
        }
      }
    }
    return { items, total: items.reduce((s, x) => s + x.value, 0) }
  }, [data, indicator, perimeter, chartMeta.key])

  // ---- Écritures ----

  const saveRow = (row: DemographicDelegationDTO, patch: Record<string, number | null>) => {
    const prevRow = row
    const optimistic: DemographicDelegationDTO = {
      ...row, ...patch, updatedAt: new Date().toISOString(), updatedBy: actor,
    }
    setData(d => d ? { ...d, delegations: d.delegations.map(r => (r.id === row.id ? optimistic : r)) } : d)
    fetch("/api/super/demographie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "maj-delegation", id: row.id, values: patch, actor }),
    })
      .then(async r => {
        const j = await r.json().catch(() => null)
        if (!r.ok || !j?.delegation) throw new Error(j?.error ?? "Échec de l'enregistrement")
        setData(d => d ? { ...d, delegations: d.delegations.map(x => (x.id === row.id ? j.delegation : x)) } : d)
        toast.success(`${row.delegation} — ${describePatch(patch)}`)
      })
      .catch(e => {
        setData(d => d ? { ...d, delegations: d.delegations.map(x => (x.id === row.id ? prevRow : x)) } : d)
        toast.error(e instanceof Error ? e.message : "Erreur inconnue")
      })
  }

  const commitCell = (row: DemographicDelegationDTO, field: string, value: number | null) => {
    const patch: Record<string, number | null> = { [field]: value }
    // Complément automatique : urbain + rural = 100 %
    if (field === "urbanPct" && value !== null) patch.ruralPct = Math.round((100 - value) * 10) / 10
    if (field === "ruralPct" && value !== null) patch.urbanPct = Math.round((100 - value) * 10) / 10
    const entries = Object.entries(patch).filter(([k, v]) => (row as unknown as Record<string, number | null>)[k] !== v)
    if (entries.length === 0) return
    saveRow(row, Object.fromEntries(entries) as Record<string, number | null>)
  }

  /** Édition d'un gouvernorat (volet Gouvernorats) — optimiste + rollback. */
  const saveGouvRow = (row: DemographicGouvernoratDTO, patch: Record<string, number | null>) => {
    const prevRow = row
    const optimistic: DemographicGouvernoratDTO = {
      ...row, ...patch, updatedAt: new Date().toISOString(), updatedBy: actor,
    }
    setData(d => d ? { ...d, governorats: d.governorats.map(g => (g.id === row.id ? optimistic : g)) } : d)
    fetch("/api/super/demographie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "maj-gouvernorat", id: row.id, values: patch, actor }),
    })
      .then(async r => {
        const j = await r.json().catch(() => null)
        if (!r.ok || !j?.governorat) throw new Error(j?.error ?? "Échec de l'enregistrement")
        setData(d => d ? { ...d, governorats: d.governorats.map(g => (g.id === row.id ? j.governorat : g)) } : d)
        toast.success(`${row.name} — ${describeGouvPatch(patch)}`)
      })
      .catch(e => {
        setData(d => d ? { ...d, governorats: d.governorats.map(g => (g.id === row.id ? prevRow : g)) } : d)
        toast.error(e instanceof Error ? e.message : "Erreur inconnue")
      })
  }

  const armReset = () => {
    if (resetArmed) {
      if (resetTimer.current) clearTimeout(resetTimer.current)
      setResetArmed(false)
      fetch("/api/super/demographie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reinitialiser", actor }),
      })
        .then(async r => {
          const j = await r.json().catch(() => null)
          if (!r.ok || !j?.reset) throw new Error(j?.error ?? "Échec de la réinitialisation")
          setData(d => d ? {
            ...d,
            delegations: d.delegations.map(x => ({
              ...x, population: null, urbanPct: null, ruralPct: null,
              vehiclesLight: null, vehiclesUtility: null, vehiclesHeavy: null,
              vehiclesBuses: null, vehiclesMotorcycles: null, updatedAt: null, updatedBy: null,
            })),
          } : d)
          toast.success(`Démographie réinitialisée — ${j.count} délégations remises à zéro`)
        })
        .catch(e => toast.error(e instanceof Error ? e.message : "Erreur inconnue"))
      return
    }
    setResetArmed(true)
    resetTimer.current = setTimeout(() => setResetArmed(false), 4000)
  }

  const toggleGov = (name: string) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  })

  // ---- Rendu ----

  if (loadError) {
    return (
      <Alert variant="destructive">
        <Info aria-hidden />
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    )
  }
  if (!data) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement du référentiel démographique…
        </CardContent>
      </Card>
    )
  }

  const emptyChartMsg = perimeter === "GOUVERNORATS"
    ? VEHICLE_KEYS.has(indicator)
      ? "Les catégories du parc automobile se renseignent par délégation — choisissez un gouvernorat dans le périmètre."
      : "Aucune donnée pour cet indicateur au niveau des gouvernorats."
    : `Aucune valeur renseignée pour « ${perimeter} » — cliquez sur les cellules du tableau pour alimenter ce graphique.`

  return (
    <div className="space-y-4">
      {/* En-tête du module */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <Users className="h-5.5 w-5.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-tight">Démographie — statistiques territoriales</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Fenêtre sur les données du terrain : population, urbanisation et parc automobile des
                gouvernorats et délégations de Tunisie (source INS 2024).{' '}
                {data.delegations.length} délégations réparties sur {data.governorats.length} gouvernorats,
                gérées en trois volets — gouvernorats, délégations et paramétrage de visibilité.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-5 rounded-lg border bg-muted/40 px-4 py-3">
            <div className="text-center sm:text-left">
              <p className="text-lg font-bold leading-none tabular-nums">{filledCells}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">valeurs renseignées</p>
            </div>
            <div className="w-40 space-y-1">
              <Progress
                value={totalCells > 0 ? (filledCells / totalCells) * 100 : 0}
                className="h-1.5"
                aria-label="Taux de remplissage du tableau"
              />
              <p className="text-[10px] leading-none text-muted-foreground">
                {totalCells} cellules éditables · {totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0} %
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trois volets : Gouvernorats · Délégations · Paramétrage */}
      <Tabs value={volet} onValueChange={setVolet} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3 sm:max-w-lg">
          <TabsTrigger value="gouvernorats" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <Table2 className="h-4 w-4" aria-hidden /> Gouvernorats
          </TabsTrigger>
          <TabsTrigger value="delegations" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <List className="h-4 w-4" aria-hidden /> Délégations
          </TabsTrigger>
          <TabsTrigger value="parametrage" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <SlidersHorizontal className="h-4 w-4" aria-hidden /> Paramétrage
          </TabsTrigger>
        </TabsList>

        {/* ---- Volet 1 : Gouvernorats (vue gouvernorat) ---- */}
        <TabsContent value="gouvernorats" className="mt-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Table2 className="h-4 w-4 text-emerald-600" aria-hidden /> Volet Gouvernorats — vue par gouvernorat
              </CardTitle>
              <CardDescription>
                Une ligne par gouvernorat : référence INS 2024, superficie, urbanisation et parc
                automobile. Édition en ligne au clic — le taux complémentaire se calcule
                automatiquement (urbain + rural = 100 %, hommes + femmes = 100 %). Ces données
                alimentent la carte, l&apos;implantation, les rapports et les calculateurs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DemographieGouvernoratsPanel
                governorats={data.governorats}
                canEdit
                onCommit={saveGouvRow}
                toolbar={filtered => (
                  <DemographieIoBar
                    scope="gouvernorats"
                    title="Gouvernorats de Tunisie — INS 2024"
                    columns={GOV_EXPORT_COLUMNS}
                    rows={filtered.map(mapGovRow)}
                    actor={actor}
                    onRefresh={refresh}
                  />
                )}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Volet 2 : Délégations (vue délégation) ---- */}
        <TabsContent value="delegations" className="mt-0 space-y-4">
          {/* Tableau démographique — édition en ligne */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <List className="h-4 w-4 text-emerald-600" aria-hidden /> Volet Délégations — édition en ligne
              </CardTitle>
              <CardDescription>
                Cliquez sur une cellule pour la modifier : Entrée enregistre, Échap annule, une saisie vide
                efface. Le taux complémentaire se calcule automatiquement (urbain + rural = 100 %). Les
                bandeaux émeraude portent la référence INS 2024 du gouvernorat.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Rechercher une délégation ou un gouvernorat…"
                    className="pl-8"
                    aria-label="Rechercher une délégation ou un gouvernorat"
                  />
                </div>
                <Select value={govFilter} onValueChange={setGovFilter}>
                  <SelectTrigger className="sm:w-56" aria-label="Filtrer par gouvernorat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="TOUS">Tous les gouvernorats</SelectItem>
                    {data.governorats.map(g => (
                      <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="whitespace-nowrap text-xs text-muted-foreground" aria-live="polite">
                    {visibleRows} / {data.delegations.length} délégations
                  </span>
                  <DemographieIoBar
                    scope="delegations"
                    title="Délégations de Tunisie — INS 2024"
                    columns={DELEG_EXPORT_COLUMNS}
                    rows={delegationExportRows}
                    actor={actor}
                    onRefresh={refresh}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={armReset}
                    className={resetArmed
                      ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                      : ""}
                    title={resetArmed ? "Confirmer : remise à zéro de toutes les valeurs saisies" : "Remettre à zéro toutes les valeurs éditables"}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {resetArmed ? "Confirmer ?" : "Réinitialiser"}
                  </Button>
                </div>
              </div>

              <div
                className="max-h-[65vh] overflow-auto rounded-xl border"
                role="region"
                aria-label="Tableau démographique des gouvernorats et délégations"
                tabIndex={0}
              >
                <Table className="table-fixed" style={{ width: 1168 }}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 top-0 z-30 w-32 bg-background">Gouvernorat</TableHead>
                      <TableHead className="sticky left-32 top-0 z-30 w-44 bg-background">Délégation</TableHead>
                      <TableHead className="sticky top-0 z-20 w-20 bg-background text-right" title="Taux d'urbanisation (%)">Urbain</TableHead>
                      <TableHead className="sticky top-0 z-20 w-20 bg-background text-right" title="Taux de ruralité (%)">Rural</TableHead>
                      <TableHead className="sticky top-0 z-20 w-28 bg-background text-right">Population</TableHead>
                      <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Voitures légères">Véh. légères</TableHead>
                      <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Utilitaires & pick-up">Utilitaires</TableHead>
                      <TableHead className="sticky top-0 z-20 w-24 bg-background text-right">Poids lourds</TableHead>
                      <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Autocars & bus">Autocars</TableHead>
                      <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Deux-roues motorisés">Deux-roues</TableHead>
                      <TableHead className="sticky top-0 z-20 w-28 bg-background text-right">Modifié</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleGroups.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                          Aucune délégation ne correspond à la recherche.
                        </TableCell>
                      </TableRow>
                    )}
                    {visibleGroups.map(({ gov, rows }) => (
                      <Fragment key={gov.id}>
                        <TableRow className="bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40">
                          <TableCell colSpan={11} className="py-2">
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                              <button
                                type="button"
                                onClick={() => toggleGov(gov.name)}
                                className="flex h-6 w-6 items-center justify-center rounded text-emerald-700 transition-colors hover:bg-emerald-200/70 dark:text-emerald-400 dark:hover:bg-emerald-800/60"
                                aria-expanded={!isCollapsed(gov.name)}
                                aria-label={isCollapsed(gov.name) ? `Déplier les délégations de ${gov.name}` : `Replier les délégations de ${gov.name}`}
                              >
                                {isCollapsed(gov.name)
                                  ? <ChevronRight className="h-4 w-4" aria-hidden />
                                  : <ChevronDown className="h-4 w-4" aria-hidden />}
                              </button>
                              <Badge variant="outline" className="border-emerald-300 bg-emerald-100/80 font-mono text-[10px] text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                                {gov.isoCode ?? "—"}
                              </Badge>
                              <span className="text-sm font-semibold">{gov.name}</span>
                              {gov.estimated && (
                                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                  est.
                                </Badge>
                              )}
                              <span className="text-[11px] leading-relaxed text-muted-foreground">
                                {fmtInt(gov.population)} hab. · H {gov.menPct !== null ? fmtPct(gov.menPct) : "—"} / F {gov.womenPct !== null ? fmtPct(gov.womenPct) : "—"} · {gov.areaKm2 !== null ? `${fmtInt(gov.areaKm2)} km²` : "—"} · urbain {gov.urbanPct !== null ? fmtPct(gov.urbanPct) : "—"} · rural {gov.ruralPct !== null ? fmtPct(gov.ruralPct) : "—"} · {rows.length} délégation{rows.length > 1 ? "s" : ""}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                        {!isCollapsed(gov.name) && rows.map(row => (
                          <TableRow key={row.id} className="group">
                            <TableCell className="sticky left-0 z-10 bg-background text-xs text-muted-foreground group-hover:bg-muted/50">
                              <span className="block truncate" title={row.gouvernorat}>{row.gouvernorat}</span>
                            </TableCell>
                            <TableCell className="sticky left-32 z-10 bg-background group-hover:bg-muted/50">
                              <span className="block truncate text-sm font-medium" title={row.delegation}>{row.delegation}</span>
                            </TableCell>
                            <TableCell className="p-1">
                              <EditableCell row={row} field="urbanPct" kind="pct" ariaName={`Taux urbain — ${row.delegation}`} onCommit={commitCell} />
                            </TableCell>
                            <TableCell className="p-1">
                              <EditableCell row={row} field="ruralPct" kind="pct" ariaName={`Taux rural — ${row.delegation}`} onCommit={commitCell} />
                            </TableCell>
                            <TableCell className="p-1">
                              <EditableCell row={row} field="population" kind="int" ariaName={`Population — ${row.delegation}`} onCommit={commitCell} />
                            </TableCell>
                            <TableCell className="p-1">
                              <EditableCell row={row} field="vehiclesLight" kind="int" ariaName={`Voitures légères — ${row.delegation}`} onCommit={commitCell} />
                            </TableCell>
                            <TableCell className="p-1">
                              <EditableCell row={row} field="vehiclesUtility" kind="int" ariaName={`Utilitaires — ${row.delegation}`} onCommit={commitCell} />
                            </TableCell>
                            <TableCell className="p-1">
                              <EditableCell row={row} field="vehiclesHeavy" kind="int" ariaName={`Poids lourds — ${row.delegation}`} onCommit={commitCell} />
                            </TableCell>
                            <TableCell className="p-1">
                              <EditableCell row={row} field="vehiclesBuses" kind="int" ariaName={`Autocars & bus — ${row.delegation}`} onCommit={commitCell} />
                            </TableCell>
                            <TableCell className="p-1">
                              <EditableCell row={row} field="vehiclesMotorcycles" kind="int" ariaName={`Deux-roues motorisés — ${row.delegation}`} onCommit={commitCell} />
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right text-[11px] text-muted-foreground">
                              {row.updatedAt ? (
                                <span title={`${fmtDate(row.updatedAt)}${row.updatedBy ? ` — ${row.updatedBy}` : ""}`}>
                                  {timeAgo(row.updatedAt)}
                                </span>
                              ) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Modélisateur — graphiques générés depuis le tableau */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-emerald-600" aria-hidden /> Modélisateur — du tableau aux graphiques
              </CardTitle>
              <CardDescription>
                Choisissez un indicateur et un périmètre : le tableau est converti en camembert
                (répartition) ou en histogramme (classement). Les graphiques suivent les valeurs du
                tableau en temps réel — y compris vos saisies.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="demo-indicator">Indicateur</Label>
                  <Select
                    value={indicator}
                    onValueChange={v => {
                      setIndicator(v)
                      const m = INDICATORS.find(i => i.key === v)
                      if (m && m.unit === "%") setChartType("bars")
                    }}
                  >
                    <SelectTrigger id="demo-indicator"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {INDICATORS.map(i => (
                        <SelectItem key={i.key} value={i.key}>{i.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="demo-perimeter">Périmètre</Label>
                  <Select value={perimeter} onValueChange={setPerimeter}>
                    <SelectTrigger id="demo-perimeter"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="GOUVERNORATS">Tous les gouvernorats ({data.governorats.length})</SelectItem>
                      {data.governorats.map(g => (
                        <SelectItem key={g.id} value={g.name}>Délégations — {g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Type de graphique</Label>
                  <ToggleGroup
                    type="single"
                    value={chartType}
                    onValueChange={v => { if (v) setChartType(v as "pie" | "bars") }}
                    className="justify-start"
                  >
                    <ToggleGroupItem value="pie" aria-label="Camembert" disabled={!pieAllowed} title={pieAllowed ? "Camembert" : "Camembert indisponible pour un taux"}>
                      <PieIcon className="h-4 w-4" aria-hidden />
                      <span className="hidden sm:inline">Camembert</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem value="bars" aria-label="Histogramme">
                      <BarChart3 className="h-4 w-4" aria-hidden />
                      <span className="hidden sm:inline">Histogramme</span>
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4" aria-live="polite">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${indicator}-${perimeter}-${chartType}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    {chart.items.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
                        <PieIcon className="h-8 w-8 opacity-40" aria-hidden />
                        <p className="max-w-md text-sm leading-relaxed">{emptyChartMsg}</p>
                      </div>
                    ) : chartType === "pie" && pieAllowed ? (
                      <ChartPie items={chart.items} unit={chartMeta.unit} decimals={chartMeta.decimals} total={chart.total} />
                    ) : (
                      <ChartBars items={chart.items} unit={chartMeta.unit} decimals={chartMeta.decimals} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Volet 3 : Paramétrage (visibilité des utilisateurs) ---- */}
        <TabsContent value="parametrage" className="mt-0 space-y-4">
          <SaDemographieParametrage access={data.access} actor={actor} onChanged={refresh} />
        </TabsContent>
      </Tabs>

      {/* Source et gouvernance du module */}
      <Alert>
        <Info aria-hidden />
        <AlertDescription>
          Référence : Institut National de la Statistique (recensement 2024) — les valeurs marquées
          « est. » sont des estimations. Ce module est administré par la Super Administration ; la
          visibilité est paramétrable utilisateur par utilisateur (volet Paramétrage) et prend effet
          dans l&apos;Observatoire B2B. Le découpage complet (gouvernorat → délégation → cité) pourra
          être étendu ultérieurement.
        </AlertDescription>
      </Alert>
    </div>
  )
}

/** Résumé FR du patch pour le toast : « population : 52 400 · taux urbain : 78 % ». */
function describePatch(patch: Record<string, number | null>): string {
  return Object.entries(patch)
    .map(([k, v]) => {
      const label = TOAST_LABELS[k] ?? k
      return v === null ? `${label} effacé` : `${label} : ${k.endsWith("Pct") ? fmtPct(v) : fmtInt(v)}`
    })
    .join(" · ")
}

/** Résumé FR du patch gouvernorat : « population : 1 056 300 · urbain : 99 % ». */
function describeGouvPatch(patch: Record<string, number | null>): string {
  return Object.entries(patch)
    .map(([k, v]) => {
      const label = GOV_TOAST_LABELS[k] ?? k
      if (v === null) return `${label} effacé`
      if (k === "areaKm2") return `${label} : ${fmtInt(v)} km²`
      if (k === "avgFleetAge") return `${label} : ${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ans`
      if (k.endsWith("Pct") || k === "motorizationRate") return `${label} : ${fmtPct(v)}`
      return `${label} : ${fmtInt(v)}`
    })
    .join(" · ")
}
