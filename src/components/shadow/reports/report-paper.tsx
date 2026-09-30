'use client'

// Shadow Market (T44-e) — « papier » de rapport : aperçu tel qu'imprimé.
// Carte fond blanc / ombre / padding généreux + en-tête CarbuScope « Shadow
// Market », classification « Diffusion restreinte », KPI encadrés, tableau des
// menaces, graphique par gouvernorat, recommandations, pied de page.
// L'impression passe par un portail #cs-shadow-print (seul nœud visible en
// @media print — même pattern que le rapport de passe du back-office).

import * as React from "react"
import { createPortal } from "react-dom"
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { Download, Fuel, Printer } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ShadowLevel } from "@/lib/types"
import { LEVEL_COLORS, formatTnd } from "../shadow-shared"

// ---------------------------------------------------------------------------
// Contrats internes du papier
// ---------------------------------------------------------------------------

export type PaperKpi = { label: string; value: string; sub?: string; tone?: ShadowLevel | "neutral" }
export type PaperThreat = {
  code: string
  name: string
  brandName: string
  gouvernorat: string
  delegation: string
  points: number
  volumeStolenLJ: number
  lossTnd: number
  level: ShadowLevel
  worstDistanceM: number | null
}
export type PaperGov = { gouvernorat: string; points: number; lossTnd: number; level: ShadowLevel }
export type PaperTypo = { code: string; label: string; color: string; count: number; pct: number }
export type PaperTrendPoint = { label: string; activePoints: number; estLossTnd: number }

export type ReportPaperProps = {
  /** « Rapport Mensuel », « Rapport par Enseigne », « Rapport Personnalisé »… */
  docTitle: string
  /** Sous-titre : périmètre + période. */
  docSubtitle: string
  generatedAt: string
  synthesis: string[]
  kpis: PaperKpi[]
  threats?: PaperThreat[] | null
  threatsTitle?: string
  gov?: PaperGov[] | null
  govTitle?: string
  trend?: PaperTrendPoint[] | null
  typologies?: PaperTypo[] | null
  recommendations?: string[] | null
  /** Bloc identité libre (ex. carte enseigne du rapport DG). */
  identity?: React.ReactNode
  footerNote?: string
  /** Afficher le bouton Imprimer / PDF (aperçu en ligne). */
  onPrint?: () => void
  printHint?: string
  /** Générer le PDF réel (jsPDF) — bouton « Télécharger PDF » dédié. */
  onDownloadPdf?: () => void
  /** État de chargement de la génération PDF. */
  pdfBusy?: boolean
  children?: React.ReactNode
}

// Feuille d'impression : seul le portail #cs-shadow-print reste visible.
const SHADOW_PRINT_CSS = `
@media print {
  body > *:not(#cs-shadow-print) { display: none !important; }
  #cs-shadow-print { display: block !important; }
  #cs-shadow-print * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
@page { size: A4 portrait; margin: 12mm; }
`

const TONE_COLORS: Record<string, string> = {
  RED: "#E53935",
  ORANGE: "#FF9800",
  YELLOW: "#FFC107",
  GREEN: "#4CAF50",
  neutral: "#57534E",
}

// ---------------------------------------------------------------------------
// Blocs internes
// ---------------------------------------------------------------------------

function PaperHeader({ docTitle, docSubtitle, generatedAt }: { docTitle: string; docSubtitle: string; generatedAt: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-stone-800 pb-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-stone-900 text-white" aria-hidden>
          <Fuel className="h-5.5 w-5.5" />
        </div>
        <div>
          <p className="text-base font-black leading-tight tracking-tight text-stone-900">CarbuScope — Shadow Market</p>
          <p className="text-[11px] font-medium text-stone-500">{docTitle}</p>
        </div>
      </div>
      <div className="text-right">
        <Badge
          variant="outline"
          className="border-stone-800 bg-stone-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
        >
          Diffusion restreinte
        </Badge>
        <p className="mt-1.5 text-[11px] font-semibold text-stone-700">{docSubtitle}</p>
        <p className="text-[10px] text-stone-500">
          Généré le {new Date(generatedAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}
        </p>
      </div>
    </header>
  )
}

function PaperKpis({ kpis }: { kpis: PaperKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {kpis.map(k => (
        <div key={k.label} className="rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-center">
          <p
            className="mx-auto h-1 w-8 rounded-full"
            style={{ backgroundColor: TONE_COLORS[k.tone ?? "neutral"] }}
            aria-hidden
          />
          <p className="mt-1.5 text-[16px] font-black leading-none tabular-nums text-stone-900">{k.value}</p>
          <p className="mt-1 text-[9.5px] font-bold uppercase leading-tight tracking-wide text-stone-500">{k.label}</p>
          {k.sub && <p className="mt-0.5 text-[9.5px] leading-tight text-stone-500">{k.sub}</p>}
        </div>
      ))}
    </div>
  )
}

function PaperThreatTable({ threats, title }: { threats: PaperThreat[]; title: string }) {
  return (
    <section className="break-inside-avoid">
      <h3 className="mb-2 border-l-4 border-stone-800 pl-2 text-[12px] font-black uppercase tracking-wide text-stone-800">
        {title}
      </h3>
      {/* overflow-x-auto : 8 colonnes cellées ≈ 487 px de min-content — à 390 px
          la table scrolle dans son conteneur au lieu de déborder la page. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[10.5px]">
        <thead>
          <tr className="bg-stone-100 text-left text-[9.5px] uppercase tracking-wide text-stone-600">
            <th className="border border-stone-300 px-1.5 py-1.5 font-bold">#</th>
            <th className="border border-stone-300 px-1.5 py-1.5 font-bold">Station</th>
            <th className="border border-stone-300 px-1.5 py-1.5 font-bold">Enseigne</th>
            <th className="border border-stone-300 px-1.5 py-1.5 font-bold">Localisation</th>
            <th className="border border-stone-300 px-1.5 py-1.5 text-right font-bold">Points</th>
            <th className="border border-stone-300 px-1.5 py-1.5 text-right font-bold">L/j volés</th>
            <th className="border border-stone-300 px-1.5 py-1.5 text-right font-bold">Perte/mois</th>
            <th className="border border-stone-300 px-1.5 py-1.5 font-bold">Niveau</th>
          </tr>
        </thead>
        <tbody>
          {threats.map((t, i) => (
            <tr key={t.code} className={i % 2 === 1 ? "bg-stone-50/70" : ""}>
              <td className="border border-stone-300 px-1.5 py-1.5 text-center tabular-nums text-stone-500">{i + 1}</td>
              <td className="border border-stone-300 px-1.5 py-1.5 font-semibold text-stone-800">{t.name}</td>
              <td className="border border-stone-300 px-1.5 py-1.5 text-stone-700">{t.brandName}</td>
              <td className="border border-stone-300 px-1.5 py-1.5 text-stone-600">
                {t.gouvernorat} <span className="text-stone-400">· {t.delegation}</span>
              </td>
              <td className="border border-stone-300 px-1.5 py-1.5 text-right tabular-nums text-stone-700">{t.points}</td>
              <td className="border border-stone-300 px-1.5 py-1.5 text-right tabular-nums text-stone-700">
                {t.volumeStolenLJ.toLocaleString("fr-FR")}
              </td>
              <td className="border border-stone-300 px-1.5 py-1.5 text-right font-bold tabular-nums text-stone-900">
                {formatTnd(t.lossTnd)}
              </td>
              <td className="border border-stone-300 px-1.5 py-1.5">
                <span
                  className="inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold uppercase text-white"
                  style={{ backgroundColor: LEVEL_COLORS[t.level] }}
                >
                  {t.level === "RED" ? "Critique" : t.level === "ORANGE" ? "Modéré" : t.level === "YELLOW" ? "Vigilance" : "Calme"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </section>
  )
}

function PaperGovChart({ gov, title, fixed }: { gov: PaperGov[]; title: string; fixed?: boolean }) {
  const data = gov.map(g => ({
    name: g.gouvernorat.length > 11 ? `${g.gouvernorat.slice(0, 10)}.` : g.gouvernorat,
    perte: g.lossTnd,
    level: g.level,
    full: g.gouvernorat,
  }))
  const chart = (
    <BarChart
      data={data}
      {...(fixed ? { width: 660, height: 230 } : {})}
      margin={{ top: 6, right: 8, left: 8, bottom: 4 }}
    >
      <CartesianGrid strokeDasharray="3 3" stroke="#d6d3d1" />
      <XAxis dataKey="name" tick={{ fontSize: 9.5, fill: "#57534E" }} interval={0} angle={-22} textAnchor="end" height={44} />
      <YAxis tick={{ fontSize: 9.5, fill: "#57534E" }} tickFormatter={(v: number) => formatTnd(v)} width={62} />
      <Tooltip
        formatter={(v: number | string) => [`${formatTnd(Number(v))}/mois`, "Perte estimée"]}
        labelFormatter={(l: string) => String(l)}
        contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: "#d6d3d1" }}
      />
      <Bar dataKey="perte" radius={[3, 3, 0, 0]}>
        {data.map(d => (
          <Cell key={d.name} fill={LEVEL_COLORS[d.level as ShadowLevel]} />
        ))}
      </Bar>
    </BarChart>
  )
  return (
    <section className="break-inside-avoid">
      <h3 className="mb-2 border-l-4 border-stone-800 pl-2 text-[12px] font-black uppercase tracking-wide text-stone-800">
        {title}
      </h3>
      <div className="rounded-lg border border-stone-200 p-2">
        {fixed ? chart : <div className="h-[230px] w-full"><ResponsiveContainer>{chart}</ResponsiveContainer></div>}
      </div>
      <p className="mt-1.5 text-[9.5px] leading-snug text-stone-500">
        Perte mensuelle estimée par gouvernorat — couleur selon le niveau de menace (rouge critique &gt; seuil,
        orange modéré, jaune vigilance).
      </p>
    </section>
  )
}

function PaperTrendChart({ trend, fixed }: { trend: PaperTrendPoint[]; fixed?: boolean }) {
  const data = trend.map(t => ({
    name: t.label.replace(/\s\d{4}$/, ""),
    points: t.activePoints,
    perte: t.estLossTnd,
  }))
  const chart = (
    <LineChart data={data} {...(fixed ? { width: 660, height: 200 } : {})} margin={{ top: 6, right: 10, left: 8, bottom: 2 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#d6d3d1" />
      <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#57534E" }} interval={0} />
      <YAxis yAxisId="left" tick={{ fontSize: 9, fill: "#57534E" }} width={30} />
      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: "#57534E" }} tickFormatter={(v: number) => formatTnd(v)} width={58} />
      <Tooltip
        contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: "#d6d3d1" }}
        formatter={(v: number | string, n: string) => [n === "points" ? `${Number(v).toLocaleString("fr-FR")} points` : formatTnd(Number(v)), n === "points" ? "Points actifs" : "Perte estimée"]}
      />
      <Line yAxisId="left" type="monotone" dataKey="points" stroke="#78716C" strokeWidth={2} dot={{ r: 2.5 }} />
      <Line yAxisId="right" type="monotone" dataKey="perte" stroke="#E53935" strokeWidth={2} dot={{ r: 2.5 }} />
    </LineChart>
  )
  return (
    <section className="break-inside-avoid">
      <h3 className="mb-2 border-l-4 border-stone-800 pl-2 text-[12px] font-black uppercase tracking-wide text-stone-800">
        Tendance 12 mois — points actifs &amp; perte estimée
      </h3>
      <div className="rounded-lg border border-stone-200 p-2">
        {fixed ? chart : <div className="h-[200px] w-full"><ResponsiveContainer>{chart}</ResponsiveContainer></div>}
      </div>
    </section>
  )
}

function PaperTypologies({ typologies }: { typologies: PaperTypo[] }) {
  return (
    <section className="break-inside-avoid">
      <h3 className="mb-2 border-l-4 border-stone-800 pl-2 text-[12px] font-black uppercase tracking-wide text-stone-800">
        Typologies des points recensés
      </h3>
      <div className="space-y-1.5">
        {typologies.map(t => (
          <div key={t.code} className="flex items-center gap-2 text-[10.5px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate font-semibold text-stone-800">{t.label}</span>
            <span className="shrink-0 tabular-nums text-stone-600">{t.count.toLocaleString("fr-FR")} pts</span>
            <span className="w-24 shrink-0 text-right tabular-nums font-bold text-stone-800">
              {t.pct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function PaperRecommendations({ items }: { items: string[] }) {
  return (
    <section className="break-inside-avoid rounded-lg border border-stone-300 bg-stone-50 p-3.5">
      <h3 className="mb-2 text-[12px] font-black uppercase tracking-wide text-stone-800">Recommandations</h3>
      <ol className="ml-4 list-decimal space-y-1.5 text-[11px] leading-relaxed text-stone-700">
        {items.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ol>
    </section>
  )
}

function PaperFooter({ note }: { note?: string }) {
  return (
    <footer className="mt-5 border-t border-stone-300 pt-2.5 text-center">
      <p className="text-[10px] font-semibold text-stone-600">
        {note ?? "Généré par CarbuScope — module Shadow Market · Document de travail à diffusion restreinte"}
      </p>
      <p className="mt-0.5 text-[9px] text-stone-400">
        Estimations fondées sur le modèle de cannibalisation (volume × marge × 30,4 j) — hypothèses documentées dans le module.
      </p>
    </footer>
  )
}

// ---------------------------------------------------------------------------
// Contenu complet (partagé entre l'aperçu en ligne et la copie imprimable)
// ---------------------------------------------------------------------------

function PaperContent(props: ReportPaperProps & { fixed?: boolean }) {
  const { fixed } = props
  return (
    <div className="flex flex-col gap-5">
      <PaperHeader docTitle={props.docTitle} docSubtitle={props.docSubtitle} generatedAt={props.generatedAt} />
      {props.identity}
      <section>
        <h3 className="mb-1.5 border-l-4 border-stone-800 pl-2 text-[12px] font-black uppercase tracking-wide text-stone-800">
          Synthèse
        </h3>
        <div className="space-y-1.5">
          {props.synthesis.map((p, i) => (
            <p key={i} className="text-[11.5px] leading-relaxed text-stone-700">{p}</p>
          ))}
        </div>
      </section>
      <PaperKpis kpis={props.kpis} />
      {props.threats && props.threats.length > 0 && (
        <PaperThreatTable threats={props.threats} title={props.threatsTitle ?? "Top 10 menaces — stations"} />
      )}
      {props.gov && props.gov.length > 0 && (
        <PaperGovChart gov={props.gov} title={props.govTitle ?? "Perte estimée par gouvernorat (top 8)"} fixed={fixed} />
      )}
      {props.trend && props.trend.length > 1 && <PaperTrendChart trend={props.trend} fixed={fixed} />}
      {props.typologies && props.typologies.length > 0 && <PaperTypologies typologies={props.typologies} />}
      {props.recommendations && props.recommendations.length > 0 && <PaperRecommendations items={props.recommendations} />}
      {props.children}
      <PaperFooter note={props.footerNote} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composant exporté : aperçu papier + portail d'impression
// ---------------------------------------------------------------------------

export function ReportPaper(props: ReportPaperProps) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    // Le portail n'existe qu'au client (SSR-safe) — setState asynchrone.
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const doPrint = props.onPrint ?? (() => setTimeout(() => window.print(), 120))

  return (
    <div className="space-y-2">
      {props.printHint && <p className="text-[11px] text-muted-foreground">{props.printHint}</p>}
      <Card className="border-stone-300 bg-white shadow-lg dark:bg-white">
        <CardContent className="relative p-5 sm:p-8">
          <div className="absolute right-4 top-4 flex gap-1.5 print:hidden">
            {props.onDownloadPdf && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                disabled={props.pdfBusy}
                onClick={props.onDownloadPdf}
              >
                {props.pdfBusy ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-400 border-t-stone-700" aria-hidden />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden />
                )}
                {props.pdfBusy ? "PDF…" : "Télécharger PDF"}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
              onClick={doPrint}
            >
              <Printer className="h-3.5 w-3.5" aria-hidden />
              Imprimer
            </Button>
          </div>
          <PaperContent {...props} />
        </CardContent>
      </Card>
      {mounted &&
        createPortal(
          <div id="cs-shadow-print" className={cn("hidden bg-white text-stone-900")}>
            <style>{SHADOW_PRINT_CSS}</style>
            <div className="mx-auto max-w-[720px] px-1 py-4 font-sans">
              <PaperContent {...props} fixed />
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
