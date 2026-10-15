// ============================================================================
// CarbuScope — Module « Publicité » (T58) : seed des supports publicitaires
// des RÉGIES EXTERNES (données FICTIVES plausibles demandées par l'utilisateur
// — « dans chaque onglet on insère des données fictives des supports
// publicitaires par mode »). Exécution : bun prisma/seed-pub.ts
//
// Réinitialise AdSupport + AdCampaign (tables autonomes, aucune FK entrante)
// puis insère :
//   · CARTOGRAPHIE (~30) — grands formats géolocalisés sur les axes routiers
//     (RN/A1/boulevards) de 12 gouvernorats forts ;
//   · METRO (~24) — habillages/écrans des stations du métro léger du
//     Grand Tunis (piétons captifs) ;
//   · RFR (~18) — habillages/écrans du réseau ferré rapide (banlieue sud
//     tunisoise + branche nord) ;
//   · URBAIN (~24) — mobilier urbain (abribus, colonnes, bornes) des
//     grandes artères.
//   · 3 campagnes d'exemple (enseigne agil) → volet « Rapports » — statuts
//     diversifiés T59 (SIMULEE / EN_COURS / VALIDEE) pour illustrer le cycle
//     de vie des campagnes publicitaires.
//
// Régies FICTIVES plausibles : les 5 du référentiel Media Planner (cohérence
// produit) + 3 régies spécialisées transport/mobilier.
//
// Formule contacts (documentée, miroir seed-media) :
//   · routier (CARTOGRAPHIE) : contactsJ ≈ traficVehJ × 1,35 (passagers)
//     × (0,55 + 0,45×vis/100) ; +25 % DOOH, +15 % double face ;
//   · transport (METRO/RFR, flux captif) : contactsJ ≈ fluxPietonsJ
//     × (0,62 + 0,38×vis/100) ; +20 % habillage (couverture intégrale) ;
//   · mobilier (URBAIN) : 0,75×piétons + 0,25×véhicules.
//
// Reproductibilité : PRNG mulberry32 seedé (aucun Math.random), date machine
// fixée au 2 octobre 2026 (convention T55/T57).
// ============================================================================

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// ---------- PRNG déterministe (mulberry32 — convention seed-shadow/media) ----------
let seedState = 20261003
function rnd(): number {
  seedState |= 0; seedState = (seedState + 0x6d2b79f5) | 0
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]
const iRange = (min: number, max: number) => Math.floor(min + rnd() * (max - min + 1))
const r2 = (v: number) => Math.round(v * 100) / 100
const r5 = (v: number) => Math.round(v * 100000) / 100000

const NOW = new Date('2026-10-02T09:00:00Z')

// ---------- Référentiels ----------
/** Régies grand format (cohérence seed-media) + transport + mobilier. */
const REGIES_GRAND_FORMAT = [
  'Méditerranée Affichage',
  'Régie Pub Tunisie',
  'Sahel Média',
  'Grand Sud Publicité',
  'Cap Bon Affichage',
] as const
const REGIES_TRANSPORT = [
  'Métro Média Tunisie',
  'Rail Média',
  'Ferrovia Affichage',
] as const
const REGIES_MOBILIER = [
  'Urbania Mobilier',
  'Cité Affichage',
  'Régie Pub Tunisie',
] as const

const ORIENTATIONS = ['HORIZONTALE', 'VERTICALE', 'DOUBLE_FACE', 'TRIVISION'] as const
const STATUTS = ['DISPONIBLE', 'DISPONIBLE', 'DISPONIBLE', 'DISPONIBLE', 'DISPONIBLE', 'OCCUPE', 'OCCUPE', 'RESERVE', 'MAINTENANCE'] as const
const ETATS = ['BON', 'BON', 'BON', 'MOYEN', 'A_RENOVER'] as const
const NOTES = [
  'Emplacement recherché par les annonceurs en période de ramadan.',
  'Face recherchée par les annonceurs en été (flux balnéaire).',
  'Éclairage vérifié le mois dernier (déclaration régie).',
  'Emplacement historique — forte notoriété locale.',
  'Travaux signalés à proximité — visibilité légèrement affectée.',
  'Axée sur le flux sortant (fin de journée) — idéale promotions.',
] as const

// ---------- Types par mode (coût DT/mois, surface m², libellé format) ----------
const CARTO_TYPES = [
  { type: 'PANNEAU_4X3', format: '4×3 — 12 m²', surface: 12, cout: [700, 1600] as const, dooh: false },
  { type: 'PANNEAU_8M2', format: '8 m² — 2 faces', surface: 8, cout: [350, 750] as const, dooh: false },
  { type: 'MURAL', format: 'Mural — 16 m²', surface: 16, cout: [300, 600] as const, dooh: false },
  { type: 'PRE_ENSEIGNE', format: 'Pré-enseigne — 1,5 m²', surface: 1.5, cout: [150, 350] as const, dooh: false },
  { type: 'TOTEM_DIGITAL', format: 'Totem digital — 2,5 m²', surface: 2.5, cout: [1400, 2600] as const, dooh: true },
  { type: 'ECRAN_DOOH', format: 'Écran DOOH — 6 m²', surface: 6, cout: [1000, 2200] as const, dooh: true },
] as const

const TRANSPORT_TYPES = [
  { type: 'HABILLAGE_QUAI', format: 'Habillage quai — 18 m²', surface: 18, cout: [900, 1800] as const, habillage: true },
  { type: 'ECRAN_QUAI', format: 'Écran quai — 2 m²', surface: 2, cout: [600, 1400] as const, habillage: false },
  { type: 'HABILLAGE_TRAIN', format: 'Habillage train — 3 rames', surface: 45, cout: [1500, 2800] as const, habillage: true },
  { type: 'ECRAN_TRAIN', format: 'Écran embarqué — 0,5 m²', surface: 0.5, cout: [400, 900] as const, habillage: false },
  { type: 'VITRINE_GARE', format: 'Vitrine gare — 2 m²', surface: 2, cout: [250, 550] as const, habillage: false },
  { type: 'CAISSE', format: 'Habillage tourniquet — 1,2 m²', surface: 1.2, cout: [200, 450] as const, habillage: true },
] as const

const URBAIN_TYPES = [
  { type: 'ABRI_BUS', format: 'Abribus — 2 m²', surface: 2, cout: [120, 280] as const },
  { type: 'COLONNE', format: 'Colonne — 2,2 m²', surface: 2.2, cout: [90, 200] as const },
  { type: 'BORNE', format: 'Borne — 1,2 m²', surface: 1.2, cout: [70, 160] as const },
  { type: 'PANNEAU_SUCCURSALE', format: 'Panneau sucursal — 2 m²', surface: 2, cout: [140, 320] as const },
  { type: 'ECRAN_MOBILIER', format: 'Écran mobilier — 1,5 m²', surface: 1.5, cout: [500, 1100] as const },
] as const

// ---------- Spots CARTOGRAPHIE : [lieu, delegation, lng, lat, env, trafic, axes] ----------
type CartoSpot = [string, string, number, number, 'URBAIN' | 'PERIURBAIN' | 'ROUTIER' | 'COMMERCIAL', number, readonly string[]]
const CARTO_SPOTS: ReadonlyArray<{ gov: string; premium: boolean; spots: readonly CartoSpot[] }> = [
  { gov: 'Tunis', premium: true, spots: [
    ['Bd Habib Bourguiba — centre', 'Tunis', 10.178, 36.798, 'URBAIN', 42000, ['Bd Habib Bourguiba']],
    ['RN9 La Marsa — corniche', 'La Marsa', 10.323, 36.878, 'URBAIN', 21000, ['RN9', 'Av. Hédi Nouira']],
    ['Av. de la Liberté — passage', 'Tunis', 10.181, 36.799, 'COMMERCIAL', 26000, ['Av. de la Liberté']],
    ['Échangeur A1 Soukra', 'Soukra', 10.283, 36.840, 'PERIURBAIN', 38000, ['A1 km 8', 'RN9']],
    ['Av. Mohamed V — artère', 'Tunis', 10.176, 36.797, 'URBAIN', 33000, ['Av. Mohamed V']],
  ] },
  { gov: 'Ariana', premium: true, spots: [
    ['Av. Bourguiba Ariana', 'Ariana Ville', 10.190, 36.860, 'URBAIN', 24000, ['RN8', 'Av. Bourguiba']],
    ['RN8 Cité El Ghazala', 'La Soukra', 10.270, 36.845, 'PERIURBAIN', 29000, ['RN8']],
  ] },
  { gov: 'Ben Arous', premium: true, spots: [
    ['RN3 Ben Arous — zone industrielle', 'Ben Arous', 10.230, 36.752, 'PERIURBAIN', 31000, ['RN3', 'A1 km 9']],
    ['GP1 Radès — échangeur', 'Radès', 10.290, 36.772, 'URBAIN', 27000, ['GP1', 'RN3']],
  ] },
  { gov: 'Nabeul', premium: true, spots: [
    ['RN28 Hammamet — entrée nord', 'Hammamet', 10.610, 36.402, 'COMMERCIAL', 18000, ['RN28', 'Route touristique']],
    ['RN28 Nabeul — centre', 'Nabeul', 10.740, 36.452, 'URBAIN', 15000, ['RN28']],
  ] },
  { gov: 'Sfax', premium: true, spots: [
    ['RN1 entrée Sfax — Mahres', 'Sfax Ville', 10.760, 34.740, 'URBAIN', 22000, ['RN1', 'Bd Martyrs']],
    ['RN10 Sakiet Ezzit — rocade', 'Sakiet Ezzit', 10.900, 34.822, 'PERIURBAIN', 26000, ['RN10']],
  ] },
  { gov: 'Sousse', premium: true, spots: [
    ['RN1 Sousse — entrée Hammam Sousse', 'Sousse Médina', 10.630, 35.825, 'URBAIN', 28000, ['RN1']],
    ['Route de Msaken — artère', 'Sousse Riadh', 10.690, 35.840, 'COMMERCIAL', 19000, ['GP1', 'RN1']],
  ] },
  { gov: 'Monastir', premium: true, spots: [
    ['RN1 Monastir — aéroport', 'Monastir', 10.750, 35.760, 'URBAIN', 17000, ['RN1']],
  ] },
  { gov: 'Bizerte', premium: false, spots: [
    ['RN7 Bizerte — entrée sud', 'Bizerte Nord', 9.860, 37.270, 'URBAIN', 14000, ['RN7', 'RN11']],
  ] },
  { gov: 'Kairouan', premium: false, spots: [
    ['RN3 Kairouan — roundabout Sousse', 'Kairouan Nord', 10.090, 35.680, 'URBAIN', 12000, ['RN3']],
  ] },
  { gov: 'Gabès', premium: false, spots: [
    ['RN1 Gabès — entrée nord', 'Gabès Médina', 10.110, 33.890, 'URBAIN', 11000, ['RN1']],
  ] },
  { gov: 'Sidi Bouzid', premium: false, spots: [
    ['RN3 Sidi Bouzid — artère centrale', 'Sidi Bouzid', 9.490, 35.040, 'URBAIN', 9000, ['RN3']],
  ] },
  { gov: 'Médenine', premium: false, spots: [
    ['RN1 Médenine — vers Djerba', 'Médenine', 10.500, 33.350, 'ROUTIER', 10000, ['RN1', 'GP Djerba']],
  ] },
]

// ---------- Stations METRO (métro léger Grand Tunis) ----------
const METRO_STATIONS: ReadonlyArray<{ nom: string; delegation: string; gov: string; lng: number; lat: number; pietons: number }> = [
  { nom: 'Place Barcelone', delegation: 'Tunis', gov: 'Tunis', lng: 10.183, lat: 36.795, pietons: 42000 },
  { nom: '15 Octobre (Bab Alioua)', delegation: 'Tunis', gov: 'Tunis', lng: 10.181, lat: 36.791, pietons: 31000 },
  { nom: 'Habib Thameur', delegation: 'Tunis', gov: 'Tunis', lng: 10.178, lat: 36.793, pietons: 24000 },
  { nom: 'Mohamed V', delegation: 'Tunis', gov: 'Tunis', lng: 10.176, lat: 36.797, pietons: 27000 },
  { nom: 'Ibn Khaldoun', delegation: 'Tunis', gov: 'Tunis', lng: 10.171, lat: 36.801, pietons: 19500 },
  { nom: 'Pasteur', delegation: 'Tunis', gov: 'Tunis', lng: 10.168, lat: 36.803, pietons: 17000 },
  { nom: 'Omrane Supérieur', delegation: 'El Omrane', gov: 'Tunis', lng: 10.160, lat: 36.808, pietons: 14000 },
  { nom: 'El Menzah VI', delegation: 'El Menzah', gov: 'Tunis', lng: 10.164, lat: 36.825, pietons: 15500 },
  { nom: 'Cité El Intilaka', delegation: 'El Menzah', gov: 'Tunis', lng: 10.156, lat: 36.837, pietons: 9500 },
  { nom: 'Ariana Supérieur', delegation: 'Ariana Ville', gov: 'Ariana', lng: 10.185, lat: 36.862, pietons: 12500 },
  { nom: 'Borj Louzir', delegation: 'Ariana Ville', gov: 'Ariana', lng: 10.178, lat: 36.852, pietons: 8200 },
  { nom: 'Ennasr — phase II', delegation: 'Ariana Ville', gov: 'Ariana', lng: 10.170, lat: 36.850, pietons: 7300 },
  { nom: 'Ben Arous', delegation: 'Ben Arous', gov: 'Ben Arous', lng: 10.228, lat: 36.752, pietons: 13500 },
  { nom: 'El Ouardia', delegation: 'El Ouardia', gov: 'Tunis', lng: 10.195, lat: 36.770, pietons: 10800 },
  { nom: 'Cité Er-Rouad', delegation: 'La Soukra', gov: 'Ariana', lng: 10.240, lat: 36.842, pietons: 6800 },
  { nom: '5 Août — La Goulette', delegation: 'La Goulette', gov: 'Tunis', lng: 10.300, lat: 36.752, pietons: 9100 },
]

// ---------- Stations RFR (réseau ferré rapide — banlieue sud + branche nord) ----------
const RFR_STATIONS: ReadonlyArray<{ nom: string; delegation: string; gov: string; lng: number; lat: number; pietons: number }> = [
  { nom: 'Tunis — terminus RFR', delegation: 'Tunis', gov: 'Tunis', lng: 10.179, lat: 36.794, pietons: 28500 },
  { nom: 'Mégrine', delegation: 'Mégrine', gov: 'Ben Arous', lng: 10.232, lat: 36.745, pietons: 10400 },
  { nom: 'Radès Ville', delegation: 'Radès', gov: 'Ben Arous', lng: 10.292, lat: 36.768, pietons: 9700 },
  { nom: 'Radès Plage', delegation: 'Radès', gov: 'Ben Arous', lng: 10.298, lat: 36.758, pietons: 7600 },
  { nom: 'Ezzouhour', delegation: 'Ezzouhour', gov: 'Ben Arous', lng: 10.255, lat: 36.735, pietons: 8300 },
  { nom: 'Hammam Lif', delegation: 'Hammam Lif', gov: 'Ben Arous', lng: 10.325, lat: 36.715, pietons: 11200 },
  { nom: 'Borj Cédria — terminus sud', delegation: 'Borj Cédria', gov: 'Ben Arous', lng: 10.430, lat: 36.690, pietons: 6200 },
  { nom: 'El Ouardia — gare', delegation: 'El Ouardia', gov: 'Tunis', lng: 10.197, lat: 36.772, pietons: 8900 },
  { nom: 'Ariana — gare RFR', delegation: 'Ariana Ville', gov: 'Ariana', lng: 10.192, lat: 36.858, pietons: 11600 },
  { nom: 'Sidi Daoued', delegation: 'Raoued', gov: 'Ariana', lng: 10.280, lat: 36.905, pietons: 5400 },
]

// ---------- Spots URBAIN (mobilier — artères commerçantes) ----------
const URBAIN_SPOTS: ReadonlyArray<{ lieu: string; delegation: string; gov: string; lng: number; lat: number; pietons: number; vehJ: number; env: 'URBAIN' | 'COMMERCIAL' }> = [
  { lieu: 'Av. Habib Bourguiba — abribus', delegation: 'Tunis', gov: 'Tunis', lng: 10.177, lat: 36.800, pietons: 18000, vehJ: 15000, env: 'URBAIN' },
  { lieu: 'Av. de la Liberté — colonne', delegation: 'Tunis', gov: 'Tunis', lng: 10.181, lat: 36.799, pietons: 15500, vehJ: 12000, env: 'COMMERCIAL' },
  { lieu: 'Bab Souika — borne', delegation: 'Bab Souika', gov: 'Tunis', lng: 10.170, lat: 36.808, pietons: 9500, vehJ: 8000, env: 'URBAIN' },
  { lieu: 'Médina — rue de la Kasbah', delegation: 'Tunis', gov: 'Tunis', lng: 10.172, lat: 36.799, pietons: 12000, vehJ: 3000, env: 'COMMERCIAL' },
  { lieu: 'El Menzah VI — abribus', delegation: 'El Menzah', gov: 'Tunis', lng: 10.164, lat: 36.825, pietons: 7600, vehJ: 9000, env: 'URBAIN' },
  { lieu: 'Ariana centre — colonne', delegation: 'Ariana Ville', gov: 'Ariana', lng: 10.190, lat: 36.860, pietons: 8900, vehJ: 8500, env: 'COMMERCIAL' },
  { lieu: 'La Soukra RN8 — borne', delegation: 'La Soukra', gov: 'Ariana', lng: 10.270, lat: 36.845, pietons: 5100, vehJ: 21000, env: 'URBAIN' },
  { lieu: 'Ben Arous — av. de l’Environnement', delegation: 'Ben Arous', gov: 'Ben Arous', lng: 10.231, lat: 36.754, pietons: 8200, vehJ: 14000, env: 'URBAIN' },
  { lieu: 'Radès — av. Habib Thameur', delegation: 'Radès', gov: 'Ben Arous', lng: 10.292, lat: 36.771, pietons: 6900, vehJ: 11000, env: 'URBAIN' },
  { lieu: 'Hammam Lif corniche — abribus', delegation: 'Hammam Lif', gov: 'Ben Arous', lng: 10.325, lat: 36.716, pietons: 5800, vehJ: 9000, env: 'URBAIN' },
  { lieu: 'Sousse — av. Habib Bourguiba', delegation: 'Sousse Médina', gov: 'Sousse', lng: 10.640, lat: 35.825, pietons: 14000, vehJ: 13000, env: 'COMMERCIAL' },
  { lieu: 'Sousse Kantaoui — borne', delegation: 'Sousse Riadh', gov: 'Sousse', lng: 10.680, lat: 35.770, pietons: 9400, vehJ: 10000, env: 'URBAIN' },
  { lieu: 'Sfax — Bd Martyrs abribus', delegation: 'Sfax Ville', gov: 'Sfax', lng: 10.760, lat: 34.742, pietons: 12500, vehJ: 12000, env: 'COMMERCIAL' },
  { lieu: 'Sfax — av. de la République', delegation: 'Sfax Ville', gov: 'Sfax', lng: 10.755, lat: 34.750, pietons: 10200, vehJ: 9000, env: 'URBAIN' },
  { lieu: 'Nabeul — av. Habib Bourguiba', delegation: 'Nabeul', gov: 'Nabeul', lng: 10.740, lat: 36.455, pietons: 8600, vehJ: 7500, env: 'COMMERCIAL' },
  { lieu: 'Hammamet nord — colonne', delegation: 'Hammamet', gov: 'Nabeul', lng: 10.610, lat: 36.405, pietons: 7300, vehJ: 8800, env: 'URBAIN' },
  { lieu: 'Monastir — av. Bourguiba', delegation: 'Monastir', gov: 'Monastir', lng: 10.760, lat: 35.765, pietons: 8100, vehJ: 8200, env: 'COMMERCIAL' },
  { lieu: 'Bizerte — av. Habib Bourguiba', delegation: 'Bizerte Nord', gov: 'Bizerte', lng: 9.865, lat: 37.272, pietons: 7000, vehJ: 7800, env: 'URBAIN' },
  { lieu: 'Kairouan — av. Farhat Hached', delegation: 'Kairouan Nord', gov: 'Kairouan', lng: 10.092, lat: 35.678, pietons: 6200, vehJ: 6800, env: 'URBAIN' },
  { lieu: 'Gabès — av. de la République', delegation: 'Gabès Médina', gov: 'Gabès', lng: 10.112, lat: 33.885, pietons: 5400, vehJ: 6200, env: 'URBAIN' },
]

// ---------- Populations INS 2024 (mêmes valeurs que media-shared — GRP) ----------
const GOV_POP: Record<string, number> = {
  Tunis: 1119000, Ariana: 576000, 'Ben Arous': 640000, Nabeul: 826000,
  Sfax: 955000, Sousse: 700000, Monastir: 425000, Mahdia: 412000,
  Bizerte: 385000, Kairouan: 400000, Zaghouan: 193000, Béja: 285000,
  Jendouba: 265000, 'Le Kef': 262000, Siliana: 234000, 'Sidi Bouzid': 470000,
  Kasserine: 480000, Gabès: 375000, Médenine: 415000, Tataouine: 150000,
  Gafsa: 350000, Tozeur: 110000, Kébili: 160000, Manouba: 380000,
}

// ---------- Formule contacts (miroir de l'en-tête + estimateur module) ----------
function contactsCarto(vehJ: number, vis: number, dooh: boolean, orientation: string): number {
  let c = vehJ * 1.35 * (0.55 + 0.45 * (vis / 100))
  if (dooh) c *= 1.25
  if (orientation === 'DOUBLE_FACE') c *= 1.15
  return Math.round(c)
}
function contactsTransport(pietons: number, vis: number, habillage: boolean): number {
  let c = pietons * (0.62 + 0.38 * (vis / 100))
  if (habillage) c *= 1.2
  return Math.round(c)
}
function contactsUrbain(pietons: number, vehJ: number, vis: number): number {
  return Math.round(0.75 * pietons * (0.6 + 0.4 * (vis / 100)) + 0.25 * vehJ)
}

// ---------- Génération des supports ----------
interface SupportRow {
  code: string
  mode: string
  name: string
  supportType: string
  format: string
  surfaceM2: number
  orientation: string
  eclairage: string
  regie: string
  gouvernorat: string
  delegation: string
  lieu: string
  lat: number
  lng: number
  environnement: string
  visibilite: number
  traficVehJ: number
  fluxPietonsJ: number
  contactsJ: number
  coutMensuel: number
  dureeMinMois: number
  statut: string
  etat: string
  dernierControle: Date | null
  notes: string | null
}

const rows: SupportRow[] = []

// CARTOGRAPHIE — 30 supports sur 12 gouvernorats.
let nCar = 0
for (const zone of CARTO_SPOTS) {
  for (const [lieu, deleg, lng, lat, env, trafic, axes] of zone.spots) {
    const nb = zone.premium ? 3 : 2
    for (let k = 0; k < nb; k++) {
      const t = pick(CARTO_TYPES)
      const orientation = pick(ORIENTATIONS)
      const vis = iRange(55, 95)
      nCar++
      rows.push({
        code: `PUB-CAR-${String(nCar).padStart(4, '0')}`,
        mode: 'CARTOGRAPHIE',
        name: `${t.format.split(' — ')[0]} ${axes[k % axes.length]} — ${lieu}`,
        supportType: t.type,
        format: t.format,
        surfaceM2: t.surface,
        orientation,
        eclairage: t.dooh ? 'RETRO' : pick(['AVANT', 'RETRO', 'RETRO', 'NON'] as const),
        regie: pick(REGIES_GRAND_FORMAT),
        gouvernorat: zone.gov,
        delegation: deleg,
        lieu: `${axes[k % axes.length]} — ${lieu}`,
        lat: r5(lat + (k - 1) * 0.004),
        lng: r5(lng + (k - 1) * 0.005),
        environnement: env,
        visibilite: vis,
        traficVehJ: Math.round(trafic * (0.85 + rnd() * 0.3)),
        fluxPietonsJ: iRange(1200, 9000),
        contactsJ: contactsCarto(trafic, vis, t.dooh, orientation),
        coutMensuel: r2(iRange(t.cout[0], t.cout[1]) * (zone.premium ? 1 : 0.85)),
        dureeMinMois: iRange(1, 3),
        statut: pick(STATUTS),
        etat: pick(ETATS),
        dernierControle: new Date(NOW.getTime() - iRange(3, 90) * 86400000),
        notes: pick(NOTES),
      })
    }
  }
}

// METRO — habillages/écrans des stations (2 par station majeure, 1 sinon).
let nMet = 0
for (const st of METRO_STATIONS) {
  const nb = st.pietons > 15000 ? 2 : 1
  for (let k = 0; k < nb; k++) {
    const t = pick(TRANSPORT_TYPES)
    const vis = iRange(60, 95)
    nMet++
    rows.push({
      code: `PUB-MET-${String(nMet).padStart(4, '0')}`,
      mode: 'METRO',
      name: `${t.format.split(' — ')[0]} — station ${st.nom}`,
      supportType: t.type,
      format: t.format,
      surfaceM2: t.surface,
      orientation: pick(ORIENTATIONS),
      eclairage: pick(['AVANT', 'RETRO', 'RETRO'] as const),
      regie: pick(REGIES_TRANSPORT),
      gouvernorat: st.gov,
      delegation: st.delegation,
      lieu: `Station ${st.nom}${t.type.endsWith('TRAIN') ? ' — rames' : ' — quai ' + (k + 1)}`,
      lat: r5(st.lat + (k - 0.5) * 0.0012),
      lng: r5(st.lng + (k - 0.5) * 0.0012),
      environnement: 'TRANSPORT',
      visibilite: vis,
      traficVehJ: 0,
      fluxPietonsJ: Math.round(st.pietons * (0.8 + rnd() * 0.4)),
      contactsJ: contactsTransport(st.pietons, vis, t.habillage),
      coutMensuel: r2(iRange(t.cout[0], t.cout[1])),
      dureeMinMois: iRange(3, 6),
      statut: pick(STATUTS),
      etat: pick(ETATS),
      dernierControle: new Date(NOW.getTime() - iRange(3, 60) * 86400000),
      notes: pick(NOTES),
    })
  }
}

// RFR — 18 supports (2 par station).
let nRfr = 0
for (const st of RFR_STATIONS) {
  for (let k = 0; k < 2; k++) {
    const t = pick(TRANSPORT_TYPES)
    const vis = iRange(55, 90)
    nRfr++
    rows.push({
      code: `PUB-RFR-${String(nRfr).padStart(4, '0')}`,
      mode: 'RFR',
      name: `${t.format.split(' — ')[0]} — gare ${st.nom}`,
      supportType: t.type,
      format: t.format,
      surfaceM2: t.surface,
      orientation: pick(ORIENTATIONS),
      eclairage: pick(['AVANT', 'RETRO', 'RETRO'] as const),
      regie: pick(REGIES_TRANSPORT),
      gouvernorat: st.gov,
      delegation: st.delegation,
      lieu: `Gare ${st.nom}${t.type.endsWith('TRAIN') ? ' — rames' : ' — quai ' + (k + 1)}`,
      lat: r5(st.lat + (k - 0.5) * 0.0015),
      lng: r5(st.lng + (k - 0.5) * 0.0015),
      environnement: 'TRANSPORT',
      visibilite: vis,
      traficVehJ: 0,
      fluxPietonsJ: Math.round(st.pietons * (0.75 + rnd() * 0.5)),
      contactsJ: contactsTransport(st.pietons, vis, t.habillage),
      coutMensuel: r2(iRange(t.cout[0], t.cout[1]) * 0.92),
      dureeMinMois: iRange(3, 6),
      statut: pick(STATUTS),
      etat: pick(ETATS),
      dernierControle: new Date(NOW.getTime() - iRange(3, 90) * 86400000),
      notes: pick(NOTES),
    })
  }
}

// URBAIN — mobilier (mélange des 20 spots, ~24 supports).
let nUrb = 0
for (const s of URBAIN_SPOTS) {
  for (let k = 0; k < (nUrb % 3 === 0 ? 2 : 1); k++) {
    const t = pick(URBAIN_TYPES)
    const vis = iRange(50, 90)
    nUrb++
    rows.push({
      code: `PUB-URB-${String(nUrb).padStart(4, '0')}`,
      mode: 'URBAIN',
      name: `${t.format.split(' — ')[0]} — ${s.lieu}`,
      supportType: t.type,
      format: t.format,
      surfaceM2: t.surface,
      orientation: pick(ORIENTATIONS),
      eclairage: t.type === 'ECRAN_MOBILIER' ? 'RETRO' : pick(['AVANT', 'NON', 'NON'] as const),
      regie: pick(REGIES_MOBILIER),
      gouvernorat: s.gov,
      delegation: s.delegation,
      lieu: s.lieu,
      lat: r5(s.lat + (k - 0.5) * 0.001),
      lng: r5(s.lng + (k - 0.5) * 0.001),
      environnement: s.env,
      visibilite: vis,
      traficVehJ: s.vehJ,
      fluxPietonsJ: Math.round(s.pietons * (0.85 + rnd() * 0.3)),
      contactsJ: contactsUrbain(s.pietons, s.vehJ, vis),
      coutMensuel: r2(iRange(t.cout[0], t.cout[1])),
      dureeMinMois: iRange(1, 2),
      statut: pick(STATUTS),
      etat: pick(ETATS),
      dernierControle: new Date(NOW.getTime() - iRange(3, 120) * 86400000),
      notes: pick(NOTES),
    })
  }
}

// ---------- Campagnes d'exemple (volet Rapports non vide) ----------
// Estimation = même moteur que le simulateur / l'API (§ formules affichées) :
// budget = Σ cout/4,345 × semaines ; contacts = Σ contactsJ × 7 × semaines
// × facteur ; doublons 18 % plafonnés ; GRP = portée/pop INS ; CPM.
const WEEKS_PER_MONTH = 4.345

interface SupportSnapshot {
  code: string
  mode: string
  name: string
  supportType: string
  regie: string
  gouvernorat: string
  coutMensuel: number
  contactsJ: number
}

function snapshot(r: SupportRow): SupportSnapshot {
  return {
    code: r.code, mode: r.mode, name: r.name, supportType: r.supportType,
    regie: r.regie, gouvernorat: r.gouvernorat, coutMensuel: r.coutMensuel,
    contactsJ: r.contactsJ,
  }
}

function estimate(sups: SupportSnapshot[], semaines: number, facteur: number) {
  const budgetMensuel = sups.reduce((s, p) => s + p.coutMensuel, 0)
  const contactsJour = sups.reduce((s, p) => s + p.contactsJ, 0)
  const budget = (budgetMensuel / WEEKS_PER_MONTH) * semaines
  const contactsBruts = contactsJour * 7 * semaines * facteur
  const doublons = sups.length <= 1 ? 0 : 0.18 * Math.min(1, (sups.length - 1) / 4)
  const porteeNette = contactsBruts * (1 - doublons)
  const population = [...new Set(sups.map(p => p.gouvernorat))].reduce((s, g) => s + (GOV_POP[g] ?? 0), 0)
  return {
    budget, contactsBruts, porteeNette,
    frequence: porteeNette > 0 ? contactsBruts / porteeNette : 0,
    grp: population > 0 ? (porteeNette / population) * 100 : 0,
    cpm: contactsBruts > 0 ? budget / (contactsBruts / 1000) : 0,
  }
}

const byMode = (m: string) => rows.filter(r => r.mode === m)
const campagnes: ReadonlyArray<{
  nom: string; objectif: string; brandSlug: string; auteur: string
  semaines: number; periode: string; facteur: number; budgetCible: number
  statut: string
  supports: SupportRow[]
}> = [
  {
    nom: 'Notoriété Grand Tunis — Ramadan 2027', objectif: 'NOTORIETE', brandSlug: 'agil',
    auteur: 'sonia.beji@agil.tn', semaines: 4, periode: 'ramadan', facteur: 1.25, budgetCible: 18000,
    statut: 'SIMULEE',
    supports: [
      ...byMode('METRO').slice(0, 4),
      ...byMode('CARTOGRAPHIE').filter(r => r.gouvernorat === 'Tunis').slice(0, 3),
    ],
  },
  {
    nom: 'Promo été — axes balnéaires', objectif: 'PROMO_PRODUIT', brandSlug: 'agil',
    auteur: 'sonia.beji@agil.tn', semaines: 6, periode: 'ete', facteur: 1.15, budgetCible: 15000,
    statut: 'EN_COURS',
    supports: [
      ...byMode('CARTOGRAPHIE').filter(r => ['Nabeul', 'Sousse', 'Monastir'].includes(r.gouvernorat)).slice(0, 4),
      ...byMode('URBAIN').filter(r => ['Nabeul', 'Sousse'].includes(r.gouvernorat)).slice(0, 3),
    ],
  },
  {
    nom: 'Lancement — pôle Radès/Mégrine', objectif: 'LANCEMENT', brandSlug: 'agil',
    auteur: 'rania.feki@carbuscope.tn', semaines: 2, periode: 'normale', facteur: 1, budgetCible: 9000,
    statut: 'VALIDEE',
    supports: [
      ...byMode('RFR').filter(r => ['Radès Ville', 'Mégrine', 'Tunis — terminus RFR'].some(g => r.lieu.includes(g))).slice(0, 4),
      ...byMode('URBAIN').filter(r => r.gouvernorat === 'Ben Arous').slice(0, 2),
    ],
  },
]

// ---------- Écriture ----------
async function main() {
  console.log('Réinitialisation AdSupport + AdCampaign (tables autonomes T58)…')
  await db.adCampaign.deleteMany()
  await db.adSupport.deleteMany()

  console.log(`Insertion de ${rows.length} supports fictifs…`)
  const created = await Promise.all(rows.map(r => db.adSupport.create({ data: r })))
  console.log(`→ AdSupport : ${created.length} lignes (CARTOGRAPHIE ${rows.filter(r => r.mode === 'CARTOGRAPHIE').length} · METRO ${rows.filter(r => r.mode === 'METRO').length} · RFR ${rows.filter(r => r.mode === 'RFR').length} · URBAIN ${rows.filter(r => r.mode === 'URBAIN').length})`)

  for (const c of campagnes) {
    const sups = c.supports.map(snapshot)
    const est = estimate(sups, c.semaines, c.facteur)
    await db.adCampaign.create({
      data: {
        nom: c.nom, objectif: c.objectif, brandSlug: c.brandSlug, auteur: c.auteur,
        semaines: c.semaines, periode: c.periode, facteur: c.facteur, budgetCible: c.budgetCible,
        budgetEstime: r2(est.budget), contactsBruts: Math.round(est.contactsBruts),
        porteeNette: Math.round(est.porteeNette), frequence: r2(est.frequence),
        grp: r2(est.grp), cpm: r2(est.cpm), statut: c.statut,
        supportsJson: JSON.stringify(sups),
      },
    })
    console.log(`→ campagne « ${c.nom} » : ${sups.length} supports · ${Math.round(est.budget).toLocaleString('fr-FR')} DT · ${Math.round(est.contactsBruts).toLocaleString('fr-FR')} contacts`)
  }

  console.log('Seed T58 terminé — aucune autre table touchée (schéma additif).')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
