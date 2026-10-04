'use client'

// CarbuScope — T60-f — Étape 4 de l'assistant : RAPPORT DE SIMULATION.
// Composant réutilisé (aperçu) : en-tête campagne, KPIs moteur, tableau
// récapitulatif des faces, graphiques recharts (formats / gouvernorats /
// courbe ODV), impact réseau (stations propriétaires vs concurrentes —
// décomptes agrégés, jamais de détail adverse), recommandations meilleur CPM.

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Eye, Fuel, Info, Lightbulb, MapPin, Plus, ShieldCheck, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AXIS_STYLE, GRID_STROKE, tooltipStyle } from "@/lib/chart"
import type { SimulationDTO, SimulationResultsDTO } from "@/lib/media/shared"
import { dateFr, dtFr, numFr, useLocalT } from "../media-shared"
import { SIM_PALETTE } from "./sim-shared"

const DICT = {
  fr: {
    header: "Rapport de simulation",
    headerDesc: "Résultats consolidés du moteur d'affichage — persistés avec la simulation.",
    "meta.client": "Client",
    "meta.periode": "Période",
    "meta.jours": "Durée",
    "meta.budget": "Budget (coût total)",
    "meta.faces": "Faces",
    "kpi.odv": "ODV totales",
    "kpi.reach": "Reach dédupliqué",
    "kpi.freq": "Fréquence",
    "kpi.cpm": "CPM",
    "kpi.cout": "Coût total",
    "kpi.odvHint": "Occasions de voir cumulées sur la période",
    "kpi.reachHint": "Individus uniques estimés après déduplication par zone",
    "kpi.freqHint": "Expositions moyennes par individu",
    faces: "Récapitulatif des faces",
    "col.code": "Face",
    "col.ville": "Ville",
    "col.format": "Format",
    "col.prix": "Prix unitaire",
    "col.remise": "Remise",
    "col.odv": "ODV",
    "col.audience": "Audience",
    "col.cout": "Coût",
    charts: "Analyse",
    "chart.format": "Répartition par format",
    "chart.gov": "Répartition par gouvernorat",
    "chart.odvjour": "Courbe ODV / jour",
    network: "Impact réseau",
    "network.prop": "Stations du réseau touchées",
    "network.propHint": "Stations de votre enseigne à ≤ 1 km des faces sélectionnées",
    "network.conc": "Stations concurrentes à proximité",
    "network.concHint": "Le détail concurrent n'est jamais révélé — décomptes agrégés par enseigne adverse uniquement.",
    "network.coverage": "Couverture du réseau de stations",
    "network.sov": "Part de voix sur la zone",
    reco: "Recommandations du moteur",
    recoHint: "Faces alternatives au meilleur CPM pour renforcer la campagne.",
    "reco.add": "Ajouter à la sélection",
    "reco.added": "Déjà sélectionnée",
    "reco.cpm": "CPM",
    empty: "Aucun résultat — lancez d'abord le calcul (étape 3).",
    hint: "est.",
  },
  en: {
    header: "Simulation report",
    headerDesc: "Consolidated engine results — persisted with the simulation.",
    "meta.client": "Client",
    "meta.periode": "Period",
    "meta.jours": "Duration",
    "meta.budget": "Budget (total cost)",
    "meta.faces": "Faces",
    "kpi.odv": "Total ODV",
    "kpi.reach": "Deduplicated reach",
    "kpi.freq": "Frequency",
    "kpi.cpm": "CPM",
    "kpi.cout": "Total cost",
    "kpi.odvHint": "Cumulative opportunities to see over the period",
    "kpi.reachHint": "Unique individuals estimated after zone deduplication",
    "kpi.freqHint": "Average exposures per individual",
    faces: "Faces recap",
    "col.code": "Face",
    "col.ville": "City",
    "col.format": "Format",
    "col.prix": "Unit price",
    "col.remise": "Discount",
    "col.odv": "ODV",
    "col.audience": "Audience",
    "col.cout": "Cost",
    charts: "Analysis",
    "chart.format": "Split by format",
    "chart.gov": "Split by governorate",
    "chart.odvjour": "ODV / day curve",
    network: "Network impact",
    "network.prop": "Network stations reached",
    "network.propHint": "Your brand's stations within 1 km of selected faces",
    "network.conc": "Competing stations nearby",
    "network.concHint": "Competitor detail is never revealed — aggregated counts by rival brand only.",
    "network.coverage": "Station network coverage",
    "network.sov": "Share of voice in the zone",
    reco: "Engine recommendations",
    recoHint: "Alternative faces with the best CPM to strengthen the campaign.",
    "reco.add": "Add to selection",
    "reco.added": "Already selected",
    "reco.cpm": "CPM",
    empty: "No results yet — run the computation first (step 3).",
    hint: "est.",
  },
  ar: {
    header: "تقرير المحاكاة",
    "meta.client": "العميل",
    "meta.periode": "الفترة",
    "meta.budget": "الميزانية",
    "meta.faces": "الأوجه",
    "kpi.odv": "إجمالي ODV",
    "kpi.reach": "الوصول",
    "kpi.freq": "التكرار",
    "kpi.cpm": "CPM",
    "kpi.cout": "التكلفة الإجمالية",
    faces: "ملخص الأوجه",
    "col.code": "الوجه",
    "col.ville": "المدينة",
    "col.format": "الصيغة",
    "col.prix": "السعر",
    "col.remise": "الخصم",
    network: "تأثير الشبكة",
    "network.coverage": "تغطية شبكة المحطات",
    "network.sov": "الحصة الصوتية",
    reco: "توصيات المحرك",
    "reco.add": "إضافة إلى الاختيار",
    "reco.added": "مختارة بالفعل",
    empty: "لا توجد نتائج — أطلق الحساب أولا (المرحلة 3).",
  },
}

/** Bloc 5 KPIs du moteur (réutilisé par l'étape 3 et le rapport). */
export function SimKpis({ results }: { results: SimulationResultsDTO }) {
  const { t } = useLocalT(DICT)
  const kpis: { label: string; value: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { label: t("kpi.odv"), value: numFr(results.odvTotal), hint: t("kpi.odvHint"), icon: Eye },
    { label: t("kpi.reach"), value: numFr(results.reach), hint: t("kpi.reachHint"), icon: TrendingUp },
    { label: t("kpi.freq"), value: results.frequence.toLocaleString("fr-FR"), hint: t("kpi.freqHint"), icon: MapPin },
    { label: t("kpi.cpm"), value: dtFr(results.cpm), hint: "Coût pour mille ODV (est.)", icon: TrendingUp },
    { label: t("kpi.cout"), value: dtFr(results.coutTotal), hint: `${results.days} j · ${results.facesCount} faces`, icon: Fuel },
  ]
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {kpis.map(k => (
        <Card key={k.label} className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <k.icon className="h-3.5 w-3.5 text-[#059669] dark:text-emerald-500" aria-hidden />
              {k.label}
            </div>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-[#059669] dark:text-emerald-400">{k.value}</p>
            <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{k.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function SimReport({ sim, onAddFace }: {
  sim: SimulationDTO
  /** Reco « Ajouter à la sélection » → retour étape 1 avec la face ajoutée. */
  onAddFace?: (faceId: string) => void
}) {
  const { t } = useLocalT(DICT)
  const r = sim.results
  if (!r) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">{t("empty")}</CardContent>
      </Card>
    )
  }

  const selectedIds = new Set(sim.selections.map(s => s.faceId))
  const fmtData = r.parFormat.map(d => ({ name: d.format, odv: d.odv, cout: d.cout }))
  const govData = r.parGouvernorat.map(d => ({ name: d.governorat, odv: d.odv, cout: d.cout }))
  const dayData = r.odvParJour.map(d => ({ date: d.date.slice(5), odv: d.odv }))

  return (
    <div className="space-y-4">
      {/* En-tête campagne */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold leading-tight">{sim.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("headerDesc")}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <p className="text-muted-foreground">{t("meta.client")}</p>
                <p className="font-medium">{sim.client ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("meta.periode")}</p>
                <p className="font-medium">{dateFr(sim.dateStart)} → {dateFr(sim.dateEnd)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("meta.jours")}</p>
                <p className="font-medium">{r.days} j</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("meta.faces")}</p>
                <p className="font-medium">{r.facesCount} · {r.formatsCount} {t("hint")} formats · {r.villesCount} villes</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("meta.budget")}</p>
                <p className="font-bold text-[#059669] dark:text-emerald-400">{dtFr(r.coutTotal)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <SimKpis results={r} />

      {/* Tableau récapitulatif des faces */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Eye className="h-4 w-4 text-[#059669] dark:text-emerald-500" aria-hidden />
            {t("faces")} <span className="text-muted-foreground">({r.lignes.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-4">
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>{t("col.code")}</TableHead>
                  <TableHead>{t("col.ville")}</TableHead>
                  <TableHead>{t("col.format")}</TableHead>
                  <TableHead className="text-right">{t("col.prix")}</TableHead>
                  <TableHead className="text-right">{t("col.remise")}</TableHead>
                  <TableHead className="text-right">{t("col.odv")}</TableHead>
                  <TableHead className="text-right">{t("col.audience")}</TableHead>
                  <TableHead className="text-right">{t("col.cout")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.lignes.map(l => (
                  <TableRow key={l.faceId}>
                    <TableCell className="font-mono text-xs">{l.code}</TableCell>
                    <TableCell className="text-xs">{l.ville}</TableCell>
                    <TableCell className="text-xs">{l.format}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{dtFr(l.prixUnitaire)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{l.remise ? `${l.remise.toLocaleString("fr-FR")} %` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{numFr(l.odv)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{numFr(l.audience)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{dtFr(l.cout)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Graphiques */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{t("charts")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("chart.format")}</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fmtData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} interval={0} fontSize={10} />
                    <YAxis tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} tickFormatter={(v: number) => (v >= 1_000_000 ? `${Math.round(v / 1_000_000)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} fontSize={10} />
                    <Tooltip contentStyle={tooltipStyle()} formatter={(v: number) => numFr(v)} />
                    <Bar dataKey="odv" radius={[4, 4, 0, 0]}>
                      {fmtData.map((_, i) => (
                        <Cell key={i} fill={SIM_PALETTE[i % SIM_PALETTE.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("chart.gov")}</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={govData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} fontSize={10} />
                    <YAxis tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} tickFormatter={(v: number) => (v >= 1_000_000 ? `${Math.round(v / 1_000_000)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} fontSize={10} />
                    <Tooltip contentStyle={tooltipStyle()} formatter={(v: number) => numFr(v)} />
                    <Bar dataKey="odv" fill="#d97706" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <Separator />
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("chart.odvjour")}</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dayData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} minTickGap={24} fontSize={10} />
                  <YAxis tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} fontSize={10} />
                  <Tooltip contentStyle={tooltipStyle()} formatter={(v: number) => numFr(v)} />
                  <Line type="monotone" dataKey="odv" stroke="#b0563b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Impact réseau */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Fuel className="h-4 w-4 text-[#059669] dark:text-emerald-500" aria-hidden />
            {t("network")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t("network.prop")} <span className="font-normal">— {t("network.propHint")}</span></p>
              <div className="mt-3 space-y-2">
                {r.stationsProprietaires.length === 0 ? (
                  <p className="text-xs text-muted-foreground">—</p>
                ) : (
                  r.stationsProprietaires.map(s => (
                    <div key={s.code} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#059669] dark:text-emerald-500" aria-hidden />
                      <span className="font-mono text-xs font-semibold">{s.code}</span>
                      <span className="min-w-0 truncate text-xs text-muted-foreground">{s.name}</span>
                      <Badge variant="outline" className="ml-auto shrink-0 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                        {s.distanceM.toLocaleString("fr-FR")} m
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t("network.conc")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.stationsConcurrentes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">—</p>
                ) : (
                  r.stationsConcurrentes.map(c => (
                    <Badge key={c.brand} variant="outline" className="border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                      {c.brand} × {c.count}
                    </Badge>
                  ))
                )}
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                {t("network.concHint")}
              </p>
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-xs font-medium text-muted-foreground">{t("network.coverage")}</p>
                <p className="text-sm font-bold tabular-nums text-[#059669] dark:text-emerald-400">{r.couvertureReseauPct.toLocaleString("fr-FR")} %</p>
              </div>
              <Progress value={Math.min(100, Math.max(0, r.couvertureReseauPct))} className="h-2.5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t("network.sov")}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#d97706] dark:text-amber-500">
                {r.partDeVoix.toLocaleString("fr-FR")} %
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommandations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="h-4 w-4 text-[#d97706] dark:text-amber-500" aria-hidden />
            {t("reco")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t("recoHint")}</p>
        </CardHeader>
        <CardContent className="p-0 pb-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col.code")}</TableHead>
                  <TableHead>{t("col.ville")}</TableHead>
                  <TableHead>{t("col.format")}</TableHead>
                  <TableHead className="text-right">{t("reco.cpm")}</TableHead>
                  <TableHead className="w-44" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.recommandations.map(rec => {
                  const already = selectedIds.has(rec.faceId)
                  return (
                    <TableRow key={rec.faceId}>
                      <TableCell className="font-mono text-xs">{rec.code}</TableCell>
                      <TableCell className="text-xs">{rec.ville}</TableCell>
                      <TableCell className="text-xs">{rec.format}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs font-semibold text-[#059669] dark:text-emerald-400">{dtFr(rec.cpm)}</TableCell>
                      <TableCell className="text-right">
                        {onAddFace ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={already}
                            onClick={() => onAddFace(rec.faceId)}
                            className="h-9 gap-1.5 border-[#059669] bg-[#059669] text-white hover:bg-[#047857] dark:border-emerald-700 dark:bg-emerald-800 dark:text-emerald-50 dark:hover:bg-emerald-700"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                            {already ? t("reco.added") : t("reco.add")}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
