// ============================================================================
// CarbuScope — T55-a — MOTEUR DE SCORING PAR CITÉ (3ᵉ niveau du Radar).
//
// TypeScript PUR et testable : aucune dépendance (ni fetch, ni base, ni
// composant). Réutilise UNIQUEMENT les helpers déjà EXPORTÉS du moteur
// T54-B2 (src/lib/radar/scoring.ts, fichier GELÉ — jamais modifié ici) :
// computeCriteria() fournit les 5 critères normalisés 0-100 par gouvernorat.
//
// Le niveau cité suit la MÊME LOGIQUE que le niveau délégation
// (scoreAllDelegations, contrat T54-B2), transposée au trio
// gouvernorat → délégation → cité :
//   · parc (30) : RÉEL — somme des 5 catégories de véhicules
//     (DemographicCite.vehiclesLight/Utility/Heavy/Buses/Motorcycles,
//     source « INS 2024 » / « Import SA »), normalisé min-max sur l'ensemble
//     des cités référencées (comparabilité nationale, même convention que le
//     classement des 277 délégations) ;
//   · 4 autres critères (pouvoir 20 / trafic 25 / concurrence 15 / foncier
//     10) : valeur du GOUVERNORAT répartie AU PRORATA DE LA POPULATION
//     INTRA-DÉLÉGATION — une cité de taille moyenne hérite du niveau du
//     gouvernorat ; une cité plus grande / plus petite le majore / le
//     minore proportionnellement (facteur pop_cité / pop moyenne des cités
//     de la délégation, borné ×0,5 - ×2, critère plafonné à 100) ;
//   · parcPerHabitant : véhicules pour 1 000 habitants, arrondi
//     (parc réel / population réelle INS).
//
// Estimations (badge « est. ») : le parc et la population sont RÉELS à
// 100 % dans le référentiel INS 2024 ; les 4 critères non-parc sont eux
// TOUJOURS répartis au prorata → `estimated: true` sur chaque ligne
// (le badge signalant les critères estimés, pas les données de parc).
//
// Couverture honnête : le référentiel DemographicCite couvre une partie
// des gouvernorats seulement (les autres restent au niveau délégation —
// message « vide honnête » côté UI, jamais de cité fabriquée).
//
// Score total = Σ (critère × poids / 100) normalisé par la somme des poids
// (simulation what-if libre côté client), arrondi à 1 décimale, borné 0-100.
// ============================================================================

import {
  computeCriteria,
  type GovCriteria,
  type ScoringInputs,
  type ScoringWeights,
} from "./scoring"

/* ============================== Types d'entrée ============================== */

/** Une cité du référentiel DemographicCite (parc = somme des 5 catégories). */
export type CiteInput = {
  gouvernorat: string
  delegation: string
  cite: string
  population: number | null
  /** Parc réel (somme des 5 catégories) — null → estimé (défensif). */
  parc: number | null
  /** « INS 2024 » | « Import SA » — badge source côté UI. */
  source: string
}

/** Critères bruts normalisés 0-100 d'une cité (avant pondération). */
export type CiteCriteria = {
  parc: number
  pouvoir: number
  trafic: number
  concurrence: number
  foncier: number
}

/* ============================== Types de sortie ============================== */

export type CiteScore = {
  gouvernorat: string
  delegation: string
  cite: string
  /** Population réelle INS (ou estimation défensive si non renseignée). */
  population: number
  /** Parc de véhicules réel (somme des 5 catégories). */
  parc: number
  /** Véhicules pour 1 000 habitants (arrondi). */
  parcPerHabitant: number
  score: number
  /** Rang NATIONAL sur l'ensemble des cités référencées (1 = meilleure). */
  rank: number
  /** True : 4 critères non-parc estimés au prorata population (parc/pop réels). */
  estimated: boolean
  source: string
}

/* ============================== Helpers locaux ============================== */

/** Normalisation min-max → 0-100 (série constante → 50, neutre) — même
 *  convention que norm100 (scoring.ts, non exporté pour ne pas toucher au
 *  moteur gelé — réplication à l'identique, 3 lignes). */
const norm100 = (v: number, min: number, max: number): number => {
  if (max <= min) return 50
  return (100 * (v - min)) / (max - min)
}

const round1 = (v: number): number => Math.round(v * 10) / 10

/** Critères de repli neutres (gouvernorat absent du moteur — défensif,
 *  n'arrive pas avec le référentiel INS 24 gouvernorats). */
const NEUTRAL_CRITERIA: GovCriteria = {
  parc: 50,
  pouvoir: 50,
  trafic: 50,
  concurrence: 50,
  foncier: 50,
  ratio: 0,
  stations: 0,
  vehicles: 0,
  population: 0,
  estimated: true,
}

/* ============================== Moteur ============================== */

/**
 * Score de TOUTES les cités du référentiel (515) — base du mode
 * « Cités — Top 150 » et du drill-down délégation → cités.
 *
 *   · parc : réel, normalisé min-max sur l'ensemble des cités ;
 *   · autres critères : valeur du gouvernorat × facteur population
 *     intra-délégation (pop_cité / pop moyenne des cités de la délégation,
 *     borné ×0,5 - ×2, plafonné 100) ;
 *   · rang NATIONAL (1-515) attribué après tri score décroissant
 *     (tie-break : nom de cité, collation française).
 */
export function scoreCites(
  inputs: ScoringInputs,
  cites: CiteInput[],
  weights: ScoringWeights,
): CiteScore[] {
  if (cites.length === 0) return []

  const criteria = computeCriteria(inputs)
  const wSum =
    weights.parc + weights.purchasing + weights.trafic + weights.concurrence + weights.foncier
  const k = wSum > 0 ? 100 / wSum : 0

  // Population moyenne des cités de chaque délégation (base du facteur
  // prorata intra-délégation — identique en esprit au facteur population
  // du niveau délégation, ramené au trio gouvernorat/délégation/cité).
  const avgPopByDeleg = new Map<string, number>()
  const popByDeleg = new Map<string, { sum: number; n: number }>()
  for (const c of cites) {
    if (c.population == null || c.population <= 0) continue
    const key = `${c.gouvernorat}||${c.delegation}`
    const acc = popByDeleg.get(key) ?? { sum: 0, n: 0 }
    acc.sum += c.population
    acc.n += 1
    popByDeleg.set(key, acc)
  }
  for (const [key, acc] of popByDeleg) {
    avgPopByDeleg.set(key, acc.sum / Math.max(1, acc.n))
  }

  // Bornes min-max du parc sur l'ensemble des cités (réelles + estimées
  // défensives — comparabilité nationale du critère parc).
  const resolvedParc = cites.map(c =>
    c.parc != null ? c.parc : estimateParc(c, inputs, avgPopByDeleg),
  )
  const minParc = Math.min(...resolvedParc)
  const maxParc = Math.max(...resolvedParc)

  const rows: CiteScore[] = cites.map((c, i) => {
    const crit = criteria.get(c.gouvernorat) ?? NEUTRAL_CRITERIA

    // Population : réelle INS ; défensif → moyenne des cités de la délégation.
    const population =
      c.population != null && c.population > 0
        ? c.population
        : Math.round(avgPopByDeleg.get(`${c.gouvernorat}||${c.delegation}`) ?? 0)
    // Parc : réel (somme des 5 catégories) ; défensif → prorata véh./hab. du
    // gouvernorat appliqué à la population (jamais déclenché avec l'INS 2024).
    const parc = resolvedParc[i]

    // Facteur population intra-délégation (borné ×0,5 - ×2).
    const avgPop = avgPopByDeleg.get(`${c.gouvernorat}||${c.delegation}`) ?? 0
    const factor = avgPop > 0 ? Math.max(0.5, Math.min(2, population / avgPop)) : 1

    const parcCrit = norm100(parc, minParc, maxParc)
    const pouvoir = Math.min(100, crit.pouvoir * factor)
    const trafic = Math.min(100, crit.trafic * factor)
    const concurrence = Math.min(100, crit.concurrence * factor)
    const foncier = Math.min(100, crit.foncier * factor)

    const score = Math.max(
      0,
      Math.min(
        100,
        round1(
          (k *
            (parcCrit * weights.parc +
              pouvoir * weights.purchasing +
              trafic * weights.trafic +
              concurrence * weights.concurrence +
              foncier * weights.foncier)) /
            100,
        ),
      ),
    )

    return {
      gouvernorat: c.gouvernorat,
      delegation: c.delegation,
      cite: c.cite,
      population,
      parc,
      parcPerHabitant: population > 0 ? Math.round((parc / population) * 1000) : 0,
      score,
      rank: 0,
      // Parc et population sont réels ; les 4 critères non-parc sont
      // répartis au prorata → la ligne porte le badge « est. ».
      estimated: true,
      source: c.source,
    }
  })

  rows.sort((a, b) => b.score - a.score || a.cite.localeCompare(b.cite, "fr"))
  rows.forEach((r, i) => {
    r.rank = i + 1
  })
  return rows
}

/** Parc estimé défensif (cité sans catégories de véhicules — n'arrive pas
 *  avec l'INS 2024) : ratio véh./hab. du gouvernorat × population. */
function estimateParc(
  c: CiteInput,
  inputs: ScoringInputs,
  avgPopByDeleg: Map<string, number>,
): number {
  const gov = inputs.governorats.find(g => g.name === c.gouvernorat)
  const population =
    c.population != null && c.population > 0
      ? c.population
      : Math.round(avgPopByDeleg.get(`${c.gouvernorat}||${c.delegation}`) ?? 0)
  const ratio = gov && gov.population > 0 ? gov.vehicles / gov.population : 0.25
  return Math.max(0, Math.round(population * ratio))
}

/** Nombre de gouvernorats couverts par le référentiel cités (note honnête). */
export function coveredGouvernorats(cites: CiteInput[]): number {
  return new Set(cites.map(c => c.gouvernorat)).size
}
