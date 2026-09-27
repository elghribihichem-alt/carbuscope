"use client"

// CarbuScope (T45-b) — socle de composition de rapports PDF côté client.
// Réutilisé par les rapports B2B (A.8, émeraude) et les rapports Shadow Market
// (rouge #E53935). Construit sur jsPDF + jspdf-autotable (déjà installés et
// utilisés par lib/demographie-io.ts — mêmes conventions d'habillage).
//
// IMPORTANT : module CLIENT UNIQUEMENT — ne l'importez que depuis des composants
// 'use client' (jsPDF touche le navigateur : doc.save(), Blob, URL).
//
// Polices standard helvetica : accents FR OK (WinAnsi), mais aucun glyphe hors
// WinAnsi (pas de flèches, pas de chiffres cerclés) → winAnsiSafe() nettoie.

import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import type { UserOptions } from "jspdf-autotable"

// ---------------------------------------------------------------------------
// Constantes de mise en page (A4 portrait, mm)
// ---------------------------------------------------------------------------

const PAGE_W = 210
const PAGE_H = 297
const MARGIN_X = 14
const CONTENT_W = PAGE_W - 2 * MARGIN_X // 182
const TOP_Y = 20 // haut de contenu pages 2+
const BREAK_Y = 272 // saut de page avant le pied de page
const FOOTER_LINE_Y = 287.5
const FOOTER_TEXT_Y = 291.5

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

/** Curseur vertical partagé : `pdf.cursor.y` avance à mesure du rendu. */
export type PdfCursor = { y: number }

export type PdfTheme = {
  /** Couleur de marque (bandeau, filets, sous-lignage). */
  brand: [number, number, number]
  /** Fond d'en-tête des tableaux (nuance sombre de la marque). */
  head: [number, number, number]
  /** Teinte très claire de marque (fonds KPI). */
  tint: [number, number, number]
  zebra: [number, number, number]
  text: [number, number, number]
  muted: [number, number, number]
  hairline: [number, number, number]
}

export type ReportPdf = {
  doc: jsPDF
  cursor: PdfCursor
  theme: PdfTheme
  meta: { title: string; filenameBase: string }
}

export type CreateReportPdfOptions = {
  /** Titre principal du rapport (grand, sous le bandeau). */
  title: string
  /** Sous-titre : périmètre / période. */
  subtitle?: string
  /** Mention de classification (défaut « Diffusion restreinte »). */
  classification?: string
  /** Couleur de marque hex — défaut émeraude #059669 (PAS de bleu). */
  brandColor?: string
  /** Lignes de métadonnées complémentaires (ex. « Enseigne : Agil »). */
  metaLines?: string[]
}

export type PdfKpi = { label: string; value: string; sub?: string }

export type PdfTableDef = {
  head: string[]
  body: (string | number)[][]
  /** Styles par colonne (index) : alignement / largeur. */
  colStyles?: Record<number, { halign?: "left" | "center" | "right"; cellWidth?: number | "auto" }>
  /** Indentation de police du corps (8 par défaut). */
  fontSize?: number
}

// ---------------------------------------------------------------------------
// Petits utilitaires couleur / texte
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]

const WHITE: [number, number, number] = [255, 255, 255]
const BLACK: [number, number, number] = [0, 0, 0]

/** Remplace les glyphes absents de WinAnsi (flèches, inégalités, chiffres cerclés…)
 *  et normalise les espaces fines insécables (séparateur de milliers fr-FR) en
 *  espace classique — sinon jsPDF les encode en glyphes illisibles. */
function winAnsiSafe(s: string): string {
  return String(s ?? "")
    .replace(/[\u2192\u21D2]/g, "->")
    .replace(/[\u2190]/g, "<-")
    .replace(/\u2265/g, ">=")
    .replace(/\u2264/g, "<=")
    .replace(/\u2260/g, "!=")
    .replace(/\u2248/g, "~")
    .replace(/[\u2460-\u2469]/g, (d) => `${d.charCodeAt(0) - 0x2460 + 1}. `)
    .replace(/[\u2776-\u277f]/g, (d) => `${d.charCodeAt(0) - 0x2776 + 1}. `)
    .replace(/\u2011/g, "-")
    .replace(/[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000]/g, " ")
}

/** Horodatage ISO court pour noms de fichiers : 2026-09-26. */
export function pdfStamp(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

function makeTheme(brandColor: string): PdfTheme {
  const brand = hexToRgb(brandColor) ?? hexToRgb("#059669")!
  return {
    brand,
    head: mix(brand, BLACK, 0.32),
    tint: mix(brand, WHITE, 0.92),
    zebra: [246, 247, 245],
    text: [41, 37, 36],
    muted: [113, 113, 122],
    hairline: [226, 232, 240],
  }
}

// ---------------------------------------------------------------------------
// Création — page de garde stylisée + thème
// ---------------------------------------------------------------------------

/** Date FR lisible : « 26 septembre 2026 à 23:46 ». */
function dateFr(d = new Date()): string {
  return d.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })
}

/**
 * Crée le document A4 portrait + la page de garde (bandeau coloré, « CarbuScope »,
 * titre, sous-titre, métadonnées, date FR, mention de classification, filet).
 * Retourne { doc, cursor } — le contenu suit le bloc de garde sur la page 1.
 */
export function createReportPdf(opts: CreateReportPdfOptions): ReportPdf {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const theme = makeTheme(opts.brandColor ?? "#059669")
  const pdf: ReportPdf = { doc, cursor: { y: 0 }, theme, meta: { title: opts.title, filenameBase: "carbuscope-rapport" } }

  // --- Bandeau supérieur coloré ---
  doc.setFillColor(...theme.brand)
  doc.rect(0, 0, PAGE_W, 27, "F")
  // Liseré sombre sous le bandeau (filet décoratif)
  doc.setFillColor(...theme.head)
  doc.rect(0, 27, PAGE_W, 1.4, "F")

  doc.setTextColor(...WHITE)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(17)
  doc.text(winAnsiSafe("CarbuScope"), MARGIN_X, 12.5)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.text("Observatoire du marché du carburant - Tunisie", MARGIN_X, 18.5)

  const classification = winAnsiSafe(opts.classification ?? "Diffusion restreinte")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.text(classification.toUpperCase(), PAGE_W - MARGIN_X, 12.5, { align: "right" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.text("Document interne", PAGE_W - MARGIN_X, 18.5, { align: "right" })

  // --- Titre principal (jusqu'à 2 lignes) ---
  let y = 42
  doc.setTextColor(...theme.text)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  const titleLines = doc.splitTextToSize(winAnsiSafe(opts.title), CONTENT_W).slice(0, 2) as string[]
  for (const line of titleLines) {
    doc.text(line, MARGIN_X, y)
    y += 9
  }

  // --- Sous-titre (périmètre / période) ---
  if (opts.subtitle) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(11)
    doc.setTextColor(...theme.brand)
    const sub = doc.splitTextToSize(winAnsiSafe(opts.subtitle), CONTENT_W).slice(0, 2) as string[]
    for (const line of sub) {
      doc.text(line, MARGIN_X, y + 1)
      y += 6
    }
    y += 2
  }

  // --- Filet décoratif (double trait : épais marque + fin gris) ---
  y += 3
  doc.setDrawColor(...theme.brand)
  doc.setLineWidth(1.1)
  doc.line(MARGIN_X, y, MARGIN_X + 34, y)
  doc.setDrawColor(...theme.hairline)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_X + 38, y, PAGE_W - MARGIN_X, y)
  y += 8

  // --- Métadonnées complémentaires ---
  if (opts.metaLines?.length) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...theme.muted)
    for (const raw of opts.metaLines.slice(0, 4)) {
      const lines = doc.splitTextToSize(winAnsiSafe(raw), CONTENT_W).slice(0, 2) as string[]
      for (const line of lines) {
        doc.text(line, MARGIN_X, y)
        y += 5
      }
    }
    y += 2
  }

  // --- Date de génération + rappel classification (petit) ---
  doc.setFontSize(8)
  doc.setTextColor(...theme.muted)
  doc.text(`Généré le ${dateFr()}`, MARGIN_X, y)
  doc.text(classification, PAGE_W - MARGIN_X, y, { align: "right" })
  y += 4

  pdf.cursor.y = Math.max(y + 6, 92)
  return pdf
}

// ---------------------------------------------------------------------------
// Gestion du saut de page
// ---------------------------------------------------------------------------

/** Ajoute une page si le curseur dépasse BREAK_Y (marge basse réservée au pied). */
export function checkPage(pdf: ReportPdf, needed = 12): void {
  if (pdf.cursor.y + needed > BREAK_Y) {
    pdf.doc.addPage()
    pdf.cursor.y = TOP_Y
  }
}

// ---------------------------------------------------------------------------
// Blocs de composition
// ---------------------------------------------------------------------------

/** Titre de section : libellé gras + sous-lignage coloré court. */
export function sectionTitle(pdf: ReportPdf, label: string): void {
  const { doc, theme } = pdf
  checkPage(pdf, 22)
  const y = pdf.cursor.y
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(...theme.text)
  doc.text(winAnsiSafe(label), MARGIN_X, y + 4)
  doc.setFillColor(...theme.brand)
  doc.rect(MARGIN_X, y + 6.4, 26, 1.1, "F")
  doc.setFillColor(...theme.head)
  doc.rect(MARGIN_X + 28, y + 6.9, 5, 0.5, "F")
  pdf.cursor.y = y + 13
}

/** Grille de KPI 2 colonnes encadrées (valeur en gras, libellé, sous-libellé). */
export function kpiGrid(pdf: ReportPdf, kpis: PdfKpi[]): void {
  const { doc, theme } = pdf
  const cols = 2
  const gap = 5
  const cardW = (CONTENT_W - gap * (cols - 1)) / cols
  const cardH = 20
  const shown = kpis.slice(0, 12)
  shown.forEach((k, i) => {
    if (i % cols === 0) checkPage(pdf, cardH + 3)
    const col = i % cols
    const x = MARGIN_X + col * (cardW + gap)
    const y = pdf.cursor.y
    // Encadré : fond teinté marque + bordure fine + barre de marque à gauche
    doc.setFillColor(...theme.tint)
    doc.setDrawColor(...theme.hairline)
    doc.setLineWidth(0.25)
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD")
    doc.setFillColor(...theme.brand)
    doc.rect(x, y + 2, 1.6, cardH - 4, "F")

    doc.setFont("helvetica", "bold")
    doc.setFontSize(12.5)
    doc.setTextColor(...theme.text)
    doc.text(winAnsiSafe(k.value), x + 6, y + 7.5)

    doc.setFont("helvetica", "bold")
    doc.setFontSize(6.8)
    doc.setTextColor(...theme.muted)
    doc.text(winAnsiSafe(k.label).toUpperCase(), x + 6, y + 12.5)

    if (k.sub) {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7)
      doc.setTextColor(...theme.muted)
      const sub = (doc.splitTextToSize(winAnsiSafe(k.sub), cardW - 10) as string[]).slice(0, 1)
      for (const line of sub) doc.text(line, x + 6, y + 16.5)
    }
    if (i % cols === cols - 1 || i === shown.length - 1) pdf.cursor.y = y + cardH + gap
  })
  pdf.cursor.y += 1
}

/** Tableau autoTable stylé : head sombre, zébrures légères, tailles 8-9. */
export function table(pdf: ReportPdf, def: PdfTableDef): void {
  const { doc, theme } = pdf
  const body = def.body.map((row) => row.map((c) => winAnsiSafe(c === null || c === undefined ? "-" : String(c))))
  const columnStyles: NonNullable<UserOptions["columnStyles"]> = {}
  for (const [idx, style] of Object.entries(def.colStyles ?? {})) {
    columnStyles[idx] = { halign: style.halign, cellWidth: style.cellWidth }
  }
  autoTable(doc, {
    startY: pdf.cursor.y,
    head: [def.head.map((h) => winAnsiSafe(h))],
    body,
    margin: { left: MARGIN_X, right: MARGIN_X, top: TOP_Y, bottom: PAGE_H - FOOTER_LINE_Y + 1 },
    styles: {
      fontSize: def.fontSize ?? 8,
      cellPadding: 1.7,
      lineColor: theme.hairline,
      lineWidth: 0.15,
      textColor: theme.text,
    },
    headStyles: { fillColor: theme.head, textColor: WHITE, fontStyle: "bold", fontSize: def.fontSize ?? 8 },
    alternateRowStyles: { fillColor: theme.zebra },
    columnStyles,
  })
  const finalY = (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
  pdf.cursor.y = (typeof finalY === "number" ? finalY : pdf.cursor.y) + 7
}

/** Liste à puces (recommandations / points de vigilance) avec repli de ligne. */
export function bulletList(pdf: ReportPdf, items: string[], opts?: { size?: number; marker?: string }): void {
  const { doc, theme } = pdf
  const size = opts?.size ?? 9
  const marker = opts?.marker ?? "•"
  const indent = 5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(size)
  const lineH = size * 1.38 * 0.3528
  for (const raw of items.slice(0, 24)) {
    const lines = doc.splitTextToSize(winAnsiSafe(raw), CONTENT_W - indent) as string[]
    checkPage(pdf, lineH * Math.min(lines.length, 3) + 2)
    doc.setTextColor(...theme.brand)
    doc.setFont("helvetica", "bold")
    doc.text(marker, MARGIN_X, pdf.cursor.y)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...theme.text)
    lines.slice(0, 8).forEach((line, i) => {
      if (i > 0 && pdf.cursor.y + lineH > BREAK_Y) checkPage(pdf, lineH)
      doc.text(line, MARGIN_X + indent, pdf.cursor.y)
      pdf.cursor.y += lineH
    })
    pdf.cursor.y += 1.6
  }
  pdf.cursor.y += 1
}

/** Paragraphe multi-lignes (splitTextToSize). */
export function paragraph(
  pdf: ReportPdf,
  text: string,
  opts?: { size?: number; bold?: boolean; muted?: boolean },
): void {
  const { doc, theme } = pdf
  const size = opts?.size ?? 9.5
  const lineH = size * 1.42 * 0.3528
  doc.setFont("helvetica", opts?.bold ? "bold" : "normal")
  doc.setFontSize(size)
  doc.setTextColor(...(opts?.muted ? theme.muted : theme.text))
  const lines = doc.splitTextToSize(winAnsiSafe(text), CONTENT_W) as string[]
  for (const line of lines.slice(0, 40)) {
    checkPage(pdf, lineH)
    doc.text(line, MARGIN_X, pdf.cursor.y)
    pdf.cursor.y += lineH
  }
  pdf.cursor.y += 2.5
}

// ---------------------------------------------------------------------------
// Finalisation — pied de page « page N/M » + téléchargement
// ---------------------------------------------------------------------------

export type PdfFinishResult = { filename: string; sizeKb: number }

/**
 * Grave le pied de page sur TOUTES les pages (« Généré par CarbuScope — page N/M »,
 * total résolu via getNumberOfPages), enregistre le fichier et renvoie sa taille
 * réelle (Ko) — utile pour tracer le journal des exports.
 */
export function finish(pdf: ReportPdf, filename: string): PdfFinishResult {
  const { doc, theme } = pdf
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setDrawColor(...theme.hairline)
    doc.setLineWidth(0.2)
    doc.line(MARGIN_X, FOOTER_LINE_Y, PAGE_W - MARGIN_X, FOOTER_LINE_Y)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...theme.muted)
    doc.text("Généré par CarbuScope", MARGIN_X, FOOTER_TEXT_Y)
    doc.text(`page ${p}/${total}`, PAGE_W - MARGIN_X, FOOTER_TEXT_Y, { align: "right" })
  }
  const blob = doc.output("blob")
  doc.save(filename)
  return { filename, sizeKb: Math.max(1, Math.round(blob.size / 1024)) }
}
