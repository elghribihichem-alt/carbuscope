'use client'

// Shadow Market (T44-e) — onglet « 🏢 Rapport par Enseigne ».
// Rapport dédié au DG : SES stations et SES pertes uniquement. En vision
// nationale (Super Admin / démo) : sélecteur d'enseigne + classement des
// enseignes avec la sélection surlignée. Les stations de l'enseigne et leurs
// pertes proviennent de /api/shadow/map (lentille client-side fiable quelle
// que soit la session), les agrégats nationaux de /api/shadow/reports.

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Building2, Download, Loader2, Printer, RefreshCw, ShieldAlert, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppStore } from "@/store/app-store"
import type { ShadowMapResponse } from "@/lib/types"
import { LEVEL_COLORS, SHADOW_COLORS, ShadowLevelBadge, formatTnd, levelFromLoss } from "../shadow-shared"
import type { ShadowReportsCtx } from "./shadow-reports"
import { ReportPaper } from "./report-paper"
import { brandRecommendations, brandSynthesis, govLossesForBrandStations } from "./report-utils"
import { downloadBrandShadowPdf } from "./shadow-pdf"

const M2LJ = 30.4 // jours/mois — conversion perte → volume (marge issue de map.config)

export function BrandReportTab({ ctx }: { ctx: ShadowReportsCtx }) {
  const { reports, overview, scopeLabel } = ctx
  const lensBrand = useAppStore(s => s.brandSlug)

  // Enseigne sélectionnée : session (scope BRAND) sinon lentille en-tête, sinon 1re.
  const brands = reports.brands
  const fixedBrand = overview.scope === "BRAND" ? (brands[0]?.brandSlug ?? "") : ""
  const [selected, setSelected] = useState(
    fixedBrand || (brands.some(b => b.brandSlug === lensBrand) ? lensBrand : brands[0]?.brandSlug ?? ""),
  )

  // Carte complète (stations + pertes par enseigne, config de marge).
  const [map, setMap] = useState<ShadowMapResponse | null>(null)
  const [mapLoading, setMapLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/shadow/map", { signal: ctrl.signal })
      .then(r => {
        if (!r.ok) throw new Error("map")
        return r.json() as Promise<ShadowMapResponse>
      })
      .then(m => setMap(m))
      .catch(() => toast.error("Carte Shadow indisponible", { description: "Impossible de charger les stations menacées par enseigne." }))
      .finally(() => setMapLoading(false))
    return () => ctrl.abort()
  }, [])

  const brand = brands.find(b => b.brandSlug === selected) ?? brands[0]
  const margin = map?.config.marginTndPerL ?? 0.19

  // Stations de l'enseigne, triées par perte décroissante (source : carte).
  const brandStations = useMemo(() => {
    if (!map || !brand) return []
    return map.stations
      .filter(s => s.brandSlug === brand.brandSlug && s.lossTnd > 0)
      .sort((a, b) => b.lossTnd - a.lossTnd)
  }, [map, brand])

  const brandGov = useMemo(() => {
    if (!brandStations.length) return []
    return govLossesForBrandStations(brandStations).map(g => ({
      gouvernorat: g.gouvernorat,
      points: g.points,
      lossTnd: Math.round(g.lossTnd),
      level: levelFromLoss(g.lossTnd, map?.config.lossRedTnd ?? 20000, map?.config.lossOrangeTnd ?? 5000),
    }))
  }, [brandStations, map])

  const nationalTopForBrand = useMemo(
    () => reports.topThreats.filter(t => t.brandSlug === (brand?.brandSlug ?? "")),
    [reports.topThreats, brand],
  )

  const topThreat = brandStations[0] ?? null
  const recommendations = useMemo(() => {
    if (!brand) return []
    return brandRecommendations(
      brand.brandName,
      brand.lossTnd,
      brand.sharePct,
      brand.stationsThreatened,
      topThreat ? { name: topThreat.name, gouvernorat: topThreat.gouvernorat, delegation: topThreat.delegation, points: topThreat.points, lossTnd: topThreat.lossTnd } : null,
    )
  }, [brand, topThreat])

  const synthesis = useMemo(() => {
    if (!brand) return []
    return brandSynthesis(
      brand.brandName,
      brand.lossTnd,
      brand.sharePct,
      brand.stationsThreatened,
      brand.points,
      overview.kpis.estLossTnd,
      reports.monthLabel,
    )
  }, [brand, overview.kpis.estLossTnd, reports.monthLabel])

  const generate = () => {
    setGenerating(true)
    fetch("/api/shadow/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      .then(r => {
        if (!r.ok) throw new Error("génération")
        return r.json()
      })
      .then(() => {
        toast.success("Rapport enseigne généré", {
          description: `« ${brand?.brandName ?? "Enseigne"} » — archivé en base (type SHADOW) et ajouté à l'historique des exports.`,
        })
        ctx.reload()
      })
      .catch(() => toast.error("Génération impossible", { description: "Le rapport enseigne n'a pas pu être enregistré." }))
      .finally(() => setGenerating(false))
  }

  // PDF réel « angle DG » : carte d'identité enseigne + SES stations menacées.
  const downloadPdf = () => {
    if (!brand) return
    setPdfBusy(true)
    Promise.resolve()
      .then(() =>
        downloadBrandShadowPdf({
          brand,
          nationalLossTnd: overview.kpis.estLossTnd,
          nationalPoints: overview.kpis.activePoints,
          redStations,
          stations: brandStations,
          marginTndPerL: margin,
          lossRedTnd: map?.config.lossRedTnd,
          lossOrangeTnd: map?.config.lossOrangeTnd,
          synthesis,
          recommendations,
          scopeLabel,
          monthLabel: reports.monthLabel,
        }),
      )
      .then((res) => {
        toast.success(`PDF généré (${res.filename})`, {
          description: `${res.sizeKb.toLocaleString("fr-FR")} Ko — rapport dédié ${brand.brandName} : vos KPIs, vos ${brandStations.length} stations menacées, vos recommandations.`,
        })
      })
      .catch(() => {
        toast.error("Génération PDF impossible", { description: "Le rapport enseigne n'a pas pu être exporté en PDF. Réessayez." })
      })
      .finally(() => setPdfBusy(false))
  }

  if (!brand) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-muted-foreground dark:border-stone-700">
        Aucune enseigne à afficher dans ce périmètre.
      </div>
    )
  }

  const redStations = brandStations.filter(s => s.level === "RED").length

  return (
    <div className="space-y-4">
      {/* Carte d'identité de l'enseigne */}
      <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-black text-white shadow-sm"
                style={{ backgroundColor: brand.brandColor }}
                aria-hidden
              >
                {brand.brandName.trim().charAt(0).toUpperCase()}
              </span>
              <div>
                <h3 className="flex items-center gap-2 text-base font-bold text-stone-900 dark:text-stone-50">
                  <Building2 className="h-4 w-4" aria-hidden />
                  {brand.brandName}
                  <Badge variant="outline" className="text-[10px]">Rapport DG</Badge>
                </h3>
                <p className="text-xs text-muted-foreground">
                  {overview.scope === "BRAND"
                    ? `Périmètre session — vos pertes détaillées (${scopeLabel})`
                    : "Sélection libre — vision Super Administration (lentille)"}
                </p>
              </div>
            </div>
            {overview.scope === "NATIONAL" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Enseigne</Label>
                <Select value={selected} onValueChange={setSelected}>
                  <SelectTrigger className="w-[220px]" aria-label="Enseigne du rapport">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map(b => (
                      <SelectItem key={b.brandSlug} value={b.brandSlug}>
                        {b.brandName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Perte mensuelle estimée", value: formatTnd(brand.lossTnd), tone: LEVEL_COLORS.RED },
              { label: "Part du préjudice national", value: `${brand.sharePct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`, tone: LEVEL_COLORS.ORANGE },
              { label: "Vos stations menacées", value: brand.stationsThreatened.toLocaleString("fr-FR"), tone: LEVEL_COLORS.YELLOW },
              { label: "Points qui vous ciblent", value: brand.points.toLocaleString("fr-FR"), tone: SHADOW_COLORS.blue },
            ].map(c => (
              <div key={c.label} className="relative overflow-hidden rounded-xl border border-stone-200 p-3 dark:border-stone-800">
                <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: c.tone }} aria-hidden />
                <p className="text-[11px] font-medium text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-stone-900 dark:text-stone-50">{c.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={generate} disabled={generating} className="gap-1.5">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              Générer le rapport de mon enseigne
            </Button>
            <Button variant="outline" className="gap-1.5" disabled={pdfBusy} onClick={downloadPdf}>
              {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
              {pdfBusy ? "PDF en cours…" : "Télécharger PDF"}
            </Button>
            <Button variant="outline" className="gap-1.5" onClick={() => setTimeout(() => window.print(), 120)}>
              <Printer className="h-4 w-4" aria-hidden />
              Imprimer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Votre carte des menaces : classement (national) + stations */}
      <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-50">
              <span aria-hidden>🎯</span> Votre carte des menaces
            </h3>
            {mapLoading && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Chargement des stations…
              </span>
            )}
          </div>

          {/* Classement des enseignes (scope national uniquement) */}
          {overview.scope === "NATIONAL" && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Classement national des enseignes — la sélection est surlignée
              </p>
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {[...brands].sort((a, b) => b.lossTnd - a.lossTnd).map((b, i) => {
                  const isSel = b.brandSlug === selected
                  const maxLoss = Math.max(...brands.map(x => x.lossTnd), 1)
                  return (
                    <button
                      key={b.brandSlug}
                      type="button"
                      onClick={() => setSelected(b.brandSlug)}
                      className={`flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-start transition-all hover:shadow-sm ${
                        isSel
                          ? "border-stone-800 bg-stone-100 ring-1 ring-stone-400 dark:border-stone-600 dark:bg-stone-800"
                          : "border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
                      }`}
                      aria-current={isSel ? "true" : undefined}
                    >
                      <span className="w-5 shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.brandColor }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-stone-800 dark:text-stone-100">{b.brandName}</span>
                      <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-stone-200 sm:block dark:bg-stone-800" aria-hidden>
                        <span className="block h-full rounded-full" style={{ width: `${(b.lossTnd / maxLoss) * 100}%`, backgroundColor: b.brandColor }} />
                      </span>
                      <span className="w-[92px] shrink-0 text-right text-xs font-bold tabular-nums text-stone-900 dark:text-stone-50">{formatTnd(b.lossTnd)}</span>
                      <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{b.stationsThreatened} st.</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Stations menacées de l'enseigne */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Stations de {brand.brandName} présentes dans les menaces — {brandStations.length} au total
              {redStations > 0 && <span className="ml-1 font-bold text-[#E53935]">· {redStations} critiques</span>}
            </p>
            {mapLoading ? (
              <div className="h-24 animate-pulse rounded-xl bg-stone-100 dark:bg-stone-800" />
            ) : brandStations.length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-300 p-4 text-center text-xs text-muted-foreground dark:border-stone-700">
                Aucune station significativement menacée pour cette enseigne — perte de cannibalisation négligeable.
              </p>
            ) : (
              <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {brandStations.slice(0, 12).map((s, i) => (
                  <div
                    key={s.code}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white p-2.5 dark:border-stone-800 dark:bg-stone-900"
                  >
                    <span className="w-5 shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-stone-800 dark:text-stone-100" title={s.name}>{s.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {s.gouvernorat} · {s.delegation} — {s.points} point{s.points > 1 ? "s" : ""} informel{s.points > 1 ? "s" : ""}
                      </p>
                    </div>
                    <span className="text-xs font-bold tabular-nums text-stone-900 dark:text-stone-50">{formatTnd(s.lossTnd)}</span>
                    <ShadowLevelBadge level={s.level} loss={s.lossTnd} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Présence dans le top 10 national */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
              Vos stations dans le Top 10 menaces national
            </p>
            {nationalTopForBrand.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/60 p-3 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
                Aucune station {brand.brandName} dans le top 10 national — votre exposition est sous la moyenne du secteur.
              </p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {nationalTopForBrand.map(t => (
                  <div key={t.code} className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-2.5 dark:border-stone-800 dark:bg-stone-900">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-stone-800 dark:text-stone-100">{t.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t.gouvernorat} · {t.delegation} — {t.points} points informels · {t.volumeStolenLJ.toLocaleString("fr-FR")} L/j volés
                      </p>
                    </div>
                    <span className="text-xs font-bold tabular-nums text-stone-900 dark:text-stone-50">{formatTnd(t.lossTnd)}</span>
                    <ShadowLevelBadge level={t.level} loss={t.lossTnd} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Rapport papier « angle DG » */}
      <ReportPaper
        docTitle="Rapport par Enseigne"
        docSubtitle={`${brand.brandName} · ${reports.monthLabel} · périmètre ${scopeLabel}`}
        generatedAt={reports.generatedAt}
        synthesis={synthesis}
        identity={
          <div className="flex items-center gap-3 rounded-lg border border-stone-300 bg-stone-50 p-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-black text-white"
              style={{ backgroundColor: brand.brandColor }}
              aria-hidden
            >
              {brand.brandName.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-black text-stone-900">{brand.brandName} — Direction Générale</p>
              <p className="text-[10.5px] text-stone-600">
                Part du préjudice national : {brand.sharePct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % ·
                Repère national : {formatTnd(overview.kpis.estLossTnd)}/mois ({overview.kpis.activePoints.toLocaleString("fr-FR")} points actifs)
              </p>
            </div>
          </div>
        }
        kpis={[
          { label: "Perte de l'enseigne", value: formatTnd(brand.lossTnd), sub: "marge / mois", tone: "RED" },
          { label: "Part nationale", value: `${brand.sharePct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`, sub: "du préjudice total", tone: "ORANGE" },
          { label: "Stations menacées", value: brand.stationsThreatened.toLocaleString("fr-FR"), sub: `dont ${redStations} critiques`, tone: "YELLOW" },
          { label: "Points ciblant l'enseigne", value: brand.points.toLocaleString("fr-FR"), sub: "informels actifs", tone: "neutral" },
        ]}
        threats={brandStations.slice(0, 10).map(s => ({
          code: s.code,
          name: s.name,
          brandName: s.brandName,
          gouvernorat: s.gouvernorat,
          delegation: s.delegation,
          points: s.points,
          volumeStolenLJ: Math.round(s.lossTnd / (margin * M2LJ)),
          lossTnd: Math.round(s.lossTnd),
          level: s.level,
          worstDistanceM: null,
        }))}
        threatsTitle={`Vos 10 stations les plus menacées — ${brand.brandName}`}
        gov={brandGov.slice(0, 8)}
        govTitle="Votre perte par gouvernorat"
        recommendations={recommendations}
        footerNote={`Généré par CarbuScope — module Shadow Market · Rapport dédié ${brand.brandName} (diffusion restreinte)`}
        onDownloadPdf={downloadPdf}
        pdfBusy={pdfBusy}
        printHint="Rapport dédié « angle DG » : seuls vos chiffres apparaissent — le repère national sert de contexte. « Télécharger PDF » produit le fichier PDF officiel."
      />
    </div>
  )
}
