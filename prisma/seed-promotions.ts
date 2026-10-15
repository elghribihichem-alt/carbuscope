// Seed one-shot T62-b : campagnes promotionnelles persistées serveur (C.2.3).
// Remplace les 2 promotions « démo » de l'état local du composant par de
// vraies lignes Promotion en base, avec un cycle de vie réaliste :
//   · Agil (QA personas Sonia Beji / Tarek Mabrouk) : 5 campagnes couvrant
//     tous les statuts dérivés + suspendue + archivée (filtres T61 non vides) ;
//   · Autres enseignes : 2 campagnes chacune (1 en cours, 1 planifiée).
// Idempotent : deleteMany({}) avant createMany (rejouable).
// Exécution : bun prisma/seed-promotions.ts
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

const NATIONAL = "National (toutes zones)"

const isoDay = (offsetDays: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

type SeedPromo = {
  nom: string
  brandSlug: string
  debut: string
  fin: string
  zone: string
  reduction: number
  suspendue?: boolean
  archivee?: boolean
}

const promos: SeedPromo[] = [
  // ---- Agil : cycle de vie complet (tous les filtres de statut alimentés) ----
  {
    nom: "Plein à prix coûtant — Rentrée scolaire",
    brandSlug: "agil",
    debut: isoDay(-8),
    fin: isoDay(7),
    zone: NATIONAL,
    reduction: 5,
  },
  {
    nom: "Lavage offert dès 40 L d'essence",
    brandSlug: "agil",
    debut: isoDay(12),
    fin: isoDay(26),
    zone: "Sfax",
    reduction: 10,
  },
  {
    nom: "Double points fidélité — Ramadan",
    brandSlug: "agil",
    debut: isoDay(-75),
    fin: isoDay(-45),
    zone: "Grand Tunis",
    reduction: 15,
  },
  {
    nom: "Offre test — Carte prépayée (suspendue)",
    brandSlug: "agil",
    debut: isoDay(-5),
    fin: isoDay(20),
    zone: "Sousse",
    reduction: 8,
    suspendue: true, // décision enseigne : hors diffusion temporaire
  },
  {
    nom: "Vidange à moitié prix (2019, archivée)",
    brandSlug: "agil",
    debut: isoDay(-2100),
    fin: isoDay(-2070),
    zone: "Nabeul",
    reduction: 50,
    archivee: true, // sortie du pilotage actif, conservée pour l'historique
  },
  // ---- Autres enseignes (1 en cours + 1 planifiée) ----
  {
    nom: "Totalenergies — 5 % sur le gazole PL",
    brandSlug: "totalenergies",
    debut: isoDay(-3),
    fin: isoDay(11),
    zone: NATIONAL,
    reduction: 5,
  },
  {
    nom: "Totalenergies — Jerrican offert dès 50 L",
    brandSlug: "totalenergies",
    debut: isoDay(20),
    fin: isoDay(34),
    zone: "Bizerte",
    reduction: 7,
  },
  {
    nom: "Staroil — Essence −3 % week-end",
    brandSlug: "staroil",
    debut: isoDay(-2),
    fin: isoDay(5),
    zone: "Sfax",
    reduction: 3,
  },
  {
    nom: "Staroil — Café offert dès 30 L",
    brandSlug: "staroil",
    debut: isoDay(9),
    fin: isoDay(23),
    zone: "Monastir",
    reduction: 6,
  },
  {
    nom: "Shell — Points V-Power ×2",
    brandSlug: "shell",
    debut: isoDay(-10),
    fin: isoDay(4),
    zone: NATIONAL,
    reduction: 12,
  },
  {
    nom: "Shell — Lubrifiant offert (planifiée)",
    brandSlug: "shell",
    debut: isoDay(15),
    fin: isoDay(29),
    zone: "Ariana",
    reduction: 9,
  },
  {
    nom: "Ola Energy — Gazole −4 % agriculteurs",
    brandSlug: "ola",
    debut: isoDay(-6),
    fin: isoDay(9),
    zone: "Kairouan",
    reduction: 4,
  },
  {
    nom: "Ola Energy — Grattage gagnant à coup sûr",
    brandSlug: "ola",
    debut: isoDay(18),
    fin: isoDay(32),
    zone: NATIONAL,
    reduction: 10,
  },
]

async function main() {
  await db.promotion.deleteMany({})
  const r = await db.promotion.createMany({
    data: promos.map(p => ({
      nom: p.nom,
      brandSlug: p.brandSlug,
      debut: new Date(p.debut),
      fin: new Date(p.fin),
      zone: p.zone,
      reduction: p.reduction,
      suspendue: p.suspendue ?? false,
      archivee: p.archivee ?? false,
    })),
  })
  console.log(`✔ Seed promotions : ${r.count} campagnes créées (${promos.filter(p => p.brandSlug === "agil").length} Agil, ${promos.filter(p => p.brandSlug === "totalenergies").length} Totalenergies, ${promos.filter(p => p.brandSlug === "staroil").length} Staroil, ${promos.filter(p => p.brandSlug === "shell").length} Shell, ${promos.filter(p => p.brandSlug === "ola").length} Ola).`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
