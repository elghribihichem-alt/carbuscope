'use client'

// CarbuScope — T54-B3b — volet « Études de faisabilité » du module Opportunity
// Radar. Pour un gouvernorat donné (profil réel /api/radar/scoring + foncier
// détaillé /api/radar/indicators), le moteur pur src/lib/radar/faisabilite.ts
// note 4 axes 0-100 (marché 40 / concurrence 25 / foncier 20 / accessibilité-
// réglementaire 15) et rend un verdict FR (feu vert / orange / rouge).
// Contenus :
//   · CARTE « IMPLANTATION TYPE » — SVG stylisé DESSINÉ EN CODE (arbitrage
//     T54-A0 : PAS de 3D) : vue schématique du site (pistes à couvert,
//     boutique/kiosque/food store, entrée/sortie fléchées, stationnement,
//     voirie) qui VARIE selon le format recommandé n°1 (5 variantes
//     minimalistes émeraude/ambre/terracotta/zinc, libellés FR) + mini-carte
//     Tunisie (pattern SVG du drawer B2, reproduit léger — non exporté) ;
//   · CHECKLIST TERRAIN (le cœur opérationnel) : 14 points de contrôle réels
//     groupés, statut (À vérifier par défaut / Conforme / Point de vigilance /
//     Bloquant) + note libre, PERSISTÉS en sessionStorage (clé
//     carbuscope-faisabilite-<gov>, honnête : rien n'est écrit en base V1 —
//     schéma T54-A1 gelé) + bouton « Réinitialiser » avec confirmation ;
//   · EXPORT PDF template V1 (jsPDF, même socle que les rapports B2B
//     src/lib/report-pdf.ts : entête CarbuScope, date FR, tableaux autotable,
//     pied de page) — AUCUNE IA générative (V2 explicitement exclue) ;
//   · LIENS CROISÉS : « Simuler la rentabilité » (handoff nav.radarSim JSON,
//     pattern T54-B3a) et « Voir les formats ».

import { useEffect, useMemo, useState } from "react"
import type * as React from "react"
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileDown,
  FileSearch,
  LayoutGrid,
  ListChecks,
  Loader2,
  MapPin,
  RotateCcw,
  TriangleAlert,
} from "lucide-react"
import { toast } from "sonner"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store/app-store"
import {
  GOV_CENTERS,
  zoneBlancheRatioThreshold,
  type GovernoratScore,
  type RegionKey,
  type ScoringInputs,
} from "@/lib/radar/scoring"
import { recommendFormats, type FormatRecommendation } from "@/lib/radar/formats"
import {
  CHECKLIST_POINTS,
  CHECKLIST_STATUTS,
  CHECKLIST_STATUT_LABEL,
  checklistSynthese,
  checklistVigilances,
  computeFaisabilite,
  faisabiliteKey,
  formatPrincipal,
  type ChecklistStatut,
  type ChecklistState,
  type FaisaResult,
} from "@/lib/radar/faisabilite"
import {
  bulletList,
  createReportPdf,
  finish,
  kpiGrid,
  paragraph,
  pdfStamp,
  sectionTitle,
  table,
  type PdfFinishResult,
} from "@/lib/report-pdf"

/* ============================== Types locaux ============================== */

type ScoringResponse = {
  gouvernorats: GovernoratScore[]
  engine: ScoringInputs
  generatedAt: string
}

type IndicatorsResponse = {
  land: Array<{
    gouvernorat: string
    pricePerM2: number | null
    availability: number
    urbanPressure: number
  }>
}

const REGION_LABELS: Record<RegionKey, string> = {
  GRAND_TUNIS: "Grand Tunis",
  NORD: "Nord",
  CENTRE: "Centre",
  SUD: "Sud",
}

const fmt1 = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })
const fmtInt = (v: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number.isFinite(v) ? v : 0)

/* ============================== Ton / couleurs ============================== */

/** Jauge d'un axe : émeraude ≥ 70 · ambre 50-70 · terracotta < 50. */
const gaugeTone = (v: number) =>
  v >= 70
    ? { bar: "bg-emerald-500 dark:bg-emerald-400", text: "text-emerald-700 dark:text-emerald-400" }
    : v >= 50
      ? { bar: "bg-amber-500 dark:bg-amber-400", text: "text-amber-700 dark:text-amber-400" }
      : { bar: "bg-[#e07856]", text: "text-[#b4552f] dark:text-[#e8a186]" }

const VERDICT_STYLE: Record<FaisaResult["verdict"], { pill: string; icon: string; label: string }> = {
  FEU_VERT: {
    pill: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    icon: "text-emerald-600 dark:text-emerald-400",
    label: "Feu vert",
  },
  FEU_ORANGE: {
    pill: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    icon: "text-amber-600 dark:text-amber-400",
    label: "Feu orange",
  },
  FEU_ROUGE: {
    pill: "border-[#e8a186] bg-[#fbeee8] text-[#b4552f] dark:border-[#8a4a30] dark:bg-[#3a2118] dark:text-[#e8a186]",
    icon: "text-[#c25a34]",
    label: "Feu rouge",
  },
}

/* ============================== Carte « implantation type » (SVG stylisé) ============================== */

/**
 * Vue schématique du site (arbitrage T54-A0 : SVG stylisé, PAS de 3D).
 * 5 VARIANTES selon le format recommandé n°1 : classique (6-8 pistes + boutique),
 * compacte (2-4 pistes + kiosque), automatisée 24/30 (terminal paiement sans
 * surveillance), food store (magasin alimentaire), hub hybride (annexe services
 * mobilité). Libellés FR, palette émeraude/ambre/terracotta/zinc,
 * viewBox 200×260, responsive w-full. Accessible : role="img" + <title>.
 */
function SitePlanSvg({ formatId, formatNom }: { formatId: string; formatNom: string }) {
  // ---- Éléments communs : voirie + entrée/sortie fléchées ----
  const voirie = (
    <g>
      <rect x="12" y="232" width="176" height="24" rx="2" className="fill-zinc-200 dark:fill-zinc-800" />
      <line x1="16" y1="244" x2="184" y2="244" strokeDasharray="8 6" className="stroke-zinc-400 dark:stroke-zinc-500" strokeWidth="1.5" />
      <text x="16" y="228" fontSize="7" fontWeight="600" className="fill-zinc-600 dark:fill-zinc-300">
        Voirie principale
      </text>
    </g>
  )

  // Entrée (émeraude, flèche montante depuis la voirie) + sortie (ambre, descendante).
  const fleches = (
    <g>
      <line x1="42" y1="230" x2="42" y2="196" className="stroke-emerald-600 dark:stroke-emerald-400" strokeWidth="2.2" />
      <polygon points="36,198 48,198 42,186" className="fill-emerald-600 dark:fill-emerald-400" />
      <text x="18" y="220" fontSize="7" fontWeight="700" className="fill-emerald-700 dark:fill-emerald-400">
        Entrée
      </text>
      <line x1="158" y1="196" x2="158" y2="230" className="stroke-amber-600 dark:stroke-amber-400" strokeWidth="2.2" />
      <polygon points="152,228 164,228 158,240" className="fill-amber-600 dark:fill-amber-400" />
      <text x="146" y="220" fontSize="7" fontWeight="700" className="fill-amber-700 dark:fill-amber-400">
        Sortie
      </text>
    </g>
  )

  /** Îlot de pistes à couvert (toit émeraude + pompes + îlots zinc). */
  const ilote = (x: number, y: number, w: number, nbPompes: number, label: string) => (
    <g>
      <text x={x} y={y - 3} fontSize="7" fontWeight="600" className="fill-zinc-600 dark:fill-zinc-300">
        {label}
      </text>
      <rect x={x} y={y} width={w} height="10" rx="2" className="fill-emerald-600 dark:fill-emerald-500" />
      <rect x={x} y={y + 10} width={w} height="22" rx="1" className="fill-zinc-100 dark:fill-zinc-900" stroke="none" />
      {Array.from({ length: nbPompes }).map((_, i) => {
        const px = x + 8 + i * ((w - 16) / Math.max(1, nbPompes - 1))
        return (
          <g key={i}>
            <rect x={px - 2} y={y + 13} width="4" height="9" rx="0.8" className="fill-zinc-400 dark:fill-zinc-600" />
            <circle cx={px} cy={y + 26} r="1.6" className="fill-zinc-500 dark:fill-zinc-500" />
          </g>
        )
      })}
      {/* colonnes portiques */}
      {[x + 3, x + w - 5].map((cx, i) => (
        <rect key={i} x={cx} y={y + 10} width="2" height="26" className="fill-zinc-400 dark:fill-zinc-600" />
      ))}
    </g>
  )

  /** Bâtiment (boutique / kiosque / food store / annexe). */
  const batiment = (x: number, y: number, w: number, h: number, label: string, opts?: { porte?: boolean; rayons?: boolean; points?: boolean }) => (
    <g>
      <text x={x} y={y - 3} fontSize="7" fontWeight="600" className="fill-zinc-600 dark:fill-zinc-300">
        {label}
      </text>
      <rect x={x} y={y} width={w} height={h} rx="2" className="fill-zinc-300 dark:fill-zinc-700" stroke="currentColor" strokeOpacity="0.25" />
      {opts?.rayons && (
        <g className="stroke-zinc-500 dark:stroke-zinc-400" strokeWidth="0.8" strokeOpacity="0.6">
          <line x1={x + 5} y1={y + h * 0.35} x2={x + w - 5} y2={y + h * 0.35} />
          <line x1={x + 5} y1={y + h * 0.6} x2={x + w - 5} y2={y + h * 0.6} />
        </g>
      )}
      {opts?.points && (
        <g>
          {[0.3, 0.5, 0.7].map((t, i) => (
            <circle key={i} cx={x + w * t} cy={y + h * 0.5} r="2.2" className="fill-amber-500 dark:fill-amber-400" fillOpacity="0.85" />
          ))}
        </g>
      )}
      {opts?.porte !== false && <rect x={x + w / 2 - 3} y={y + h - 7} width="6" height="7" rx="0.8" className="fill-zinc-600 dark:fill-zinc-400" />}
    </g>
  )

  /** Rangée de stationnement (créneaux zinc). */
  const stationnement = (x: number, y: number, nb: number) => {
    const w = 13
    return (
      <g>
        <text x={x} y={y - 3} fontSize="7" fontWeight="600" className="fill-zinc-600 dark:fill-zinc-300">
          Stationnement ({nb} places)
        </text>
        {Array.from({ length: nb }).map((_, i) => (
          <rect
            key={i}
            x={x + i * (w + 1)}
            y={y}
            width={w}
            height="20"
            rx="1"
            className="fill-zinc-100 dark:fill-zinc-800"
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeDasharray="2 2"
          />
        ))}
      </g>
    )
  }

  /** Échelle indicative (barre 0-40 m). */
  const echelle = (
    <g>
      <line x1="140" y1="24" x2="188" y2="24" className="stroke-zinc-500 dark:stroke-zinc-400" strokeWidth="1" />
      <line x1="140" y1="21" x2="140" y2="27" className="stroke-zinc-500 dark:stroke-zinc-400" strokeWidth="1" />
      <line x1="164" y1="22" x2="164" y2="26" className="stroke-zinc-500 dark:stroke-zinc-400" strokeWidth="1" />
      <line x1="188" y1="21" x2="188" y2="27" className="stroke-zinc-500 dark:stroke-zinc-400" strokeWidth="1" />
      <text x="140" y="19" fontSize="6" className="fill-zinc-500 dark:fill-zinc-400">
        0 - 40 m (est.)
      </text>
    </g>
  )

  // ---- Variante par format ----
  let contenu: React.ReactNode
  let varianteLabel: string
  switch (formatId) {
    case "compacte":
      varianteLabel = "Station compacte — 2 à 4 pistes, kiosque"
      contenu = (
        <g>
          {ilote(32, 48, 74, 4, "Pistes à couvert (2-4)")}
          {batiment(126, 48, 28, 24, "Kiosque")}
          {stationnement(32, 158, 3)}
          {batiment(126, 118, 28, 16, "Local technique", { porte: false })}
        </g>
      )
      break
    case "automatisee":
      varianteLabel = "Station automatisée 24/30 — paiement libre-service"
      contenu = (
        <g>
          {ilote(32, 48, 74, 4, "Pistes à couvert (2-4)")}
          {batiment(126, 48, 30, 22, "Terminal paiement", { porte: false })}
          <rect x="128" y="70" width="26" height="9" rx="1.5" className="fill-[#e07856]" />
          <text x="131" y="77" fontSize="6.5" fontWeight="700" className="fill-white dark:fill-zinc-950">
            24 h/24
          </text>
          {batiment(126, 118, 30, 16, "Local technique", { porte: false })}
          {stationnement(32, 158, 3)}
          {/* clôture (surveillance réduite) */}
          <rect x="20" y="40" width="160" height="112" rx="3" fill="none" className="stroke-[#c25a34]" strokeDasharray="4 4" strokeOpacity="0.55" />
        </g>
      )
      break
    case "food-store":
      varianteLabel = "Station + food store — magasin alimentaire"
      contenu = (
        <g>
          {ilote(22, 46, 92, 6, "Pistes à couvert (6)")}
          {batiment(126, 32, 50, 62, "Food store", { rayons: true })}
          {stationnement(22, 158, 8)}
        </g>
      )
      break
    case "hub-hybride":
      varianteLabel = "Hub mobilité hybride — carburant + services"
      contenu = (
        <g>
          {ilote(22, 46, 84, 5, "Pistes à couvert (4-5)")}
          {batiment(118, 32, 58, 42, "Services mobilité", { points: true })}
          {stationnement(22, 158, 5)}
          {batiment(126, 118, 40, 16, "Atelier express", { porte: false })}
        </g>
      )
      break
    case "classique":
    default:
      varianteLabel = "Station classique — plein service 6-8 pistes"
      contenu = (
        <g>
          {ilote(24, 46, 118, 8, "Pistes à couvert (6-8)")}
          {batiment(156, 44, 30, 36, "Boutique")}
          {stationnement(24, 158, 6)}
          {batiment(130, 118, 28, 16, "Lavage", { porte: false })}
        </g>
      )
  }

  return (
    <svg
      viewBox="0 0 200 260"
      className="h-auto w-full max-w-[300px]"
      role="img"
      aria-label={`Plan d'implantation type : ${varianteLabel} — vue schématique du site (pistes à couvert, bâtiments, entrée et sortie fléchées, stationnement, voirie).`}
    >
      <title>{`Plan d'implantation type — ${formatNom}`}</title>
      {/* Emprise du site */}
      <rect x="12" y="14" width="176" height="212" rx="6" className="fill-zinc-50 dark:fill-zinc-900/70" stroke="currentColor" strokeOpacity="0.25" />
      <text x="20" y="28" fontSize="8" fontWeight="700" className="fill-zinc-700 dark:fill-zinc-200">
        {varianteLabel}
      </text>
      {echelle}
      {contenu}
      {fleches}
      {voirie}
    </svg>
  )
}

/* ============================== Mini-carte Tunisie (pattern B2, reproduit léger) ============================== */

const MAP_W = 140
const MAP_H = 264
const projX = (lng: number) => ((lng - 7.2) / 4.7) * MAP_W
const projY = (lat: number) => ((37.4 - lat) / 7.4) * MAP_H

const TUNISIA_PATH =
  "46.2,16.1 74.5,6.1 86.4,9.3 92.3,21.4 102.2,13.6 113.2,17.8 107.2,33.9 101.3,44.6 105.7,57.1 114.7,67.1 110.8,83.8 92.3,114.2 86.4,135.6 101.3,138.4 119.1,142.7 131.1,151.6 128.1,201.6 120.6,244.4 96.8,255.8 69.1,255.8 40.2,224.8 23.8,178.4 28.3,123.1 37.2,76.7 31.3,49.9 37.2,26.8"
const DJERBA_PATH = "104.9,126.3 110.8,128.4 111.1,134.9 106.6,133.4 104.3,128.8"
const KERKENNAH_PATH = "112.6,92.0 117.7,95.6 113.2,97.0"

function MiniTunisiaMap({ gouvernorat, verdict }: { gouvernorat: string; verdict: FaisaResult["verdict"] }) {
  const center = GOV_CENTERS[gouvernorat]
  const cx = center ? projX(center[0]) : MAP_W / 2
  const cy = center ? projY(center[1]) : MAP_H / 2
  const dot =
    verdict === "FEU_VERT"
      ? "fill-emerald-600 dark:fill-emerald-400"
      : verdict === "FEU_ORANGE"
        ? "fill-amber-600 dark:fill-amber-400"
        : "fill-[#c25a34]"
  return (
    <svg
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      className="h-auto w-full max-w-[120px] text-emerald-700 dark:text-emerald-400"
      role="img"
      aria-label={`Localisation de ${gouvernorat} en Tunisie (carte décorative)`}
    >
      <title>{`Localisation de ${gouvernorat} en Tunisie`}</title>
      <polygon points={TUNISIA_PATH} fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      <polygon points={DJERBA_PATH} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeWidth={1} />
      <polygon points={KERKENNAH_PATH} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeWidth={1} />
      {center && (
        <g>
          <circle cx={cx} cy={cy} r={9} fill="currentColor" fillOpacity={0.18} />
          <circle cx={cx} cy={cy} r={4} className={dot} />
          <text x={cx + 11} y={cy + 3.5} fontSize={11} fontWeight={700} fill="currentColor">
            {gouvernorat}
          </text>
        </g>
      )}
    </svg>
  )
}

/* ============================== Ligne d'axe ============================== */

function AxisRow({
  label,
  note,
  poids,
  detail,
  est,
}: {
  label: string
  note: number
  poids: number
  detail: string
  est: boolean
}) {
  const g = gaugeTone(note)
  return (
    <div className="min-w-0 space-y-1.5 rounded-lg border bg-muted/20 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold">{label}</p>
        {est && (
          <Badge variant="outline" className="text-[9px] text-muted-foreground">
            est.
          </Badge>
        )}
        <Badge variant="secondary" className="text-[10px] tabular-nums">
          poids {poids} %
        </Badge>
        <span className={cn("shrink-0 text-sm font-bold tabular-nums", g.text)}>
          {fmt1(note)}
          <span className="text-[10px] font-normal text-muted-foreground">/100</span>
        </span>
      </div>
      <div className="h-1.5 min-w-0 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full", g.bar)} style={{ width: `${note}%` }} />
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{detail}</p>
    </div>
  )
}

/* ============================== Volet ============================== */

export function RadarFaisabilite() {
  const setNav = useAppStore(s => s.setNav)

  const [data, setData] = useState<ScoringResponse | null>(null)
  const [land, setLand] = useState<IndicatorsResponse["land"] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selected, setSelected] = useState<string>("")
  const [checklist, setChecklist] = useState<ChecklistState>({})
  const [resetOpen, setResetOpen] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const p of CHECKLIST_POINTS) initial[p.groupe] = true
    return initial
  })

  // ---- Chargement profil scoring + indicateurs foncier (abortable) ----
  useEffect(() => {
    const ctrl = new AbortController()
    Promise.all([
      fetch("/api/radar/scoring", { signal: ctrl.signal }).then(async r => {
        if (!r.ok) throw new Error(`/api/radar/scoring → ${r.status}`)
        return (await r.json()) as ScoringResponse
      }),
      fetch("/api/radar/indicators", { signal: ctrl.signal }).then(async r => {
        if (!r.ok) throw new Error(`/api/radar/indicators → ${r.status}`)
        return (await r.json()) as IndicatorsResponse
      }),
    ])
      .then(([scoring, indicators]) => {
        setData(scoring)
        setLand(indicators.land)
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [reloadKey])

  const govs = data?.gouvernorats ?? []
  const current = useMemo(
    () => govs.find(g => g.name === selected) ?? govs[0] ?? null,
    [govs, selected],
  )

  // ---- Checklist : lecture sessionStorage à chaque changement de gouvernorat
  //      (clé par gouvernorat — rien n'est écrit en base, V1 honnête). ----
  useEffect(() => {
    if (!current) return
    try {
      const raw = sessionStorage.getItem(faisabiliteKey(current.name))
      const parsed = raw ? (JSON.parse(raw) as ChecklistState) : {}
      setChecklist(parsed && typeof parsed === "object" ? parsed : {})
    } catch {
      setChecklist({})
    }
  }, [current])

  const zoneThreshold = useMemo(() => (data ? zoneBlancheRatioThreshold(data.engine) : 0), [data])

  const recos = useMemo(
    () =>
      current
        ? recommendFormats(
            {
              name: current.name,
              parc: current.parc,
              pouvoir: current.pouvoir,
              trafic: current.trafic,
              concurrence: current.concurrence,
              foncier: current.foncier,
              vehicles: current.vehicles,
              stations: current.stations,
              score: current.score,
              rank: current.rank,
            },
            zoneThreshold,
          )
        : [],
    [current, zoneThreshold],
  )

  const result = useMemo(() => {
    if (!current) return null
    const ratio = current.stations > 0 ? current.vehicles / current.stations : 0
    const zoneBlanche = zoneThreshold > 0 && ratio > zoneThreshold
    const landRow = land?.find(l => l.gouvernorat === current.name) ?? null
    return computeFaisabilite({
      profil: {
        gouvernorat: current.name,
        parc: current.parc,
        pouvoir: current.pouvoir,
        trafic: current.trafic,
        concurrence: current.concurrence,
        foncier: current.foncier,
        vehicles: current.vehicles,
        stations: current.stations,
        population: current.population,
        score: current.score,
        rank: current.rank,
      },
      land: landRow
        ? {
            pricePerM2: landRow.pricePerM2,
            availability: landRow.availability,
            urbanPressure: landRow.urbanPressure,
          }
        : null,
      zoneBlanche,
    })
  }, [current, land, zoneThreshold])

  const format1 = formatPrincipal(recos)
  const synthese = checklistSynthese(checklist)

  /** Écrit l'état d'un point (sessionStorage + état local). */
  const majPoint = (pointId: string, patch: Partial<{ statut: ChecklistStatut; note: string }>) => {
    if (!current) return
    setChecklist(prev => {
      const entry = prev[pointId] ?? { statut: "A_VERIFIER" as ChecklistStatut, note: "" }
      const next: ChecklistState = {
        ...prev,
        [pointId]: { ...entry, ...patch },
      }
      try {
        sessionStorage.setItem(faisabiliteKey(current.name), JSON.stringify(next))
      } catch {
        // sessionStorage indisponible (mode privé strict) : l'état reste local.
      }
      return next
    })
  }

  /** Réinitialisation confirmée : efface la clé + l'état local. */
  const reinitialiser = () => {
    if (!current) return
    try {
      sessionStorage.removeItem(faisabiliteKey(current.name))
    } catch {
      /* ignoré */
    }
    setChecklist({})
    setResetOpen(false)
    toast.success("Checklist réinitialisée", {
      description: `Les 14 points de ${current.name} repassent à « À vérifier ».`,
    })
  }

  /** Handoff vers Simulations (pattern T54-B3a) : JSON { gouvernorat, format }. */
  const simuler = () => {
    if (!current || !format1) return
    setNav("radarSim", JSON.stringify({ gouvernorat: current.name, format: format1.format.id }))
    setNav("radar", "simulations")
  }

  /* ---- Export PDF (template V1, socle report-pdf.ts — pattern reports-pdf) ---- */
  const exporterPdf = () => {
    if (!current || !result || !format1) return
    setPdfBusy(true)
    // Génération immédiate (jsPDF est synchrone) — le busy state pilote le bouton.
    try {
      const pdf = createReportPdf({
        title: `Étude de faisabilité — ${current.name}`,
        subtitle: `Opportunity Radar · ${REGION_LABELS[current.region]} · score ${fmt1(result.score)}/100 — ${result.verdictLabel}`,
        metaLines: [
          `Format recommandé n°1 : ${format1.format.nom} (adéquation ${fmt1(format1.adequation)}/100)`,
          `Profil réel : ${fmtInt(current.vehicles)} véhicules · ${fmtInt(current.stations)} stations en service · rang ${current.rank}/24`,
          `Implantation type : ${format1.format.pistes} · ${num(format1.format.surfaceMin)} à ${num(format1.format.surfaceMax)} m² (est.)`,
        ],
        classification: "Hypothèses estimatives",
      })

      sectionTitle(pdf, "Verdict de l'étude")
      paragraph(pdf, `${result.verdictLabel} — score global ${fmt1(result.score)}/100 (pondération 40 / 25 / 20 / 15).`, { bold: true })
      paragraph(pdf, result.verdictDetail, { muted: true, size: 9 })
      kpiGrid(
        pdf,
        result.axes.map(a => ({
          label: a.label,
          value: `${fmt1(a.note)}/100`,
          sub: `poids ${a.poids} %${a.est ? " · estimation V1" : ""}`,
        })),
      )

      sectionTitle(pdf, "Détail des 4 axes")
      table(pdf, {
        head: ["Axe", "Note", "Poids", "Détail (données réelles / est.)"],
        body: result.axes.map(a => [a.label, `${fmt1(a.note)}/100`, `${a.poids} %`, a.detail]),
        colStyles: { 1: { halign: "center" }, 2: { halign: "center" } },
      })

      sectionTitle(pdf, "Formats recommandés")
      table(pdf, {
        head: ["N°", "Format", "Adéquation", "Pistes", "Surface", "CAPEX", "Délai"],
        body: recos.map(r => [
          String(r.rank),
          r.format.nom,
          `${fmt1(r.adequation)}/100`,
          r.format.pistes,
          `${num(r.format.surfaceMin)} - ${num(r.format.surfaceMax)} m²`,
          `${(r.format.capexMin / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} - ${(r.format.capexMax / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} MDT`,
          `${r.format.delaiMin} - ${r.format.delaiMax} mois`,
        ]),
        colStyles: { 0: { halign: "center" }, 2: { halign: "center" } },
      })

      sectionTitle(pdf, "Checklist terrain (14 points)")
      table(pdf, {
        head: ["Groupe", "Point de contrôle", "Statut", "Note"],
        body: CHECKLIST_POINTS.map(p => {
          const e = checklist[p.id]
          return [
            p.groupe,
            p.label,
            e ? CHECKLIST_STATUT_LABEL[e.statut] : CHECKLIST_STATUT_LABEL.A_VERIFIER,
            e?.note?.trim() ? e.note.trim().slice(0, 120) : "-",
          ]
        }),
        fontSize: 7.5,
      })

      const vigilances = checklistVigilances(checklist)
      if (vigilances.length > 0) {
        sectionTitle(pdf, "Points de vigilance déclarés")
        bulletList(pdf, vigilances)
      } else {
        sectionTitle(pdf, "Points de vigilance déclarés")
        paragraph(pdf, "Aucun point en vigilance ou bloquant — contrôles restants à « À vérifier » ou conformes.", { muted: true, size: 9 })
      }

      paragraph(
        pdf,
        "Généré depuis CarbuScope — hypothèses estimatives : pouvoir d'achat, foncier et accessibilité sont des estimations V1 à valider sur site (checklist terrain).",
        { muted: true, size: 8 },
      )

      const res: PdfFinishResult = finish(
        pdf,
        `etude-faisabilite-${faisabiliteKey(current.name).replace("carbuscope-faisabilite-", "")}-${pdfStamp()}.pdf`,
      )
      toast.success(`Étude exportée (${res.filename})`, {
        description: `${res.sizeKb.toLocaleString("fr-FR")} Ko — axes, formats, checklist et verdict composés en direct.`,
      })
    } catch {
      toast.error("Export PDF impossible", {
        description: "L'étude n'a pas pu être composée — réessayez.",
      })
    } finally {
      setPdfBusy(false)
    }
  }

  /* ---- États de chargement / erreur ---- */
  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#b4552f]">
            <TriangleAlert className="h-4 w-4" aria-hidden />
            Étude indisponible
          </p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" className="h-11" onClick={() => setReloadKey(k => k + 1)}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!data || !current || !result || !format1) {
    return (
      <div className="min-w-0 space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 w-full lg:col-span-2" />
          <Skeleton className="h-72 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const v = VERDICT_STYLE[result.verdict]
  const groups = [...new Set(CHECKLIST_POINTS.map(p => p.groupe))]

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- Sélecteur gouvernorat + actions ---- */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-1.5 lg:max-w-sm lg:flex-1">
            <label htmlFor="radar-faisa-gouv" className="text-xs font-medium text-muted-foreground">
              Gouvernorat du site à étudier
            </label>
            <Select value={current.name} onValueChange={val => setSelected(val)}>
              <SelectTrigger id="radar-faisa-gouv" className="h-11 w-full" aria-label="Gouvernorat">
                <SelectValue placeholder="Choisir un gouvernorat" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {govs.map(g => (
                  <SelectItem key={g.name} value={g.name}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate">{g.name}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        n°{g.rank} · {fmt1(g.score)}/100
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11 gap-1.5" onClick={() => setNav("radar", "formats")}>
              <LayoutGrid className="h-4 w-4" aria-hidden />
              Voir les formats
            </Button>
            <Button className="h-11 gap-1.5" onClick={exporterPdf} disabled={pdfBusy}>
              {pdfBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <FileDown className="h-4 w-4" aria-hidden />
              )}
              Exporter l&apos;étude (PDF)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---- Synthèse : verdict + 4 axes ---- */}
      <Card className="border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 to-amber-50/40 dark:border-emerald-900/50 dark:from-emerald-950/20 dark:to-amber-950/15">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <FileSearch className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <h2 className="text-sm font-bold">Étude de faisabilité — {current.name}</h2>
            <Badge variant="secondary" className="text-[11px]">
              {REGION_LABELS[current.region]}
            </Badge>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold",
                v.pill,
              )}
            >
              <span className={cn("h-2 w-2 rounded-full bg-current", v.icon)} aria-hidden />
              {result.verdictLabel}
            </span>
            <span className="ml-auto text-xs font-bold tabular-nums">
              {fmt1(result.score)}
              <span className="text-[10px] font-normal text-muted-foreground">/100 pondéré 40/25/20/15</span>
            </span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{result.verdictDetail}</p>
          <div className="grid min-w-0 gap-2.5 md:grid-cols-2">
            {result.axes.map(a => (
              <AxisRow key={a.id} label={a.label} note={a.note} poids={a.poids} detail={a.detail} est={a.est} />
            ))}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Axes dérivés du moteur de scoring (critères 0-100) et de l&apos;indicateur foncier (badge « est. »).
            Le verdict est indicatif : la checklist terrain et la simulation de rentabilité affinent la décision.
          </p>
        </CardContent>
      </Card>

      {/* ---- Implantation type (SVG variantes) + localisation ---- */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardContent className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <h3 className="text-sm font-bold">Implantation type — vue schématique</h3>
              <Badge variant="secondary" className="text-[11px]">
                Format n°1 : {format1.format.nom}
              </Badge>
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                adéquation {fmt1(format1.adequation)}/100
              </Badge>
            </div>
            <div className="flex min-w-0 justify-center rounded-xl border bg-muted/20 p-3">
              <SitePlanSvg formatId={format1.format.id} formatNom={format1.format.nom} />
            </div>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                {format1.format.pistes}
              </Badge>
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {num(format1.format.surfaceMin)} – {num(format1.format.surfaceMax)} m²
              </Badge>
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {(format1.format.capexMin / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} –{" "}
                {(format1.format.capexMax / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} MDT
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {format1.format.delaiMin} – {format1.format.delaiMax} mois
              </Badge>
              {format1.justifications.slice(0, 2).map(j => (
                <Badge key={j} variant="secondary" className="max-w-full truncate text-[10px]">
                  {j}
                </Badge>
              ))}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Plan indicatif (SVG stylisé — pas de 3D, arbitrage T54-A0) variant selon le format recommandé
              n°1 : dispositif à adapter au plan cadastral et au cahier des charges technique de l&apos;enseigne.
            </p>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="flex min-w-0 flex-col gap-3 p-4 sm:p-6">
            <h3 className="text-sm font-bold">Localisation</h3>
            <div className="flex justify-center rounded-xl border bg-muted/20 p-3">
              <MiniTunisiaMap gouvernorat={current.name} verdict={result.verdict} />
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Rang national</dt>
                <dd className="font-semibold tabular-nums">{current.rank}/24</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Score opportunité</dt>
                <dd className="font-semibold tabular-nums">{fmt1(current.score)}/100</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Véhicules</dt>
                <dd className="font-semibold tabular-nums">{num(current.vehicles)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Stations en service</dt>
                <dd className="font-semibold tabular-nums">{num(current.stations)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Population</dt>
                <dd className="font-semibold tabular-nums">{num(current.population)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* ---- Encart croisé : simulation de rentabilité ---- */}
      <Card className="border-emerald-300/70 bg-emerald-50/40 dark:border-emerald-800/60 dark:bg-emerald-950/20">
        <CardContent className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <ArrowRight className="h-4 w-4 text-primary" aria-hidden />
              Simuler la rentabilité de ce site
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Transmettez {current.name} et le format {format1.format.nom} au calculateur — entrées
              pré-remplies (CAPEX, charges, volume suggéré est.).
            </p>
          </div>
          <Button className="h-11 shrink-0 gap-1.5" onClick={simuler}>
            Simuler la rentabilité
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </CardContent>
      </Card>

      {/* ---- Checklist terrain ---- */}
      <Card className="min-w-0">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ListChecks className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <h3 className="text-sm font-bold">Checklist terrain — {current.name}</h3>
            <Badge variant="secondary" className="text-[11px] tabular-nums">
              {synthese.total - synthese.restants}/{synthese.total} contrôlés
            </Badge>
            {synthese.conformes > 0 && (
              <Badge
                variant="outline"
                className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 tabular-nums dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
              >
                {synthese.conformes} conformes
              </Badge>
            )}
            {synthese.vigilances > 0 && (
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-50 text-[10px] text-amber-700 tabular-nums dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
              >
                {synthese.vigilances} vigilances
              </Badge>
            )}
            {synthese.bloquants > 0 && (
              <Badge
                variant="outline"
                className="border-[#e8a186] bg-[#fbeee8] text-[10px] text-[#b4552f] tabular-nums dark:border-[#8a4a30] dark:bg-[#3a2118] dark:text-[#e8a186]"
              >
                {synthese.bloquants} bloquants
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-9 gap-1.5 text-[#b4552f] dark:text-[#e8a186]"
              onClick={() => setResetOpen(true)}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Réinitialiser
            </Button>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Progression enregistrée dans votre session de navigation (sessionStorage, clé par gouvernorat) —
            aucune écriture en base V1 : le contenu de référence reste celui du moteur.
          </p>

          {/* Groupes pliables */}
          <div className="min-w-0 space-y-3">
            {groups.map(groupe => {
              const points = CHECKLIST_POINTS.filter(p => p.groupe === groupe)
              return (
                <Collapsible
                  key={groupe}
                  open={openGroups[groupe] ?? false}
                  onOpenChange={o => setOpenGroups(prev => ({ ...prev, [groupe]: o }))}
                  className="min-w-0 rounded-lg border"
                >
                  <CollapsibleTrigger className="flex min-w-0 w-full items-center justify-between gap-2 p-3 text-left hover:bg-muted/40">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="text-xs font-bold">{groupe}</span>
                      <Badge variant="secondary" className="text-[10px] tabular-nums">
                        {points.length} points
                      </Badge>
                    </span>
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", openGroups[groupe] && "rotate-180")}
                      aria-hidden
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="min-w-0 space-y-2 border-t p-3">
                    {points.map(p => {
                      const entry = checklist[p.id]
                      const statut = entry?.statut ?? "A_VERIFIER"
                      return (
                        <li key={p.id} className="min-w-0 list-none space-y-1.5 rounded-md bg-muted/20 p-2.5">
                          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium leading-snug">{p.label}</p>
                              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{p.aide}</p>
                            </div>
                            <Select
                              value={statut}
                              onValueChange={val => majPoint(p.id, { statut: val as ChecklistStatut })}
                            >
                              <SelectTrigger
                                className="h-11 w-full shrink-0 text-xs sm:w-44"
                                aria-label={`Statut du point « ${p.label} »`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CHECKLIST_STATUTS.map(s => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Input
                            value={entry?.note ?? ""}
                            onChange={e => majPoint(p.id, { note: e.target.value })}
                            placeholder="Note libre (contact, cotes, engagement…)"
                            className="h-9 text-xs"
                            aria-label={`Note libre — ${p.label}`}
                          />
                        </li>
                      )
                    })}
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ---- Confirmation de réinitialisation ---- */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Réinitialiser la checklist de {current.name} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les statuts et notes des 14 points repasseront à « À vérifier ». Cette action efface la
              progression locale de votre session (elle ne touche aucune donnée partagée).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-[#c25a34] text-white hover:bg-[#a84a29] dark:bg-[#8a4a30] dark:text-white dark:hover:bg-[#7a4028]"
              onClick={reinitialiser}
            >
              Réinitialiser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
