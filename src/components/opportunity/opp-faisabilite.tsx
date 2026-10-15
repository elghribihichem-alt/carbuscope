'use client'

// T51-b — Radar d'Opportunités / sous-module « 💰 Études de faisabilité » :
// 1. Rapport automatique (génération IA 20 pages + téléchargement Blob HTML)
// 2. Analyse foncière (terrains de l'étude + comparateur prix m² par gouv)
// 3. Réglementation (checklist des autorités + timeline cumulée des délais)
// 4. Ressources humaines (profils, effectifs, masse salariale)

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts"
import {
  BookOpen, Building2, CalendarClock, ClipboardCheck, Coins, FileDown, FileText, LandPlot,
  Loader2, ScrollText, Sparkles, Stamp, UserRound, Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer } from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { KpiCard } from "@/components/shell/kpi-card"
import { useChartPalette } from "@/hooks/use-chart-palette"
import { tooltipStyle } from "@/lib/chart"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  FORMAT_LABELS, SCENARIO_LABELS,
  type EtudeRegulation, type FeasibilityStudyDTO, type OpportunityZoneDTO, type RentabilitySimulationDTO,
} from "@/lib/t51-dto"
import {
  FormatBadge, OppEmpty, OppError, ScoreBadge, oppDateFr, oppDt, oppNum, oppScrollList, useEtude,
} from "./opp-shared"
import { formatReason } from "./opp-formats"

export interface OppFaisabiliteProps {
  zones: OpportunityZoneDTO[]
  brandSlug: string
  /** Rafraîchit les zones du module (hasStudy / statut pipeline) après génération. */
  onZonesChanged: () => void
}

type TipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }

const TERRAIN_STATUT: Record<string, { label: string; cls: string }> = {
  DISPONIBLE: { label: "Disponible", cls: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  EN_NEGOCIATION: { label: "En négociation", cls: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  A_VERIFIER: { label: "À vérifier", cls: "border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300" },
}

/** Document HTML de l'étude (téléchargement via Blob — sans lib PDF). */
function buildStudyHtml(
  zone: OpportunityZoneDTO,
  study: FeasibilityStudyDTO,
  simulations: RentabilitySimulationDTO[]
): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const terrainRows = (study.foncier?.terrains ?? [])
    .map(t => `<tr><td>${esc(t.localisation)}</td><td>${oppNum(t.surfaceM2)} m²</td><td>${oppNum(t.prixM2)} DT/m²</td><td>${esc(t.statut)}</td></tr>`)
    .join("")
  const regRows = (study.regulation ?? [])
    .map(r => `<tr><td>${esc(r.etape)}</td><td>${esc(r.autorite)}</td><td>${r.delaiJours} j</td><td>${esc(r.statut)}</td><td>${esc(r.commentaire)}</td></tr>`)
    .join("")
  const rhRows = (study.rh ?? [])
    .map(r => `<tr><td>${esc(r.profil)}</td><td>${r.effectif}</td><td>${oppNum(r.coutMensuelDt)} DT</td><td>${esc(r.description)}</td></tr>`)
    .join("")
  const simRows = simulations
    .map(s => `<tr><td>${SCENARIO_LABELS[s.scenario] ?? s.scenario}</td><td>${oppDt(s.caYear1)}</td><td>${oppDt(s.netYear5)}</td><td>${s.breakEvenMonths} mois</td><td>${oppNum(s.newClients)}</td></tr>`)
    .join("")
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(study.title)}</title>
<style>
body{font-family:Georgia,'Times New Roman',serif;max-width:820px;margin:40px auto;color:#292524;line-height:1.65;padding:0 24px}
h1{font-size:24px;border-bottom:3px solid #8a4b1f;padding-bottom:8px}
h2{font-size:17px;color:#8a4b1f;margin-top:28px}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid #d6d3d1;padding:6px 8px;text-align:left}
th{background:#f5f0e8}
.meta{color:#78716c;font-size:13px}
.resume{background:#faf6ee;border-left:4px solid #c98a2d;padding:12px 16px;font-style:italic}
</style></head><body>
<h1>${esc(study.title)}</h1>
<p class="meta">Rapport de ${study.pages} pages · généré par l'IA CarbuScope le ${oppDateFr(study.createdAt)} · enseigne ${esc(study.brandSlug)} · statut ${esc(study.status)}</p>
<h2>Résumé exécutif</h2>
<p class="resume">${esc(study.summary)}</p>
<h2>Données clés de la zone</h2>
<table>
<tr><th>Indicateur</th><th>Valeur</th></tr>
<tr><td>Score global</td><td>${zone.scoreGlobal}/100</td></tr>
<tr><td>Parc automobile</td><td>${oppNum(zone.vehicles)} véhicules</td></tr>
<tr><td>Trafic moyen journalier</td><td>${oppNum(zone.trafficDaily)} véh/j</td></tr>
<tr><td>Densité</td><td>${oppNum(zone.vehicleDensity)} véh/km²</td></tr>
<tr><td>Station la plus proche</td><td>${zone.nearestStationKm} km</td></tr>
<tr><td>Format recommandé</td><td>${esc(FORMAT_LABELS[zone.recommendedFormat] ?? zone.recommendedFormat)}</td></tr>
<tr><td>Investissement prévisionnel</td><td>${oppDt(study.investment)}</td></tr>
</table>
<h2>Justification du format</h2>
<p>${esc(formatReason(zone))}</p>
<h2>Analyse foncière</h2>
<table><tr><th>Terrain</th><th>Surface</th><th>Prix m²</th><th>Statut</th></tr>${terrainRows}</table>
<h2>Réglementation</h2>
<table><tr><th>Étape</th><th>Autorité</th><th>Délai</th><th>Statut</th><th>Commentaire</th></tr>${regRows}</table>
<h2>Ressources humaines</h2>
<table><tr><th>Profil</th><th>Effectif</th><th>Coût mensuel</th><th>Description</th></tr>${rhRows}</table>
<h2>Simulations de rentabilité (3 scénarios)</h2>
<table><tr><th>Scénario</th><th>CA an 1</th><th>Net an 5</th><th>Break-even</th><th>Nouveaux clients</th></tr>${simRows}</table>
<p class="meta">CarbuScope — Radar d'Opportunités · document généré côté client.</p>
</body></html>`
}

/* ======================= Onglet 1 — Rapport automatique ======================= */

function ReportTab({
  zone, etude, generating, onGenerate, withStudy, onSelectZone,
}: {
  zone: OpportunityZoneDTO | undefined
  etude: ReturnType<typeof useEtude>["data"]
  generating: boolean
  onGenerate: () => void
  withStudy: OpportunityZoneDTO[]
  onSelectZone: (id: string) => void
}) {
  const study = etude?.study ?? null
  const sims = etude?.simulations ?? []

  const download = () => {
    if (!study || !zone) return
    const html = buildStudyHtml(zone, study, sims)
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `etude-faisabilite-${zone.zoneName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success("Étude téléchargée (HTML imprimable en PDF depuis le navigateur).")
  }

  if (etude === null) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6" aria-busy="true" aria-label="Chargement de l'étude…">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {study === null ? (
        <OppEmpty
          icon={Sparkles}
          title="Aucune étude générée pour cette zone"
          action={
            <Button onClick={onGenerate} disabled={generating} className="gap-2">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {generating ? "Génération en cours…" : "Générer l'étude (IA)"}
            </Button>
          }
        >
          L&apos;étude de faisabilité (~20 pages) est générée par l&apos;IA CarbuScope : résumé exécutif,
          analyse foncière, réglementation, ressources humaines et 3 simulations de rentabilité.
          La zone passe automatiquement en statut « En étude ».
        </OppEmpty>
      ) : (
        <Card>
          <CardHeader className="flex-row flex-wrap items-start justify-between space-y-0 gap-2">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4.5 w-4.5 text-amber-700 dark:text-amber-500" aria-hidden />
                {study.title}
              </CardTitle>
              <CardDescription>
                {study.pages} pages · statut {study.status} · générée le {oppDateFr(study.createdAt)} · enseigne {study.brandSlug}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={onGenerate} disabled={generating} variant="outline" className="gap-2">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                {generating ? "Régénération…" : "Régénérer"}
              </Button>
              <Button onClick={download} className="gap-2">
                <FileDown className="h-4 w-4" aria-hidden /> Télécharger
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50/60 p-4 dark:bg-amber-950/40">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Résumé exécutif</p>
              <p className="text-sm leading-relaxed">{study.summary}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {[
                { label: "Investissement", value: oppDt(study.investment) },
                { label: "Surface cible", value: study.foncier ? `${oppNum(study.foncier.surfaceM2)} m²` : "—" },
                { label: "Prix du m²", value: study.foncier ? `${oppNum(study.foncier.prixM2)} DT` : "—" },
                { label: "Effectif requis", value: `${(study.rh ?? []).reduce((s, r) => s + r.effectif, 0)} postes` },
                {
                  label: "Délai réglementaire",
                  value: `${Math.round((study.regulation ?? []).reduce((s, r) => s + r.delaiJours, 0) / 30)} mois`,
                },
                {
                  label: "Break-even (réaliste)",
                  value: (() => {
                    const be = sims.find(s => s.scenario === "REALISTE")?.breakEvenMonths
                    return be ? `${be} mois` : "—"
                  })(),
                },
              ].map(k => (
                <div key={k.label} className="rounded-lg border bg-muted/30 p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums">{k.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Études existantes ({withStudy.length})</CardTitle>
          <CardDescription>Zones pour lesquelles une étude de faisabilité a déjà été générée.</CardDescription>
        </CardHeader>
        <CardContent>
          {withStudy.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune étude générée pour l&apos;instant — sélectionnez une zone puis « Générer l&apos;étude ».</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {withStudy.map(z => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => onSelectZone(z.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    zone?.id === z.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-stone-300 hover:bg-muted dark:border-stone-700"
                  )}
                  aria-label={`Ouvrir l'étude de ${z.zoneName}`}
                >
                  <ScrollText className="h-3 w-3" aria-hidden />
                  {z.zoneName}
                  <span className="tabular-nums opacity-70">{z.scoreGlobal}/100</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ======================= Onglet 2 — Analyse foncière ======================= */

function FoncierTab({
  zone, etude, zones, onGoToReport,
}: {
  zone: OpportunityZoneDTO | undefined
  etude: ReturnType<typeof useEtude>["data"]
  zones: OpportunityZoneDTO[]
  onGoToReport: () => void
}) {
  const study = etude?.study ?? null
  const foncier = study?.foncier ?? null
  const palette = useChartPalette()

  const govRows = useMemo(() => {
    const m = new Map<string, { gouvernorat: string; sum: number; n: number }>()
    for (const z of zones) {
      const rec = m.get(z.gouvernorat) ?? { gouvernorat: z.gouvernorat, sum: 0, n: 0 }
      rec.sum += z.foncierPriceM2
      rec.n += 1
      m.set(z.gouvernorat, rec)
    }
    return [...m.values()]
      .map(r => ({ gouvernorat: r.gouvernorat, prix: Math.round(r.sum / r.n) }))
      .sort((a, b) => b.prix - a.prix)
      .slice(0, 12)
  }, [zones])

  const renderTip = (props: TipProps) => {
    if (!props.active || !props.payload?.length) return null
    const row = props.payload[0]?.payload as { gouvernorat: string; prix: number } | undefined
    if (!row) return null
    return (
      <div className="px-3 py-2 text-xs" style={tooltipStyle()}>
        <p className="font-medium text-popover-foreground">{row.gouvernorat}</p>
        <p className="tabular-nums text-muted-foreground">
          Prix moyen : <span className="font-semibold text-popover-foreground">{oppNum(row.prix)} DT/m²</span>
        </p>
      </div>
    )
  }

  if (etude === null) {
    return <Card><CardContent className="p-6"><Skeleton className="h-48 w-full rounded-lg" /></CardContent></Card>
  }

  if (!foncier) {
    return (
      <OppEmpty
        icon={LandPlot}
        title="Analyse foncière non disponible"
        action={<Button onClick={onGoToReport} variant="outline">Générer l&apos;étude</Button>}
      >
        Générez d&apos;abord le rapport de faisabilité — l&apos;analyse foncière (terrains, prix du m²) en est extraite.
      </OppEmpty>
    )
  }

  const budget = foncier.prixM2 * foncier.surfaceM2

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Prix du m² (zone)" value={`${oppNum(foncier.prixM2)} DT`} icon={Coins} tone="info" sub={`disponibilité ${zone?.foncierDispo.toLowerCase() ?? "—"}`} />
        <KpiCard label="Surface cible" value={`${oppNum(foncier.surfaceM2)} m²`} icon={LandPlot} sub={FORMAT_LABELS[zone?.recommendedFormat ?? ""] ?? ""} />
        <KpiCard label="Budget foncier estimé" value={oppDt(budget)} icon={Building2} tone="warning" sub="prix m² × surface cible" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Terrains identifiés ({foncier.terrains.length})</CardTitle>
            <CardDescription>Parcelles candidates issues de l&apos;étude de faisabilité.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Localisation</TableHead>
                  <TableHead className="text-right">Surface</TableHead>
                  <TableHead className="text-right">Prix m²</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {foncier.terrains.map(t => {
                  const meta = TERRAIN_STATUT[t.statut] ?? { label: t.statut, cls: "border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300" }
                  return (
                    <TableRow key={t.localisation}>
                      <TableCell className="py-2 text-sm">{t.localisation}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{oppNum(t.surfaceM2)} m²</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{oppNum(t.prixM2)} DT</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("px-2", meta.cls)}>{meta.label}</Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Comparateur prix m² par gouvernorat</CardTitle>
            <CardDescription>
              Prix moyen du m² des zones du référentiel — {zone?.gouvernorat ?? "votre zone"} en terracotta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]" role="img" aria-label="Prix moyen du mètre carré par gouvernorat">
              <ChartContainer config={{}} className="aspect-auto h-full w-full">
                <BarChart data={govRows} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.grid} />
                  <XAxis
                    dataKey="gouvernorat"
                    tick={{ fontSize: 9, fill: palette.axis }}
                    interval={0}
                    angle={-38}
                    textAnchor="end"
                    height={52}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: palette.axis }}
                    tickFormatter={(v: number) => oppNum(v)}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <Tooltip content={renderTip} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                  <Bar dataKey="prix" name="DT/m²" radius={[3, 3, 0, 0]} maxBarSize={26}>
                    {govRows.map(r => (
                      <Cell key={r.gouvernorat} fill={r.gouvernorat === zone?.gouvernorat ? "#b0563b" : palette.color(5)} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ======================= Onglet 3 — Réglementation ======================= */

/** Segments cumulés de la timeline réglementaire (déclarée hors composant). */
function regSegments(reg: EtudeRegulation[]): { r: EtudeRegulation; start: number; end: number }[] {
  const out: { r: EtudeRegulation; start: number; end: number }[] = []
  let cumul = 0
  for (const r of reg) {
    out.push({ r, start: cumul, end: cumul + r.delaiJours })
    cumul += r.delaiJours
  }
  return out
}

function RegulationTab({
  etude, onGoToReport,
}: {
  etude: ReturnType<typeof useEtude>["data"]
  onGoToReport: () => void
}) {
  const study = etude?.study ?? null
  const reg = study?.regulation ?? []
  const totalDays = reg.reduce((s, r) => s + r.delaiJours, 0)

  if (etude === null) {
    return <Card><CardContent className="p-6"><Skeleton className="h-48 w-full rounded-lg" /></CardContent></Card>
  }

  if (reg.length === 0) {
    return (
      <OppEmpty
        icon={Stamp}
        title="Réglementation non disponible"
        action={<Button onClick={onGoToReport} variant="outline">Générer l&apos;étude</Button>}
      >
        Les autorisations nécessaires (APIC, municipalité, CRDA, Ministère du Commerce, ANPE) sont détaillées après génération de l&apos;étude.
      </OppEmpty>
    )
  }

  const segs = regSegments(reg)
  const REG_COLORS = ["#8a4b1f", "#c98a2d", "#0d9488", "#b0563b", "#5f7a52"]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Autorisations requises" value={reg.length} icon={ClipboardCheck} sub="APIC · municipalité · CRDA · Commerce · ANPE" />
        <KpiCard label="Délai cumulé d'instruction" value={`≈ ${Math.round(totalDays / 30)} mois`} icon={CalendarClock} tone="warning" sub={`${totalDays} jours calendaires cumulés`} />
        <KpiCard label="Statut global" value="À obtenir" icon={Stamp} tone="info" sub="aucune autorisation acquise avant lancement" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Timeline cumulée des délais</CardTitle>
          <CardDescription>Enchaînement séquentiel des autorisations — {totalDays} jours au total.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex h-8 w-full overflow-hidden rounded-lg" role="img" aria-label="Timeline cumulée des délais d'autorisation">
            {segs.map((s, i) => (
              <div
                key={s.r.etape}
                className="flex items-center justify-center overflow-hidden text-[10px] font-semibold text-white"
                style={{ width: `${(s.r.delaiJours / totalDays) * 100}%`, backgroundColor: REG_COLORS[i % REG_COLORS.length] }}
                title={`${s.r.etape} : ${s.r.delaiJours} j (cumul ${s.end} j)`}
              >
                {s.r.delaiJours} j
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {segs.map((s, i) => (
              <span key={s.r.etape} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: REG_COLORS[i % REG_COLORS.length] }} aria-hidden />
                {s.r.autorite.split("(")[0].trim()} · cumul {Math.round(s.end / 30 * 10) / 10} mois
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Checklist des autorisations</CardTitle>
          <CardDescription>Autorité, délai, statut et commentaire pour chaque étape réglementaire.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className={cn(oppScrollList, "max-h-[28rem] space-y-2")}>
            {reg.map(r => (
              <li key={r.etape} className="rounded-lg border p-3 transition-colors hover:bg-muted/40">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Stamp className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      {r.etape}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.autorite}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className="px-2 tabular-nums text-amber-700 dark:text-amber-400">
                      <CalendarClock className="mr-1 h-3 w-3" aria-hidden /> {r.delaiJours} j
                    </Badge>
                    <Badge variant="outline" className="border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                      {r.statut.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{r.commentaire}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

/* ======================= Onglet 4 — Ressources humaines ======================= */

function RhTab({
  etude, onGoToReport,
}: {
  etude: ReturnType<typeof useEtude>["data"]
  onGoToReport: () => void
}) {
  const rh = etude?.study?.rh ?? []
  const effectif = rh.reduce((s, r) => s + r.effectif, 0)
  const masse = rh.reduce((s, r) => s + r.effectif * r.coutMensuelDt, 0)

  if (etude === null) {
    return <Card><CardContent className="p-6"><Skeleton className="h-48 w-full rounded-lg" /></CardContent></Card>
  }

  if (rh.length === 0) {
    return (
      <OppEmpty
        icon={Users}
        title="Plan RH non disponible"
        action={<Button onClick={onGoToReport} variant="outline">Générer l&apos;étude</Button>}
      >
        Les profils, effectifs et coûts mensuels sont définis par la génération de l&apos;étude de faisabilité.
      </OppEmpty>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Effectif total" value={`${effectif} postes`} icon={Users} tone="success" sub={`${rh.length} profils`} />
        <KpiCard label="Masse salariale mensuelle" value={oppDt(masse)} icon={Coins} tone="warning" sub="charges patronales incluses (estimation)" />
        <KpiCard label="Masse salariale annuelle" value={oppDt(masse * 12)} icon={BookOpen} sub="base du business plan 5 ans" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <UserRound className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
            Équipe du point de service
          </CardTitle>
          <CardDescription>Profils nécessaires au format recommandé, coûts mensuels par poste.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Profil</TableHead>
                <TableHead className="text-right">Effectif</TableHead>
                <TableHead className="text-right">Coût mensuel / poste</TableHead>
                <TableHead className="text-right">Sous-total</TableHead>
                <TableHead className="min-w-[220px]">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rh.map(r => (
                <TableRow key={r.profil}>
                  <TableCell className="py-2 text-sm font-medium">{r.profil}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{r.effectif}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{oppNum(r.coutMensuelDt)} DT</TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">{oppDt(r.effectif * r.coutMensuelDt)}</TableCell>
                  <TableCell className="text-xs leading-snug text-muted-foreground">{r.description}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{effectif}</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">{oppDt(masse)}</TableCell>
                <TableCell className="text-xs font-normal text-muted-foreground">masse salariale mensuelle</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

/* ======================= Sous-module Faisabilité ======================= */

export function OppFaisabilite({ zones, brandSlug, onZonesChanged }: OppFaisabiliteProps) {
  const [tab, setTab] = useState("rapport")
  const sorted = useMemo(() => [...zones].sort((a, b) => b.scoreGlobal - a.scoreGlobal), [zones])
  const withStudy = useMemo(() => sorted.filter(z => z.hasStudy), [sorted])
  const [zoneId, setZoneId] = useState<string>("")
  const zone = zones.find(z => z.id === zoneId) ?? withStudy[0] ?? sorted[0]
  const etude = useEtude(zone?.id ?? null)

  const onGenerate = async () => {
    if (!zone) return
    const ok = await etude.generate(brandSlug)
    if (ok) {
      toast.success(`Étude de faisabilité générée pour ${zone.zoneName} (20 pages + 3 scénarios).`)
      onZonesChanged()
    } else {
      toast.error("La génération de l'étude a échoué — réessayez.")
    }
  }

  if (sorted.length === 0) return <OppEmpty icon={FileText} title="Aucune zone disponible" />

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Zone étudiée</p>
              <Select value={zone?.id ?? ""} onValueChange={setZoneId}>
                <SelectTrigger className="w-[320px]" aria-label="Sélectionner la zone à étudier">
                  <SelectValue placeholder="Zone" />
                </SelectTrigger>
                <SelectContent>
                  {sorted.slice(0, 60).map(z => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.zoneName} — {z.gouvernorat} · {z.scoreGlobal}/100{z.hasStudy ? " · étude ✓" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {zone && (
              <div className="flex flex-wrap items-center gap-1.5">
                <ScoreBadge score={zone.scoreGlobal} />
                <FormatBadge format={zone.recommendedFormat} />
                <Badge variant="outline" className="px-2 tabular-nums text-muted-foreground">
                  TMJ {oppNum(zone.trafficDaily)} véh/j
                </Badge>
              </div>
            )}
          </div>
          <Badge variant="secondary" className="h-6 px-2.5">
            {withStudy.length} étude{withStudy.length > 1 ? "s" : ""} générée{withStudy.length > 1 ? "s" : ""}
          </Badge>
        </CardContent>
      </Card>

      {etude.error && <OppError message={etude.error} onRetry={etude.reload} />}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          <TabsTrigger value="rapport">Rapport automatique</TabsTrigger>
          <TabsTrigger value="foncier">Analyse foncière</TabsTrigger>
          <TabsTrigger value="reglementation">Réglementation</TabsTrigger>
          <TabsTrigger value="rh">Ressources humaines</TabsTrigger>
        </TabsList>
        <TabsContent value="rapport" className="mt-0 space-y-4">
          <ReportTab
            zone={zone}
            etude={etude.data}
            generating={etude.generating}
            onGenerate={() => void onGenerate()}
            withStudy={withStudy}
            onSelectZone={setZoneId}
          />
        </TabsContent>
        <TabsContent value="foncier" className="mt-0 space-y-4">
          <FoncierTab zone={zone} etude={etude.data} zones={zones} onGoToReport={() => setTab("rapport")} />
        </TabsContent>
        <TabsContent value="reglementation" className="mt-0 space-y-4">
          <RegulationTab etude={etude.data} onGoToReport={() => setTab("rapport")} />
        </TabsContent>
        <TabsContent value="rh" className="mt-0 space-y-4">
          <RhTab etude={etude.data} onGoToReport={() => setTab("rapport")} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
