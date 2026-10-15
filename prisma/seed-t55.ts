/**
 * CarbuScope — Seed T55 « Extension » : Opportunity Radar + Mobility Hubs.
 * Données réalistes Tunisie, RNG déterministe (reproductibilité), idempotent
 * (les tables T55 sont vidées avant re-semis — aucune autre table touchée).
 * Exécution : bun prisma/seed-t55.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// ---------- RNG déterministe (même algorithme que seed.ts) ----------
let seed = 20261001
function rnd(): number {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const iRange = (min: number, max: number) => Math.floor(min + rnd() * (max - min + 1))
const r1 = (v: number) => Math.round(v * 10) / 10
const NOW = new Date()
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 3600 * 1000)

// ---------- Gouvernorats : foncier estimé (DT/m²) + disponibilité (%) + pouvoir d'achat (0-100) ----------
// Sources plausibles V1 (badge « est. ») : Grand Tunis > littoral > intérieur.
const LAND_PPA: [string, number, number, number][] = [
  ["Tunis", 1450, 18, 100],
  ["Ariana", 1150, 22, 94],
  ["Ben Arous", 980, 26, 92],
  ["Manouba", 620, 34, 78],
  ["Nabeul", 720, 30, 82],
  ["Bizerte", 540, 32, 74],
  ["Sfax", 810, 24, 80],
  ["Sousse", 760, 27, 84],
  ["Monastir", 690, 29, 82],
  ["Mahdia", 480, 36, 68],
  ["Kairouan", 330, 44, 56],
  ["Zaghouan", 290, 48, 52],
  ["Béja", 310, 43, 54],
  ["Jendouba", 270, 47, 48],
  ["Le Kef", 250, 50, 46],
  ["Siliana", 240, 52, 45],
  ["Sidi Bouzid", 230, 55, 42],
  ["Kasserine", 235, 54, 43],
  ["Gabès", 380, 40, 58],
  ["Médenine", 340, 42, 55],
  ["Tataouine", 260, 55, 44],
  ["Gafsa", 300, 46, 50],
  ["Tozeur", 280, 48, 48],
  ["Kébili", 255, 52, 45],
]

// ---------- Hubs (7 actifs + 1 construction) ----------
type HubSeed = { code: string; name: string; brandSlug: string; gouvernorat: string; delegation: string; lat: number; lng: number; format: string; status: string; invest: number; rent: number; openedDaysAgo: number | null }
const HUBS: HubSeed[] = [
  { code: "TMP-AG-01", name: "Mégrine Services", brandSlug: "agil", gouvernorat: "Ben Arous", delegation: "Mégrine", lat: 36.735, lng: 10.238, format: "MOBILITY_HUB", status: "ACTIF", invest: 320000, rent: 1800, openedDaysAgo: 540 },
  { code: "TMP-AG-02", name: "Soukra Express", brandSlug: "agil", gouvernorat: "Ariana", delegation: "Soukra", lat: 36.842, lng: 10.284, format: "EXPRESS", status: "ACTIF", invest: 195000, rent: 1200, openedDaysAgo: 420 },
  { code: "TMP-AG-03", name: "Sakiet Hub", brandSlug: "agil", gouvernorat: "Sfax", delegation: "Sakiet Ezzit", lat: 34.818, lng: 10.895, format: "MOBILITY_HUB", status: "ACTIF", invest: 285000, rent: 1500, openedDaysAgo: 330 },
  { code: "TMP-SH-01", name: "La Marsa Point", brandSlug: "shell", gouvernorat: "Tunis", delegation: "La Marsa", lat: 36.876, lng: 10.321, format: "MOBILITY_HUB", status: "ACTIF", invest: 340000, rent: 2100, openedDaysAgo: 480 },
  { code: "TMP-SH-02", name: "Hammam Sousse Services", brandSlug: "shell", gouvernorat: "Sousse", delegation: "Hammam Sousse", lat: 35.884, lng: 10.622, format: "EXPRESS", status: "ACTIF", invest: 205000, rent: 1300, openedDaysAgo: 290 },
  { code: "TMP-OL-01", name: "Moknine Auto Point", brandSlug: "ola", gouvernorat: "Monastir", delegation: "Moknine", lat: 35.631, lng: 10.818, format: "MOBILITY_HUB", status: "ACTIF", invest: 265000, rent: 1400, openedDaysAgo: 365 },
  { code: "TMP-TO-01", name: "Korba Mobility", brandSlug: "totalenergies", gouvernorat: "Nabeul", delegation: "Korba", lat: 36.572, lng: 10.858, format: "MOBILITY_HUB", status: "ACTIF", invest: 310000, rent: 1700, openedDaysAgo: 240 },
  { code: "TMP-ST-01", name: "Msaken Projet", brandSlug: "staroil", gouvernorat: "Sousse", delegation: "Msaken", lat: 35.732, lng: 10.592, format: "EXPRESS", status: "CONSTRUCTION", invest: 210000, rent: 1100, openedDaysAgo: null },
]

// ---------- Candidats franchise (12) ----------
const CANDIDATES: { fullName: string; gouvernorat: string; status: string; capital: number; experience: string; zoneNote: number; email: string; phone: string }[] = [
  { fullName: "Mehdi Ben Salah", gouvernorat: "Sfax", status: "SIGNE", capital: 140000, experience: "Gérant de station-service (8 ans)", zoneNote: 78, email: "mehdi.bensalah@example.tn", phone: "+216 74 555 201" },
  { fullName: "Ines Khemakhem", gouvernorat: "Nabeul", status: "SIGNE", capital: 160000, experience: "Garagiste multimarque (11 ans)", zoneNote: 74, email: "ines.khemakhem@example.tn", phone: "+216 72 555 314" },
  { fullName: "Slim Gharbi", gouvernorat: "Sousse", status: "SIGNE", capital: 120000, experience: "Responsable atelier mécanique (6 ans)", zoneNote: 69, email: "slim.gharbi@example.tn", phone: "+216 73 555 102" },
  { fullName: "Amel Toumi", gouvernorat: "Monastir", status: "VISITE", capital: 95000, experience: "Gérante centre auto (4 ans)", zoneNote: 66, email: "amel.toumi@example.tn", phone: "+216 73 555 408" },
  { fullName: "Hichem Jaouadi", gouvernorat: "Kairouan", status: "VISITE", capital: 80000, experience: "Technicien maintenance poids lourds", zoneNote: 61, email: "hichem.jaouadi@example.tn", phone: "+216 77 555 220" },
  { fullName: "Rania Meddeb", gouvernorat: "Gabès", status: "VISITE", capital: 110000, experience: "Commerçante pièces détachées (9 ans)", zoneNote: 58, email: "rania.meddeb@example.tn", phone: "+216 75 555 190" },
  { fullName: "Walid Ayari", gouvernorat: "Bizerte", status: "QUALIFIE", capital: 75000, experience: "Mechanicien diagnostiqueur (5 ans)", zoneNote: 63, email: "walid.ayari@example.tn", phone: "+216 71 555 077" },
  { fullName: "Farida Chouchane", gouvernorat: "Mahdia", status: "QUALIFIE", capital: 90000, experience: "Ancienne franchisée textile", zoneNote: 55, email: "farida.chouchane@example.tn", phone: "+216 73 555 566" },
  { fullName: "Karim Zouari", gouvernorat: "Gafsa", status: "QUALIFIE", capital: 70000, experience: "Gérant station rurale (3 ans)", zoneNote: 52, email: "karim.zouari@example.tn", phone: "+216 76 555 133" },
  { fullName: "Sonia Ferchichi", gouvernorat: "Béja", status: "INTERESSE", capital: 65000, experience: "Ingenieure industrielle (reconversion)", zoneNote: 49, email: "sonia.ferchichi@example.tn", phone: "+216 78 555 011" },
  { fullName: "Nabil Hamdi", gouvernorat: "Jendouba", status: "INTERESSE", capital: 55000, experience: "Commerçant carburant informel", zoneNote: 46, email: "nabil.hamdi@example.tn", phone: "+216 78 555 445" },
  { fullName: "Leila Ben Romdhane", gouvernorat: "Sidi Bouzid", status: "REFUSE", capital: 40000, experience: "Sans expérience automobile", zoneNote: 44, email: "leila.bromdhane@example.tn", phone: "+216 76 555 990" },
]

// ---------- Véhicules (parcs réalistes Tunisie) ----------
const CAR_MODELS: [string, string][] = [
  ["Peugeot", "206"], ["Peugeot", "208"], ["Peugeot", "Partner"],
  ["Renault", "Clio 4"], ["Renault", "Symbol"], ["Renault", "Kangoo"],
  ["Volkswagen", "Polo"], ["Volkswagen", "Golf 7"], ["Volkswagen", "Caddy"],
  ["Dacia", "Logan"], ["Dacia", "Sandero"], ["Dacia", "Dokker"],
  ["Hyundai", "i10"], ["Hyundai", "Accent"], ["Hyundai", "Atos"],
  ["Kia", "Picanto"], ["Kia", "Rio"],
  ["Fiat", "Doblo"], ["Fiat", "Uno"], ["Fiat", "Fiorino"],
  ["Citroën", "C3"], ["Citroën", "Berlingo"],
  ["Toyota", "Yaris"], ["Toyota", "Corolla"],
  ["Suzuki", "Swift"], ["Chevrolet", "Aveo"], ["Isuzu", "D-Max"],
]
const PLATE_SERIES = ["TU", "TN", "BS", "JS", "BT"]

async function main() {
  console.log("🧹 Nettoyage des tables T55 (idempotence)…")
  await db.hubConversion.deleteMany()
  await db.hubIntervention.deleteMany()
  await db.hubVehicle.deleteMany()
  await db.mobilityHub.deleteMany()
  await db.franchiseContract.deleteMany()
  await db.franchiseCandidate.deleteMany()
  await db.zoneAlert.deleteMany()
  await db.landIndicator.deleteMany()
  await db.purchasingPower.deleteMany()
  await db.opportunityConfig.deleteMany()
  await db.hubService.deleteMany()

  // 1) Config du moteur de scoring (defaults validés T55-P1)
  await db.opportunityConfig.create({ data: {} })
  console.log("✅ OpportunityConfig (30/20/25/15/10 · seuil 70 · Top 50)")

  // 2) Foncier + pouvoir d'achat (24 gouvernorats, estimés V1)
  await db.landIndicator.createMany({
    data: LAND_PPA.map(([g, price, avail]) => ({ gouvernorat: g, landPriceDt: price, landAvailPct: avail, estimated: true })),
  })
  await db.purchasingPower.createMany({
    data: LAND_PPA.map(([g, , , ppa]) => ({ gouvernorat: g, ppaIndex: ppa, estimated: true })),
  })
  console.log(`✅ LandIndicator + PurchasingPower ×${LAND_PPA.length}`)

  // 3) Alertes de zones (3 actives pour la démo — générées par une « passe »)
  await db.zoneAlert.createMany({
    data: [
      { gouvernorat: "Kairouan", score: 76, threshold: 70, detail: "Score 76/100 — zone passée sous le seuil critique d'équipement (ratio 1 385 véh./station, palier BLANCHE)." },
      { gouvernorat: "Jendouba", score: 71, threshold: 70, detail: "Score 71/100 — recul de 4 points après 2 fermetures concurrentes (T3)." },
      { gouvernorat: "Sidi Bouzid", score: 73, threshold: 70, detail: "Score 73/100 — axe RN3 en renforcement (TMJ +9 %), couverture enseigne 11 %." },
    ],
  })
  console.log("✅ ZoneAlert ×3")

  // 4) Services TMP (grille tarifaire de référence)
  const services = await db.hubService.createManyAndReturn({
    data: [
      { type: "VIDANGE", label: "Vidange express (huile + filtre)", basePriceDt: 85, durationMin: 45 },
      { type: "PNEUS", label: "Vente & montage pneus (le pneu)", basePriceDt: 165, durationMin: 30 },
      { type: "DIAGNOSTIC", label: "Diagnostic électronique complet", basePriceDt: 60, durationMin: 40 },
    ],
  })
  console.log(`✅ HubService ×${services.length}`)

  // 5) Candidats franchise
  const candidates = await db.franchiseCandidate.createManyAndReturn({
    data: CANDIDATES.map(({ fullName, gouvernorat, status, capital, experience, zoneNote, email, phone }) => ({
      fullName, gouvernorat, status, capital, experience, zoneNote, email, phone,
      notes: status === "REFUSE" ? "Dossier incomplet — apport insuffisant, sans expérience automobile." : "",
    })),
  })
  const byName = new Map(candidates.map(c => [c.fullName, c.id]))
  console.log(`✅ FranchiseCandidate ×${candidates.length}`)

  // 6) Hubs (franchisés = candidats SIGNE)
  const hubRows = HUBS.map(h => {
    const franchiseeId =
      h.code === "TMP-AG-03" ? byName.get("Mehdi Ben Salah") :
      h.code === "TMP-TO-01" ? byName.get("Ines Khemakhem") :
      h.code === "TMP-OL-01" ? byName.get("Slim Gharbi") : null
    return {
      code: h.code, name: h.name, brandSlug: h.brandSlug, gouvernorat: h.gouvernorat,
      delegation: h.delegation, lat: h.lat, lng: h.lng, format: h.format, status: h.status,
      openedAt: h.openedDaysAgo ? daysAgo(h.openedDaysAgo) : null,
      investmentDt: h.invest, monthlyRentDt: h.rent, franchiseeId,
    }
  })
  const hubs = await db.mobilityHub.createManyAndReturn({ data: hubRows })
  const activeHubs = hubs.filter(h => h.status === "ACTIF")
  console.log(`✅ MobilityHub ×${hubs.length} (dont ${activeHubs.length} actifs)`)

  // 7) Contrats de franchise (3 — pour les franchisés SIGNE)
  const signed = [
    { candidate: "Mehdi Ben Salah", hubId: hubs.find(h => h.code === "TMP-AG-03")?.id, number: "FR-2026-001" },
    { candidate: "Ines Khemakhem", hubId: hubs.find(h => h.code === "TMP-TO-01")?.id, number: "FR-2026-002" },
    { candidate: "Slim Gharbi", hubId: hubs.find(h => h.code === "TMP-OL-01")?.id, number: "FR-2026-003" },
  ]
  await db.franchiseContract.createMany({
    data: signed.map((s, i) => ({
      candidateId: byName.get(s.candidate)!,
      hubId: s.hubId ?? null,
      number: s.number,
      format: "MOBILITY_HUB",
      status: "ACTIF",
      content: `Contrat de franchise ${s.number} — ${s.candidate} · redevance 3 % CA · engagement 5 ans · kit de démarrage complet.`,
      signedAt: daysAgo(400 - i * 30),
    })),
  })
  console.log("✅ FranchiseContract ×3")

  // 8) Véhicules clients (~350, plaques uniques, répartition pondérée par hub)
  const weights: Record<string, number> = { "TMP-AG-01": 70, "TMP-AG-02": 52, "TMP-AG-03": 61, "TMP-SH-01": 58, "TMP-SH-02": 42, "TMP-OL-01": 38, "TMP-TO-01": 34 }
  const hubPool: string[] = []
  for (const [code, w] of Object.entries(weights)) {
    const hub = activeHubs.find(h => h.code === code)!
    for (let i = 0; i < w; i++) hubPool.push(hub.id)
  }
  const vehicles: { plate: string; brand: string; model: string; km: number; hubId: string; loyaltyPoints: number; lastVisit: Date | null }[] = []
  let n = 100
  for (const hubId of hubPool) {
    const [brand, model] = CAR_MODELS[iRange(0, CAR_MODELS.length - 1)]
    const series = PLATE_SERIES[iRange(0, PLATE_SERIES.length - 1)]
    n += iRange(1, 7)
    const lastDays = rnd() < 0.85 ? iRange(1, 170) : null
    vehicles.push({
      plate: `${n} ${series} ${4000 + vehicles.length}`,
      brand, model,
      km: iRange(18, 280) * 1000,
      hubId,
      loyaltyPoints: iRange(0, 340),
      lastVisit: lastDays !== null ? daysAgo(lastDays) : null,
    })
  }
  await db.hubVehicle.createMany({ data: vehicles })
  console.log(`✅ HubVehicle ×${vehicles.length}`)

  // 9) Interventions (~500 sur 6 mois — prix autour de la grille de référence)
  const interventions: { hubId: string; vehicleId: string; serviceType: string; detail: string | null; priceDt: number; durationMin: number; createdAt: Date }[] = []
  const vidangeDetails = ["Huile 5W-30 5L + filtre", "Huile 10W-40 5L + filtre", "Vidange + vidange boîte", "Huile GPLi spécifique 4L"]
  const pneusDetails = ["2× 195/65 R15", "2× 185/65 R15", "1× 205/55 R16", "4× 175/65 R14 (reconstruction)", "2× 225/45 R17"]
  const diagDetails = ["Lecture défauts moteur (P0401)", "Pré-contrôle technique", "Diagnostic boîte + ABS", "Batterie & alternateur", "Diagnostic climatisation"]
  for (let i = 0; i < 500; i++) {
    const hubId = activeHubs[iRange(0, activeHubs.length - 1)].id
    // véhicule lié au même hub (cohérence) → puiser dans le pool du hub
    const hubVehicles = vehicles.filter(v => v.hubId === hubId)
    const v = hubVehicles[iRange(0, hubVehicles.length - 1)]
    const type = rnd() < 0.5 ? "VIDANGE" : rnd() < 0.5 ? "PNEUS" : "DIAGNOSTIC"
    const price = type === "VIDANGE" ? r1(85 * (0.9 + rnd() * 0.4)) : type === "PNEUS" ? r1(165 * (0.8 + rnd() * 1.6)) : r1(60 * (0.85 + rnd() * 0.4))
    interventions.push({
      hubId,
      vehicleId: v.plate, // remplacé par l'id réel après createManyAndReturn (voir 9bis)
      serviceType: type,
      detail: type === "VIDANGE" ? vidangeDetails[iRange(0, vidangeDetails.length - 1)] : type === "PNEUS" ? pneusDetails[iRange(0, pneusDetails.length - 1)] : diagDetails[iRange(0, diagDetails.length - 1)],
      priceDt: price,
      durationMin: type === "VIDANGE" ? 45 : type === "PNEUS" ? 30 : 40,
      createdAt: daysAgo(iRange(0, 180)),
    })
  }

  // 9bis) véhicules par id réel
  const vehicleRows = await db.hubVehicle.findMany({ select: { id: true, plate: true, hubId: true } })
  const byPlate = new Map(vehicleRows.map(v => [v.plate, v.id]))
  for (const it of interventions) it.vehicleId = byPlate.get(it.vehicleId) ?? it.vehicleId
  await db.hubIntervention.createMany({ data: interventions })
  console.log(`✅ HubIntervention ×${interventions.length}`)

  // 10) Conversions TMP → station (~120, 38 % converties)
  const stations = await db.station.findMany({ select: { code: true, name: true }, take: 60 })
  const conversions: { vehicleId: string; hubId: string; stationCode: string | null; detail: string; status: string; valueDt: number; createdAt: Date }[] = []
  const convDetails = ["Réparation lourde — embrayage", "Réparation lourde — distribution", "Carrosserie après accident", "Climatisation complète", "Freinage complet + disques", "GPL : mise en conformité cuve", "Suspension + amortisseurs", "Boîte de vitesses"]
  const convTargets = vehicles.filter(v => v.lastVisit !== null)
  for (let i = 0; i < 120; i++) {
    const v = convTargets[iRange(0, convTargets.length - 1)]
    const r = rnd()
    const status = r < 0.38 ? "CONVERTI" : r < 0.85 ? "ORIENTE" : "PERDU"
    const stationCode = stations.length ? stations[iRange(0, stations.length - 1)].code : null
    conversions.push({
      vehicleId: byPlate.get(v.plate)!,
      hubId: v.hubId,
      stationCode: status === "CONVERTI" ? stationCode : null,
      detail: convDetails[iRange(0, convDetails.length - 1)],
      status,
      valueDt: status === "CONVERTI" ? iRange(180, 1900) : 0,
      createdAt: daysAgo(iRange(0, 180)),
    })
  }
  await db.hubConversion.createMany({ data: conversions })
  console.log(`✅ HubConversion ×${conversions.length} (${conversions.filter(c => c.status === "CONVERTI").length} converties)`)

  console.log("\n🌱 Seed T55 terminé — Radar & Hubs prêts.")
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
