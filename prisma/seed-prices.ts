// Seed one-shot : observatoire des prix du carburant — décrets nationaux
// tunisiens (prix pompe + marge détaillant réglementée) 2021 → 2026.
// En Tunisie, les prix sont fixés par décret ministériel, identiques sur tout
// le territoire ; les révisions suivent grossièrement le pétrole et le dinar.
// Exécution : bun prisma/seed-prices.ts
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

// [date d'application, prix pompe (millimes/L), marge détaillant (millimes/L), note]
type Decree = [string, number, number, string?]

const ESSENCE: Decree[] = [
  ["2021-01-01", 2275, 125, "Maintien — pétrole bas"],
  ["2021-07-01", 2325, 125, "Légère hausse cours"],
  ["2022-02-01", 2375, 130, "Hausse cours + fret"],
  ["2022-09-01", 2425, 130, "Révision trimestrielle"],
  ["2023-03-01", 2475, 135, "Révision budget État"],
  ["2023-10-01", 2525, 135, "Alignement importations"],
  ["2024-04-01", 2525, 135, "Maintien — subvention"],
  ["2025-01-01", 2575, 140, "Révision annuelle"],
  ["2025-08-01", 2625, 140, "Hausse brent + dinar"],
  ["2026-03-01", 2625, 140, "Maintien"],
  ["2026-09-01", 2650, 145, "Révision septembre"],
]

const GAZOLE: Decree[] = [
  ["2021-01-01", 1560, 95],
  ["2021-07-01", 1600, 95],
  ["2022-02-01", 1640, 100],
  ["2022-09-01", 1680, 100],
  ["2023-03-01", 1710, 105],
  ["2023-10-01", 1750, 105],
  ["2024-04-01", 1780, 105],
  ["2025-01-01", 1810, 110],
  ["2025-08-01", 1840, 110],
  ["2026-03-01", 1860, 110],
  ["2026-09-01", 1885, 115, "Révision septembre"],
]

// GPL : prix au kg (bouteille/marché) — suivi indicatif.
const GPL: Decree[] = [
  ["2021-01-01", 680, 60],
  ["2022-02-01", 700, 60],
  ["2023-03-01", 730, 65],
  ["2024-04-01", 750, 65],
  ["2025-08-01", 770, 70],
  ["2026-09-01", 780, 70],
]

async function main() {
  await db.fuelPrice.deleteMany()

  const rows: {
    fuelType: string; priceMillimes: number; marginMillimes: number
    effectiveAt: Date; decreeNote: string | null
  }[] = []

  const SERIES: [string, Decree[]][] = [
    ["ESSENCE", ESSENCE],
    ["GAZOLE", GAZOLE],
    ["GPL", GPL],
  ]
  for (const [fuelType, decrees] of SERIES) {
    for (const [date, price, margin, note] of decrees) {
      rows.push({
        fuelType,
        priceMillimes: price,
        marginMillimes: margin,
        effectiveAt: new Date(`${date}T00:00:00.000Z`),
        decreeNote: note ?? "Révision périodique",
      })
    }
  }

  await db.fuelPrice.createMany({ data: rows })
  console.log(`Décrets prix créés : ${rows.length}`)
  for (const [fuelType, decrees] of SERIES) {
    const last = decrees[decrees.length - 1]
    console.log(`  ${fuelType}: ${decrees.length} décrets, dernier = ${last[1]} millimes (${last[0]})`)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
