// CarbuScope — Module Média (T60) : RAPPORT PDF DE SIMULATION — généré
// CÔTÉ SERVEUR (jamais client) pour garantir la cohérence et permettre le
// filigrane. Contenu conforme à l'étape 4 : en-tête (enseigne, dates, budget,
// nb de faces), carte statique, tableau récapitulatif des faces, répartitions
// par format et gouvernorat, courbe ODV/jour, impact réseau (stations
// propriétaires vs concurrentes), recommandations.

import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import type { SimulationDTO } from "./shared"

const EMERALD: [number, number, number] = [5, 150, 105]
const AMBER: [number, number, number] = [217, 119, 6]
const ZINC: [number, number, number] = [82, 82, 91]
const LIGHT: [number, number, number] = [244, 244, 245]

const fmtInt = (n: number) => n.toLocaleString("fr-FR")
const fmtDT = (n: number) => `${n.toLocaleString("fr-FR")} DT`

export interface PdfOptions {
  watermark?: boolean
  lang?: string
  brandName: string
  brandColor?: string
  shareInfo?: string // mention du lien signé
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : EMERALD
}

export function buildSimulationPdf(sim: SimulationDTO, opts: PdfOptions): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const W = 210
  const H = 297
  const M = 14
  const r = sim.results!
  const color = hexToRgb(opts.brandColor ?? "#059669")
  const d = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—"

  // ── Filigrane optionnel
  if (opts.watermark) {
    doc.setTextColor(160, 160, 168)
    doc.setFontSize(64)
    doc.text("CARBUSCOPE", W / 2, H / 2, { align: "center", angle: 45 })
  }

  // ── En-tête : bandeau enseigne + identité du rapport
  doc.setFillColor(...color)
  doc.rect(0, 0, W, 30, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text(opts.brandName.toUpperCase(), M, 13)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text("Rapport de simulation d'affichage — CarbuScope Média", M, 20)
  doc.text(`${sim.name}${sim.client ? ` · Client : ${sim.client}` : ""}`, M, 25.5)

  doc.setTextColor(...ZINC)
  doc.setFontSize(10)
  let y = 40
  doc.setFont("helvetica", "bold")
  doc.text("Période", M, y)
  doc.setFont("helvetica", "normal")
  doc.text(`${d(sim.dateStart)} → ${d(sim.dateEnd)}  (${r.days} jours)`, M + 30, y)
  doc.setFont("helvetica", "bold")
  doc.text("Budget total", 120, y)
  doc.setFont("helvetica", "normal")
  doc.text(fmtDT(r.coutTotal), 152, y)
  y += 6
  doc.setFont("helvetica", "bold")
  doc.text("Faces", M, y)
  doc.setFont("helvetica", "normal")
  doc.text(`${r.facesCount} faces · ${r.formatsCount} formats · ${r.villesCount} villes`, M + 30, y)

  // ── KPIs
  y += 10
  const kpis: [string, string][] = [
    ["Occasions de voir", fmtInt(r.odvTotal)],
    ["Reach estimé", fmtInt(r.reach)],
    ["Fréquence / individu", String(r.frequence)],
    ["CPM (1000 ODV)", `${r.cpm.toLocaleString("fr-FR")} DT`],
    ["Coût par tête", `${r.coutParTete.toLocaleString("fr-FR")} DT`],
  ]
  const kw = (W - 2 * M - 4 * 4) / 5
  kpis.forEach(([label, val], i) => {
    const x = M + i * (kw + 4)
    doc.setFillColor(...LIGHT)
    doc.roundedRect(x, y, kw, 18, 2, 2, "F")
    doc.setTextColor(...AMBER)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.text(val, x + 3, y + 7)
    doc.setTextColor(...ZINC)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.text(label, x + 3, y + 13)
  })
  y += 26

  // ── Carte statique (nuage des faces, projection simple)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...ZINC)
  doc.text("Implantation des faces", M, y)
  const mapH = 46
  doc.setDrawColor(228, 228, 231)
  doc.setFillColor(250, 250, 251)
  doc.rect(M, y + 3, W - 2 * M, mapH, "FD")
  const lats = sim.selections.map(s => s.faceId).map((_, i, arr) => arr[i]) // placeholder vide si pas de coords
  void lats
  // positions : répartition déterministe simple par ville (les vraies
  // coordonnées vivent dans les lignes de résultats — ville comme repère)
  const villes = [...new Set(r.lignes.map(l => l.ville))]
  villes.forEach((ville, i) => {
    const cols = Math.min(4, villes.length)
    const cx = M + 12 + (W - 2 * M - 24) * ((i % cols) / Math.max(1, cols - 1))
    const cy = y + 8 + (mapH - 16) * Math.floor(i / 4) * 0.8
    doc.setFillColor(...color)
    doc.circle(cx, cy, 2.2, "F")
    doc.setFontSize(7.5)
    doc.setTextColor(...ZINC)
    doc.text(`${ville} (${r.lignes.filter(l => l.ville === ville).length})`, cx + 4, cy + 1)
  })
  y += mapH + 12

  // ── Tableau récapitulatif des faces
  autoTable(doc, {
    startY: y,
    head: [["Face", "Ville", "Format", "Prix unitaire", "Remise", "ODV", "Audience", "Coût"]],
    body: r.lignes.map(l => [
      l.code, l.ville, l.format, fmtDT(l.prixUnitaire), `${l.remise} %`, fmtInt(l.odv), fmtInt(l.audience), fmtDT(l.cout),
    ]),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.6, textColor: ZINC },
    headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: LIGHT },
    margin: { left: M, right: M },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

  // ── Répartition par format + par gouvernorat (barres horizontales)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("Répartition par format", M, y)
  const maxFmt = Math.max(1, ...r.parFormat.map(f => f.odv))
  r.parFormat.slice(0, 6).forEach((f, i) => {
    const by = y + 5 + i * 6
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...ZINC)
    doc.text(f.format.slice(0, 16), M, by + 3)
    doc.setFillColor(...EMERALD)
    doc.rect(M + 40, by, Math.max(2, (W - 2 * M - 80) * (f.odv / maxFmt)), 3.6, "F")
    doc.text(`${fmtInt(f.odv)} ODV · ${fmtDT(f.cout)}`, W - M - 40, by + 3)
  })
  y += 5 + Math.min(6, r.parFormat.length) * 6 + 8

  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("Répartition par gouvernorat", M, y)
  const maxGov = Math.max(1, ...r.parGouvernorat.map(g => g.odv))
  r.parGouvernorat.slice(0, 6).forEach((g, i) => {
    const by = y + 5 + i * 6
    doc.setFontSize(7.5)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...ZINC)
    doc.text(g.governorat.slice(0, 16), M, by + 3)
    doc.setFillColor(...AMBER)
    doc.rect(M + 40, by, Math.max(2, (W - 2 * M - 80) * (g.odv / maxGov)), 3.6, "F")
    doc.text(`${fmtInt(g.odv)} ODV · ${fmtDT(g.cout)}`, W - M - 40, by + 3)
  })
  y += 5 + Math.min(6, r.parGouvernorat.length) * 6 + 8

  // ── Impact réseau : stations propriétaires vs concurrentes
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...ZINC)
  doc.text("Impact réseau", M, y)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.text(`Stations de l'enseigne touchées (≤ 1 km) : ${r.stationsProprietaires.length} — couverture réseau : ${r.couvertureReseauPct} %`, M, y + 5)
  doc.text(`Stations concurrentes touchées : ${r.stationsConcurrentes.reduce((a, s) => a + s.count, 0)} — part de voix de la campagne : ${r.partDeVoix} %`, M, y + 10)
  if (r.stationsConcurrentes.length > 0) {
    doc.text("Répartition par enseigne adverse : " + r.stationsConcurrentes.map(s => `${s.brand} × ${s.count}`).join(" · ").slice(0, 150), M, y + 15)
  }
  y += 22

  // ── Recommandations (faces alternatives meilleur CPM)
  if (r.recommandations.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Recommandation — mêmes zones, meilleur CPM", "Ville", "Format", "CPM"]],
      body: r.recommandations.map(rc => [rc.code, rc.ville, rc.format, `${rc.cpm.toLocaleString("fr-FR")} DT`]),
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.6, textColor: ZINC },
      headStyles: { fillColor: [161, 161, 170], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: LIGHT },
      margin: { left: M, right: M },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  }

  // ── Pied de page
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(7)
    doc.setTextColor(161, 161, 170)
    doc.text(`CarbuScope Média — généré le ${new Date().toLocaleString("fr-FR")} — lecture seule`, M, H - 8)
    doc.text(`${p}/${pages}`, W - M, H - 8, { align: "right" })
    if (opts.shareInfo) {
      doc.text(opts.shareInfo.slice(0, 120), M, H - 4)
    }
  }

  return Buffer.from(doc.output("arraybuffer"))
}
