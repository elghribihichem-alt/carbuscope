'use client'

// CarbuScope — T54-B3a — volet « Simulations de rentabilité » du module
// Opportunity Radar. Calculateur PÉDAGOGIQUE (badges « est. », pas de fausse
// précision) : entrées pré-remplies depuis le volet Formats recommandés via
// un handoff léger dans le store de navigation (nav.radarSim = JSON
// { gouvernorat, format } — posé par le bouton « Simuler ce format », lu une
// seule fois à la monture du volet, effaçable).
//
// MODÈLE ÉCONOMIQUE SIMPLIFIÉ (documenté, tout en DT, chiffres FR) :
//   · CA carburant mensuel = litres/j × 30,4 j × 2,5 DT/L (prix pompe est.) ;
//   · CA services/food = part (0-40 %) du CA carburant, marge commerce 30 %
//     (pattern A.6.4 MARGE_BOUTIQUE) ;
//   · marge brute = litres × 30,4 × marge/L + marge services ;
//   · charges fixes mensuelles détaillées (personnel/loyer/énergie/assurance) ;
//   · financement : apport % + crédit annuités (taux, durée) — mensualité
//     classique E×t/(1−(1+t)^−n) ;
//   · flux net mensuel = marge brute − charges − mensualité (après crédit :
//     sans mensualité) ;
//   · cash-flow cumulé FONDS PROPRES : −apport au départ puis flux nets, avec
//     le « saut » au dernier remboursement du crédit ;
//   · point de rentabilité (mois) = franchissement du zéro du cumul (payback
//     sur fonds propres) ; TRI estimé par dichotomie sur les flux mensuels ;
//   · ROI 5 ans = cumul à 60 mois ÷ apport.
// Sauvegarde : SavedCalculation (type « radar-simulation ») via la route
// additive /api/radar/simulations (POST/GET/DELETE, session requise).

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Banknote,
  BookmarkPlus,
  Calculator,
  ChevronRight,
  Coins,
  FileSearch,
  Hourglass,
  Lightbulb,
  ListChecks,
  RotateCcw,
  Scale,
  Timer,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Wand2,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Skeleton } from "@/components/shell/loading"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AXIS_STYLE, GRID_STROKE, tooltipStyle } from "@/lib/chart"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store/app-store"
import type { GovernoratScore, ScoringWeights } from "@/lib/radar/scoring"
import {
  FORMAT_BY_ID,
  simDefaultsFor,
  suggestLitresJour,
  STATION_FORMATS,
  type FormatId,
} from "@/lib/radar/formats"

/* ============================== Types locaux ============================== */

type ScoringResponse = {
  weights: ScoringWeights
  gouvernorats: GovernoratScore[]
  generatedAt: string
}

type SimScenarioDTO = {
  id: string
  label: string
  gouvernorat: string
  formatId: string
  params: Record<string, unknown>
  result: {
    caMensuel?: number
    margeBruteM?: number
    fluxNetM?: number
    paybackMois?: number
    triPct?: number
    roi5ans?: number
    cumulFin?: number
  }
  createdAt: string
}

/* ============================== Formatage FR ============================== */

const fmtInt = (v: number): string =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number.isFinite(v) ? v : 0)

const fmtDec = (v: number, digits = 1): string =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    Number.isFinite(v) ? v : 0,
  )

const fmtDT = (v: number): string => `${fmtInt(v)} DT`

const fmtDateFr = (iso: string): string =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })

/** Payback en texte FR (« 2 ans 4 mois », « non atteint »). */
const paybackText = (months: number | null): string => {
  if (months == null || !Number.isFinite(months) || months > 600) return "non atteint"
  const y = Math.floor(months / 12)
  const m = Math.round(months % 12)
  if (y <= 0) return `${m} mois`
  return `${y} an${y > 1 ? "s" : ""}${m > 0 ? ` ${m} mois` : ""}`
}

const asNumber = (v: unknown, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/* ============================== Moteur de simulation (pur) ============================== */

const JOURS_MOIS = 30.4
const PRIX_LITRE_ESTIME = 2.5
const TAUX_MARGE_SERVICES = 0.3

export type SimInputs = {
  litres: number
  margeLitre: number
  partServices: number
  chargesFixes: number
  capex: number
  droitEntree: number
  apportPct: number
  tauxCredit: number
  dureeAns: number
  horizonAns: number
}

export type SimResult = {
  invest: number
  apport: number
  emprunt: number
  mensualite: number
  coutInterets: number
  caCarburantM: number
  caServicesM: number
  caTotalM: number
  margeCarburantM: number
  margeServicesM: number
  margeBruteM: number
  chargesM: number
  fluxNetM: number
  fluxNetApresCredit: number
  /** Mois de franchissement du zéro du cumul fonds propres (null si jamais). */
  paybackMois: number | null
  /** TRI annualisé estimé (null si non calculable). */
  triPct: number | null
  /** ROI sur 5 ans (60 mois), en % de l'apport. */
  roi5ansPct: number | null
  /** Cumul fonds propres à la fin de l'horizon. */
  cumulFin: number
  /** Volume (L/j) nécessaire pour équilibrer le flux net mensuel (est.). */
  volumeEquilibre: number | null
  /** Série mensuelle du cash-flow cumulé (mois 0 → horizon×12). */
  serie: Array<{ mois: number; cumul: number }>
}

/** Annuité mensuelle constante d'un emprunt E au taux annuel t sur n mois. */
function annuiteMensuelle(emprunt: number, tauxAnnuel: number, nMois: number): number {
  if (emprunt <= 0 || nMois <= 0) return 0
  const t = tauxAnnuel / 100 / 12
  if (t <= 0) return emprunt / nMois
  return (emprunt * t) / (1 - Math.pow(1 + t, -nMois))
}

/** TRI mensuel par dichotomie sur la série [−apport, flux…], annualisé. */
function triEstime(apport: number, flux: number[]): number | null {
  if (apport <= 0 || flux.length === 0) return null
  const npv = (r: number): number => {
    let s = -apport
    for (let m = 0; m < flux.length; m++) s += flux[m] / Math.pow(1 + r, m + 1)
    return s
  }
  let lo = -0.9
  let hi = 1.0
  const fLo = npv(lo)
  const fHi = npv(hi)
  if (fLo * fHi > 0) return null // pas de racine (jamais rentable ou triviale)
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    const fMid = npv(mid)
    if (Math.abs(fMid) < 1e-6) break
    if (fLo * fMid <= 0) hi = mid
    else lo = mid
  }
  const r = (lo + hi) / 2
  if (!Number.isFinite(r) || r <= -0.99) return null
  return (Math.pow(1 + r, 12) - 1) * 100
}

/** Simulation complète (pure — même moteur pour le central et les scénarios). */
function computeSim(inputs: SimInputs): SimResult {
  const litres = Math.max(0, inputs.litres)
  const part = Math.min(40, Math.max(0, inputs.partServices))
  const margeLitre = Math.max(0, inputs.margeLitre)

  const caCarburantM = litres * JOURS_MOIS * PRIX_LITRE_ESTIME
  const caServicesM = caCarburantM * (part / 100)
  const margeCarburantM = litres * JOURS_MOIS * margeLitre
  const margeServicesM = caServicesM * TAUX_MARGE_SERVICES
  const margeBruteM = margeCarburantM + margeServicesM
  const chargesM = Math.max(0, inputs.chargesFixes)

  const invest = Math.max(0, inputs.capex) + Math.max(0, inputs.droitEntree)
  const apport = (invest * Math.min(100, Math.max(0, inputs.apportPct))) / 100
  const emprunt = invest - apport
  const nMois = Math.round(inputs.dureeAns * 12)
  const mensualite = annuiteMensuelle(emprunt, inputs.tauxCredit, nMois)
  const coutInterets = Math.max(0, mensualite * nMois - emprunt)

  const fluxNetM = margeBruteM - chargesM - mensualite
  const fluxApres = margeBruteM - chargesM

  // Série mensuelle du cumul fonds propres (avec le saut fin de crédit).
  const horizonMois = Math.round(inputs.horizonAns * 12)
  const serie: Array<{ mois: number; cumul: number }> = [{ mois: 0, cumul: -apport }]
  let cumul = -apport
  let paybackMois: number | null = cumul >= 0 ? 0 : null
  for (let m = 1; m <= horizonMois; m++) {
    cumul += m <= nMois ? fluxNetM : fluxApres
    serie.push({ mois: m, cumul })
    if (paybackMois == null && cumul >= 0) paybackMois = m
  }

  // TRI : flux sur l'horizon (mensualité puis flux après crédit).
  const flux: number[] = []
  for (let m = 1; m <= horizonMois; m++) flux.push(m <= nMois ? fluxNetM : fluxApres)
  const tri = triEstime(apport, flux)

  // ROI 5 ans : cumul à 60 mois (indépendant de l'horizon choisi).
  let cumul60 = -apport
  for (let m = 1; m <= 60; m++) cumul60 += m <= nMois ? fluxNetM : fluxApres
  const roi5ansPct = apport > 0 ? (cumul60 / apport) * 100 : null

  // Volume d'équilibre : L/j pour que le flux net (crédit en cours) soit nul.
  const coefMarge =
    JOURS_MOIS * (margeLitre + PRIX_LITRE_ESTIME * (part / 100) * TAUX_MARGE_SERVICES)
  const besoin = chargesM + mensualite
  const volumeEquilibre = coefMarge > 0 ? Math.ceil(besoin / coefMarge) : null

  return {
    invest,
    apport,
    emprunt,
    mensualite,
    coutInterets,
    caCarburantM,
    caServicesM,
    caTotalM: caCarburantM + caServicesM,
    margeCarburantM,
    margeServicesM,
    margeBruteM,
    chargesM,
    fluxNetM,
    fluxNetApresCredit: fluxApres,
    paybackMois,
    triPct: tri,
    roi5ansPct,
    cumulFin: cumul,
    volumeEquilibre,
    serie,
  }
}

/* ============================== Scénarios comparés ============================== */

/** Multiplicateurs documentés des 3 scénarios (volume · marge · charges). */
const SCENARIO_MULT = {
  prudent: { litres: 0.8, marge: 0.95, charges: 1.05, label: "Prudent" },
  central: { litres: 1, marge: 1, charges: 1, label: "Central" },
  ambitieux: { litres: 1.2, marge: 1.05, charges: 0.98, label: "Ambitieux" },
} as const

type ScenarioKey = keyof typeof SCENARIO_MULT

type ScenarioSnapshot = {
  key: ScenarioKey
  label: string
  mult: (typeof SCENARIO_MULT)[ScenarioKey]
  inputs: SimInputs
  result: SimResult
}

/* ============================== Atomes paramètres ============================== */

function SliderParam({
  label,
  value,
  min,
  max,
  step = 1,
  onValueChange,
  format,
  hint,
  badge,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onValueChange: (v: number) => void
  format?: (v: number) => string
  hint?: React.ReactNode
  badge?: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <Label className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <span className="truncate">{label}</span>
          {badge}
        </Label>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
          {format ? format(value) : fmtInt(value)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={v => onValueChange(v[0] ?? value)}
        aria-label={label}
      />
      {hint && <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  )
}

function NumberParam({
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
          onChange={e => {
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

/** Petit KPI compact pour les cartes de scénario. */
function ScenarioKpi({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="flex min-w-0 justify-between gap-2">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd className="min-w-0 shrink-0 text-right">
        <span className="font-semibold tabular-nums">{value}</span>
        {delta && <span className="ml-1 text-[10px] text-muted-foreground">{delta}</span>}
      </dd>
    </div>
  )
}

/* ============================== Handoff (pré-remplissage) ============================== */

type Handoff = { gouvernorat: string; format: FormatId }

/** Parse le JSON léger du handoff (robuste : invalide → null). */
function parseHandoff(raw: string): Handoff | null {
  if (!raw) return null
  try {
    const h = JSON.parse(raw) as { gouvernorat?: unknown; format?: unknown }
    if (typeof h.gouvernorat !== "string" || h.gouvernorat.length === 0) return null
    const fid = typeof h.format === "string" && h.format in FORMAT_BY_ID ? (h.format as FormatId) : null
    if (!fid) return null
    return { gouvernorat: h.gouvernorat, format: fid }
  } catch {
    return null
  }
}

/* ============================== Volet ============================== */

export function RadarSimulations({ prefill }: { prefill: string }) {
  const setNav = useAppStore(s => s.setNav)

  // ---- Handoff : lu UNE fois à la monture (le volet est remonté à chaque
  // activation d'onglet — cf. Radix Tabs). Effaçable sans reset (le store
  // nav.radarSim est vidé : la prochaine monture repartira des défauts). ----
  const [handoff] = useState(() => parseHandoff(prefill))
  const [handoffActive, setHandoffActive] = useState(() => handoff != null)

  // ---- Données gouvernorats (profil réel du scoring T54-B2) ----
  const [data, setData] = useState<ScoringResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // ---- Entrées (pré-remplies par le format / le gouvernorat) ----
  const initialDefaults = simDefaultsFor(handoff?.format ?? "classique")
  const [selectedGov, setSelectedGov] = useState(() => handoff?.gouvernorat ?? "")
  const [formatId, setFormatId] = useState<FormatId>(() => handoff?.format ?? "classique")
  const [litres, setLitres] = useState(0)
  const [margeLitre, setMargeLitre] = useState(0.18)
  const [partServices, setPartServices] = useState(initialDefaults.partServices)
  const [personnel, setPersonnel] = useState(initialDefaults.charges.personnel)
  const [loyer, setLoyer] = useState(initialDefaults.charges.loyer)
  const [energie, setEnergie] = useState(initialDefaults.charges.energie)
  const [assurance, setAssurance] = useState(initialDefaults.charges.assurance)
  const [capex, setCapex] = useState(initialDefaults.capex)
  const [droitEntree, setDroitEntree] = useState(initialDefaults.droitEntree)
  const [apportPct, setApportPct] = useState(40)
  const [tauxCredit, setTauxCredit] = useState(8.5)
  const [dureeAns, setDureeAns] = useState(10)
  const [horizonAns, setHorizonAns] = useState(5)

  // ---- UI ----
  const volumeRef = useRef<HTMLDivElement | null>(null)
  const [highlightVolume, setHighlightVolume] = useState(false)
  const [labelInput, setLabelInput] = useState("")
  const [scenarios, setScenarios] = useState<ScenarioSnapshot[] | null>(null)

  // ---- Scénarios sauvegardés (SavedCalculation type radar-simulation) ----
  const [savedList, setSavedList] = useState<SimScenarioDTO[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SimScenarioDTO | null>(null)

  const govs = data?.gouvernorats ?? []
  const currentGov = useMemo(
    () => govs.find(g => g.name === selectedGov) ?? govs[0] ?? null,
    [govs, selectedGov],
  )

  // ---- Chargement du profil scoring (une seule passe, abortable) ----
  const appliedInitial = useRef(false)
  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/radar/scoring", { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`/api/radar/scoring → ${r.status}`)
        return (await r.json()) as ScoringResponse
      })
      .then(d => {
        setData(d)
        setError(null)
        // Gouvernorat effectif (handoff prioritaire, sinon le rang 1) + volume
        // suggéré initial (est.) — une seule fois, sans écraser un chargement.
        if (!appliedInitial.current) {
          appliedInitial.current = true
          const eff =
            d.gouvernorats.find(g => g.name === selectedGov) ?? d.gouvernorats[0] ?? null
          if (eff) {
            setSelectedGov(eff.name)
            setLitres(
              suggestLitresJour(
                {
                  name: eff.name,
                  parc: eff.parc,
                  pouvoir: eff.pouvoir,
                  trafic: eff.trafic,
                  concurrence: eff.concurrence,
                  foncier: eff.foncier,
                  vehicles: eff.vehicles,
                  stations: eff.stations,
                  score: eff.score,
                  rank: eff.rank,
                },
                formatId,
              ),
            )
          }
        }
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
    // selectedGov/formatId lus volontairement à la première passe uniquement
    // (volume suggéré initial) — les changements passent par les handlers.
  }, [reloadKey])

  // ---- Liste des scénarios sauvegardés ----
  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/radar/simulations", { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`/api/radar/simulations → ${r.status}`)
        return (await r.json()) as { simulations: SimScenarioDTO[] }
      })
      .then(d => setSavedList(d.simulations))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setSavedList([])
      })
    return () => ctrl.abort()
  }, [reloadKey])

  /** Ré-applique les valeurs indicatives du format (CAPEX, charges, part). */
  const applyFormatDefaults = (fid: FormatId) => {
    const d = simDefaultsFor(fid)
    setCapex(d.capex)
    setDroitEntree(d.droitEntree)
    setPartServices(d.partServices)
    setPersonnel(d.charges.personnel)
    setLoyer(d.charges.loyer)
    setEnergie(d.charges.energie)
    setAssurance(d.charges.assurance)
  }

  /** Volume suggéré (est.) dérivé du profil réel trafic/parc du gouvernorat. */
  const suggestedLitres = useMemo(() => {
    if (!currentGov) return null
    return suggestLitresJour(
      {
        name: currentGov.name,
        parc: currentGov.parc,
        pouvoir: currentGov.pouvoir,
        trafic: currentGov.trafic,
        concurrence: currentGov.concurrence,
        foncier: currentGov.foncier,
        vehicles: currentGov.vehicles,
        stations: currentGov.stations,
        score: currentGov.score,
        rank: currentGov.rank,
      },
      formatId,
    )
  }, [currentGov, formatId])

  const chargesFixes = personnel + loyer + energie + assurance
  const inputs: SimInputs = {
    litres,
    margeLitre,
    partServices,
    chargesFixes,
    capex,
    droitEntree,
    apportPct,
    tauxCredit,
    dureeAns,
    horizonAns,
  }
  const res = useMemo(() => computeSim(inputs), [litres, margeLitre, partServices, chargesFixes, capex, droitEntree, apportPct, tauxCredit, dureeAns, horizonAns])

  // ---- Handlers ----

  const onGovChange = (v: string) => {
    setSelectedGov(v)
    // Volume re-suggéré (est.) pour le nouveau profil — les autres hypothèses
    // (CAPEX, charges) restent celles saisies : seule la volumétrie dépend
    // du gouvernorat.
    const g = govs.find(x => x.name === v)
    if (g) {
      setLitres(
        suggestLitresJour(
          {
            name: g.name, parc: g.parc, pouvoir: g.pouvoir, trafic: g.trafic,
            concurrence: g.concurrence, foncier: g.foncier, vehicles: g.vehicles,
            stations: g.stations, score: g.score, rank: g.rank,
          },
          formatId,
        ),
      )
      setScenarios(null)
    }
  }

  const onFormatChange = (v: string) => {
    const fid = (v in FORMAT_BY_ID ? v : "classique") as FormatId
    setFormatId(fid)
    applyFormatDefaults(fid)
    setScenarios(null)
    if (currentGov) {
      setLitres(
        suggestLitresJour(
          {
            name: currentGov.name, parc: currentGov.parc, pouvoir: currentGov.pouvoir,
            trafic: currentGov.trafic, concurrence: currentGov.concurrence,
            foncier: currentGov.foncier, vehicles: currentGov.vehicles,
            stations: currentGov.stations, score: currentGov.score, rank: currentGov.rank,
          },
          fid,
        ),
      )
    }
  }

  const ajusterVolume = () => {
    volumeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    setHighlightVolume(true)
    window.setTimeout(() => setHighlightVolume(false), 1600)
  }

  const reset = () => {
    const d = simDefaultsFor("classique")
    setFormatId("classique")
    applyFormatDefaults("classique")
    setMargeLitre(0.18)
    setApportPct(40)
    setTauxCredit(8.5)
    setDureeAns(10)
    setHorizonAns(5)
    setLabelInput("")
    setScenarios(null)
    setHandoffActive(false)
    setNav("radarSim", "")
    const g = currentGov ?? govs[0]
    if (g) {
      setLitres(
        suggestLitresJour(
          {
            name: g.name, parc: g.parc, pouvoir: g.pouvoir, trafic: g.trafic,
            concurrence: g.concurrence, foncier: g.foncier, vehicles: g.vehicles,
            stations: g.stations, score: g.score, rank: g.rank,
          },
          "classique",
        ),
      )
    }
  }

  // ---- Scénarios : génération (multiplicateurs documentés) ----
  const generateScenarios = () => {
    const snaps: ScenarioSnapshot[] = (Object.keys(SCENARIO_MULT) as ScenarioKey[]).map(key => {
      const mult = SCENARIO_MULT[key]
      const scInputs: SimInputs = {
        ...inputs,
        litres: Math.max(500, Math.round((litres * mult.litres) / 100) * 100),
        margeLitre: Math.round(margeLitre * mult.marge * 1000) / 1000,
        chargesFixes: Math.round(chargesFixes * mult.charges),
      }
      return { key, label: mult.label, mult, inputs: scInputs, result: computeSim(scInputs) }
    })
    setScenarios(snaps)
    toast.success("Scénarios générés", {
      description: "Prudent ×0,80 · central · ambitieux ×1,20 (marge ±5 %, charges +5 %/−2 %).",
    })
  }

  /** Applique les hypothèses d'un scénario au formulaire (documenté). */
  const applyScenario = (s: ScenarioSnapshot) => {
    setLitres(s.inputs.litres)
    setMargeLitre(s.inputs.margeLitre)
    const k = s.mult.charges
    setPersonnel(Math.round(personnel * k))
    setLoyer(Math.round(loyer * k))
    setEnergie(Math.round(energie * k))
    setAssurance(Math.round(assurance * k))
    toast.info(`Hypothèses « ${s.label.toLowerCase()} » appliquées`, {
      description: "Volume, marge au litre et charges fixes mis à jour — les autres paramètres sont inchangés.",
    })
  }

  // ---- Sauvegarde / chargement / suppression ----

  const defaultLabel = `Simulation ${FORMAT_BY_ID[formatId].nom} — ${currentGov?.name ?? "gouvernorat"}`

  const saveScenario = async () => {
    setSaving(true)
    try {
      const r = await fetch("/api/radar/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: labelInput.trim() || defaultLabel,
          gouvernorat: currentGov?.name ?? "",
          formatId,
          params: {
            gouvernorat: currentGov?.name ?? "",
            formatId,
            litres,
            margeLitre,
            partServices,
            personnel,
            loyer,
            energie,
            assurance,
            capex,
            droitEntree,
            apportPct,
            tauxCredit,
            dureeAns,
            horizonAns,
          },
          result: {
            caMensuel: Math.round(res.caTotalM),
            margeBruteM: Math.round(res.margeBruteM),
            fluxNetM: Math.round(res.fluxNetM),
            paybackMois: res.paybackMois != null ? Math.round(res.paybackMois) : -1,
            triPct: res.triPct != null ? Number(res.triPct.toFixed(1)) : -1,
            roi5ans: res.roi5ansPct != null ? Number(res.roi5ansPct.toFixed(1)) : -1,
            cumulFin: Math.round(res.cumulFin),
          },
        }),
      })
      const body = (await r.json().catch(() => ({}))) as { calculation?: SimScenarioDTO; simulation?: SimScenarioDTO; error?: string }
      if (!r.ok || (!body.calculation && !body.simulation)) {
        toast.error(body.error ?? "Enregistrement impossible — réessayez.")
        return
      }
      const saved = body.simulation ?? body.calculation!
      setSavedList(prev => [saved, ...(prev ?? [])])
      toast.success("Scénario enregistré", { description: saved.label })
      setLabelInput("")
    } catch {
      toast.error("Enregistrement impossible — vérifiez votre connexion.")
    } finally {
      setSaving(false)
    }
  }

  const loadScenario = (s: SimScenarioDTO) => {
    const p = s.params ?? {}
    const govName = typeof p.gouvernorat === "string" ? p.gouvernorat : s.gouvernorat
    const known = govs.find(x => x.name === govName)
    if (known) {
      setSelectedGov(known.name)
    } else if (govs.length > 0) {
      setSelectedGov(govs[0].name)
      toast.info("Gouvernorat du scénario introuvable — profil national appliqué.")
    }
    const fid = typeof p.formatId === "string" && p.formatId in FORMAT_BY_ID ? (p.formatId as FormatId) : "classique"
    setFormatId(fid)
    setLitres(asNumber(p.litres, 500))
    setMargeLitre(asNumber(p.margeLitre, 0.18))
    setPartServices(Math.min(40, asNumber(p.partServices, simDefaultsFor(fid).partServices)))
    setPersonnel(asNumber(p.personnel, simDefaultsFor(fid).charges.personnel))
    setLoyer(asNumber(p.loyer, simDefaultsFor(fid).charges.loyer))
    setEnergie(asNumber(p.energie, simDefaultsFor(fid).charges.energie))
    setAssurance(asNumber(p.assurance, simDefaultsFor(fid).charges.assurance))
    setCapex(asNumber(p.capex, simDefaultsFor(fid).capex))
    setDroitEntree(asNumber(p.droitEntree, simDefaultsFor(fid).droitEntree))
    setApportPct(Math.min(100, asNumber(p.apportPct, 40)))
    setTauxCredit(Math.min(15, asNumber(p.tauxCredit, 8.5)))
    setDureeAns(Math.min(15, Math.max(1, asNumber(p.dureeAns, 10))))
    setHorizonAns(Math.min(7, Math.max(3, asNumber(p.horizonAns, 5))))
    setScenarios(null)
    setHandoffActive(false)
    setNav("radarSim", "")
    toast.success("Scénario chargé", { description: `${s.label} — les entrées sont restaurées.` })
  }

  const deleteScenario = async (s: SimScenarioDTO) => {
    try {
      const r = await fetch(`/api/radar/simulations?id=${encodeURIComponent(s.id)}`, { method: "DELETE" })
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!r.ok || !body.ok) {
        toast.error(body.error ?? "Suppression impossible — réessayez.")
        return
      }
      setSavedList(prev => (prev ?? []).filter(x => x.id !== s.id))
      toast.success("Scénario supprimé", { description: s.label })
    } catch {
      toast.error("Suppression impossible — vérifiez votre connexion.")
    } finally {
      setDeleteTarget(null)
    }
  }

  /* ============================== Rendus ============================== */

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#b4552f]">
            <TriangleAlert className="h-4 w-4" aria-hidden />
            Simulations indisponibles
          </p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" className="h-11" onClick={() => setReloadKey(k => k + 1)}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  const payback = res.paybackMois
  const risk =
    payback == null
      ? { tone: "text-[#b4552f] dark:text-[#e8a186]", bar: "bg-[#e07856]", label: "Risque élevé — rentabilité non atteinte sur l'horizon" }
      : payback <= 36
        ? { tone: "text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-500 dark:bg-emerald-400", label: "Risque maîtrisé — payback ≤ 3 ans" }
        : payback <= 60
          ? { tone: "text-amber-700 dark:text-amber-400", bar: "bg-amber-500 dark:bg-amber-400", label: "Vigilance — payback entre 3 et 5 ans" }
          : { tone: "text-[#b4552f] dark:text-[#e8a186]", bar: "bg-[#e07856]", label: "Risque élevé — payback au-delà de 5 ans" }

  const fmtPct1 = (v: number | null) => (v == null ? "—" : `${fmtDec(v, 1)} %`)

  const pnlRows: { label: string; m: number; a: number; tone?: string; strong?: boolean }[] = [
    { label: "CA carburant (est. 2,5 DT/L)", m: res.caCarburantM, a: res.caCarburantM * 12 },
    { label: "CA services/food (marge 30 %)", m: res.caServicesM, a: res.caServicesM * 12 },
    { label: "CA total", m: res.caTotalM, a: res.caTotalM * 12, strong: true },
    { label: "Marge brute", m: res.margeBruteM, a: res.margeBruteM * 12, tone: "text-emerald-700 dark:text-emerald-400" },
    { label: "Charges fixes", m: -res.chargesM, a: -res.chargesM * 12 },
    { label: "Remboursement crédit (annuités)", m: -res.mensualite, a: -res.mensualite * 12 },
    {
      label: "Flux net (avant impôts)",
      m: res.fluxNetM,
      a: res.fluxNetM * 12,
      strong: true,
      tone: res.fluxNetM >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-[#b4552f] dark:text-[#e8a186]",
    },
  ]

  const central = scenarios?.find(s => s.key === "central")

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- Bandeau handoff (pré-remplissage depuis Formats) ---- */}
      {handoffActive && handoff && (
        <Card className="border-emerald-300/70 bg-emerald-50/60 dark:border-emerald-800/60 dark:bg-emerald-950/25">
          <CardContent className="flex min-w-0 flex-wrap items-center gap-2 p-3 sm:p-4">
            <ChevronRight className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <p className="min-w-0 flex-1 text-xs leading-snug">
              Pré-rempli depuis <strong>Formats recommandés</strong> — gouvernorat{" "}
              <strong>{handoff.gouvernorat}</strong>, format{" "}
              <strong>{FORMAT_BY_ID[handoff.format].nom}</strong> (CAPEX, charges et volume
              suggéré).
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => {
                setHandoffActive(false)
                setNav("radarSim", "")
              }}
            >
              Effacer la pré-sélection
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(320px,400px)_1fr]">
        {/* ==================== Paramètres ==================== */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Calculator className="h-4 w-4" />
              </span>
              Hypothèses
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Valeurs indicatives — les résultats se recalculent en direct.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {!data && <Skeleton className="h-16 w-full" />}

            {/* Gouvernorat */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Gouvernorat</Label>
              <Select value={currentGov?.name ?? ""} onValueChange={onGovChange} disabled={!data}>
                <SelectTrigger className="h-10 w-full" aria-label="Gouvernorat du projet">
                  <SelectValue placeholder="Chargement…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {govs.map(g => (
                    <SelectItem key={g.name} value={g.name}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate">{g.name}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          trafic {Math.max(0, Math.round(g.trafic))} · parc {Math.max(0, Math.round(g.parc))}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Format */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Format de station</Label>
              <Select value={formatId} onValueChange={onFormatChange}>
                <SelectTrigger className="h-10 w-full" aria-label="Format de station">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATION_FORMATS.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      <span className="flex flex-col">
                        <span className="truncate">{f.nom}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          CAPEX {(simDefaultsFor(f.id).capex / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} MDT · charges{" "}
                          {fmtInt(
                            simDefaultsFor(f.id).charges.personnel +
                              simDefaultsFor(f.id).charges.loyer +
                              simDefaultsFor(f.id).charges.energie +
                              simDefaultsFor(f.id).charges.assurance,
                          )}{" "}
                          DT/mois
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] leading-tight text-muted-foreground">
                Changer de format ré-applique CAPEX, charges et part services indicatifs.
              </p>
            </div>

            {/* Volume */}
            <div
              ref={volumeRef}
              className={cn(
                "rounded-lg border p-3 transition-shadow",
                highlightVolume && "ring-2 ring-amber-400",
              )}
            >
              <SliderParam
                label="Volume carburant"
                value={litres}
                min={500}
                max={25_000}
                step={100}
                onValueChange={v => {
                  setLitres(v)
                  setScenarios(null)
                }}
                format={v => `${fmtInt(v)} L/j`}
                badge={
                  suggestedLitres != null ? (
                    <Badge
                      variant="outline"
                      className="h-4 border-amber-300 bg-amber-50 px-1 text-[9px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                    >
                      est.
                    </Badge>
                  ) : undefined
                }
                hint={
                  suggestedLitres != null ? (
                    <>
                      Suggestion dérivée du profil réel {currentGov?.name} (trafic/parc) :{" "}
                      <strong className="tabular-nums">{fmtInt(suggestedLitres)} L/j</strong> —{" "}
                      <button
                        type="button"
                        className="font-medium text-primary underline-offset-2 hover:underline"
                        onClick={ajusterVolume}
                      >
                        ajuster
                      </button>
                    </>
                  ) : undefined
                }
              />
            </div>

            <SliderParam
              label="Marge brute par litre"
              value={margeLitre}
              min={0.05}
              max={0.35}
              step={0.005}
              onValueChange={setMargeLitre}
              format={v => `${fmtDec(v, 3)} DT/L`}
              hint="marge détaillant réglementée ≈ 0,18-0,19 DT/L"
            />

            <SliderParam
              label="Part services/food (CA carburant)"
              value={partServices}
              min={0}
              max={40}
              step={1}
              onValueChange={setPartServices}
              format={v => `${fmtInt(v)} %`}
              hint="food store ≈ 30-35 % · compacte ≈ 5-10 % — marge commerce 30 % appliquée"
            />

            {/* Charges fixes mensuelles */}
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Charges fixes mensuelles{" "}
                <span className="font-bold text-foreground tabular-nums">{fmtDT(chargesFixes)}</span>
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumberParam label="Personnel" value={personnel} onValueChange={setPersonnel} suffix="DT" step={500} />
                <NumberParam label="Loyer foncier" value={loyer} onValueChange={setLoyer} suffix="DT" step={500} />
                <NumberParam label="Énergie" value={energie} onValueChange={setEnergie} suffix="DT" step={250} />
                <NumberParam label="Assurance" value={assurance} onValueChange={setAssurance} suffix="DT" step={250} />
              </div>
            </div>

            {/* Investissement */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberParam
                label="CAPEX"
                value={capex}
                onValueChange={setCapex}
                suffix="DT"
                step={50_000}
                hint="génie civil, équipements, licences"
              />
              <NumberParam
                label="Droit d'entrée"
                value={droitEntree}
                onValueChange={setDroitEntree}
                suffix="DT"
                step={10_000}
                hint="enseigne / licence d'exploitation"
              />
            </div>

            {/* Financement */}
            <div className="space-y-3 rounded-lg border border-amber-200/60 bg-amber-50/40 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                <Scale className="h-3.5 w-3.5" aria-hidden /> Financement
              </p>
              <SliderParam
                label="Apport (fonds propres)"
                value={apportPct}
                min={10}
                max={100}
                step={5}
                onValueChange={setApportPct}
                format={v => `${fmtInt(v)} %`}
                hint={`apport ${fmtDT(res.apport)} · emprunt ${fmtDT(res.emprunt)}`}
              />
              <SliderParam
                label="Taux du crédit"
                value={tauxCredit}
                min={0}
                max={15}
                step={0.25}
                onValueChange={setTauxCredit}
                format={v => `${fmtDec(v, 2)} %`}
                hint={`annuité ${fmtDT(res.mensualite)}/mois · intérêts cumulés ${fmtDT(res.coutInterets)}`}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Durée du crédit</Label>
                  <Select value={String(dureeAns)} onValueChange={v => setDureeAns(Number(v))}>
                    <SelectTrigger className="h-10 w-full" aria-label="Durée du crédit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[3, 5, 7, 10, 12, 15].map(d => (
                        <SelectItem key={d} value={String(d)}>
                          {d} ans
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Horizon d&apos;étude</Label>
                  <Select value={String(horizonAns)} onValueChange={v => setHorizonAns(Number(v))}>
                    <SelectTrigger className="h-10 w-full" aria-label="Horizon d'étude">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[3, 4, 5, 6, 7].map(h => (
                        <SelectItem key={h} value={String(h)}>
                          {h} ans
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Button variant="outline" className="h-11 w-full gap-1.5" onClick={reset}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Réinitialiser
            </Button>
          </CardContent>
        </Card>

        {/* ==================== Résultats ==================== */}
        <div className="min-w-0 space-y-4" aria-live="polite">
          {/* Note honnête */}
          <Card className="border-amber-200/70 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20">
            <CardContent className="flex min-w-0 flex-wrap items-center gap-2 p-3 sm:p-4">
              <Lightbulb className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <p className="min-w-0 flex-1 text-[11px] leading-snug text-amber-900 dark:text-amber-300">
                Hypothèses indicatives à valider en étude de faisabilité — voir l&apos;onglet dédié.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-1.5"
                onClick={() => setNav("radar", "faisabilite")}
              >
                <FileSearch className="h-3.5 w-3.5" aria-hidden />
                Faisabilité
              </Button>
            </CardContent>
          </Card>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Kpi label="CA mensuel (est.)" value={fmtDT(res.caTotalM)} sub={`carburant ${fmtDT(res.caCarburantM)} + services ${fmtDT(res.caServicesM)}`} icon={Banknote} />
            <Kpi
              label="Marge brute / mois"
              value={fmtDT(res.margeBruteM)}
              sub={`${fmtDT(res.margeCarburantM)} carburant + ${fmtDT(res.margeServicesM)} services`}
              icon={Coins}
              tone={res.margeBruteM > res.chargesM ? "success" : "warning"}
            />
            <Kpi
              label="Flux net mensuel"
              value={fmtDT(res.fluxNetM)}
              sub={`après charges et annuités (durée ${dureeAns} ans)`}
              icon={TrendingUp}
              tone={res.fluxNetM >= 0 ? "success" : "danger"}
            />
            <Kpi
              label="Point de rentabilité"
              value={paybackText(payback)}
              sub={`fonds propres ${fmtDT(res.apport)} récupérés`}
              icon={Timer}
              tone={payback != null && payback <= 36 ? "success" : payback != null && payback <= 60 ? "warning" : "danger"}
            />
            <Kpi label="TRI estimé" value={fmtPct1(res.triPct)} sub="flux mensuels, dichotomie" icon={TrendingUp} tone={(res.triPct ?? -1) >= 10 ? "success" : (res.triPct ?? -1) >= 0 ? "warning" : "danger"} />
            <Kpi label="ROI 5 ans" value={res.roi5ansPct != null ? fmtPct1(res.roi5ansPct) : "—"} sub="cumul 60 mois ÷ apport" icon={Hourglass} tone={(res.roi5ansPct ?? -1) >= 0 ? "success" : "danger"} />
          </div>

          {/* Jauge de risque */}
          <Card>
            <CardContent className="space-y-2 p-4 sm:p-6">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Jauge de risque</p>
                <Badge
                  variant="outline"
                  className={cn(
                    "tabular-nums",
                    payback == null
                      ? "border-[#e07856]/50 bg-[#e07856]/10 text-[#b4552f] dark:text-[#e8a186]"
                      : payback <= 36
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                        : payback <= 60
                          ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                          : "border-[#e07856]/50 bg-[#e07856]/10 text-[#b4552f] dark:text-[#e8a186]",
                  )}
                >
                  payback {paybackText(payback)}
                </Badge>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                {/* Jauge : payback ≤ 36 mois = émeraude · ≤ 60 = ambre · sinon terracotta. */}
                <div
                  className={cn("h-full rounded-full transition-all", risk.bar)}
                  style={{
                    width:
                      payback == null
                        ? "100%"
                        : `${Math.max(6, Math.min(100, (payback / 84) * 100))}%`,
                  }}
                />
              </div>
              <p className={cn("text-xs font-medium", risk.tone)}>{risk.label}</p>
              {res.volumeEquilibre != null && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Volume d&apos;équilibre (est.) :{" "}
                  <strong className="tabular-nums">{fmtInt(res.volumeEquilibre)} L/j</strong> —{" "}
                  {litres >= res.volumeEquilibre
                    ? `marge de sécurité ${fmtInt(litres - res.volumeEquilibre)} L/j`
                    : `il manque ${fmtInt(res.volumeEquilibre - litres)} L/j pour équilibrer le flux net`}
                  .
                </p>
              )}
            </CardContent>
          </Card>

          {/* Compte de résultat simplifié */}
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-6">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Compte de résultat simplifié</p>
                <Badge variant="outline" className="text-[10px]">
                  est. · avant impôts
                </Badge>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="text-[11px]">Poste</TableHead>
                      <TableHead className="text-right text-[11px]">Mensuel</TableHead>
                      <TableHead className="text-right text-[11px]">Annuel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pnlRows.map(r => (
                      <TableRow key={r.label}>
                        <TableCell className={cn("text-xs", r.strong && "font-semibold", r.tone)}>
                          {r.label}
                        </TableCell>
                        <TableCell className={cn("text-right text-xs tabular-nums", r.strong && "font-semibold", r.tone)}>
                          {fmtDT(r.m)}
                        </TableCell>
                        <TableCell className={cn("text-right text-xs tabular-nums", r.strong && "font-semibold", r.tone)}>
                          {fmtDT(r.a)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Vue simplifiée : les annuités comprennent capital et intérêts (remboursement, pas
                seulement charge). Prix pompe estimé à {fmtDec(PRIX_LITRE_ESTIME, 1)} DT/L et marge
                services/food à 30 %.
              </p>
            </CardContent>
          </Card>

          {/* Graphique : cash-flow cumulé */}
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-6">
              <p className="text-sm font-semibold">Cash-flow cumulé (fonds propres)</p>
              <p className="text-xs text-muted-foreground">
                Départ = apport décaissé, puis flux nets mensuels — le palier au remboursement du
                crédit ({dureeAns} ans) est visible. Seuil 0 = point de rentabilité.
              </p>
              <div className="h-64 w-full sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={res.serie} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis
                      dataKey="mois"
                      type="number"
                      domain={[0, horizonAns * 12]}
                      ticks={Array.from({ length: horizonAns + 1 }, (_, i) => i * 12)}
                      tickFormatter={m => (m === 0 ? "Départ" : `An ${m / 12}`)}
                      tick={AXIS_STYLE.tick}
                      stroke={AXIS_STYLE.stroke}
                      tickLine={false}
                      dy={4}
                    />
                    <YAxis
                      tick={AXIS_STYLE.tick}
                      stroke={AXIS_STYLE.stroke}
                      tickLine={false}
                      width={84}
                      tickFormatter={v => `${fmtInt(Number(v) / 1000)} k`}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      formatter={v => [`${fmtDT(Number(v))}`, "Cumul"]
                      }
                      labelFormatter={m => {
                        const mois = Number(m)
                        return mois === 0 ? "Départ (apport)" : `Mois ${mois} · an ${Math.ceil(mois / 12)}`
                      }}
                    />
                    <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="2 2" />
                    <Line
                      type="monotone"
                      dataKey="cumul"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Scénarios comparés */}
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-6">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Scénarios comparés</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Prudent : volume ×0,80 · marge ×0,95 · charges ×1,05 — central : hypothèses
                    saisies — ambitieux : volume ×1,20 · marge ×1,05 · charges ×0,98.
                  </p>
                </div>
                <Button className="h-11 shrink-0 gap-1.5" onClick={generateScenarios}>
                  <Wand2 className="h-4 w-4" aria-hidden />
                  Générer
                </Button>
              </div>
              {!scenarios && (
                <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                  Cliquez sur « Générer » pour comparer les trois scénarios côte à côte à partir des
                  hypothèses actuelles.
                </p>
              )}
              {scenarios && (
                <div className="grid min-w-0 gap-3 md:grid-cols-3">
                  {scenarios.map(s => {
                    const t =
                      s.key === "prudent"
                        ? {
                            border: "border-l-[#e07856]",
                            tone: "text-[#b4552f] dark:text-[#e8a186]",
                          }
                        : s.key === "central"
                          ? { border: "border-l-amber-500", tone: "text-amber-700 dark:text-amber-400" }
                          : { border: "border-l-emerald-600", tone: "text-emerald-700 dark:text-emerald-400" }
                    const dFlux = central && s.key !== "central" ? s.result.fluxNetM - central.result.fluxNetM : null
                    const dPayback =
                      central && s.key !== "central" && s.result.paybackMois != null && central.result.paybackMois != null
                        ? s.result.paybackMois - central.result.paybackMois
                        : null
                    const dCumul = central && s.key !== "central" ? s.result.cumulFin - central.result.cumulFin : null
                    return (
                      <Card key={s.key} className={t.border}>
                        <CardContent className="space-y-2 p-4">
                          <p className={cn("text-sm font-semibold", t.tone)}>{s.label}</p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            {fmtInt(s.inputs.litres)} L/j · {fmtDec(s.inputs.margeLitre, 3)} DT/L ·{" "}
                            {fmtDT(s.inputs.chargesFixes)}/mois
                          </p>
                          <dl className="space-y-1 text-xs">
                            <ScenarioKpi label="Flux net/mois" value={fmtDT(s.result.fluxNetM)} delta={dFlux != null ? `(${dFlux >= 0 ? "+" : ""}${fmtInt(dFlux)})` : undefined} />
                            <ScenarioKpi label="Payback" value={paybackText(s.result.paybackMois)} delta={dPayback != null && Number.isFinite(dPayback) ? `(${dPayback > 0 ? "+" : ""}${dPayback} mois)` : undefined} />
                            <ScenarioKpi label="TRI" value={fmtPct1(s.result.triPct)} />
                            <ScenarioKpi label="Cumul fin d'horizon" value={fmtDT(s.result.cumulFin)} delta={dCumul != null ? `(${dCumul >= 0 ? "+" : ""}${fmtInt(dCumul)})` : undefined} />
                          </dl>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 w-full text-xs"
                            onClick={() => applyScenario(s)}
                          >
                            Appliquer ces hypothèses
                          </Button>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sauvegarde */}
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-6">
              <div className="flex min-w-0 flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor="radar-sim-label" className="text-xs font-medium">
                    Nom du scénario (optionnel)
                  </Label>
                  <Input
                    id="radar-sim-label"
                    value={labelInput}
                    onChange={e => setLabelInput(e.target.value)}
                    placeholder={defaultLabel}
                    className="h-9"
                    maxLength={80}
                  />
                </div>
                <Button className="h-11 shrink-0 gap-1.5" onClick={saveScenario} disabled={saving}>
                  <BookmarkPlus className="h-4 w-4" aria-hidden />
                  {saving ? "Enregistrement…" : "Enregistrer le scénario"}
                </Button>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Enregistrement dans vos calculs (connexion requise) — gouvernorat {currentGov?.name ?? "—"},{" "}
                {FORMAT_BY_ID[formatId].nom}, {fmtInt(litres)} L/j.
              </p>

              {/* Liste des scénarios sauvegardés */}
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <ListChecks className="h-3.5 w-3.5" aria-hidden />
                  Scénarios sauvegardés
                </p>
                {savedList == null && <Skeleton className="h-20 w-full" />}
                {savedList != null && savedList.length === 0 && (
                  <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                    Aucun scénario enregistré pour l&apos;instant.
                  </p>
                )}
                {savedList != null && savedList.length > 0 && (
                  <div className="max-h-96 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-background">
                        <TableRow>
                          <TableHead className="text-[11px]">Scénario</TableHead>
                          <TableHead className="hidden text-[11px] sm:table-cell">Gouvernorat</TableHead>
                          <TableHead className="hidden text-[11px] md:table-cell">Payback</TableHead>
                          <TableHead className="hidden text-[11px] md:table-cell">TRI</TableHead>
                          <TableHead className="text-right text-[11px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {savedList.map(s => (
                          <TableRow key={s.id}>
                            <TableCell className="max-w-[180px]">
                              <span className="block truncate text-xs font-medium">{s.label}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {FORMAT_BY_ID[(s.formatId as FormatId) in FORMAT_BY_ID ? (s.formatId as FormatId) : "classique"].nom} ·{" "}
                                {fmtDateFr(s.createdAt)}
                              </span>
                            </TableCell>
                            <TableCell className="hidden text-xs sm:table-cell">{s.gouvernorat}</TableCell>
                            <TableCell className="hidden text-xs tabular-nums md:table-cell">
                              {paybackText(s.result.paybackMois != null && s.result.paybackMois > 0 ? s.result.paybackMois : null)}
                            </TableCell>
                            <TableCell className="hidden text-xs tabular-nums md:table-cell">
                              {s.result.triPct != null && s.result.triPct > 0 ? `${fmtDec(s.result.triPct, 1)} %` : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="inline-flex gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-9 px-2.5 text-xs"
                                  onClick={() => loadScenario(s)}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                                  <span className="hidden sm:inline">Charger</span>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-9 gap-1 px-2.5 text-xs text-[#b4552f] hover:bg-[#e07856]/10 hover:text-[#b4552f] dark:text-[#e8a186]"
                                  onClick={() => setDeleteTarget(s)}
                                  aria-label={`Supprimer le scénario ${s.label}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                  <span className="hidden sm:inline">Supprimer</span>
                                </Button>
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ---- Confirmation de suppression ---- */}
      <AlertDialog open={deleteTarget != null} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce scénario ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deleteTarget?.label} » ({deleteTarget?.gouvernorat}) sera définitivement retiré de
              vos scénarios sauvegardés. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-[#e07856] text-white hover:bg-[#c9552e]"
              onClick={() => deleteTarget && deleteScenario(deleteTarget)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ============================== KPI local ============================== */

/** KPI compact (variante allégée du KpiCard — même rendu, props réduites). */
function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
}: {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  tone?: "default" | "success" | "warning" | "danger"
}) {
  const tones: Record<string, string> = {
    default: "bg-muted text-foreground",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    danger: "bg-[#e07856]/15 text-[#b4552f] dark:bg-[#e07856]/20 dark:text-[#e8a186]",
  }
  return (
    <Card className="min-w-0">
      <CardContent className="flex items-start gap-3 p-4">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 text-xl font-bold tabular-nums leading-none">{value}</p>
          {sub && (
            <p className="mt-1 line-clamp-2 break-words text-xs leading-snug text-muted-foreground">
              {sub}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
