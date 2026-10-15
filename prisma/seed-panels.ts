// Seed one-shot T63-b : registre des PANNEAUX PUBLICITAIRES (module Publicité
// du Portail enseigne — choix d'emplacements média). ~46 faces réelles
// plausibles : autoroutes (A1/A4/P7/P9), grands axes urbains, entrées de
// ville, abords de stations-service. 5 formats, 6 régies, flux/visibilité/
// tarifs hebdomadaires différenciés. Statuts : majoritairement DISPONIBLE,
// quelques LOUE (engagés par des tiers) et RESERVE (une par enseigne active,
// dont 1 pour Agil — persona QA Sonia Beji : état « Réservé par nous »).
// Idempotent : deleteMany({}) avant createMany. Exécution : bun prisma/seed-panels.ts
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

type SeedPanel = {
  code: string
  nom: string
  format: string
  gouvernorat: string
  delegation: string
  axe: string
  flux: number
  visibilite: number
  illumination?: boolean
  prixSemaine: number
  loueur: string
  statut?: string
  reservePar?: string
}

const R1 = "Régie Média Tunisie"
const R2 = "African Media Group"
const R3 = "PubliContact"
const R4 = "MédiaPlus Affichage"
const R5 = "Régie Nationale d'Affichage"
const R6 = "EclairScreens DOOH"

const panels: SeedPanel[] = [
  // ---------------- GRAND TUNIS (Tunis / Ariana / Ben Arous) ----------------
  { code: "PAN-TU-001", nom: "A1 Tunis — Km 6 face nord (échangeur Oued Ellil)", format: "12x8", gouvernorat: "Tunis", delegation: "Tunis", axe: "Autoroute A1 Tunis-Sfax", flux: 32000, visibilite: 94, illumination: true, prixSemaine: 890, loueur: R1 },
  { code: "PAN-TU-002", nom: "Avenue Habib Bourguiba — angle Rue de Marseille", format: "dohh", gouvernorat: "Tunis", delegation: "Tunis", axe: "Avenue Habib Bourguiba", flux: 18500, visibilite: 88, illumination: true, prixSemaine: 1240, loueur: R6 },
  { code: "PAN-TU-003", nom: "Place de Barcelone — face station-service Agil", format: "4x3", gouvernorat: "Tunis", delegation: "Tunis", axe: "Boulevard Bab Bhar", flux: 12100, visibilite: 76, prixSemaine: 285, loueur: R3 },
  { code: "PAN-TU-004", nom: "Route de La Goulette — Km 3 (entrée port de plaisance)", format: "12x8", gouvernorat: "Tunis", delegation: "La Goulette", axe: "Route GO1", flux: 21000, visibilite: 82, illumination: true, prixSemaine: 640, loueur: R2 },
  { code: "PAN-TU-005", nom: "Menzah VI — rond-point Entrée nord", format: "dohh", gouvernorat: "Tunis", delegation: "El Menzah", axe: "Avenue Hédi Nouira", flux: 9600, visibilite: 71, illumination: true, prixSemaine: 780, loueur: R6 },
  { code: "PAN-TU-006", nom: "Bab Souika — carrefour Avenue de la Liberté", format: "4x3", gouvernorat: "Tunis", delegation: "Bab Souika", axe: "Avenue de la Liberté", flux: 14300, visibilite: 69, prixSemaine: 310, loueur: R3 },
  { code: "PAN-TU-007", nom: "Avenue Mohamed Ali — face ANP", format: "abri", gouvernorat: "Tunis", delegation: "Tunis", axe: "Avenue Mohamed Ali", flux: 5400, visibilite: 58, prixSemaine: 95, loueur: R4 },
  { code: "PAN-TU-008", nom: "Station Agil A1 Km 12 — totem double face", format: "totem", gouvernorat: "Tunis", delegation: "Djebel Oust", axe: "Autoroute A1", flux: 8600, visibilite: 90, prixSemaine: 180, loueur: R1, statut: "RESERVE", reservePar: "agil" },
  { code: "PAN-AR-001", nom: "Ariana — Carrefour Ennassim (face hypermarché)", format: "dohh", gouvernorat: "Ariana", delegation: "Ariana", axe: "Route Régionale 55", flux: 15800, visibilite: 85, illumination: true, prixSemaine: 1050, loueur: R6 },
  { code: "PAN-AR-002", nom: "La Petite Ariane — angle Avenue Bourguiba", format: "4x3", gouvernorat: "Ariana", delegation: "Ettadhamen", axe: "Avenue Habib Bourguiba", flux: 9200, visibilite: 63, prixSemaine: 195, loueur: R4 },
  { code: "PAN-AR-003", nom: "P7 La Marsa-Gammarth — Km 4 face plage", format: "12x8", gouvernorat: "Ariana", delegation: "La Marsa", axe: "Route P7", flux: 17500, visibilite: 91, illumination: true, prixSemaine: 720, loueur: R2 },
  { code: "PAN-AR-004", nom: "Raoued — entrée zone industrielle", format: "4x3", gouvernorat: "Ariana", delegation: "Raoued", axe: "Route de Raoued", flux: 6800, visibilite: 60, prixSemaine: 165, loueur: R3 },
  { code: "PAN-BA-001", nom: "Mégrine — carrefour Ben Arous (face Totalenergies)", format: "12x8", gouvernorat: "Ben Arous", delegation: "Mégrine", axe: "Route Nationale 3", flux: 19800, visibilite: 87, illumination: true, prixSemaine: 690, loueur: R1 },
  { code: "PAN-BA-002", nom: "Radès — Avenue Habib Thameur (entrée port)", format: "4x3", gouvernorat: "Ben Arous", delegation: "Radès", axe: "Avenue Habib Thameur", flux: 11400, visibilite: 72, prixSemaine: 240, loueur: R4 },
  { code: "PAN-BA-003", nom: "Ezzahra — front de mer (face corniche)", format: "abri", gouvernorat: "Ben Arous", delegation: "Ezzahra", axe: "Corniche d'Ezzahra", flux: 3900, visibilite: 55, prixSemaine: 85, loueur: R3 },
  { code: "PAN-BA-004", nom: "A4 Tunis-Bizerte — Km 9 (zone Fouchana)", format: "12x8", gouvernorat: "Ben Arous", delegation: "Fouchana", axe: "Autoroute A4", flux: 26500, visibilite: 93, illumination: true, prixSemaine: 810, loueur: R2, statut: "LOUE", reservePar: "shell" },
  // ---------------- CAP BON & NORD-EST ----------------
  { code: "PAN-BZ-001", nom: "Bizerte — Avenue Habib Bourguiba (centre)", format: "dohh", gouvernorat: "Bizerte", delegation: "Bizerte", axe: "Avenue Habib Bourguiba", flux: 10200, visibilite: 79, illumination: true, prixSemaine: 660, loueur: R6 },
  { code: "PAN-BZ-002", nom: "A4 Bizerte — Km 38 (entrée ville, face zone franche)", format: "12x8", gouvernorat: "Bizerte", delegation: "Bizerte", axe: "Autoroute A4", flux: 22400, visibilite: 90, illumination: true, prixSemaine: 760, loueur: R1 },
  { code: "PAN-NA-001", nom: "Nabeul — corniche (face port de plaisance)", format: "4x3", gouvernorat: "Nabeul", delegation: "Nabeul", axe: "Corniche de Nabeul", flux: 8700, visibilite: 74, prixSemaine: 210, loueur: R3 },
  { code: "PAN-NA-002", nom: "Hammamet — entrée sud (carrefour Yasmine)", format: "12x8", gouvernorat: "Nabeul", delegation: "Hammamet", axe: "Route P1", flux: 15900, visibilite: 86, illumination: true, prixSemaine: 590, loueur: R2, statut: "LOUE", reservePar: "totalenergies" },
  { code: "PAN-NA-003", nom: "Korba — avenue de la République", format: "abri", gouvernorat: "Nabeul", delegation: "Korba", axe: "Avenue de la République", flux: 4100, visibilite: 52, prixSemaine: 78, loueur: R4 },
  { code: "PAN-ZA-001", nom: "A1 Zaghouan — Km 42 (face sud, zone de service)", format: "12x8", gouvernorat: "Zaghouan", delegation: "Zaghouan", axe: "Autoroute A1", flux: 24800, visibilite: 95, illumination: true, prixSemaine: 860, loueur: R1 },
  { code: "PAN-ZA-002", nom: "Zaghouan ville — entrée ouest", format: "4x3", gouvernorat: "Zaghouan", delegation: "Zaghouan", axe: "Route de Thala", flux: 5200, visibilite: 61, prixSemaine: 125, loueur: R5 },
  // ---------------- SAHEL (Sousse / Monastir / Mahdia) ----------------
  { code: "PAN-SO-001", nom: "Sousse — route de la Corniche (face El Kantaoui)", format: "12x8", gouvernorat: "Sousse", delegation: "Sousse", axe: "Route P1 El Kantaoui", flux: 18900, visibilite: 89, illumination: true, prixSemaine: 670, loueur: R2 },
  { code: "PAN-SO-002", nom: "Sousse médina — Avenue Farhat Hached", format: "dohh", gouvernorat: "Sousse", delegation: "Sousse", axe: "Avenue Farhat Hached", flux: 13500, visibilite: 80, illumination: true, prixSemaine: 890, loueur: R6 },
  { code: "PAN-SO-003", nom: "Sahline — zone industrielle (entrée A1)", format: "4x3", gouvernorat: "Sousse", delegation: "Sahline", axe: "Route de Sahline", flux: 7600, visibilite: 64, prixSemaine: 155, loueur: R3 },
  { code: "PAN-SO-004", nom: "Sousse — Avenue Habib Maazoun (gare)", format: "abri", gouvernorat: "Sousse", delegation: "Sousse", axe: "Avenue Habib Maazoun", flux: 4900, visibilite: 57, prixSemaine: 92, loueur: R4, statut: "RESERVE", reservePar: "olaenergy" },
  { code: "PAN-MO-001", nom: "Monastir — avenue Habib Bourguiba (aéroport)", format: "dohh", gouvernorat: "Monastir", delegation: "Monastir", axe: "Avenue Habib Bourguiba", flux: 12800, visibilite: 83, illumination: true, prixSemaine: 940, loueur: R6 },
  { code: "PAN-MO-002", nom: "Skanès — front de mer (face hôtels)", format: "4x3", gouvernorat: "Monastir", delegation: "Skanès", axe: "Route de Skanès", flux: 9300, visibilite: 77, prixSemaine: 230, loueur: R3 },
  { code: "PAN-MO-003", nom: "Jemmal — carrefour route Mahdia", format: "4x3", gouvernorat: "Monastir", delegation: "Jemmal", axe: "Route C97", flux: 6100, visibilite: 59, prixSemaine: 135, loueur: R4 },
  { code: "PAN-MA-001", nom: "Mahdia — corniche nord (entrée de ville)", format: "4x3", gouvernorat: "Mahdia", delegation: "Mahdia", axe: "Corniche de Mahdia", flux: 5800, visibilite: 66, prixSemaine: 140, loueur: R5 },
  { code: "PAN-MA-002", nom: "Sousse-Mahdia — Km 24 (zone de services)", format: "totem", gouvernorat: "Mahdia", delegation: "Ouled Chamekh", axe: "Route P1", flux: 5300, visibilite: 70, prixSemaine: 110, loueur: R1 },
  // ---------------- SFAX & SUD-EST ----------------
  { code: "PAN-SF-001", nom: "Sfax — route de Gremda (face zone industrielle)", format: "12x8", gouvernorat: "Sfax", delegation: "Sfax", axe: "Route de Gremda", flux: 17600, visibilite: 88, illumination: true, prixSemaine: 620, loueur: R1 },
  { code: "PAN-SF-002", nom: "Sfax — Avenue Bourguiba (Thyna, entrée sud)", format: "dohh", gouvernorat: "Sfax", delegation: "Sfax", axe: "Avenue Habib Bourguiba", flux: 15200, visibilite: 81, illumination: true, prixSemaine: 820, loueur: R6 },
  { code: "PAN-SF-003", nom: "Sfax — port (carrefour Sakiet Ezzit)", format: "4x3", gouvernorat: "Sfax", delegation: "Sakiet Ezzit", axe: "Route de Sakiet", flux: 10400, visibilite: 68, prixSemaine: 205, loueur: R3 },
  { code: "PAN-SF-004", nom: "Sfax — Avenue de la République (médina)", format: "abri", gouvernorat: "Sfax", delegation: "Sfax", axe: "Avenue de la République", flux: 6200, visibilite: 54, prixSemaine: 88, loueur: R4 },
  { code: "PAN-SF-005", nom: "Station Agil Sfax-Sidi Mansour — totem", format: "totem", gouvernorat: "Sfax", delegation: "Sidi Mansour", axe: "Route de Sidi Mansour", flux: 4200, visibilite: 84, prixSemaine: 95, loueur: R1 },
  { code: "PAN-GB-001", nom: "Gabès — entrée nord (route de Medenine)", format: "12x8", gouvernorat: "Gabès", delegation: "Gabès", axe: "Route P2", flux: 9700, visibilite: 78, illumination: true, prixSemaine: 380, loueur: R5 },
  { code: "PAN-MD-001", nom: "Djerba — entrée Midoun (zone touristique)", format: "dohh", gouvernorat: "Médenine", delegation: "Midoun", axe: "Route de Midoun", flux: 11800, visibilite: 85, illumination: true, prixSemaine: 720, loueur: R6, statut: "LOUE", reservePar: "statoil" },
  { code: "PAN-MD-002", nom: "Médenine — avenue de l'Indépendance", format: "4x3", gouvernorat: "Médenine", delegation: "Médenine", axe: "Avenue de l'Indépendance", flux: 5600, visibilite: 62, prixSemaine: 118, loueur: R5 },
  { code: "PAN-TZ-001", nom: "Tozeur — entrée ville (face palmeraie)", format: "4x3", gouvernorat: "Tozeur", delegation: "Tozeur", axe: "Route de Nefta", flux: 3800, visibilite: 65, prixSemaine: 105, loueur: R5 },
  { code: "PAN-GF-001", nom: "Gafsa — carrefour Rif (entrée est)", format: "12x8", gouvernorat: "Gafsa", delegation: "Gafsa", axe: "Route P15", flux: 8100, visibilite: 75, prixSemaine: 340, loueur: R2 },
  { code: "PAN-KS-001", nom: "Kairouan — entrée A1 (route de Sousse)", format: "12x8", gouvernorat: "Kairouan", delegation: "Kairouan", axe: "Route C33", flux: 11600, visibilite: 80, prixSemaine: 410, loueur: R1 },
  { code: "PAN-KS-002", nom: "Kairouan — Avenue des Martyrs (centre)", format: "abri", gouvernorat: "Kairouan", delegation: "Kairouan", axe: "Avenue des Martyrs", flux: 4600, visibilite: 53, prixSemaine: 76, loueur: R4 },
  // ---------------- NORD-OUEST & CENTRE-OUEST ----------------
  { code: "PAN-JE-001", nom: "Jendouba — avenue Habib Bourguiba (gare)", format: "4x3", gouvernorat: "Jendouba", delegation: "Jendouba", axe: "Avenue Habib Bourguiba", flux: 5900, visibilite: 60, prixSemaine: 122, loueur: R5 },
  { code: "PAN-KE-001", nom: "Le Kef — place de l'Indépendance (entrée ville)", format: "4x3", gouvernorat: "Le Kef", delegation: "Le Kef", axe: "Avenue de l'Indépendance", flux: 4700, visibilite: 58, prixSemaine: 112, loueur: R5 },
  { code: "PAN-SI-001", nom: "Siliana — carrefour route du Bargou", format: "totem", gouvernorat: "Siliana", delegation: "Siliana", axe: "Route de Bargou", flux: 3300, visibilite: 66, prixSemaine: 82, loueur: R1 },
  { code: "PAN-SB-001", nom: "Sidi Bouzid — entrée sud (route de Regueb)", format: "4x3", gouvernorat: "Sidi Bouzid", delegation: "Sidi Bouzid", axe: "Route P13", flux: 6400, visibilite: 67, prixSemaine: 128, loueur: R5 },
]

async function main() {
  console.log(`Seed AdPanel : ${panels.length} panneaux…`)
  await db.adPanel.deleteMany({})
  const r = await db.adPanel.createMany({
    data: panels.map(p => ({
      code: p.code,
      nom: p.nom,
      format: p.format,
      gouvernorat: p.gouvernorat,
      delegation: p.delegation,
      axe: p.axe,
      flux: p.flux,
      visibilite: p.visibilite,
      illumination: p.illumination ?? false,
      prixSemaine: p.prixSemaine,
      loueur: p.loueur,
      statut: p.statut ?? "DISPONIBLE",
      reservePar: p.statut === "RESERVE" || p.statut === "LOUE" ? p.reservePar ?? null : null,
    })),
  })
  console.log(`✔ ${r.count} panneaux insérés (formats : ${[...new Set(panels.map(p => p.format))].join(", ")})`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
