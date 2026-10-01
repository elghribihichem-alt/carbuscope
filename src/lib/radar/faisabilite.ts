// ============================================================================
// CarbuScope — T54-B3b — MOTEUR « ÉTUDE DE FAISABILITÉ » (TypeScript pur).
//
// Aucune dépendance (ni fetch, ni base, ni composant) — les entrées sont
// injectées par l'appelant. Le volet « Études de faisabilité » du Radar
// consomme /api/radar/scoring (profil 5 critères + chiffres réels du
// gouvernorat), /api/radar/indicators (LandIndicator : disponibilité, prix,
// pression urbaine — badge « est. ») et le classement des formats du moteur
// T54-B3a (src/lib/radar/formats.ts).
//
// 4 AXES NOTÉS 0-100 (documentés, cohérents avec le moteur T54-B2) :
//   1. Marché (poids 40)            : moyenne pondérée parc 40 % / trafic 30 %
//      / pouvoir d'achat 30 % — les trois critères normalisés du moteur de
//      scoring (parc = véhicules INS, trafic = TMJ pondéré, pouvoir = indice
//      dérivé est.).
//   2. Concurrence (poids 25)       : critère concurrence du moteur (INVERSE
//      de la densité de stations en service : ratio véh./station, min-max
//      national) ; + 8 points si zone blanche (ratio > 3ᵉ quartile national,
//      même convention que T54-B2/B3a), plafonné à 100.
//   3. Foncier (poids 20)           : LandIndicator (/api/radar/indicators,
//      est.) — 55 % disponibilité foncière (dont emprises voie publique) +
//      45 % inverse de la pression urbaine. Repli défensif : critère foncier
//      du moteur si l'indicateur détaillé manque.
//   4. Accessibilité / réglementaire (poids 15) : ESTIMATION — 55 % inverse
//      de la pression urbaine (permis, contraintes d'urbanisme) + 45 % proxy
//      « axes routiers » = critère trafic du moteur (présence/fluence des
//      axes autour du site). Badge « est. » systématique.
//
// Score global = Σ (note × poids / 100) — 40/25/20/15, arrondi 1 décimale.
// Verdict FR : « Feu vert » (émeraude) ≥ 70 · « Feu orange » (ambre) 50-69 ·
// « Feu rouge » (terracotta) < 50.
//
// CHECKLIST TERRAIN : 14 points de contrôle réels groupés (accès/visibilité,
// foncier/réglementation, raccordements techniques, marché & bailleur),
// statuts À vérifier / Conforme / Point de vigilance / Bloquant + note
// libre. La progression est PERSISTÉE CÔTÉ CLIENT (sessionStorage, clé
// carbuscope-faisabilite-<gov>) — honnête par conception : aucune donnée
// écrite en base V1 (le schéma T54-A1 est gelé ; pas de fausse base).
// ============================================================================

import type { FormatRecommendation } from "./formats"

/* ============================== Types ============================== */

/** Profil du gouvernorat — champs réels de /api/radar/scoring. */
export type FaisaProfil = {
  gouvernorat: string
  /** Critères normalisés 0-100 (moteur T54-B2). */
  parc: number
  pouvoir: number
  trafic: number
  concurrence: number
  foncier: number
  /** Chiffres réels. */
  vehicles: number
  stations: number
  population: number
  score: number
  rank: number
}

/** Indicateur foncier détaillé (/api/radar/indicators — est.). */
export type FaisaLand = {
  pricePerM2: number | null
  availability: number | null
  urbanPressure: number | null
} | null

export type FaisaInput = {
  profil: FaisaProfil
  land: FaisaLand
  /** Gouvernorat en zone blanche (ratio véh./station > 3ᵉ quartile). */
  zoneBlanche: boolean
}

export type FaisaAxisId = "marche" | "concurrence" | "foncier" | "accessibilite"

export type FaisaAxis = {
  id: FaisaAxisId
  label: string
  /** Note 0-100. */
  note: number
  /** Poids % (40/25/20/15 — spec T54-B3b). */
  poids: number
  /** Détail FR (chiffres réels/estimés qui motivent la note). */
  detail: string
  /** True si la note repose sur des estimations V1. */
  est: boolean
}

export type FaisaVerdict = "FEU_VERT" | "FEU_ORANGE" | "FEU_ROUGE"

export type FaisaResult = {
  axes: FaisaAxis[]
  /** Score global pondéré (1 décimale). */
  score: number
  verdict: FaisaVerdict
  verdictLabel: string
  verdictDetail: string
}

/* ============================== Helpers ============================== */

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v))
const round1 = (v: number) => Math.round(v * 10) / 10
const fmtInt = (v: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number.isFinite(v) ? v : 0)
const fmt1 = (v: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(Number.isFinite(v) ? v : 0)

/* ============================== Moteur ============================== */

/** Poids des 4 axes (spec T54-B3b : 40/25/20/15 — documenté, non configurable V1). */
export const FAISA_WEIGHTS: Record<FaisaAxisId, number> = {
  marche: 40,
  concurrence: 25,
  foncier: 20,
  accessibilite: 15,
}

/**
 * Calcule l'étude de faisabilité d'un gouvernorat : 4 axes notés 0-100 +
 * score global pondéré + verdict FR. Pure — appelable serveur ou client.
 */
export function computeFaisabilite(input: FaisaInput): FaisaResult {
  const p = input.profil
  // Bornage défensif 0-100 (cf. formats.ts : le trafic du moteur peut être
  // légèrement négatif pour un gouvernorat sans axe).
  const crit = (v: number) => clamp(v)

  // --- Axe 1 · Marché (parc 40 / trafic 30 / pouvoir 30) ---
  const marche = round1(0.4 * crit(p.parc) + 0.3 * crit(p.trafic) + 0.3 * crit(p.pouvoir))

  // --- Axe 2 · Concurrence (inverse densité + bonus zone blanche) ---
  const ratio = p.stations > 0 ? p.vehicles / p.stations : p.vehicles
  const concurrence = round1(clamp(crit(p.concurrence) + (input.zoneBlanche ? 8 : 0)))

  // --- Repli défensif si l'indicateur foncier détaillé manque ---
  const avail = input.land?.availability != null ? clamp(input.land.availability) : crit(p.foncier)
  const pressure =
    input.land?.urbanPressure != null
      ? clamp(input.land.urbanPressure)
      : clamp(100 - crit(p.foncier))

  // --- Axe 3 · Foncier (dispo 55 % + inverse pression urbaine 45 %) ---
  const foncier = round1(0.55 * avail + 0.45 * (100 - pressure))

  // --- Axe 4 · Accessibilité / réglementaire (est.) ---
  const accessibilite = round1(0.55 * (100 - pressure) + 0.45 * crit(p.trafic))

  const axes: FaisaAxis[] = [
    {
      id: "marche",
      label: "Marché",
      note: marche,
      poids: FAISA_WEIGHTS.marche,
      detail: `${fmtInt(p.vehicles)} véhicules · trafic ${fmt1(crit(p.trafic))}/100 · pouvoir d'achat ${fmt1(crit(p.pouvoir))}/100 (est.)`,
      est: true,
    },
    {
      id: "concurrence",
      label: "Concurrence",
      note: concurrence,
      poids: FAISA_WEIGHTS.concurrence,
      detail: `${fmtInt(p.stations)} stations en service · ${fmt1(ratio)} véh./station${input.zoneBlanche ? " · zone blanche (ratio > 3ᵉ quartile national)" : ""}`,
      est: false,
    },
    {
      id: "foncier",
      label: "Foncier",
      note: foncier,
      poids: FAISA_WEIGHTS.foncier,
      detail:
        input.land?.pricePerM2 != null
          ? `${fmtInt(input.land.pricePerM2)} DT/m² · disponibilité ${fmt1(avail)}/100 · pression urbaine ${fmt1(pressure)}/100 (est.)`
          : `disponibilité ${fmt1(avail)}/100 · pression urbaine ${fmt1(pressure)}/100 (est.)`,
      est: true,
    },
    {
      id: "accessibilite",
      label: "Accessibilité / réglementaire",
      note: accessibilite,
      poids: FAISA_WEIGHTS.accessibilite,
      detail: `pression urbaine inversée ${fmt1(100 - pressure)}/100 + proxy axes routiers (trafic ${fmt1(crit(p.trafic))}/100) — estimation V1`,
      est: true,
    },
  ]

  const score = round1(
    axes.reduce((s, a) => s + (a.note * a.poids) / 100, 0),
  )

  let verdict: FaisaVerdict
  let verdictLabel: string
  let verdictDetail: string
  if (score >= 70) {
    verdict = "FEU_VERT"
    verdictLabel = "Feu vert"
    verdictDetail =
      "Profil favorable : le dossier mérite d'être instruit — lancez la checklist terrain et la simulation de rentabilité."
  } else if (score >= 50) {
    verdict = "FEU_ORANGE"
    verdictLabel = "Feu orange"
    verdictDetail =
      "Potentiel réel sous conditions : vérifiez les points faibles (axe le plus bas) avant d'engager des frais de dossier."
  } else {
    verdict = "FEU_ROUGE"
    verdictLabel = "Feu rouge"
    verdictDetail =
      "Profil défavorable en V1 : site à écarter ou à requalifier (format compact, partenariat foncier) — à documenter."
  }

  return { axes, score, verdict, verdictLabel, verdictDetail }
}

/* ============================== Checklist terrain ============================== */

/** Statut d'un point de contrôle (sélection locale — pas de base V1). */
export type ChecklistStatut = "A_VERIFIER" | "CONFORME" | "VIGILANCE" | "BLOQUANT"

export const CHECKLIST_STATUTS: readonly { id: ChecklistStatut; label: string }[] = [
  { id: "A_VERIFIER", label: "À vérifier" },
  { id: "CONFORME", label: "Conforme" },
  { id: "VIGILANCE", label: "Point de vigilance" },
  { id: "BLOQUANT", label: "Bloquant" },
]

export const CHECKLIST_STATUT_LABEL: Record<ChecklistStatut, string> = {
  A_VERIFIER: "À vérifier",
  CONFORME: "Conforme",
  VIGILANCE: "Point de vigilance",
  BLOQUANT: "Bloquant",
}

/** Un point de contrôle réel (libellé FR + aide de terrain). */
export type ChecklistPoint = {
  id: string
  groupe: string
  label: string
  aide: string
}

/** Les 14 points de contrôle (4 groupes — spec T54-B3b). */
export const CHECKLIST_POINTS: readonly ChecklistPoint[] = [
  // --- Accès & visibilité ---
  {
    id: "acc-vis",
    groupe: "Accès & visibilité",
    label: "Visibilité depuis la voie publique (enseigne lisible à 150 m)",
    aide: "Relever depuis la voirie aux heures de pointe ; vérifier les masques visuels (arbres, bâtiments).",
  },
  {
    id: "acc-entree",
    groupe: "Accès & visibilité",
    label: "Entrée / sortie distinctes, rayon de braquage camions",
    aide: "Cotes minimales : entrée ≥ 6 m, sortie ≥ 6 m ; épure d'un semi-remorque à surveiller.",
  },
  {
    id: "acc-signal",
    groupe: "Accès & visibilité",
    label: "Signalisation routière d'approche autorisée (prescriptions)",
    aide: "Autorisation de panneaux directionnels auprès de la voirie concernée (ARRT / municipalité).",
  },
  // --- Foncier & réglementation ---
  {
    id: "fon-aup",
    groupe: "Foncier & réglementation",
    label: "Affectation du terrain conforme au plan d'urbanisme (AUP)",
    aide: "Certificat d'urbanisme opérationnel à demander en mairie — zone d'activité ou économique.",
  },
  {
    id: "fon-bail",
    groupe: "Foncier & réglementation",
    label: "Bail foncier 9 ans minimum négocié (promesse écrite)",
    aide: "Loyer + indexation ; vérifier les charges de copropriété foncière éventuelles.",
  },
  {
    id: "fon-permis",
    groupe: "Foncier & réglementation",
    label: "Permis de bâtir mobilisable (délai municipal estimé)",
    aide: "Pré-consulte du dossier auprès de l'agence technique ; délai réaliste 3-6 mois.",
  },
  {
    id: "fon-dist",
    groupe: "Foncier & réglementation",
    label: "Distances réglementaires respectées (école, hôpital, point d'eau)",
    aide: "Règlement des installations classées : mesurer sur plan cadastral les rayons exigés.",
  },
  // --- Techniques : raccordements ---
  {
    id: "tec-elec",
    groupe: "Technique : raccordements",
    label: "Raccordement électrique : puissance ≥ 60 kVA disponible",
    aide: "Attestation STEG ; sinon poste de transformation à budgéter (délai 4-8 mois).",
  },
  {
    id: "tec-eau",
    groupe: "Technique : raccordements",
    label: "Alimentation en eau + pression incendie suffisante",
    aide: "Diamètre du branchement SONEDE ; réserve incendie ou borne à vérifier avec les secours.",
  },
  {
    id: "tec-assain",
    groupe: "Technique : raccordements",
    label: "Assainissement séparatif + séparateur d'hydrocarbures (exutoire)",
    aide: "ONAS ou assainissement autonome ; bassin de rétention des eaux hydrocarburées.",
  },
  {
    id: "tec-tel",
    groupe: "Technique : raccordements",
    label: "Couverture réseau / télécom (télésurveillance, paiement)",
    aide: "Tester les 3 opérateurs sur site ; liaison secours (4G) pour les automates 24/30.",
  },
  // --- Marché & bailleur ---
  {
    id: "mar-trafic",
    groupe: "Marché & bailleur",
    label: "Étude de trafic plan : comptage 7 jours sur l'axe principal",
    aide: "Comptage manuel ou extrait voirie ; convertir en potentiel de passages captés.",
  },
  {
    id: "mar-concu",
    groupe: "Marché & bailleur",
    label: "Concurrence rayon 2 km : relevé prix et débits observés",
    aide: "Relever prix des 2-3 stations voisines + horaires + files aux heures de pointe.",
  },
  {
    id: "mar-bailleur",
    groupe: "Marché & bailleur",
    label: "Promesses bailleur / franchiseur (exclusivité territoriale)",
    aide: "Écrit engageant sur la zone d'exclusivité et les travaux à la charge de chacun.",
  },
]

/** État persisté d'un point (statut + note libre). */
export type ChecklistEntry = { statut: ChecklistStatut; note: string }

/** État complet de la checklist d'un gouvernorat (sparse : défaut « À vérifier »). */
export type ChecklistState = Record<string, ChecklistEntry>

/** Slug de gouvernorat pour la clé sessionStorage (ex. « Le Kef » → le-kef). */
export function faisabiliteKey(gouvernorat: string): string {
  const slug = gouvernorat
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `carbuscope-faisabilite-${slug || "x"}`
}

/** Synthèse honnête de la checklist (comptages par statut). */
export function checklistSynthese(
  state: ChecklistState,
): { total: number; conformes: number; vigilances: number; bloquants: number; restants: number } {
  let conformes = 0
  let vigilances = 0
  let bloquants = 0
  let restants = 0
  for (const p of CHECKLIST_POINTS) {
    const e = state[p.id]
    if (!e || e.statut === "A_VERIFIER") restants += 1
    else if (e.statut === "CONFORME") conformes += 1
    else if (e.statut === "VIGILANCE") vigilances += 1
    else bloquants += 1
  }
  return { total: CHECKLIST_POINTS.length, conformes, vigilances, bloquants, restants }
}

/* ============================== Textes de synthèse ============================== */

/** Bloc « points de vigilance » pour l'export PDF : points non conformes. */
export function checklistVigilances(state: ChecklistState): string[] {
  const out: string[] = []
  for (const p of CHECKLIST_POINTS) {
    const e = state[p.id]
    if (e && (e.statut === "VIGILANCE" || e.statut === "BLOQUANT")) {
      out.push(
        `[${CHECKLIST_STATUT_LABEL[e.statut]}] ${p.label}${e.note.trim() ? ` — ${e.note.trim()}` : ""}`,
      )
    }
  }
  return out
}

/** Libellé FR du format recommandé n°1 (paramètre de la carte d'implantation). */
export function formatPrincipal(recos: readonly FormatRecommendation[]): FormatRecommendation | null {
  return recos.length > 0 ? recos[0] : null
}
