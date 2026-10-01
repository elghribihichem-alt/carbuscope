// CarbuScope — Module « Opportunity Radar » (T54-A1) : seed du socle de données
// du Module 1. 24 gouvernorats pour le pouvoir d'achat (indice 0-100 + PIB et
// revenu estimés en DT, badge « est. ») et l'indicateur foncier (DT/m²,
// disponibilité, pression urbaine — l'intérieur plus disponible, le Grand
// Tunis sous pression), le kit d'implantation franchise (12 pièces FR :
// statuts, DABEM/APII, business plan, manuel d'exploitation, formation
// sécurité…), 14 candidatures crédibles (majoritairement enseigne « agil »)
// et 6 contrats « FR-2025-00x ». La table ZoneAlert reste VIDE : elle est
// remplie dynamiquement par le moteur de scoring (round B2).
// Idempotent : upsert pour les référentiels uniques, deleteMany + create
// pour les candidatures (les contrats référencent les ids recréés).
// Exécution : bunx tsx prisma/seed-opportunity.ts

import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

// ---- Référentiel des 24 gouvernorats (noms exacts du référentiel INS) ----

/** [gouvernorat, indice 0-100, PIB/hab./an estimé (DT), revenu mensuel estimé (DT)]
 *  Estimation V1 (badge « est. ») — hiérarchie réaliste : Grand Tunis en tête,
 *  littoral est-c Nord suivant, intérieur et Sud entre 38 et 59. */
const PURCHASING: [string, number, number, number][] = [
  ["Tunis", 95, 16800, 1850],
  ["Ariana", 92, 15900, 1780],
  ["Ben Arous", 88, 14800, 1720],
  ["Sfax", 82, 13200, 1650],
  ["Sousse", 78, 12600, 1590],
  ["Monastir", 78, 12700, 1580],
  ["Nabeul", 75, 11800, 1540],
  ["Bizerte", 72, 11300, 1490],
  ["Manouba", 68, 10200, 1430],
  ["Gabès", 59, 9600, 1340],
  ["Médenine", 57, 9400, 1320],
  ["Mahdia", 56, 9200, 1310],
  ["Zaghouan", 54, 9000, 1280],
  ["Kairouan", 52, 8200, 1250],
  ["Gafsa", 51, 8900, 1290],
  ["Béja", 50, 8400, 1220],
  ["Tozeur", 48, 8300, 1240],
  ["Kébili", 47, 8500, 1260],
  ["Siliana", 46, 7900, 1190],
  ["Le Kef", 45, 7700, 1180],
  ["Jendouba", 44, 7800, 1170],
  ["Tataouine", 42, 8000, 1150],
  ["Kasserine", 40, 7600, 1120],
  ["Sidi Bouzid", 38, 7400, 1100],
]

/** [gouvernorat, prix du m² estimé (DT), disponibilité 0-100, pression urbaine 0-100]
 *  Foncier réaliste : Tunis > 1 200 DT/m², Grand Tunis 640-880, littoral
 *  480-720, intérieur 110-240 — disponibilité inverse de la pression. */
const LAND: [string, number, number, number][] = [
  ["Tunis", 1450, 22, 95],
  ["Ariana", 880, 28, 90],
  ["Ben Arous", 780, 30, 87],
  ["Monastir", 720, 36, 80],
  ["Nabeul", 700, 38, 75],
  ["Sousse", 680, 40, 78],
  ["Manouba", 640, 45, 68],
  ["Sfax", 620, 40, 76],
  ["Bizerte", 550, 42, 70],
  ["Mahdia", 480, 50, 60],
  ["Kairouan", 240, 62, 45],
  ["Gabès", 220, 66, 42],
  ["Zaghouan", 210, 68, 38],
  ["Béja", 190, 70, 40],
  ["Médenine", 190, 70, 34],
  ["Jendouba", 160, 74, 35],
  ["Gafsa", 160, 72, 36],
  ["Le Kef", 150, 75, 33],
  ["Siliana", 145, 76, 32],
  ["Tozeur", 140, 78, 30],
  ["Kasserine", 130, 78, 30],
  ["Kébili", 130, 80, 26],
  ["Sidi Bouzid", 120, 80, 28],
  ["Tataouine", 110, 82, 24],
]

// ---- Kit d'implantation franchise (12 pièces, ordre de la checklist) ----

const KIT: {
  category: string
  title: string
  description: string
  order: number
  mandatory: boolean
}[] = [
  { category: "JURIDIQUE", title: "Statuts de la société & registre de commerce", description: "Choix de la forme juridique (SUARL/SARL), rédaction des statuts, immatriculation au RNE et publication légale.", order: 1, mandatory: true },
  { category: "JURIDIQUE", title: "Dossier d'agrément DABEM / APII", description: "Constitution du dossier d'investissement, dépôt et suivi de l'agrément auprès de l'APII et de la DABEM (avantages fiscaux).", order: 2, mandatory: true },
  { category: "JURIDIQUE", title: "Bail foncier & permis de bâtir", description: "Compromis de location longue durée (9 ans minimum), permis de construire et conformité urbanistique du site.", order: 3, mandatory: true },
  { category: "FINANCIER", title: "Business plan financier 5 ans", description: "Compte de résultat prévisionnel, plan de trésorerie, seuil de rentabilité et taux de rendement interne.", order: 4, mandatory: true },
  { category: "FINANCIER", title: "Plan de financement bancaire", description: "Montage du crédit d'équipement (TMM + marge), apport personnel et lettre de caution de l'enseigne.", order: 5, mandatory: true },
  { category: "FINANCIER", title: "Garantie financière d'exploitation", description: "Attestation de solvabilité couvrant six mois de charges d'exploitation (stock, salaires, loyer).", order: 6, mandatory: false },
  { category: "TECHNIQUE", title: "Cahier des charges technique de la station", description: "Implantation, cuves et pompes conforme NT, séparateurs d'hydrocarbures, signalétique de l'enseigne et normes incendie.", order: 7, mandatory: true },
  { category: "TECHNIQUE", title: "Manuel d'exploitation de l'enseigne", description: "Procédures quotidiennes : réception du carburant, inventaires, hygiène, sécurité et clôture de caisse.", order: 8, mandatory: true },
  { category: "TECHNIQUE", title: "Étude environnementale du site", description: "Étude d'impact, bassins de rétention des hydrocarbures, gestion des eaux usées et des déchets d'atelier.", order: 9, mandatory: true },
  { category: "FORMATION", title: "Formation sécurité & attestation incendie", description: "Manipulation des hydrocarbures, extincteurs, gestes de premiers secours — attestation de la protection civile.", order: 10, mandatory: true },
  { category: "FORMATION", title: "Formation commerciale & caisse", description: "Accueil client, programme de fidélisation, encaissement, rapprochement bancaire et gestion des écarts de caisse.", order: 11, mandatory: true },
  { category: "FORMATION", title: "Certificat de gestion de point de vente", description: "Module de management d'équipe et de pilotage des marges, évalué par l'enseigne (recommandé, non bloquant).", order: 12, mandatory: false },
]

// ---- Candidatures (14 — 10 « agil », 4 « staroil », statuts variés) ----

type CandidateSeed = {
  brandSlug: string
  fullName: string
  email: string
  phone: string
  gouvernorat: string
  delegation: string | null
  city: string | null
  experience: string
  investmentRange: string
  status: string
  notes: string | null
}

const CANDIDATES: CandidateSeed[] = [
  { brandSlug: "agil", fullName: "Mohamed Ali Trabelsi", email: "mohamedali.trabelsi@gmail.com", phone: "+216 98 214 507", gouvernorat: "Tunis", delegation: "La Marsa", city: "La Marsa", experience: "STATION", investmentRange: "1M_2M", status: "INTERVIEW", notes: "Ancien gérant de station indépendante à La Marsa — connaît le métier et le terrain." },
  { brandSlug: "agil", fullName: "Samir Ben Amor", email: "samir.benamor@topnet.tn", phone: "+216 96 330 118", gouvernorat: "Sfax", delegation: "Sfax Ville", city: "Sfax", experience: "RETAIL", investmentRange: "500K_1M", status: "CONTACTED", notes: "Commerçant en matériaux de construction, cherche une reconversion vers la distribution pétrolière." },
  { brandSlug: "agil", fullName: "Leïla Chaabane", email: "leila.chaabane@gmail.com", phone: "+216 22 451 903", gouvernorat: "Nabeul", delegation: "Hammamet", city: "Hammamet Sud", experience: "NONE", investmentRange: "500K_1M", status: "NEW", notes: null },
  { brandSlug: "agil", fullName: "Karim Maalej", email: "karim.maalej@gmail.com", phone: "+216 97 685 240", gouvernorat: "Sousse", delegation: "Sousse Riadh", city: "Sousse", experience: "RETAIL", investmentRange: "1M_2M", status: "APPROVED", notes: "Dossier complet, apport 1,2 MDT — contrat actif FR-2025-001 (station Sousse Kantaoui)." },
  { brandSlug: "agil", fullName: "Hichem Bouazizi", email: "hichem.bouazizi@yahoo.fr", phone: "+216 26 118 334", gouvernorat: "Kairouan", delegation: "Kairouan Nord", city: "Kairouan", experience: "OTHER", investmentRange: "<500K", status: "REJECTED", notes: "Apport insuffisant pour le format demandé (station classique) — orienté format compact." },
  { brandSlug: "agil", fullName: "Rania Mansouri", email: "rania.mansouri@gmail.com", phone: "+216 93 540 276", gouvernorat: "Monastir", delegation: "Monastir", city: "Monastir", experience: "STATION", investmentRange: ">2M", status: "INTERVIEW", notes: "Exploite déjà deux stations-services familiales dans le Sahel — très bon profil." },
  { brandSlug: "agil", fullName: "Youssef Hamdi", email: "youssef.hamdi@gmail.com", phone: "+216 95 210 664", gouvernorat: "Bizerte", delegation: "Menzel Bourguiba", city: "Menzel Bourguiba", experience: "NONE", investmentRange: "500K_1M", status: "NEW", notes: null },
  { brandSlug: "agil", fullName: "Mounir Ayari", email: "mounir.ayari@planet.tn", phone: "+216 98 774 012", gouvernorat: "Gabès", delegation: "Gabès Médina", city: "Gabès", experience: "RETAIL", investmentRange: "500K_1M", status: "CONTACTED", notes: "Proposition envoyée — awaiting retour banque pour le plan de financement." },
  { brandSlug: "agil", fullName: "Sonia Belhaj", email: "sonia.belhaj@gmail.com", phone: "+216 20 663 481", gouvernorat: "Médenine", delegation: "Djerba - Midoun", city: "Midoun", experience: "STATION", investmentRange: "1M_2M", status: "APPROVED", notes: "Site identifié sur l'axe touristique de Midoun — contrat actif FR-2025-002." },
  { brandSlug: "agil", fullName: "Walid Zorgati", email: "walid.zorgati@gmail.com", phone: "+216 52 190 007", gouvernorat: "Béja", delegation: "Béja Nord", city: "Béja", experience: "NONE", investmentRange: "<500K", status: "NEW", notes: null },
  { brandSlug: "staroil", fullName: "Fethi Gharbi", email: "fethi.gharbi@gmail.com", phone: "+216 98 100 455", gouvernorat: "Sfax", delegation: "Thyna", city: "Thyna", experience: "STATION", investmentRange: "1M_2M", status: "INTERVIEW", notes: "Gérant d'une station concurrente de la zone industrielle de Thyna." },
  { brandSlug: "staroil", fullName: "Nadia Jaziri", email: "nadia.jaziri@gmail.com", phone: "+216 24 870 310", gouvernorat: "Tunis", delegation: "El Menzah", city: "Tunis", experience: "RETAIL", investmentRange: "1M_2M", status: "APPROVED", notes: "Cadre bancaire en reconversion — contrat signé FR-2025-005 (El Menzah)." },
  { brandSlug: "staroil", fullName: "Slim Kefi", email: "slim.kefi@yahoo.fr", phone: "+216 29 455 208", gouvernorat: "Mahdia", delegation: "Mahdia", city: "Mahdia", experience: "OTHER", investmentRange: "500K_1M", status: "REJECTED", notes: "Contrat FR-2025-006 résilié (non-respect du cahier des charges) — re-candidature non retenue." },
  { brandSlug: "staroil", fullName: "Amel Dridi", email: "amel.dridi@gmail.com", phone: "+216 92 310 649", gouvernorat: "Sidi Bouzid", delegation: "Sidi Bouzid Est", city: "Sidi Bouzid", experience: "NONE", investmentRange: "<500K", status: "NEW", notes: null },
]

// ---- Contrats (6 — références FR-2025-00x, statuts et conditions variés) ----

type ContractSeed = {
  candidateName: string
  brandSlug: string
  reference: string
  status: string
  royaltyPct: number
  entryFee: number
  durationYears: number
  signedAt: string | null
  createdAt: string
}

const CONTRACTS: ContractSeed[] = [
  { candidateName: "Karim Maalej", brandSlug: "agil", reference: "FR-2025-001", status: "ACTIVE", royaltyPct: 3, entryFee: 180000, durationYears: 5, signedAt: "2025-02-14", createdAt: "2025-01-28" },
  { candidateName: "Sonia Belhaj", brandSlug: "agil", reference: "FR-2025-002", status: "ACTIVE", royaltyPct: 3.5, entryFee: 220000, durationYears: 7, signedAt: "2025-03-27", createdAt: "2025-03-03" },
  { candidateName: "Mounir Ayari", brandSlug: "agil", reference: "FR-2025-003", status: "SENT", royaltyPct: 2.8, entryFee: 95000, durationYears: 5, signedAt: null, createdAt: "2025-05-06" },
  { candidateName: "Mohamed Ali Trabelsi", brandSlug: "agil", reference: "FR-2025-004", status: "DRAFT", royaltyPct: 3, entryFee: 150000, durationYears: 5, signedAt: null, createdAt: "2025-06-10" },
  { candidateName: "Nadia Jaziri", brandSlug: "staroil", reference: "FR-2025-005", status: "SIGNED", royaltyPct: 4, entryFee: 250000, durationYears: 8, signedAt: "2025-01-10", createdAt: "2024-12-15" },
  { candidateName: "Slim Kefi", brandSlug: "staroil", reference: "FR-2025-006", status: "TERMINATED", royaltyPct: 2.5, entryFee: 60000, durationYears: 5, signedAt: "2024-11-05", createdAt: "2024-10-18" },
]

async function main() {
  console.log("🛰️  Seed « Opportunity Radar » (T54-A1) — démarrage…")

  // 0) ZoneAlert : volontairement vide (remplie dynamiquement par le moteur de
  // scoring au round B2) — on s'assure juste qu'elle est propre.
  await db.zoneAlert.deleteMany()
  console.log("   ZoneAlert vidée (0 ligne — remplissage dynamique en B2)")

  // 1) Configuration du moteur de scoring : singleton « default », poids des
  // 5 critères (parc 30 / pouvoir d'achat 20 / trafic 25 / concurrence 15 /
  // foncier 10 = 100) + seuils zone blanche (35) et alerte (70).
  await db.opportunityConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      weightParc: 30,
      weightPurchasing: 20,
      weightTrafic: 25,
      weightConcurrence: 15,
      weightFoncier: 10,
      zoneBlancheThreshold: 35,
      alertThreshold: 70,
      updatedBy: null,
    },
    update: {
      weightParc: 30,
      weightPurchasing: 20,
      weightTrafic: 25,
      weightConcurrence: 15,
      weightFoncier: 10,
      zoneBlancheThreshold: 35,
      alertThreshold: 70,
    },
  })
  console.log("   OpportunityConfig : singleton « default » (poids 30+20+25+15+10 = 100, seuils 35 / 70)")

  // 2) Pouvoir d'achat — 24 gouvernorats (upsert par gouvernorat).
  await db.purchasingPower.deleteMany()
  for (const [gov, index, gdp, income] of PURCHASING) {
    await db.purchasingPower.upsert({
      where: { gouvernorat: gov },
      create: { gouvernorat: gov, index, gdpPerCapita: gdp, avgIncome: income, estimated: true },
      update: { index, gdpPerCapita: gdp, avgIncome: income, estimated: true },
    })
  }
  console.log(`   PurchasingPower : ${PURCHASING.length} gouvernorats (Tunis 95 · Sidi Bouzid 38, tous « est. »)`)

  // 3) Indicateur foncier — 24 gouvernorats (upsert par gouvernorat).
  await db.landIndicator.deleteMany()
  for (const [gov, price, availability, pressure] of LAND) {
    await db.landIndicator.upsert({
      where: { gouvernorat: gov },
      create: { gouvernorat: gov, pricePerM2: price, availability, urbanPressure: pressure, estimated: true },
      update: { pricePerM2: price, availability, urbanPressure: pressure, estimated: true },
    })
  }
  console.log(`   LandIndicator : ${LAND.length} gouvernorats (Tunis 1 450 DT/m² · Tataouine 110 DT/m², tous « est. »)`)

  // 4) Kit d'implantation — 12 pièces (référentiel sans clé unique : reset).
  await db.franchiseKitItem.deleteMany()
  for (const item of KIT) {
    await db.franchiseKitItem.create({ data: item })
  }
  const byCat = KIT.reduce<Record<string, number>>((acc, k) => {
    acc[k.category] = (acc[k.category] ?? 0) + 1
    return acc
  }, {})
  console.log(`   FranchiseKitItem : ${KIT.length} pièces (${Object.entries(byCat).map(([c, n]) => `${c} ${n}`).join(" · ")})`)

  // 5) Candidatures — les contrats référencent les candidats : on supprime
  // d'abord les contrats, puis les candidats, avant de recréer l'ensemble.
  await db.franchiseContract.deleteMany()
  await db.franchiseCandidate.deleteMany()
  const idByname = new Map<string, string>()
  for (const c of CANDIDATES) {
    const created = await db.franchiseCandidate.create({
      data: {
        brandSlug: c.brandSlug,
        fullName: c.fullName,
        email: c.email,
        phone: c.phone,
        gouvernorat: c.gouvernorat,
        delegation: c.delegation,
        city: c.city,
        experience: c.experience,
        investmentRange: c.investmentRange,
        status: c.status,
        notes: c.notes,
      },
    })
    idByname.set(c.fullName, created.id)
  }
  const statuses = CANDIDATES.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1
    return acc
  }, {})
  console.log(`   FranchiseCandidate : ${CANDIDATES.length} candidatures (agil ${CANDIDATES.filter(c => c.brandSlug === "agil").length} · staroil ${CANDIDATES.filter(c => c.brandSlug === "staroil").length}) — ${Object.entries(statuses).map(([s, n]) => `${s} ${n}`).join(" · ")}`)

  // 6) Contrats — références FR-2025-00x liées aux candidats recréés.
  for (const k of CONTRACTS) {
    const candidateId = idByname.get(k.candidateName)
    if (!candidateId) throw new Error(`Candidat introuvable pour le contrat ${k.reference} : ${k.candidateName}`)
    await db.franchiseContract.upsert({
      where: { reference: k.reference },
      create: {
        candidateId,
        brandSlug: k.brandSlug,
        reference: k.reference,
        status: k.status,
        royaltyPct: k.royaltyPct,
        entryFee: k.entryFee,
        durationYears: k.durationYears,
        signedAt: k.signedAt ? new Date(k.signedAt) : null,
        createdAt: new Date(k.createdAt),
      },
      update: {
        candidateId,
        brandSlug: k.brandSlug,
        status: k.status,
        royaltyPct: k.royaltyPct,
        entryFee: k.entryFee,
        durationYears: k.durationYears,
        signedAt: k.signedAt ? new Date(k.signedAt) : null,
      },
    })
  }
  console.log(`   FranchiseContract : ${CONTRACTS.length} contrats (${CONTRACTS.map(k => `${k.reference} ${k.status}`).join(" · ")})`)

  // Synthèse finale.
  const counts = {
    purchasing: await db.purchasingPower.count(),
    land: await db.landIndicator.count(),
    kit: await db.franchiseKitItem.count(),
    candidates: await db.franchiseCandidate.count(),
    contracts: await db.franchiseContract.count(),
    zoneAlerts: await db.zoneAlert.count(),
  }
  console.log("✅ Seed « Opportunity Radar » terminé —")
  console.log(`   PurchasingPower ${counts.purchasing} · LandIndicator ${counts.land} · FranchiseKitItem ${counts.kit} · FranchiseCandidate ${counts.candidates} · FranchiseContract ${counts.contracts} · ZoneAlert ${counts.zoneAlerts} (vide, par conception)`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
