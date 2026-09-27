'use client'

// Shadow Market (T44-e) — onglet « 🗓️ Rapport Personnalisé ».
// Assistant en 3 étapes (Période → Périmètre → Indicateurs), assemblage
// client-side depuis /api/shadow/overview + /api/shadow/map (lentille
// gouvernorat / enseigne), modèles sauvegardés dans localStorage
// (clé « carbuscope-shadow-report-models », rechargeables en 1 clic).

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  BookMarked, Building2, CalendarRange, Check, ChevronLeft, ChevronRight, Download, FileDown, Loader2,
  MapPin, Save, Sparkles, Trash2, Wand2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { ShadowMapResponse, ShadowLevel } from "@/lib/types"
import { formatTnd, levelFromLoss, monthLabelFr, dateFr } from "../shadow-shared"
import type { ShadowReportsCtx } from "./shadow-reports"
import { ReportPaper, type PaperKpi, type PaperGov, type PaperThreat, type PaperTypo, type PaperTrendPoint } from "./report-paper"
import { brandRecommendations, downloadTableCsv, govLossesForBrandStations, topGov } from "./report-utils"
import { downloadCustomShadowPdf } from "./shadow-pdf"

// ---------------------------------------------------------------------------
// Types locaux
// ---------------------------------------------------------------------------

type IndicatorKey =
  | "activePoints" | "estLoss" | "stationsThreatened" | "typologies"
  | "topThreats" | "gouvernorats" | "trend12" | "recommendations"

type ScopeType = "national" | "brand" | "gouv"

type ReportModel = {
  id: string
  name: string
  from: string
  to: string
  scopeType: ScopeType
  brandSlug: string
  gouvernorat: string
  indicators: IndicatorKey[]
  savedAt: string
}

type GeneratedReport = {
  docSubtitle: string
  generatedAt: string
  synthesis: string[]
  kpis: PaperKpi[]
  threats: PaperThreat[] | null
  gov: PaperGov[] | null
  trend: PaperTrendPoint[] | null
  typologies: PaperTypo[] | null
  recommendations: string[] | null
  csvMeta: [string, string | number][]
  csvThreats: (string | number | null)[][]
  csvGov: (string | number | null)[][]
}

const MODELS_KEY = "carbuscope-shadow-report-models"

const INDICATORS: { key: IndicatorKey; label: string; desc: string }[] = [
  { key: "activePoints", label: "Points actifs", desc: "vendeurs clandestins recensés" },
  { key: "estLoss", label: "Perte estimée", desc: "marge perdue (DT/mois)" },
  { key: "stationsThreatened", label: "Stations menacées", desc: "cannibalisation mesurable" },
  { key: "typologies", label: "Typologies", desc: "répartition bidons / kiosques…" },
  { key: "topThreats", label: "Top menaces", desc: "stations les plus touchées" },
  { key: "gouvernorats", label: "Gouvernorats", desc: "pertes par région" },
  { key: "trend12", label: "Tendance 12 mois", desc: "points actifs & perte" },
  { key: "recommendations", label: "Recommandations", desc: "actions proposées" },
]

const DEFAULT_INDICATORS: IndicatorKey[] = ["activePoints", "estLoss", "stationsThreatened", "topThreats", "recommendations"]

const STEPS = [
  { n: 1, label: "Période", icon: CalendarRange },
  { n: 2, label: "Périmètre", icon: MapPin },
  { n: 3, label: "Indicateurs", icon: Wand2 },
]

const monthBounds = (month: string): [string, string] => {
  const [y, m] = month.split("-").map(Number)
  const last = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, "0")
  return [`${month}-01`, `${month}-${String(last).padStart(2, "0")}`]
}

const todayStr = () => new Date().toISOString().slice(0, 10)
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`

// ---------------------------------------------------------------------------
// Onglet
// ---------------------------------------------------------------------------

export function CustomReportTab({ ctx }: { ctx: ShadowReportsCtx }) {
  const { reports, overview, scopeLabel } = ctx

  // Étape courante + champs du constructeur
  const [step, setStep] = useState(1)
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayStr())
  const [preset, setPreset] = useState("custom")
  const [scopeType, setScopeType] = useState<ScopeType>("national")
  const [brandSlug, setBrandSlug] = useState(reports.brands[0]?.brandSlug ?? "")
  const [gouvernorat, setGouvernorat] = useState(overview.govLosses[0]?.gouvernorat ?? "")
  const [indicators, setIndicators] = useState<IndicatorKey[]>(DEFAULT_INDICATORS)

  // Génération + modèles
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<GeneratedReport | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [mapCache, setMapCache] = useState<ShadowMapResponse | null>(null)
  const [models, setModels] = useState<ReportModel[]>([])
  const [modelName, setModelName] = useState("")

  // PDF réel — uniquement les blocs cochés sont inclus (generated.* null si absent).
  const downloadPdf = () => {
    if (!generated) return
    setPdfBusy(true)
    Promise.resolve()
      .then(() =>
        downloadCustomShadowPdf({
          subtitle: generated.docSubtitle,
          synthesis: generated.synthesis,
          kpis: generated.kpis,
          threats: generated.threats,
          gov: generated.gov,
          typologies: generated.typologies,
          recommendations: generated.recommendations,
          from,
          to,
        }),
      )
      .then((res) => {
        toast.success(`PDF généré (${res.filename})`, {
          description: `${res.sizeKb.toLocaleString("fr-FR")} Ko — rapport personnalisé (${indicators.length} indicateurs inclus, seuls les blocs cochés figurent au document).`,
        })
      })
      .catch(() => {
        toast.error("Génération PDF impossible", { description: "Le rapport personnalisé n'a pas pu être exporté en PDF. Réessayez." })
      })
      .finally(() => setPdfBusy(false))
  }

  // Modèles sauvegardés (lecture différée — setState asynchrone, hors règle).
  useEffect(() => {
    let alive = true
    Promise.resolve()
      .then(() => {
        if (!alive) return
        try {
          const raw = localStorage.getItem(MODELS_KEY)
          const parsed = raw ? (JSON.parse(raw) as ReportModel[]) : []
          if (Array.isArray(parsed)) setModels(parsed.filter(m => m && m.id && m.from && m.to))
        } catch {
          setModels([])
        }
      })
    return () => {
      alive = false
    }
  }, [])

  const persistModels = (next: ReportModel[]) => {
    setModels(next)
    try {
      localStorage.setItem(MODELS_KEY, JSON.stringify(next))
    } catch {
      toast.error("Sauvegarde impossible", { description: "Le stockage local est indisponible (mode privé ?)." })
    }
  }

  const periodValid = from <= to
  const scopeValid =
    scopeType !== "brand" || !!brandSlug
  const gouvValid = scopeType !== "gouv" || !!gouvernorat
  const indicatorsValid = indicators.length > 0
  const canGenerate = periodValid && scopeValid && gouvValid && indicatorsValid && !generating

  // -------------------------------------------------------------------
  // Assemblage du rapport (client-side, depuis overview + map) — les
  // paramètres sont explicites (chargement d'un modèle = génération directe).
  // -------------------------------------------------------------------

  const buildReport = async (params: {
    from: string
    to: string
    scopeType: ScopeType
    brandSlug: string
    gouvernorat: string
    indicators: IndicatorKey[]
  }): Promise<void> => {
    const { from: pFrom, to: pTo, scopeType: pScopeType, brandSlug: pBrandSlug, gouvernorat: pGouvernorat, indicators: pIndicators } = params
    setGenerating(true)
    try {
      let map = mapCache
      if (!map) {
        const r = await fetch("/api/shadow/map")
        if (!r.ok) throw new Error("map")
        map = (await r.json()) as ShadowMapResponse
        setMapCache(map)
      }

      const fromMonth = pFrom.slice(0, 7)
      const toMonth = pTo.slice(0, 7)
      const inRange = overview.monthly.filter(m => m.month >= fromMonth && m.month <= toMonth)
      const rangeStats = inRange.length
        ? inRange.reduce((acc, m) => ({ newPoints: acc.newPoints + m.newPoints, closed: acc.closed + m.closedPoints }), { newPoints: 0, closed: 0 })
        : { newPoints: 0, closed: 0 }
      const lastInRange = inRange[inRange.length - 1] ?? overview.monthly[overview.monthly.length - 1]

      // ---- Périmètre ----
      let pPoints = overview.kpis.activePoints
      let pLoss = overview.kpis.estLossTnd
      let pStations = overview.kpis.stationsThreatened
      let scopeName = `National — ${scopeLabel}`
      let scopedTypoSource = map.points
      let scopedStations = map.stations.filter(s => s.lossTnd > 0)

      if (pScopeType === "gouv" && pGouvernorat) {
        const gov = overview.govLosses.find(g => g.gouvernorat === pGouvernorat)
        pPoints = gov?.points ?? 0
        pLoss = gov?.lossTnd ?? 0
        pStations = gov?.stationsThreatened ?? 0
        scopeName = `Gouvernorat — ${pGouvernorat}`
        scopedTypoSource = map.points.filter(p => p.gouvernorat === pGouvernorat)
        scopedStations = scopedStations.filter(s => s.gouvernorat === pGouvernorat)
      } else if (pScopeType === "brand" && pBrandSlug) {
        const brand = reports.brands.find(b => b.brandSlug === pBrandSlug)
        pLoss = brand?.lossTnd ?? 0
        pStations = brand?.stationsThreatened ?? 0
        pPoints = brand?.points ?? 0
        scopeName = `Enseigne — ${brand?.brandName ?? pBrandSlug}`
        scopedTypoSource = map.points.filter(p => p.brandThreat === pBrandSlug)
        scopedStations = scopedStations.filter(s => s.brandSlug === pBrandSlug)
      }

      const typoByCode = new Map(map.typologies.map(t => [t.code, t]))
      const typoStats = new Map<string, { count: number; volumeLJ: number }>()
      for (const p of scopedTypoSource) {
        if (["REJETE", "DOUBLON"].includes(p.status)) continue
        const cur = typoStats.get(p.typologyCode) ?? { count: 0, volumeLJ: 0 }
        cur.count += 1
        cur.volumeLJ += p.volumeLJ
        typoStats.set(p.typologyCode, cur)
      }
      const typoTotal = [...typoStats.values()].reduce((s, t) => s + t.count, 0) || 1
      const typologies: PaperTypo[] = [...typoStats.entries()]
        .map(([code, t]) => ({
          code,
          label: typoByCode.get(code)?.label ?? code,
          color: typoByCode.get(code)?.color ?? "#9E9E9E",
          count: t.count,
          pct: Math.round((t.count / typoTotal) * 1000) / 10,
        }))
        .sort((a, b) => b.count - a.count)

      const threats: PaperThreat[] = [...scopedStations]
        .sort((a, b) => b.lossTnd - a.lossTnd)
        .slice(0, 10)
        .map(s => ({
          code: s.code,
          name: s.name,
          brandName: s.brandName,
          gouvernorat: s.gouvernorat,
          delegation: s.delegation,
          points: s.points,
          volumeStolenLJ: Math.round(s.lossTnd / (map.config.marginTndPerL * 30.4)),
          lossTnd: Math.round(s.lossTnd),
          level: s.level,
          worstDistanceM: null,
        }))

      const gov: PaperGov[] =
        pScopeType === "national"
          ? topGov(overview.govLosses, 8).map(g => ({ gouvernorat: g.gouvernorat, points: g.points, lossTnd: g.lossTnd, level: g.level }))
          : pScopeType === "gouv"
            ? overview.govLosses
                .filter(g => g.gouvernorat === pGouvernorat)
                .map(g => ({ gouvernorat: g.gouvernorat, points: g.points, lossTnd: g.lossTnd, level: g.level }))
            : govLossesForBrandStations(scopedStations)
                .slice(0, 8)
                .map(g => ({
                  gouvernorat: g.gouvernorat,
                  points: g.points,
                  lossTnd: Math.round(g.lossTnd),
                  level: levelFromLoss(g.lossTnd, map.config.lossRedTnd, map.config.lossOrangeTnd) as ShadowLevel,
                }))

      // ---- Rédaction ----
      const periodLabel = `du ${dateFr(pFrom)} au ${dateFr(pTo)}`
      const synthesis: string[] = []
      synthesis.push(
        `Rapport personnalisé du Shadow Market — période ${periodLabel}, périmètre « ${scopeName} ». ` +
        `État au ${lastInRange?.label ?? reports.monthLabel} : ${pPoints.toLocaleString("fr-FR")} points informels actifs, ` +
        `${formatTnd(pLoss)} de marge estimée perdue par mois, ${pStations.toLocaleString("fr-FR")} stations menacées.`,
      )
      if (inRange.length) {
        synthesis.push(
          `Sur la période (${inRange.length} mois couverts) : ${rangeStats.newPoints} apparitions de points et ` +
          `${rangeStats.closed} neutralisations constatées. Les indicateurs « état courant » mesurent la situation ` +
          `constatée à la date du rapport.`,
        )
      } else {
        synthesis.push(
          "Aucune statistique mensuelle archivée ne couvre cette période — les indicateurs portent l'état courant du recensement.",
        )
      }

      let recommendations: string[] | null = null
      if (pIndicators.includes("recommendations")) {
        if (pScopeType === "brand" && pBrandSlug) {
          const brand = reports.brands.find(b => b.brandSlug === pBrandSlug)
          recommendations = brandRecommendations(brand?.brandName ?? pBrandSlug, pLoss, brand?.sharePct ?? 0, pStations, threats[0] ?? null)
        } else if (pScopeType === "gouv" && pGouvernorat) {
          const shareNat = overview.kpis.activePoints > 0 ? Math.round((pPoints / overview.kpis.activePoints) * 100) : 0
          recommendations = [
            `${pGouvernorat} concentre ${shareNat} % des points informels nationaux (${pPoints.toLocaleString("fr-FR")} points, ` +
            `${formatTnd(pLoss)}/mois de perte) : intensifier les passages conjoints douanes / brigade sur les zones rouges.`,
            threats[0]
              ? `Priorité locale : ${threats[0].name} (${threats[0].gouvernorat}) — ${threats[0].points} points informels, ${formatTnd(threats[0].lossTnd)} de perte mensuelle.`
              : "Aucune station fortement cannibalisée dans ce périmètre — maintenir la veille de recensement.",
            "Étendre le recensement aux délégations limitrophes pour sécuriser la mesure de la recrudescence.",
          ]
        } else {
          recommendations = reports.recommendations
        }
      }

      const kpis: PaperKpi[] = []
      if (pIndicators.includes("activePoints")) {
        kpis.push({ label: "Points actifs", value: pPoints.toLocaleString("fr-FR"), sub: `+${rangeStats.newPoints} sur la période`, tone: "neutral" })
      }
      if (pIndicators.includes("estLoss")) {
        kpis.push({ label: "Perte estimée", value: formatTnd(pLoss), sub: "marge / mois", tone: "RED" })
      }
      if (pIndicators.includes("stationsThreatened")) {
        const reds = scopedStations.filter(s => s.level === "RED").length
        kpis.push({ label: "Stations menacées", value: pStations.toLocaleString("fr-FR"), sub: `dont ${reds} critiques`, tone: "ORANGE" })
      }
      if (kpis.length === 0) kpis.push({ label: "Périmètre", value: scopeName.split("—")[1]?.trim() ?? scopeName, sub: periodLabel, tone: "neutral" })

      const csvMeta: [string, string | number][] = [
        ["Rapport personnalisé Shadow Market", scopeName],
        ["Période", `du ${pFrom} au ${pTo}`],
        ["Généré le", new Date().toLocaleString("fr-FR")],
      ]

      setGenerated({
        docSubtitle: `${scopeName} · ${periodLabel}`,
        generatedAt: new Date().toISOString(),
        synthesis,
        kpis,
        threats: pIndicators.includes("topThreats") ? threats : null,
        gov: pIndicators.includes("gouvernorats") ? gov : null,
        trend: pIndicators.includes("trend12")
          ? overview.monthly.map(m => ({ label: m.label, activePoints: m.activePoints, estLossTnd: m.estLossTnd }))
          : null,
        typologies: pIndicators.includes("typologies") ? typologies : null,
        recommendations,
        csvMeta,
        csvThreats: threats.map(t => [t.code, t.name, t.brandName, t.gouvernorat, t.delegation, t.points, t.volumeStolenLJ, t.lossTnd, t.level]),
        csvGov: gov.map(g => [g.gouvernorat, g.points, g.lossTnd, g.level]),
      })
      toast.success("Rapport personnalisé assemblé", {
        description: `${scopeName} · ${periodLabel} — ${pIndicators.length} indicateurs inclus. Aperçu papier prêt à imprimer.`,
      })
    } catch {
      toast.error("Assemblage impossible", { description: "Les données de carte n'ont pas pu être chargées. Réessayez." })
    } finally {
      setGenerating(false)
    }
  }

  const toggleIndicator = (k: IndicatorKey) => {
    setIndicators(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]))
  }

  const saveModel = () => {
    const name = modelName.trim() || `Modèle ${new Date().toLocaleDateString("fr-FR")}`
    const model: ReportModel = {
      id: `m-${Date.now()}`,
      name,
      from, to, scopeType, brandSlug, gouvernorat,
      indicators: [...indicators],
      savedAt: new Date().toISOString(),
    }
    persistModels([model, ...models].slice(0, 12))
    setModelName("")
    toast.success("Modèle enregistré", {
      description: `« ${name} » sauvegardé localement — rechargeable en un clic depuis cette liste (12 modèles max).`,
    })
  }

  const loadModel = (m: ReportModel) => {
    // Application du modèle + génération directe avec ses paramètres explicites
    // (aucun délai, aucun closure périmée — buildReport est paramétré).
    setFrom(m.from)
    setTo(m.to)
    setPreset("custom")
    setScopeType(m.scopeType)
    setBrandSlug(m.brandSlug || reports.brands[0]?.brandSlug || "")
    setGouvernorat(m.gouvernorat || overview.govLosses[0]?.gouvernorat || "")
    setIndicators(m.indicators?.length ? m.indicators : DEFAULT_INDICATORS)
    setStep(3)
    toast.info("Modèle chargé", { description: `« ${m.name} » — génération lancée.` })
    void buildReport({
      from: m.from,
      to: m.to,
      scopeType: m.scopeType,
      brandSlug: m.brandSlug || reports.brands[0]?.brandSlug || "",
      gouvernorat: m.gouvernorat || overview.govLosses[0]?.gouvernorat || "",
      indicators: m.indicators?.length ? m.indicators : DEFAULT_INDICATORS,
    })
  }

  const monthsOptions = overview.monthly.map(m => m.month).reverse()

  const stepCard = (n: number) => {
    const s = STEPS[n - 1]
    const Icon = s.icon
    return (
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-black transition-colors",
            step === n
              ? "border-[#E53935] bg-[#E53935] text-white"
              : step > n
                ? "border-[#4CAF50] bg-[#4CAF50]/10 text-[#4CAF50]"
                : "border-stone-300 text-stone-400 dark:border-stone-700",
          )}
          aria-hidden
        >
          {step > n ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className={cn("text-[13px] font-bold leading-tight", step >= n ? "text-stone-900 dark:text-stone-50" : "text-stone-400")}>
            Étape {n} · {s.label}
          </p>
          {step === n && <p className="text-[10.5px] text-muted-foreground">en cours</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Assistant 3 étapes */}
      <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50">
              <Sparkles className="h-4 w-4 text-[#E53935]" aria-hidden />
              Assistant de rapport personnalisé
            </h3>
            <Badge variant="outline" className="text-[10px]">Étape {step}/3</Badge>
          </div>

          {/* Stepper visuel */}
          <div className="flex items-center gap-2 sm:gap-4">
            {stepCard(1)}
            <span className="h-0.5 flex-1 rounded-full bg-stone-200 dark:bg-stone-800" aria-hidden />
            {stepCard(2)}
            <span className="h-0.5 flex-1 rounded-full bg-stone-200 dark:bg-stone-800" aria-hidden />
            {stepCard(3)}
          </div>

          {/* Étape 1 — Période */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Mois prédéfini</Label>
                  <Select
                    value={preset}
                    onValueChange={v => {
                      setPreset(v)
                      if (v !== "custom") {
                        const [f, t] = monthBounds(v)
                        setFrom(f)
                        setTo(t)
                      }
                    }}
                  >
                    <SelectTrigger aria-label="Mois prédéfini">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value="custom">Période libre (dates ci-dessous)</SelectItem>
                      {monthsOptions.map(m => (
                        <SelectItem key={m} value={m}>{monthLabelFr(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div />
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Du</Label>
                  <Input type="date" value={from} max={todayStr()} onChange={e => { setFrom(e.target.value); setPreset("custom") }} aria-label="Date de début" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Au</Label>
                  <Input type="date" value={to} max={todayStr()} onChange={e => { setTo(e.target.value); setPreset("custom") }} aria-label="Date de fin" />
                </div>
              </div>
              {!periodValid && (
                <p className="text-xs font-semibold text-[#E53935]">La date de début doit précéder la date de fin.</p>
              )}
            </div>
          )}

          {/* Étape 2 — Périmètre */}
          {step === 2 && (
            <div className="space-y-4">
              <div role="radiogroup" aria-label="Type de périmètre" className="grid grid-cols-3 gap-2">
                {([
                  { v: "national", label: "National", icon: MapPin },
                  { v: "brand", label: "Enseigne", icon: Building2 },
                  { v: "gouv", label: "Gouvernorat", icon: CalendarRange },
                ] as { v: ScopeType; label: string; icon: typeof MapPin }[]).map(o => {
                  const Icon = o.icon
                  const active = scopeType === o.v
                  return (
                    <button
                      key={o.v}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setScopeType(o.v)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all",
                        active
                          ? "border-[#E53935] bg-[#E53935]/5 ring-1 ring-[#E53935]"
                          : "border-stone-200 hover:border-stone-400 dark:border-stone-800",
                      )}
                    >
                      <Icon className={cn("h-5 w-5", active ? "text-[#E53935]" : "text-stone-400")} aria-hidden />
                      <span className={cn("text-xs font-bold", active ? "text-stone-900 dark:text-stone-50" : "text-muted-foreground")}>{o.label}</span>
                    </button>
                  )
                })}
              </div>
              {scopeType === "brand" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Enseigne</Label>
                  <Select value={brandSlug} onValueChange={setBrandSlug}>
                    <SelectTrigger className="w-full sm:w-[260px]" aria-label="Enseigne du périmètre">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {reports.brands.map(b => (
                        <SelectItem key={b.brandSlug} value={b.brandSlug}>
                          {b.brandName} — {b.stationsThreatened} st. menacées
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {scopeType === "gouv" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Gouvernorat</Label>
                  <Select value={gouvernorat} onValueChange={setGouvernorat}>
                    <SelectTrigger className="w-full sm:w-[260px]" aria-label="Gouvernorat du périmètre">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {overview.govLosses.map(g => (
                        <SelectItem key={g.gouvernorat} value={g.gouvernorat}>
                          {g.gouvernorat} — {g.points} pts
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!scopeValid && <p className="text-xs font-semibold text-[#E53935]">Sélectionnez une enseigne.</p>}
              {!gouvValid && <p className="text-xs font-semibold text-[#E53935]">Sélectionnez un gouvernorat.</p>}
            </div>
          )}

          {/* Étape 3 — Indicateurs */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">Cochez les blocs à inclure dans le rapport (au moins un).</p>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {INDICATORS.map(ind => {
                  const checked = indicators.includes(ind.key)
                  return (
                    <label
                      key={ind.key}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-all",
                        checked ? "border-[#4CAF50] bg-[#4CAF50]/5" : "border-stone-200 hover:border-stone-400 dark:border-stone-800",
                      )}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleIndicator(ind.key)} aria-label={ind.label} />
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-bold leading-tight text-stone-800 dark:text-stone-100">{ind.label}</span>
                        <span className="block text-[10.5px] leading-snug text-muted-foreground">{ind.desc}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
              {!indicatorsValid && <p className="text-xs font-semibold text-[#E53935]">Sélectionnez au moins un indicateur.</p>}
            </div>
          )}

          {/* Navigation de l'assistant */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-4 dark:border-stone-800">
            <Button variant="outline" className="gap-1.5" disabled={step === 1} onClick={() => setStep(s => Math.max(1, s - 1))}>
              <ChevronLeft className="h-4 w-4" aria-hidden /> Précédent
            </Button>
            {step < 3 ? (
              <Button
                className="gap-1.5"
                disabled={(step === 1 && !periodValid) || (step === 2 && (!scopeValid || !gouvValid))}
                onClick={() => setStep(s => Math.min(3, s + 1))}
              >
                Suivant <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button className="gap-1.5" disabled={!canGenerate} onClick={() => void buildReport({ from, to, scopeType, brandSlug, gouvernorat, indicators })}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
                {generating ? "Assemblage…" : "Générer le rapport"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modèles sauvegardés */}
      <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
        <CardContent className="space-y-3 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50">
            <BookMarked className="h-4 w-4 text-[#FF9800]" aria-hidden />
            Modèles enregistrés
            <Badge variant="outline" className="text-[10px]">{models.length}</Badge>
          </h3>
          {models.length === 0 ? (
            <p className="rounded-lg border border-dashed border-stone-300 p-3 text-xs text-muted-foreground dark:border-stone-700">
              Aucun modèle sauvegardé — générez un rapport puis « Enregistrer le modèle » (stockage local de ce navigateur).
            </p>
          ) : (
            <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {models.map(m => (
                <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white p-2.5 dark:border-stone-800 dark:bg-stone-900">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-stone-800 dark:text-stone-100">{m.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {m.scopeType === "national" ? "National" : m.scopeType === "brand" ? reports.brands.find(b => b.brandSlug === m.brandSlug)?.brandName ?? "Enseigne" : m.gouvernorat}
                      {" · "}{dateFr(m.from)} → {dateFr(m.to)} · {m.indicators.length} indicateurs
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => loadModel(m)}>
                    <Wand2 className="h-3.5 w-3.5" aria-hidden /> Charger &amp; générer
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-red-600"
                    aria-label={`Supprimer ${m.name}`}
                    onClick={() => {
                      persistModels(models.filter(x => x.id !== m.id))
                      toast.info("Modèle supprimé", { description: m.name })
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rapport assemblé */}
      {generated && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50">
              <span aria-hidden>🧾</span> Rapport assemblé
            </h3>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                downloadTableCsv(`shadow-perso-${from}_${to}.csv`, generated.csvMeta, [
                  {
                    title: "Top menaces",
                    header: ["Code", "Station", "Enseigne", "Gouvernorat", "Délégation", "Points", "L/j volés", "Perte DT/mois", "Niveau"],
                    rows: generated.csvThreats,
                  },
                  { title: "Pertes par gouvernorat", header: ["Gouvernorat", "Points", "Perte DT/mois", "Niveau"], rows: generated.csvGov },
                ])
                toast.success("Export CSV téléchargé", { description: `shadow-perso-${from}_${to}.csv` })
              }}
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden /> Télécharger CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={pdfBusy}
              onClick={downloadPdf}
            >
              {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
              {pdfBusy ? "PDF…" : "Télécharger PDF"}
            </Button>
            <div className="flex items-center gap-1.5">
              <Input
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                placeholder="Nom du modèle (ex. Sud-Est trimestriel)"
                className="h-9 w-56 text-xs"
                aria-label="Nom du modèle"
              />
              <Button variant="outline" size="sm" className="gap-1.5" onClick={saveModel}>
                <Save className="h-3.5 w-3.5" aria-hidden /> Enregistrer le modèle
              </Button>
            </div>
          </div>
          <ReportPaper
            docTitle="Rapport Personnalisé"
            docSubtitle={generated.docSubtitle}
            generatedAt={generated.generatedAt}
            synthesis={generated.synthesis}
            kpis={generated.kpis}
            threats={generated.threats}
            threatsTitle="Top 10 menaces du périmètre"
            gov={generated.gov}
            govTitle="Perte estimée par gouvernorat"
            trend={generated.trend}
            typologies={generated.typologies}
            recommendations={generated.recommendations}
            onDownloadPdf={downloadPdf}
            pdfBusy={pdfBusy}
            printHint="Rapport assemblé à la demande — seuls les indicateurs cochés apparaissent. « Télécharger PDF » produit le fichier PDF correspondant."
          />
        </div>
      )}
    </div>
  )
}
