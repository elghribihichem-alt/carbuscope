"use client"

// CarbuScope — T63-b : rapport PDF « Plan média — Panneaux publicitaires »
// (module Publicité du Portail enseigne). Composition sur le socle
// src/lib/report-pdf.ts (jsPDF + jspdf-autotable) — pattern T45-b/T61/T62-c.
// Accent PRUNE (couleur de marque passée au socle : #8f5570, harmonisée à la
// palette chaude, aucune pointe bleue).
//
// Contenu :
//   1. Synthèse (KPIs : faces, budget, flux cumulé, contacts, CPM moyen)
//   2. Registre des faces (tableau : code, format, emplacement, flux,
//      visibilité, tarif, statut)
//   3. Comparatif express (3 meilleures faces par CPM)
//   4. Recommandations générées des données (meilleur CPM, meilleure
//      visibilité, meilleur flux, budget cumulé)

import { toast } from "sonner"
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
} from "@/lib/report-pdf"

type PanelPdfRow = {
  id: string
  code: string
  nom: string
  format: string
  gouvernorat: string
  delegation: string
  axe: string
  flux: number
  visibilite: number
  illumination: boolean
  prixSemaine: number
  loueur: string
  statut: string
  reservePar: string | null
}

const FORMAT_LABEL: Record<string, string> = {
  "12x8": "Grand format 12×8",
  "4x3": "Panneau 4×3",
  dooh: "Écran DOOH",
  totem: "Totem station",
  abri: "Abri-bus",
}

const fmtInt = (n: number): string => new Intl.NumberFormat("fr-FR").format(Math.round(n))

const cpmOf = (p: PanelPdfRow): number => (p.flux > 0 ? (p.prixSemaine / (p.flux * 7)) * 1000 : 0)
const fmtCpm = (n: number): string => n > 0 ? n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "-"

function statutLabel(p: PanelPdfRow, mineBrand: string | null): string {
  if (p.statut === "LOUE") return "Engagé"
  if (p.statut === "RESERVE" && mineBrand && p.reservePar === mineBrand) return "Réservé (nous)"
  if (p.statut === "RESERVE") return "Réservé"
  return "Disponible"
}

export function downloadPanelsPdf(opts: {
  panels: PanelPdfRow[]
  myBrandName: string
  /** slug passé pour distinguer « Réservé par nous » — libellés de statut. */
  mineCount?: number
  filtersLabel: string
}): PdfFinishResult | null {
  const { panels, myBrandName, filtersLabel } = opts
  if (panels.length === 0) {
    toast.info("Rien à exporter", { description: "Aucune face dans le périmètre sélectionné." })
    return null
  }

  const budget = panels.reduce((s, p) => s + p.prixSemaine, 0)
  const fluxCumule = panels.reduce((s, p) => s + p.flux, 0)
  const contacts = fluxCumule * 7
  const cpmMoyen = contacts > 0 ? (budget / contacts) * 1000 : 0
  const dispo = panels.filter(p => p.statut === "DISPONIBLE").length

  const pdf = createReportPdf({
    title: "Plan média — Panneaux publicitaires",
    subtitle: "Registre d'affichage extérieur : choix d'emplacements, budgets et efficacité",
    metaLines: [
      `Enseigne : ${myBrandName}`,
      `Périmètre : ${filtersLabel} · ${panels.length} face${panels.length > 1 ? "s" : ""}`,
      `Gouvernorats couverts : ${[...new Set(panels.map(p => p.gouvernorat))].sort().join(", ")}`,
    ],
    classification: "Diffusion restreinte",
    brandColor: "#8f5570",
  })

  // --- 1. Synthèse ----------------------------------------------------------
  sectionTitle(pdf, "Synthèse du périmètre")
  kpiGrid(pdf, [
    { label: "Faces", value: String(panels.length), sub: `${dispo} disponible${dispo > 1 ? "s" : ""}` },
    { label: "Budget cumulé", value: `${fmtInt(budget)} DT`, sub: "HT / semaine" },
    { label: "Flux cumulé", value: `${fmtInt(fluxCumule)}`, sub: "véhicules / jour" },
    { label: "Contacts hebdo", value: fmtInt(contacts), sub: "flux × 7 jours" },
    { label: "CPM moyen", value: `${fmtCpm(cpmMoyen)} DT`, sub: "coût / 1 000 contacts" },
    { label: "Réservées par nous", value: String(opts.mineCount ?? 0), sub: "décisions déjà actées" },
  ])
  paragraph(
    pdf,
    `Ce plan média consolide ${panels.length} face${panels.length > 1 ? "s" : ""} d'affichage (${[...new Set(panels.map(p => FORMAT_LABEL[p.format] ?? p.format))].join(", ")}) ` +
      `pour un budget de ${fmtInt(budget)} DT HT par semaine, soit environ ${fmtInt(contacts)} contacts hebdomadaires cumulés ` +
      `(CPM moyen ${fmtCpm(cpmMoyen)} DT). Les statuts reflètent le registre partagé au moment de l'export.`,
  )

  // --- 2. Registre des faces ------------------------------------------------
  sectionTitle(pdf, "Registre des faces")
  table(pdf, {
    head: ["Code", "Format", "Emplacement", "Flux", "Visib.", "DT/sem", "Statut"],
    body: panels.slice(0, 60).map(p => [
      p.code,
      FORMAT_LABEL[p.format] ?? p.format,
      `${p.gouvernorat} · ${p.delegation}${p.axe ? ` — ${p.axe}` : ""}`,
      fmtInt(p.flux),
      `${p.visibilite}/100`,
      String(p.prixSemaine),
      statutLabel(p, null),
    ]),
    colStyles: {
      0: { halign: "left", cellWidth: 24 },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "left" },
    },
  })
  if (panels.length > 60) {
    paragraph(pdf, `Registre borné aux 60 premières faces (${panels.length} au total) — affinez vos filtres pour un périmètre plus resserré.`)
  }

  // --- 3. Comparatif express (top CPM) ---------------------------------------
  const topCpm = [...panels].sort((a, b) => cpmOf(a) - cpmOf(b)).slice(0, 3)
  if (topCpm.length > 0) {
    sectionTitle(pdf, "Top efficacité (CPM le plus bas)")
    table(pdf, {
      head: ["Code", "Emplacement", "Flux véh/j", "Visibilité", "DT/sem", "CPM"],
      body: topCpm.map(p => [
        p.code,
        `${p.gouvernorat} · ${p.delegation}`,
        fmtInt(p.flux),
        `${p.visibilite}/100`,
        String(p.prixSemaine),
        `${fmtCpm(cpmOf(p))} DT`,
      ]),
      colStyles: { 2: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    })
  }

  // --- 4. Recommandations -----------------------------------------------------
  sectionTitle(pdf, "Lecture et recommandations")
  const bestCpm = topCpm[0]
  const bestVis = [...panels].reduce((m, p) => (p.visibilite > m.visibilite ? p : m), panels[0])
  const bestFlux = [...panels].reduce((m, p) => (p.flux > m.flux ? p : m), panels[0])
  const dooh = panels.filter(p => p.format === "dooh")
  bulletList(pdf, [
    `Meilleure efficacité brute : ${bestCpm.code} (${bestCpm.gouvernorat}) — CPM ${fmtCpm(cpmOf(bestCpm))} DT pour ${fmtInt(bestCpm.flux)} véh/j.`,
    `Meilleure visibilité : ${bestVis.code} — score ${bestVis.visibilite}/100 sur l'axe « ${bestVis.axe} ».`,
    `Meilleur flux : ${bestFlux.code} — ${fmtInt(bestFlux.flux)} véh/j (${bestFlux.gouvernorat}).`,
    dooh.length > 0
      ? `${dooh.length} face${dooh.length > 1 ? "s" : ""} DOOH dans le périmètre : rotation créative possible (plusieurs visuels par face, animations programmables).`
      : "Aucune face DOOH dans le périmètre : les créatives statiques imposent un visuel unique par emplacement.",
    `Couverture géographique : ${[...new Set(panels.map(p => p.gouvernorat))].length} gouvernorat${[...new Set(panels.map(p => p.gouvernorat))].length > 1 ? "s" : ""} — vérifiez le recouvrement avec vos zones de campagne promotionnelle.`,
    `Budget total ${fmtInt(budget)} DT/sem — réservez les faces définitives depuis le module « Panneaux publicitaires » (chaque réservation est persistée et tracée).`,
  ])

  return finish(pdf, `carbuscope-plan-media-${pdfStamp()}`)
}
