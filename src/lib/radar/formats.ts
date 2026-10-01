// ============================================================================
// CarbuScope — T54-B3a — MOTEUR « FORMATS RECOMMANDÉS » (TypeScript pur).
//
// Aucune dépendance (ni fetch, ni base, ni composant) — les entrées sont
// injectées par l'appelant. Le volet « Formats recommandés » du Radar
// consomme directement le résultat de /api/radar/scoring (GovernoratScore :
// 5 critères normalisés 0-100, véhicules, stations en service, score, rang).
//
// PRINCIPE : chaque gouvernorat reçoit les 5 formats classés par score
// d'adéquation 0-100. Le score part d'une base neutre de 50 puis des règles
// métier FR documentées ci-dessous l'ajustent (±). Chaque règle déclenchée
// produit une justification FR mentionnant le critère qui l'a motivée —
// les 2-3 plus fortes sont conservées (chips du volet).
//
// RÈGLES MÉTIER (arbitrages T54-B3a, cohérentes avec le moteur T54-B2) :
//   R1  trafic pondéré ≥ 70        → les formats à fort débit (classique,
//      food store) sont valorisés ; les formats compacts sont pénalisés
//      (site sous-exploité).
//   R2  zone blanche (ratio véh./station > 3ᵉ quartile national) et parc
//      modéré (< 60) → « compacte » favorisée : premier maillage d'un
//      territoire sous-équipé, investissement contenu.
//   R3  pouvoir d'achat ≥ 75 ET foncier < 35 (pression urbaine / foncier
//      cher) → « automatisée 24/30 » : format densifié, main-d'œuvre et
//      surface réduites, horaires étendus.
//   R4  foncier ≥ 70 (disponibilité + prix favorable) → « hub mobilité
//      hybride » : l'emprise nécessaire aux services TMP est mobilisable.
//   R5  pouvoir ≥ 75 ET trafic ≥ 50 → « food store » : la boutique
//      alimentaire capte le panier complémentaire d'une clientèle solvable.
//   R6  parc ≥ 60 / concurrence ≥ 60 → renfort des formats pleins service ;
//      parc < 40 / pouvoir < 55 → renfort des formats compacts.
//
// Le même fichier expose les DÉFAUTS DE SIMULATION par format (CAPEX, droit
// d'entrée, charges fixes mensuelles détaillées, part services/food) et le
// calcul du VOLUME SUGGÉRÉ (L/jour, est.) dérivé du profil réel du
// gouvernorat — consommés par le volet « Simulations de rentabilité ».
// ============================================================================

/* ============================== Formats ============================== */

export type FormatId = "classique" | "compacte" | "automatisee" | "food-store" | "hub-hybride"

/** Clé d'icône lucide (résolue côté composant — la lib reste pure TS). */
export type FormatIconKey = "fuel" | "zap" | "clock" | "store" | "locate"

export type StationFormat = {
  id: FormatId
  nom: string
  slogan: string
  description: string
  iconKey: FormatIconKey
  /** Nombre de pistes (libellé FR). */
  pistes: string
  /** CAPEX indicatif (DT). */
  capexMin: number
  capexMax: number
  /** Surface au sol (m²). */
  surfaceMin: number
  surfaceMax: number
  /** Délai de réalisation (mois). */
  delaiMin: number
  delaiMax: number
  /** Services / voies de revenus emblématiques. */
  services: string[]
}

/** Les 5 formats réels du programme d'implantation (plages T54-B3a). */
export const STATION_FORMATS: readonly StationFormat[] = [
  {
    id: "classique",
    nom: "Station classique",
    slogan: "Plein service",
    description: "Station plein service 6-8 pistes avec boutique de convenance.",
    iconKey: "fuel",
    pistes: "6 à 8 pistes",
    capexMin: 1_800_000,
    capexMax: 2_600_000,
    surfaceMin: 2_500,
    surfaceMax: 4_000,
    delaiMin: 12,
    delaiMax: 18,
    services: ["Boutique", "Lavage", "Gonflage / air", "Services rapides"],
  },
  {
    id: "compacte",
    nom: "Station compacte",
    slogan: "Premier maillage",
    description: "Station compacte 2-4 pistes pour zones blanches et parc modéré.",
    iconKey: "zap",
    pistes: "2 à 4 pistes",
    capexMin: 800_000,
    capexMax: 1_400_000,
    surfaceMin: 800,
    surfaceMax: 1_500,
    delaiMin: 8,
    delaiMax: 12,
    services: ["Kiosque", "Paiement automatique", "Gonflage / air"],
  },
  {
    id: "automatisee",
    nom: "Station automatisée 24/30",
    slogan: "Sans surveillance",
    description: "Station automatisée 24 h/24 et 30 j/30, personnel réduit au strict minimum.",
    iconKey: "clock",
    pistes: "2 à 4 pistes",
    capexMin: 900_000,
    capexMax: 1_600_000,
    surfaceMin: 600,
    surfaceMax: 1_200,
    delaiMin: 6,
    delaiMax: 10,
    services: ["Paiement CB 24/30", "Terminal libre-service", "Télésurveillance"],
  },
  {
    id: "food-store",
    nom: "Station + food store",
    slogan: "Convenience",
    description: "Station carburant adossée à un magasin alimentaire de convenance.",
    iconKey: "store",
    pistes: "6 à 8 pistes",
    capexMin: 2_200_000,
    capexMax: 3_200_000,
    surfaceMin: 3_000,
    surfaceMax: 5_000,
    delaiMin: 15,
    delaiMax: 20,
    services: ["Food store", "Boulangerie", "Espace détente", "Lavage"],
  },
  {
    id: "hub-hybride",
    nom: "Hub mobilité hybride",
    slogan: "Carburant + services",
    description: "Station carburant couplée aux services de mobilité (TMP).",
    iconKey: "locate",
    pistes: "4 à 6 pistes",
    capexMin: 1_200_000,
    capexMax: 2_000_000,
    surfaceMin: 1_500,
    surfaceMax: 2_500,
    delaiMin: 12,
    delaiMax: 16,
    services: ["Carburant", "Transport de personnes", "Logistique légère", "Entretien express"],
  },
]

export const FORMAT_BY_ID: Record<FormatId, StationFormat> = Object.fromEntries(
  STATION_FORMATS.map(f => [f.id, f]),
) as Record<FormatId, StationFormat>

/* ============================== Entrée profil ============================== */

/** Profil du gouvernorat — champs du GovernoratScore de /api/radar/scoring. */
export type GovProfileInput = {
  name: string
  /** Critères normalisés 0-100 (T54-B2). */
  parc: number
  pouvoir: number
  trafic: number
  concurrence: number
  foncier: number
  /** Chiffres réels du gouvernorat. */
  vehicles: number
  stations: number
  /** Score pondéré et rang nationaux (fallback de justification). */
  score: number
  rank: number
}

/* ============================== Sortie ============================== */

export type FormatRecommendation = {
  format: StationFormat
  /** Score d'adéquation 0-100 (base 50 + règles). */
  adequation: number
  /** Rang de recommandation (1 = mieux adapté). */
  rank: number
  /** 2-3 justifications FR (critère motivant inclus). */
  justifications: string[]
  /** CAPEX médian indicatif (DT) — sert de pré-remplissage simulation. */
  capexMedian: number
}

/** Une règle déclenchée : impact sur le score + justification FR. */
type Rule = { delta: number; reason: string; weight: number }

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const round1 = (v: number) => Math.round(v * 10) / 10

/** Applique les règles d'un format : score borné + justifications triées. */
function applyRules(base: number, rules: Rule[]): { adequation: number; justifications: string[] } {
  const total = rules.reduce((s, r) => s + r.delta, 0)
  const adequation = clamp(round1(base + total), 5, 96)
  // Justifications : les règles positives les plus fortes d'abord, puis les
  // réserves (règles négatives) — 3 maximum, minimum 1.
  const positives = rules.filter(r => r.delta > 0).sort((a, b) => b.weight - a.weight)
  const negatives = rules.filter(r => r.delta < 0).sort((a, b) => a.weight - b.weight)
  const picked: string[] = []
  for (const r of [...positives, ...negatives]) {
    if (picked.length >= 3) break
    picked.push(r.reason)
  }
  return { adequation, justifications: picked }
}

/* ============================== Moteur de recommandation ============================== */

/**
 * Classe les 5 formats pour un gouvernorat (règles R1-R6 documentées en tête
 * de fichier). `zoneBlancheRatio` = 3ᵉ quartile national du ratio véh./station
 * (zoneBlancheRatioThreshold du moteur T54-B2 — la zone est « blanche » si
 * ratio du gouvernorat > ce seuil).
 */
export function recommendFormats(
  profile: GovProfileInput,
  zoneBlancheRatio: number,
): FormatRecommendation[] {
  const ratio = profile.stations > 0 ? profile.vehicles / profile.stations : profile.vehicles
  const zoneBlanche = ratio > zoneBlancheRatio && zoneBlancheRatio > 0
  // Bornage défensif 0-100 : le moteur T54-B2 peut renvoyer un trafic légèrement
  // négatif pour les gouvernorats sans axe routier (norm100 non borné en bas) —
  // les règles et les justifications restent ainsi dans le contrat 0-100.
  const i = (v: number) => Math.round(Math.max(0, Math.min(100, v)))

  // ---- Station classique (R1, R5, R6) ----
  const classique = applyRules(50, [
    profile.trafic >= 70
      ? {
          delta: 26,
          weight: 26,
          reason: `Trafic pondéré fort (${i(profile.trafic)}/100) : un plein service valorise le débit`,
        }
      : null,
    profile.parc >= 60
      ? { delta: 14, weight: 14, reason: `Parc automobile dense (${i(profile.parc)}/100)` }
      : null,
    profile.concurrence >= 60
      ? {
          delta: 10,
          weight: 10,
          reason: `Offre concurrentielle limitée (${i(profile.concurrence)}/100)`,
        }
      : null,
    profile.trafic < 40
      ? {
          delta: -20,
          weight: 20,
          reason: `Débit insuffisant pour 6-8 pistes (trafic ${i(profile.trafic)}/100)`,
        }
      : null,
    profile.pouvoir < 45
      ? {
          delta: -14,
          weight: 14,
          reason: `Pouvoir d'achat faible (${i(profile.pouvoir)}/100) : boutique inadaptée`,
        }
      : null,
    profile.foncier < 30
      ? {
          delta: -10,
          weight: 10,
          reason: `Pression foncière élevée (foncier ${i(profile.foncier)}/100) : 2 500-4 000 m² difficiles`,
        }
      : null,
  ].filter((r): r is Rule => r != null))

  // ---- Station compacte (R2, R6, R1) ----
  const compacte = applyRules(50, [
    zoneBlanche && profile.parc < 60
      ? {
          delta: 26,
          weight: 26,
          reason: `Zone blanche (ratio véh./station ≈ ${i(ratio)}) : premier maillage compact`,
        }
      : null,
    profile.parc < 40
      ? { delta: 12, weight: 12, reason: `Parc modéré (${i(profile.parc)}/100) : 2-4 pistes suffisent` }
      : null,
    profile.trafic < 45
      ? {
          delta: 10,
          weight: 10,
          reason: `Trafic modéré (${i(profile.trafic)}/100) : dimensionnement contenu`,
        }
      : null,
    profile.pouvoir < 55
      ? {
          delta: 8,
          weight: 8,
          reason: `Pouvoir d'achat limité (${i(profile.pouvoir)}/100) : investissement contenu`,
        }
      : null,
    profile.trafic >= 70
      ? {
          delta: -14,
          weight: 14,
          reason: `Trafic fort (${i(profile.trafic)}/100) : format sous-dimensionné`,
        }
      : null,
    profile.parc >= 70
      ? {
          delta: -10,
          weight: 10,
          reason: `Parc très dense (${i(profile.parc)}/100) : saturation rapide`,
        }
      : null,
  ].filter((r): r is Rule => r != null))

  // ---- Station automatisée 24/30 (R3) ----
  const automatisee = applyRules(50, [
    profile.pouvoir >= 75 && profile.foncier < 35
      ? {
          delta: 28,
          weight: 28,
          reason: `Pouvoir d'achat élevé (${i(profile.pouvoir)}/100) et foncier tendu (${i(
            profile.foncier,
          )}/100) : format densifié et automatisé`,
        }
      : null,
    profile.pouvoir >= 70 && profile.foncier >= 35 && profile.foncier < 45
      ? {
          delta: 12,
          weight: 12,
          reason: `Contexte urbain dense (foncier ${i(profile.foncier)}/100) — automatisation 24/30`,
        }
      : null,
    profile.trafic >= 50
      ? {
          delta: 10,
          weight: 10,
          reason: `Flux régulier (trafic ${i(profile.trafic)}/100) : les horaires 24/30 rentabilisent l'automatisation`,
        }
      : null,
    profile.pouvoir < 45
      ? {
          delta: -12,
          weight: 12,
          reason: `Clientèle sensible au prix (${i(profile.pouvoir)}/100) : service humain préférable`,
        }
      : null,
    profile.foncier >= 65
      ? {
          delta: -8,
          weight: 8,
          reason: `Foncier disponible (${i(profile.foncier)}/100) : d'autres formats exploitent mieux la surface`,
        }
      : null,
  ].filter((r): r is Rule => r != null))

  // ---- Station + food store (R5, R1) ----
  const foodStore = applyRules(50, [
    profile.pouvoir >= 75 && profile.trafic >= 50
      ? {
          delta: 26,
          weight: 26,
          reason: `Pouvoir d'achat (${i(profile.pouvoir)}/100) et flux (${i(
            profile.trafic,
          )}/100) : le food store capte le panier complémentaire`,
        }
      : null,
    profile.trafic >= 70
      ? {
          delta: 10,
          weight: 10,
          reason: `Trafic fort (${i(profile.trafic)}/100) : flux clients élevé pour la boutique`,
        }
      : null,
    profile.concurrence >= 60
      ? {
          delta: 10,
          weight: 10,
          reason: `Concurrence limitée (${i(profile.concurrence)}/100) : différenciation convenience`,
        }
      : null,
    profile.pouvoir < 55
      ? {
          delta: -20,
          weight: 20,
          reason: `Pouvoir d'achat insuffisant (${i(profile.pouvoir)}/100) pour un food store`,
        }
      : null,
    profile.trafic < 45
      ? {
          delta: -12,
          weight: 12,
          reason: `Flux insuffisant (${i(profile.trafic)}/100) pour le convenience`,
        }
      : null,
  ].filter((r): r is Rule => r != null))

  // ---- Hub mobilité hybride (R4) ----
  const hub = applyRules(50, [
    profile.foncier >= 70
      ? {
          delta: 24,
          weight: 24,
          reason: `Foncier disponible (${i(profile.foncier)}/100) : l'emprise des services de mobilité est mobilisable`,
        }
      : null,
    profile.foncier >= 55 && profile.foncier < 70
      ? { delta: 10, weight: 10, reason: `Foncier correct (${i(profile.foncier)}/100)` }
      : null,
    profile.trafic >= 45
      ? {
          delta: 10,
          weight: 10,
          reason: `Flux de transit (trafic ${i(profile.trafic)}/100) : clientèle captée par les services`,
        }
      : null,
    profile.concurrence >= 55
      ? { delta: 6, weight: 6, reason: `Peu de concurrence locale (${i(profile.concurrence)}/100)` }
      : null,
    profile.foncier < 35
      ? {
          delta: -16,
          weight: 16,
          reason: `Foncier tendu (${i(profile.foncier)}/100) : emprise 1 500-2 500 m² compromise`,
        }
      : null,
  ].filter((r): r is Rule => r != null))

  const fallback = `Profil global : score ${profile.score.toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  })}/100 (rang ${profile.rank} national)`

  const results: FormatRecommendation[] = [
    { format: FORMAT_BY_ID.classique, rank: 0, ...classique, capexMedian: 2_200_000 },
    { format: FORMAT_BY_ID.compacte, rank: 0, ...compacte, capexMedian: 1_100_000 },
    { format: FORMAT_BY_ID.automatisee, rank: 0, ...automatisee, capexMedian: 1_250_000 },
    { format: FORMAT_BY_ID["food-store"], rank: 0, ...foodStore, capexMedian: 2_700_000 },
    { format: FORMAT_BY_ID["hub-hybride"], rank: 0, ...hub, capexMedian: 1_600_000 },
  ].map(r => ({
    ...r,
    // Garantie « 2-3 justifications » : fallback profil global si < 2 règles.
    justifications:
      r.justifications.length >= 2 ? r.justifications : [...r.justifications, fallback].slice(0, 3),
  }))

  results.sort((a, b) => b.adequation - a.adequation)
  results.forEach((r, idx) => {
    r.rank = idx + 1
  })
  return results
}

/* ============================== Défauts de simulation ============================== */

export type SimFormatDefaults = {
  /** CAPEX pré-rempli (DT). */
  capex: number
  /** Droit d'entrée / licence (DT). */
  droitEntree: number
  /** Charges fixes mensuelles détaillées (DT/mois, éditables). */
  charges: { personnel: number; loyer: number; energie: number; assurance: number }
  /** Part services/food par défaut (%, 0-40). */
  partServices: number
}

/**
 * Défauts pré-remplis du calculateur de rentabilité par format (est.).
 * Cohérents avec les plages CAPEX des formats (médiane) ; charges mensuelles
 * indicatives Tunisie (personnel, loyer foncier, énergie, assurance).
 */
export function simDefaultsFor(formatId: FormatId): SimFormatDefaults {
  switch (formatId) {
    case "classique":
      return {
        capex: 2_200_000,
        droitEntree: 200_000,
        charges: { personnel: 18_000, loyer: 4_000, energie: 5_000, assurance: 2_500 },
        partServices: 12,
      }
    case "compacte":
      return {
        capex: 1_100_000,
        droitEntree: 120_000,
        charges: { personnel: 8_000, loyer: 2_000, energie: 3_000, assurance: 1_500 },
        partServices: 8,
      }
    case "automatisee":
      return {
        capex: 1_250_000,
        droitEntree: 150_000,
        charges: { personnel: 4_500, loyer: 2_500, energie: 4_000, assurance: 1_500 },
        partServices: 5,
      }
    case "food-store":
      return {
        capex: 2_700_000,
        droitEntree: 250_000,
        charges: { personnel: 32_000, loyer: 6_000, energie: 7_000, assurance: 3_000 },
        partServices: 35,
      }
    case "hub-hybride":
      return {
        capex: 1_600_000,
        droitEntree: 180_000,
        charges: { personnel: 15_000, loyer: 4_000, energie: 5_000, assurance: 2_000 },
        partServices: 25,
      }
  }
}

/* ============================== Volume suggéré ============================== */

/**
 * Volume carburant suggéré (L/jour, est.) pour une NOUVELLE station :
 *   demande du gouvernorat ≈ véhicules × 2,6 L/jour (≈ 36 km/j × 7,2 L/100,
 *   transit poids lourds inclus partiellement — hypothèse indicative) ;
 *   part moyenne par station en service = demande ÷ stations ;
 *   facteur de captation du format (une station moderne et bien placée
 *   capte au-dessus de la moyenne locale ; un format compact, en dessous).
 * Arrondi à la centaine, borné 500-25 000 L/j (bornes du curseur).
 */
export function suggestLitresJour(profile: GovProfileInput, formatId: FormatId): number {
  const CAPTURE: Record<FormatId, number> = {
    classique: 1.6,
    compacte: 0.9,
    automatisee: 1.1,
    "food-store": 1.9,
    "hub-hybride": 1.3,
  }
  const demandeJour = profile.vehicles * 2.6
  const parStation = profile.stations > 0 ? demandeJour / profile.stations : demandeJour * 0.05
  const brut = parStation * CAPTURE[formatId]
  const arrondi = Math.round(brut / 100) * 100
  return clamp(arrondi, 500, 25_000)
}
