// CarbuScope — T55-a — GET /api/radar/cites : scoring par CITÉ (3ᵉ niveau du
// Radar d'opportunités). Route STRICTEMENT ADDITIVE : /api/radar/scoring
// (gelée T54-B2) n'est pas touchée — même convention d'ouverture en lecture
// (données de démonstration, aucune écriture), les poids viennent
// d'OpportunityConfig via la lib partagée ../_lib.
//
//   · GET /api/radar/cites
//       → { cites: Top 150 par score, total, coveredGouvernorats, weights,
//           raw (entrées cités — recalcul what-if côté client, même moteur
//           partagé que « engine » de /api/radar/scoring), generatedAt }
//   · GET /api/radar/cites?gouvernorat=X&delegation=Y (drill-down du Sheet
//     détail gouvernorat : sous-tableau cités d'une délégation)
//       → { cites: cités du trio demandé (tri score décroissant), total,
//           generatedAt }
//   · GET /api/radar/cites?gouvernorat=X (toutes les cités d'un gouvernorat)
//   · delegation sans gouvernorat → 400 FR.
//
// Parc réel = somme des 5 catégories DemographicCite ; critères non-parc
// répartis au prorata de la population intra-délégation (badge « est. ») ;
// parcPerHabitant = véh./1 000 hab. Lecture seule : AUCUNE écriture en base.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { loadConfig, loadScoringInputs } from "../_lib"
import { coveredGouvernorats, scoreCites, type CiteInput } from "@/lib/radar/cites"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const gouvernorat = req.nextUrl.searchParams.get("gouvernorat")?.trim() || null
  const delegation = req.nextUrl.searchParams.get("delegation")?.trim() || null

  if (delegation && !gouvernorat) {
    return NextResponse.json(
      { error: "Le paramètre « delegation » doit être accompagné du paramètre « gouvernorat »." },
      { status: 400 },
    )
  }

  const [config, inputs, citeRows] = await Promise.all([
    loadConfig(),
    loadScoringInputs(),
    db.demographicCite.findMany({
      select: {
        gouvernorat: true,
        delegation: true,
        cite: true,
        population: true,
        vehiclesLight: true,
        vehiclesUtility: true,
        vehiclesHeavy: true,
        vehiclesBuses: true,
        vehiclesMotorcycles: true,
        source: true,
      },
      orderBy: [{ gouvernorat: "asc" }, { delegation: "asc" }, { cite: "asc" }],
    }),
  ])

  // Parc réel = somme des 5 catégories (null si aucune renseignée — estimation
  // défensive dans le moteur, jamais déclenchée avec l'INS 2024).
  const raw: CiteInput[] = citeRows.map(r => ({
    gouvernorat: r.gouvernorat,
    delegation: r.delegation,
    cite: r.cite,
    population: r.population,
    parc:
      r.vehiclesLight == null &&
      r.vehiclesUtility == null &&
      r.vehiclesHeavy == null &&
      r.vehiclesBuses == null &&
      r.vehiclesMotorcycles == null
        ? null
        : (r.vehiclesLight ?? 0) +
          (r.vehiclesUtility ?? 0) +
          (r.vehiclesHeavy ?? 0) +
          (r.vehiclesBuses ?? 0) +
          (r.vehiclesMotorcycles ?? 0),
    source: r.source,
  }))

  const all = scoreCites(inputs, raw, config.weights)

  // Drill-down : cités d'un gouvernorat (+ délégation si précisée), tri score
  // décroissant — rang NATIONAL conservé (référence de classement).
  if (gouvernorat) {
    const filtered = all.filter(
      c => c.gouvernorat === gouvernorat && (delegation == null || c.delegation === delegation),
    )
    return NextResponse.json({
      cites: filtered,
      total: filtered.length,
      generatedAt: new Date().toISOString(),
    })
  }

  // Vue « Top 150 » : classement national par score décroissant.
  return NextResponse.json({
    cites: all.slice(0, 150),
    total: all.length,
    coveredGouvernorats: coveredGouvernorats(raw),
    weights: config.weights,
    // Entrées brutes (515) : le volet client recalcule les scores avec le
    // même moteur pur (simulations what-if instantanées) — miroir du champ
    // « engine » de /api/radar/scoring.
    raw,
    generatedAt: new Date().toISOString(),
  })
}
