"use client"

// Shadow Market (T45-b) — générateurs PDF RÉELS (jsPDF) des rapports du module.
// Quatre sorties, toutes habillées en rouge métier #E53935 sur le socle commun
// src/lib/report-pdf.ts (page de garde, sections, KPI, tableaux, puces, pied) :
//   1. downloadMonthlyShadowPdf   — rapport mensuel (blocs 1 à 6)
//   2. downloadBrandShadowPdf     — rapport « angle DG » par enseigne
//   3. downloadCustomShadowPdf    — rapport personnalisé (blocs sélectionnés)
//   4. downloadShadowSummaryPdf   — synthèse mensuelle (onglet Export / Partage)
// Chaque fonction renvoie { filename, sizeKb } (taille réelle du blob) pour
// tracer le journal des exports côté client.
//
// Rappel encodage : helvetica / WinAnsi — accents FR OK, aucun glyphe exotique
// (le socle assainit chaque chaîne via winAnsiSafe()).

import {
  bulletList,
  createReportPdf,
  finish,
  kpiGrid,
  paragraph,
  pdfStamp,
  sectionTitle,
  table,
  type PdfKpi,
  type ReportPdf,
} from "@/lib/report-pdf"
import { formatTnd, levelFromLoss, LEVEL_LABELS } from "../shadow-shared"
import type {
  ShadowBrandLossDTO,
  ShadowGovLossDTO,
  ShadowLevel,
  ShadowMapStationDTO,
  ShadowReportsResponse,
} from "@/lib/types"
import { govLossesForBrandStations, monthlySynthesis, topGov } from "./report-utils"
import type { PaperGov, PaperKpi, PaperThreat, PaperTypo } from "./report-paper"

// ---------------------------------------------------------------------------
// Constantes métier (miroir du modèle serveur — documentées dans l'UI)
// ---------------------------------------------------------------------------

const SHADOW_RED = "#E53935"
const M2LJ = 30.4 // jours moyen par mois (convention de calcul)

export type ShadowPdfResult = { filename: string; sizeKb: number }

/** Ligne « menace » commune aux sources de données (API ou assemblage client). */
type ThreatLike = {
  name: string
  brandName: string
  gouvernorat: string
  points: number
  volumeStolenLJ: number
  lossTnd: number
  level: ShadowLevel
}

const intFr = (n: number) => n.toLocaleString("fr-FR")
const lvl = (level: ShadowLevel) => LEVEL_LABELS[level] ?? String(level)

/** Note méthodologique (puces du bloc final) — marge paramétrable (config). */
function methodBullets(marginTndPerL = 0.19): string[] {
  const marge = marginTndPerL.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  return [
    `Perte mensuelle estimée = volume capté (L/j) x marge ${marge} DT/L x ${M2LJ.toString().replace(".", ",")} jours (mois moyen).`,
    "Chaque point informel est attribué aux 3 stations formelles les plus proches (plafond : la somme des taux de capture reste <= 100 %).",
    "Niveau de menace : Critique >= 20 000 DT/mois, Modéré >= 5 000 DT/mois, Vigilance en dessous (seuils paramétrables en Super Administration).",
    "Source : recensement terrain continu du module Shadow Market (auditeurs + contrôleurs mobiles), consolidation mensuelle des statistiques.",
  ]
}

// ---------------------------------------------------------------------------
// Blocs communs de composition
// ---------------------------------------------------------------------------

function writeSynthesis(pdf: ReportPdf, synthesis: string[]): void {
  sectionTitle(pdf, "1. Synthèse")
  for (const p of synthesis.slice(0, 4)) paragraph(pdf, p)
}

function writeKpis(pdf: ReportPdf, kpis: PdfKpi[], title = "2. Indicateurs clés"): void {
  if (!kpis.length) return
  sectionTitle(pdf, title)
  kpiGrid(pdf, kpis)
}

function writeThreatTable(pdf: ReportPdf, threats: ThreatLike[], title: string): void {
  if (!threats.length) return
  sectionTitle(pdf, title)
  table(pdf, {
    head: ["#", "Station", "Enseigne", "Gouvernorat", "Points", "L/j volés", "Perte/mois", "Niveau"],
    body: threats.slice(0, 10).map((t, i) => [
      i + 1,
      t.name,
      t.brandName,
      t.gouvernorat,
      t.points,
      intFr(t.volumeStolenLJ),
      formatTnd(t.lossTnd),
      lvl(t.level),
    ]),
    colStyles: {
      0: { halign: "center", cellWidth: 8 },
      1: { cellWidth: 43 },
      2: { cellWidth: 26 },
      3: { cellWidth: 28 },
      4: { halign: "right", cellWidth: 13 },
      5: { halign: "right", cellWidth: 19 },
      6: { halign: "right", cellWidth: 25 },
      7: { cellWidth: 20 },
    },
  })
}

/** Tableau « perte par gouvernorat » (source API : colonnes complètes). */
function writeGovLossTable(pdf: ReportPdf, gov: ShadowGovLossDTO[], title: string): void {
  if (!gov.length) return
  sectionTitle(pdf, title)
  table(pdf, {
    head: ["Gouvernorat", "Points", "Volume L/j", "Perte/mois", "Stations menacées", "Niveau"],
    body: gov.slice(0, 12).map((g) => [
      g.gouvernorat,
      g.points,
      intFr(g.volumeLJ),
      formatTnd(g.lossTnd),
      g.stationsThreatened,
      lvl(g.level),
    ]),
    colStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  })
}

/** Tableau « perte par gouvernorat » (forme papier : points / perte / niveau). */
function writePaperGovTable(pdf: ReportPdf, gov: PaperGov[], title: string): void {
  if (!gov.length) return
  sectionTitle(pdf, title)
  table(pdf, {
    head: ["Gouvernorat", "Points informels", "Perte/mois", "Niveau"],
    body: gov.slice(0, 12).map((g) => [g.gouvernorat, g.points, formatTnd(g.lossTnd), lvl(g.level)]),
    colStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  })
}

function writeRecommendations(pdf: ReportPdf, items: string[], title = "Recommandations"): void {
  if (!items.length) return
  sectionTitle(pdf, title)
  bulletList(pdf, items)
}

function writeMethodNote(pdf: ReportPdf, marginTndPerL = 0.19): void {
  sectionTitle(pdf, "Note méthodologique")
  bulletList(pdf, methodBullets(marginTndPerL), { size: 8.5 })
}

// ---------------------------------------------------------------------------
// 1 — Rapport mensuel (blocs 1 à 6)
// ---------------------------------------------------------------------------

export function downloadMonthlyShadowPdf(
  reports: ShadowReportsResponse,
  scopeLabel: string,
): ShadowPdfResult {
  const pdf = createReportPdf({
    title: "Shadow Market — Rapport Mensuel",
    subtitle: `Périmètre ${scopeLabel} · ${reports.monthLabel}`,
    brandColor: SHADOW_RED,
    classification: "Diffusion restreinte",
    metaLines: [
      `Points actifs : ${intFr(reports.summary.activePoints)} · Perte estimée : ${formatTnd(reports.summary.estLossTnd)}/mois`,
      `Stations menacées : ${reports.summary.stationsThreatened} · En attente de validation : ${reports.summary.pendingValidation}`,
    ],
  })
  writeSynthesis(pdf, monthlySynthesis(reports))
  writeKpis(pdf, [
    { label: "Points actifs", value: intFr(reports.summary.activePoints), sub: "vendeurs clandestins recensés" },
    { label: "Perte mensuelle estimée", value: formatTnd(reports.summary.estLossTnd), sub: "marge du réseau formel" },
    { label: "Stations menacées", value: intFr(reports.summary.stationsThreatened), sub: "cannibalisation mesurable" },
    { label: "Nouveaux / neutralisés", value: `+${reports.summary.newPoints} / -${reports.summary.neutralized}`, sub: "ce mois" },
  ])
  writeThreatTable(pdf, reports.topThreats, "3. Top 10 menaces — stations")
  writeGovLossTable(pdf, topGov(reports.govLosses, 12), "4. Perte estimée par gouvernorat (top 12)")
  writeRecommendations(pdf, reports.recommendations, "5. Recommandations")
  writeMethodNote(pdf)
  return finish(pdf, `shadow-rapport-mensuel-${reports.month}.pdf`)
}

// ---------------------------------------------------------------------------
// 2 — Rapport par enseigne (« angle DG »)
// ---------------------------------------------------------------------------

export function downloadBrandShadowPdf(args: {
  brand: ShadowBrandLossDTO
  nationalLossTnd: number
  nationalPoints: number
  redStations: number
  /** Stations menacées de l'enseigne, triées par perte décroissante. */
  stations: ShadowMapStationDTO[]
  marginTndPerL: number
  /** Seuils de niveau (config module) pour le tableau gouvernorat. */
  lossRedTnd?: number
  lossOrangeTnd?: number
  synthesis: string[]
  recommendations: string[]
  scopeLabel: string
  monthLabel: string
}): ShadowPdfResult {
  const { brand, stations, marginTndPerL } = args
  const pdf = createReportPdf({
    title: "Shadow Market — Rapport par Enseigne",
    subtitle: `${brand.brandName} · ${args.monthLabel} · périmètre ${args.scopeLabel}`,
    brandColor: SHADOW_RED,
    classification: "Diffusion restreinte — direction générale",
    metaLines: [
      `Part du préjudice national : ${brand.sharePct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`,
      `Repère national : ${formatTnd(args.nationalLossTnd)}/mois · ${intFr(args.nationalPoints)} points actifs`,
    ],
  })
  writeSynthesis(pdf, args.synthesis)
  // Carte d'identité de l'enseigne
  writeKpis(pdf, [
    { label: "Perte de l'enseigne", value: formatTnd(brand.lossTnd), sub: "marge / mois" },
    { label: "Part du préjudice national", value: `${brand.sharePct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`, sub: "toutes enseignes" },
    { label: "Stations menacées", value: intFr(brand.stationsThreatened), sub: `dont ${args.redStations} critiques` },
    { label: "Points ciblant l'enseigne", value: intFr(brand.points), sub: "informels actifs" },
  ], "2. Carte d'identité de l'enseigne")
  paragraph(
    pdf,
    `Chiffres isolés de ${brand.brandName} : chaque valeur ci-dessus ne concerne que votre enseigne — le repère national (${formatTnd(args.nationalLossTnd)}/mois) sert uniquement de contexte.`,
    { size: 8.5, muted: true },
  )
  const threats: ThreatLike[] = stations.slice(0, 10).map((s) => ({
    name: s.name,
    brandName: s.brandName,
    gouvernorat: s.gouvernorat,
    points: s.points,
    volumeStolenLJ: Math.round(s.lossTnd / (marginTndPerL * M2LJ)),
    lossTnd: Math.round(s.lossTnd),
    level: s.level,
  }))
  writeThreatTable(pdf, threats, `3. Vos stations les plus menacées — ${brand.brandName}`)
  const brandGov: PaperGov[] = govLossesForBrandStations(stations).slice(0, 12).map((g) => ({
    gouvernorat: g.gouvernorat,
    points: g.points,
    lossTnd: Math.round(g.lossTnd),
    level: levelFromLoss(g.lossTnd, args.lossRedTnd ?? 20000, args.lossOrangeTnd ?? 5000),
  }))
  writePaperGovTable(pdf, brandGov, "4. Votre perte par gouvernorat")
  writeRecommendations(pdf, args.recommendations, "5. Recommandations")
  writeMethodNote(pdf, marginTndPerL)
  return finish(pdf, `shadow-rapport-enseigne-${brand.brandSlug}-${pdfStamp()}.pdf`)
}

// ---------------------------------------------------------------------------
// 3 — Rapport personnalisé (uniquement les blocs sélectionnés)
// ---------------------------------------------------------------------------

export function downloadCustomShadowPdf(args: {
  subtitle: string
  synthesis: string[]
  kpis: PaperKpi[]
  threats: PaperThreat[] | null
  gov: PaperGov[] | null
  typologies: PaperTypo[] | null
  recommendations: string[] | null
  from: string
  to: string
}): ShadowPdfResult {
  const pdf = createReportPdf({
    title: "Shadow Market — Rapport Personnalisé",
    subtitle: args.subtitle,
    brandColor: SHADOW_RED,
    classification: "Diffusion restreinte",
    metaLines: [`Période analysée : du ${args.from} au ${args.to}`, "Assemblage à la demande — seuls les indicateurs choisis figurent dans ce document"],
  })
  writeSynthesis(pdf, args.synthesis)
  writeKpis(pdf, args.kpis)
  let n = 3
  if (args.threats?.length) {
    writeThreatTable(pdf, args.threats, `${n}. Top menaces du périmètre`)
    n += 1
  }
  if (args.gov?.length) {
    writePaperGovTable(pdf, args.gov, `${n}. Perte estimée par gouvernorat`)
    n += 1
  }
  if (args.typologies?.length) {
    sectionTitle(pdf, `${n}. Typologies des points recensés`)
    table(pdf, {
      head: ["Typologie", "Points", "Part"],
      body: args.typologies.map((t) => [t.label, t.count, `${t.pct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`]),
      colStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    })
    n += 1
  }
  if (args.recommendations?.length) {
    writeRecommendations(pdf, args.recommendations, `${n}. Recommandations`)
    n += 1
  }
  writeMethodNote(pdf)
  return finish(pdf, `shadow-rapport-personnalise-${args.from}_${args.to}.pdf`)
}

// ---------------------------------------------------------------------------
// 4 — Synthèse mensuelle (onglet Export / Partage : blocs 1, 2 et 5)
// ---------------------------------------------------------------------------

export function downloadShadowSummaryPdf(
  reports: ShadowReportsResponse,
  scopeLabel: string,
): ShadowPdfResult {
  const pdf = createReportPdf({
    title: "Shadow Market — Synthèse Mensuelle",
    subtitle: `Périmètre ${scopeLabel} · ${reports.monthLabel}`,
    brandColor: SHADOW_RED,
    classification: "Diffusion restreinte",
    metaLines: [`Gouvernorat le plus touché : ${reports.summary.topGouvernorat || "—"}`],
  })
  writeSynthesis(pdf, monthlySynthesis(reports))
  writeKpis(pdf, [
    { label: "Points actifs", value: intFr(reports.summary.activePoints), sub: "vendeurs clandestins recensés" },
    { label: "Perte mensuelle estimée", value: formatTnd(reports.summary.estLossTnd), sub: "marge du réseau formel" },
    { label: "Stations menacées", value: intFr(reports.summary.stationsThreatened), sub: "cannibalisation mesurable" },
    { label: "Nouveaux / neutralisés", value: `+${reports.summary.newPoints} / -${reports.summary.neutralized}`, sub: "ce mois" },
  ])
  writeRecommendations(pdf, reports.recommendations, "5. Recommandations")
  writeMethodNote(pdf)
  return finish(pdf, `shadow-synthese-${pdfStamp()}.pdf`)
}
