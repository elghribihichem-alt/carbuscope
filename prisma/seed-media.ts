// CarbuScope — Module « Média / Panneaux urbains » (T60) : seed du jeu de
// données d'exemple exigé par la spécification — 10 panneaux urbains répartis
// entre Tunis (4), Sfax (3) et Sousse (3), 20 faces décrites (2 par panneau),
// 3 propriétaires physiques (régie / commune / privé + un « réseau enseigne »),
// groupes d'enseignes, règles de visibilité (PUBLIQUE / GRANULAIRE / EXCLUSIVE),
// périmètres géographiques de membres, paramétrage moteur, une simulation
// brouillon + une simulation envoyée (résultats du moteur).
// Les décomptes concurrentiels (stations propriétaire/concurrentes dans le
// rayon, panneaux dans 1 km, part de voix) sont CALCCULÉS sur les vraies
// stations de la base — cohérents avec le reste de la plateforme.
// Génération déterministe (PRNG mulberry32 à graine fixe). Idempotent.
// Exécution : bun prisma/seed-media.ts

import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

const DAY = 86_400_000
const NOW = Date.now()

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20261005)
const ri = (min: number, max: number) => Math.floor(min + rnd() * (max - min + 1))
const rf = (min: number, max: number) => Math.round((min + rnd() * (max - min)) * 10) / 10

/** Distance haversine en km. */
function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const photo = (code: string, angle: string, mode: string) => ({
  url: `https://picsum.photos/seed/${code}-${angle}-${mode}/640/420`,
  angle,
  mode,
})

// ---------- Propriétaires ----------
const OWNERS = [
  { code: "OWN-REG-01", name: "Régie Média Tunisie", type: "REGIE", contact: "Nabil Chaabani", phone: "+216 71 555 001", email: "contact@regie-media.tn", brandSlug: null },
  { code: "OWN-COM-01", name: "Commune de Tunis — Affichage urbain", type: "COMMUNE", contact: "Service des autorisations", phone: "+216 71 555 002", email: "affichage@commune-tunis.tn", brandSlug: null },
  { code: "OWN-PRV-01", name: "Affichages Privés Sousse", type: "PRIVE", contact: "Hédi Mabrouk", phone: "+216 73 555 003", email: "hedi@affichages-sousse.tn", brandSlug: null },
  { code: "OWN-NET-01", name: "TotalEnergies Média (réseau enseigne)", type: "PRIVE", contact: "Direction communication", phone: "+216 71 555 004", email: "media@totalenergies.tn", brandSlug: "totalenergies" },
]

// ---------- Panneaux (10) ----------
const PANELS = [
  // Tunis — 4
  {
    code: "PAN-TUN-001", name: "Avenue Habib Bourguiba — Centre", owner: "OWN-REG-01",
    supportType: "MUR", format: "4x3", technology: "BACKLIGHT", widthCm: 400, heightCm: 300, heightAboveGroundM: 4.5,
    illumination: "PROJETEE", lat: 36.7985, lng: 10.181, governorat: "Tunis", delegation: "Tunis", ville: "Tunis", rue: "Av. Habib Bourguiba",
    authorizationRef: "AUT-TUN-2024-118", authorizationStart: new Date("2024-03-01"), authorizationEnd: new Date("2030-03-01"), status: "ACTIF",
    base: { tmja: 38_000, prixSemaine: 1_450 },
  },
  {
    code: "PAN-TUN-002", name: "Rond-point El Menzah VI", owner: "OWN-REG-01",
    supportType: "GRAND_FORMAT", format: "8x4", technology: "LED", widthCm: 800, heightCm: 400, heightAboveGroundM: 9,
    illumination: "LED", lat: 36.848, lng: 10.159, governorat: "Ariana", delegation: "El Menzah", ville: "Tunis", rue: "Rond-point Menzah VI",
    authorizationRef: "AUT-ARI-2023-076", authorizationStart: new Date("2023-07-01"), authorizationEnd: new Date("2026-12-31"), status: "ACTIF",
    base: { tmja: 42_500, prixSemaine: 3_800 },
  },
  {
    code: "PAN-TUN-003", name: "Route X2 — La Marsa / Gammarth", owner: "OWN-COM-01",
    supportType: "PANNEAU_SOL", format: "4x3", technology: "PAPIER", widthCm: 400, heightCm: 300, heightAboveGroundM: 3.5,
    illumination: "AUCUNE", lat: 36.87, lng: 10.28, governorat: "Ariana", delegation: "La Marsa", ville: "La Marsa", rue: "Route X2",
    authorizationRef: "AUT-ARI-2025-044", authorizationStart: new Date("2025-01-01"), authorizationEnd: new Date("2031-01-01"), status: "ACTIF",
    base: { tmja: 21_000, prixSemaine: 720 },
  },
  {
    code: "PAN-TUN-004", name: "Avenue de la Liberté — Abribus", owner: "OWN-REG-01",
    supportType: "ABRIBUS", format: "ABRIBUS_2M2", technology: "PAPIER", widthCm: 120, heightCm: 175, heightAboveGroundM: 1.2,
    illumination: "AUCUNE", lat: 36.806, lng: 10.1802, governorat: "Tunis", delegation: "Tunis", ville: "Tunis", rue: "Av. de la Liberté",
    authorizationRef: "AUT-TUN-2022-205", authorizationStart: new Date("2022-09-01"), authorizationEnd: new Date("2027-08-31"), status: "ACTIF",
    base: { tmja: 17_500, prixSemaine: 340 },
  },
  // Sfax — 3
  {
    code: "PAN-SFX-001", name: "Route de Gremda — Entrée Sfax", owner: "OWN-COM-01",
    supportType: "GRAND_FORMAT", format: "8x4", technology: "PAPIER", widthCm: 800, heightCm: 400, heightAboveGroundM: 8,
    illumination: "FRONTALE", lat: 34.88, lng: 10.79, governorat: "Sfax", delegation: "Sfax", ville: "Sfax", rue: "Route de Gremda RN1",
    authorizationRef: "AUT-SFX-2024-012", authorizationStart: new Date("2024-02-01"), authorizationEnd: new Date("2030-02-01"), status: "ACTIF",
    base: { tmja: 26_400, prixSemaine: 1_680 },
  },
  {
    code: "PAN-SFX-002", name: "Avenue Bourguiba — Sfax centre", owner: "OWN-NET-01",
    supportType: "MUR", format: "4x3", technology: "BACKLIGHT", widthCm: 400, heightCm: 300, heightAboveGroundM: 4,
    illumination: "PROJETEE", lat: 34.741, lng: 10.761, governorat: "Sfax", delegation: "Sfax", ville: "Sfax", rue: "Av. Habib Bourguiba",
    authorizationRef: "AUT-SFX-2025-009", authorizationStart: new Date("2025-04-01"), authorizationEnd: new Date("2032-04-01"), status: "ACTIF",
    base: { tmja: 31_200, prixSemaine: 1_240 },
  },
  {
    code: "PAN-SFX-003", name: "Rond-point Bir Chhifa", owner: "OWN-PRV-01",
    supportType: "GRAND_FORMAT", format: "12x4", technology: "LED", widthCm: 1200, heightCm: 400, heightAboveGroundM: 11,
    illumination: "LED", lat: 34.81, lng: 10.83, governorat: "Sfax", delegation: "Sakiet Ezzit", ville: "Sfax", rue: "Rond-point Bir Chhifa",
    authorizationRef: "AUT-SFX-2023-051", authorizationStart: new Date("2023-11-01"), authorizationEnd: new Date(NOW + 22 * DAY), status: "ACTIF", // expire < 30 j → alerte SA
    base: { tmja: 33_800, prixSemaine: 4_400 },
  },
  // Sousse — 3
  {
    code: "PAN-SOS-001", name: "Route de Tunis Km 3 — Sousse", owner: "OWN-REG-01",
    supportType: "GRAND_FORMAT", format: "8x4", technology: "PAPIER", widthCm: 800, heightCm: 400, heightAboveGroundM: 7.5,
    illumination: "FRONTALE", lat: 35.831, lng: 10.641, governorat: "Sousse", delegation: "Sousse", ville: "Sousse", rue: "Route de Tunis RN1",
    authorizationRef: "AUT-SOS-2024-033", authorizationStart: new Date("2024-06-01"), authorizationEnd: new Date("2029-06-01"), status: "ACTIF",
    base: { tmja: 28_900, prixSemaine: 1_750 },
  },
  {
    code: "PAN-SOS-002", name: "Avenue Bourguiba — Sousse centre", owner: "OWN-COM-01",
    supportType: "MUR", format: "4x3", technology: "BACKLIGHT", widthCm: 400, heightCm: 300, heightAboveGroundM: 4.2,
    illumination: "PROJETEE", lat: 35.8252, lng: 10.6415, governorat: "Sousse", delegation: "Sousse", ville: "Sousse", rue: "Av. Habib Bourguiba",
    authorizationRef: "AUT-SOS-2025-017", authorizationStart: new Date("2025-05-01"), authorizationEnd: new Date("2031-05-01"), status: "ACTIF",
    base: { tmja: 24_700, prixSemaine: 1_320 },
  },
  {
    code: "PAN-SOS-003", name: "Port El Kantaoui — Entrée", owner: "OWN-PRV-01",
    supportType: "COLONNE", format: "COLONNE_L16", technology: "PAPIER", widthCm: 120, heightCm: 170, heightAboveGroundM: 2.8,
    illumination: "AUCUNE", lat: 35.845, lng: 10.6, governorat: "Sousse", delegation: "Hammam Sousse", ville: "Kantaoui", rue: "Entrée Port El Kantaoui",
    authorizationRef: "AUT-SOS-2024-058", authorizationStart: new Date("2024-08-01"), authorizationEnd: new Date("2028-08-01"), status: "MAINTENANCE",
    base: { tmja: 14_800, prixSemaine: 480 },
  },
]

const ORIENTATIONS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"]
const CSP = ["Cadres supérieurs", "Professions intermédiaires", "Employés", "Commerçants", "Artisans", "Ouvriers"]
const PROFILS = ["Urbain mixte", "Cadre résidentiel", "Passage touristique", "Familial résidentiel", "Etudiant / jeune actif", "Zoned'activité mixte".replace("Zone", "Zone ")]
const POI_TYPES = ["CENTRE_COMMERCIAL", "HOPITAL", "ECOLE", "UNIVERSITE", "MARCHE", "ZONE_INDUSTRIELLE", "STADE"]

async function main() {
  console.log("→ Seed module Média (T60)…")

  // Nettoyage idempotent (l'audit est conservé : journal en ajout seul)
  await db.mediaShareLink.deleteMany()
  await db.mediaSimulation.deleteMany()
  await db.mediaSavedFilter.deleteMany()
  await db.mediaMemberSetting.deleteMany()
  await db.mediaBrandGroup.deleteMany()
  await db.mediaEngineSetting.deleteMany()
  await db.mediaFace.deleteMany()
  await db.mediaPanel.deleteMany()
  await db.mediaOwner.deleteMany()

  // ---------- Référentiels ----------
  const ownerIds: Record<string, string> = {}
  for (const o of OWNERS) {
    const created = await db.mediaOwner.create({ data: o })
    ownerIds[o.code] = created.id
  }

  await db.mediaBrandGroup.createMany({
    data: [
      { name: "Groupe Premium", brandSlugs: ["totalenergies", "shell"] },
      { name: "Groupe Indépendants TN", brandSlugs: ["ola", "staroil", "independants"] },
    ],
  })

  // Coefficients de saisonnalité par gouvernorat (12 mois, janvier → décembre)
  const saison: Record<string, number[]> = {
    Tunis: [1.0, 1.0, 1.18, 1.1, 1.05, 1.02, 1.0, 0.95, 1.05, 1.08, 1.12, 1.2], // pointe Ramadan (mars 2026) + décembre
    Ariana: [1.0, 1.0, 1.18, 1.1, 1.05, 1.02, 1.0, 0.95, 1.05, 1.08, 1.12, 1.2],
    Sfax: [1.0, 0.98, 1.15, 1.05, 1.0, 1.0, 1.05, 1.0, 1.0, 1.05, 1.08, 1.12],
    Sousse: [0.95, 0.95, 1.12, 1.05, 1.08, 1.15, 1.3, 1.35, 1.2, 1.05, 0.98, 1.0], // zone touristique : été +35 %
  }
  await db.mediaEngineSetting.createMany({
    data: [
      { key: "SAISONNALITE", value: saison },
      { key: "CHEVAUCHEMENT", value: { facteurSupplementaire: 0.12, croissanceJournaliere: 0.08, plafondUnicite: 3.5 } },
      { key: "COUT", value: { cpmReference: 1.4, margePlateforme: 0.1 } },
    ],
  })

  // ---------- Stations réelles (proximité) ----------
  const stations = await db.station.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, lat: true, lng: true, brand: { select: { slug: true } } },
  })

  // ---------- Panneaux + faces ----------
  const panelIds: Record<string, string> = {}
  const facesByPanel: Record<string, { id: string; code: string; odv: number }[]> = {}
  for (const p of PANELS) {
    const ownerId = ownerIds[p.owner]
    const photos = [
      photo(p.code, "FACE", "JOUR"),
      photo(p.code, "3/4", "JOUR"),
      photo(p.code, "FACE", "NUIT"),
    ]
    const panel = await db.mediaPanel.create({
      data: {
        code: p.code, name: p.name, ownerId,
        mediaType: "URBAIN", supportType: p.supportType, format: p.format, technology: p.technology,
        widthCm: p.widthCm, heightCm: p.heightCm, heightAboveGroundM: p.heightAboveGroundM,
        illumination: p.illumination, lat: p.lat, lng: p.lng,
        governorat: p.governorat, delegation: p.delegation, ville: p.ville, rue: p.rue,
        photos, status: p.status,
        authorizationRef: p.authorizationRef, authorizationStart: p.authorizationStart, authorizationEnd: p.authorizationEnd,
      },
    })
    panelIds[p.code] = panel.id

    // Décomptes concurrentiels sur les vraies stations (rayon 1 km)
    let prop = 0, conc = 0
    for (const s of stations) {
      if (distKm(p.lat, p.lng, s.lat, s.lng) <= 1.0) {
        const ownerBrand = OWNERS.find(o => o.code === p.owner)?.brandSlug
        if (ownerBrand && s.brand?.slug === ownerBrand) prop++
        else conc++
      }
    }

    // 2 faces par panneau (A / B) — le « vrai produit commercial »
    for (const suffix of ["A", "B"] as const) {
      const code = `${p.code}-${suffix}`
      const isA = suffix === "A"
      const odv = Math.round(p.base.tmja * (isA ? 0.92 : 0.74))
      const audience = Math.round(odv * 0.66)
      const visMin = p.supportType === "ABRIBUS" || p.supportType === "COLONNE" ? 15 : 60
      const visMax = p.supportType === "GRAND_FORMAT" ? 220 : p.supportType === "ABRIBUS" ? 40 : 120
      const partPL = rf(4, 9), partTaxis = rf(2, 5), part2r = rf(3, 7)
      await db.mediaFace.create({
        data: {
          panelId: panel.id, code,
          orientation: ORIENTATIONS[ri(0, 7)],
          sensLecture: rnd() > 0.5 ? "GAUCHE_DROITE" : "DROITE_GAUCHE",
          visibiliteMinM: visMin, visibiliteMaxM: visMax,
          angleMortDeg: rnd() > 0.7 ? rf(5, 18) : null,
          obstacles: rnd() > 0.75 ? "Panneau de signalisation partiellement masquant" : null,
          tempsLectureS: rf(3.5, 7.5),
          tmja: p.base.tmja,
          traficHeurePointe: Math.round(p.base.tmja * 0.09),
          repartitionSens: isA ? "55/45" : "45/55",
          partDeuxRoues: part2r, partVL: Math.round((100 - partPL - partTaxis - part2r) * 10) / 10, partPL, partTaxis,
          vitesseReglementaire: p.supportType === "ABRIBUS" ? 50 : 70,
          vitesseReelle: rf(28, 58), indiceCongestion: rf(35, 85),
          audienceJournaliere: audience,
          audienceMensuelle: audience * 30,
          odvJournalieres: odv, odvMensuelles: odv * 30,
          profilDemographique: PROFILS[ri(0, 5)], cspDominante: CSP[ri(0, 5)],
          partResidents: rf(38, 72), partPassants: 0,
          stationsProprietaireRayon: prop,
          stationsConcurrentesRayon: conc,
          panneauxRayon1km: 0, // recalculé ci-dessous
          partDeVoix: 0, // recalculée ci-dessous
          pois: [
            { type: POI_TYPES[ri(0, 6)], nom: "POI " + code, distanceM: ri(120, 900) },
            { type: POI_TYPES[ri(0, 6)], nom: "POI bis " + code, distanceM: ri(150, 1200) },
          ],
          prixSemaine: p.base.prixSemaine * (isA ? 1 : 0.88),
          prixMois: Math.round(p.base.prixSemaine * 4.2 * (isA ? 1 : 0.88)),
          prixTrimestre: Math.round(p.base.prixSemaine * 4.2 * 3 * 0.95 * (isA ? 1 : 0.88)),
          prixSemestre: Math.round(p.base.prixSemaine * 4.2 * 6 * 0.9 * (isA ? 1 : 0.88)),
          prixAnnee: Math.round(p.base.prixSemaine * 4.2 * 12 * 0.85 * (isA ? 1 : 0.88)),
          remiseVolumeMax: rf(5, 15),
          tauxOccupation12m: rf(52, 91),
          dateDerniereCampagne: new Date(NOW - ri(20, 320) * DAY),
          clientsActuels: rnd() > 0.5 ? ["Banque Amen", "Orange TN"] : rnd() > 0.5 ? ["Ste Générale"] : [],
          contraintesMunicipales: rnd() > 0.7 ? "Hauteur limitée à 12 m, habillage obligatoire pendant les travaux" : null,
          zonesInterdites: rnd() > 0.6 ? ["ALCOOL", "TABAC"] : ["POLITIQUE"],
          alcoolAutorise: rnd() > 0.75,
          procedureReservation: "Réservation via la régie — délai minimum 10 jours ouvrés avant pose.",
          // Permissions par défaut : PUBLIQUE (restituées ensuite par scénario)
          visibilityMode: "PUBLIQUE",
          allowedBrandSlugs: [], excludedBrandSlugs: [], allowedGroups: [], allowedZones: [],
          status: rnd() > 0.3 ? "DISPONIBLE" : "OCCUPEE",
        },
      })
      facesByPanel[p.code] = [...(facesByPanel[p.code] ?? []), { id: "", code, odv }]
    }
  }

  // Recalcul des faces par panneau → ids réels + panneaux 1 km + part de voix
  const allFaces = await db.mediaFace.findMany({
    select: { id: true, code: true, odvJournalieres: true, panel: { select: { lat: true, lng: true, code: true } } },
  })
  const faceById = new Map(allFaces.map(f => [f.id, f]))
  const panelCoord = new Map(PANELS.map(p => [p.code, { lat: p.lat, lng: p.lng }]))
  for (const f of allFaces) {
    const me = panelCoord.get(f.panel.code)!
    let panelsNear = 0
    let odvZone = f.odvJournalieres
    for (const other of PANELS) {
      if (other.code === f.panel.code) continue
      const oc = panelCoord.get(other.code)!
      if (distKm(me.lat, me.lng, oc.lat, oc.lng) <= 1.0) {
        panelsNear++
        odvZone += allFaces.find(x => x.panel.code === other.code && x.code.endsWith("A"))?.odvJournalieres ?? 0
      }
    }
    const sov = Math.round((f.odvJournalieres / Math.max(odvZone, 1)) * 1000) / 10
    await db.mediaFace.update({ where: { id: f.id }, data: { panneauxRayon1km: panelsNear, partDeVoix: Math.min(sov, 100) } })
    const entry = facesByPanel[f.panel.code]?.find(x => x.code === f.code)
    if (entry) entry.id = f.id
  }
  // partPassants cohérente (100 - partResidents)
  await db.$executeRawUnsafe(`UPDATE MediaFace SET partPassants = CAST(100 - partResidents AS REAL)`)

  // ---------- Scénarios de permissions (couche 2) ----------
  // EXCLUSIVE : PAN-TUN-001-B réservée à Agil ; PAN-SOS-002-A réservée à TotalEnergies
  await db.mediaFace.update({ where: { code: "PAN-TUN-001-B" }, data: { visibilityMode: "EXCLUSIVE", exclusiveBrandSlug: "agil" } })
  await db.mediaFace.update({ where: { code: "PAN-SOS-002-A" }, data: { visibilityMode: "EXCLUSIVE", exclusiveBrandSlug: "totalenergies" } })
  // GRANULAIRE : combinaisons couvrant listes / exclusions / groupes / zones / conditions
  await db.mediaFace.update({
    where: { code: "PAN-TUN-002-B" },
    data: { visibilityMode: "GRANULAIRE", allowedBrandSlugs: ["agil", "totalenergies"], excludedBrandSlugs: ["shell"], allowedGroups: [], allowedZones: [] },
  })
  await db.mediaFace.update({
    where: { code: "PAN-SFX-001-A" },
    data: { visibilityMode: "GRANULAIRE", allowedGroups: ["Groupe Premium"], allowedZones: [] },
  })
  await db.mediaFace.update({
    where: { code: "PAN-SOS-001-B" },
    data: { visibilityMode: "GRANULAIRE", allowedZones: ["Sousse", "Monastir"], visibilityConditions: { ancienneteMinMois: 6, budgetMin: 0, typesEnseignes: [] } },
  })
  await db.mediaFace.update({
    where: { code: "PAN-TUN-004-A" },
    data: { visibilityMode: "GRANULAIRE", allowedBrandSlugs: ["agil"] },
  })

  // ---------- Périmètres géographiques de membres (couche 3) ----------
  const users = await db.user.findMany({ select: { id: true, email: true } })
  const uid = (email: string) => users.find(u => u.email === email)?.id
  const defaultWeights = { audience: 0.35, trafic: 0.25, prix: 0.2, partDeVoix: 0.2 }
  const memberSeeds: { email: string; perimeterType: string; perimeterValue: unknown }[] = [
    { email: "sonia.beji@agil.tn", perimeterType: "TOUT", perimeterValue: {} },
    { email: "reseau@agil.tn", perimeterType: "GOUVERNORATS", perimeterValue: { gouvernorats: ["Tunis", "Ariana"] } }, // hors Sfax/Sousse
    { email: "observateur@agil.tn", perimeterType: "RAYON", perimeterValue: { lat: 36.8, lng: 10.18, rayonKm: 6 } },
    { email: "tarek.mabrouk@agil.tn", perimeterType: "TOUT", perimeterValue: {} },
    { email: "karim.trabelsi@shell.tn", perimeterType: "TOUT", perimeterValue: {} },
    { email: "leila.mansour@totalenergies.tn", perimeterType: "TOUT", perimeterValue: {} },
    { email: "rania.feki@carbuscope.tn", perimeterType: "TOUT", perimeterValue: {} },
  ]
  for (const m of memberSeeds) {
    const id = uid(m.email)
    if (!id) continue
    await db.mediaMemberSetting.create({
      data: { userId: id, perimeterType: m.perimeterType, perimeterValue: m.perimeterValue as object, scoreWeights: defaultWeights, favoriteColumns: [], branding: {} },
    })
  }

  // ---------- Simulations d'exemple (Agil) ----------
  const faceIdByCode = new Map(allFaces.map(f => [f.code, f.id]))
  const pick = (code: string) => faceIdByCode.get(code)!
  const dStart = new Date(NOW + 14 * DAY)
  const dEnd = new Date(NOW + 14 * DAY + 27 * DAY)
  await db.mediaSimulation.create({
    data: {
      brandSlug: "agil", authorEmail: "sonia.beji@agil.tn",
      name: "Campagne rentrée — Grand Tunis", client: "Agil Marketing",
      dateStart: dStart, dateEnd: dEnd, currentStep: 2, status: "BROUILLON",
      selections: [
        { faceId: pick("PAN-TUN-001-A"), prixUnitaire: 1_450, remise: 0 },
        { faceId: pick("PAN-TUN-002-A"), prixUnitaire: 3_800, remise: 5 },
        { faceId: pick("PAN-TUN-004-A"), prixUnitaire: 340, remise: 0 },
      ],
      params: { remiseGlobale: 0, saisonnalite: true },
    },
  })
  await db.mediaSimulation.create({
    data: {
      brandSlug: "agil", authorEmail: "sonia.beji@agil.tn",
      name: "Sponsoring Férias Sousse (envoyée)", client: "Direction régionale Sousse",
      dateStart: new Date(NOW - 40 * DAY), dateEnd: new Date(NOW - 12 * DAY), currentStep: 5, status: "ENVOYEE",
      selections: [
        { faceId: pick("PAN-SOS-001-A"), prixUnitaire: 1_750, remise: 8 },
        { faceId: pick("PAN-SOS-003-A"), prixUnitaire: 480, remise: 0 },
      ],
      params: { remiseGlobale: 5, saisonnalite: true },
    },
  })

  const counts = {
    owners: await db.mediaOwner.count(),
    panels: await db.mediaPanel.count(),
    faces: await db.mediaFace.count(),
    granulaire: await db.mediaFace.count({ where: { visibilityMode: "GRANULAIRE" } }),
    exclusive: await db.mediaFace.count({ where: { visibilityMode: "EXCLUSIVE" } }),
    groups: await db.mediaBrandGroup.count(),
    engine: await db.mediaEngineSetting.count(),
    members: await db.mediaMemberSetting.count(),
    sims: await db.mediaSimulation.count(),
  }
  console.log("✓ Seed média terminé :", JSON.stringify(counts))
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
