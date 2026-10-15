// ============================================================================
// CarbuScope — T51 : seed des modules « Opportunity Radar » + « Mobility Hub
// Operations ». Exécution : bun prisma/seed-t51.ts
//
// Insère (idempotent — purge puis réinsertion) :
//  · OpportunitySetting (1 ligne globale + 5 enseignes) ;
//  · 54 OpportunityZone couvrant les 24 gouvernorats (déserts automobiles,
//    axes routiers, critères ATTT/pouvoir d'achat/trafic/concurrence/foncier,
//    scores pondérés, formats recommandés, pipeline IDENTIFIEE→EQUIPEE) ;
//  · 10 OpportunityAlert ; 8 FeasibilityStudy (volets foncier/réglementation/
//    RH en JSON) ; 36 RentabilitySimulation (12 zones × 3 scénarios) ;
//  · 14 FranchiseCandidate ; 5 FranchiseContract ; 40 FranchiseKitItem ;
//  · 15 MobilityHub (TMP) + HubSetting (globale + 5 enseignes) ;
//  · ~205 HubVehicle, ~520 HubServiceRecord (120 jours), ~115 HubConversion
//    (stations cibles RÉELLES du référentiel), ~145 HubStockItem,
//    ~60 HubEquipment, 30 HubPriceItem, 16 HubTireProduct,
//    15 HubDiagnosticTemplate, 20 HubLoyaltyRule.
//
// Reproductibilité : PRNG mulberry32 seedé (aucun Math.random) + horloge
// factice fixée au 26 septembre 2026.
// ============================================================================

import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

// ---------------------------------------------------------------------------
// PRNG déterministe
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260926)
const ri = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1))
const rf = (min: number, max: number) => min + rnd() * (max - min)
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const round = (v: number, d = 0) => Number(v.toFixed(d))

/** Horloge factice : « maintenant » = 26 septembre 2026. */
const NOW = new Date("2026-09-26T10:00:00.000Z")
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400_000)
const monthsAgo = (m: number) => new Date(NOW.getTime() - Math.round(m * 30.44 * 86400_000))

// ---------------------------------------------------------------------------
// Référentiels
// ---------------------------------------------------------------------------

const BRANDS = ["agil", "totalenergies", "shell", "ola", "staroil"] as const

/** Indice de pouvoir d'achat par gouvernorat (base 100 = moyenne nationale). */
const POWER: Record<string, number> = {
  "Tunis": 118, "Ariana": 112, "Ben Arous": 108, "Manouba": 96, "Nabeul": 95,
  "Zaghouan": 80, "Bizerte": 90, "Beja": 72, "Jendouba": 70, "Le Kef": 68,
  "Siliana": 66, "Sousse": 100, "Monastir": 96, "Mahdia": 78, "Kairouan": 78,
  "Kasserine": 65, "Sidi Bouzid": 68, "Gafsa": 75, "Tozeur": 70, "Kebili": 66,
  "Gabès": 82, "Medenine": 74, "Tataouine": 65, "Sfax": 102,
}

/** Population + parc ATTT par gouvernorat (référentiel de la base). */
const GOUV_POP: Record<string, { pop: number; veh: number }> = {
  "Tunis": { pop: 1056247, veh: 581880 }, "Ariana": { pop: 412360, veh: 276480 },
  "Ben Arous": { pop: 501924, veh: 300800 }, "Manouba": { pop: 305000, veh: 158000 },
  "Nabeul": { pop: 462000, veh: 214000 }, "Zaghouan": { pop: 176000, veh: 68000 },
  "Bizerte": { pop: 350000, veh: 152000 }, "Beja": { pop: 285000, veh: 99000 },
  "Jendouba": { pop: 266000, veh: 88000 }, "Le Kef": { pop: 234000, veh: 76000 },
  "Siliana": { pop: 224000, veh: 69000 }, "Sousse": { pop: 495000, veh: 240000 },
  "Monastir": { pop: 330000, veh: 151000 }, "Mahdia": { pop: 300000, veh: 118000 },
  "Kairouan": { pop: 382000, veh: 128000 }, "Kasserine": { pop: 332000, veh: 96000 },
  "Sidi Bouzid": { pop: 344000, veh: 92000 }, "Gafsa": { pop: 300000, veh: 89000 },
  "Tozeur": { pop: 107000, veh: 34000 }, "Kebili": { pop: 131000, veh: 41000 },
  "Gabès": { pop: 245000, veh: 96000 }, "Medenine": { pop: 236000, veh: 87000 },
  "Tataouine": { pop: 128000, veh: 39000 }, "Sfax": { pop: 775000, veh: 334000 },
}

/**
 * Zones d'opportunité — [gouvernorat, délégation, nom, lat, lng, TMJ,
 * concurrents, km station la plus proche, prix m² (DT), dispo foncier,
 * poids de la population de la délégation, superficie km²].
 */
type ZoneSpec = [string, string, string, number, number, number, number, number, number, string, number, number]
const ZONES: ZoneSpec[] = [
  ["Tunis", "La Goulette", "Axe port de La Goulette", 36.82, 10.29, 18000, 12, 0.4, 2200, "FAIBLE", 0.04, 28],
  ["Tunis", "El Menzah", "Boulevard de l'Environnement", 36.845, 10.175, 14000, 14, 0.3, 2400, "FAIBLE", 0.09, 35],
  ["Tunis", "Sidi Hassine", "Sidi Hassine — haute ville", 36.828, 10.098, 9000, 6, 1.9, 950, "FAIBLE", 0.06, 42],
  ["Ariana", "Raoued", "Côte de Raoued — Gammarth", 36.92, 10.28, 9000, 5, 1.2, 1800, "FAIBLE", 0.05, 60],
  ["Ariana", "Ariana Medina", "Avenue Habib Bourguiba", 36.862, 10.192, 12000, 10, 0.5, 2000, "FAIBLE", 0.11, 30],
  ["Ben Arous", "Mégrine", "Zone industrielle Mégrine", 36.75, 10.23, 16000, 8, 0.8, 1300, "MOYENNE", 0.08, 38],
  ["Ben Arous", "Hammam Lif", "Corniche Hammam Lif", 36.71, 10.35, 11000, 6, 1.0, 1100, "MOYENNE", 0.06, 55],
  ["Ben Arous", "Fouchana", "Fouchana — RN1", 36.652, 10.218, 12000, 3, 2.6, 620, "MOYENNE", 0.05, 90],
  ["Manouba", "Manouba", "Cité El Malek", 36.81, 10.10, 8000, 4, 1.5, 750, "FORTE", 0.10, 45],
  ["Manouba", "Oued Ellil", "Axe RN6 Oued Ellil", 36.80, 9.98, 7500, 2, 3.2, 600, "FORTE", 0.05, 110],
  ["Nabeul", "Korba", "Corniche de Korba", 36.568, 10.858, 8500, 5, 1.4, 900, "MOYENNE", 0.05, 75],
  ["Nabeul", "Menzel Bou Zelfa", "Axe Menzel Bou Zelfa", 36.62, 10.78, 5000, 2, 4.5, 450, "FORTE", 0.03, 180],
  ["Nabeul", "Hammamet", "Hammamet sud", 36.40, 10.62, 13000, 7, 0.9, 1500, "FAIBLE", 0.09, 65],
  ["Zaghouan", "Zaghouan", "Entrée de Zaghouan", 36.40, 10.14, 7000, 1, 4.8, 280, "FORTE", 0.28, 420],
  ["Bizerte", "Mateur", "Axe RN11 Mateur", 37.04, 9.64, 9000, 3, 2.8, 350, "FORTE", 0.10, 260],
  ["Bizerte", "Menzel Bourguiba", "Zone Menzel Bourguiba", 37.15, 9.78, 8000, 4, 2.0, 500, "MOYENNE", 0.07, 120],
  ["Bizerte", "Sejnane", "Sejnane — collines", 37.23, 9.28, 4000, 1, 6.4, 200, "FORTE", 0.04, 330],
  ["Beja", "Beja Nord", "RN7 Béja", 36.735, 9.185, 6500, 1, 5.5, 220, "FORTE", 0.22, 380],
  ["Jendouba", "Tabarka", "Corniche de Tabarka", 36.97, 8.75, 5500, 2, 3.9, 400, "MOYENNE", 0.08, 210],
  ["Jendouba", "Jendouba Sud", "Axe GP Jendouba", 36.48, 8.78, 6000, 1, 6.2, 180, "FORTE", 0.14, 340],
  ["Jendouba", "Fernana", "Fernana — piémonts", 36.55, 8.95, 4000, 1, 7.2, 170, "FORTE", 0.05, 290],
  ["Le Kef", "Le Kef Est", "RN5 Le Kef", 36.17, 8.70, 5000, 1, 6.8, 160, "FORTE", 0.18, 350],
  ["Siliana", "Makthar", "Plateau de Makthar", 35.85, 9.07, 3500, 0, 11.5, 130, "FORTE", 0.03, 480],
  ["Sousse", "Msaken", "RN1 M'saken", 35.73, 10.68, 15000, 6, 1.8, 800, "MOYENNE", 0.10, 85],
  ["Sousse", "Kalaa Kebira", "Axe Sousse sud", 35.828, 10.672, 13000, 5, 2.2, 700, "MOYENNE", 0.08, 90],
  ["Sousse", "Sidi El Héni", "Sidi El Héni — intérieur", 35.86, 10.46, 5000, 0, 7.7, 260, "FORTE", 0.03, 380],
  ["Monastir", "Jemmal", "Zone Jemmal", 35.62, 10.83, 9000, 4, 2.5, 650, "MOYENNE", 0.12, 70],
  ["Monastir", "Ksibet Médouni", "Ksibet — corniche", 35.69, 10.82, 7500, 5, 1.1, 850, "FAIBLE", 0.05, 40],
  ["Mahdia", "Mahdia", "Entrée Mahdia", 35.50, 11.06, 7000, 2, 3.8, 420, "MOYENNE", 0.15, 95],
  ["Mahdia", "Chebba", "Littoral Chebba", 35.38, 11.07, 4000, 1, 6.9, 300, "FORTE", 0.05, 220],
  ["Kairouan", "Hajeb Layoun", "Axe Hajeb Layoun", 35.66, 10.11, 7500, 1, 5.0, 240, "FORTE", 0.09, 520],
  ["Kairouan", "Sbikha", "RN12 Sbikha", 35.86, 10.32, 8000, 1, 4.4, 230, "FORTE", 0.07, 480],
  ["Kairouan", "Bouhajla", "Bouhajla — plaine", 35.39, 10.44, 6000, 1, 6.1, 200, "FORTE", 0.06, 450],
  ["Kasserine", "Sbeitla", "Sbeitla — route de Gafsa", 35.23, 9.50, 6000, 0, 8.9, 140, "FORTE", 0.11, 610],
  ["Kasserine", "Feriana", "Axe Feriana", 35.00, 8.60, 5000, 0, 9.4, 120, "FORTE", 0.07, 720],
  ["Sidi Bouzid", "Sidi Bouzid", "RN3 Sidi Bouzid", 35.04, 9.49, 7000, 1, 5.6, 170, "FORTE", 0.30, 580],
  ["Sidi Bouzid", "Regueb", "Regueb — plaine", 34.84, 9.67, 4500, 0, 10.2, 130, "FORTE", 0.08, 640],
  ["Gafsa", "Gafsa", "RN15 Gafsa", 34.43, 8.78, 6500, 1, 4.9, 200, "MOYENNE", 0.38, 420],
  ["Gafsa", "Metlaoui", "Metlaoui — bassin minier", 34.33, 8.59, 5000, 0, 8.1, 150, "FORTE", 0.11, 390],
  ["Gafsa", "Redeyef", "Redeyef — bassin minier", 34.38, 8.43, 4500, 0, 9.1, 130, "FORTE", 0.07, 410],
  ["Tozeur", "Tozeur", "Entrée Tozeur", 33.92, 8.13, 4500, 1, 5.4, 260, "MOYENNE", 0.42, 460],
  ["Tozeur", "Nefta", "Nefta — palmeraie", 33.96, 7.88, 3500, 0, 9.8, 240, "MOYENNE", 0.14, 500],
  ["Kebili", "Douz", "Carrefour de Douz", 33.47, 9.02, 4000, 0, 10.8, 180, "FORTE", 0.21, 890],
  ["Kebili", "Kebili", "Axe RN3 Kebili", 33.70, 8.97, 4500, 0, 8.7, 190, "FORTE", 0.30, 760],
  ["Gabès", "Gabès", "Zone industrielle Gabès", 33.87, 10.10, 8000, 3, 3.1, 480, "MOYENNE", 0.45, 380],
  ["Gabès", "Matmata", "Collines de Matmata", 33.55, 9.98, 3000, 0, 12.4, 150, "FORTE", 0.05, 520],
  ["Medenine", "Medenine", "Carrefour RN1 Medenine", 33.35, 10.50, 9000, 2, 4.1, 300, "MOYENNE", 0.34, 550],
  ["Medenine", "Ben Guerdane", "RN1 Ben Guerdane", 33.40, 10.85, 8500, 1, 6.3, 260, "FORTE", 0.19, 620],
  ["Medenine", "Djerba Midoun", "Djerba — route Midoun", 33.81, 10.71, 11000, 6, 1.3, 1100, "MOYENNE", 0.30, 210],
  ["Tataouine", "Tataouine", "Tataouine — centre", 32.93, 10.45, 5000, 1, 5.9, 220, "MOYENNE", 0.35, 680],
  ["Tataouine", "Dehiba", "Extrême Sud — Dehiba", 32.38, 10.35, 2000, 0, 16.5, 140, "FORTE", 0.03, 940],
  ["Sfax", "Sakiet Ezzit", "RN10 Sakiet Ezzit", 34.88, 10.75, 14000, 5, 1.7, 700, "MOYENNE", 0.09, 120],
  ["Sfax", "Agareb", "Zone Agareb", 34.79, 10.70, 11000, 3, 3.3, 480, "MOYENNE", 0.07, 260],
  ["Sfax", "El Amra", "El Amra — axe RN1 sud", 34.70, 10.79, 12000, 2, 3.6, 420, "FORTE", 0.05, 330],
]

// ---------------------------------------------------------------------------
// Scoring (poids par défaut — identiques à OpportunitySetting seedée)
// ---------------------------------------------------------------------------
const W = { park: 0.30, power: 0.20, traffic: 0.25, comp: 0.15, foncier: 0.10 }

interface ZoneComputed {
  spec: ZoneSpec
  density: number
  pop: number
  veh: number
  sPark: number; sPower: number; sTraffic: number; sComp: number; sFoncier: number; sGlobal: number
  format: "STATION" | "MICRO_HUB_EXPRESS" | "MOBILITY_HUB"
}

const DISPO_SCORE: Record<string, number> = { FORTE: 30, MOYENNE: 18, FAIBLE: 6 }

function computeZones(): ZoneComputed[] {
  const raw = ZONES.map(spec => {
    const [gouv, , , , , , , , prix, , wPop, area] = spec
    const pop = Math.round(GOUV_POP[gouv].pop * wPop)
    const veh = Math.round(GOUV_POP[gouv].veh * wPop)
    const density = round(veh / area, 1)
    return { spec, pop, veh, density }
  })
  // Percentiles (rang) du parc et du trafic
  const rankOf = (vals: number[], v: number) =>
    vals.filter(x => x <= v).length / vals.length
  const densities = raw.map(r => r.density)
  const traffics = raw.map(r => r.spec[5])
  return raw.map(r => {
    const [gouv, , , , , tmj, comp, nearKm, prixM2, dispo] = r.spec
    const sPark = Math.round(rankOf(densities, r.density) * 100)
    const sPower = Math.round(clamp((POWER[gouv] - 58) / (124 - 58) * 100, 5, 100))
    const sTraffic = Math.round(rankOf(traffics, tmj) * 100)
    const sComp = Math.round(clamp((14 - comp) / 14 * 70 + (nearKm >= 5 ? 30 : nearKm / 5 * 30), 0, 100))
    const sFoncier = Math.round(clamp((1 - (prixM2 - 120) / (2400 - 120)) * 70 + DISPO_SCORE[dispo], 0, 100))
    const sGlobal = Math.round(
      W.park * sPark + W.power * sPower + W.traffic * sTraffic + W.comp * sComp + W.foncier * sFoncier,
    )
    const format: ZoneComputed["format"] =
      sGlobal >= 78 && tmj >= 12000 ? "STATION" :
      sGlobal >= 70 && tmj >= 8000 ? "MOBILITY_HUB" : "MICRO_HUB_EXPRESS"
    return { spec: r.spec, density: r.density, pop: r.pop, veh: r.veh, sPark, sPower, sTraffic, sComp, sFoncier, sGlobal, format }
  })
}

// ---------------------------------------------------------------------------
// Données de nommage (franchisés, clients, véhicules…)
// ---------------------------------------------------------------------------
const FIRST = ["Mohamed", "Ali", "Slim", "Hedi", "Karim", "Nabil", "Sami", "Youssef", "Amine", "Riadh",
  "Wassim", "Zied", "Ghazi", "Fethi", "Moez", "Anis", "Bassem", "Chokri", "Dhia", "Elyes"]
const LAST = ["Ben Salah", "Trabelsi", "Gharbi", "Mansouri", "Chaouch", "Jaziri", "Khelifi", "Baccouche",
  "Mejri", "Sassi", "Ayari", "Bouazizi", "Ferchichi", "Haddad", "Kooli", "Lahiani", "Marzouki", "Nasri",
  "Oueslati", "Rekik", "Saadi", "Tounsi", "Zouari", "Ben Amor", "Charfi", "Dridi"]
const name = () => `${pick(FIRST)} ${pick(LAST)}`
const phone = () => `+216 ${pick(["9", "5", "2"])}${ri(1000000, 9999999)}`
const emailOf = (n: string) =>
  `${n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, "").replace(/ /g, ".")}@${pick(["gmail.com", "yahoo.fr", "topnet.tn", "outlook.com"])}`

const CARS: [string, string, string][] = [
  ["Peugeot", "208", "ESSENCE"], ["Peugeot", "301", "DIESEL"], ["Peugeot", "308", "DIESEL"],
  ["Renault", "Clio 4", "ESSENCE"], ["Renault", "Symbol", "DIESEL"], ["Renault", "Mégane 3", "DIESEL"],
  ["Volkswagen", "Polo", "ESSENCE"], ["Volkswagen", "Golf 7", "DIESEL"], ["Seat", "Ibiza", "ESSENCE"],
  ["Citroën", "C3", "ESSENCE"], ["Dacia", "Sandero", "ESSENCE"], ["Dacia", "Logan", "DIESEL"],
  ["Kia", "Picanto", "ESSENCE"], ["Hyundai", "i10", "ESSENCE"], ["Hyundai", "Accent", "DIESEL"],
  ["Toyota", "Corolla", "HYBRIDE"], ["Toyota", "Yaris", "HYBRIDE"], ["Fiat", "Doblo", "DIESEL"],
  ["Isuzu", "D-Max", "DIESEL"], ["Nissan", "Navara", "DIESEL"], ["Suzuki", "Swift", "ESSENCE"],
  ["Chery", "Tiggo 4", "ESSENCE"], ["Ford", "Ranger", "DIESEL"], ["Skoda", "Fabia", "ESSENCE"],
]
const PLATE_LETTERS = ["TU", "TG", "TS", "TAA", "TJ", "TF"]

const HUILES = ["5W-30 synthèse", "5W-40 semi-synthèse", "10W-40 minérale", "5W-30 low SAPS"]
const TIRE_SIZES = ["185/65 R15", "195/65 R15", "205/55 R16", "215/60 R16", "195/60 R15", "205/60 R16"]
const DTC = ["P0301 — cylindre 1", "P0401 — EGR", "P0420 — catalyseur", "P0171 — richesse", "P2002 — FAP", "U0100 — CAN bus"]

const CONV_REASONS = ["Réparation moteur (piston/segment)", "Boîte de vitesses à remplacer", "Circuit climatisation (compresseur)",
  "Kit de distribution complet", "Embrayage + volant moteur", "Train avant — suspension intégrale",
  "Ligne d'échappement + catalyseur", "Électronique embarquée (calculateurs)", "Géométrie après choc", "Réparation GPL"]

// ---------------------------------------------------------------------------
// Seed principal
// ---------------------------------------------------------------------------
async function main() {
  console.log("→ Purge des tables T51 (ordre inverse des dépendances)…")
  await db.opportunityAlert.deleteMany()
  await db.feasibilityStudy.deleteMany()
  await db.rentabilitySimulation.deleteMany()
  await db.franchiseContract.deleteMany()
  await db.franchiseCandidate.deleteMany()
  await db.franchiseKitItem.deleteMany()
  await db.opportunityZone.deleteMany()
  await db.opportunitySetting.deleteMany()
  await db.hubConversion.deleteMany()
  await db.hubServiceRecord.deleteMany()
  await db.hubStockItem.deleteMany()
  await db.hubEquipment.deleteMany()
  await db.hubVehicle.deleteMany()
  await db.hubPriceItem.deleteMany()
  await db.hubTireProduct.deleteMany()
  await db.hubDiagnosticTemplate.deleteMany()
  await db.hubLoyaltyRule.deleteMany()
  await db.hubSetting.deleteMany()
  await db.mobilityHub.deleteMany()

  // ---- 1) Paramétrages SA -----------------------------------------------
  console.log("→ Paramétrages (OpportunitySetting + HubSetting)…")
  const opportunitySettings: { id: string }[] = []
  opportunitySettings.push(await db.opportunitySetting.create({
    data: { brandSlug: null, enabled: true, alertThreshold: 70, whiteZoneKm: 5, updatedBy: "rania.feki@carbuscope.tn" },
  }))
  for (const b of BRANDS) {
    opportunitySettings.push(await db.opportunitySetting.create({
      data: { brandSlug: b, enabled: true, alertThreshold: b === "totalenergies" ? 65 : 70, updatedBy: "rania.feki@carbuscope.tn" },
    }))
  }
  const hubSettings: { id: string }[] = []
  hubSettings.push(await db.hubSetting.create({
    data: { brandSlug: null, enabled: true, updatedBy: "rania.feki@carbuscope.tn" },
  }))
  for (const b of BRANDS) {
    hubSettings.push(await db.hubSetting.create({
      data: { brandSlug: b, enabled: true, conversionTargetPct: b === "agil" ? 30 : 25, updatedBy: "rania.feki@carbuscope.tn" },
    }))
  }

  // ---- 2) Zones d'opportunité -------------------------------------------
  console.log("→ 54 OpportunityZone (scores + formats + pipeline)…")
  const zones = computeZones()
  const sorted = [...zones].sort((a, b) => b.sGlobal - a.sGlobal)
  const zoneIds: string[] = []
  const zoneByIndex: { id: string; label: string; gouv: string; z: ZoneComputed; status: string }[] = []
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i]
    const [gouv, deleg, zoneName, lat, lng, tmj, comp, nearKm, prix, dispo, , area] = z.spec
    // Pipeline : 4 équipées (top 4), 4 signées, 8 en étude, 12 qualifiées, reste identifiées
    const rank = sorted.findIndex(s => s === z)
    const status = rank < 4 ? "EQUIPEE" : rank < 8 ? "SIGNEE" : rank < 16 ? "ETUDE" : rank < 28 ? "QUALIFIEE" : "IDENTIFIEE"
    const isWhite = nearKm >= 5
    const row = await db.opportunityZone.create({
      data: {
        gouvernorat: gouv, delegation: deleg, zoneName, lat, lng,
        areaKm2: area, population: z.pop, vehicles: z.veh, vehicleDensity: z.density,
        trafficDaily: tmj, purchasingPowerIdx: POWER[gouv],
        competitorCount: comp, nearestStationKm: nearKm,
        foncierPriceM2: prix, foncierDispo: dispo, isWhiteZone: isWhite,
        scorePark: z.sPark, scorePower: z.sPower, scoreTraffic: z.sTraffic,
        scoreCompetition: z.sComp, scoreFoncier: z.sFoncier, scoreGlobal: z.sGlobal,
        recommendedFormat: z.format, status,
        notes: isWhite ? "Désert automobile : citoyen à plus de 5 km d'un service auto." : null,
      },
    })
    zoneIds.push(row.id)
    zoneByIndex.push({ id: row.id, label: `${zoneName} (${deleg}, ${gouv})`, gouv, z, status })
  }
  const zoneByLabel = new Map(zoneByIndex.map(x => [x.label, x]))

  // ---- 3) Alertes --------------------------------------------------------
  console.log("→ 10 OpportunityAlert…")
  const alertSeeds: { g: string; type: string; msg: string; score: number; read: boolean; d: number }[] = []
  const topZones = sorted.slice(0, 12)
  for (let i = 0; i < 6; i++) {
    const z = topZones[i]
    alertSeeds.push({
      g: z.spec[0],
      type: "SEUIL_ATTEINT",
      msg: `Zone « ${z.spec[2]} » (${z.spec[1]}, ${z.spec[0]}) — score ${z.sGlobal}/100 ≥ seuil 70 : opportunité critique à instruire.`,
      score: z.sGlobal, read: i > 3, d: 2 + i * 3,
    })
  }
  alertSeeds.push({ g: "Kasserine", type: "NOUVELLE_ZONE", msg: "Nouveau désert automobile détecté à Feriana (Kasserine) : parc ATTT local croissant, zéro enseigne dans un rayon de 9 km.", score: 61, read: true, d: 18 })
  alertSeeds.push({ g: "Medenine", type: "NOUVELLE_ZONE", msg: "Nouvelle zone blanche identifiée sur la RN1 Ben Guerdane : TMJ 8 500 véh/j, concurrence quasi nulle.", score: 74, read: false, d: 4 })
  alertSeeds.push({ g: "Gabès", type: "ZONE_EQUIPEE", msg: "Zone « Zone industrielle Gabès » désormais équipée : micro-hub opérationnel depuis cette semaine.", score: 0, read: true, d: 12 })
  alertSeeds.push({ g: "Tozeur", type: "SEUIL_ATTEINT", msg: "Zone « Entrée de Tozeur » — score 71/100 : franchit le seuil d'alerte suite à la hausse du parc ATTT.", score: 71, read: false, d: 1 })
  for (const a of alertSeeds) {
    await db.opportunityAlert.create({
      data: {
        zoneId: null, gouvernorat: a.g, type: a.type, message: a.msg, score: a.score,
        read: a.read, createdAt: daysAgo(a.d),
      },
    })
  }

  // ---- 4) Études de faisabilité (8 zones top) ----------------------------
  console.log("→ 8 FeasibilityStudy…")
  const etudeZones = sorted.slice(0, 8)
  const etudeZoneIds: string[] = []
  for (const z of etudeZones) {
    const [gouv, deleg, zoneName, , , tmj, , , prix, dispo] = z.spec
    const inv = z.format === "STATION" ? 2_850_000 : z.format === "MOBILITY_HUB" ? 890_000 : 480_000
    const surface = z.format === "STATION" ? 3200 : z.format === "MOBILITY_HUB" ? 850 : 350
    const terrains = [
      { localisation: `${zoneName} — parcelle A`, surfaceM2: surface, prixM2: prix, statut: "DISPONIBLE" },
      { localisation: `${zoneName} — parcelle B`, surfaceM2: Math.round(surface * 0.8), prixM2: Math.round(prix * 1.12), statut: "EN_NEGOCIATION" },
      { localisation: `${deleg} — zone d'activité`, surfaceM2: Math.round(surface * 1.6), prixM2: Math.round(prix * 0.9), statut: "A_VERIFIER" },
    ]
    const regulation = [
      { etape: "APIC — autorisation d'aménagement du littoral", autorite: "APIC / Ministère de l'Équipement", delaiJours: 90, statut: "A_OBTENIR", commentaire: "Requis si parcelle < 500 m du plan d'eau." },
      { etape: "Permis de bâtir", autorite: "Municipalité de " + deleg, delaiJours: 60, statut: "A_OBTENIR", commentaire: "Dossier architecte + bureau de contrôle." },
      { etape: "Avis conforme UTAP", autorite: "Commissariat régional au développement (CRDA)", delaiJours: 45, statut: "A_OBTENIR", commentaire: "Compatibilité urbanisme et environnement." },
      { etape: "Autorisation d'exploiter un point de vente de carburant", autorite: "Ministère du Commerce", delaiJours: 120, statut: "A_OBTENIR", commentaire: "Quota régional et cahier des charges." },
      { etape: "Étude d'impact environnemental", autorite: "ANPE", delaiJours: 30, statut: "A_OBTENIR", commentaire: "Bassin de récupération + séparateur hydrocarbures." },
    ]
    const rh = z.format === "STATION" ? [
      { profil: "Chef de station", effectif: 1, coutMensuelDt: 1600, description: "Gestion complète du point de vente, reporting enseigne." },
      { profil: "Pompiste qualifié", effectif: 6, coutMensuelDt: 1050, description: "Service pompe, prévention et propreté." },
      { profil: "Magasinier-boutique", effectif: 2, coutMensuelDt: 950, description: "Vente boutique et gestion des stocks." },
    ] : [
      { profil: "Chef de micro-hub", effectif: 1, coutMensuelDt: 1400, description: "Pilotage du point, accueil et clôture caisse." },
      { profil: "Mécanicien vidange / pneus", effectif: 2, coutMensuelDt: 1200, description: "Vidanges express et montage pneus." },
      { profil: "Technicien diagnostic", effectif: 1, coutMensuelDt: 1350, description: "Diagnostic électronique et devis." },
    ]
    const row = await db.feasibilityStudy.create({
      data: {
        zoneId: zoneByLabel.get(`${zoneName} (${deleg}, ${gouv})`)!.id,
        brandSlug: pick([...BRANDS]),
        title: `Étude de faisabilité — ${zoneName} (${deleg}, ${gouv})`,
        status: "GENERE", pages: 20, investment: inv,
        foncier: { prixM2: prix, surfaceM2: surface, terrains },
        regulation, rh,
        summary:
          `La zone « ${zoneName} » (${deleg}, ${gouv}) présente un score d'opportunité de ${z.sGlobal}/100 ` +
          `(parc ${z.sPark}, pouvoir d'achat ${z.sPower}, trafic ${z.sTraffic}, concurrence ${z.sComp}, foncier ${z.sFoncier}). ` +
          `Le trafic moyen journalier estimé (${tmj.toLocaleString("fr-FR")} véh/j) et la densité du parc automobile ` +
          `(${z.density} véh/km²) justifient le format ${z.format === "STATION" ? "station classique" : z.format === "MOBILITY_HUB" ? "Mobility Hub" : "micro-station express"}. ` +
          `L'investissement prévisionnel est de ${inv.toLocaleString("fr-FR")} DT sur une emprise de ${surface.toLocaleString("fr-FR")} m² ` +
          `(foncier ${dispo.toLowerCase().replace(/^./, c => c.toUpperCase())}, ~${prix} DT/m²). ` +
          `Le calendrier réglementaire (APIC, permis de bâtir, autorisation d'exploiter) estime l'ouverture à ${z.format === "STATION" ? 14 : 7} mois. ` +
          `Recommandation : instruire cette opportunité en priorité régionale.`,
        createdAt: daysAgo(ri(10, 40)),
      },
    })
    etudeZoneIds.push(row.zoneId)
  }

  // ---- 5) Simulations de rentabilité (12 zones × 3 scénarios) ------------
  console.log("→ 36 RentabilitySimulation…")
  const simZones = sorted.slice(0, 12)
  const simZoneIds: string[] = []
  for (const z of simZones) {
    const [gouv, deleg, zoneName, , , tmj] = z.spec
    const inv = z.format === "STATION" ? 2_850_000 : z.format === "MOBILITY_HUB" ? 890_000 : 480_000
    const baseCa = Math.round((tmj * 0.9 + z.veh * 0.02) * (z.format === "STATION" ? 8.5 : z.format === "MOBILITY_HUB" ? 4.2 : 2.6))
    const id = zoneByLabel.get(`${zoneName} (${deleg}, ${gouv})`)!.id
    simZoneIds.push(id)
    const scenarios: [string, number, number, number, number][] = [
      ["PESSIMISTE", 0.72, 0.58, 3, 0.022],
      ["REALISTE", 1.00, 0.55, 6, 0.030],
      ["OPTIMISTE", 1.28, 0.52, 10, 0.038],
    ]
    for (const [scenario, mul, chargeRatio, growth, convRate] of scenarios) {
      const ca1 = Math.round(baseCa * mul)
      const charges = Math.round(ca1 * chargeRatio)
      const margeAnnuelle = ca1 - charges
      const be = margeAnnuelle > 0 ? Math.max(6, Math.round(inv / margeAnnuelle * 12)) : 999
      const ca5 = ca1 * Math.pow(1 + growth / 100, 4)
      const net5 = Math.round(ca5 - ca5 * chargeRatio)
      await db.rentabilitySimulation.create({
        data: {
          zoneId: id, scenario, investment: inv, caYear1: ca1, chargesAnnual: charges,
          growthPct: growth, horizonYears: 5, breakEvenMonths: be, netYear5: net5,
          newClients: Math.round(tmj * convRate * 30),
        },
      })
    }
  }

  // ---- 6) Franchise : candidats, contrats, kits ---------------------------
  console.log("→ 14 FranchiseCandidate + 5 FranchiseContract + 40 FranchiseKitItem…")
  const signedNames: string[] = []
  // [nom, email, gouv, capital (DT), expérience, ville, statut, score, zoneLabel|null]
  const candidateSpecs: [string, string, string, number, string, string, string, number, string | null][] = [
    ["Hatem Ben Salah", "hatem.ben salah@ben-salah-automobiles.tn", "Bizerte", 280000, "Concession automobile (12 ans)", "Mateur", "SIGNE", 88, "Axe RN11 Mateur (Mateur, Bizerte)"],
    ["Rim Ayadi", "rim.ayadi@gmail.com", "Sousse", 190000, "Station-service familiale", "Msaken", "SIGNE", 84, "RN1 M'saken (Msaken, Sousse)"],
    ["Walid Chaouch", "walid.chaouch@chaouch-fils.tn", "Gabès", 160000, "Transport & logistique (8 ans)", "Gabès", "SIGNE", 81, "Zone industrielle Gabès (Gabès, Gabès)"],
    ["Amel Rekik", "amel.rekik@outlook.com", "Medenine", 240000, "Commerce & distribution", "Djerba Midoun", "SIGNE", 79, "Djerba — route Midoun (Djerba Midoun, Medenine)"],
    ["Slim Tounsi", "slim.tounsi@gmail.com", "Kairouan", 140000, "Garage mécanique générale", "Hajeb Layoun", "SIGNE", 76, "Axe Hajeb Layoun (Hajeb Layoun, Kairouan)"],
    ["Nizar Ferchichi", "nizar.ferchichi@topnet.tn", "Sfax", 210000, "Négoce pièces détachées", "Sakiet Ezzit", "EN_NEGOCIATION", 73, "RN10 Sakiet Ezzit (Sakiet Ezzit, Sfax)"],
    ["Ines Saadi", "ines.saadi@gmail.com", "Nabeul", 175000, "Franchise restauration rapide", "Hammamet", "EN_NEGOCIATION", 70, "Hammamet sud (Hammamet, Nabeul)"],
    ["Mehdi Oueslati", "mehdi.oueslati@yahoo.fr", "Ben Arous", 155000, "Flotte utilitaires", "Fouchana", "CONTACTE", 64, null],
    ["Dorra Marzouki", "dorra.marzouki@gmail.com", "Manouba", 120000, "Ex-responsable grande distribution", "Manouba", "CONTACTE", 61, null],
    ["Karim Nasri", "karim.nasri@topnet.tn", "Tozeur", 95000, "Agriculture & irrigation", "Nefta", "CONTACTE", 58, null],
    ["Sonia Zouari", "sonia.zouari@gmail.com", "Sidi Bouzid", 90000, "Commerce de détail", "Regueb", "CONTACTE", 55, null],
    ["Fathi Dridi", "fathi.dridi@yahoo.fr", "Kasserine", 130000, "BTP & travaux publics", "Sbeitla", "NOUVEAU", 52, null],
    ["Yassine Lahiani", "yassine.lahiani@gmail.com", "Tataouine", 85000, "Guide touristique → reconversion", "Tataouine", "NOUVEAU", 47, null],
    ["Salma Ben Amor", "salma.benam or@gmail.com", "Beja", 65000, "Débutant — apport familial", "Beja Nord", "REFUSE", 34, null],
  ]
  const candidateIdByName = new Map<string, string>()
  for (const [nm, mail, gouv, capital, exp, city, status, score, zoneLabel] of candidateSpecs) {
    const row = await db.franchiseCandidate.create({
      data: {
        name: nm,
        email: mail.replace(/ /g, ""),
        phone: phone(), gouvernorat: gouv, city, profile:
          `Entrepreneur ${exp.toLowerCase()} basé à ${city}. Apport personnel ${capital.toLocaleString("fr-FR")} DT, ` +
          `à la recherche d'une activité de services en franchise dans le secteur automobile.`,
        capital, experience: exp, status, score,
        zoneId: zoneLabel ? zoneByLabel.get(zoneLabel)?.id ?? null : null,
        zoneLabel, createdAt: daysAgo(ri(20, 260)),
      },
    })
    candidateIdByName.set(nm, row.id)
    if (status === "SIGNE") signedNames.push(nm)
  }

  const contractBrand = ["agil", "totalenergies", "shell", "ola", "agil"]
  for (let i = 0; i < signedNames.length; i++) {
    const nm = signedNames[i]
    const b = contractBrand[i]
    const zoneLabel = candidateSpecs.find(c => c[0] === nm)![8]!
    const entry = ri(25, 45) * 1000
    const royalty = round(rf(1.8, 2.6), 1)
    const years = ri(7, 9)
    const ref = `FR-2026-0${i + 1}`
    const content =
      `CONTRAT DE FRANCHISE « ${b.toUpperCase()} MOBILITY POINT »\n` +
      `Référence : ${ref}\n\n` +
      `Entre la direction de l'enseigne (ci-après « le Franchiseur ») et ${nm} (ci-après « le Franchisé »), ` +
      `il est convenu ce qui suit :\n\n` +
      `Article 1 — Objet. Le Franchiseur accorde au Franchisé l'exploitation d'un point de service ` +
      `« Mobility Point » sur la zone « ${zoneLabel} », sous enseigne, signes distinctifs et savoir-faire du Franchiseur.\n\n` +
      `Article 2 — Droit d'entrée. Le Franchisé verse au Franchiseur un droit d'entrée forfaitaire de ` +
      `${entry.toLocaleString("fr-FR")} DT, non remboursable, à la signature.\n\n` +
      `Article 3 — Redevance. Le Franchisé verse une redevance mensuelle égale à ${String(royalty).replace(".", ",")} % ` +
      `du chiffre d'affaires hors taxes réalisé par le point de service.\n\n` +
      `Article 4 — Durée. Le présent contrat est conclu pour une durée de ${years} ans, renouvelable par tacite ` +
      `reconduction sous réserve d'un préavis de 6 mois.\n\n` +
      `Article 5 — Obligations du Franchiseur : enseigne et kit de démarrage complet, formation initiale de 2 semaines, ` +
      `logiciel de gestion CarbuScope TMP, hotline technique 6j/7, audit qualité annuel.\n\n` +
      `Article 6 — Obligations du Franchisé : respect du cahier des charges (propreté, délais de service, prix affichés), ` +
      `approvisionnements référencés, transmission quotidienne des données d'exploitation.\n\n` +
      `Article 7 — Exclusivité territoriale : rayon de ${ri(8, 15)} km autour du point de service.\n\n` +
      `Fait à Tunis, le ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(monthsAgo(10 - i * 2))}.`
    await db.franchiseContract.create({
      data: {
        reference: ref, candidateId: candidateIdByName.get(nm)!, brandSlug: b,
        zoneId: zoneByLabel.get(zoneLabel)!.id,
        entryFee: entry, royaltyPct: royalty, durationYears: years,
        status: "SIGNE", content, createdAt: monthsAgo(10 - i * 2),
      },
    })
  }

  const KIT: [string, string, string][] = [
    ["ENSEIGNE", "Enseigne lumineuse + kit signalétique complet", "Fixation façade, lettres lumineuses, panneau prix réglementé."],
    ["FORMATION", "Formation démarrage — 2 semaines", "Pilotage du point, qualité de service, sécurité, logiciel."],
    ["FORMATION", "Plateforme e-learning réseau", "Modules vidange, pneus, diagnostic et relation client (12 CFP)."],
    ["LOGICIEL", "Licence CarbuScope TMP + tablette", "Gestion prestations, stock, clients, reporting quotidien intégré."],
    ["EQUIPEMENT", "Pont élévateur 2 colonnes 4 T", "Installation et mise en service incluses."],
    ["EQUIPEMENT", "Banc diagnostic OBD-II multimarque", "Mises à jour constructeurs 3 ans incluses."],
    ["SUPPORT", "Hotline technique 6j/7", "Assistance mécanique et logicielle de 8h à 20h."],
    ["SUPPORT", "Audit qualité annuel", "Visite mystère + plan d'action, 1 fois par an."],
  ]
  for (const b of BRANDS) {
    for (const [category, label, description] of KIT) {
      await db.franchiseKitItem.create({ data: { brandSlug: b, category, label, description, active: true } })
    }
  }

  // ---- 7) Mobility Hubs (TMP) --------------------------------------------
  console.log("→ 15 MobilityHub…")
  // [code, nom, enseigne, zoneLabel|null, franchise, gouv, deleg, lat, lng, statut, mois d'ouverture, surface, baies, inv, CA cible, note]
  const HUBS: [string, string, string, string | null, string, string, string, number, number, string, number, number, number, number, number, number][] = [
    ["TMP-001", "Agil Mobility Point Mateur", "agil", "Axe RN11 Mateur (Mateur, Bizerte)", "Hatem Ben Salah", "Bizerte", "Mateur", 37.036, 9.638, "OPERATIONNEL", 26, 320, 3, 485000, 46000, 4.6],
    ["TMP-002", "Agil Mobility Point Msaken", "agil", "RN1 M'saken (Msaken, Sousse)", "Rim Ayadi", "Sousse", "Msaken", 35.731, 10.678, "OPERATIONNEL", 22, 360, 3, 512000, 58000, 4.4],
    ["TMP-003", "Agil Mobility Point Kairouan", "agil", "Axe Hajeb Layoun (Hajeb Layoun, Kairouan)", "Slim Tounsi", "Kairouan", "Hajeb Layoun", 35.663, 10.112, "OPERATIONNEL", 18, 280, 2, 455000, 39000, 4.3],
    ["TMP-004", "Agil Mobility Point Fouchana", "agil", null, "Mehdi Oueslati", "Ben Arous", "Fouchana", 36.655, 10.220, "EN_CONSTRUCTION", 2, 300, 3, 490000, 52000, 4.2],
    ["TMP-005", "Agil Mobility Point Gabès", "agil", "Zone industrielle Gabès (Gabès, Gabès)", "Walid Chaouch", "Gabès", "Gabès", 33.872, 10.098, "OPERATIONNEL", 14, 340, 3, 505000, 47000, 4.5],
    ["TMP-006", "TotalEnergies Mobility Point Djerba", "totalenergies", "Djerba — route Midoun (Djerba Midoun, Medenine)", "Amel Rekik", "Medenine", "Djerba Midoun", 33.806, 10.712, "OPERATIONNEL", 20, 400, 4, 920000, 74000, 4.7],
    ["TMP-007", "TotalEnergies Mobility Point Sakiet Ezzit", "totalenergies", "RN10 Sakiet Ezzit (Sakiet Ezzit, Sfax)", "Nizar Ferchichi", "Sfax", "Sakiet Ezzit", 34.882, 10.752, "PILOTE", 8, 350, 3, 880000, 61000, 4.5],
    ["TMP-008", "TotalEnergies Mobility Point Gafsa", "totalenergies", null, "Sami Bouazizi", "Gafsa", "Gafsa", 34.425, 8.785, "OPERATIONNEL", 12, 300, 2, 845000, 52000, 4.2],
    ["TMP-009", "TotalEnergies Mobility Point Zaghouan", "totalenergies", "Entrée de Zaghouan (Zaghouan, Zaghouan)", "Riadh Haddad", "Zaghouan", "Zaghouan", 36.402, 10.142, "EN_CONSTRUCTION", 1, 260, 2, 830000, 38000, 4.1],
    ["TMP-010", "Shell Mobility Point Hammamet", "shell", "Hammamet sud (Hammamet, Nabeul)", "Ines Saadi", "Nabeul", "Hammamet", 36.401, 10.618, "OPERATIONNEL", 16, 330, 3, 890000, 66000, 4.6],
    ["TMP-011", "Shell Mobility Point Agareb", "shell", "Zone Agareb (Agareb, Sfax)", "Ghazi Marzouki", "Sfax", "Agareb", 34.792, 10.698, "OPERATIONNEL", 10, 290, 2, 860000, 44000, 4.3],
    ["TMP-012", "Ola Mobility Point Medenine", "ola", "Carrefour RN1 Medenine (Medenine, Medenine)", "Ali Kooli", "Medenine", "Medenine", 33.352, 10.502, "OPERATIONNEL", 13, 270, 2, 440000, 35000, 4.4],
    ["TMP-013", "Ola Mobility Point Jemmal", "ola", "Zone Jemmal (Jemmal, Monastir)", "Nabil Mezni", "Monastir", "Jemmal", 35.622, 10.832, "OPERATIONNEL", 7, 310, 3, 470000, 51000, 4.5],
    ["TMP-014", "Star Oil Mobility Point Tozeur", "staroil", "Entrée de Tozeur (Tozeur, Tozeur)", "Karim Nasri", "Tozeur", "Tozeur", 33.922, 8.132, "PILOTE", 5, 240, 2, 410000, 27000, 4.1],
    ["TMP-015", "Star Oil Mobility Point Le Kef", "staroil", null, "Fethi Nasri", "Le Kef", "Le Kef Est", 36.172, 8.702, "OPERATIONNEL", 9, 250, 2, 430000, 29000, 4.2],
  ]
  const hubIds: string[] = []
  const hubRows: { id: string; code: string; brandSlug: string; gouv: string }[] = []
  for (const [code, name, brandSlug, zoneLabel, franchisee, gouv, deleg, lat, lng, status, months, surface, bays, inv, targetCa, rating] of HUBS) {
    const zoneId = zoneLabel ? zoneByLabel.get(zoneLabel)?.id ?? null : null
    const roadLabel = zoneLabel ? zoneLabel.split(" (")[0] : "Zone " + deleg
    const row = await db.mobilityHub.create({
      data: {
        code, name, brandSlug, gouvernorat: gouv, delegation: deleg,
        address: roadLabel + " — " + deleg + ", " + gouv,
        lat, lng, franchisee, contractRef: null,
        status, openedAt: status === "EN_CONSTRUCTION" ? NOW : monthsAgo(months),
        surfaceM2: surface, bays, investment: inv, targetMonthlyCa: targetCa,
        rating, reviewsCount: ri(35, 240),
      },
    })
    hubIds.push(row.id)
    hubRows.push({ id: row.id, code, brandSlug, gouv })
  }

  // ---- 8) Base clients TMP (véhicules) ------------------------------------
  console.log("→ HubVehicle (~200)…")
  const vehicleRows: { id: string; hubId: string; plate: string }[] = []
  const tierFor = (pts: number) => pts >= 500 ? "PLATINE" : pts >= 300 ? "OR" : pts >= 150 ? "ARGENT" : "BRONZE"
  for (const hub of hubRows) {
    const n = ri(11, 16)
    for (let i = 0; i < n; i++) {
      const [brand, model, fuel] = pick(CARS)
      const plate = `${ri(100, 999)} ${pick(PLATE_LETTERS)} ${ri(1000, 9999)}`
      const owner = name()
      const services = ri(1, 7)
      const spent = services * ri(55, 190)
      const pts = services * ri(6, 22)
      const lastAt = daysAgo(ri(5, 110))
      const row = await db.hubVehicle.create({
        data: {
          hubId: hub.id, plate, brand, model, year: ri(2008, 2025), fuel,
          km: ri(25000, 310000), ownerName: owner, ownerPhone: phone(),
          firstSeenAt: daysAgo(ri(120, 400)), lastServiceAt: lastAt,
          nextServiceDueAt: new Date(lastAt.getTime() + ri(150, 220) * 86400_000),
          servicesCount: services, totalSpent: spent, loyaltyPoints: pts,
          loyaltyTier: tierFor(pts), notes: i % 9 === 0 ? "Client exigeant — privilégier rendez-vous du matin." : null,
        },
      })
      vehicleRows.push({ id: row.id, hubId: hub.id, plate })
    }
  }

  // ---- 9) Prestations (120 jours) ------------------------------------------
  console.log("→ HubServiceRecord (~520 sur 120 jours)…")
  const hubVehicleByHub = new Map<string, { id: string; plate: string }[]>()
  for (const v of vehicleRows) {
    const arr = hubVehicleByHub.get(v.hubId) ?? []
    arr.push({ id: v.id, plate: v.plate })
    hubVehicleByHub.set(v.hubId, arr)
  }
  const serviceCount = { VIDANGE: 0, PNEUS_VENTE: 0, PNEUS_MONTAGE: 0, DIAGNOSTIC: 0 }
  let totalRecords = 0
  const diagnosticPlates: { hubId: string; plate: string; vehicleId: string | null }[] = []
  for (const hub of hubRows) {
    const vs = hubVehicleByHub.get(hub.id) ?? []
    for (let d = 119; d >= 0; d--) {
      const dayRecords = ri(0, 2) === 0 ? 0 : ri(1, 2)
      for (let k = 0; k < dayRecords; k++) {
        const v = vs.length ? pick(vs) : null
        const roll = rnd()
        const type = roll < 0.42 ? "VIDANGE" : roll < 0.56 ? "PNEUS_VENTE" : roll < 0.72 ? "PNEUS_MONTAGE" : "DIAGNOSTIC"
        const amount = type === "VIDANGE" ? ri(65, 240) : type === "PNEUS_VENTE" ? ri(320, 1480) : type === "PNEUS_MONTAGE" ? ri(60, 120) : ri(40, 90)
        const detail = type === "VIDANGE" ? `Huile ${pick(HUILES)} · filtre ${pick(["huile", "air", "carburant"])}`
          : type === "PNEUS_VENTE" ? `${ri(2, 4)} pneus ${pick(TIRE_SIZES)} ${pick(["Michelin", "Continental", "Sailun", "Hankook", "Barum"])}`
          : type === "PNEUS_MONTAGE" ? `Montage + équilibrage ${pick(TIRE_SIZES)}`
          : `Rapport ${pick(DTC)}${rnd() < 0.4 ? " + lecture FAP" : ""}`
        await db.hubServiceRecord.create({
          data: {
            hubId: hub.id, type, vehicleId: v?.id ?? null, plate: v?.plate ?? `${ri(100, 999)} ${pick(PLATE_LETTERS)} ${ri(1000, 9999)}`,
            performedAt: new Date(daysAgo(d).getTime() + ri(8, 19) * 3600_000),
            amount, durationMin: type === "VIDANGE" ? 30 : type === "PNEUS_VENTE" ? 55 : type === "PNEUS_MONTAGE" ? 40 : 45,
            detail,
          },
        })
        serviceCount[type]++
        totalRecords++
        if (type === "DIAGNOSTIC" && v) diagnosticPlates.push({ hubId: hub.id, plate: v.plate, vehicleId: v.id })
      }
    }
  }

  // ---- 10) Conversions (stations cibles réelles) ---------------------------
  console.log("→ HubConversion (~115, stations cibles réelles)…")
  const stationsByGov = new Map<string, { code: string; name: string; brandSlug: string | null }[]>()
  const allStations = await db.station.findMany({
    where: { status: "ACTIVE" },
    select: { code: true, name: true, gouvernorat: true },
    take: 800,
  })
  for (const s of allStations) {
    const arr = stationsByGov.get(s.gouvernorat) ?? []
    arr.push({ code: s.code, name: s.name, brandSlug: null })
    stationsByGov.set(s.gouvernorat, arr)
  }
  let conversionsCreated = 0
  for (const hub of hubRows) {
    const pool = (stationsByGov.get(hub.gouv) ?? allStations.slice(0, 30))
    const diagOfHub = diagnosticPlates.filter(p => p.hubId === hub.id)
    const n = Math.min(diagOfHub.length, ri(5, 9))
    for (let i = 0; i < n; i++) {
      const src = diagOfHub[i]
      if (!src) break
      const target = pool.length ? pool[Math.floor(rnd() * Math.min(pool.length, 25))] : { code: "UNK", name: "Station inconnue", brandSlug: null }
      const st = rnd() < 0.55 ? "CONFIRMEE" : rnd() < 0.75 ? "PROPOSEE" : "PERDUE"
      const proposed = daysAgo(ri(3, 110))
      const amount = ri(180, 2200)
      await db.hubConversion.create({
        data: {
          hubId: hub.id, vehicleId: src.vehicleId, plate: src.plate,
          reason: pick(CONV_REASONS),
          targetStationCode: target.code, targetStationName: target.name,
          proposedAt: proposed,
          confirmedAt: st === "CONFIRMEE" ? new Date(proposed.getTime() + ri(1, 6) * 86400_000) : null,
          status: st, amount: st === "PERDUE" ? 0 : amount, followed: st !== "PERDUE",
        },
      })
      conversionsCreated++
    }
  }

  // ---- 11) Stocks + équipements --------------------------------------------
  console.log("→ HubStockItem (~150) + HubEquipment (60)…")
  const STOCKS: [string, string, string, number, number, number][] = [
    // [sku, label, category, qty par défaut, seuil, coût unitaire]
    ["F-HU-5W30", "Huile synthèse 5W-30 — bidon 5 L", "CONSOMMABLE", 40, 12, 62],
    ["F-HU-5W40", "Huile semi-synthèse 5W-40 — bidon 5 L", "CONSOMMABLE", 28, 10, 54],
    ["F-HU-10W40", "Huile minérale 10W-40 — bidon 5 L", "CONSOMMABLE", 18, 8, 41],
    ["F-HU-DIESEL", "Huile diesel 15W-40 — bidon 5 L", "CONSOMMABLE", 14, 8, 48],
    ["F-AR-195", "Filtre à air 195/65-type", "PIECE", 16, 6, 24],
    ["F-AR-205", "Filtre à air 205/55-type", "PIECE", 10, 6, 28],
    ["F-AC-220", "Filtre à carburant universel", "PIECE", 12, 5, 19],
    ["F-HU-CART", "Cartouche filtre à huile (assortiment)", "PIECE", 9, 6, 16],
    ["P-19565", "Pneu 195/65 R15 toutes saisons", "PNEU", 12, 4, 175],
    ["P-20555", "Pneu 205/55 R16 été", "PNEU", 6, 4, 235],
  ]
  for (const hub of hubRows) {
    for (const [sku, label, category, qty, minQ, cost] of STOCKS) {
      const q = category === "PNEU" ? ri(0, qty) : ri(Math.floor(qty * 0.3), qty)
      await db.hubStockItem.create({
        data: { hubId: hub.id, sku, label, category, quantity: q, minQuantity: minQ, unitCost: cost },
      })
    }
    const EQUIPMENTS: [string, string][] = [
      ["Pont élévateur 2 colonnes", "Stertil 4 T — ST402"],
      ["Banc diagnostic électronique", "Bosch KTS 570"],
      ["Démonte-pneus + équilibreuse", "Corghi Artiglio + Silver"],
      ["Compresseur d'air", "ABAC 200 L — B6000"],
    ]
    const nextIdx = Math.floor(rnd() * 5)
    for (let i = 0; i < EQUIPMENTS.length; i++) {
      const [nm, model] = EQUIPMENTS[i]
      const lastM = daysAgo(ri(30, 240))
      const nextInDays = i === nextIdx ? ri(-30, 15) : ri(60, 300)
      const nextM = new Date(NOW.getTime() + nextInDays * 86400_000)
      const status = nextInDays < 0 ? "ALERTE" : nextInDays < 45 ? "VIGILANCE" : "OK"
      await db.hubEquipment.create({
        data: {
          hubId: hub.id, name: nm, model, installedAt: monthsAgo(ri(14, 30)),
          lastMaintenanceAt: lastM, nextMaintenanceAt: nextM, status,
          operatingHours: ri(800, 7800),
        },
      })
    }
  }

  // ---- 12) Paramètres TMP (tarifs, pneus, templates, fidélité) -------------
  console.log("→ HubPriceItem (30) + HubTireProduct (16) + HubDiagnosticTemplate (15) + HubLoyaltyRule (20)…")
  const PRICE_BASE: [string, string, number, number][] = [
    ["VIDANGE_STANDARD", "Vidange express (huile + filtre)", 89, 30],
    ["VIDANGE_PREMIUM", "Vidange premium (synthèse + contrôle 12 points)", 149, 45],
    ["PNEUS_MONTAGE", "Montage + équilibrage (4 pneus)", 80, 40],
    ["EQUILIBRAGE", "Équilibrage 2 roues", 30, 20],
    ["DIAGNOSTIC_COMPLET", "Diagnostic électronique complet + rapport", 70, 45],
    ["DIAGNOSTIC_EXPRESS", "Lecture codes + effacement", 45, 20],
  ]
  for (const b of BRANDS) {
    const mul = b === "totalenergies" ? 1.12 : b === "shell" ? 1.06 : b === "agil" ? 0.96 : 1.0
    for (const [serviceType, label, price, dur] of PRICE_BASE) {
      await db.hubPriceItem.create({
        data: { brandSlug: b, serviceType, label, price: Math.round(price * mul), durationMin: dur, active: true },
      })
    }
  }
  const TIRES: [string, string, string, string, string, number, number][] = [
    ["MIC-19565-15-TS", "Michelin", "Primacy 4", "195/65 R15", "TOUTES_SAISONS", 259, 12],
    ["MIC-20555-16-E", "Michelin", "Energy Saver+", "205/55 R16", "ETE", 298, 8],
    ["MIC-18565-15-TS", "Michelin", "Energy Saver+", "185/65 R15", "TOUTES_SAISONS", 231, 6],
    ["CON-19565-15-E", "Continental", "PremiumContact 6", "195/65 R15", "ETE", 249, 10],
    ["CON-20555-16-TS", "Continental", "PremiumContact 6", "205/55 R16", "TOUTES_SAISONS", 305, 5],
    ["CON-21560-16-E", "Continental", "CrossContact LX2", "215/60 R16", "ETE", 349, 4],
    ["SAL-19565-15-TS", "Sailun", "Atrezzo Eco", "195/65 R15", "TOUTES_SAISONS", 145, 18],
    ["SAL-18565-15-TS", "Sailun", "Atrezzo Eco", "185/65 R15", "TOUTES_SAISONS", 132, 14],
    ["SAL-20555-16-TS", "Sailun", "Atrezzo Elite", "205/55 R16", "TOUTES_SAISONS", 172, 9],
    ["HAN-19565-15-E", "Hankook", "Kinergy Eco2", "195/65 R15", "ETE", 209, 11],
    ["HAN-20555-16-TS", "Hankook", "Kinergy 4S2", "205/55 R16", "TOUTES_SAISONS", 265, 7],
    ["BAR-19565-15-TS", "Barum", "Bravuris 3HM", "195/65 R15", "TOUTES_SAISONS", 168, 13],
    ["BAR-18565-15-E", "Barum", "Bravuris 3HM", "185/65 R15", "ETE", 154, 8],
    ["GOO-19565-15-E", "Goodyear", "EfficientGrip Performance", "195/65 R15", "ETE", 236, 6],
    ["BRI-20555-16-TS", "Bridgestone", "Turanza T005", "205/55 R16", "TOUTES_SAISONS", 288, 5],
    ["NOK-19565-15-H", "Nokian", "Snowproof 2", "195/65 R15", "HIVER", 274, 3],
  ]
  for (const [ref, brand, model, size, season, price, stock] of TIRES) {
    await db.hubTireProduct.create({
      data: { ref, brand, model, size, season, price, stockHint: stock, active: true },
    })
  }
  const TEMPLATES: [string, string, { systeme: string; points: string[] }[]][] = [
    ["DIAG-MOTEUR", "Diagnostic moteur complet", [
      { systeme: "Compression & distribution", points: ["Compression par cylindre (bar)", "Calage distribution", "Tension courroie/chaîne"] },
      { systeme: "Injection & carburation", points: ["Débit injecteurs", "Pression rampe (bar)", "Retour fumées opacité"] },
      { systeme: "Turbo & admission", points: ["Pression turbo", "Fuite admission (smoke test)", "État échangeur"] },
      { systeme: "Lubrification", points: ["Pression huile", "Débit retour turbo", "Usure pompe"] },
    ]],
    ["DIAG-ELECTRIQUE", "Diagnostic électrique & démarrage", [
      { systeme: "Batterie", points: ["Tension repos (V)", "Tension démarrage (V)", "Test conductance"] },
      { systeme: "Alternateur", points: ["Tension charge (V)", "Courant de charge (A)", "Diodes bruyantes"] },
      { systeme: "Démarreur", points: ["Courant appel (A)", "État bendix", "Sollicitation relais"] },
      { systeme: "Faisceaux & masse", points: ["Chute de tension", "Continuité masses", "Oxydation connecteurs"] },
    ]],
    ["DIAG-CONFORT-GESTION", "Diagnostic confort & calculateurs", [
      { systeme: "Climatisation", points: ["Pression HP/BP", "Débit ventilo condenseur", "Fuite traceur UV"] },
      { systeme: "ABS/ESP", points: ["Codes Cxxxx", "Capteurs roues (Ω)", "Bloc hydraulique"] },
      { systeme: "Airbags & ceintures", points: ["Codes résistance bouclier", "Témoins SRS", "Horloge crash"] },
      { systeme: "Boîte & transmission", points: ["Température huile BVA", "Slip Lock-up", "Fluidité passages"] },
    ]],
  ]
  for (const b of BRANDS) {
    for (const [code, nm, systems] of TEMPLATES) {
      await db.hubDiagnosticTemplate.create({
        data: { brandSlug: b, code, name: nm, systems, active: true },
      })
    }
  }
  const LOYALTY: [string, number, string, number][] = [
    ["VIDANGE", 10, "Vidange express offerte", 200],
    ["DIAGNOSTIC", 5, "Diagnostic complet offert", 120],
    ["PNEUS", 15, "Pneu offert (montage inclus)", 500],
    ["CONVERSION", 25, "Bon carburant 20 L + lavage", 300],
  ]
  for (const b of BRANDS) {
    for (const [action, points, rewardLabel, rewardThreshold] of LOYALTY) {
      await db.hubLoyaltyRule.create({
        data: { brandSlug: b, action, points, rewardLabel, rewardThreshold, active: true },
      })
    }
  }

  // ---- Compte-rendu --------------------------------------------------------
  const [nz, nal, nst, nve, nre, nco] = await Promise.all([
    db.opportunityZone.count(), db.opportunityAlert.count(),
    db.mobilityHub.count(), db.hubVehicle.count(),
    db.hubServiceRecord.count(), db.hubConversion.count(),
  ])
  console.log("✔ Seed T51 terminé :")
  console.log(`   Zones: ${nz} (dont ${await db.opportunityZone.count({ where: { isWhiteZone: true } })} zones blanches)`)
  console.log(`   Alertes: ${nal} · Études: ${await db.feasibilityStudy.count()} · Simulations: ${await db.rentabilitySimulation.count()}`)
  console.log(`   Candidats: ${await db.franchiseCandidate.count()} · Contrats: ${await db.franchiseContract.count()} · Kit: ${await db.franchiseKitItem.count()}`)
  console.log(`   TMP: ${nst} · Véhicules: ${nve} · Prestations: ${nre} · Conversions: ${nco}`)
  console.log(`   Stocks: ${await db.hubStockItem.count()} · Équipements: ${await db.hubEquipment.count()}`)
  console.log(`   Prix: ${await db.hubPriceItem.count()} · Pneus: ${await db.hubTireProduct.count()} · Templates: ${await db.hubDiagnosticTemplate.count()} · Fidélité: ${await db.hubLoyaltyRule.count()}`)
  console.log(`   Répartition prestations : ${JSON.stringify(serviceCount)} (total ${totalRecords})`)
}

main()
  .catch(e => { console.error("✘ Erreur seed T51 :", e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
