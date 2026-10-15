'use client'

// T55-B3-a — Moteur partagé « Formats recommandés » : règle de recommandation V1
// (dérivable côté client depuis les RadarZoneDTO, donc totalement transparente),
// économie comparative des 3 formats (mêmes formules que le calculateur A.6.4),
// timeline d'implantation par format et effectifs RH de référence.
// Consommé par la section « Formats recommandés » (4 sous-onglets) ET par la
// section « Études de faisabilité » (rapport PDF, volet RH) — aucune donnée
// simulée : tout découle du DTO réel de la zone.

import { Badge } from "@/components/ui/badge"
import { num } from "@/lib/chart"
import type { RadarZoneDTO } from "@/lib/radar-scoring"
import {
  Fuel, Zap, Wrench, FileSearch, MapPinned, Handshake, Stamp, HardHat,
  UsersRound, DoorOpen, type LucideIcon,
} from "lucide-react"

/* ============================== Formats ============================== */

export type FormatKey = "CLASSIQUE" | "EXPRESS" | "MOBILITY_HUB"

export const FORMAT_KEYS: FormatKey[] = ["CLASSIQUE", "EXPRESS", "MOBILITY_HUB"]

export interface FormatMeta {
  key: FormatKey
  /** Nom complet affiché (cartes, en-têtes). */
  label: string
  /** Libellé court (chips, badges, tableaux). */
  short: string
  /** Positionnement en une ligne. */
  tagline: string
  /** Description complète (aperçu, PDF). */
  detail: string
  investDt: number
  surfaceM2: number
  chargesAn: number
  /** Équipement de service en toutes lettres. */
  equipement: string
  /** Panier moyen boutique par format (DT). */
  panierBoutique: number
  dot: string
  badge: string
  /** Conteneur teinté du format (bloc reco, cartes focus). */
  card: string
  chip: string
  icon: LucideIcon
}

export const FORMAT_META: Record<FormatKey, FormatMeta> = {
  CLASSIQUE: {
    key: "CLASSIQUE",
    label: "Station Classique",
    short: "Classique",
    tagline: "Station-service complète sur axe majeur",
    detail:
      "Station-service complète : 4 pistes carburant ou plus sous canopy, boutique 120 m², zone technique mobilité (vidange / pneus), parking et services annexes. Format amiral réservé aux axes à fort trafic et aux scores d'opportunité élevés.",
    investDt: 2_500_000,
    surfaceM2: 2_500,
    chargesAn: 850_000,
    equipement: "4+ pistes · boutique 120 m² · zone TMP",
    panierBoutique: 9,
    dot: "#b0563b",
    badge: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    card: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/60",
    chip: "border-amber-400/60 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300",
    icon: Fuel,
  },
  EXPRESS: {
    key: "EXPRESS",
    label: "Micro-station Express",
    short: "Express",
    tagline: "Micro-station 2 pistes, boutique compacte",
    detail:
      "Micro-station de proximité : 2 pistes carburant sous canopy compact, kiosque-boutique d'environ 30 m², parking réduit. Investissement contenu, idéale en zone blanche ou sous-équipée à trafic moyen.",
    investDt: 900_000,
    surfaceM2: 900,
    chargesAn: 420_000,
    equipement: "2 pistes · kiosque 30 m²",
    panierBoutique: 6,
    dot: "#059669",
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    card: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/60",
    chip: "border-emerald-400/60 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    icon: Zap,
  },
  MOBILITY_HUB: {
    key: "MOBILITY_HUB",
    label: "Mobility Hub (TMP)",
    short: "Hub",
    tagline: "Atelier mobilité sans carburant",
    detail:
      "Point de services techniques sans carburant : atelier vidange 2 bays, zone pneumatiques, cabine de diagnostic et petite boutique d'accessoires. Investissement léger, pensé pour les zones blanches profondes et les villes sans axe majeur recensé.",
    investDt: 350_000,
    surfaceM2: 550,
    chargesAn: 150_000,
    equipement: "2 bays atelier · pneus · diagnostic",
    panierBoutique: 4,
    dot: "#7e22ce",
    badge: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400",
    card: "border-purple-300 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/60",
    chip: "border-purple-400/60 bg-purple-100 text-purple-900 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-300",
    icon: Wrench,
  },
}

/** Badge coloré du format — ambre/terracotta, émeraude, prune (jamais de bleu). */
export function FormatBadge({ format, className }: { format: FormatKey; className?: string }) {
  const m = FORMAT_META[format]
  return (
    <Badge variant="outline" className={`text-[11px] font-medium ${m.badge} ${className ?? ""}`}>
      {m.short}
    </Badge>
  )
}

/* ==================== Règle de recommandation V1 ==================== */
// Moteur de règles volontairement simple et affiché tel quel à l'utilisateur
// (chips de justification par zone) : aucune boîte noire.
//   • CLASSIQUE   si score >= 60 ET tmj >= 25 000 (axes majeurs)
//   • EXPRESS     si score >= 45 ET (tmj >= 8 000 OU palier BLANCHE / SOUS)
//   • MOBILITY_HUB sinon — zones blanches profondes, investissement léger.

export const FORMAT_RULE = {
  classiqueScore: 60,
  classiqueTmj: 25_000,
  expressScore: 45,
  expressTmj: 8_000,
}

export interface FormatReco {
  format: FormatKey
  /** Texte de la règle appliquée (affiché tel quel — transparence V1). */
  rule: string
  /** Chips de justification (ex. « score 72 », « TMJ 31 250 », « zone blanche »). */
  reasons: string[]
}

const palierLabel = (p: RadarZoneDTO["palier"]): string =>
  p === "BLANCHE" ? "zone blanche" : p === "SOUS" ? "zone sous-équipée" : p === "EQUILIBREE" ? "zone équilibrée" : "zone dense"

export function recommendFormat(z: RadarZoneDTO): FormatReco {
  if (z.score >= FORMAT_RULE.classiqueScore && z.tmj >= FORMAT_RULE.classiqueTmj) {
    return {
      format: "CLASSIQUE",
      rule: `score ≥ ${FORMAT_RULE.classiqueScore} et TMJ ≥ ${num(FORMAT_RULE.classiqueTmj)} (axe majeur) → station complète`,
      reasons: [
        `score ${z.score}/100`,
        `TMJ ${num(z.tmj)}`,
        `parc ${num(z.vehicles)} véh.`,
      ],
    }
  }
  if (
    z.score >= FORMAT_RULE.expressScore &&
    (z.tmj >= FORMAT_RULE.expressTmj || z.palier === "BLANCHE" || z.palier === "SOUS")
  ) {
    return {
      format: "EXPRESS",
      rule: `score ≥ ${FORMAT_RULE.expressScore} et (TMJ ≥ ${num(FORMAT_RULE.expressTmj)} ou zone blanche / sous-équipée) → micro-station`,
      reasons: [
        `score ${z.score}/100`,
        z.tmj >= FORMAT_RULE.expressTmj ? `TMJ ${num(z.tmj)}` : palierLabel(z.palier),
        `ratio ${num(z.ratio)} véh./stat.`,
      ],
    }
  }
  return {
    format: "MOBILITY_HUB",
    rule: `sinon (score < ${FORMAT_RULE.expressScore} ou trafic et équipement insuffisants) → atelier mobilité sans carburant`,
    reasons: [
      z.score < FORMAT_RULE.expressScore ? `score ${z.score}/100 (< ${FORMAT_RULE.expressScore})` : `TMJ ${num(z.tmj)} (< ${num(FORMAT_RULE.expressTmj)})`,
      palierLabel(z.palier),
      z.tmj === 0 ? "hors axes recensés" : `ratio ${num(z.ratio)} véh./stat.`,
    ],
  }
}

/* ==================== Économie comparative (ROI V1) ==================== */
// Mêmes formules que le calculateur de rentabilité A.6.4 (littres =
// trafic × 365 × conversion × panier/prix), marge boutique 30 %, charges
// annuelles par format 850 k / 420 k / 150 k DT. Le Hub n'a pas de carburant :
// revenu atelier (conversion service 0,25 %, panier 85 DT, marge 35 %).
// Estimation V1 honnête — à affiner dans Simulations.

export const ROI_CONSTANTS = {
  prixLitreDt: 2.5,          // prix pompe essence (décret) appliqué par défaut
  margeLitreDt: 0.18,        // marge détaillant par litre
  panierCarburantDt: 48,     // panier moyen carburant
  conversionBase: 6,         // % du trafic captif qui s'arrête (défaut A.6.4)
  margeBoutique: 0.3,        // marge boutique
  hubConversionService: 0.25,   // % du trafic → prestation atelier (V1)
  hubPanierServiceDt: 85,       // panier moyen vidange / pneus / diagnostic
  hubMargeService: 0.35,        // marge sur prestations atelier
  hubConversionAccessoires: 1,  // % du trafic → achat accessoire
}

/** Plafond de conversion lié au nombre de pistes (capacité physique). */
const CONV_CAP: Record<FormatKey, number> = {
  CLASSIQUE: 8,   // 4+ pistes
  EXPRESS: 4,     // 2 pistes
  MOBILITY_HUB: 0, // pas de carburant
}

/** Trafic captif de la zone : le TMJ réel s'il est recensé, sinon une
 *  estimation basse depuis le parc local (1,5 % du parc par jour) —
 *  signalée comme estimée dans l'interface. */
export function traficCaptif(zone: RadarZoneDTO): { trafic: number; estime: boolean } {
  if (zone.tmj > 0) return { trafic: Math.round(zone.tmj), estime: false }
  return { trafic: Math.round(zone.vehicles * 0.015), estime: true }
}

export interface RoiOutcome {
  format: FormatKey
  trafic: number
  traficEstime: boolean
  /** Conversion effective appliquée (%), plafonnée par la capacité des pistes. */
  conversion: number
  investDt: number
  chargesAn: number
  litresAn: number
  caCarburant: number
  caBoutique: number
  caServices: number
  caAnnuel: number
  margeCarburant: number
  margeBoutique: number
  margeServices: number
  margeNette: number
  margeMensuelle: number
  /** Seuil de rentabilité en mois — null si la marge est négative. */
  seuilMois: number | null
  /** TRI simplifié : marge nette annuelle ÷ investissement. */
  triPct: number
}

export function computeRoiFormat(format: FormatKey, zone: RadarZoneDTO): RoiOutcome {
  const m = FORMAT_META[format]
  const { trafic, estime } = traficCaptif(zone)
  const K = ROI_CONSTANTS

  let litresAn = 0
  let caCarburant = 0
  let margeCarburant = 0
  let caBoutique = 0
  let margeBoutique = 0
  let caServices = 0
  let margeServices = 0

  if (format === "MOBILITY_HUB") {
    // Atelier sans carburant : prestations + accessoires.
    const prestations = trafic * 365 * (K.hubConversionService / 100)
    caServices = prestations * K.hubPanierServiceDt
    margeServices = caServices * K.hubMargeService
    caBoutique = trafic * 365 * (K.hubConversionAccessoires / 100) * m.panierBoutique
    margeBoutique = caBoutique * K.margeBoutique
  } else {
    // Station carburant : conversion plafonnée par la capacité des pistes.
    const conv = Math.min(K.conversionBase, CONV_CAP[format])
    const arretsCap = trafic * 365 * (conv / 100)
    litresAn = arretsCap * (K.panierCarburantDt / K.prixLitreDt)
    caCarburant = litresAn * K.prixLitreDt
    margeCarburant = litresAn * K.margeLitreDt
    caBoutique = arretsCap * m.panierBoutique
    margeBoutique = caBoutique * K.margeBoutique
  }

  const margeNette = margeCarburant + margeBoutique + margeServices - m.chargesAn
  const margeMensuelle = margeNette / 12
  const seuilMois = margeMensuelle > 0 ? m.investDt / margeMensuelle : null
  const triPct = m.investDt > 0 ? (margeNette / m.investDt) * 100 : 0

  return {
    format,
    trafic,
    traficEstime: estime,
    conversion: format === "MOBILITY_HUB"
      ? K.hubConversionService
      : Math.min(K.conversionBase, CONV_CAP[format]),
    investDt: m.investDt,
    chargesAn: m.chargesAn,
    litresAn,
    caCarburant,
    caBoutique,
    caServices,
    caAnnuel: caCarburant + caBoutique + caServices,
    margeCarburant,
    margeBoutique,
    margeServices,
    margeNette,
    margeMensuelle,
    seuilMois,
    triPct,
  }
}

export function computeRoiAll(zone: RadarZoneDTO): RoiOutcome[] {
  return FORMAT_KEYS.map(f => computeRoiFormat(f, zone))
}

/* ==================== Timeline d'implantation ==================== */
// 8 étapes standard ; la durée du génie civil et de l'équipement varie par
// format (le Hub est plus rapide). Fourchette indicative séquentielle —
// certaines phases se recouvrent sur le terrain.

export interface TimelineStep {
  id: string
  titre: string
  detail: string
  icon: LucideIcon
  /** Durée [min, max] en mois, par format. */
  durees: Record<FormatKey, [number, number]>
}

export const TIMELINE_STEPS: TimelineStep[] = [
  {
    id: "etude",
    titre: "Étude de faisabilité",
    detail: "Rapport Radar, comptage terrain, hypothèses de rentabilité.",
    icon: FileSearch,
    durees: { CLASSIQUE: [2, 3], EXPRESS: [2, 3], MOBILITY_HUB: [2, 3] },
  },
  {
    id: "foncier",
    titre: "Recherche foncière",
    detail: "Repérage des parcelles, visites, négociation du prix au m².",
    icon: MapPinned,
    durees: { CLASSIQUE: [2, 6], EXPRESS: [2, 6], MOBILITY_HUB: [2, 6] },
  },
  {
    id: "apic",
    titre: "Négociation & APIC",
    detail: "Signature du compromis, avis préalable d'implantation commerciale.",
    icon: Handshake,
    durees: { CLASSIQUE: [1, 3], EXPRESS: [1, 3], MOBILITY_HUB: [1, 3] },
  },
  {
    id: "permis",
    titre: "Permis & autorisations",
    detail: "Permis de construire, protection civile, avis conformité (checklist).",
    icon: Stamp,
    durees: { CLASSIQUE: [2, 4], EXPRESS: [2, 4], MOBILITY_HUB: [2, 4] },
  },
  {
    id: "genie",
    titre: "Génie civil",
    detail: "Terrassement, canopy / bâtiment, cuves, réseaux — durée selon format.",
    icon: HardHat,
    durees: { CLASSIQUE: [4, 8], EXPRESS: [3, 6], MOBILITY_HUB: [2, 4] },
  },
  {
    id: "equipement",
    titre: "Équipement",
    detail: "Pompes, silo à carburant ou bays atelier, informatique, enseigne.",
    icon: Wrench,
    durees: { CLASSIQUE: [1, 2], EXPRESS: [1, 2], MOBILITY_HUB: [0.5, 1] },
  },
  {
    id: "rh",
    titre: "Recrutement & formation",
    detail: "Gérant, pompistes ou techniciens, procédures sécurité.",
    icon: UsersRound,
    durees: { CLASSIQUE: [1, 2], EXPRESS: [1, 2], MOBILITY_HUB: [1, 2] },
  },
  {
    id: "ouverture",
    titre: "Ouverture",
    detail: "Contrôles finaux, arrêté d'ouverture, communication locale.",
    icon: DoorOpen,
    durees: { CLASSIQUE: [0.5, 0.5], EXPRESS: [0.5, 0.5], MOBILITY_HUB: [0.5, 0.5] },
  },
]

/** Cumul [min, max] en mois des 8 étapes pour un format. */
export function timelineTotals(format: FormatKey): { min: number; max: number } {
  let min = 0, max = 0
  for (const s of TIMELINE_STEPS) {
    min += s.durees[format][0]
    max += s.durees[format][1]
  }
  return { min, max }
}

/* ==================== Effectifs & salaires (RH V1) ==================== */
// Salaires bruts mensuels de référence marché tunisien (V1, ajustables).

export interface StaffRole {
  role: string
  salaireDt: number
  counts: Record<FormatKey, number>
  note?: string
}

export const STAFF_ROLES: StaffRole[] = [
  { role: "Gérant(e) de point", salaireDt: 1_800, counts: { CLASSIQUE: 1, EXPRESS: 1, MOBILITY_HUB: 1 } },
  { role: "Pompiste", salaireDt: 900, counts: { CLASSIQUE: 4, EXPRESS: 2, MOBILITY_HUB: 0 } },
  { role: "Technicien atelier", salaireDt: 1_100, counts: { CLASSIQUE: 0, EXPRESS: 1, MOBILITY_HUB: 3 } },
  { role: "Caissier(ère) boutique", salaireDt: 1_000, counts: { CLASSIQUE: 2, EXPRESS: 1, MOBILITY_HUB: 0 }, note: "Hub : caisse tenue par le gérant" },
  { role: "Agent de maintenance", salaireDt: 1_200, counts: { CLASSIQUE: 1, EXPRESS: 0, MOBILITY_HUB: 1 }, note: "Express : maintenance externalisée (contrat)" },
]

export function staffTotals(format: FormatKey): { effectif: number; mensuel: number; annuel: number } {
  let effectif = 0, mensuel = 0
  for (const r of STAFF_ROLES) {
    effectif += r.counts[format]
    mensuel += r.counts[format] * r.salaireDt
  }
  return { effectif, mensuel, annuel: mensuel * 12 }
}

/* ==================== Formatteurs FR ==================== */

/** 2 500 000 → « 2,5 M DT » · 445 000 → « 445 k DT » · 1 250 → « 1 250 DT ». */
export function fmtDT(v: number): string {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M DT`
  if (a >= 10_000) return `${Math.round(v / 1000).toLocaleString("fr-FR")} k DT`
  return `${Math.round(v).toLocaleString("fr-FR")} DT`
}

/** 14,2 mois → « 14 mois » · 34,6 → « 2 ans 11 mois ». */
export function fmtSeuilMois(mois: number | null): string {
  if (mois === null) return "non atteint"
  if (!Number.isFinite(mois)) return "> 20 ans"
  if (mois > 240) return "> 20 ans"
  if (mois < 18) return `${Math.round(mois).toLocaleString("fr-FR")} mois`
  const ans = Math.floor(mois / 12)
  const rest = Math.round(mois % 12)
  if (rest === 0) return `${ans} an${ans > 1 ? "s" : ""}`
  return `${ans} an${ans > 1 ? "s" : ""} ${rest} mois`
}

/** 13,5 → « 13,5 » · 14 → « 14 » (mois, décimales FR). */
export function fmtMois(v: number): string {
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })
}
