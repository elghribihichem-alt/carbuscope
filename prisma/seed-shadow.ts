// ============================================================================
// CarbuScope — Module Shadow Market (T44) : seed du marché parallèle
// Exécution : bun prisma/seed-shadow.ts
//
// Réinitialise les tables Shadow* (dans l'ordre inverse des dépendances FK)
// puis insère : typologies, config, ~929 points informels (847 actifs),
// ~380 updates de cycle de vie, 14 auditeurs, 26 événements de recensement,
// 12 mois de statistiques et 12 alertes.
//
// Reproductibilité : PRNG mulberry32 seedé (aucun Math.random) + date machine
// fixée au 26 septembre 2026.
// ============================================================================

import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

// ---------------------------------------------------------------------------
// PRNG déterministe (mulberry32)
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
const rand = mulberry32(20260926)
const rint = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1))
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
const round10 = (n: number) => Math.max(30, Math.round(n / 10) * 10)
const shuffle = <T,>(arr: T[]): T[] => {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Date machine : 26 septembre 2026
const NOW = new Date("2026-09-26T12:00:00.000Z")
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000)
const daysAfter = (d: Date, n: number) => new Date(d.getTime() + n * 86400000)
const randDate = (from: Date, to: Date) =>
  new Date(from.getTime() + rand() * (to.getTime() - from.getTime()))

// ---------------------------------------------------------------------------
// Géométrie : haversine + jitter déterministe autour d'une ancre
// ---------------------------------------------------------------------------
const EARTH_R = 6371
const rad = (d: number) => (d * Math.PI) / 180
function havKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.sqrt(a))
}

/** Décale un point de minM..maxM mètres dans un azimut aléatoire. */
function jitter(lat: number, lng: number, minM: number, maxM: number) {
  const distKm = (minM + rand() * (maxM - minM)) / 1000
  const brg = rand() * Math.PI * 2
  const dLat = (distKm * Math.cos(brg)) / 111
  const dLng = (distKm * Math.sin(brg)) / (111 * Math.cos(rad(lat)))
  return { lat: +(lat + dLat).toFixed(5), lng: +(lng + dLng).toFixed(5) }
}

// ---------------------------------------------------------------------------
// Constantes métier
// ---------------------------------------------------------------------------
const MARGIN = 0.19 // DT/L — marge détaillant (ShadowConfig.marginTndPerL)
const DAYS_MONTH = 30.4
const CANNIB_RADIUS_M = 2000
const PHOTO: Record<string, string> = {
  BIDONS: "/images/shadow/bidons-route.png",
  KIOSQUE: "/images/shadow/kiosque-essence.png",
  CAMION_CITERNE: "/images/shadow/camion-citerne.png",
  STATION_PIRATE: "/images/shadow/station-pirate.png",
  GARAGE: "/images/shadow/garage-clandestin.png",
  EPICERIE: "/images/shadow/epicerie-fuel.png",
}
const TYPO_LABEL: Record<string, string> = {
  BIDONS: "Bidons bord de route",
  KIOSQUE: "Kiosque / épicerie",
  CAMION_CITERNE: "Camion-citerne",
  STATION_PIRATE: "Station pirate",
  GARAGE: "Garage",
  EPICERIE: "Boutique / épicerie",
}
const TYPO_VOL: Record<string, number> = {
  BIDONS: 120,
  KIOSQUE: 250,
  CAMION_CITERNE: 450,
  STATION_PIRATE: 900,
  GARAGE: 300,
  EPICERIE: 180,
}

const REPORTERS = ["Walid G.", "Salma B.", "Hichem T.", "Ines M.", "Karim F.", "Nadia L."]
const CONTROLEURS = ["Nadia L.", "Karim F.", "Salma B.", "Ines M."]
const VALIDATORS = ["Ines M.", "Nadia L.", "équipe plateforme", "Karim F."]

const NOTES: Record<string, string[]> = {
  BIDONS: [
    "Bidons 20 L visibles depuis la route, activité le soir",
    "Vente de bidons à même le sol, sans affichage",
    "Stock de bidons derrière une camionnette, rotation rapide",
    "Bidons essence alignés sur le bas-côté de la RN",
    "Vendeur de bidons 10 L / 20 L, afflux en fin de journée",
    "Bidons stockés sous une bâche, ravitaillement des deux-roues",
  ],
  KIOSQUE: [
    "Kiosque vendant de l'essence en bidons de 5 L derrière le comptoir",
    "Épicerie-kiosque : jerricans en vitrine, vente discrète",
    "Essence conditionnée en bouteilles 1,5 L, prix non affiché",
    "Kiosque de quartier, vente au particulier, négociation directe",
    "Prix non affiché, négociation directe",
  ],
  CAMION_CITERNE: [
    "Camion présenté comme transport de fioul",
    "Camion-citerne stationné sur aire de repos, distribution au tube",
    "Citerne mobile : ravitaillement de cafés et de louages",
    "Camion ravitailleur actif la nuit, phares éteints",
    "Camion-citerne sur bas-côté, clientele de taxis collectifs",
  ],
  STATION_PIRATE: [
    "Station pirate dans un garage converti, 2 pistes opérationnelles",
    "Pompes improvisées alimentées par cuve enterrée",
    "Station pirate complète : distributeurs récupérés, paiement cash",
    "Fausse station-service derrière un garage, activité continue",
    "Station pirate active jour et nuit, trafic sustained",
  ],
  GARAGE: [
    "Garage vendant de l'essence en bidons, atelier en couverture",
    "Vente au détail depuis l'atelier mécanique",
    "Garage-lavage double fonction : bidons disponibles sur demande",
    "Atelier de mécanique, jerricans visibles dans la remise",
  ],
  EPICERIE: [
    "Épicerie de quartier : bidons 5 L sous le comptoir",
    "Boutique alimentaire avec rayon carburant discret",
    "Épicerie de proximité, essence en bonbonnes à l'arrière-boutique",
    "Supérette : carburant vendu en bouteilles recyclées",
  ],
}

const CITES_GRAND_TUNIS = [
  "Cité El Khadhra", "Cité Ibn Khaldoun", "Cité Essalem", "Cité Ettadhamen",
  "Cité El Ghazala", "Cité El Omrane", "Cité Er-Rouad", "Cité El Aouina",
  "Cité El Kram", "Cité Mutuelleville", "Cité El Habib", "Cité El Manar",
]
const CITES_SUD = [
  "Cité Essalem", "Cité Ennour", "Cité Erriadh", "Cité El Fath", "Cité Zohour",
  "Cité El Amal", "Zone Oued Ezzargua", "Route de Dehibat", "Route de Tripoli",
  "Zone Marchande", "Cité El Wafa", "Cité El Manar",
]
const CITES_COTE = [
  "Cité El Manar", "Cité Errahma", "Cité Ennour", "Cité El Yasmine",
  "Cité Salambo", "Zone touristique", "Cité El Masira", "Cité El Khadra",
]
const CITES_INTERIEUR = [
  "Cité El Amal", "Cité Ennour", "Cité Essalem", "Cité Erriadh", "Cité Ezzouhour",
  "Cité El Fath", "Route de Kairouan", "Zone industrielle", "Cité El Wafa",
  "Cité Ibn Khaldoun",
]
const CITES_BY_GOV: Record<string, string[]> = {}
for (const g of ["Tunis", "Ariana", "Ben Arous", "Manouba"]) CITES_BY_GOV[g] = CITES_GRAND_TUNIS
for (const g of ["Sousse", "Monastir", "Mahdia", "Nabeul", "Bizerte", "Zaghouan"]) CITES_BY_GOV[g] = CITES_COTE
for (const g of ["Médenine", "Tataouine", "Kébili", "Tozeur", "Gabès"]) CITES_BY_GOV[g] = CITES_SUD
const citesFor = (gov: string) => CITES_BY_GOV[gov] ?? CITES_INTERIEUR

const SOUTH_GOVS = new Set(["Médenine", "Tataouine"])

// ---------------------------------------------------------------------------
// Zones de recensement (gouvernorat / délégation / effectif / nids serrés)
// Total ACTIFS visé : 847 exactement.
// ---------------------------------------------------------------------------
type ZoneSpec = {
  gov: string
  del: string
  count: number // effectif TOTAL de la zone (points générés + forcés)
  clusters?: number // nombre de « nids » serrés (ancres uniques, 40–320 m)
  forced?: number // points déjà imposés par le scénario (TE Midoun, RN1…)
  border?: boolean // zone frontalière → prix bas (1 200–1 450 mill.)
}

const ZONES: ZoneSpec[] = [
  // --- Médenine : 168 ---
  { gov: "Médenine", del: "Ben Guerdane", count: 56, clusters: 7, border: true },
  { gov: "Médenine", del: "Zarzis", count: 23, clusters: 3, border: true },
  { gov: "Médenine", del: "Houmt Souk", count: 18, clusters: 2 },
  { gov: "Médenine", del: "Midoun", count: 14, forced: 3 }, // 3 points < 500 m TotalEnergies Midoun
  { gov: "Médenine", del: "Médenine", count: 24 },
  { gov: "Médenine", del: "El Hamma", count: 13 },
  // --- Tataouine : 74 ---
  { gov: "Tataouine", del: "Tataouine", count: 18 },
  { gov: "Tataouine", del: "Remada", count: 23, clusters: 3 },
  { gov: "Tataouine", del: "Ghomrassen", count: 14 },
  { gov: "Tataouine", del: "Dehibat", count: 9, border: true },
  // --- Sfax : 112 ---
  { gov: "Sfax", del: "Sfax Centre", count: 30 },
  { gov: "Sfax", del: "Sakiet Ezzit", count: 19, clusters: 2, forced: 1 }, // + point < 500 m Shell
  { gov: "Sfax", del: "Agareb", count: 14 },
  { gov: "Sfax", del: "Mahres", count: 15 },
  { gov: "Sfax", del: "Skhira", count: 10 },
  { gov: "Sfax", del: "Mahres", count: 14, clusters: 2, forced: 1 }, // corridor RN1 (+ camion pirate)
  // --- Tunis : 89 ---
  { gov: "Tunis", del: "Tunis Centre", count: 10 },
  { gov: "Tunis", del: "El Kabaria", count: 16, clusters: 2, forced: 1 }, // + point < 500 m Agil
  { gov: "Tunis", del: "El Menzah", count: 10 },
  { gov: "Tunis", del: "Le Bardo", count: 8 },
  { gov: "Tunis", del: "La Marsa", count: 5 },
  { gov: "Tunis", del: "El Ouardia", count: 6 },
  { gov: "Tunis", del: "Sidi Houssine", count: 8 },
  { gov: "Tunis", del: "La Goulette", count: 6 },
  { gov: "Tunis", del: "El Ouardia", count: 8 }, // cité Ibn Khaldoun
  // --- Sahel & Centre : 49 + 42 + 32 + 32 + 28 + 28 + 23 + 20 + 19 + 18 ---
  { gov: "Sousse", del: "Sousse", count: 10 },
  { gov: "Sousse", del: "Msaken", count: 8 },
  { gov: "Sousse", del: "Hammam Sousse", count: 7 },
  { gov: "Sousse", del: "Kalâa Kebira", count: 6 },
  { gov: "Sousse", del: "Akouda", count: 4 },
  { gov: "Gabès", del: "Gabès", count: 12, clusters: 2 },
  { gov: "Gabès", del: "Gabès", count: 8 },
  { gov: "Gabès", del: "El Hamma", count: 6 },
  { gov: "Gabès", del: "Métouia", count: 6 },
  { gov: "Gabès", del: "Mareth", count: 6 },
  { gov: "Gabès", del: "Ghannouche", count: 4 },
  { gov: "Sidi Bouzid", del: "Sidi Bouzid", count: 26 },
  { gov: "Gafsa", del: "Gafsa", count: 26 },
  { gov: "Kairouan", del: "Kairouan", count: 22 },
  { gov: "Nabeul", del: "Nabeul", count: 8 },
  { gov: "Nabeul", del: "Beni Khiar", count: 6 },
  { gov: "Nabeul", del: "Menzel Temime", count: 6 },
  { gov: "Nabeul", del: "Korba", count: 4 },
  { gov: "Nabeul", del: "Hammamet", count: 4 },
  { gov: "Bizerte", del: "Bizerte", count: 17 },
  { gov: "Monastir", del: "Monastir", count: 14 },
  { gov: "Mahdia", del: "Mahdia", count: 13 },
  { gov: "Kasserine", del: "Kasserine", count: 18 },
  // --- Ouest & Sud-Ouest : 14 + 11 + 9 + 7 + 7 + 7 + 7 ---
  { gov: "Jendouba", del: "Jendouba", count: 14 },
  { gov: "Béja", del: "Béja", count: 11 },
  { gov: "Le Kef", del: "Le Kef", count: 9 },
  { gov: "Siliana", del: "Siliana", count: 7 },
  { gov: "Zaghouan", del: "Zaghouan", count: 7 },
  { gov: "Tozeur", del: "Tozeur", count: 7 },
  { gov: "Kébili", del: "Kébili", count: 7 },
  // --- Grand Tunis périphérie : 17 + 14 + 20 ---
  { gov: "Manouba", del: "Manouba", count: 11 },
  { gov: "Ariana", del: "Ariana", count: 8 },
  { gov: "Ben Arous", del: "Ben Arous", count: 14 },
]

const ACTIVE_TOTAL = ZONES.reduce((s, z) => s + z.count, 0)

// ---------------------------------------------------------------------------
// Génération des points actifs
// ---------------------------------------------------------------------------
type GeneratedPoint = {
  code: string
  typologyCode: string
  status: string
  gouvernorat: string
  delegation: string
  cite: string | null
  lat: number
  lng: number
  volumeLJ: number
  priceMillimes: number | null
  photoUrl: string | null
  notes: string
  source: string
  reporter: string
  firstSeenAt: Date
  lastCheckAt: Date
  active: boolean
}

async function main() {
  console.log("=== Seed Shadow Market (T44) — date machine 26/09/2026 ===\n")

  // 0) Réinitialisation (ordre inverse des dépendances)
  await db.shadowPointUpdate.deleteMany()
  await db.shadowPoint.deleteMany()
  await db.shadowAlert.deleteMany()
  await db.shadowCensusEvent.deleteMany()
  await db.shadowAuditor.deleteMany()
  await db.shadowMonthlyStat.deleteMany()
  await db.shadowTypology.deleteMany()
  await db.shadowConfig.deleteMany()

  // 1) Typologies (catalogue extensible)
  await db.shadowTypology.createMany({
    data: [
      {
        code: "BIDONS", label: "Bidons bord de route", color: "#FF9800", volumeLJ: 120, sortOrder: 1,
        icon: "fuel",
        description: "Vente de bidons d'essence (10–20 L) à même le sol, le long des routes et entrées d'agglomération. Activité souvent vespérale et mobile.",
      },
      {
        code: "KIOSQUE", label: "Kiosque / épicerie", color: "#FFC107", volumeLJ: 250, sortOrder: 2,
        icon: "store",
        description: "Kiosque ou commerce de quartier vendant de l'essence conditionnée en bidons de 5 L ou bouteilles, sous comptoir ou en vitrine discrète.",
      },
      {
        code: "CAMION_CITERNE", label: "Camion-citerne", color: "#E53935", volumeLJ: 450, sortOrder: 3,
        icon: "truck",
        description: "Camion-citerne mobile écoulant du carburant au tube sur aires de repos et bas-côtés. Présente un risque incendie et environnemental élevé.",
      },
      {
        code: "STATION_PIRATE", label: "Station pirate", color: "#B71C1C", volumeLJ: 900, sortOrder: 4,
        icon: "alert-octagon",
        description: "Véritable station-service non agréée installée dans un garage ou un local industriel : pompes improvisées, cuves enterrées, paiement cash.",
      },
      {
        code: "GARAGE", label: "Garage", color: "#FF7043", volumeLJ: 300, sortOrder: 5,
        icon: "wrench",
        description: "Atelier de mécanique ou de lavage servant de couverture à la vente de carburant en jerricans, souvent sur demande.",
      },
      {
        code: "EPICERIE", label: "Boutique / épicerie", color: "#9E9E9E", volumeLJ: 180, sortOrder: 6,
        icon: "shopping-basket",
        description: "Épicerie ou supérette proposant du carburant en bonbonnes et bouteilles recyclées, à l'arrière-boutique.",
      },
    ],
  })

  // 2) Configuration (ligne unique, valeurs par défaut)
  await db.shadowConfig.create({
    data: {
      id: "shadow-config",
      radiiM: "500,1000,2000",
      cannibRadiusM: CANNIB_RADIUS_M,
      redZoneThreshold: 5,
      lossRedTnd: 20000,
      lossOrangeTnd: 5000,
      notifyRadiusM: 500,
      notifyActive: true,
      marginTndPerL: MARGIN,
    },
  })

  // 3) Stations réelles de la base → ancres de placement
  const stations = await db.station.findMany({
    select: { code: true, name: true, gouvernorat: true, delegation: true, lat: true, lng: true, brand: { select: { slug: true } } },
  })
  const stationsByZone = new Map<string, typeof stations>()
  for (const s of stations) {
    const key = `${s.gouvernorat}|${s.delegation}`
    const arr = stationsByZone.get(key) ?? []
    arr.push(s)
    stationsByZone.set(key, arr)
  }
  const stationsByGov = new Map<string, typeof stations>()
  for (const s of stations) {
    const arr = stationsByGov.get(s.gouvernorat) ?? []
    arr.push(s)
    stationsByGov.set(s.gouvernorat, arr)
  }

  // Quotas typologies par région (répartition nationale cible)
  // Sud (Médenine + Tataouine, 242 actifs) : camions-citernes et stations pirate
  // surreprésentés ; Nord (605 actifs) : bidons dominants.
  const typSouth = shuffle([
    ...Array<string>(121).fill("BIDONS"),
    ...Array<string>(30).fill("KIOSQUE"),
    ...Array<string>(7).fill("EPICERIE"),
    ...Array<string>(47).fill("CAMION_CITERNE"),
    ...Array<string>(22).fill("STATION_PIRATE"),
    ...Array<string>(12).fill("GARAGE"),
  ])
  const typNorth = shuffle([
    ...Array<string>(403).fill("BIDONS"),
    ...Array<string>(99).fill("KIOSQUE"),
    ...Array<string>(15).fill("EPICERIE"),
    ...Array<string>(53).fill("CAMION_CITERNE"),
    ...Array<string>(14).fill("STATION_PIRATE"),
    ...Array<string>(18).fill("GARAGE"),
  ])
  const nextTyp = (gov: string) =>
    SOUTH_GOVS.has(gov) ? (typSouth.pop() ?? "BIDONS") : (typNorth.pop() ?? "BIDONS")

  const sourceRoll = () => {
    const r = rand() * 100
    if (r < 60) return "AGENT"
    if (r < 85) return "CONTROLEUR"
    if (r < 95) return "AUDIT"
    return "CONTRIBUTION"
  }

  // --- Points forcés par le scénario DG (alertes réelles adossées) ---
  const teMidoun = stations.find(s => s.code === "TN-2666") // TotalEnergies Midoun
  const agilKabaria = stations.find(s => s.code === "TN-0014") // Agil El Kabaria
  const shellSakiet = stations.find(s => s.code === "TN-1149") // Shell Sakiet Ezzit 3

  type Forced = Omit<GeneratedPoint, "code" | "gouvernorat" | "delegation" | "active"> & {
    gov: string; del: string; active: boolean
  }
  const forcedPoints: Forced[] = []
  if (teMidoun) {
    for (let i = 0; i < 3; i++) {
      const c = jitter(teMidoun.lat, teMidoun.lng, 180, 450)
      forcedPoints.push({
        gov: "Médenine", del: "Midoun", typologyCode: i < 2 ? "STATION_PIRATE" : "CAMION_CITERNE",
        status: "BRUT", cite: pick(CITES_COTE), lat: c.lat, lng: c.lng,
        volumeLJ: [880, 840, 610][i], priceMillimes: 1580,
        photoUrl: i < 2 ? PHOTO.STATION_PIRATE : PHOTO.CAMION_CITERNE,
        notes: i === 0
          ? "Station pirate improvisée derrière la zone touristique, 2 pistes"
          : i === 1 ? "Distributeurs récupérés dans un garage, paiement cash"
          : "Camion-citerne ravitaillant la station pirate voisine",
        source: "AGENT", reporter: "Walid G.",
        firstSeenAt: daysAgo(4 - i), lastCheckAt: daysAgo(4 - i), active: true,
      })
    }
  }
  // Camion-citerne pirate sur la RN1 (Sfax → Gabès), actif depuis 5 jours
  forcedPoints.push({
    gov: "Sfax", del: "Mahres", typologyCode: "CAMION_CITERNE", status: "BRUT",
    cite: "RN1 — bas-côté km 22", lat: 34.564, lng: 10.616,
    volumeLJ: 490, priceMillimes: null, photoUrl: PHOTO.CAMION_CITERNE,
    notes: "Camion-citerne pirate stationné sur la RN1, distribution au tube — danger incendie",
    source: "CONTROLEUR", reporter: "Hichem T.",
    firstSeenAt: daysAgo(5), lastCheckAt: daysAgo(1), active: true,
  })
  if (agilKabaria) {
    const c = jitter(agilKabaria.lat, agilKabaria.lng, 240, 320)
    forcedPoints.push({
      gov: "Tunis", del: "El Kabaria", typologyCode: "KIOSQUE", status: "VERIFIE",
      cite: "Cité Ibn Khaldoun", lat: c.lat, lng: c.lng, volumeLJ: 380, priceMillimes: 1720,
      photoUrl: PHOTO.KIOSQUE, notes: "Kiosque vendant de l'essence en bidons de 5 L, file visible le soir",
      source: "AGENT", reporter: "Ines M.",
      firstSeenAt: daysAgo(12), lastCheckAt: daysAgo(3), active: true,
    })
  }
  if (shellSakiet) {
    const c = jitter(shellSakiet.lat, shellSakiet.lng, 380, 430)
    forcedPoints.push({
      gov: "Sfax", del: "Sakiet Ezzit", typologyCode: "BIDONS", status: "VERIFIE",
      cite: "Cité Errahma", lat: c.lat, lng: c.lng, volumeLJ: 210, priceMillimes: 1650,
      photoUrl: PHOTO.BIDONS, notes: "Bidons 20 L alignés face à la station, activité soutenue le week-end",
      source: "CONTROLEUR", reporter: "Karim F.",
      firstSeenAt: daysAgo(16), lastCheckAt: daysAgo(6), active: true,
    })
  }

  // --- Génération générique des zones ---
  const activePoints: GeneratedPoint[] = []
  const forcedPerZone = new Map<string, Forced[]>()
  for (const f of forcedPoints) {
    const key = `${f.gov}|${f.del}`
    const arr = forcedPerZone.get(key) ?? []
    arr.push(f)
    forcedPerZone.set(key, arr)
  }

  const EARLY_FROM = new Date("2025-09-28T00:00:00Z")
  const EARLY_TO = new Date("2025-10-31T23:59:59Z")
  const LATE_FROM = new Date("2025-11-01T00:00:00Z")
  const SUMMER_FROM = new Date("2026-06-01T00:00:00Z")
  const SUMMER_TO = new Date("2026-08-31T23:59:59Z")
  const LATE_TO = new Date("2026-09-10T00:00:00Z")
  const firstSeenFor = (): Date => {
    if (rand() < 0.76) return randDate(EARLY_FROM, EARLY_TO)
    // 40 % des « tardifs » pendant le pic estival (cohérent série mensuelle)
    if (rand() < 0.4) return randDate(SUMMER_FROM, SUMMER_TO)
    return randDate(LATE_FROM, LATE_TO)
  }

  for (const zone of ZONES) {
    const key = `${zone.gov}|${zone.del}`
    const zoneStations = stationsByZone.get(key) ?? stationsByGov.get(zone.gov) ?? stations
    const generated = Math.max(0, zone.count - (zone.forced ?? 0))

    // Ancres de cluster (nids serrés) : points à 40–320 m → zones rouges
    const clusterAnchors: typeof stations = []
    if (zone.clusters) {
      const pool = shuffle(zoneStations).slice(0, zone.clusters)
      clusterAnchors.push(...pool)
    }

    for (let i = 0; i < generated; i++) {
      const typ = nextTyp(zone.gov)
      const useCluster = clusterAnchors.length > 0 && zone.clusters
      const anchor = useCluster
        ? clusterAnchors[Math.floor(i / Math.ceil(generated / clusterAnchors.length)) % clusterAnchors.length]
        : pick(zoneStations)
      const pos = useCluster ? jitter(anchor.lat, anchor.lng, 40, 250) : jitter(anchor.lat, anchor.lng, 150, 2500)
      // Calibrage v2 (modèle DG) : points diffus plus modestes, nids de cluster
      // renforcés (Sud ×1,55 / Nord ×1,4) → concentration des pertes sur les
      // stations ancre plutôt qu'émiettement sur tout le réseau.
      const clusterBoost = useCluster ? (SOUTH_GOVS.has(zone.gov) || (zone.border ?? false) ? 1.55 : 1.4) : 1
      const volFactor = useCluster ? 0.7 + 0.7 * rand() : 0.38 + 0.45 * rand()
      const vol = round10(TYPO_VOL[typ] * volFactor * clusterBoost)
      const border = zone.border ?? false
      const priceNull = rand() < 0.15
      const price = priceNull ? null : border ? rint(1200, 1450) : SOUTH_GOVS.has(zone.gov) ? rint(1480, 1780) : rint(1580, 1980)
      const reporter = rand() < 0.85 ? pick(REPORTERS) : "équipe plateforme"
      activePoints.push({
        code: "",
        typologyCode: typ,
        status: "PENDING",
        gouvernorat: zone.gov,
        delegation: zone.del,
        cite: pick(citesFor(zone.gov)),
        lat: pos.lat,
        lng: pos.lng,
        volumeLJ: vol,
        priceMillimes: price,
        photoUrl: rand() < 0.7 ? PHOTO[typ] : null,
        notes: pick(NOTES[typ]),
        source: sourceRoll(),
        reporter,
        firstSeenAt: new Date(0),
        lastCheckAt: new Date(0),
        active: true,
      })
    }
  }

  // --- Méga-hotspots (modèle DG) : batteries denses adossées à des stations
  // cibles par enseigne — génèrent les « Top menaces » : 12 zones × 10 points
  // à 120–450 m, volumes lourds (camions-citernes, stations pirate). Les
  // effectifs sont compensés par la baisse des zones diffuses ci-dessus.
  const MEGAS: { gov: string; del: string; brand: string; cite: string }[] = [
    { gov: "Médenine", del: "Ben Guerdane", brand: "totalenergies", cite: "Route de Ras Jedir" },
    { gov: "Médenine", del: "Ben Guerdane", brand: "agil", cite: "Cité Zohour" },
    { gov: "Médenine", del: "Zarzis", brand: "shell", cite: "Route de Tripoli" },
    { gov: "Tataouine", del: "Tataouine", brand: "agil", cite: "Cité Ennour" },
    { gov: "Médenine", del: "Médenine", brand: "staroil", cite: "Route de Jerba" },
    { gov: "Tataouine", del: "Remada", brand: "ola", cite: "Route de Dehibat" },
    { gov: "Sfax", del: "Sakiet Ezzit", brand: "shell", cite: "Route de Gabès" },
    { gov: "Tunis", del: "El Kabaria", brand: "agil", cite: "Cité Ibn Khaldoun" },
    { gov: "Sfax", del: "Mahres", brand: "agil", cite: "RN1 — bas-côté" },
    { gov: "Sfax", del: "Sfax Centre", brand: "totalenergies", cite: "Route de Tunis" },
    { gov: "Tunis", del: "Tunis Centre", brand: "shell", cite: "Cité El Khadhra" },
    { gov: "Sousse", del: "Sousse", brand: "ola", cite: "Route de Msaken" },
  ]
  const MEGA_TYP = [
    "CAMION_CITERNE", "CAMION_CITERNE", "CAMION_CITERNE", "STATION_PIRATE", "STATION_PIRATE",
    "STATION_PIRATE", "GARAGE", "GARAGE", "BIDONS", "KIOSQUE",
  ]
  const MEGA_VOL: Record<string, number> = {
    CAMION_CITERNE: 640, STATION_PIRATE: 700, GARAGE: 400, BIDONS: 260, KIOSQUE: 320,
  }
  for (const m of MEGAS) {
    const key = `${m.gov}|${m.del}`
    const pool = stationsByZone.get(key) ?? stationsByGov.get(m.gov) ?? stations
    const anchor =
      pool.find(s => s.brand?.slug === m.brand) ??
      pool.find(s => s.brand?.slug && s.brand.slug !== "independants") ??
      pool[0]
    if (!anchor) continue
    for (let i = 0; i < 10; i++) {
      const typ = MEGA_TYP[i % MEGA_TYP.length]
      const c = jitter(anchor.lat, anchor.lng, 120, 450)
      const vol = round10(MEGA_VOL[typ] * (0.8 + 0.45 * rand()))
      const south = SOUTH_GOVS.has(m.gov)
      activePoints.push({
        code: "",
        typologyCode: typ,
        status: rand() < 0.85 ? "VALIDE" : "VERIFIE",
        gouvernorat: m.gov,
        delegation: m.del,
        cite: m.cite,
        lat: c.lat,
        lng: c.lng,
        volumeLJ: vol,
        priceMillimes: rand() < 0.1 ? null : south ? rint(1200, 1580) : rint(1580, 1880),
        photoUrl: rand() < 0.8 ? PHOTO[typ] : null,
        notes: pick(NOTES[typ]),
        source: rand() < 0.7 ? "AGENT" : "CONTROLEUR",
        reporter: pick(REPORTERS),
        firstSeenAt: new Date(0),
        lastCheckAt: new Date(0),
        active: true,
      })
    }
  }

  // Points forcés → intégrés aux zones
  for (const f of forcedPerZone.values()) {
    for (const fp of f) {
      activePoints.push({
        code: "", typologyCode: fp.typologyCode, status: fp.status,
        gouvernorat: fp.gov, delegation: fp.del, cite: fp.cite, lat: fp.lat, lng: fp.lng,
        volumeLJ: fp.volumeLJ, priceMillimes: fp.priceMillimes, photoUrl: fp.photoUrl,
        notes: fp.notes, source: fp.source, reporter: fp.reporter,
        firstSeenAt: fp.firstSeenAt, lastCheckAt: fp.lastCheckAt, active: true,
      })
    }
  }

  // Statuts : 22 BRUT (≤ 7 j), 90 VERIFIE, 735 VALIDE (847 actifs)
  const genericIdx = activePoints.map((_, i) => i).filter(i => activePoints[i].status === "PENDING")
  const shuffled = shuffle(genericIdx)
  const BRUT_N = 22 - activePoints.filter(p => p.status === "BRUT").length
  const VERIFIE_N = 90 - activePoints.filter(p => p.status === "VERIFIE").length
  let ptr = 0
  for (let k = 0; k < BRUT_N && ptr < shuffled.length; k++, ptr++) {
    const p = activePoints[shuffled[ptr]]
    p.status = "BRUT"
    p.firstSeenAt = daysAgo(rint(1, 7))
    p.lastCheckAt = p.firstSeenAt
  }
  for (let k = 0; k < VERIFIE_N && ptr < shuffled.length; k++, ptr++) {
    activePoints[shuffled[ptr]].status = "VERIFIE"
  }
  for (const p of activePoints) {
    if (p.status === "PENDING") p.status = "VALIDE"
    if (p.firstSeenAt.getTime() === 0) p.firstSeenAt = firstSeenFor()
    if (p.lastCheckAt.getTime() === 0) {
      const lc = daysAgo(rint(1, 60))
      p.lastCheckAt = lc > p.firstSeenAt ? lc : daysAfter(p.firstSeenAt, rint(1, 10))
      if (p.lastCheckAt > NOW) p.lastCheckAt = NOW
    }
  }

  // --- 60 inactifs « disparus » + 22 REJETE / DOUBLON (total 929) ---
  const inactivePoints: GeneratedPoint[] = []
  const disappearNotes = [
    "Point non observé lors du dernier passage",
    "Vendeur parti après contrôle",
    "Emplacement vide, activité cessée",
    "Point disparu après rafle",
    "Plus aucune trace d'activité sur place",
  ]
  const rejectedNotes = [
    "Signalement non confirmé — point introuvable lors du contrôle",
    "Signalement non retenu : preuve photo insuffisante",
    "Signalement clos : activité saisonnière terminée",
  ]
  const duplicateNotes = [
    "Doublon d'un point déjà recensé dans la même rue",
    "Doublon du point adjacent (même vendeur, même emplacement)",
  ]

  const makeInactive = (gov: string, del: string, status: string, note: string) => {
    const typ = SOUTH_GOVS.has(gov) ? pick(["BIDONS", "BIDONS", "KIOSQUE", "CAMION_CITERNE", "GARAGE", "STATION_PIRATE"]) : pick(["BIDONS", "BIDONS", "BIDONS", "KIOSQUE", "EPICERIE", "GARAGE", "CAMION_CITERNE"])
    const zoneStations = stationsByZone.get(`${gov}|${del}`) ?? stationsByGov.get(gov) ?? stations
    const anchor = pick(zoneStations)
    const pos = jitter(anchor.lat, anchor.lng, 150, 2200)
    const firstSeen = randDate(new Date("2025-10-01T00:00:00Z"), new Date("2026-05-20T00:00:00Z"))
    const lastCheck = daysAgo(rint(20, 170))
    inactivePoints.push({
      code: "", typologyCode: typ, status, gouvernorat: gov, delegation: del,
      cite: pick(citesFor(gov)), lat: pos.lat, lng: pos.lng,
      volumeLJ: round10(TYPO_VOL[typ] * (0.65 + 0.7 * rand())),
      priceMillimes: rand() < 0.4 ? null : rint(1450, 1950),
      photoUrl: rand() < 0.5 ? PHOTO[typ] : null,
      notes: note, source: sourceRoll(),
      reporter: pick(REPORTERS),
      firstSeenAt: firstSeen < lastCheck ? firstSeen : new Date(lastCheck.getTime() - 30 * 86400000),
      lastCheckAt: lastCheck, active: false,
    })
  }

  // Inactifs adossés aux alertes INFO (Remada, Skhira, Ben Guerdane, Kébili)
  makeInactive("Tataouine", "Remada", "VALIDE", "Point neutralisé après contrôle des douanes")
  makeInactive("Sfax", "Skhira", "VALIDE", "Disparu après opération de contrôle")
  makeInactive("Sfax", "Skhira", "VALIDE", "Disparu après opération de contrôle")
  makeInactive("Médenine", "Ben Guerdane", "VALIDE", "Vendeur de bidons interpellé — point neutralisé")
  makeInactive("Kébili", "Kébili", "VALIDE", "Point fermé après médiatisation locale")
  // 55 disparus supplémentaires répartis sur les zones actives
  const zonePool: ZoneSpec[] = []
  for (const z of ZONES) for (let i = 0; i < Math.ceil(z.count / 20); i++) zonePool.push(z)
  for (let i = 0; i < 55; i++) {
    const z = pick(zonePool)
    makeInactive(z.gov, z.del, rand() < 0.84 ? "VALIDE" : "VERIFIE", pick(disappearNotes))
  }
  // 22 REJETE / DOUBLON
  for (let i = 0; i < 12; i++) {
    const z = pick(zonePool)
    makeInactive(z.gov, z.del, "REJETE", pick(rejectedNotes))
  }
  for (let i = 0; i < 10; i++) {
    const z = pick(zonePool)
    makeInactive(z.gov, z.del, "DOUBLON", pick(duplicateNotes))
  }

  // Codes séquentiels SM-26-0001 … SM-26-0929
  const all = [...activePoints, ...inactivePoints]
  all.forEach((p, i) => (p.code = `SM-26-${String(i + 1).padStart(4, "0")}`))

  // brandThreat : enseigne de la station la plus proche
  for (const p of all) {
    let best: number | null = null
    let threat: string | null = null
    for (const s of stations) {
      const d = havKm(p.lat, p.lng, s.lat, s.lng)
      if (best === null || d < best) {
        best = d
        threat = s.brand?.slug ?? "independants"
      }
    }
    ;(p as GeneratedPoint & { brandThreat: string | null }).brandThreat = threat
  }

  // Insertion (createMany par lots)
  const toRow = (p: GeneratedPoint) => ({
    code: p.code, typologyCode: p.typologyCode, status: p.status,
    gouvernorat: p.gouvernorat, delegation: p.delegation, cite: p.cite,
    lat: p.lat, lng: p.lng, volumeLJ: p.volumeLJ, priceMillimes: p.priceMillimes,
    photoUrl: p.photoUrl, notes: p.notes, source: p.source, reporter: p.reporter,
    brandThreat: (p as GeneratedPoint & { brandThreat: string | null }).brandThreat,
    firstSeenAt: p.firstSeenAt, lastCheckAt: p.lastCheckAt, active: p.active,
  })
  for (let i = 0; i < all.length; i += 300) {
    await db.shadowPoint.createMany({ data: all.slice(i, i + 300).map(toRow) })
  }

  // ---------------------------------------------------------------------------
  // 4) ShadowPointUpdate — cycle de vie (~380)
  // ---------------------------------------------------------------------------
  const inserted = await db.shadowPoint.findMany({
    select: { id: true, code: true, typologyCode: true, status: true, gouvernorat: true, delegation: true, reporter: true, volumeLJ: true, priceMillimes: true, lat: true, lng: true, firstSeenAt: true, lastCheckAt: true, active: true },
  })
  const byCode = new Map(inserted.map(p => [p.code, p]))

  type Upd = { pointId: string; kind: string; oldValue: string | null; newValue: string | null; author: string; date: Date }
  const updates: Upd[] = []

  // APPARITION (points récents — date = firstSeenAt, author = reporter)
  const recent = inserted
    .filter(p => p.firstSeenAt >= new Date("2026-02-01T00:00:00Z"))
    .sort((a, b) => b.firstSeenAt.getTime() - a.firstSeenAt.getTime())
  for (const p of recent.slice(0, 105)) {
    updates.push({
      pointId: p.id, kind: "APPARITION", oldValue: null,
      newValue: `${TYPO_LABEL[p.typologyCode]} — ${p.gouvernorat}`,
      author: p.reporter || "équipe plateforme", date: p.firstSeenAt,
    })
  }

  // DISPARITION (inactifs) + paires DISPARITION/REAPPARITION (actifs réapparus)
  const inactive = inserted.filter(p => !p.active)
  for (const p of inactive) {
    updates.push({ pointId: p.id, kind: "DISPARITION", oldValue: "Actif", newValue: "Disparu", author: pick(CONTROLEURS), date: p.lastCheckAt })
  }
  const reappearCandidates = inserted.filter(p => p.active && p.status === "VALIDE" && p.firstSeenAt < daysAgo(150))
  for (const p of shuffle(reappearCandidates).slice(0, 15)) {
    const d1 = daysAfter(p.firstSeenAt, rint(60, 120))
    const d2 = daysAfter(d1, rint(15, 40))
    if (d2 >= NOW) continue
    updates.push({ pointId: p.id, kind: "DISPARITION", oldValue: "Actif", newValue: "Disparu", author: pick(CONTROLEURS), date: d1 })
    updates.push({ pointId: p.id, kind: "REAPPARITION", oldValue: "Disparu", newValue: "Actif", author: pick(CONTROLEURS), date: d2 })
  }

  // VOLUME / PRIX / TYPE / DEPLACEMENT
  const volumeCandidates = inserted.filter(p => p.active && p.firstSeenAt < daysAgo(90))
  for (const p of shuffle(volumeCandidates).slice(0, 45)) {
    const old = round10(p.volumeLJ * (0.6 + 0.25 * rand()))
    updates.push({
      pointId: p.id, kind: "VOLUME", oldValue: `${Math.min(old, p.volumeLJ - 20)} L/j`, newValue: `${p.volumeLJ} L/j`,
      author: p.reporter || "équipe plateforme",
      date: randDate(daysAfter(p.firstSeenAt, 30), daysAgo(7)),
    })
  }
  const priceCandidates = inserted.filter(p => p.active && p.priceMillimes)
  for (const p of shuffle(priceCandidates).slice(0, 18)) {
    const cur = p.priceMillimes as number
    const old = Math.max(1150, cur - rint(100, 250))
    updates.push({
      pointId: p.id, kind: "PRIX", oldValue: `${old} mill.`, newValue: `${cur} mill.`,
      author: pick(CONTROLEURS), date: randDate(daysAfter(p.firstSeenAt, 30), daysAgo(7)),
    })
  }
  for (const p of shuffle(volumeCandidates).slice(0, 8)) {
    const others = Object.keys(TYPO_LABEL).filter(t => t !== p.typologyCode)
    updates.push({
      pointId: p.id, kind: "TYPE", oldValue: TYPO_LABEL[pick(others)], newValue: TYPO_LABEL[p.typologyCode],
      author: pick(CONTROLEURS), date: randDate(daysAfter(p.firstSeenAt, 45), daysAgo(10)),
    })
  }
  for (const p of shuffle(volumeCandidates).slice(8, 14)) {
    const back = jitter(p.lat, p.lng, 200, 800)
    updates.push({
      pointId: p.id, kind: "DEPLACEMENT",
      oldValue: `${back.lat.toFixed(5)}, ${back.lng.toFixed(5)}`,
      newValue: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
      author: p.reporter || "équipe plateforme",
      date: randDate(daysAfter(p.firstSeenAt, 45), daysAgo(10)),
    })
  }

  // STATUT — transitions de validation
  const verifie = inserted.filter(p => p.active && p.status === "VERIFIE")
  for (const p of shuffle(verifie).slice(0, 40)) {
    updates.push({
      pointId: p.id, kind: "STATUT", oldValue: "BRUT", newValue: "VERIFIE",
      author: pick(VALIDATORS), date: daysAfter(p.firstSeenAt, rint(5, 25)),
    })
  }
  const valide = inserted.filter(p => p.active && p.status === "VALIDE" && p.firstSeenAt < daysAgo(120))
  for (const p of shuffle(valide).slice(0, 25)) {
    const d1 = daysAfter(p.firstSeenAt, rint(5, 20))
    updates.push({ pointId: p.id, kind: "STATUT", oldValue: "BRUT", newValue: "VERIFIE", author: pick(VALIDATORS), date: d1 })
    updates.push({ pointId: p.id, kind: "STATUT", oldValue: "VERIFIE", newValue: "VALIDE", author: pick(VALIDATORS), date: daysAfter(d1, rint(10, 30)) })
  }
  for (const p of inserted.filter(x => x.status === "REJETE" || x.status === "DOUBLON")) {
    updates.push({
      pointId: p.id, kind: "STATUT", oldValue: "BRUT", newValue: p.status,
      author: pick(VALIDATORS), date: p.lastCheckAt,
    })
  }

  updates.sort((a, b) => a.date.getTime() - b.date.getTime())
  for (let i = 0; i < updates.length; i += 300) {
    await db.shadowPointUpdate.createMany({ data: updates.slice(i, i + 300) })
  }

  // ---------------------------------------------------------------------------
  // 5) ShadowAuditor (14)
  // ---------------------------------------------------------------------------
  await db.shadowAuditor.createMany({
    data: [
      { name: "Équipe plateforme — recensement national", zone: "National", brandSlug: "", phone: "+216 71 000 100", pointsDone: 260, rechecks: 118 },
      { name: "Équipe plateforme — contrôle qualité", zone: "National", brandSlug: "", phone: "+216 71 000 101", pointsDone: 142, rechecks: 96 },
      { name: "Walid Gharbi", zone: "Médenine", brandSlug: "", phone: "+216 98 412 556", pointsDone: 158, rechecks: 74 },
      { name: "Salma Ben Salah", zone: "Tataouine", brandSlug: "", phone: "+216 97 220 841", pointsDone: 92, rechecks: 41 },
      { name: "Hichem Trabelsi", zone: "Sfax", brandSlug: "agil", phone: "+216 96 318 904", pointsDone: 134, rechecks: 58 },
      { name: "Ines Mansouri", zone: "Tunis", brandSlug: "shell", phone: "+216 98 504 127", pointsDone: 121, rechecks: 63 },
      { name: "Karim Feki", zone: "Sousse", brandSlug: "", phone: "+216 95 771 320", pointsDone: 87, rechecks: 39 },
      { name: "Nadia Lanouar", zone: "Gabès", brandSlug: "totalenergies", phone: "+216 92 633 145", pointsDone: 76, rechecks: 33 },
      { name: "Mohamed Ali Chaabane", zone: "Sidi Bouzid", brandSlug: "", phone: "+216 94 210 678", pointsDone: 64, rechecks: 28 },
      { name: "Rania Jlassi", zone: "Gafsa", brandSlug: "ola", phone: "+216 98 145 093", pointsDone: 58, rechecks: 24 },
      { name: "Sofiane Ben Amor", zone: "Kairouan", brandSlug: "", phone: "+216 97 886 512", pointsDone: 52, rechecks: 21 },
      { name: "Leila Gabsi", zone: "Nabeul", brandSlug: "agil", phone: "+216 96 470 238", pointsDone: 49, rechecks: 19 },
      { name: "Anis Meddeb", zone: "Bizerte", brandSlug: "", phone: "+216 95 102 764", pointsDone: 38, rechecks: 16, active: false },
      { name: "Fatma Zarrouk", zone: "Tozeur", brandSlug: "staroil", phone: "+216 92 340 519", pointsDone: 31, rechecks: 12, active: false },
    ],
  })

  // ---------------------------------------------------------------------------
  // 6) ShadowCensusEvent (26 : 12 TERMINE + 2 EN_COURS + 12 PLANIFIE)
  // ---------------------------------------------------------------------------
  await db.shadowCensusEvent.createMany({
    data: [
      // Passés (terminés)
      { teamLabel: "Équipe plateforme — recensement", zone: "Tunis", kind: "RECENSEMENT", date: new Date("2025-10-14T08:00:00Z"), pointsTargeted: 120, pointsFound: 96, status: "TERMINE" },
      { teamLabel: "Équipe Sud-Est", zone: "Médenine", kind: "RECENSEMENT", date: new Date("2025-11-18T08:00:00Z"), pointsTargeted: 90, pointsFound: 112, status: "TERMINE" },
      { teamLabel: "Équipe plateforme — recensement", zone: "Sfax", kind: "RECENSEMENT", date: new Date("2025-12-09T08:00:00Z"), pointsTargeted: 100, pointsFound: 97, status: "TERMINE" },
      { teamLabel: "Équipe Sud-Est", zone: "Tataouine", kind: "RECENSEMENT", date: new Date("2026-01-20T08:00:00Z"), pointsTargeted: 60, pointsFound: 54, status: "TERMINE" },
      { teamLabel: "Équipe Centre", zone: "Tunis — El Kabaria", kind: "RECHECK", date: new Date("2026-02-10T08:00:00Z"), pointsTargeted: 45, pointsFound: 38, status: "TERMINE" },
      { teamLabel: "Équipe Sud-Est", zone: "Médenine — Ben Guerdane", kind: "RECENSEMENT", date: new Date("2026-03-05T08:00:00Z"), pointsTargeted: 55, pointsFound: 68, status: "TERMINE" },
      { teamLabel: "Audit Agil", zone: "Sfax — Sakiet Ezzit", kind: "VALIDATION", date: new Date("2026-04-14T08:00:00Z"), pointsTargeted: 40, pointsFound: 36, status: "TERMINE" },
      { teamLabel: "Équipe Sahel", zone: "Sousse", kind: "RECENSEMENT", date: new Date("2026-05-11T08:00:00Z"), pointsTargeted: 70, pointsFound: 62, status: "TERMINE" },
      { teamLabel: "Équipe Sud-Est", zone: "Médenine — Zarzis", kind: "RECHECK", date: new Date("2026-06-16T08:00:00Z"), pointsTargeted: 48, pointsFound: 41, status: "TERMINE" },
      { teamLabel: "Équipe plateforme — recensement", zone: "Médenine — Djerba Midoun", kind: "RECENSEMENT", date: new Date("2026-07-07T08:00:00Z"), pointsTargeted: 65, pointsFound: 71, status: "TERMINE" },
      { teamLabel: "Audit Shell", zone: "Tunis Centre", kind: "VALIDATION", date: new Date("2026-08-18T08:00:00Z"), pointsTargeted: 52, pointsFound: 47, status: "TERMINE" },
      { teamLabel: "Équipe Sud-Est", zone: "Tataouine — Remada", kind: "RECHECK", date: new Date("2026-09-08T08:00:00Z"), pointsTargeted: 38, pointsFound: 33, status: "TERMINE" },
      // En cours (cette semaine)
      { teamLabel: "Équipe Sud-Est", zone: "Médenine — Ben Guerdane", kind: "RECHECK", date: new Date("2026-09-22T08:00:00Z"), pointsTargeted: 60, pointsFound: 31, status: "EN_COURS" },
      { teamLabel: "Équipe Centre", zone: "Tunis — El Kabaria", kind: "RECENSEMENT", date: new Date("2026-09-24T08:00:00Z"), pointsTargeted: 45, pointsFound: 12, status: "EN_COURS" },
      // Planifiés (8 prochaines semaines — zones prioritaires / rouges)
      { teamLabel: "Équipe Sud-Est", zone: "Tataouine", kind: "RECENSEMENT", date: new Date("2026-09-30T08:00:00Z"), pointsTargeted: 60, pointsFound: 0, status: "PLANIFIE" },
      { teamLabel: "Équipe Sud-Est", zone: "Tataouine — Dehibat", kind: "RECENSEMENT", date: new Date("2026-10-05T08:00:00Z"), pointsTargeted: 35, pointsFound: 0, status: "PLANIFIE" },
      { teamLabel: "Audit Agil", zone: "Sfax — Sakiet Ezzit", kind: "RECHECK", date: new Date("2026-10-08T08:00:00Z"), pointsTargeted: 40, pointsFound: 0, status: "PLANIFIE" },
      { teamLabel: "Équipe plateforme — recensement", zone: "Sfax — corridor RN1 (Mahres–Skhira)", kind: "RECENSEMENT", date: new Date("2026-10-12T08:00:00Z"), pointsTargeted: 50, pointsFound: 0, status: "PLANIFIE" },
      { teamLabel: "Équipe Sud", zone: "Gabès", kind: "RECENSEMENT", date: new Date("2026-10-16T08:00:00Z"), pointsTargeted: 45, pointsFound: 0, status: "PLANIFIE" },
      { teamLabel: "Équipe Sud-Est", zone: "Médenine — Djerba Midoun", kind: "RECHECK", date: new Date("2026-10-20T08:00:00Z"), pointsTargeted: 55, pointsFound: 0, status: "PLANIFIE" },
      { teamLabel: "Équipe Centre", zone: "Tunis — El Kabaria", kind: "VALIDATION", date: new Date("2026-10-27T08:00:00Z"), pointsTargeted: 30, pointsFound: 0, status: "PLANIFIE" },
      { teamLabel: "Équipe Cap Bon", zone: "Nabeul — Beni Khiar / Menzel Temime", kind: "RECENSEMENT", date: new Date("2026-11-03T08:00:00Z"), pointsTargeted: 40, pointsFound: 0, status: "PLANIFIE" },
      { teamLabel: "Équipe Centre", zone: "Kairouan", kind: "RECENSEMENT", date: new Date("2026-11-06T08:00:00Z"), pointsTargeted: 35, pointsFound: 0, status: "PLANIFIE" },
      { teamLabel: "Équipe Sahel", zone: "Sousse", kind: "RECHECK", date: new Date("2026-11-10T08:00:00Z"), pointsTargeted: 40, pointsFound: 0, status: "PLANIFIE" },
      { teamLabel: "Équipe Sud-Est", zone: "Médenine — Zarzis", kind: "RECENSEMENT", date: new Date("2026-11-13T08:00:00Z"), pointsTargeted: 45, pointsFound: 0, status: "PLANIFIE" },
      { teamLabel: "Équipe Sud-Est", zone: "Médenine — Médenine centre", kind: "RECHECK", date: new Date("2026-11-17T08:00:00Z"), pointsTargeted: 38, pointsFound: 0, status: "PLANIFIE" },
    ],
  })

  // ---------------------------------------------------------------------------
  // 7) ShadowMonthlyStat — 12 mois (2025-10 → 2026-09)
  // ---------------------------------------------------------------------------
  const activeVol = activePoints.reduce((s, p) => s + p.volumeLJ, 0)
  const estLossLast = Math.round(activeVol * MARGIN * DAYS_MONTH)
  const months: { month: string; ap: number; np: number; cp: number; note: string; season: number }[] = [
    { month: "2025-10", ap: 612, np: 612, cp: 0, note: "Lancement du recensement national — 612 points recensés", season: 1 },
    { month: "2025-11", ap: 648, np: 66, cp: 30, note: "Extension du recensement au Grand Tunis", season: 1 },
    { month: "2025-12", ap: 668, np: 54, cp: 34, note: "Contrebande frontalière — afflux hivernal", season: 1 },
    { month: "2026-01", ap: 684, np: 58, cp: 42, note: "Stabilité hivernale — activité soutenue dans le Sud", season: 1 },
    { month: "2026-02", ap: 733, np: 92, cp: 43, note: "Ramadan — trafic nocturne en hausse", season: 1.02 },
    { month: "2026-03", ap: 745, np: 64, cp: 52, note: "Ramadan (fin) — points éphémères post-iftar", season: 1.02 },
    { month: "2026-04", ap: 716, np: 32, cp: 61, note: "Contrôles douanes renforcés — neutralisations", season: 1 },
    { month: "2026-05", ap: 738, np: 55, cp: 33, note: "Reprise progressive — extension du recensement au Sahel", season: 1 },
    { month: "2026-06", ap: 786, np: 84, cp: 36, note: "Pic estival — afflux touristique", season: 1.04 },
    { month: "2026-07", ap: 815, np: 62, cp: 33, note: "Pic estival — saison touristique Djerba / Zarzis", season: 1.04 },
    { month: "2026-08", ap: 838, np: 51, cp: 28, note: "Pic estival — fin de saison", season: 1.04 },
    { month: "2026-09", ap: 847, np: 39, cp: 30, note: "Rentrée scolaire — légère baisse post-estivale", season: 1 },
  ]
  await db.shadowMonthlyStat.createMany({
    data: months.map(m => ({
      month: m.month,
      activePoints: m.ap,
      newPoints: m.np,
      closedPoints: m.cp,
      estLossTnd: Math.round((estLossLast * m.ap) / months[months.length - 1].ap * m.season),
      note: m.note,
    })),
  })

  // ---------------------------------------------------------------------------
  // 8) ShadowAlert (12) — les 3 alertes « DG » en tête (cette semaine)
  // ---------------------------------------------------------------------------
  const remadaNeutralized = inactive.find(p => p.gouvernorat === "Tataouine" && p.delegation === "Remada")
  await db.shadowAlert.createMany({
    data: [
      {
        severity: "CRITICAL", kind: "NEW_POINTS",
        title: "Djerba Midoun : 3 nouveaux points à moins de 500 m de la station TotalEnergies Midoun → perte estimée +15 000 DT/mois",
        detail: "Trois points informels (2 stations pirate et un camion-citerne) signalés cette semaine à moins de 500 m de la station TotalEnergies Midoun (RN1 Djerba). Perte de marge estimée : +15 000 DT/mois. Contrôle recommandé sous 48 h.",
        zone: "Médenine", stationCode: "TN-2666", stationName: "TotalEnergies Midoun",
        lossTnd: 15000, date: daysAgo(2), read: false,
      },
      {
        severity: "CRITICAL", kind: "FIRE_RISK",
        title: "RN1 (Sfax–Gabès) : camion-citerne pirate actif depuis 5 jours → danger incendie élevé",
        detail: "Un camion-citerne non agréé écoulé du carburant au tube sur le bas-côté de la RN1 entre Sfax et Gabès (km 22, delegation Mahres). Risque incendie et environnemental élevé — transmission douanes / protection civile.",
        zone: "Sfax", stationCode: null, stationName: null,
        lossTnd: 8200, date: daysAgo(5), read: false,
      },
      {
        severity: "CRITICAL", kind: "SURGE",
        title: "Tataouine : recrudescence +40 % vs semaine dernière",
        detail: "Le recensement continu de Tataouine (Tataouine centre, Remada, Ghomrassen) constate une hausse de 40 % des points actifs par rapport à la semaine dernière — afflux lié au renchérissement du circuit formel.",
        zone: "Tataouine", stationCode: null, stationName: null,
        lossTnd: 98000, date: daysAgo(1), read: false,
      },
      {
        severity: "MEDIUM", kind: "DENSITE",
        title: "Sfax : zone dense détectée à Sakiet Ezzit — 9 points actifs dans un rayon de 2 km",
        detail: "Le cluster de Sakiet Ezzit concentre 9 points actifs (bidons, kiosques, bidons face aux stations). Perte cumulée sur les stations du secteur : ~28 000 DT/mois.",
        zone: "Sfax", stationCode: null, stationName: null,
        lossTnd: 28000, date: daysAgo(9), read: false,
      },
      {
        severity: "MEDIUM", kind: "NEW_POINTS",
        title: "Tunis : point à moins de 500 m de la station Agil El Kabaria",
        detail: "Un kiosque de vente d'essence conditionnée opère à moins de 500 m de la station Agil El Kabaria (Cité Ibn Khaldoun). Perte estimée : ~9 800 DT/mois sur la station.",
        zone: "Tunis", stationCode: "TN-0014", stationName: "Agil El Kabaria",
        lossTnd: 9800, date: daysAgo(12), read: false,
      },
      {
        severity: "MEDIUM", kind: "DENSITE",
        title: "Médenine : densification autour de Houmt Souk (Djerba) — 7 points recensés",
        detail: "La zone de Houmt Souk passe en alerte densité : 7 points supplémentaires recensés ce mois, alimentés par le trafic touristique de fin de saison.",
        zone: "Médenine", stationCode: null, stationName: null,
        lossTnd: 21000, date: daysAgo(3), read: false,
      },
      {
        severity: "MEDIUM", kind: "NEW_POINTS",
        title: "Sfax : point à moins de 500 m de la station Shell Sakiet Ezzit 3",
        detail: "Des bidons d'essence sont vendus face à la station Shell Sakiet Ezzit 3, à environ 420 m. Perte estimée : ~7 400 DT/mois.",
        zone: "Sfax", stationCode: "TN-1149", stationName: "Shell Sakiet Ezzit 3",
        lossTnd: 7400, date: daysAgo(16), read: false,
      },
      {
        severity: "MEDIUM", kind: "DENSITE",
        title: "Gabès : zone rouge détectée sur l'axe RN1",
        detail: "Le clustering automatique identifie une zone rouge à Gabès (axe RN1 / Ghannouche) : densité de points informels en hausse, perte locale ~19 000 DT/mois.",
        zone: "Gabès", stationCode: null, stationName: null,
        lossTnd: 19000, date: daysAgo(19), read: true,
      },
      {
        severity: "INFO", kind: "NEUTRALISE",
        title: `Remada : point ${remadaNeutralized?.code ?? "SM-26-0000"} neutralisé après contrôle des douanes`,
        detail: "Le point informel de Remada a disparu après l'opération conjointe douanes / brigade de Tataouine. Recheck programmé dans 4 semaines.",
        zone: "Tataouine", stationCode: null, stationName: null,
        lossTnd: 0, date: daysAgo(21), read: true,
      },
      {
        severity: "INFO", kind: "NEUTRALISE",
        title: "Skhira : 2 points disparus après opération de contrôle",
        detail: "Deux points de vente informels (bidons) ont cessé leur activité après le contrôle de la brigade régionale de Skhira.",
        zone: "Sfax", stationCode: null, stationName: null,
        lossTnd: 0, date: daysAgo(25), read: true,
      },
      {
        severity: "INFO", kind: "NEUTRALISE",
        title: "Ben Guerdane : vendeur de bidons interpellé — point neutralisé",
        detail: "Le vendeur de bidons signalé sur la route de Dehibat a été interpellé ; le point est marqué neutralisé dans le recensement.",
        zone: "Médenine", stationCode: null, stationName: null,
        lossTnd: 0, date: daysAgo(28), read: true,
      },
      {
        severity: "INFO", kind: "NEUTRALISE",
        title: "Kébili : point informel fermé après médiatisation locale",
        detail: "La médiatisation d'un point de vente clandestin à Kébili a entraîné sa fermeture spontanée. Surveillance maintenue.",
        zone: "Kébili", stationCode: null, stationName: null,
        lossTnd: 0, date: daysAgo(31), read: true,
      },
    ],
  })

  // ---------------------------------------------------------------------------
  // 9) Récapitulatif de contrôle
  // ---------------------------------------------------------------------------
  const activeRows = activePoints
  const activeCount = activeRows.length
  const totalVol = activeVol
  const nationalLoss = Math.round(totalVol * MARGIN * DAYS_MONTH)

  // Distances aux stations (points actifs)
  let lt500 = 0
  let lt2000 = 0
  for (const p of activeRows) {
    let best = Infinity
    for (const s of stations) {
      const d = havKm(p.lat, p.lng, s.lat, s.lng) * 1000
      if (d < best) best = d
    }
    if (best < 500) lt500++
    if (best < 2000) lt2000++
  }

  // Zones rouges : grille 1,5 km, cellules ≥ 5 points actifs
  const CELL = 1.5 / 111
  const cells = new Map<string, { lat: number; lng: number; count: number; loss: number; cites: string[]; govs: string[] }>()
  for (const p of activeRows) {
    const key = `${Math.floor(p.lat / CELL)}:${Math.floor(p.lng / (CELL / Math.cos(rad(34))))}`
    const c = cells.get(key) ?? { lat: 0, lng: 0, count: 0, loss: 0, cites: [], govs: [] }
    c.lat += p.lat; c.lng += p.lng; c.count++
    c.loss += p.volumeLJ * MARGIN * DAYS_MONTH
    c.cites.push(p.cite ?? p.delegation)
    c.govs.push(p.gouvernorat)
    cells.set(key, c)
  }
  const redZones = [...cells.entries()]
    .filter(([, c]) => c.count >= 5)
    .map(([key, c]) => ({
      key,
      count: c.count,
      loss: Math.round(c.loss),
      lat: c.lat / c.count,
      lng: c.lng / c.count,
      cite: mode(c.cites),
      gov: mode(c.govs),
    }))
    .sort((a, b) => b.count - a.count)

  const statusCounts: Record<string, number> = {}
  for (const p of all) statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1

  console.log("──────────────────────────────────────────────────────")
  console.log("RÉCAPITULATIF SEED SHADOW MARKET")
  console.log("──────────────────────────────────────────────────────")
  console.log(`Points totaux insérés      : ${all.length} (codes SM-26-0001 … SM-26-${String(all.length).padStart(4, "0")})`)
  console.log(`Points ACTIFS (visé 847)   : ${activeCount} ${activeCount === 847 ? "✓" : "✗ ÉCART"}`)
  console.log(`  • VALIDE / VERIFIE / BRUT: ${statusCounts.VALIDE ?? 0} / ${statusCounts.VERIFIE ?? 0} / ${statusCounts.BRUT ?? 0}`)
  console.log(`  • inactifs (REJETE/DOUBLON/disparus) : ${statusCounts.REJETE ?? 0} / ${statusCounts.DOUBLON ?? 0} / ${all.filter(p => !p.active).length}`)
  console.log(`Volume informel total      : ${totalVol.toLocaleString("fr-FR")} L/j`)
  console.log(`Perte mensuelle nationale  : ${nationalLoss.toLocaleString("fr-FR")} DT/mois (visé ≈ 1,2 M ± 15 %)`)
  console.log(`Points < 500 m d'une station : ${lt500} (${((lt500 / activeCount) * 100).toFixed(1)} %)`)
  console.log(`Points < 2 km d'une station  : ${lt2000} (${((lt2000 / activeCount) * 100).toFixed(1)} % — visé ≥ 55 %)`)
  console.log(`Zones rouges (≥ 5 pts / 1,5 km) : ${redZones.length}`)
  for (const z of redZones.slice(0, 12)) {
    console.log(`  • ${z.cite} (${z.gov}) — ${z.count} points, ${z.loss.toLocaleString("fr-FR")} DT/mois [cellule ${z.key}]`)
  }
  console.log(`Updates de cycle de vie    : ${updates.length}`)
  console.log(`Série mensuelle            : 12 mois, dernier mois estLoss ${Math.round((estLossLast * 847) / 847).toLocaleString("fr-FR")} DT, activePoints 612 → 847`)
  console.log("──────────────────────────────────────────────────────\n")
}

function mode(arr: string[]): string {
  const counts = new Map<string, number>()
  for (const a of arr) counts.set(a, (counts.get(a) ?? 0) + 1)
  let best = ""
  let n = -1
  for (const [k, v] of counts) if (v > n) { n = v; best = k }
  return best
}

main()
  .catch(e => {
    console.error("Seed échoué :", e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
