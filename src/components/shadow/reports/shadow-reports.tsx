'use client'

// Shadow Market (T44-e) — section « Rapports » : 4 onglets.
//   📄 Mensuel      : rapport PDF auto-généré (aperçu papier + impression + CSV)
//   🏢 Par Enseigne : rapport dédié DG (ses stations, ses pertes)
//   🗓️ Personnalisé : assistant 3 étapes + modèles sauvegardés (localStorage)
//   📤 Export       : CSV / Excel / JSON / GeoJSON + partage email + journal
// Données : GET/POST /api/shadow/reports + GET /api/shadow/overview (garde-fou
// KPI). Pattern anti set-state-in-effect : setState uniquement dans .then.

import * as React from "react"
import { useState } from "react"
import { toast } from "sonner"
import { CalendarDays, FileDown, FileSpreadsheet, FileText, Loader2, RefreshCw } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SectionHeader, ShadowKpiCard, formatTnd, monthLabelFr } from "../shadow-shared"
import { ReportPaper } from "./report-paper"
import { downloadMonthlyReportCsv, monthlySynthesis, topGov } from "./report-utils"
import { downloadMonthlyShadowPdf } from "./shadow-pdf"
import { BrandReportTab } from "./brand-report-tab"
import { CustomReportTab } from "./custom-report-tab"
import { ExportShareTab } from "./export-share-tab"
import type { ShadowOverviewResponse, ShadowReportsResponse } from "@/lib/types"

export type ShadowReportsCtx = {
  reports: ShadowReportsResponse
  overview: ShadowOverviewResponse
  /** Libellé du périmètre effectif (session serveur). */
  scopeLabel: string
  /** Recharge les deux jeux (après POST /api/shadow/reports p. ex.). */
  reload: () => void
}

const FORMAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  PDF: FileText,
  Excel: FileSpreadsheet,
  CSV: FileDown,
  EMAIL: FileText,
}

// ---------------------------------------------------------------------------
// Onglet 1 · 📄 Rapport Mensuel
// ---------------------------------------------------------------------------

function MonthlyTab({
  ctx,
  month,
  months,
  monthLoading,
  onMonthChange,
  regenerating,
  onRegenerate,
}: {
  ctx: ShadowReportsCtx
  month: string
  months: { month: string; label: string }[]
  monthLoading: boolean
  onMonthChange: (m: string) => void
  regenerating: boolean
  onRegenerate: () => void
}) {
  const { reports, scopeLabel } = ctx
  const synthesis = React.useMemo(() => monthlySynthesis(reports), [reports])
  const [pdfBusy, setPdfBusy] = React.useState(false)

  // Génération du PDF réel (jsPDF) — habillage rouge du module.
  const downloadPdf = () => {
    setPdfBusy(true)
    Promise.resolve()
      .then(() => downloadMonthlyShadowPdf(reports, scopeLabel))
      .then((res) => {
        toast.success(`PDF généré (${res.filename})`, {
          description: `${res.sizeKb.toLocaleString("fr-FR")} Ko — rapport mensuel ${reports.monthLabel} (synthèse, KPIs, top menaces, gouvernorats, recommandations, méthodologie).`,
        })
      })
      .catch(() => {
        toast.error("Génération PDF impossible", { description: "Le rapport mensuel n'a pas pu être exporté en PDF. Réessayez." })
      })
      .finally(() => setPdfBusy(false))
  }

  return (
    <div className="space-y-4">
      {/* Barre de commande : mois + régénération */}
      <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[180px] space-y-1.5">
            <Label className="text-xs font-medium">Mois du rapport</Label>
            <Select value={month} onValueChange={onMonthChange} disabled={monthLoading}>
              <SelectTrigger className="w-[200px]" aria-label="Mois du rapport">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {months.map(m => (
                  <SelectItem key={m.month} value={m.month}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onRegenerate} disabled={regenerating} className="gap-1.5">
            {regenerating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            Régénérer le rapport
          </Button>
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              downloadMonthlyReportCsv(reports)
              toast.success("Export CSV téléchargé", {
                description: `shadow-rapport-${reports.month}.csv — synthèse, top menaces et gouvernorats (UTF-8, « ; »).`,
              })
            }}
          >
            <FileDown className="h-4 w-4" aria-hidden />
            Télécharger CSV
          </Button>
          <p className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            Dernière génération : {new Date(reports.generatedAt).toLocaleString("fr-FR")}
          </p>
        </CardContent>
      </Card>

      {/* Aperçu papier du rapport mensuel */}
      <ReportPaper
        docTitle="Rapport Mensuel"
        docSubtitle={`Périmètre ${scopeLabel} · ${reports.monthLabel}`}
        generatedAt={reports.generatedAt}
        synthesis={synthesis}
        kpis={[
          { label: "Points actifs", value: reports.summary.activePoints.toLocaleString("fr-FR"), sub: "vendeurs clandestins recensés", tone: "neutral" },
          { label: "Perte estimée", value: formatTnd(reports.summary.estLossTnd), sub: "marge / mois", tone: "RED" },
          { label: "Stations menacées", value: reports.summary.stationsThreatened.toLocaleString("fr-FR"), sub: "cannibalisation mesurable", tone: "ORANGE" },
          { label: "Nouveaux points", value: `+${reports.summary.newPoints}`, sub: `${reports.summary.neutralized} neutralisés`, tone: "YELLOW" },
        ]}
        threats={reports.topThreats}
        threatsTitle="Top 10 menaces — stations"
        gov={topGov(reports.govLosses, 8)}
        recommendations={reports.recommendations}
        onDownloadPdf={downloadPdf}
        pdfBusy={pdfBusy}
        printHint="Aperçu du rapport tel qu'imprimé (A4, fond blanc) — « Télécharger PDF » produit un vrai fichier PDF, « Imprimer » n'imprime que ce document."
      />

      {/* Historique des exports */}
      <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
        <CardContent className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50">
            <span aria-hidden>🗂️</span> Historique des exports
            <Badge variant="outline" className="text-[10px]">{reports.exports.length}</Badge>
          </h3>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-800 [scrollbar-width:thin]">
            <Table>
              <TableHeader className="sticky top-0 bg-stone-50 dark:bg-stone-900">
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead className="text-right">Taille</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Périmètre</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.exports.map(e => {
                  const Icon = FORMAT_ICONS[e.format] ?? FileText
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="max-w-[280px] truncate text-xs font-medium" title={e.name}>{e.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1 text-[11px]">
                          <Icon className="h-3 w-3" aria-hidden />
                          {e.format}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{e.sizeKb.toLocaleString("fr-FR")} Ko</TableCell>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums">
                        {new Date(e.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.scope}</TableCell>
                    </TableRow>
                  )
                })}
                {reports.exports.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                      Aucun export généré — utilisez « Régénérer le rapport ».
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shell de la section
// ---------------------------------------------------------------------------

export function ShadowReports() {
  const [reports, setReports] = useState<ShadowReportsResponse | null>(null)
  const [overview, setOverview] = useState<ShadowOverviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState("")
  const [monthLoading, setMonthLoading] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [nonce, setNonce] = useState(0)

  // Chargement initial (et après reload) : rapports + vue d'ensemble.
  React.useEffect(() => {
    const ctrl = new AbortController()
    let alive = true
    Promise.all([
      fetch("/api/shadow/reports", { signal: ctrl.signal }).then(r => {
        if (!r.ok) throw new Error("reports")
        return r.json() as Promise<ShadowReportsResponse>
      }),
      fetch("/api/shadow/overview", { signal: ctrl.signal }).then(r => {
        if (!r.ok) throw new Error("overview")
        return r.json() as Promise<ShadowOverviewResponse>
      }),
    ])
      .then(([rep, ov]) => {
        if (!alive) return
        setReports(rep)
        setOverview(ov)
        setMonth(rep.month)
      })
      .catch(() => {
        if (alive) setError("Les rapports Shadow Market n'ont pas pu être chargés.")
      })
    return () => {
      alive = false
      ctrl.abort()
    }
  }, [nonce])

  const changeMonth = (m: string) => {
    setMonth(m)
    setMonthLoading(true)
    fetch(`/api/shadow/reports?month=${encodeURIComponent(m)}`)
      .then(r => {
        if (!r.ok) throw new Error("mois")
        return r.json() as Promise<ShadowReportsResponse>
      })
      .then(rep => {
        setReports(rep)
      })
      .catch(() => {
        toast.error("Mois indisponible", { description: `Aucune statistique mensuelle n'existe pour ${monthLabelFr(m)}.` })
      })
      .finally(() => setMonthLoading(false))
  }

  const regenerate = () => {
    setRegenerating(true)
    fetch("/api/shadow/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      .then(r => {
        if (!r.ok) throw new Error("génération")
        return r.json() as Promise<{ ok: boolean; id: string }>
      })
      .then(() => {
        toast.success("Rapport régénéré et archivé", {
          description: `« Rapport mensuel Shadow Market — ${monthLabelFr(month)} » enregistré en base (type SHADOW, PDF) — visible dans l'historique des exports.`,
        })
        setNonce(n => n + 1)
      })
      .catch(() => {
        toast.error("Génération impossible", { description: "Le rapport n'a pas pu être enregistré. Réessayez." })
      })
      .finally(() => setRegenerating(false))
  }

  if (error) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center dark:border-stone-700">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-3 gap-1.5" onClick={() => setNonce(n => n + 1)}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Réessayer
        </Button>
      </div>
    )
  }

  if (!reports || !overview) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-stone-200 dark:bg-stone-800" />
          ))}
        </div>
        <div className="h-[480px] animate-pulse rounded-xl bg-stone-200 dark:bg-stone-800" />
      </div>
    )
  }

  const months = overview.monthly.map(m => ({ month: m.month, label: monthLabelFr(m.month) })).reverse()
  const scopeLabel =
    overview.scope === "BRAND" ? (reports.brands[0]?.brandName ?? "Enseigne") : "National"
  const ctx: ShadowReportsCtx = { reports, overview, scopeLabel, reload: () => setNonce(n => n + 1) }
  const k = overview.kpis

  return (
    <div className="space-y-4">
      <SectionHeader
        emoji="📑"
        title="Rapports & restitutions"
        description="Rapport mensuel national, rapport dédié par enseigne (angle DG), générateur personnalisé et exports/partages — chiffres calibrés sur le modèle de cannibalisation Shadow Market."
      />

      {/* KPI de garde-fou (vue d'ensemble — cohérence des rapports) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ShadowKpiCard label="Points actifs" value={k.activePoints.toLocaleString("fr-FR")} sub={`+${k.newThisWeek} cette semaine`} tone="neutral" trend={k.monthVariationPct} trendLabel="vs mois préc." />
        <ShadowKpiCard label="Perte estimée / mois" value={formatTnd(k.estLossTnd)} sub={`part grignotée : ${k.marketShareStolenPct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`} tone="red" trend={k.lossVariationPct} trendLabel="vs mois préc." />
        <ShadowKpiCard label="Stations menacées" value={k.stationsThreatened.toLocaleString("fr-FR")} sub={`dont ${k.stationsThreatenedRed} critiques`} tone="orange" />
        <ShadowKpiCard label="En attente de validation" value={k.pendingValidation.toLocaleString("fr-FR")} sub="signalements BRUT / VERIFIE" tone="yellow" />
      </div>

      <Tabs defaultValue="monthly">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="monthly">📄 Rapport Mensuel</TabsTrigger>
          <TabsTrigger value="brand">🏢 Rapport par Enseigne</TabsTrigger>
          <TabsTrigger value="custom">🗓️ Rapport Personnalisé</TabsTrigger>
          <TabsTrigger value="export">📤 Export / Partage</TabsTrigger>
        </TabsList>
        <TabsContent value="monthly">
          <MonthlyTab
            ctx={ctx}
            month={month || reports.month}
            months={months}
            monthLoading={monthLoading}
            onMonthChange={changeMonth}
            regenerating={regenerating}
            onRegenerate={regenerate}
          />
        </TabsContent>
        <TabsContent value="brand">
          <BrandReportTab ctx={ctx} />
        </TabsContent>
        <TabsContent value="custom">
          <CustomReportTab ctx={ctx} />
        </TabsContent>
        <TabsContent value="export">
          <ExportShareTab ctx={ctx} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
