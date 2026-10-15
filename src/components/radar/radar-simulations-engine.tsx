'use client'

// T55-B3-b — Moteur partagé « Simulations de rentabilité » (Radar). Paramètres
// pré-remplis depuis la zone sélectionnée (TMJ réel → trafic, conversion 6 %,
// invest/charges du format via FORMAT_META de B3-a) puis recalcul live.
// Formules alignées sur le calculateur A.6.4 et le moteur de formats B3-a :
//   • carburant : litres = trafic × 365 × conversion × panier/prix
//   • boutique : arrêts × panier × marge 30 %
//   • hub (sans carburant) : prestations 0,25 % du trafic × panier 85 DT,
//     marge 35 % + accessoires 1 % × panier — la conversion saisie agit alors
//     comme un indice de performance (base 6 %) sur ces conversions de service.
// Aucune donnée simulée : tout découle du DTO réel de la zone + des hypothèses
// saisies (badges « est. » côté UI quand le TMJ est extrapolé du parc).

import type { RadarZoneDTO } from "@/lib/radar-scoring"
import {
  FORMAT_META, ROI_CONSTANTS, traficCaptif,
  type FormatKey,
} from "./radar-formats-engine"

// FORMAT_META sert uniquement dans presetParams (invest/charges/panier par format).

/* ============================ Paramètres ============================ */

export interface SimParams {
  invest: number           // DT
  trafic: number           // véh/j (TMJ réel de la zone, sinon estimation parc)
  traficEstime: boolean
  conversion: number       // % — arrêts carburant (indice base 6 % pour le hub)
  panierCarburant: number  // DT
  margeLitre: number       // DT/L
  panierBoutique: number   // DT
  charges: number          // DT/an
}

/** Contexte d'évolution annuel (sous-onglets plan & scénarios). */
export interface SimContext {
  /** Croissance du trafic en %/an (slider 0–8, défaut 2). */
  croissancePct: number
  /** Inflation des charges en %/an (slider 0–15). */
  inflationPct: number
  /** Décalage de montée en charge en mois (0–9) — retarde les revenus. */
  rampMonths: number
}

export const SIM_DEFAULTS: SimContext = { croissancePct: 2, inflationPct: 0, rampMonths: 0 }

/** Plafond de conversion par capacité des pistes — mêmes valeurs que le moteur
 *  B3-a (computeRoiFormat) : le pré-remplissage reste cohérent avec l'onglet
 *  « roi » des formats (l'utilisateur reste libre de dépasser via le curseur). */
const CONV_CAP: Record<FormatKey, number> = { CLASSIQUE: 8, EXPRESS: 4, MOBILITY_HUB: 100 }

/** Pré-remplit les paramètres depuis la zone (TMJ réel) et le format
 *  (invest/charges/panier boutique de FORMAT_META). */
export function presetParams(zone: RadarZoneDTO, format: FormatKey): SimParams {
  const { trafic, estime } = traficCaptif(zone)
  const m = FORMAT_META[format]
  return {
    invest: m.investDt,
    trafic: Math.max(50, Math.round(trafic)),
    traficEstime: estime,
    conversion: Math.min(ROI_CONSTANTS.conversionBase, CONV_CAP[format]),
    panierCarburant: ROI_CONSTANTS.panierCarburantDt,
    margeLitre: ROI_CONSTANTS.margeLitreDt,
    panierBoutique: m.panierBoutique,
    charges: m.chargesAn,
  }
}

/* ============================ Cœur de calcul ============================ */

export interface SimYear {
  /** 0 = départ (investissement), 1..5 = exercices. */
  annee: number
  caCarburant: number
  caBoutique: number
  caServices: number
  caTotal: number
  charges: number
  margeNette: number
  cumul: number
}

/** Économie d'une année (1-based) — trafic/croissance/inflation appliqués.
 *  `factor` (scénarios) multiplie trafic ET conversion (pattern calc-rentabilite). */
export function simYear(format: FormatKey, p: SimParams, ctx: SimContext, year: number, factor = 1): Omit<SimYear, "cumul"> {
  const K = ROI_CONSTANTS
  const trafic = p.trafic * Math.pow(1 + ctx.croissancePct / 100, year - 1) * factor
  const charges = p.charges * Math.pow(1 + ctx.inflationPct / 100, year - 1)

  let caCarburant = 0, caBoutique = 0, caServices = 0
  let margeCarburant = 0, margeBoutique = 0, margeServices = 0

  if (format === "MOBILITY_HUB") {
    // Sans carburant : la conversion saisie est un indice (base 6 %) qui module
    // les conversions de service de référence (0,25 % prestations, 1 % accessoires).
    const convIdx = (p.conversion * factor) / ROI_CONSTANTS.conversionBase
    const prestations = trafic * 365 * (K.hubConversionService / 100) * convIdx
    caServices = prestations * K.hubPanierServiceDt
    margeServices = caServices * K.hubMargeService
    caBoutique = trafic * 365 * (K.hubConversionAccessoires / 100) * convIdx * p.panierBoutique
    margeBoutique = caBoutique * K.margeBoutique
  } else {
    const convPct = (p.conversion * factor) / 100
    const arrets = trafic * 365 * convPct
    const litres = arrets * (p.panierCarburant / K.prixLitreDt)
    caCarburant = litres * K.prixLitreDt
    margeCarburant = litres * p.margeLitre
    caBoutique = arrets * p.panierBoutique
    margeBoutique = caBoutique * K.margeBoutique
  }

  // Montée en charge : la première année ne perçoit que (12 − ramp) mois de CA.
  const rampFactor = year === 1 ? Math.max(0, (12 - ctx.rampMonths) / 12) : 1
  const caTotal = (caCarburant + caBoutique + caServices) * rampFactor
  const margeBrute = (margeCarburant + margeBoutique + margeServices) * rampFactor

  return {
    annee: year,
    caCarburant: Math.round(caCarburant * rampFactor),
    caBoutique: Math.round(caBoutique * rampFactor),
    caServices: Math.round(caServices * rampFactor),
    caTotal: Math.round(caTotal),
    charges: Math.round(charges),
    margeNette: Math.round(margeBrute - charges),
  }
}

/** Business plan 5 ans : 6 lignes (Année 0 = investissement). */
export function simPlan(format: FormatKey, p: SimParams, ctx: SimContext, factor = 1): SimYear[] {
  const rows: SimYear[] = [{
    annee: 0,
    caCarburant: 0, caBoutique: 0, caServices: 0, caTotal: 0,
    charges: 0, margeNette: -Math.round(p.invest), cumul: -Math.round(p.invest),
  }]
  let cumul = -p.invest
  for (let y = 1; y <= 5; y++) {
    const row = simYear(format, p, ctx, y, factor)
    cumul += row.margeNette
    rows.push({ ...row, cumul: Math.round(cumul) })
  }
  return rows
}

/* ============================ Série mensuelle ============================ */

export interface SimMonth {
  /** 1-based (1..months). */
  mois: number
  label: string
  marge: number
  cumul: number
}

/** Série mensuelle du cumul de trésorerie (invest décaissé au mois 0) —
 *  montée en charge, croissance et inflation appliquées par exercice. */
export function simMonthly(format: FormatKey, p: SimParams, ctx: SimContext, months = 48, factor = 1): SimMonth[] {
  const years = Math.ceil(months / 12)
  const plan: Omit<SimYear, "cumul">[] = []
  for (let y = 1; y <= years; y++) plan.push(simYear(format, p, ctx, y, factor))

  const out: SimMonth[] = []
  let cumul = -p.invest
  for (let m = 1; m <= months; m++) {
    const yearIdx = Math.floor((m - 1) / 12)
    const row = plan[yearIdx]
    // Mois de montée en charge (ramp) : aucun revenu, charges courent.
    const marge = m <= ctx.rampMonths ? -row.charges / 12 : row.margeNette / 12
    cumul += marge
    out.push({ mois: m, label: `M${m}`, marge: Math.round(marge), cumul: Math.round(cumul) })
  }
  return out
}

/** Mois de break-even : premier mois où le cumul repasse ≥ 0 (null sinon). */
export function breakEvenMonth(series: SimMonth[]): number | null {
  for (const row of series) if (row.cumul >= 0) return row.mois
  return null
}

/* ============================ Indicateurs ============================ */

export interface SimKpis {
  caAn1: number
  caAn5: number
  margeNetteAn1: number
  margeNetteAn5: number
  margeMensuelleAn1: number
  cumulFinal: number
  /** Seuil = invest / marge mensuelle (années 1, hors ramp) — null si négatif. */
  seuilMois: number | null
  triPct: number
}

/** KPIs médians (factor = 1) sur le plan 5 ans. */
export function simKpis(format: FormatKey, p: SimParams, ctx: SimContext, factor = 1): SimKpis {
  const plan = simPlan(format, p, ctx, factor)
  const an1 = plan[1]
  const an5 = plan[5]
  const margeMensuelle = an1.margeNette / 12
  return {
    caAn1: an1.caTotal,
    caAn5: an5.caTotal,
    margeNetteAn1: an1.margeNette,
    margeNetteAn5: an5.margeNette,
    margeMensuelleAn1: margeMensuelle,
    cumulFinal: an5.cumul,
    seuilMois: margeMensuelle > 0 ? p.invest / margeMensuelle : null,
    triPct: p.invest > 0 ? (an1.margeNette / p.invest) * 100 : 0,
  }
}

/* ============================ Scénarios ============================ */

export type ScenarioKey = "pessimiste" | "median" | "optimiste"

export const SCENARIO_FACTORS: Record<ScenarioKey, number> = { pessimiste: 0.75, median: 1, optimiste: 1.25 }

/* ============================ Marketing & CLV ============================ */

export const CLV_CONSTANTS = {
  /** Panier annuel moyen d'entretien : ~2 vidanges + 1 train de pneus / 2 ans ≈ 280 DT/an. */
  clvPanierAnDt: 280,
  captureMinPct: 1,
  captureMaxPct: 10,
  captureDefPct: 3,
  dureeMinAns: 3,
  dureeMaxAns: 10,
  dureeDefAns: 5,
}

/** Projection de fidélisation : clients capturables × CLV (DT). */
export function clvProjection(parcVehicles: number, capturePct: number, dureeAns: number) {
  const capturables = Math.round(parcVehicles * (capturePct / 100))
  const clv = Math.round(CLV_CONSTANTS.clvPanierAnDt * dureeAns)
  return { capturables, clv, valeurTotale: Math.round(capturables * clv) }
}

/* ============================ Formatteurs FR ============================ */

/** « 2 ans 3 mois » / « 14 mois » / « non atteint » / « > 20 ans ». */
export function fmtPayback(mois: number | null): string {
  if (mois === null) return "non atteint"
  if (!Number.isFinite(mois) || mois > 240) return "> 20 ans"
  const y = Math.floor(mois / 12)
  const m = Math.round(mois % 12)
  if (y <= 0) return `${m} mois`
  if (m === 0) return `${y} an${y > 1 ? "s" : ""}`
  return `${y} an${y > 1 ? "s" : ""} ${m} mois`
}

export const fmtPctFr = (v: number, digits = 1): string =>
  `${v.toLocaleString("fr-FR", { maximumFractionDigits: digits })} %`
