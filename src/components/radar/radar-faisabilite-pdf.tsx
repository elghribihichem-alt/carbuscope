'use client'

// T55-B3-a — Études de faisabilité > « rapport » : composition du PDF (~20
// sections structurées, arbitrage n°6 : template V1 SANS IA). Tout le contenu
// provient des données RÉELLES du Radar (RadarZoneDTO via useRadarZones —
// aucune nouvelle donnée, aucun appel réseau) enrichies du moteur de formats
// et de la checklist réglementaire partagée avec l'onglet « reglement ».
// Socle jsPDF : src/lib/report-pdf.ts (habillage émeraude, autoTable,
// sauts de page). Pied de rapport : « Données Radar — génération template V1 ».

import {
  bulletList, createReportPdf, finish, kpiGrid, paragraph, pdfStamp, sectionTitle, table,
  type PdfFinishResult, type ReportPdf,
} from "@/lib/report-pdf"
import type { RadarZoneDTO } from "@/lib/radar-scoring"
import { num } from "@/lib/chart"
import {
  FORMAT_META, ROI_CONSTANTS, STAFF_ROLES, TIMELINE_STEPS, computeRoiAll, fmtSeuilMois,
  fmtDT, recommendFormat, staffTotals, timelineTotals, traficCaptif,
} from "./radar-formats-engine"
import { REGLEMENT_GROUPS } from "./radar-faisabilite-reglement"

/* ---------- Formatteurs locaux ---------- */

const intFr = (n: number) => num(n)
const pct1 = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`
const fmtMoisFR = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })

const PALIER_TEXT: Record<RadarZoneDTO["palier"], string> = {
  BLANCHE: "zone blanche (forte sous-équipement)",
  SOUS: "zone sous-équipée",
  EQUILIBREE: "zone équilibrée",
  DENSE: "zone dense en stations",
}

/* ---------- Aperçu écran : les ~20 sections résumées avant génération ---------- */

export interface ReportSectionPreview {
  title: string
  summary: string
}

export function buildReportSections(zone: RadarZoneDTO, brandName: string): ReportSectionPreview[] {
  const reco = recommendFormat(zone)
  const m = FORMAT_META[reco.format]
  const roi = computeRoiAll(zone).find(o => o.format === reco.format)!
  const tot = timelineTotals(reco.format)
  const dominant = zone.stationsByBrand[0]
  const motorisation = zone.population > 0 ? Math.round((zone.vehicles / zone.population) * 1000) : 0
  const trafic = traficCaptif(zone)

  return [
    { title: "Synthèse exécutive", summary: `${zone.gouvernorat} — score ${zone.score}/100, ${PALIER_TEXT[zone.palier]}. Format recommandé : ${m.label} (règle V1 : ${reco.rule}).` },
    { title: "Indicateurs clés", summary: `Parc ${intFr(zone.vehicles)} véh. · population ${intFr(zone.population)} hab. · ${intFr(zone.stationsTotal)} stations · TMJ ${zone.tmj > 0 ? intFr(zone.tmj) : "non recensé"} · ratio ${intFr(zone.ratio)} véh./station.` },
    { title: "Scoring détaillé — 5 critères", summary: `Parc ${zone.components.parc}/100 · pouvoir d'achat ${zone.components.ppa}/100 · trafic ${zone.components.traffic}/100 · concurrence ${zone.components.compet}/100 · foncier ${zone.components.land}/100 (pondération configurable en console SA).` },
    { title: "Parc automobile & démographie", summary: `${motorisation} véhicules pour 1 000 habitants — motorisation ${motorisation > 400 ? "élevée" : motorisation > 250 ? "moyenne" : "modérée"} comparée à la moyenne nationale.` },
    { title: "Trafic routier (TMJ réel)", summary: zone.tmj > 0 ? `Trafic quotidien cumulé de ${intFr(zone.tmj)} véhicules sur ${zone.axes} axe(s) routier(s) recensé(s) (autoroutes, RN, GP).` : "Aucun axe majeur recensé sur ce gouvernorat — trafic à qualifier par comptage terrain." },
    { title: "Concurrence locale", summary: `${intFr(zone.stationsTotal)} stations en service${dominant ? ` · enseigne dominante : ${dominant.name} (${intFr(dominant.count)})` : ""} · votre enseigne : ${intFr(zone.myBrandStations)} station(s) (${zone.myBrandSharePct} %).` },
    { title: "Couverture par délégation", summary: `${zone.delegations.length} délégations couvertes sur ${zone.delegations.length + zone.delegationWithoutStation} — table des présences par délégation.` },
    { title: "Poches blanches", summary: zone.delegationWithoutStation > 0 ? `${zone.delegationWithoutStation} délégation(s) sans aucune station en service — priorités d'instruction terrain.` : "Aucune délégation sans station sur ce gouvernorat." },
    { title: "Analyse foncière", summary: `${intFr(zone.landPriceDt)} DT/m² (${zone.landEstimated ? "valeur estimée V1" : "valeur éditée"}) · disponibilité ${zone.landAvailPct} % des parcelles recherchées.` },
    { title: "Pouvoir d'achat", summary: `Indice PPA ${zone.ppaIndex}/100${zone.ppaEstimated ? " (estimé V1)" : " (édité)"} — Tunis = 100 en référence.` },
    { title: "Format recommandé", summary: `${m.label} — justification : ${reco.reasons.join(" · ")}.` },
    { title: "Fiche du format", summary: `Investissement indicatif ${fmtDT(m.investDt)} · superficie ≈ ${intFr(m.surfaceM2)} m² · ${m.equipement} · charges ${fmtDT(m.chargesAn)}/an.` },
    { title: "ROI indicatif du format recommandé", summary: `CA annuel estimé ${fmtDT(roi.caAnnuel)} · marge nette ${fmtDT(roi.margeNette)}/an · seuil ${fmtSeuilMois(roi.seuilMois)} · TRI ${pct1(roi.triPct)} (trafic captif ${intFr(trafic.trafic)} véh./j${trafic.estime ? " estimé" : ""}).` },
    { title: "Comparatif des trois formats", summary: "Table investissement / CA / marge nette / seuil / TRI pour Classique, Express et Hub sur la même zone." },
    { title: "Timeline d'implantation", summary: `8 étapes standard — total ≈ ${fmtMoisFR(tot.min)} à ${fmtMoisFR(tot.max)} mois pour le format ${m.short} (indicatif).` },
    { title: "Checklist réglementaire", summary: `${REGLEMENT_GROUPS.filter(g => g.formats.includes(reco.format)).reduce((s, g) => s + g.items.length, 0)} documents du volet ${m.short} : APIC, permis, protection civile, agréments, environnement.` },
    { title: "Ressources humaines", summary: `${staffTotals(reco.format).effectif} emplois directs · masse salariale ${intFr(staffTotals(reco.format).mensuel)} DT/mois (${intFr(staffTotals(reco.format).annuel)} DT/an) — salaires de référence marché tunisien V1.` },
    { title: "Points de vigilance", summary: [zone.ppaEstimated ? "PPA estimé" : null, zone.landEstimated ? "foncier estimé" : null, zone.tmj === 0 ? "TMJ non recensé" : null, zone.alert ? `alerte active (score ${zone.alert.score}/100)` : null, zone.myBrandStations === 0 ? `zone vierge de ${brandName}` : null].filter(Boolean).join(" · ") || "Aucun signalement particulier." },
    { title: "Recommandations", summary: `Instruire ${zone.delegationWithoutStation > 0 ? `les ${zone.delegationWithoutStation} délégations sans station en priorité, ` : ""}valider le trafic par comptage terrain et affiner la rentabilité dans Simulations.` },
    { title: "Conclusion", summary: "Verdict final, prochaines étapes et mentions (données Radar, template V1 sans IA)." },
  ]
}

/* ---------- Génération PDF ---------- */

export function generateFaisabilitePdf(
  zone: RadarZoneDTO,
  brandName: string,
  weights: { parc: number; ppa: number; traffic: number; compet: number; land: number },
): PdfFinishResult {
  const reco = recommendFormat(zone)
  const m = FORMAT_META[reco.format]
  const rois = computeRoiAll(zone)
  const roi = rois.find(o => o.format === reco.format)!
  const tot = timelineTotals(reco.format)
  const staff = staffTotals(reco.format)
  const trafic = traficCaptif(zone)
  const motorisation = zone.population > 0 ? Math.round((zone.vehicles / zone.population) * 1000) : 0
  const groups = REGLEMENT_GROUPS.filter(g => g.formats.includes(reco.format))

  const pdf: ReportPdf = createReportPdf({
    title: `Étude de faisabilité — ${zone.gouvernorat}`,
    subtitle: "Radar d'opportunités · format recommandé, concurrence, foncier et rentabilité indicative",
    metaLines: [
      `Enseigne : ${brandName}`,
      `Score d'opportunité : ${zone.score}/100 — ${PALIER_TEXT[zone.palier]}`,
      `Format recommandé : ${m.label}`,
    ],
    brandColor: "#059669",
    classification: "Document de travail",
  })

  const int = intFr

  /* 1. Synthèse exécutive */
  sectionTitle(pdf, "1. Synthèse exécutive")
  paragraph(pdf, `Le gouvernorat de ${zone.gouvernorat} affiche un score d'opportunité de ${zone.score}/100 (${PALIER_TEXT[zone.palier]}) sur les 24 gouvernorats tunisiens scorés par le Radar CarbuScope. Le moteur de formats recommande un point de type ${m.label} — ${m.tagline.toLowerCase()}. ${zone.myBrandStations === 0 ? `La zone est vierge de l'enseigne ${brandName} : priorité d'étude d'implantation.` : `L'enseigne ${brandName} y est déjà présente avec ${int(zone.myBrandStations)} station(s) (${zone.myBrandSharePct} % de part).`}`)
  paragraph(pdf, `Décision proposée : instruire une implantation ${m.short} avec ${int(zone.delegationWithoutStation)} délégation(s) sans station à qualifier en priorité, sous réserve du comptage terrain du trafic et de la disponibilité foncière.`, { bold: true })

  /* 2. Indicateurs clés */
  sectionTitle(pdf, "2. Indicateurs clés")
  kpiGrid(pdf, [
    { label: "Score d'opportunité", value: `${zone.score}/100`, sub: PALIER_TEXT[zone.palier] },
    { label: "Parc automobile", value: int(zone.vehicles), sub: "véhicules recensés (ATTT)" },
    { label: "Population", value: int(zone.population), sub: "habitants du gouvernorat" },
    { label: "Stations en service", value: int(zone.stationsTotal), sub: `dont ${int(zone.myBrandStations)} ${brandName}` },
    { label: "Ratio", value: `${int(zone.ratio)}`, sub: "véhicles par station" },
    { label: "TMJ cumulé", value: zone.tmj > 0 ? int(zone.tmj) : "non recensé", sub: `${zone.axes} axe(s) routier(s)` },
    { label: "Foncier", value: `${int(zone.landPriceDt)} DT/m²`, sub: zone.landEstimated ? "valeur estimée V1" : "valeur éditée" },
    { label: "Pouvoir d'achat", value: `${zone.ppaIndex}/100`, sub: zone.ppaEstimated ? "indice estimé V1" : "indice édité" },
  ])

  /* 3. Scoring détaillé */
  sectionTitle(pdf, "3. Scoring détaillé — 5 critères")
  table(pdf, {
    head: ["Critère", "Note /100", "Pondération", "Lecture"],
    body: [
      ["Parc automobile", zone.components.parc, `${weights.parc} %`, "véhicules recensés ATTT"],
      ["Pouvoir d'achat", zone.components.ppa, `${weights.ppa} %`, "indice PPA (Tunis = 100)"],
      ["Trafic routier", zone.components.traffic, `${weights.traffic} %`, "TMJ réel par axe attribué"],
      ["Concurrence", zone.components.compet, `${weights.compet} %`, "ratio véh./station"],
      ["Foncier", zone.components.land, `${weights.land} %`, "disponibilité et prix du m²"],
    ],
    colStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  })
  paragraph(pdf, `Pondération configurable dans la console Super Admin — le score est recalculé à chaque chargement du Radar.`, { size: 8.5, muted: true })

  /* 4. Parc & démographie */
  sectionTitle(pdf, "4. Parc automobile et démographie")
  kpiGrid(pdf, [
    { label: "Véhicules", value: int(zone.vehicles), sub: "parc du gouvernorat" },
    { label: "Motorisation", value: `${motorisation}/1 000 hab.`, sub: "véhicules pour 1 000 habitants" },
  ])
  paragraph(pdf, `Avec ${int(zone.vehicles)} véhicules pour ${int(zone.population)} habitants, la motorisation locale est de ${motorisation} véhicules pour 1 000 habitants. La demande en services automobile (carburant, vidange, pneus) en découle directement ; le ratio de ${int(zone.ratio)} véhicules par station situe la zone en ${PALIER_TEXT[zone.palier]}.`)

  /* 5. Trafic */
  sectionTitle(pdf, "5. Trafic routier (TMJ réel)")
  if (zone.tmj > 0) {
    kpiGrid(pdf, [
      { label: "TMJ cumulé", value: int(zone.tmj), sub: "véhicules/jour, axes traversés" },
      { label: "Axes recensés", value: int(zone.axes), sub: "autoroutes, RN et GP tracés" },
    ])
    paragraph(pdf, `Le trafic quotidien cumulé sur les axes routiers traversant le gouvernorat atteint ${int(zone.tmj)} véhicules/jour — le flux captif maximal de référence pour la projection de rentabilité (un point de service capte une fraction de ce flux).`)
  } else {
    paragraph(pdf, "Aucun axe majeur recensé ne traverse ce gouvernorat : le trafic local n'est pas mesuré par le Radar. Un comptage terrain est indispensable avant tout engagement — l'estimation de rentabilité utilise une hypothèse basse de 1,5 % du parc quotidien.", { muted: true })
  }

  /* 6. Concurrence */
  sectionTitle(pdf, "6. Concurrence locale")
  table(pdf, {
    head: ["Enseigne", "Stations", "Part"],
    body: zone.stationsByBrand.slice(0, 10).map(b => [b.name, int(b.count), zone.stationsTotal ? pct1(Math.round((b.count / zone.stationsTotal) * 1000) / 10) : "—"]),
    colStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  })
  paragraph(pdf, `Votre enseigne (${brandName}) détient ${int(zone.myBrandStations)} station(s) en service, soit ${zone.myBrandSharePct} % du réseau local.`)

  /* 7. Couverture par délégation */
  sectionTitle(pdf, "7. Couverture par délégation")
  table(pdf, {
    head: ["Délégation", "Stations en service"],
    body: zone.delegations.slice(0, 14).map(d => [d.name, int(d.stations)]),
    colStyles: { 1: { halign: "right" } },
    fontSize: 8,
  })

  /* 8. Poches blanches */
  sectionTitle(pdf, "8. Poches blanches — délégations sans station")
  if (zone.delegationWithoutStation > 0) {
    bulletList(pdf, [
      `${zone.delegationWithoutStation} délégation(s) du gouvernorat ne comptent aucune station en service sur ${zone.delegations.length + zone.delegationWithoutStation} au total.`,
      "Ces poches blanches constituent les priorités d'instruction terrain : citoyens contraints de rouler jusqu'à la station la plus proche.",
      "Croiser avec l'outil isochrones de chalandise (Radar > Zones > Chalandise) pour mesurer les temps d'accès réels.",
    ])
  } else {
    paragraph(pdf, "Toutes les délégations du gouvernorat comptent au moins une station en service — pas de poche blanche identifiée.", { muted: true })
  }

  /* 9. Foncier */
  sectionTitle(pdf, "9. Analyse foncière")
  kpiGrid(pdf, [
    { label: "Prix du m²", value: `${int(zone.landPriceDt)} DT`, sub: zone.landEstimated ? "estimation V1 (éditable en SA)" : "valeur éditée" },
    { label: "Disponibilité", value: `${zone.landAvailPct} %`, sub: "parcelles recherchées disponibles" },
  ])
  paragraph(pdf, `Terrain indicatif pour ${int(m.surfaceM2)} m² : ≈ ${int(zone.landPriceDt * m.surfaceM2)} DT d'acquisition foncière (hors frais et viabilisation), à intégrer à l'enveloppe d'investissement globale de ${fmtDT(m.investDt)}.`)

  /* 10. Pouvoir d'achat */
  sectionTitle(pdf, "10. Pouvoir d'achat")
  paragraph(pdf, `L'indice de pouvoir d'achat du gouvernorat ressort à ${zone.ppaIndex}/100 (référence Tunis = 100)${zone.ppaEstimated ? " — valeur estimée V1, affinable dans la console Super Admin" : " — valeur éditée par l'administration"}. Il pondère le score d'opportunité à ${weights.ppa} % et influence le panier moyen boutique attendu.`)

  /* 11. Format recommandé */
  sectionTitle(pdf, "11. Format recommandé")
  paragraph(pdf, `Format retenu par le moteur V1 : ${m.label}.`, { bold: true })
  paragraph(pdf, `Règle appliquée : ${reco.rule}. Justification : ${reco.reasons.join(" · ")}.`)
  paragraph(pdf, m.detail)

  /* 12. Fiche du format */
  sectionTitle(pdf, "12. Fiche synthétique du format")
  table(pdf, {
    head: ["Caractéristique", "Valeur"],
    body: [
      ["Investissement indicatif", fmtDT(m.investDt)],
      ["Superficie au sol", `≈ ${int(m.surfaceM2)} m²`],
      ["Équipement de service", m.equipement],
      ["Charges d'exploitation", `${fmtDT(m.chargesAn)} / an`],
      ["Panier moyen boutique", `${m.panierBoutique} DT`],
    ],
    colStyles: { 1: { halign: "right" } },
  })

  /* 13. ROI du format recommandé */
  sectionTitle(pdf, "13. ROI indicatif du format recommandé")
  paragraph(pdf, `Hypothèses : trafic captif ${int(trafic.trafic)} véh./j${trafic.estime ? " (estimé depuis le parc, TMJ non recensé)" : " (TMJ réel)"}, conversion ${ROI_CONSTANTS.conversionBase} % plafonnée par la capacité des pistes, prix pompe ${ROI_CONSTANTS.prixLitreDt.toLocaleString("fr-FR", { minimumFractionDigits: 3 })} DT/L, marge litre ${ROI_CONSTANTS.margeLitreDt.toLocaleString("fr-FR", { minimumFractionDigits: 3 })} DT/L, marge boutique ${ROI_CONSTANTS.margeBoutique * 100} %.`, { size: 8.5, muted: true })
  table(pdf, {
    head: ["Indicateur", "Valeur"],
    body: [
      ["Investissement", fmtDT(roi.investDt)],
      ["CA annuel estimé", fmtDT(roi.caAnnuel)],
      ["Marge nette / an", fmtDT(roi.margeNette)],
      ["Seuil de rentabilité", fmtSeuilMois(roi.seuilMois)],
      ["TRI simplifié", pct1(roi.triPct)],
      roi.format === "MOBILITY_HUB"
        ? ["Prestations atelier / an", int(Math.round(roi.caServices / Math.max(1, ROI_CONSTANTS.hubPanierServiceDt)))]
        : ["Litres vendus / an", int(roi.litresAn)],
    ],
    colStyles: { 1: { halign: "right" } },
  })

  /* 14. Comparatif des 3 formats */
  sectionTitle(pdf, "14. Comparatif des trois formats sur cette zone")
  table(pdf, {
    head: ["Format", "Investissement", "CA annuel", "Marge nette/an", "Seuil", "TRI"],
    body: rois.map(o => [
      FORMAT_META[o.format].label,
      fmtDT(o.investDt),
      fmtDT(o.caAnnuel),
      fmtDT(o.margeNette),
      fmtSeuilMois(o.seuilMois),
      pct1(o.triPct),
    ]),
    colStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    fontSize: 8,
  })
  paragraph(pdf, "Estimation V1 simplifiée (trafic captif maximal) — à affiner dans le module Simulations avec scénarios pessimiste / médian / optimiste.", { size: 8.5, muted: true })

  /* 15. Timeline */
  sectionTitle(pdf, "15. Timeline d'implantation")
  let cumMin = 0, cumMax = 0
  table(pdf, {
    head: ["Étape", "Durée", "Cumul"],
    body: TIMELINE_STEPS.map(s => {
      const [a, b] = s.durees[reco.format]
      cumMin += a
      cumMax += b
      return [s.titre, `${fmtMoisFR(a)} – ${fmtMoisFR(b)} mois`, `≈ ${fmtMoisFR(cumMin)} – ${fmtMoisFR(cumMax)} mois`]
    }),
    colStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    fontSize: 8,
  })
  paragraph(pdf, `Durée totale indicative pour un point ${m.short} : ≈ ${fmtMoisFR(tot.min)} à ${fmtMoisFR(tot.max)} mois — dépendante des autorisations locales (APIC, permis de construire, protection civile).`)

  /* 16. Checklist réglementaire */
  sectionTitle(pdf, "16. Checklist réglementaire (indicative)")
  for (const g of groups) {
    paragraph(pdf, g.titre, { bold: true, size: 9 })
    bulletList(pdf, g.items.map(it => `${it.label} — ${it.detail}`), { size: 8.5, marker: "–" })
  }
  paragraph(pdf, "Checklist indicative V1 — se rapprocher des agences locales (municipalité, protection civile, ministère du Commerce) pour les exigences en vigueur.", { size: 8.5, muted: true })

  /* 17. RH */
  sectionTitle(pdf, "17. Ressources humaines")
  table(pdf, {
    head: ["Poste", "Salaire mensuel (DT)", m.short],
    body: [
      ...STAFF_ROLES.filter(r => r.counts[reco.format] > 0).map(r => [r.role, intFr(r.salaireDt), `${r.counts[reco.format]}`] as (string | number)[]),
      ["Effectif total", "—", `${staff.effectif} personnes`],
      ["Masse salariale mensuelle", "—", `${int(staff.mensuel)} DT`],
      ["Masse salariale annuelle", "—", `${int(staff.annuel)} DT`],
    ],
    colStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  })
  paragraph(pdf, "Salaires bruts mensuels de référence marché tunisien (V1, ajustables). Le Hub tient la caisse par le gérant ; l'Express externalise la maintenance (contrat).", { size: 8.5, muted: true })

  /* 18. Points de vigilance */
  sectionTitle(pdf, "18. Points de vigilance")
  const vigilance: string[] = []
  if (zone.ppaEstimated) vigilance.push("Indice de pouvoir d'achat estimé (V1) — à confirmer avant décision d'implantation.")
  if (zone.landEstimated) vigilance.push("Prix et disponibilité fonciers estimés (V1) — étude notariée et visites terrain à conduire.")
  if (zone.tmj === 0) vigilance.push("TMJ non recensé sur le gouvernorat — comptage terrain indispensable.")
  if (zone.alert) vigilance.push(`Alerte Radar active : score ${zone.alert.score}/100 (seuil ${zone.alert.threshold}) — ${zone.alert.detail}`)
  if (zone.myBrandStations === 0) vigilance.push(`Zone vierge de l'enseigne ${brandName} — test d'acceptation locale à prévoir.`)
  if (roi.margeNette < 0) vigilance.push("La marge nette estimée est négative avec les hypothèses V1 : affiner impérativement dans Simulations avant engagement.")
  if (vigilance.length === 0) vigilance.push("Aucun signalement particulier — indicateurs édités et trafic recensé.")
  bulletList(pdf, vigilance)

  /* 19. Recommandations */
  sectionTitle(pdf, "19. Recommandations")
  bulletList(pdf, [
    `Instruire le format ${m.label} (${reco.rule}).`,
    ...(zone.delegationWithoutStation > 0
      ? [`Prioriser les ${zone.delegationWithoutStation} délégation(s) sans station pour le choix de la parcelle.`]
      : []),
    "Valider le trafic captif par comptage terrain sur la parcelle pressentie (7 jours, distinction PL/véhicules légers).",
    `Négocier le foncier autour de ${int(zone.landPriceDt)} DT/m² (référence du gouvernorat) et vérifier la viabilisation.`,
    "Affiner la rentabilité dans le module Simulations (scénarios et seuil par hypothèse), puis engager la checklist réglementaire.",
  ])

  /* 20. Conclusion */
  sectionTitle(pdf, "20. Conclusion et prochaines étapes")
  paragraph(pdf, `${zone.gouvernorat} présente un profil ${PALIER_TEXT[zone.palier]} avec un score de ${zone.score}/100. Le format ${m.label} maximise l'adéquation entre la demande mesurée (parc, trafic, pouvoir d'achat) et l'investissement engagé (${fmtDT(m.investDt)}). Prochaines étapes : comptage terrain, choix de la parcelle dans les poches blanches identifiées, simulation financière détaillée puis dépôt des autorisations.`)
  paragraph(pdf, "Données Radar — génération template V1 (structure fixe, sans génération par IA ; les valeurs proviennent exclusivement des indicateurs réels du Radar CarbuScope).", { size: 8.5, muted: true })

  const slug = zone.gouvernorat
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  return finish(pdf, `carbuscope-etude-faisabilite-${slug}-${pdfStamp()}.pdf`)
}
