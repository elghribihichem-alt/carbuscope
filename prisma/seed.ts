/**
 * CarbuScope — Seed de la base « Waze du Carburant »
 * Données réalistes Tunisie : 1 814 stations, 24 gouvernorats, 6 enseignes.
 * Exécution : bun prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// ---------- RNG déterministe (reproductibilité) ----------
let seed = 20250419
function rnd(): number {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]
const range = (min: number, max: number) => min + rnd() * (max - min)
const iRange = (min: number, max: number) => Math.floor(range(min, max + 1))
const r1 = (v: number) => Math.round(v * 10) / 10

// ---------- Gouvernorats : [nom, nbStations, population, tauxMotorisation, âgeParc, délégations, [ancres: nom, lng, lat, poids]] ----------
type Anchor = [string, number, number, number]
type Gov = { name: string; count: number; pop: number; motor: number; age: number; deleg: number; anchors: Anchor[] }

const GOVS: Gov[] = [
  { name: "Tunis", count: 283, pop: 1119000, motor: 0.52, age: 9.1, deleg: 21, anchors: [["Tunis Centre", 10.178, 36.798, 4], ["La Marsa", 10.323, 36.878, 2], ["Le Bardo", 10.137, 36.743, 2], ["El Menzah", 10.17, 36.83, 2], ["La Goulette", 10.30, 36.75, 1.5], ["El Kabaria", 10.16, 36.72, 2], ["El Ouardia", 10.14, 36.77, 1], ["Sidi Houssine", 10.12, 36.80, 1]] },
  { name: "Ariana", count: 127, pop: 576000, motor: 0.48, age: 9.3, deleg: 7, anchors: [["Ariana", 10.19, 36.86, 3], ["Soukra", 10.28, 36.84, 2], ["Raoued", 10.31, 36.91, 1.5], ["Ettadhamen", 10.13, 36.83, 2], ["Kalaat el-Andalous", 10.14, 36.93, 1]] },
  { name: "Ben Arous", count: 120, pop: 640000, motor: 0.47, age: 9.4, deleg: 12, anchors: [["Ben Arous", 10.23, 36.75, 3], ["Mégrine", 10.24, 36.73, 1.5], ["El Mourouj", 10.22, 36.71, 2], ["Hammam Lif", 10.32, 36.72, 1.5], ["Radès", 10.29, 36.77, 1.5], ["Mornag", 10.30, 36.64, 1.5]] },
  { name: "Nabeul", count: 155, pop: 826000, motor: 0.42, age: 10.1, deleg: 16, anchors: [["Nabeul", 10.74, 36.45, 3], ["Hammamet", 10.61, 36.40, 2.5], ["Korba", 10.86, 36.57, 2], ["Menzel Temime", 10.97, 36.62, 2], ["Soliman", 10.48, 36.68, 1.5], ["Beni Khiar", 10.79, 36.51, 1], ["El Haouaria", 11.05, 37.03, 0.8], ["Takelsa", 10.79, 36.61, 1]] },
  { name: "Sfax", count: 197, pop: 955000, motor: 0.41, age: 10.4, deleg: 16, anchors: [["Sfax Centre", 10.76, 34.74, 4], ["Sakiet Ezzit", 10.90, 34.82, 2], ["Sidi Mansour", 10.70, 34.80, 1.5], ["Mahres", 10.53, 34.52, 1.5], ["Skhira", 10.38, 34.35, 1], ["Agareb", 10.72, 34.65, 1.5], ["Kerkennah", 11.07, 34.74, 0.4]] },
  { name: "Sousse", count: 134, pop: 700000, motor: 0.43, age: 9.8, deleg: 16, anchors: [["Sousse", 10.63, 35.83, 4], ["Akouda", 10.63, 35.90, 1.5], ["Msaken", 10.59, 35.73, 2], ["Hammam Sousse", 10.62, 35.88, 2], ["Kalâa Kebira", 10.68, 35.87, 1.5], ["Enfidha", 10.80, 36.13, 1.2], ["Bouficha", 10.73, 36.06, 1]] },
  { name: "Monastir", count: 77, pop: 425000, motor: 0.44, age: 9.6, deleg: 31, anchors: [["Monastir", 10.83, 35.78, 3], ["Sahline", 10.73, 35.77, 1.5], ["Moknine", 10.82, 35.63, 2], ["Jemmal", 10.75, 35.62, 1.5], ["Ksar Hellal", 10.77, 35.64, 1.5], ["Lamta", 10.88, 35.67, 1], ["Bembla", 10.81, 35.70, 1]] },
  { name: "Mahdia", count: 56, pop: 412000, motor: 0.36, age: 10.6, deleg: 11, anchors: [["Mahdia", 11.06, 35.50, 3], ["Ksour Essef", 10.97, 35.42, 1.5], ["El Jem", 10.55, 35.30, 2], ["Chebba", 11.08, 35.24, 1], ["Sidi Alouane", 10.89, 35.37, 1], ["Ouled Chamekh", 10.72, 35.30, 1]] },
  { name: "Bizerte", count: 91, pop: 385000, motor: 0.37, age: 10.8, deleg: 14, anchors: [["Bizerte", 9.87, 37.27, 3], ["Menzel Bourguiba", 9.78, 37.16, 2], ["Mateur", 9.64, 37.07, 2], ["Ras Jbel", 10.02, 37.13, 1.5], ["Ghar El Melh", 10.19, 37.16, 0.8], ["Sejnane", 9.48, 37.20, 1], ["Tinja", 9.87, 37.12, 1]] },
  { name: "Kairouan", count: 70, pop: 400000, motor: 0.29, age: 11.2, deleg: 11, anchors: [["Kairouan", 10.09, 35.68, 4], ["Sbikha", 10.06, 35.90, 1.5], ["Bouhajla", 10.46, 35.61, 1.5], ["Haffouz", 9.90, 35.60, 1], ["Nasrallah", 10.07, 35.51, 1], ["Hajeb Layoun", 10.07, 35.81, 1]] },
  { name: "Zaghouan", count: 21, pop: 193000, motor: 0.26, age: 11.4, deleg: 6, anchors: [["Zaghouan", 10.14, 36.40, 3], ["El Fahs", 9.91, 36.38, 2], ["Bir Mcherga", 10.13, 36.45, 1], ["Zriba", 10.24, 36.43, 1]] },
  { name: "Béja", count: 42, pop: 285000, motor: 0.27, age: 11.3, deleg: 9, anchors: [["Béja", 9.18, 36.72, 3], ["Medjez El Bab", 9.61, 36.55, 2], ["Nefza", 9.04, 36.83, 1], ["Amdoun", 9.15, 36.79, 1], ["Téboursouk", 9.24, 36.55, 1.5], ["Zahret Medien", 9.30, 36.63, 1]] },
  { name: "Jendouba", count: 42, pop: 265000, motor: 0.25, age: 11.6, deleg: 14, anchors: [["Jendouba", 8.78, 36.50, 3], ["Ghardimaou", 8.68, 36.46, 1], ["Tabarka", 8.75, 36.95, 1.5], ["Aïn Draham", 8.68, 36.78, 1], ["Bou Salem", 8.99, 36.62, 1.5], ["Fernana", 8.78, 36.65, 1]] },
  { name: "Le Kef", count: 28, pop: 262000, motor: 0.23, age: 11.8, deleg: 11, anchors: [["Le Kef", 8.70, 36.17, 3], ["Tajerouine", 8.57, 36.10, 1.5], ["Kalâat Senan", 8.71, 35.88, 1], ["Dahmani", 8.92, 36.15, 1.5], ["Nebeur", 8.83, 36.34, 1]] },
  { name: "Siliana", count: 21, pop: 234000, motor: 0.22, age: 11.9, deleg: 11, anchors: [["Siliana", 9.37, 36.08, 3], ["Bargou", 9.53, 36.10, 1], ["El Krib", 9.39, 35.95, 1], ["Makthar", 9.20, 35.86, 1], ["Gaâfour", 9.53, 36.20, 1], ["Bou Arada", 9.68, 36.33, 1.5]] },
  { name: "Sidi Bouzid", count: 49, pop: 470000, motor: 0.24, age: 11.5, deleg: 12, anchors: [["Sidi Bouzid", 9.48, 35.38, 4], ["Meknassy", 9.55, 34.95, 1.5], ["Jelma", 9.45, 35.19, 1.5], ["Regueb", 9.36, 35.23, 1.5], ["Menzel Bouzaiene", 9.61, 34.99, 1], ["Sidi Ali Ben Aoun", 9.22, 35.27, 1]] },
  { name: "Kasserine", count: 42, pop: 480000, motor: 0.23, age: 11.7, deleg: 13, anchors: [["Kasserine", 8.83, 35.17, 3], ["Sbeitla", 9.37, 35.24, 2], ["Feriana", 8.61, 34.98, 1.5], ["Thala", 8.68, 35.58, 1.5], ["Haidra", 8.89, 35.57, 0.8], ["Sbiba", 9.05, 35.27, 1]] },
  { name: "Gabès", count: 63, pop: 375000, motor: 0.30, age: 10.9, deleg: 10, anchors: [["Gabès", 10.11, 33.89, 4], ["Métouia", 10.02, 33.95, 1.5], ["El Hamma", 9.94, 33.80, 1.5], ["Matmata", 10.04, 33.54, 1], ["Mareth", 10.25, 33.60, 1.5], ["Ghannouche", 10.09, 33.93, 1]] },
  { name: "Médenine", count: 56, pop: 415000, motor: 0.31, age: 10.7, deleg: 9, anchors: [["Médenine", 10.50, 33.35, 2.5], ["Houmt Souk", 10.86, 33.88, 2.5], ["Midoun", 11.00, 33.81, 2], ["Zarzis", 11.10, 33.42, 1.5], ["Ben Guerdane", 11.53, 33.38, 1.5], ["El Hamma", 10.55, 33.44, 1]] },
  { name: "Tataouine", count: 14, pop: 150000, motor: 0.21, age: 12.1, deleg: 7, anchors: [["Tataouine", 10.92, 32.93, 3], ["Remada", 10.45, 32.31, 1], ["Ghomrassen", 10.42, 33.10, 1.5], ["Dehibat", 10.70, 32.20, 0.6]] },
  { name: "Gafsa", count: 56, pop: 350000, motor: 0.27, age: 11.4, deleg: 13, anchors: [["Gafsa", 8.78, 34.42, 3], ["Métlaoui", 8.57, 34.35, 1.5], ["Redeyef", 8.43, 34.38, 1.5], ["Moularès", 8.55, 34.46, 1], ["El Guettar", 9.05, 34.34, 1.5], ["Ksar", 9.31, 34.38, 1]] },
  { name: "Tozeur", count: 14, pop: 110000, motor: 0.24, age: 11.2, deleg: 5, anchors: [["Tozeur", 8.13, 33.92, 3], ["Nefta", 7.88, 33.96, 2], ["Degache", 9.02, 34.00, 1.5], ["Tamerza", 7.97, 34.02, 0.8]] },
  { name: "Kébili", count: 14, pop: 160000, motor: 0.25, age: 11.0, deleg: 6, anchors: [["Kébili", 8.77, 33.70, 3], ["Douz", 9.02, 33.46, 2], ["Souk El Ahad", 8.55, 33.75, 0.8], ["Faouar", 8.99, 33.32, 0.6]] },
  { name: "Manouba", count: 42, pop: 380000, motor: 0.41, age: 9.7, deleg: 9, anchors: [["Manouba", 10.10, 36.81, 3], ["Oued Ellil", 10.01, 36.82, 1.5], ["Tebourba", 9.82, 36.92, 1.5], ["Djedeida", 10.06, 36.86, 1.5], ["El Battan", 9.82, 36.85, 1], ["Mornaguia", 10.09, 36.83, 1.5]] },
]

const BRANDS = [
  { slug: "agil", name: "Agil", color: "#dc2626", count: 228 },
  { slug: "totalenergies", name: "TotalEnergies", color: "#ea580c", count: 151 },
  { slug: "staroil", name: "Staroil", color: "#059669", count: 120 },
  { slug: "shell", name: "Shell", color: "#d9a514", count: 100 },
  { slug: "ola", name: "Ola Energy", color: "#9333ea", count: 90 },
  { slug: "independants", name: "Indépendants", color: "#64748b", count: 1125, isIndependents: true },
]

const SERVICES = [
  { slug: "boutique", name: "Boutique", icon: "store", p: 0.82 },
  { slug: "gonflage", name: "Gonflage (air/eau)", icon: "wind", p: 0.65 },
  { slug: "toilettes", name: "Toilettes", icon: "door-open", p: 0.55 },
  { slug: "atm", name: "DAB / Retrait", icon: "credit-card", p: 0.42 },
  { slug: "cafe", name: "Café / Snack", icon: "coffee", p: 0.38 },
  { slug: "lavage", name: "Lavage", icon: "droplets", p: 0.45 },
  { slug: "vidange", name: "Vidange", icon: "wrench", p: 0.32 },
  { slug: "atelier", name: "Atelier mécanique", icon: "cog", p: 0.18 },
  { slug: "recharge", name: "Borne de recharge", icon: "zap", p: 0.06 },
]

const FAMILIES = ["Ben Salah", "Trabelsi", "Hamdi", "Chaabane", "Mabrouk", "Jaziri", "Baccouche", "Sfar", "Karoui", "Ayari", "Gharbi", "Belhaj", "Mansouri", "Haddad", "Zouari", "Ferchichi", "Dridi", "Nasri"]

const REVIEW_COMMENTS = [
  "Station propre et personnel accueillant, service rapide même aux heures de pointe.",
  "Bon rapport qualité-prix pour le lavage, mais l'attente est parfois longue le samedi.",
  "Petit café correct et boutique bien achalandée. Pratique sur la route de l'aéroport.",
  "Pompes bien entretenues, par contre la borne de recharge était hors service.",
  "Personnel sympathique, gonflage gratuit, station facile d'accès depuis la RN.",
  "File d'attente importante le vendredi soir, prévoyez 15 minutes.",
  "Station vétuste, mériterait une rénovation. Les toilettes laissent à désirer.",
  "Ouverte 24h/24, idéale pour les trajets de nuit vers le sud.",
  "Excellente pause café sur l'autoroute, personnel aux petits soins.",
  "Prix affichés non conformes à la pompe 3, à vérifier.",
  "Vaste esplanade adaptée aux poids lourds, bon éclairage nocturne.",
  "Le café est fermé depuis un mois sans explication, dommage.",
  "Station bien située près de la zone industrielle, debit rapide aux pompes.",
  "Accueil chaleureux et coins repas ombragés, très propre.",
  "Difficile d'accès aux heures de sortie des usines, circulation dense.",
  "Le personnel de nuit est très professionnel, pompe toujours fonctionnelle.",
]

const AUTHORS = ["Karim B.", "Sonia M.", "Ahmed T.", "Leïla F.", "Mehdi H.", "Nadia C.", "Sami R.", "Ines Z.", "Youssef A.", "Rania K.", "Walid G.", "Emna S.", "Bilel D.", "Fatma N.", "Hichem O.", "Amel J."]

const NOW = new Date()
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000)

async function main() {
  console.log("🧹 Nettoyage…")
  await db.$transaction([
    db.stationService.deleteMany(), db.review.deleteMany(), db.stationHistory.deleteMany(),
    db.station.deleteMany(), db.service.deleteMany(), db.brand.deleteMany(),
    db.alert.deleteMany(), db.movement.deleteMany(), db.governoratStat.deleteMany(),
    db.roadAxis.deleteMany(), db.infraProject.deleteMany(), db.report.deleteMany(),
    db.reportSchedule.deleteMany(), db.savedCalculation.deleteMany(),
    db.contribution.deleteMany(), db.user.deleteMany(),
  ])

  console.log("🏷️  Enseignes & services…")
  const brands = await Promise.all(BRANDS.map(b => db.brand.create({ data: { slug: b.slug, name: b.name, color: b.color, isIndependents: b.isIndependents ?? false } })))
  const brandBySlug = new Map(brands.map(b => [b.slug, b]))
  const services = await Promise.all(SERVICES.map(s => db.service.create({ data: { slug: s.slug, name: s.name, icon: s.icon } })))
  const serviceBySlug = new Map(services.map(s => [s.slug, s]))

  console.log("📍 Stations (1 814)…")
  // Attribution enseigne : quotas globaux + densité urbaine pour les grandes enseignes
  const brandSlots: string[] = []
  for (const b of BRANDS) for (let i = 0; i < b.count; i++) brandSlots.push(b.slug)

  const stationsData: {
    code: string; name: string; brandSlug: string; gouvernorat: string; delegation: string;
    address: string; lat: number; lng: number; status: string; traffic: number;
    open24: boolean; open7j: boolean; rating: number; reviewsCount: number;
    photoUrl: string | null; lastVerified: Date; verifiedBy: string; services: string[];
  }[] = []

  const URBAN = new Set(["Tunis", "Ariana", "Ben Arous", "Sfax", "Sousse", "Monastir", "Nabeul", "Manouba", "Mahdia", "Bizerte", "Gabès", "Médenine"])
  const HIGH_TRAFFIC = new Set(["Tunis", "Ariana", "Ben Arous", "Sfax", "Sousse", "Monastir", "Nabeul", "Manouba"])

  let codeNum = 1
  for (const gov of GOVS) {
    const anchors = gov.anchors
    const anchorPool: number[] = []
    anchors.forEach((a, i) => { for (let j = 0; j < Math.round(a[3] * 10); j++) anchorPool.push(i) })

    for (let i = 0; i < gov.count; i++) {
      const anchor = anchors[anchorPool[Math.floor(rnd() * anchorPool.length)]]
      const lat = r1(anchor[2] + range(-0.055, 0.055))
      const lng = r1(anchor[1] + range(-0.055, 0.055))

      // statut
      const st = rnd()
      const status = st < 0.94 ? "ACTIVE" : st < 0.97 ? "RENOVATION" : st < 0.99 ? "PROJECT" : "CLOSED"

      // enseigne : quotas + préférence urbaine pour Shell/Total
      let slug: string
      let tries = 0
      do {
        const idx = Math.floor(rnd() * brandSlots.length)
        slug = brandSlots[idx]
        const isUrbanBrand = slug === "totalenergies" || slug === "shell"
        const urban = URBAN.has(gov.name)
        if ((isUrbanBrand && !urban) || (!isUrbanBrand && urban && slug === "independants" && rnd() < 0.35)) { tries++; if (tries < 6) continue }
        brandSlots.splice(idx, 1)
        break
      } while (tries < 6)
      if (brandSlots.indexOf(slug) !== -1 && status === "CLOSED") { /* déjà consommé */ }

      // services
      const stServices = SERVICES.filter(s => rnd() < (status === "PROJECT" ? s.p * 0.5 : s.p)).map(s => s.slug)
      if (stServices.length === 0) stServices.push("boutique")

      // trafic
      let traffic = 0
      if (status === "ACTIVE") {
        const base = HIGH_TRAFFIC.has(gov.name) ? range(2600, 7800) : URBAN.has(gov.name) ? range(1600, 4200) : range(500, 2400)
        traffic = Math.round(base)
      }

      const open24 = status === "ACTIVE" && rnd() < (URBAN.has(gov.name) ? 0.19 : 0.08)
      const rating = status === "PROJECT" ? 0 : Math.min(4.9, r1(range(3.1, 4.8)))
      const reviewsCount = status === "ACTIVE" ? Math.round(rnd() * rnd() * 58) : 0
      const freshness = rnd() < 0.9 ? iRange(3, 360) : iRange(366, 520)

      // nom
      const brandName = BRANDS.find(b => b.slug === slug)!.name
      let name: string
      if (slug === "independants") {
        const style = rnd()
        name = style < 0.4 ? `Station ${anchor[0]}` : style < 0.7 ? `Station-service ${pick(FAMILIES)}` : `Petro ${anchor[0]} ${iRange(1, 3)}`
      } else {
        name = `${brandName} ${anchor[0]}${rnd() < 0.5 ? ` ${iRange(1, 4)}` : ""}`
      }

      const code = `TN-${String(codeNum++).padStart(4, "0")}`
      stationsData.push({
        code, name, brandSlug: slug, gouvernorat: gov.name, delegation: anchor[0],
        address: `${anchor[0]}, ${gov.name} — ${iRange(1, 90)} ${rnd() < 0.4 ? "Route de " + pick(["Tunis", "Sousse", "Gabès", "Gafsa", "l'aéroport", "la zone industrielle", "Kairouan", "Béja"]) : pick(["Avenue Habib Bourguiba", "Avenue de la République", "RN1", "GP1", "Route de la plage", "Cité El Khadhra", "Rue de l'Environnement"])}`,
        lat, lng, status, traffic, open24, open7j: open24 || rnd() < 0.3,
        rating, reviewsCount,
        photoUrl: rnd() < 0.06 ? `/images/station-${iRange(1, 4)}.jpg` : null,
        lastVerified: daysAgo(freshness),
        verifiedBy: pick(["Agent INS-12", "Agent terrain Sud", "Agent terrain Nord", "Direction Réseau", "Agent INS-04", "Contributeur certifié", "Agent Grand Tunis"]),
        services: stServices,
      })
    }
  }

  // Injection stations en base (par lots)
  const stationRows = []
  for (const s of stationsData) {
    const brand = brandBySlug.get(s.brandSlug)!
    const row = await db.station.create({
      data: {
        code: s.code, name: s.name, brandId: brand.id, gouvernorat: s.gouvernorat,
        delegation: s.delegation, address: s.address, lat: s.lat, lng: s.lng,
        status: s.status, traffic: s.traffic, open24: s.open24, open7j: s.open7j,
        rating: s.rating, reviewsCount: s.reviewsCount, photoUrl: s.photoUrl,
        lastVerified: s.lastVerified, verifiedBy: s.verifiedBy,
        services: { create: s.services.map(slug => { const svc = serviceBySlug.get(slug)!; return { serviceId: svc.id } }) },
      },
    })
    stationRows.push(row)
  }
  console.log(`   → ${stationRows.length} stations créées`)

  console.log("⭐ Avis…")
  let reviewsDone = 0
  const activeStations = stationRows.filter(s => s.status === "ACTIVE")
  for (const st of activeStations) {
    const n = Math.min(st.reviewsCount, 3) // on matérialise jusqu'à 3 avis par fiche
    for (let i = 0; i < n; i++) {
      await db.review.create({
        data: {
          stationId: st.id, author: pick(AUTHORS), rating: Math.max(1, Math.min(5, Math.round(st.rating + range(-1.1, 0.9)))),
          comment: pick(REVIEW_COMMENTS),
          criteria: { proprete: r1(range(2, 5)), accueil: r1(range(2.5, 5)), rapidite: r1(range(2, 5)), services: r1(range(2, 5)) },
          createdAt: daysAgo(iRange(2, 220)),
        },
      })
      reviewsDone++
    }
  }
  console.log(`   → ${reviewsDone} avis`)

  console.log("🕘 Historique de fiche (échantillon)…")
  const historySample = activeStations.filter(s => rnd() < 0.12).slice(0, 220)
  for (const st of historySample) {
    const fields: [string, string, string][] = [
      ["services", "Boutique, Gonflage", "Boutique, Gonflage, Café"],
      ["horaires", "07h–20h", "06h30–21h30"],
      ["statut", "ACTIVE", "RENOVATION"],
      ["services", "Lavage, Vidange", "Lavage, Vidange, Atelier"],
      ["photo", "—", "photo-officielle.jpg"],
    ]
    const f = pick(fields)
    await db.stationHistory.create({
      data: {
        stationId: st.id, field: f[0], oldValue: f[1], newValue: f[2],
        author: pick(["Direction Réseau", "Agent terrain Nord", "Portail Enseigne", "Contributeur certifié"]),
        source: pick(["Enseigne", "Agent terrain", "Utilisateur", "Plateforme"]),
        createdAt: daysAgo(iRange(5, 300)),
      },
    })
  }

  console.log("🚨 Alertes…")
  const ALERT_TEMPLATES: [string, string, string, string][] = [
    ["OPENING", "Ouverture d'une station {brand} à {place}", "Nouvelle station concurrente détectée : {n} pompes, services : {svcs}. Impact potentiel sur le trafic captif des stations voisines dans un rayon de 5 km."],
    ["RENOVATION", "Rénovation majeure — {brand} {place}", "Travaux de modernisation en cours : ajout de {svcs} et refonte de l'esplanade. Réouverture estimée sous 3 mois."],
    ["REBRAND", "Changement d'enseigne : {from} → {brand} à {place}", "Station rachetée et re-brandée. Repositionnement tarifaire et offre de services attendus."],
    ["INFRA", "Projet d'infrastructure à {place}", "Nouvel échangeur / prolongation autoroutière annoncée : modification des flux de trafic prévue à horizon 24 mois."],
    ["REGULATORY", "Évolution réglementaire — {place}", "Nouvelle circulaire du Ministère de l'Énergie relative aux prix / aux normes de sécurité des cuves. Conformité à vérifier avant l'échéance."],
  ]
  const alertSev = () => { const r = rnd(); return r < 0.26 ? "CRITICAL" : r < 0.7 ? "MEDIUM" : "INFO" }
  for (let i = 0; i < 44; i++) {
    const st = pick(activeStations)
    const t = pick(ALERT_TEMPLATES)
    const brand = BRANDS.find(b => stationRows.find(s => s.id === st.id)?.brandId === brandBySlug.get(b.slug)!.id) ?? pick(BRANDS)
    const other = pick(BRANDS.filter(b => b.slug !== brand.slug))
    const title = t[1].replace("{brand}", brand.name).replace("{place}", st.delegation).replace("{from}", other.name)
    const description = t[2].replace("{n}", String(iRange(2, 8))).replace("{svcs}", pick(["lavage automatique", "café et boutique étendus", "bornes de recharge", "vidange express", "atelier poids lourds"]))
    await db.alert.create({
      data: {
        type: t[0], severity: alertSev(), title, description,
        brand: brand.name, gouvernorat: st.gouvernorat, date: daysAgo(iRange(0, 45)),
        impact: pick(["Fort", "Moyen", "Faible"]), stationCode: st.code, read: rnd() < 0.3,
      },
    })
  }

  console.log("📊 Mouvements concurrentiels (12 mois)…")
  const monthsFr = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"]
  for (let m = 11; m >= 0; m--) {
    const d = new Date(NOW.getFullYear(), NOW.getMonth() - m, 1 + iRange(0, 27))
    const nOpen = iRange(4, 9), nReno = iRange(2, 6), nClose = iRange(0, 3), nRebrand = iRange(0, 2)
    for (let i = 0; i < nOpen; i++) {
      const st = pick(activeStations); const b = pick(BRANDS.filter(x => !x.isIndependents))
      await db.movement.create({ data: { date: d, type: "OPENING", brand: b.name, station: `${st.delegation} ${iRange(1, 5)}`, gouvernorat: st.gouvernorat, impact: pick(["Fort", "Moyen", "Faible"]) } })
    }
    for (let i = 0; i < nReno; i++) {
      const st = pick(activeStations); const b = pick(BRANDS.filter(x => !x.isIndependents))
      await db.movement.create({ data: { date: d, type: "RENOVATION", brand: b.name, station: `${st.delegation} ${iRange(1, 4)}`, gouvernorat: st.gouvernorat, impact: pick(["Moyen", "Faible"]) } })
    }
    for (let i = 0; i < nClose; i++) {
      const st = pick(activeStations)
      await db.movement.create({ data: { date: d, type: "CLOSURE", brand: pick(BRANDS).name, station: `Station ${st.delegation}`, gouvernorat: st.gouvernorat, impact: "Faible" } })
    }
    for (let i = 0; i < nRebrand; i++) {
      const st = pick(activeStations); const b = pick(BRANDS.filter(x => !x.isIndependents))
      await db.movement.create({ data: { date: d, type: "REBRAND", brand: b.name, station: `Station ${st.delegation}`, gouvernorat: st.gouvernorat, impact: "Moyen" } })
    }
  }

  console.log("🗺️  Gouvernorats…")
  for (const g of GOVS) {
    await db.governoratStat.create({
      data: {
        name: g.name, population: g.pop, vehicles: Math.round(g.pop * g.motor),
        motorizationRate: r1(g.motor), avgFleetAge: g.age, delegationCount: g.deleg,
      },
    })
  }

  console.log("🛣️  Axes routiers…")
  const roads = [
    { code: "A1", name: "Autoroute Tunis — Sousse — Sfax (Orbata)", type: "AUTOROUTE", tmj: 28000, hv: 22, segs: [[10.18, 36.80], [10.15, 36.60], [10.14, 36.40], [10.38, 36.19], [10.55, 36.02], [10.63, 35.83], [10.75, 35.60], [10.79, 35.35], [10.76, 34.95], [10.76, 34.74], [10.70, 34.40]] },
    { code: "A2", name: "Autoroute Tunis — Bou Salem", type: "AUTOROUTE", tmj: 11500, hv: 28, segs: [[10.18, 36.80], [10.05, 36.82], [9.85, 36.88], [9.60, 36.75], [9.35, 36.70], [8.99, 36.62]] },
    { code: "A3", name: "Autoroute Tunis — Oued Zarga", type: "AUTOROUTE", tmj: 14000, hv: 18, segs: [[10.18, 36.80], [9.95, 36.78], [9.70, 36.66], [9.60, 36.55]] },
    { code: "A4", name: "Autoroute Tunis — Bizerte", type: "AUTOROUTE", tmj: 21000, hv: 15, segs: [[10.18, 36.80], [10.05, 36.95], [9.95, 37.05], [9.87, 37.20]] },
    { code: "RN1", name: "RN1 Littoral Est : Tunis — Sousse — Sfax — Gabès", type: "RN", tmj: 18500, hv: 20, segs: [[10.18, 36.80], [10.48, 36.68], [10.74, 36.45], [10.61, 36.40], [10.63, 35.83], [10.76, 34.74], [10.40, 34.30], [10.11, 33.89]] },
    { code: "RN3", name: "RN3 Intérieure : Tunis — Kairouan — Sidi Bouzid — Gafsa", type: "RN", tmj: 8000, hv: 32, segs: [[10.18, 36.80], [10.09, 35.68], [9.48, 35.38], [8.78, 34.42]] },
    { code: "RN10", name: "RN10 Sud : Gabès — Médenine — Ben Guerdane", type: "RN", tmj: 6500, hv: 35, segs: [[10.11, 33.89], [10.25, 33.60], [10.50, 33.35], [11.10, 33.42], [11.53, 33.38]] },
    { code: "GP9", name: "GP9 Littoral Nord : Tunis — Bizerte", type: "GP", tmj: 12000, hv: 14, segs: [[10.18, 36.80], [10.05, 36.98], [9.95, 37.10], [9.87, 37.24]] },
    { code: "RN2", name: "RN2 Nord-Ouest : Tunis — Béja — Jendouba — Ghardimaou", type: "RN", tmj: 7000, hv: 30, segs: [[10.18, 36.80], [9.61, 36.55], [9.18, 36.72], [8.78, 36.50], [8.68, 36.46]] },
  ]
  for (const r of roads) {
    await db.roadAxis.create({ data: { code: r.code, name: r.name, type: r.type, tmj: r.tmj, heavyVehiclePct: r.hv, segments: r.segs } })
  }

  console.log("🏗️  Projets d'infrastructure…")
  const projects = [
    { name: "Prolongement A1 : Sfax — Gabès", type: "AUTOROUTE", status: "CONSTRUCTION", budget: "1 200 MTND", target: "2027", desc: "Section de 115 km incluant 7 échangeurs. Impact direct sur les flux sud et la vallée de l'Oued Gabès.", lat: 34.4, lng: 10.4 },
    { name: "Autoroute Gabès — Médenine (études)", type: "AUTOROUTE", status: "PLANIFIE", budget: "900 MTND", target: "2030", desc: "Prolongement stratégique vers la Libye, 90 km. Phase d'études d'impact environnemental.", lat: 33.5, lng: 10.6 },
    { name: "Échangeur El Mourouj — A1", type: "ECHANGEUR", status: "CONSTRUCTION", budget: "45 MTND", target: "2026", desc: "Décongestionnement du nœud sud de Tunis, accès direct zone industrielle.", lat: 36.71, lng: 10.22 },
    { name: "Extension zone industrielle Zarzis", type: "ZONE_INDUSTRIELLE", status: "CONSTRUCTION", budget: "160 MTND", target: "2026", desc: "+80 ha logistiques et énergies renouvelables, besoin en services poids lourds.", lat: 33.45, lng: 11.05 },
    { name: "Plateforme logistique portuaire Sfax", type: "PORT", status: "PLANIFIE", budget: "500 MTND", target: "2028", desc: "Nouveau quai vrac et zone logistique associée au Grand Sfax.", lat: 34.74, lng: 10.76 },
    { name: "Rocade de Kairouan", type: "ROUTE", status: "CONSTRUCTION", budget: "80 MTND", target: "2026", desc: "Contournement urbain de 22 km, report de trafic PL hors centre-ville.", lat: 35.68, lng: 10.09 },
    { name: "Élargissement RN10 Médenine — Ben Guerdane", type: "ROUTE", status: "CONSTRUCTION", budget: "120 MTND", target: "2026", desc: "2x2 voies sur 40 km, frontière Libye, trafic poids lourds attendu +35 %.", lat: 33.38, lng: 11.2 },
    { name: "Zone industrielle Feriana phase 2", type: "ZONE_INDUSTRIELLE", status: "PLANIFIE", budget: "70 MTND", target: "2027", desc: "Parc agro-industriel et phosphates, 40 ha.", lat: 34.98, lng: 8.61 },
    { name: "Échangeur Oued Zarga — A3", type: "ECHANGEUR", status: "PLANIFIE", budget: "35 MTND", target: "2028", desc: "Connexion de l'A3 au pôle minier du Nord-Ouest.", lat: 36.55, lng: 9.6 },
    { name: "Corridor de recharge électrique A1", type: "ROUTE", status: "PLANIFIE", budget: "25 MTND", target: "2027", desc: "12 aires de bornes rapides entre Tunis et Sfax, partenariat STEG.", lat: 35.35, lng: 10.79 },
  ]
  for (const p of projects) {
    await db.infraProject.create({ data: { name: p.name, type: p.type, status: p.status, budget: p.budget, targetDate: p.target, description: p.desc, lat: p.lat, lng: p.lng } })
  }

  console.log("📄 Rapports & programmations…")
  const reports = [
    { name: "Analyse concurrentielle — Grand Tunis", type: "CONCURRENCE", period: "Q3 2025", scope: "Grand Tunis", format: "PDF", by: "Direction Commerciale", size: 2840 },
    { name: "Potentiel d'implantation — Cap Bon", type: "IMPLANTATION", period: "Octobre 2025", scope: "Nabeul", format: "PDF", by: "Direction Expansion", size: 3120 },
    { name: "Performance réseau — Synthèse", type: "PERFORMANCE", period: "Octobre 2025", scope: "National", format: "Excel", by: "Direction Réseau", size: 990 },
    { name: "Veille mensuelle — Septembre", type: "VEILLE", period: "Septembre 2025", scope: "National", format: "PDF", by: "Système", size: 1580 },
    { name: "Parc automobile national 2025", type: "PERFORMANCE", period: "S1 2025", scope: "National", format: "PowerPoint", by: "Plateforme", size: 6740 },
    { name: "Plan d'expansion Sud 2026", type: "IMPLANTATION", period: "T4 2025", scope: "Sud-Est", format: "PowerPoint", by: "Direction Expansion", size: 5210 },
  ]
  for (const r of reports) {
    await db.report.create({ data: { name: r.name, type: r.type, period: r.period, scope: r.scope, format: r.format, generatedBy: r.by, sizeKb: r.size, createdAt: daysAgo(iRange(1, 40)) } })
  }
  const schedules = [
    { name: "Veille hebdomadaire concurrentielle", type: "WEEKLY", target: "Grand Tunis + axes A1/A4", channel: "Email + plateforme" },
    { name: "Synthèse mensuelle réseau", type: "MONTHLY", target: "National", channel: "Email" },
    { name: "Alerte concurrentielle temps réel", type: "REALTIME", target: "Rayon 15 km autour de mes stations", channel: "Notification push" },
  ]
  for (const s of schedules) {
    await db.reportSchedule.create({ data: { name: s.name, type: s.type, target: s.target, channel: s.channel } })
  }

  console.log("💬 Contributions communautaires (B2C)…")
  const CONTRIB_TYPES: [string, string][] = [
    ["CLOSED", "Station fermée ce matin, rideaux baissés, aucune signalisation."],
    ["SERVICE_UNAVAILABLE", "Le lavage est fermé depuis une semaine selon le gérant."],
    ["PRICE_ABNORMAL", "Écart entre le prix affiché en entrée et celui en caisse."],
    ["PUMP_BROKEN", "Pompe 3 hors service, personnel au courant."],
    ["QUEUE", "File d'attente de plus de 20 minutes, uniquement 2 pompes ouvertes."],
    ["CLEANLINESS", "Esplanade sale, poubelles débordantes depuis samedi."],
  ]
  for (let i = 0; i < 14; i++) {
    const st = pick(activeStations)
    const c = pick(CONTRIB_TYPES)
    await db.contribution.create({
      data: {
        stationCode: st.code, type: c[0], comment: c[1],
        author: pick(AUTHORS),
        status: pick(["PENDING", "PENDING", "PENDING", "VALIDATED", "REJECTED"]),
        validationCount: iRange(0, 2), lat: st.lat, lng: st.lng,
        createdAt: daysAgo(iRange(0, 12)),
      },
    })
  }

  console.log("👥 Utilisateurs de démonstration…")
  const users = [
    { email: "admin@carbuscope.tn", name: "Admin Plateforme", role: "ADMIN", brandSlug: null },
    { email: "reseau@agil.tn", name: "Salma Ferhat", role: "NETWORK", brandSlug: "agil" },
    { email: "commercial@agil.tn", name: "Mehdi Lasram", role: "COMMERCIAL", brandSlug: "agil" },
    { email: "expansion@agil.tn", name: "Nizar Belkacem", role: "EXPANSION", brandSlug: "agil" },
    { email: "reseau@totalenergies.tn", name: "Ines Chaabane", role: "NETWORK", brandSlug: "totalenergies" },
  ]
  for (const u of users) {
    await db.user.create({ data: { email: u.email, name: u.name, role: u.role, brandSlug: u.brandSlug } })
  }

  const total = await db.station.count()
  console.log(`✅ Seed terminé — ${total} stations en base.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
