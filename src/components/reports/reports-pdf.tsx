"use client"

// CarbuScope (T45-b) — génération PDF RÉELLE des rapports B2B (module A.8).
// Le rapport en base ne porte que des métadonnées (type, période, périmètre) :
// le CONTENU est composé au moment du clic à partir des données réelles des API
// existantes : /api/stats/overview, /api/stats/gouvernorats, /api/stats/
// market-share, /api/stats/movements, /api/alerts (+ /api/governorats pour le
// classement « sous-desservi » de l'implantation, et /api/shadow/reports pour
// les rapports de type SHADOW). Habillage émeraude #059669 sur le socle
// src/lib/report-pdf.ts — AUCUNE modification serveur.

import * as React from "react"
import { toast } from "sonner"
import { FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAppStore } from "@/store/app-store"
import {
  ALERT_SEVERITY_LABELS,
  ALERT_TYPE_LABELS,
  REPORT_TYPE_LABELS,
  type AlertDTO,
  type GouvernoratStatRow,
  type GovernoratRow,
  type MarketShareRow,
  type MovementsStats,
  type OverviewStats,
  type ReportDTO,
} from "@/lib/types"
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
  type ReportPdf,
} from "@/lib/report-pdf"
import { downloadMonthlyShadowPdf } from "@/components/shadow/reports/shadow-pdf"
import type { ShadowReportsResponse } from "@/lib/types"

// ---------------------------------------------------------------------------
// Récupération des données (chaque appel dégrade proprement en cas d'échec)
// ---------------------------------------------------------------------------

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

type B2bData = {
  overview: OverviewStats | null
  govStats: GouvernoratStatRow[] | null
  marketShare: MarketShareRow[] | null
  movements: MovementsStats | null
  alerts: AlertDTO[] | null
  demographie: GovernoratRow[] | null
}

async function fetchB2bData(brandSlug: string, withDemographie: boolean): Promise<B2bData> {
  const [overview, gov, share, movements, alerts, demo] = await Promise.all([
    getJson<OverviewStats>(`/api/stats/overview?brand=${encodeURIComponent(brandSlug)}`),
    getJson<{ data: GouvernoratStatRow[] }>(`/api/stats/gouvernorats?brand=${encodeURIComponent(brandSlug)}`),
    getJson<{ data: MarketShareRow[] }>("/api/stats/market-share"),
    getJson<MovementsStats>("/api/stats/movements"),
    getJson<{ alerts: AlertDTO[] }>("/api/alerts?limit=10"),
    withDemographie ? getJson<{ governorats: GovernoratRow[] }>("/api/governorats") : Promise.resolve(null),
  ])
  return {
    overview,
    govStats: gov?.data ?? null,
    marketShare: share?.data ?? null,
    movements,
    alerts: alerts?.alerts ?? null,
    demographie: demo?.governorats ?? null,
  }
}

// ---------------------------------------------------------------------------
// Petits formatteurs
// ---------------------------------------------------------------------------

const intFr = (n: number) => n.toLocaleString("fr-FR")
const pct1 = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`
const brandLabel = (slug: string) => (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "Enseigne")

function dataMissing(pdf: ReportPdf, what: string): void {
  paragraph(pdf, `Données « ${what} » momentanément indisponibles — cette section n'a pas pu être alimentée.`, { size: 8.5, muted: true })
}

/** Points de vigilance générés depuis les alertes (critiques en priorité). */
function writeVigilance(pdf: ReportPdf, alerts: AlertDTO[]): void {
  const pool = alerts.filter((a) => a.severity === "CRITICAL")
  const items = (pool.length > 0 ? pool : alerts).slice(0, 5).map((a) => {
    const date = new Date(a.date).toLocaleDateString("fr-FR")
    const desc = (a.description ?? "").slice(0, 200)
    return `${date} — ${ALERT_TYPE_LABELS[a.type] ?? a.type} : ${a.title} (${a.gouvernorat}). ${desc}`
  })
  if (items.length === 0) {
    sectionTitle(pdf, "Points de vigilance")
    paragraph(pdf, "Aucune alerte critique active sur la période — situation sous contrôle.", { muted: true })
    return
  }
  sectionTitle(pdf, "Points de vigilance")
  bulletList(pdf, items)
}

// ---------------------------------------------------------------------------
// Composition par type
// ---------------------------------------------------------------------------

function pdfConcurrence(pdf: ReportPdf, data: B2bData, brandSlug: string): void {
  const ov = data.overview
  sectionTitle(pdf, "1. Indicateurs clés")
  kpiGrid(pdf, [
    { label: "Stations nationales", value: intFr(ov?.totalNational ?? data.marketShare?.reduce((s, m) => s + m.stations, 0) ?? 0), sub: "réseau formel recensé" },
    { label: `Stations ${brandLabel(brandSlug)}`, value: intFr(ov?.myStations ?? 0), sub: "enseigne de référence" },
    { label: "Part de marché", value: pct1(ov?.marketSharePct ?? 0), sub: "vs ensemble du réseau" },
    { label: "Alertes critiques", value: intFr(ov?.alerts.critical ?? 0), sub: `sur ${intFr(ov?.alerts.total ?? 0)} alertes actives` },
  ])

  sectionTitle(pdf, "2. Parts de marché par enseigne")
  if (data.marketShare?.length) {
    table(pdf, {
      head: ["Enseigne", "Stations", "Part de marché"],
      body: data.marketShare.map((m) => [m.brand, m.stations, pct1(m.sharePct)]),
      colStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    })
  } else dataMissing(pdf, "parts de marché")

  sectionTitle(pdf, "3. Couverture concurrentielle par gouvernorat (top 12)")
  if (data.govStats?.length) {
    const rows = [...data.govStats].sort((a, b) => b.total - a.total).slice(0, 12)
    table(pdf, {
      head: ["Gouvernorat", "Mes stations", "Concurrents", "Total", "Ma part"],
      body: rows.map((g) => [g.gouvernorat, g.mine, g.competitors, g.total, g.total ? pct1(Math.round((g.mine / g.total) * 1000) / 10) : "—"]),
      colStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    })
  } else dataMissing(pdf, "gouvernorats")

  writeVigilance(pdf, data.alerts ?? [])
}

function pdfImplantation(pdf: ReportPdf, data: B2bData): void {
  const demo = data.demographie ?? []
  const pop = demo.reduce((s, g) => s + g.population, 0)
  const veh = demo.reduce((s, g) => s + g.vehicles, 0)
  const stations = demo.reduce((s, g) => s + g.stations, 0)
  sectionTitle(pdf, "1. Indicateurs clés")
  kpiGrid(pdf, [
    { label: "Population couverte", value: intFr(pop), sub: "24 gouvernorats" },
    { label: "Parc automobile", value: intFr(veh), sub: "véhicules en circulation" },
    { label: "Stations recensées", value: intFr(stations), sub: "réseau formel" },
    { label: "Charge moyenne", value: stations ? intFr(Math.round(veh / stations)) : "—", sub: "véhicules par station" },
  ])

  sectionTitle(pdf, "2. Gouvernorats sous-desservis (parc par station)")
  if (demo.length) {
    const rows = demo
      .map((g) => ({ ...g, vps: g.stations > 0 ? g.vehicles / g.stations : Infinity }))
      .sort((a, b) => b.vps - a.vps)
      .slice(0, 12)
    table(pdf, {
      head: ["Gouvernorat", "Population", "Véhicules", "Stations", "Véh./station", "Motorisation"],
      body: rows.map((g) => [
        g.name,
        intFr(g.population),
        intFr(g.vehicles),
        g.stations,
        Number.isFinite(g.vps) ? intFr(Math.round(g.vps)) : "—",
        pct1(g.motorizationRate),
      ]),
      colStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    })
    paragraph(
      pdf,
      "Lecture : plus le ratio véhicules par station est élevé, plus la zone est sous-équipée — candidats prioritaires pour une implantation.",
      { size: 8.5, muted: true },
    )
  } else dataMissing(pdf, "démographie")

  sectionTitle(pdf, "3. Mouvements du réseau par enseigne (12 mois)")
  if (data.movements?.byBrand?.length) {
    table(pdf, {
      head: ["Enseigne", "Ouvertures", "Rénovations", "Fermetures"],
      body: data.movements.byBrand.map((b) => [b.brand, b.openings, b.renovations, b.closures]),
      colStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    })
  } else dataMissing(pdf, "mouvements")

  writeVigilance(pdf, data.alerts ?? [])
}

function pdfPerformance(pdf: ReportPdf, data: B2bData, brandSlug: string): void {
  const ov = data.overview
  const mv = data.movements
  const openings12 = mv?.openings?.reduce((s, v) => s + v, 0) ?? 0
  const closures12 = mv?.closures?.reduce((s, v) => s + v, 0) ?? 0
  sectionTitle(pdf, "1. Indicateurs clés")
  kpiGrid(pdf, [
    { label: `Stations ${brandLabel(brandSlug)}`, value: intFr(ov?.myStations ?? 0), sub: `${intFr(ov?.totalNational ?? 0)} stations au national` },
    { label: "Part de marché", value: pct1(ov?.marketSharePct ?? 0), sub: "réseau national" },
    { label: "Trafic moyen", value: intFr(ov?.avgTraffic ?? 0), sub: "véhicules par jour" },
    { label: "Vigilance réseau", value: `${intFr(ov?.underTension ?? 0)} / ${intFr(ov?.toRenovate ?? 0)}`, sub: "sous tension / à rénover" },
  ])

  sectionTitle(pdf, "2. Couverture du réseau par gouvernorat (top 12)")
  if (data.govStats?.length) {
    const rows = [...data.govStats].sort((a, b) => b.mine - a.mine).slice(0, 12)
    table(pdf, {
      head: ["Gouvernorat", "Mes stations", "Concurrents", "Total", "Ma part"],
      body: rows.map((g) => [g.gouvernorat, g.mine, g.competitors, g.total, g.total ? pct1(Math.round((g.mine / g.total) * 1000) / 10) : "—"]),
      colStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    })
  } else dataMissing(pdf, "gouvernorats")

  sectionTitle(pdf, "3. Évolution du réseau (12 derniers mois)")
  if (mv?.months?.length) {
    const n = mv.months.length
    const zip = (arr: number[]) => arr.slice(-Math.min(n, 12))
    const months = mv.months.slice(-Math.min(n, 12))
    table(pdf, {
      head: ["Mois", "Ouvertures", "Rénovations", "Fermetures", "Rebrandings"],
      body: months.map((m, i) => [m, zip(mv.openings)[i], zip(mv.renovations)[i], zip(mv.closures)[i], zip(mv.rebrands)[i]]),
      colStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    })
    paragraph(
      pdf,
      `Bilan 12 mois : ${intFr(openings12)} ouvertures et ${intFr(closures12)} fermetures recensées sur l'ensemble du marché.`,
      { size: 8.5, muted: true },
    )
  } else dataMissing(pdf, "mouvements")

  writeVigilance(pdf, data.alerts ?? [])
}

function pdfVeille(pdf: ReportPdf, data: B2bData): void {
  const mv = data.movements
  const openings12 = mv?.openings?.reduce((s, v) => s + v, 0) ?? 0
  const closures12 = mv?.closures?.reduce((s, v) => s + v, 0) ?? 0
  const alerts = data.alerts ?? []
  const critical = alerts.filter((a) => a.severity === "CRITICAL").length
  sectionTitle(pdf, "1. Indicateurs clés")
  kpiGrid(pdf, [
    { label: "Alertes suivies", value: intFr(data.overview?.alerts.total ?? alerts.length), sub: "fil de veille" },
    { label: "Alertes critiques", value: intFr(data.overview?.alerts.critical ?? critical), sub: "action requise" },
    { label: "Ouvertures 12 mois", value: intFr(openings12), sub: "mouvements réseau" },
    { label: "Fermetures 12 mois", value: intFr(closures12), sub: "mouvements réseau" },
  ])

  sectionTitle(pdf, "2. Dernières alertes (10 plus récentes)")
  if (alerts.length) {
    table(pdf, {
      head: ["Date", "Type", "Objet", "Gouvernorat", "Sévérité"],
      body: alerts.slice(0, 10).map((a) => [
        new Date(a.date).toLocaleDateString("fr-FR"),
        ALERT_TYPE_LABELS[a.type] ?? a.type,
        a.title,
        a.gouvernorat,
        ALERT_SEVERITY_LABELS[a.severity] ?? a.severity,
      ]),
      colStyles: { 0: { cellWidth: 20 } },
    })
  } else dataMissing(pdf, "alertes")

  sectionTitle(pdf, "3. Mouvements par enseigne (12 mois)")
  if (mv?.byBrand?.length) {
    table(pdf, {
      head: ["Enseigne", "Ouvertures", "Rénovations", "Fermetures"],
      body: mv.byBrand.map((b) => [b.brand, b.openings, b.renovations, b.closures]),
      colStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    })
  } else dataMissing(pdf, "mouvements")

  writeVigilance(pdf, alerts)
}

// ---------------------------------------------------------------------------
// Générateur principal
// ---------------------------------------------------------------------------

const slugType = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "rapport"

/**
 * Génère et télécharge le PDF d'un rapport B2B (contenu réel, composé au clic).
 * Les rapports de type SHADOW sont délégués au générateur Shadow Market (rouge).
 */
export async function generateB2bReportPdf(report: ReportDTO, brandSlug: string): Promise<PdfFinishResult> {
  const type = String(report.type ?? "VEILLE").toUpperCase()
  const typeLabel = REPORT_TYPE_LABELS[type] ?? (type === "SHADOW" ? "Rapport Shadow Market" : type)
  const title = String(report.name ?? `Rapport — ${typeLabel}`)
  const period = String(report.period ?? "Période courante")
  const scope = String(report.scope ?? "National")

  // Rapports Shadow : générateur dédié du module (habillage rouge).
  if (type === "SHADOW") {
    const rep = await getJson<ShadowReportsResponse>("/api/shadow/reports")
    if (rep) return downloadMonthlyShadowPdf(rep, "National")
  }

  const data = await fetchB2bData(brandSlug, type === "IMPLANTATION")
  const pdf = createReportPdf({
    title,
    subtitle: `${typeLabel} · ${period} · ${scope}`,
    brandColor: "#059669",
    metaLines: [
      `Généré par : ${String(report.generatedBy ?? "Plateforme CarbuScope")}`,
      `Enseigne de référence : ${brandLabel(brandSlug)}`,
      "Contenu composé en direct depuis les données de la plateforme.",
    ],
  })

  switch (type) {
    case "CONCURRENCE":
      pdfConcurrence(pdf, data, brandSlug)
      break
    case "IMPLANTATION":
      pdfImplantation(pdf, data)
      break
    case "PERFORMANCE":
      pdfPerformance(pdf, data, brandSlug)
      break
    case "VEILLE":
    default:
      pdfVeille(pdf, data)
      break
  }

  return finish(pdf, `carbuscope-rapport-${slugType(type)}-${pdfStamp()}.pdf`)
}

// ---------------------------------------------------------------------------
// Bouton d'action « PDF » (icône ou libellé) avec état de chargement + toast
// ---------------------------------------------------------------------------

export function ReportPdfButton({
  report,
  mode = "icon",
}: {
  report: ReportDTO
  /** icon : tableau (icône seule) · label : vue cartes (bouton « PDF »). */
  mode?: "icon" | "label"
}) {
  const brandSlug = useAppStore((s) => s.brandSlug)
  const [busy, setBusy] = React.useState(false)
  const name = String(report.name ?? `rapport ${REPORT_TYPE_LABELS[String(report.type ?? "").toUpperCase()] ?? report.type ?? ""}`)

  const run = () => {
    setBusy(true)
    generateB2bReportPdf(report, brandSlug)
      .then((res) => {
        toast.success(`PDF généré (${res.filename})`, {
          description: `${res.sizeKb.toLocaleString("fr-FR")} Ko — contenu composé en direct (stats, gouvernorats, mouvements, alertes).`,
        })
      })
      .catch(() => {
        toast.error("Génération PDF impossible", {
          description: `« ${name} » — les données n'ont pas pu être assemblées. Réessayez.`,
        })
      })
      .finally(() => setBusy(false))
  }

  if (mode === "label") {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 text-primary"
        disabled={busy}
        onClick={run}
        aria-label={`Générer le PDF de ${name}`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FileText className="h-3.5 w-3.5" aria-hidden />}
        {busy ? "PDF…" : "PDF"}
      </Button>
    )
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-7 w-7 text-primary hover:text-primary"
      disabled={busy}
      onClick={run}
      title={`Générer le PDF de ${name}`}
      aria-label={`Générer le PDF de ${name}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FileText className="h-3.5 w-3.5" aria-hidden />}
    </Button>
  )
}
