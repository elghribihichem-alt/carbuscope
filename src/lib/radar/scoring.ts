// ============================================================================
// CarbuScope — T54-B2 — MOTEUR DE SCORING D'OPPORTUNITÉS (5 critères, 0-100).
//
// TypeScript PUR et testable : aucune dépendance (ni fetch, ni base, ni
// composant). Les entrées sont INJECTÉES par l'appelant :
//   · côté serveur  : routes /api/radar/* (lecture directe Prisma) ;
//   · côté client   : volet « Scoring d'opportunités » (recalcul instantané
//                     des simulations de poids what-if, même moteur partagé).
//
// CRITÈRES (poids par défaut 30/20/25/15/10, configurés par la Super
// Administration dans OpportunityConfig — jamais en dur ici) :
//   1. parc (30)        : GovernoratStat.vehicles normalisé min-max. La somme
//                         DemographicDelegation par gouvernorat est inférieure
//                         aux chiffres INS (133/277 délégations non renseignées)
//                         → GovernoratStat est la RÉFÉRENCE (contrat T54-B2).
//   2. pouvoir (20)     : PurchasingPower.index — indice synthétique déjà
//                         normalisé 0-100 par conception (est., badge « est. »).
//   3. trafic (25)      : agrégation RoadAxis par gouvernorat (méthode ci-
//                         dessous), tmj PONDÉRÉ poids lourds puis normalisé.
//   4. concurrence (15) : INVERSE de la densité de stations réelles en service
//                         (ACTIVE + RÉNOVATION) rapportée aux véhicules — même
//                         logique métier que computeGovStats
//                         (src/components/implantation/implantation-shared.tsx,
//                         fichier gelé T53 non modifié) : ratio véh./station.
//   5. foncier (10)     : LandIndicator — (disponibilité normalisée + inverse
//                         du prix au m² normalisé) / 2 (est., éditeur SA).
//
// MÉTHODE TRAFIC (documentée) : chaque SEGMENT de chaque axe est affecté au
// gouvernorat dont le chef-lieu est le plus proche du milieu du segment (table
// des 24 centroïdes réels en dur ci-dessous) ; le TMJ pondéré de l'axe
// (tmj × (1 + heavyVehiclePct/100)) est ensuite réparti au prorata des
// segments tombant dans chaque gouvernorat, puis sommé par gouvernorat et
// normalisé min-max sur les 24. Justification : les 9 axes sont des tracés
// nationaux (Tunis → Sfax / Gabès / Bou Salem…) — affecter le trafic entier
// à l'unique gouvernorat du point médian concentrerait 100 % de l'autoroute A1
// sur Monastir et laisserait le Grand Tunis à zéro ; la répartition par
// segments traduit le passage EFFECTIF de l'axe dans chaque gouvernorat
// (Tunis n°1 — extrémité de tous les axes — puis Bizerte, Béja…).
//
// Score total = Σ (critère × poids / 100), arrondi à 1 décimale, borné 0-100.
// ============================================================================

/* ============================== Types d'entrée ============================== */

/** Poids des 5 critères en % (somme 100, validée par la route config). */
export type ScoringWeights = {
  parc: number
  purchasing: number
  trafic: number
  concurrence: number
  foncier: number
}

/** Un axe routier avec son tracé (segments [lng, lat] — convention GeoJSON). */
export type ScoringRoadAxis = {
  tmj: number
  heavyVehiclePct: number
  segments: Array<[number, number]>
}

export type ScoringPurchasing = { index: number }

export type ScoringLand = {
  pricePerM2: number | null
  availability: number
}

/** Un gouvernorat consolidé (la concurrence = stations en service réelles). */
export type ScoringGovernorat = {
  name: string
  population: number
  vehicles: number
  stationsInService: number
  purchasing: ScoringPurchasing | null
  land: ScoringLand | null
}

/** Une délégation (parc réel quand renseigné, sinon estimé au reliquat). */
export type ScoringDelegation = {
  gouvernorat: string
  delegation: string
  population: number | null
  parc: number | null
}

/** Entrées complètes du moteur (injectées, jamais fetchées ici). */
export type ScoringInputs = {
  governorats: ScoringGovernorat[]
  roads: ScoringRoadAxis[]
  delegations: ScoringDelegation[]
}

/* ============================== Types de sortie ============================== */

export type GovernoratScore = {
  name: string
  region: RegionKey
  score: number
  rank: number
  parc: number
  pouvoir: number
  trafic: number
  concurrence: number
  foncier: number
  vehicles: number
  population: number
  stations: number
  /** True si au moins un critère dérivé est estimé (pouvoir/foncier V1). */
  estimated: boolean
}

export type DelegationScore = {
  gouvernorat: string
  name: string
  score: number
  rank: number
  /** Parc de véhicules (réel ou estimé — cf. estimated). */
  parc: number
  population: number
  estimated: boolean
}

/* ============================== Régions (filtre) ============================== */

/**
 * Filtre région du volet scoring — mapping simple et documenté des 24
 * gouvernorats (regroupement des 7 régions INS en 4 buckets lisibles) :
 *   · Grand Tunis (4) : Tunis, Ariana, Ben Arous, Manouba ;
 *   · Nord (7, INS Nord-Est + Nord-Ouest) : Bizerte, Nabeul, Zaghouan,
 *     Béja, Jendouba, Le Kef, Siliana ;
 *   · Centre (7, INS Centre-Est + Centre-Ouest) : Sousse, Monastir, Mahdia,
 *     Sfax, Kairouan, Kasserine, Sidi Bouzid ;
 *   · Sud (6, INS Sud-Est + Sud-Ouest) : Gabès, Médenine, Tataouine,
 *     Gafsa, Tozeur, Kébili.
 */
export type RegionKey = "GRAND_TUNIS" | "NORD" | "CENTRE" | "SUD"

export const REGION_LABELS: Record<RegionKey, string> = {
  GRAND_TUNIS: "Grand Tunis",
  NORD: "Nord",
  CENTRE: "Centre",
  SUD: "Sud",
}

const GOV_REGION: Record<string, RegionKey> = {
  Tunis: "GRAND_TUNIS",
  Ariana: "GRAND_TUNIS",
  "Ben Arous": "GRAND_TUNIS",
  Manouba: "GRAND_TUNIS",
  Bizerte: "NORD",
  Nabeul: "NORD",
  Zaghouan: "NORD",
  Béja: "NORD",
  Jendouba: "NORD",
  "Le Kef": "NORD",
  Siliana: "NORD",
  Sousse: "CENTRE",
  Monastir: "CENTRE",
  Mahdia: "CENTRE",
  Sfax: "CENTRE",
  Kairouan: "CENTRE",
  Kasserine: "CENTRE",
  "Sidi Bouzid": "CENTRE",
  Gabès: "SUD",
  Médenine: "SUD",
  Tataouine: "SUD",
  Gafsa: "SUD",
  Tozeur: "SUD",
  Kébili: "SUD",
}

/* ============================== Centroïdes (en dur) ============================== */

/**
 * Centroïdes des 24 gouvernorats — coordonnées réelles [lng, lat] des
 * chefs-lieux (référence : chefs-lieux de gouvernorat, alignés sur la table
 * GOV_CENTERS de la carte). Table en dur : le moteur ne dépend d'aucun
 * module de composants.
 */
export const GOV_CENTERS: Record<string, [number, number]> = {
  Tunis: [10.18, 36.8],
  Ariana: [10.19, 36.86],
  "Ben Arous": [10.23, 36.75],
  Manouba: [10.1, 36.81],
  Nabeul: [10.74, 36.45],
  Zaghouan: [10.14, 36.4],
  Bizerte: [9.87, 37.27],
  Béja: [9.18, 36.72],
  Jendouba: [8.78, 36.5],
  "Le Kef": [8.7, 36.17],
  Siliana: [9.37, 36.08],
  Sousse: [10.63, 35.83],
  Monastir: [10.83, 35.78],
  Mahdia: [11.06, 35.5],
  Sfax: [10.76, 34.74],
  Kairouan: [10.09, 35.68],
  Kasserine: [8.83, 35.17],
  "Sidi Bouzid": [9.48, 35.38],
  Gabès: [10.11, 33.89],
  Médenine: [10.5, 33.35],
  Tataouine: [10.92, 32.93],
  Gafsa: [8.78, 34.42],
  Tozeur: [8.13, 33.92],
  Kébili: [8.77, 33.7],
}

/* ============================== Helpers purs ============================== */

/** Normalisation min-max → 0-100 (série constante → 50, neutre). */
const norm100 = (v: number, min: number, max: number): number => {
  if (max <= min) return 50
  return (100 * (v - min)) / (max - min)
}

/** Quantile R-7 (interpolation linéaire) sur une série TRIÉE croissante —
 *  même méthode que computeGovStats (implantation-shared.tsx, gelé). */
export function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const h = (sorted.length - 1) * p
  const lo = Math.floor(h)
  const hi = Math.min(lo + 1, sorted.length - 1)
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
}

const round1 = (v: number): number => Math.round(v * 10) / 10

/** Distance haversine approximée (km) — pure, sans dépendance. */
function distKm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = Math.PI / 180
  const dLat = (lat2 - lat1) * R
  const dLng = (lng2 - lng1) * R
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * R) * Math.cos(lat2 * R) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Ratio véhicules / station en service (offre réelle). Gouvernorat sans
 *  station : valeur dégradée = parc entier (extrême haut, même convention
 *  que computeGovStats). */
const ratioVehParStation = (vehicles: number, stations: number): number =>
  stations > 0 ? vehicles / stations : vehicles

/* ============================== Critère trafic ============================== */

/**
 * TMJ pondéré poids lourds par gouvernorat (méthode documentée en tête de
 * fichier) : tmj × (1 + heavyVehiclePct/100), réparti au prorata des
 * segments de l'axe affectés au gouvernorat le plus proche.
 */
export function traficPondereParGouvernorat(
  roads: ScoringRoadAxis[],
): Map<string, number> {
  const byGov = new Map<string, number>()
  const centerEntries = Object.entries(GOV_CENTERS)
  for (const axis of roads) {
    const segs = axis.segments
    if (!Array.isArray(segs) || segs.length === 0) continue
    const weighted = axis.tmj * (1 + axis.heavyVehiclePct / 100)
    // Répartition des segments de l'axe par gouvernorat le plus proche.
    const segOwner = new Map<string, number>()
    for (const s of segs) {
      const lng = Array.isArray(s) ? s[0] : NaN
      const lat = Array.isArray(s) ? s[1] : NaN
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
      let best = ""
      let bestD = Infinity
      for (const [gov, [clng, clat]] of centerEntries) {
        const d = distKm(lng, lat, clng, clat)
        if (d < bestD) {
          bestD = d
          best = gov
        }
      }
      if (best) segOwner.set(best, (segOwner.get(best) ?? 0) + 1)
    }
    const nbSeg = [...segOwner.values()].reduce((a, b) => a + b, 0)
    if (nbSeg === 0) continue
    for (const [gov, n] of segOwner) {
      byGov.set(gov, (byGov.get(gov) ?? 0) + (weighted * n) / nbSeg)
    }
  }
  return byGov
}

/* ============================== Critères 24 gouvernorats ============================== */

/** Critères bruts normalisés 0-100 d'un gouvernorat (avant pondération). */
export type GovCriteria = {
  parc: number
  pouvoir: number
  trafic: number
  concurrence: number
  foncier: number
  ratio: number
  stations: number
  vehicles: number
  population: number
  estimated: boolean
}

/**
 * Calcule les 5 critères normalisés 0-100 pour les 24 gouvernorats.
 * Exposé séparément : la détection d'alertes et le drill-down délégations
 * réutilisent ces valeurs.
 */
export function computeCriteria(inputs: ScoringInputs): Map<string, GovCriteria> {
  const govs = inputs.governorats

  // --- parc : min-max sur GovernoratStat.vehicles (référence INS) ---
  const vehiclesList = govs.map(g => g.vehicles)
  const minVeh = Math.min(...vehiclesList)
  const maxVeh = Math.max(...vehiclesList)

  // --- pouvoir d'achat : indice 0-100 déjà normalisé (défaut neutre 50) ---
  // --- foncier : (dispo normalisée + inverse prix normalisé) / 2 ---
  const availList = govs.map(g => g.land?.availability ?? 50)
  const minAvail = Math.min(...availList)
  const maxAvail = Math.max(...availList)
  const prices = govs
    .map(g => g.land?.pricePerM2)
    .filter((p): p is number => p != null && p > 0)
  const minPrice = prices.length ? Math.min(...prices) : 0
  const maxPrice = prices.length ? Math.max(...prices) : 0

  // --- trafic : TMJ pondéré réparti par segments (méthode documentée) ---
  const trafic = traficPondereParGouvernorat(inputs.roads)
  const traficValues = [...trafic.values()]
  const minTraf = traficValues.length ? Math.min(...traficValues) : 0
  const maxTraf = traficValues.length ? Math.max(...traficValues) : 0

  // --- concurrence : ratio véh./station (INVERSE de la densité de stations) ---
  const ratios = govs.map(g => ratioVehParStation(g.vehicles, g.stationsInService))
  const minRatio = Math.min(...ratios)
  const maxRatio = Math.max(...ratios)

  const out = new Map<string, GovCriteria>()
  govs.forEach((g, i) => {
    const ratio = ratios[i]
    const index = g.purchasing?.index
    const avail = g.land?.availability ?? 50
    const price = g.land?.pricePerM2
    // Foncier : prix manquant → critère = disponibilité seule.
    const foncier =
      price != null && price > 0 && maxPrice > minPrice
        ? (norm100(avail, minAvail, maxAvail) + (100 - norm100(price, minPrice, maxPrice))) / 2
        : norm100(avail, minAvail, maxAvail)
    const tmj = trafic.get(g.name) ?? 0
    out.set(g.name, {
      parc: norm100(g.vehicles, minVeh, maxVeh),
      pouvoir: Math.max(0, Math.min(100, index ?? 50)),
      trafic: norm100(tmj, minTraf, maxTraf),
      concurrence: norm100(ratio, minRatio, maxRatio),
      foncier,
      ratio,
      stations: g.stationsInService,
      vehicles: g.vehicles,
      population: g.population,
      estimated: g.purchasing != null || g.land != null,
    })
  })
  return out
}

/**
 * Classement des 24 gouvernorats (score total pondéré). Résultat trié par
 * score décroissant, rang 1-24. Poids INJECTÉS (jamais fetchés ici).
 */
export function scoreGouvernorats(
  inputs: ScoringInputs,
  weights: ScoringWeights,
): GovernoratScore[] {
  const criteria = computeCriteria(inputs)
  const wSum =
    weights.parc + weights.purchasing + weights.trafic + weights.concurrence + weights.foncier
  const rows = [...criteria.entries()].map(([name, c]) => {
    // Poids non sommés à 100 (simulation client libre) → normalisation
    // implicite par la somme effective (somme nulle → neutre 50).
    const k = wSum > 0 ? 100 / wSum : 0
    const score = Math.max(
      0,
      Math.min(
        100,
        round1(
          (k *
            (c.parc * weights.parc +
              c.pouvoir * weights.purchasing +
              c.trafic * weights.trafic +
              c.concurrence * weights.concurrence +
              c.foncier * weights.foncier)) /
            100,
        ),
      ),
    )
    return {
      name,
      region: GOV_REGION[name] ?? "CENTRE",
      score,
      rank: 0,
      parc: round1(c.parc),
      pouvoir: round1(c.pouvoir),
      trafic: round1(c.trafic),
      concurrence: round1(c.concurrence),
      foncier: round1(c.foncier),
      vehicles: c.vehicles,
      population: c.population,
      stations: c.stations,
      // V1 : pouvoir d'achat et foncier sont des estimations dérivées.
      estimated: true,
    }
  })
  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "fr"))
  rows.forEach((r, i) => {
    r.rank = i + 1
  })
  return rows
}

/* ============================== Seuil zones blanches ============================== */

/**
 * Seuil de densité des « zones blanches existantes » : 3ᵉ quartile (R-7) du
 * ratio véh./station des 24 gouvernorats — même convention que
 * computeGovStats (ratio > q3 ⇔ densité de stations sous le seuil).
 */
export function zoneBlancheRatioThreshold(inputs: ScoringInputs): number {
  const ratios = inputs.governorats
    .map(g => ratioVehParStation(g.vehicles, g.stationsInService))
    .sort((a, b) => a - b)
  return quantile(ratios, 0.75)
}

/* ============================== Score délégations ============================== */

/**
 * Prépare les délégations d'un gouvernorat : parc et population réels quand
 * renseignés, sinon estimation par répartition du reliquat du gouvernorat
 * (badge « est. »). Retourne toutes les délégations du gouvernorat.
 */
function resolveDelegations(
  gouvernorat: string,
  inputs: ScoringInputs,
): Array<{ name: string; parc: number; population: number; estimated: boolean }> {
  const gov = inputs.governorats.find(g => g.name === gouvernorat)
  const rows = inputs.delegations.filter(d => d.gouvernorat === gouvernorat)
  if (rows.length === 0) return []

  const knownParc = rows.reduce((s, d) => s + (d.parc ?? 0), 0)
  const knownPop = rows.reduce((s, d) => s + (d.population ?? 0), 0)
  const nbUnknownParc = rows.filter(d => d.parc == null).length
  const nbUnknownPop = rows.filter(d => d.population == null).length
  const totalVeh = gov?.vehicles ?? knownParc
  const totalPop = gov?.population ?? knownPop
  // Reliquat (borné à ≥ 0 : les chiffres INS gouvernorat priment).
  const parcShare = Math.max(0, totalVeh - knownParc) / Math.max(1, nbUnknownParc)
  const popShare = Math.max(0, totalPop - knownPop) / Math.max(1, nbUnknownPop)

  return rows.map(d => {
    const estimated = d.parc == null
    return {
      name: d.delegation,
      parc: d.parc ?? Math.round(parcShare),
      population: d.population ?? Math.round(popShare),
      estimated,
    }
  })
}

/** Min/max du parc sur l'ensemble des délégations résolues (comparabilité
 *  nationale des scores de délégations, classement « à la française »). */
function parcBounds(inputs: ScoringInputs): { min: number; max: number } {
  const values: number[] = []
  const govs = new Set(inputs.delegations.map(d => d.gouvernorat))
  for (const g of govs) {
    for (const d of resolveDelegations(g, inputs)) values.push(d.parc)
  }
  if (values.length === 0) return { min: 0, max: 0 }
  return { min: Math.min(...values), max: Math.max(...values) }
}

/**
 * Drill-down : score des délégations d'UN gouvernorat.
 *   · parc : réel (DemographicDelegation), normalisé min-max sur les 277
 *     délégations (estimation au reliquat pour les non renseignées) ;
 *   · autres critères : valeur du gouvernorat répartie AU PRORATA DE LA
 *     POPULATION — une délégation de taille moyenne hérite du score du
 *     gouvernorat ; une délégation plus grande / plus petite le majore /
 *     le minore proportionnellement (facteur pop / pop moyenne des
 *     délégations du gouvernorat, borné ×0,5 - ×2, critère plafonné à 100) ;
 *   · badge « est. » partout sauf parc/population réels.
 * Score total = Σ (critère × poids/100), arrondi à 1 décimale, borné 0-100.
 */
export function scoreDelegations(
  gouvernorat: string,
  inputs: ScoringInputs,
  weights: ScoringWeights,
): DelegationScore[] {
  return scoreAllDelegations(inputs, weights).filter(d => d.gouvernorat === gouvernorat)
}

/**
 * Score de TOUTES les délégations (277) — base du « Top 50 délégations ».
 * Même moteur que scoreDelegations (un seul passage, filtrage ensuite).
 */
export function scoreAllDelegations(
  inputs: ScoringInputs,
  weights: ScoringWeights,
): DelegationScore[] {
  const criteria = computeCriteria(inputs)
  const bounds = parcBounds(inputs)
  const wSum =
    weights.parc + weights.purchasing + weights.trafic + weights.concurrence + weights.foncier
  const k = wSum > 0 ? 100 / wSum : 0

  const govs = new Set(inputs.delegations.map(d => d.gouvernorat))
  const rows: DelegationScore[] = []
  for (const govName of govs) {
    const c = criteria.get(govName)
    if (!c) continue
    const delegs = resolveDelegations(govName, inputs)
    if (delegs.length === 0) continue
    const avgPop = c.population > 0 ? c.population / delegs.length : 0
    for (const d of delegs) {
      // Facteur population : prorata relatif à la délégation moyenne.
      const factor = avgPop > 0 ? Math.max(0.5, Math.min(2, d.population / avgPop)) : 1
      const parcCrit = norm100(d.parc, bounds.min, bounds.max)
      const pouvoir = Math.min(100, c.pouvoir * factor)
      const trafic = Math.min(100, c.trafic * factor)
      const concurrence = Math.min(100, c.concurrence * factor)
      const foncier = Math.min(100, c.foncier * factor)
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
      rows.push({
        gouvernorat: govName,
        name: d.name,
        score,
        rank: 0,
        parc: d.parc,
        population: d.population,
        estimated: d.estimated,
      })
    }
  }
  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "fr"))
  rows.forEach((r, i) => {
    r.rank = i + 1
  })
  return rows
}
