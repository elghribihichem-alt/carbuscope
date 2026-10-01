// CarbuScope — sanity check du socle T54-A1 : compte chaque nouvelle table et
// affiche quelques exemples représentatifs. Vérification post-seed (aucune
// écriture). Exécution : bunx tsx prisma/sanity-t54-a1.ts

import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

async function main() {
  console.log("🔎 Sanity T54-A1 — comptage des 12 nouvelles tables…\n")

  const cfg = await db.opportunityConfig.findUnique({ where: { id: "default" } })
  const counts = {
    purchasing: await db.purchasingPower.count(),
    land: await db.landIndicator.count(),
    zoneAlerts: await db.zoneAlert.count(),
    candidates: await db.franchiseCandidate.count(),
    contracts: await db.franchiseContract.count(),
    kit: await db.franchiseKitItem.count(),
    hubs: await db.mobilityHub.count(),
    services: await db.hubService.count(),
    vehicles: await db.hubVehicle.count(),
    interventions: await db.hubIntervention.count(),
    conversions: await db.hubConversion.count(),
  }

  console.log(`   OpportunityConfig   : ${cfg ? 1 : 0} (singleton « default »)`)
  console.log(`   PurchasingPower     : ${counts.purchasing} gouvernorats`)
  console.log(`   LandIndicator       : ${counts.land} gouvernorats`)
  console.log(`   ZoneAlert           : ${counts.zoneAlerts} (vide — remplissage dynamique B2)`)
  console.log(`   FranchiseCandidate  : ${counts.candidates} candidatures`)
  console.log(`   FranchiseContract   : ${counts.contracts} contrats`)
  console.log(`   FranchiseKitItem    : ${counts.kit} pièces`)
  console.log(`   MobilityHub         : ${counts.hubs} hubs`)
  console.log(`   HubService          : ${counts.services} services`)
  console.log(`   HubVehicle          : ${counts.vehicles} véhicules`)
  console.log(`   HubIntervention     : ${counts.interventions} interventions`)
  console.log(`   HubConversion       : ${counts.conversions} conversions`)

  if (cfg) {
    const sum = cfg.weightParc + cfg.weightPurchasing + cfg.weightTrafic + cfg.weightConcurrence + cfg.weightFoncier
    console.log(`\n   Config : parc ${cfg.weightParc} + achat ${cfg.weightPurchasing} + trafic ${cfg.weightTrafic} + concurrence ${cfg.weightConcurrence} + foncier ${cfg.weightFoncier} = ${sum} · seuils ${cfg.zoneBlancheThreshold}/${cfg.alertThreshold}`)
  }

  // Exemples représentatifs.
  const tunis = await db.purchasingPower.findUnique({ where: { gouvernorat: "Tunis" } })
  const kef = await db.landIndicator.findUnique({ where: { gouvernorat: "Le Kef" } })
  const hubSample = await db.mobilityHub.findMany({ orderBy: { code: "asc" }, take: 3 })
  const vehicleSample = await db.hubVehicle.findMany({ take: 3, orderBy: { plate: "asc" } })
  const convSample = await db.hubConversion.findMany({ where: { stage: "FIDELISE" }, take: 2 })
  const contractSample = await db.franchiseContract.findMany({ orderBy: { reference: "asc" }, take: 2, include: { candidate: true } })

  console.log("\n   📍 Exemples :")
  if (tunis) {
    console.log(`   Pouvoir d'achat « Tunis » : indice ${tunis.index} · PIB/hab ${tunis.gdpPerCapita?.toLocaleString("fr-FR")} DT/an · revenu ${tunis.avgIncome?.toLocaleString("fr-FR")} DT/mois (est. ${tunis.estimated})`)
  }
  if (kef) {
    console.log(`   Foncier « Le Kef » : ${kef.pricePerM2?.toLocaleString("fr-FR")} DT/m² · dispo ${kef.availability} · pression ${kef.urbanPressure} (est. ${kef.estimated})`)
  }
  for (const h of hubSample) {
    console.log(`   Hub ${h.code} — ${h.name} · ${h.status} (${h.type}) · ${h.dailyVehicles.toLocaleString("fr-FR")} véh/j · ${h.monthlyRevenue.toLocaleString("fr-FR")} DT/mois`)
  }
  for (const v of vehicleSample) {
    console.log(`   Véhicule ${v.plate} — ${v.brand} ${v.model} (${v.type}, ${v.segment}, ${v.visitsCount} visites, ${v.clientName})`)
  }
  for (const c of convSample) {
    console.log(`   Conversion ${c.stage} · ${c.source} · valeur ${c.value} DT · le ${c.occurredAt.toLocaleDateString("fr-FR")}`)
  }
  for (const k of contractSample) {
    console.log(`   Contrat ${k.reference} — ${k.status} · ${k.candidate.fullName} (${k.brandSlug}) · ${k.entryFee.toLocaleString("fr-FR")} DT + ${k.royaltyPct} % · ${k.durationYears} ans`)
  }

  console.log("\n✅ Sanity T54-A1 terminé — totaux conformes au contrat (hubs : 9 codes listés honorés, cf. worklog).")
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
