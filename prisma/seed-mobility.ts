// CarbuScope — Module « Mobility Hub Operations » (T54-A1) : seed du socle de
// données du Module 2 (Terminaux Multi-Services — TMP). 9 hubs répartis sur les
// 9 codes du contrat (6 ACTIVE · 1 CONSTRUCTION · 2 PLANNED — trafic et CA à 0
// tant que le hub n'est pas ouvert), 45 services sur les hubs actifs (lavage,
// vidange, pneus, recharge, boutique, café, laverie, relais colis — tarifs DT),
// 350 véhicules clients (plaques tunisiennes « 123 TU 4567 » avec code du
// gouvernorat d'immatriculation, mix BERLINE/UTILITAIRE/SUV/POIDS_LOURD +
// quelques ÉLECTRIQUE à Tunis/Ariana, segments 30/45/25 FIDÈLE/RÉGULIER/
// NOUVEAU), 500 interventions sur les 90 derniers jours (80 % DONE + planifiés
// futurs, en cours et annulés) et 900 événements du tunnel de conversion
// (décroissance ~45 % par étape : PASSAGE > VISITE > SERVICE > FIDELISE).
// Génération déterministe (PRNG mulberry32 à graine fixe) : reproductible.
// Idempotent : deleteMany puis recréation complète.
// Exécution : bunx tsx prisma/seed-mobility.ts

import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

const DAY = 86_400_000
const HOUR = 3_600_000
const NOW = Date.now()

/** PRNG mulberry32 à graine fixe — génération déterministe et reproductible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20251104)
const rint = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1))
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]

// ---- Hubs (9 codes du contrat — coordonnées réelles des villes) ----

type HubSeed = {
  code: string
  name: string
  gouvernorat: string
  address: string
  lat: number
  lng: number
  status: string
  type: string
  openedAt: string | null
  surfaceM2: number
  dailyVehicles: number
  monthlyRevenue: number
  manager: string | null
  phone: string | null
}

const HUBS: HubSeed[] = [
  { code: "TMP-TUN-01", name: "Hub Multiservice Tunis Nord", gouvernorat: "Tunis", address: "RN9 — zone industrielle La Charguia, Tunis", lat: 36.8, lng: 10.18, status: "ACTIVE", type: "MULTISERVICE", openedAt: "2023-04-15", surfaceM2: 5400, dailyVehicles: 2350, monthlyRevenue: 184500, manager: "Sami Toumi", phone: "+216 71 234 567" },
  { code: "TMP-TUN-02", name: "Hub Routier Tunis Sud", gouvernorat: "Tunis", address: "RN1 — Djebel Jelloud, Tunis", lat: 36.74, lng: 10.29, status: "ACTIVE", type: "ROUTIER", openedAt: "2023-09-02", surfaceM2: 3200, dailyVehicles: 1980, monthlyRevenue: 151200, manager: "Habib Mliki", phone: "+216 71 555 210" },
  { code: "TMP-ARI-01", name: "Hub Résidentiel Ariana Ennasr", gouvernorat: "Ariana", address: "Avenue Hédi Nouira — Ennasr, Ariana", lat: 36.86, lng: 10.19, status: "ACTIVE", type: "RÉSIDENTIEL", openedAt: "2024-01-20", surfaceM2: 2800, dailyVehicles: 1240, monthlyRevenue: 96800, manager: "Ines Ben Salah", phone: "+216 70 891 002" },
  { code: "TMP-SFX-01", name: "Hub Multiservice Sfax Thyna", gouvernorat: "Sfax", address: "RN1 sud — zone industrielle Thyna, Sfax", lat: 34.74, lng: 10.76, status: "ACTIVE", type: "MULTISERVICE", openedAt: "2023-11-08", surfaceM2: 4900, dailyVehicles: 1820, monthlyRevenue: 138900, manager: "Mahdi Charfi", phone: "+216 74 220 118" },
  { code: "TMP-SSE-01", name: "Hub Multiservice Sousse Kantaoui", gouvernorat: "Sousse", address: "RN1 — Port El Kantaoui, Sousse", lat: 35.83, lng: 10.64, status: "ACTIVE", type: "MULTISERVICE", openedAt: "2022-07-01", surfaceM2: 6100, dailyVehicles: 2560, monthlyRevenue: 201400, manager: "Rim Trabelsi", phone: "+216 73 370 225" },
  { code: "TMP-NAB-01", name: "Hub Routier Nabeul Korba", gouvernorat: "Nabeul", address: "RR79 — entrée de Korba, Nabeul", lat: 36.45, lng: 10.74, status: "ACTIVE", type: "ROUTIER", openedAt: "2024-05-15", surfaceM2: 3600, dailyVehicles: 1430, monthlyRevenue: 109700, manager: "Walid Ayeb", phone: "+216 72 620 057" },
  { code: "TMP-BIZ-01", name: "Hub Multiservice Bizerte Jarzouna", gouvernorat: "Bizerte", address: "RN7 — Jarzouna, Bizerte", lat: 37.27, lng: 9.87, status: "CONSTRUCTION", type: "MULTISERVICE", openedAt: null, surfaceM2: 4200, dailyVehicles: 0, monthlyRevenue: 0, manager: null, phone: "+216 72 400 110" },
  { code: "TMP-MNS-01", name: "Hub Balnéaire Monastir Skanes", gouvernorat: "Monastir", address: "Route touristique Skanes — Monastir", lat: 35.78, lng: 10.83, status: "PLANNED", type: "AUTO", openedAt: null, surfaceM2: 2400, dailyVehicles: 0, monthlyRevenue: 0, manager: null, phone: null },
  { code: "TMP-GAB-01", name: "Hub Logistique Gabès Sud", gouvernorat: "Gabès", address: "RN1 — zone industrielle Gabès Sud", lat: 33.88, lng: 10.1, status: "PLANNED", type: "ROUTIER", openedAt: null, surfaceM2: 3800, dailyVehicles: 0, monthlyRevenue: 0, manager: null, phone: null },
]

// ---- Services par hub actif (45 au total) ----

type ServiceSeed = {
  category: string
  name: string
  price: number | null
  status: string
  capacityPerDay: number | null
  bookingsThisMonth: number
}

const SERVICES: Record<string, ServiceSeed[]> = {
  "TMP-TUN-01": [
    { category: "LAVAGE", name: "Lavage extérieur express", price: 25, status: "ACTIVE", capacityPerDay: 45, bookingsThisMonth: 238 },
    { category: "LAVAGE", name: "Lavage complet + aspiration", price: 40, status: "ACTIVE", capacityPerDay: 32, bookingsThisMonth: 164 },
    { category: "VIDANGE", name: "Vidange synthèse 5W-40 (4 L + filtre)", price: 120, status: "ACTIVE", capacityPerDay: 18, bookingsThisMonth: 96 },
    { category: "VIDANGE", name: "Vidange gazole + filtre gasoil", price: 95, status: "ACTIVE", capacityPerDay: 20, bookingsThisMonth: 118 },
    { category: "PNEUS", name: "Équilibrage + permutation", price: 60, status: "ACTIVE", capacityPerDay: 24, bookingsThisMonth: 87 },
    { category: "RECHARGE", name: "Recharge rapide 60 kW (30 min)", price: 8, status: "ACTIVE", capacityPerDay: 28, bookingsThisMonth: 74 },
    { category: "BOUTIQUE", name: "Épicerie & presse", price: null, status: "ACTIVE", capacityPerDay: null, bookingsThisMonth: 2145 },
    { category: "CAFÉ", name: "Point café & snacking", price: null, status: "ACTIVE", capacityPerDay: null, bookingsThisMonth: 1690 },
  ],
  "TMP-TUN-02": [
    { category: "LAVAGE", name: "Lavage poids lourds & utilitaires", price: 40, status: "ACTIVE", capacityPerDay: 22, bookingsThisMonth: 121 },
    { category: "VIDANGE", name: "Vidange gazole poids lourds", price: 140, status: "ACTIVE", capacityPerDay: 12, bookingsThisMonth: 64 },
    { category: "PNEUS", name: "Pneus utilitaires (pose incluse)", price: 180, status: "ACTIVE", capacityPerDay: 14, bookingsThisMonth: 58 },
    { category: "BOUTIQUE", name: "Boutique routière 24/7", price: null, status: "ACTIVE", capacityPerDay: null, bookingsThisMonth: 1870 },
    { category: "CAFÉ", name: "Café routier", price: null, status: "ACTIVE", capacityPerDay: null, bookingsThisMonth: 1430 },
    { category: "RELAIS", name: "Relais colis 24/7", price: 5, status: "ACTIVE", capacityPerDay: 90, bookingsThisMonth: 412 },
    { category: "LAVERIE", name: "Laverie libre-service", price: 12, status: "ACTIVE", capacityPerDay: 25, bookingsThisMonth: 148 },
  ],
  "TMP-ARI-01": [
    { category: "LAVAGE", name: "Lavage extérieur", price: 25, status: "ACTIVE", capacityPerDay: 40, bookingsThisMonth: 156 },
    { category: "LAVAGE", name: "Lavage complet + aspiration", price: 40, status: "ACTIVE", capacityPerDay: 30, bookingsThisMonth: 108 },
    { category: "VIDANGE", name: "Vidange synthèse 5W-40", price: 120, status: "ACTIVE", capacityPerDay: 15, bookingsThisMonth: 61 },
    { category: "PNEUS", name: "Équilibrage + permutation", price: 60, status: "ACTIVE", capacityPerDay: 20, bookingsThisMonth: 54 },
    { category: "RECHARGE", name: "Recharge 50 kW (45 min)", price: 8, status: "ACTIVE", capacityPerDay: 22, bookingsThisMonth: 38 },
    { category: "BOUTIQUE", name: "Épicerie de proximité", price: null, status: "ACTIVE", capacityPerDay: null, bookingsThisMonth: 1120 },
    { category: "CAFÉ", name: "Coffee shop", price: null, status: "ACTIVE", capacityPerDay: null, bookingsThisMonth: 940 },
  ],
  "TMP-SFX-01": [
    { category: "LAVAGE", name: "Lavage extérieur", price: 25, status: "ACTIVE", capacityPerDay: 42, bookingsThisMonth: 178 },
    { category: "LAVAGE", name: "Lavage complet + aspiration", price: 40, status: "ACTIVE", capacityPerDay: 30, bookingsThisMonth: 121 },
    { category: "VIDANGE", name: "Vidange synthèse 5W-40", price: 120, status: "ACTIVE", capacityPerDay: 16, bookingsThisMonth: 82 },
    { category: "VIDANGE", name: "Vidange gazole + filtre", price: 95, status: "ACTIVE", capacityPerDay: 18, bookingsThisMonth: 96 },
    { category: "PNEUS", name: "Pneus tourisme (pose incluse)", price: 320, status: "ACTIVE", capacityPerDay: 12, bookingsThisMonth: 44 },
    { category: "BOUTIQUE", name: "Épicerie & presse", price: null, status: "ACTIVE", capacityPerDay: null, bookingsThisMonth: 1585 },
    { category: "CAFÉ", name: "Point café", price: null, status: "ACTIVE", capacityPerDay: null, bookingsThisMonth: 1210 },
    { category: "RELAIS", name: "Relais colis", price: 5, status: "ACTIVE", capacityPerDay: 70, bookingsThisMonth: 296 },
  ],
  "TMP-SSE-01": [
    { category: "LAVAGE", name: "Lavage extérieur", price: 25, status: "ACTIVE", capacityPerDay: 45, bookingsThisMonth: 204 },
    { category: "LAVAGE", name: "Lavage complet + aspiration", price: 40, status: "ACTIVE", capacityPerDay: 32, bookingsThisMonth: 148 },
    { category: "VIDANGE", name: "Vidange synthèse 5W-40", price: 120, status: "ACTIVE", capacityPerDay: 18, bookingsThisMonth: 104 },
    { category: "VIDANGE", name: "Vidange gazole + filtre", price: 95, status: "ACTIVE", capacityPerDay: 20, bookingsThisMonth: 126 },
    { category: "PNEUS", name: "Pneus tourisme (pose incluse)", price: 320, status: "ACTIVE", capacityPerDay: 14, bookingsThisMonth: 51 },
    { category: "RECHARGE", name: "Recharge rapide 60 kW", price: 8, status: "PAUSED", capacityPerDay: 24, bookingsThisMonth: 18 },
    { category: "CAFÉ", name: "Coffee shop Kantaoui", price: null, status: "ACTIVE", capacityPerDay: null, bookingsThisMonth: 1540 },
    { category: "BOUTIQUE", name: "Boutique autoroutière", price: null, status: "ACTIVE", capacityPerDay: null, bookingsThisMonth: 1875 },
  ],
  "TMP-NAB-01": [
    { category: "LAVAGE", name: "Lavage complet", price: 40, status: "ACTIVE", capacityPerDay: 28, bookingsThisMonth: 132 },
    { category: "VIDANGE", name: "Vidange gazole + filtre", price: 95, status: "ACTIVE", capacityPerDay: 16, bookingsThisMonth: 74 },
    { category: "PNEUS", name: "Équilibrage + permutation", price: 60, status: "ACTIVE", capacityPerDay: 18, bookingsThisMonth: 62 },
    { category: "BOUTIQUE", name: "Boutique routière", price: null, status: "ACTIVE", capacityPerDay: null, bookingsThisMonth: 1340 },
    { category: "CAFÉ", name: "Point café", price: null, status: "ACTIVE", capacityPerDay: null, bookingsThisMonth: 980 },
    { category: "RELAIS", name: "Relais colis", price: 5, status: "ACTIVE", capacityPerDay: 60, bookingsThisMonth: 224 },
    { category: "LAVERIE", name: "Laverie libre-service", price: 12, status: "ACTIVE", capacityPerDay: 22, bookingsThisMonth: 96 },
  ],
}

// ---- Véhicules : immatriculations (code du gouvernorat) & parc courant ----

/** Code plaque par gouvernorat (TU = Tunis, AR = Ariana, SF = Sfax, SO = Sousse…). */
const PLATE_CODE: Record<string, string> = {
  "Tunis": "TU", "Ariana": "AR", "Ben Arous": "BA", "Manouba": "MB", "Nabeul": "NA",
  "Zaghouan": "ZA", "Bizerte": "BZ", "Béja": "BJ", "Jendouba": "JB", "Le Kef": "KF",
  "Siliana": "SL", "Sousse": "SO", "Monastir": "MS", "Mahdia": "MH", "Kairouan": "KR",
  "Kasserine": "KS", "Sidi Bouzid": "SB", "Sfax": "SF", "Gafsa": "GF", "Tozeur": "TZ",
  "Kébili": "KB", "Gabès": "GB", "Médenine": "MD", "Tataouine": "TA",
}
const ALL_CODES = Object.values(PLATE_CODE)

/** Parc automobile courant en Tunisie (berlines/utilitaires dominants). */
const FLEET: { brand: string; model: string; type: string }[] = [
  { brand: "Peugeot", model: "208", type: "BERLINE" },
  { brand: "Peugeot", model: "301", type: "BERLINE" },
  { brand: "Peugeot", model: "Partner", type: "UTILITAIRE" },
  { brand: "Renault", model: "Clio", type: "BERLINE" },
  { brand: "Renault", model: "Symbol", type: "BERLINE" },
  { brand: "Renault", model: "Kangoo", type: "UTILITAIRE" },
  { brand: "Fiat", model: "Fiorino", type: "UTILITAIRE" },
  { brand: "Fiat", model: "Doblo", type: "UTILITAIRE" },
  { brand: "Volkswagen", model: "Golf", type: "BERLINE" },
  { brand: "Hyundai", model: "i10", type: "BERLINE" },
  { brand: "Hyundai", model: "Tucson", type: "SUV" },
  { brand: "Kia", model: "Picanto", type: "BERLINE" },
  { brand: "Citroën", model: "C3", type: "BERLINE" },
  { brand: "Dacia", model: "Sandero", type: "BERLINE" },
  { brand: "Dacia", model: "Stepway", type: "SUV" },
  { brand: "Dacia", model: "Logan", type: "BERLINE" },
  { brand: "Isuzu", model: "D-Max", type: "UTILITAIRE" },
]
const TRUCKS: { brand: string; model: string; type: string }[] = [
  { brand: "Renault Trucks", model: "Premium 380", type: "POIDS_LOURD" },
  { brand: "Renault Trucks", model: "Kérax 340", type: "POIDS_LOURD" },
  { brand: "Iveco", model: "Eurocargo 120", type: "POIDS_LOURD" },
  { brand: "Iveco", model: "Stralis 460", type: "POIDS_LOURD" },
]
const EVS: { brand: string; model: string; type: string }[] = [
  { brand: "Renault", model: "Zoe", type: "ÉLECTRIQUE" },
  { brand: "Nissan", model: "Leaf", type: "ÉLECTRIQUE" },
  { brand: "Hyundai", model: "Kona Electric", type: "ÉLECTRIQUE" },
  { brand: "Volkswagen", model: "ID.3", type: "ÉLECTRIQUE" },
]

/** Mix de types selon la vocation du hub. */
const HUB_MIX: Record<string, Record<string, number>> = {
  MULTISERVICE: { BERLINE: 0.4, UTILITAIRE: 0.26, SUV: 0.22, POIDS_LOURD: 0.12 },
  ROUTIER: { UTILITAIRE: 0.4, BERLINE: 0.27, POIDS_LOURD: 0.18, SUV: 0.15 },
  RÉSIDENTIEL: { BERLINE: 0.52, SUV: 0.26, UTILITAIRE: 0.22 },
  AUTO: { BERLINE: 0.6, SUV: 0.25, UTILITAIRE: 0.15 },
}

/** Véhicules par hub actif (total 350) + électriques (Tunis/Ariana/Sousse). */
const VEHICLE_COUNTS: { code: string; count: number; evs: number }[] = [
  { code: "TMP-SSE-01", count: 80, evs: 2 },
  { code: "TMP-TUN-01", count: 75, evs: 6 },
  { code: "TMP-TUN-02", count: 65, evs: 0 },
  { code: "TMP-SFX-01", count: 55, evs: 0 },
  { code: "TMP-NAB-01", count: 45, evs: 0 },
  { code: "TMP-ARI-01", count: 30, evs: 4 },
]

const FIRST_NAMES = [
  "Mohamed", "Ali", "Samir", "Karim", "Hichem", "Youssef", "Mounir", "Walid",
  "Fethi", "Slim", "Nabil", "Amine", "Hatem", "Chokri", "Moez", "Leïla",
  "Rania", "Sonia", "Amel", "Nadia", "Ines", "Salma", "Mouna", "Hela",
  "Dorra", "Fatma", "Sana", "Imen",
]
const LAST_NAMES = [
  "Trabelsi", "Ben Amor", "Chaabane", "Maalej", "Bouazizi", "Mansouri", "Hamdi",
  "Ayari", "Belhaj", "Zorgati", "Gharbi", "Jaziri", "Kefi", "Dridi", "Baccouche",
  "Chebbi", "Sfar", "Mathlouthi", "Kooli", "Hmamdi", "Zouari", "Charfi", "Toumi",
  "Mliki", "Ben Salah", "Jelassi", "Haddad", "Mabrouk",
]
const PHONE_PREFIXES = ["98", "96", "95", "97", "22", "26", "25", "29", "20", "93", "92", "52", "53", "24"]

// ---- Interventions : types, prix (DT) et durées (min) plausibles ----

const PRICE_RANGE: Record<string, [number, number]> = {
  LAVAGE: [20, 35], VIDANGE: [80, 160], PNEUS: [60, 320],
  RÉPARATION: [50, 400], CONTRÔLE: [30, 60], RECHARGE: [5, 15],
}
const DURATION_RANGE: Record<string, [number, number]> = {
  LAVAGE: [20, 40], VIDANGE: [40, 90], PNEUS: [30, 120],
  RÉPARATION: [60, 180], CONTRÔLE: [20, 30], RECHARGE: [20, 45],
}
const INTERVENTION_NOTES = [
  "Filtre à huile remplacé", "Liquide de refroidissement complété",
  "Pneus avant usés — permutation conseillée", "Client fidèle : remise de 10 % appliquée",
  "Paiement espèces", "Véhicule de société — facture entreprise",
  "Recharge express pendant la pause café", "Lavage intérieur offert (opération fidélité)",
  "Réception sous garantie enseigne", "Attente pièce importée — report planifié",
  "Contrôle technique à renouveler sous 3 mois", "Vitre avant ébréchée — signalée au client",
]

/** Interventions par hub actif (total 500). */
const INTERVENTION_COUNTS: { code: string; count: number }[] = [
  { code: "TMP-SSE-01", count: 140 },
  { code: "TMP-TUN-01", count: 130 },
  { code: "TMP-TUN-02", count: 90 },
  { code: "TMP-SFX-01", count: 70 },
  { code: "TMP-NAB-01", count: 45 },
  { code: "TMP-ARI-01", count: 25 },
]

/** Conversions par hub actif (total 900) — funnel ~55 % de rétention/étape. */
const CONVERSION_COUNTS: { code: string; count: number }[] = [
  { code: "TMP-TUN-01", count: 220 },
  { code: "TMP-TUN-02", count: 190 },
  { code: "TMP-SSE-01", count: 180 },
  { code: "TMP-SFX-01", count: 120 },
  { code: "TMP-NAB-01", count: 110 },
  { code: "TMP-ARI-01", count: 80 },
]
const FUNNEL = { passage: 0.4955, visite: 0.2722, service: 0.15 } // fidelise = reste (~7,7 %)

async function main() {
  console.log("🛣️  Seed « Mobility Hub Operations » (T54-A1) — démarrage…")

  // Purge idempotente : enfants d'abord (conversions → interventions →
  // véhicules → services → hubs).
  await db.hubConversion.deleteMany()
  await db.hubIntervention.deleteMany()
  await db.hubVehicle.deleteMany()
  await db.hubService.deleteMany()
  await db.mobilityHub.deleteMany()
  console.log("   Tables TMP purgées (hubs, services, véhicules, interventions, conversions)")

  // 1) Hubs — 9 codes du contrat, upsert par code (idempotent).
  const hubId = new Map<string, string>()
  for (const h of HUBS) {
    const created = await db.mobilityHub.upsert({
      where: { code: h.code },
      create: {
        code: h.code,
        name: h.name,
        gouvernorat: h.gouvernorat,
        address: h.address,
        lat: h.lat,
        lng: h.lng,
        status: h.status,
        type: h.type,
        openedAt: h.openedAt ? new Date(h.openedAt) : null,
        surfaceM2: h.surfaceM2,
        dailyVehicles: h.dailyVehicles,
        monthlyRevenue: h.monthlyRevenue,
        manager: h.manager,
        phone: h.phone,
      },
      update: {
        name: h.name,
        gouvernorat: h.gouvernorat,
        address: h.address,
        lat: h.lat,
        lng: h.lng,
        status: h.status,
        type: h.type,
        openedAt: h.openedAt ? new Date(h.openedAt) : null,
        surfaceM2: h.surfaceM2,
        dailyVehicles: h.dailyVehicles,
        monthlyRevenue: h.monthlyRevenue,
        manager: h.manager,
        phone: h.phone,
      },
    })
    hubId.set(h.code, created.id)
  }
  const active = HUBS.filter(h => h.status === "ACTIVE").length
  console.log(`   MobilityHub : ${HUBS.length} hubs — ${active} ACTIVE · ${HUBS.filter(h => h.status === "CONSTRUCTION").length} CONSTRUCTION · ${HUBS.filter(h => h.status === "PLANNED").length} PLANNED (trafic/CA à 0)`)

  // 2) Services — uniquement sur les hubs actifs (45 au total).
  const hubServices = new Map<string, { id: string; category: string }[]>()
  let servicesCreated = 0
  for (const [code, list] of Object.entries(SERVICES)) {
    const id = hubId.get(code)
    if (!id) continue
    const created: { id: string; category: string }[] = []
    for (const s of list) {
      const row = await db.hubService.create({
        data: {
          hubId: id,
          category: s.category,
          name: s.name,
          price: s.price,
          status: s.status,
          capacityPerDay: s.capacityPerDay,
          bookingsThisMonth: s.bookingsThisMonth,
        },
      })
      created.push({ id: row.id, category: row.category })
      servicesCreated++
    }
    hubServices.set(code, created)
  }
  console.log(`   HubService : ${servicesCreated} services sur ${Object.keys(SERVICES).length} hubs actifs (lavage 25 DT · vidange 90-140 DT · pneus 60-320 DT · recharge 8 DT…)`)

  // 3) Véhicules clients — 350, plaques uniques au code du gouvernorat,
  // segments exacts 30 % FIDÈLE / 45 % RÉGULIER / 25 % NOUVEAU (cycle /20).
  const plates = new Set<string>()
  const hubVehicles = new Map<string, { id: string; type: string }[]>()
  let seqVehicle = 0
  for (const { code, count, evs } of VEHICLE_COUNTS) {
    const hub = HUBS.find(h => h.code === code)!
    const hubIdValue = hubId.get(code)!
    const mix = HUB_MIX[hub.type] ?? HUB_MIX.MULTISERVICE
    const created: { id: string; type: string }[] = []
    const hubCode = PLATE_CODE[hub.gouvernorat] ?? "TU"
    for (let i = 0; i < count; i++) {
      // Type de véhicule : électriques en tête (Tunis/Ariana/Sousse), puis mix.
      const veh = i < evs
        ? pick(EVS)
        : (() => {
            const r = rnd()
            let acc = 0
            for (const [type, w] of Object.entries(mix)) {
              acc += w
              if (r < acc) {
                const pool = type === "POIDS_LOURD" ? TRUCKS : FLEET
                const byType = pool.filter(v => v.type === type)
                return byType.length ? pick(byType) : pick(FLEET)
              }
            }
            return pick(FLEET)
          })()
      // Plaque « 123 TU 4567 » — 10 % de visiteurs d'un autre gouvernorat.
      const plateCode = rnd() < 0.1 ? pick(ALL_CODES) : hubCode
      let plate = `${rint(101, 899)} ${plateCode} ${rint(1000, 8999)}`
      while (plates.has(plate)) plate = `${rint(101, 899)} ${plateCode} ${rint(1000, 8999)}`
      plates.add(plate)
      // Segment : cycle déterministe 6/9/5 sur 20 → 30/45/25 %.
      const m = seqVehicle % 20
      const segment = m < 6 ? "FIDÈLE" : m < 15 ? "RÉGULIER" : "NOUVEAU"
      const visitsCount = segment === "FIDÈLE" ? rint(12, 38) : segment === "RÉGULIER" ? rint(4, 11) : rint(1, 3)
      const lastVisit = segment === "FIDÈLE"
        ? new Date(NOW - rint(1, 13) * DAY - rint(0, 12) * HOUR)
        : segment === "RÉGULIER"
          ? new Date(NOW - rint(1, 44) * DAY - rint(0, 12) * HOUR)
          : rnd() < 0.15
            ? null
            : new Date(NOW - rint(1, 79) * DAY - rint(0, 12) * HOUR)
      const row = await db.hubVehicle.create({
        data: {
          hubId: hubIdValue,
          plate,
          brand: veh.brand,
          model: veh.model,
          type: veh.type,
          clientName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
          clientPhone: `+216 ${pick(PHONE_PREFIXES)} ${rint(100, 999)} ${rint(100, 999)}`,
          segment,
          lastVisit,
          visitsCount,
          createdAt: new Date(NOW - rint(60, 400) * DAY),
        },
      })
      created.push({ id: row.id, type: row.type })
      seqVehicle++
    }
    hubVehicles.set(code, created)
  }
  const electric = [...hubVehicles.values()].flat().filter(v => v.type === "ÉLECTRIQUE").length
  console.log(`   HubVehicle : ${seqVehicle} véhicules — ${electric} ÉLECTRIQUE (Tunis/Ariana/Sousse), segments ~30/45/25 % FIDÈLE/RÉGULIER/NOUVEAU`)

  // 4) Interventions — 500 sur les 90 derniers jours (80 % DONE, quelques
  // SCHEDULED futurs / IN_PROGRESS / CANCELLED — cycle déterministe /100).
  type InterventionRow = {
    hubId: string
    vehicleId: string | null
    serviceId: string | null
    type: string
    status: string
    price: number
    durationMin: number
    scheduledAt: Date
    completedAt: Date | null
    notes: string | null
  }
  const interventions: InterventionRow[] = []
  let seqInt = 0
  for (const { code, count } of INTERVENTION_COUNTS) {
    const hubIdValue = hubId.get(code)!
    const vehicles = hubVehicles.get(code) ?? []
    const services = hubServices.get(code) ?? []
    const electricVehicles = vehicles.filter(v => v.type === "ÉLECTRIQUE")
    const hasRecharge = services.some(s => s.category === "RECHARGE" && s.status === "ACTIVE")
    for (let i = 0; i < count; i++) {
      // Type pondéré — RECHARGE réservée aux hubs avec borne active + VE.
      let type: string
      const r = rnd()
      if (hasRecharge && electricVehicles.length > 0) {
        type = r < 0.34 ? "LAVAGE" : r < 0.58 ? "VIDANGE" : r < 0.7 ? "PNEUS"
          : r < 0.82 ? "CONTRÔLE" : r < 0.94 ? "RÉPARATION" : "RECHARGE"
      } else {
        type = r < 0.4 ? "LAVAGE" : r < 0.64 ? "VIDANGE" : r < 0.76 ? "PNEUS"
          : r < 0.88 ? "CONTRÔLE" : "RÉPARATION"
      }
      // Statut : cycle déterministe → exactement 80 % DONE, 7 % SCHEDULED,
      // 6 % IN_PROGRESS, 7 % CANCELLED.
      const m = seqInt % 100
      const status = m < 80 ? "DONE" : m < 87 ? "SCHEDULED" : m < 93 ? "IN_PROGRESS" : "CANCELLED"
      const [pMin, pMax] = PRICE_RANGE[type]
      const [dMin, dMax] = DURATION_RANGE[type]
      const price = rint(pMin, pMax)
      const durationMin = rint(dMin, dMax)
      let scheduledAt: Date
      if (status === "SCHEDULED") scheduledAt = new Date(NOW + rint(1, 14) * DAY + rint(0, 12) * HOUR)
      else if (status === "IN_PROGRESS") scheduledAt = new Date(NOW - Math.floor(rnd() * 3 * HOUR))
      else scheduledAt = new Date(NOW - rint(2, 89) * DAY - rint(0, 20) * HOUR)
      const completedAt = status === "DONE"
        ? new Date(scheduledAt.getTime() + durationMin * 60_000)
        : null
      // Véhicule lié (82 %) — recharge strictement sur les électriques.
      let vehicleId: string | null = null
      if (type === "RECHARGE") vehicleId = pick(electricVehicles).id
      else if (rnd() < 0.82 && vehicles.length) vehicleId = pick(vehicles).id
      // Service lié quand la catégorie existe dans le hub.
      const matching = services.filter(s => s.category === type)
      const serviceId = matching.length ? pick(matching).id : null
      interventions.push({
        hubId: hubIdValue,
        vehicleId,
        serviceId,
        type,
        status,
        price,
        durationMin,
        scheduledAt,
        completedAt,
        notes: rnd() < 0.55 ? pick(INTERVENTION_NOTES) : null,
      })
      seqInt++
    }
  }
  await db.hubIntervention.createMany({ data: interventions })
  const intByStatus = interventions.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1
    return acc
  }, {})
  console.log(`   HubIntervention : ${interventions.length} interventions sur 90 jours + planifiées — ${Object.entries(intByStatus).map(([s, n]) => `${s} ${n}`).join(" · ")}`)

  // 5) Conversions — 900 événements du funnel (décroissance ~45 %/étape,
  // sources capteurs majoritaires — cycle déterministe /100).
  type ConversionRow = {
    hubId: string
    source: string
    vehicleId: string | null
    stage: string
    value: number
    occurredAt: Date
  }
  const conversions: ConversionRow[] = []
  for (const { code, count } of CONVERSION_COUNTS) {
    const hubIdValue = hubId.get(code)!
    const vehicles = hubVehicles.get(code) ?? []
    const passage = Math.round(count * FUNNEL.passage)
    const visite = Math.round(count * FUNNEL.visite)
    const service = Math.round(count * FUNNEL.service)
    const fidelise = count - passage - visite - service
    const stages: string[] = [
      ...Array<string>(passage).fill("PASSAGE"),
      ...Array<string>(visite).fill("VISITE"),
      ...Array<string>(service).fill("SERVICE"),
      ...Array<string>(fidelise).fill("FIDELISE"),
    ]
    for (const stage of stages) {
      // Source : 40 % CAPTEUR_RADAR · 35 % CAPTEUR_PASSAGE · 15 % CAMPAGNE ·
      // 10 % BORNE_DIGITALE (cycle déterministe /100).
      const m = conversions.length % 100
      const source = m < 40 ? "CAPTEUR_RADAR" : m < 75 ? "CAPTEUR_PASSAGE" : m < 90 ? "CAMPAGNE" : "BORNE_DIGITALE"
      // Valeur : panier moyen aux stades SERVICE / FIDELISE, sinon 0.
      const value = stage === "SERVICE" ? rint(25, 160) : stage === "FIDELISE" ? rint(45, 200) : 0
      // Véhicule identifié surtout aux stades avancés du tunnel.
      const linkP = stage === "PASSAGE" ? 0 : stage === "VISITE" ? 0.15 : stage === "SERVICE" ? 0.75 : 0.85
      const vehicleId = rnd() < linkP && vehicles.length ? pick(vehicles).id : null
      conversions.push({
        hubId: hubIdValue,
        source,
        vehicleId,
        stage,
        value,
        occurredAt: new Date(NOW - Math.floor(rnd() * 90 * DAY) - Math.floor(rnd() * 24 * HOUR)),
      })
    }
  }
  await db.hubConversion.createMany({ data: conversions })
  const convByStage = conversions.reduce<Record<string, number>>((acc, c) => {
    acc[c.stage] = (acc[c.stage] ?? 0) + 1
    return acc
  }, {})
  const srcByStage = convByStage
  console.log(`   HubConversion : ${conversions.length} événements du funnel — ${Object.entries(srcByStage).map(([s, n]) => `${s} ${n}`).join(" · ")} (rétention ~55 % par étape)`)

  // Synthèse finale + exemples.
  const counts = {
    hubs: await db.mobilityHub.count(),
    services: await db.hubService.count(),
    vehicles: await db.hubVehicle.count(),
    interventions: await db.hubIntervention.count(),
    conversions: await db.hubConversion.count(),
  }
  const sampleVehicle = await db.hubVehicle.findFirst({ where: { plate: { contains: " TU " } }, orderBy: { plate: "asc" } })
  const sampleDone = await db.hubIntervention.findFirst({ where: { status: "DONE" }, orderBy: { scheduledAt: "desc" } })
  console.log("✅ Seed « Mobility Hub Operations » terminé —")
  console.log(`   MobilityHub ${counts.hubs} · HubService ${counts.services} · HubVehicle ${counts.vehicles} · HubIntervention ${counts.interventions} · HubConversion ${counts.conversions}`)
  if (sampleVehicle) {
    console.log(`   Ex. véhicule : ${sampleVehicle.plate} — ${sampleVehicle.brand} ${sampleVehicle.model} (${sampleVehicle.type}, ${sampleVehicle.segment}, ${sampleVehicle.visitsCount} visites)`)
  }
  if (sampleDone) {
    console.log(`   Ex. intervention : ${sampleDone.type} ${sampleDone.status} — ${sampleDone.price} DT · ${sampleDone.durationMin} min · prévue le ${sampleDone.scheduledAt.toLocaleDateString("fr-FR")}`)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
