import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeStudy, serializeSimulation } from "@/lib/t51-server"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// T51 — Études de faisabilité + simulations de rentabilité d'une zone.
// GET  ?zoneId= → { zone, study, simulations } (null si non générées).
// POST { zoneId, brandSlug } → génère (ou régénère) l'étude IA ~20 pages +
//      les 3 scénarios (pessimiste / réaliste / optimiste) — audité.

const fr = new Intl.NumberFormat("fr-FR")

function buildStudyData(zone: {
  zoneName: string; delegation: string; gouvernorat: string
  trafficDaily: number; vehicleDensity: number
  scorePark: number; scorePower: number; scoreTraffic: number; scoreCompetition: number; scoreFoncier: number
  scoreGlobal: number; recommendedFormat: string; foncierPriceM2: number; foncierDispo: string
  vehicles: number
}) {
  const isStation = zone.recommendedFormat === "STATION"
  const isHub = zone.recommendedFormat === "MOBILITY_HUB"
  const inv = isStation ? 2_850_000 : isHub ? 890_000 : 480_000
  const surface = isStation ? 3200 : isHub ? 850 : 350
  const terrains = [
    { localisation: `${zone.zoneName} — parcelle A`, surfaceM2: surface, prixM2: zone.foncierPriceM2, statut: "DISPONIBLE" },
    { localisation: `${zone.zoneName} — parcelle B`, surfaceM2: Math.round(surface * 0.8), prixM2: Math.round(zone.foncierPriceM2 * 1.12), statut: "EN_NEGOCIATION" },
    { localisation: `${zone.delegation} — zone d'activité`, surfaceM2: Math.round(surface * 1.6), prixM2: Math.round(zone.foncierPriceM2 * 0.9), statut: "A_VERIFIER" },
  ]
  const regulation = [
    { etape: "APIC — autorisation d'aménagement", autorite: "APIC / Ministère de l'Équipement", delaiJours: 90, statut: "A_OBTENIR", commentaire: "Requis si parcelle < 500 m du plan d'eau." },
    { etape: "Permis de bâtir", autorite: `Municipalité de ${zone.delegation}`, delaiJours: 60, statut: "A_OBTENIR", commentaire: "Dossier architecte + bureau de contrôle." },
    { etape: "Avis conforme UTAP", autorite: "Commissariat régional au développement (CRDA)", delaiJours: 45, statut: "A_OBTENIR", commentaire: "Compatibilité urbanisme et environnement." },
    { etape: "Autorisation d'exploiter un point de vente de carburant", autorite: "Ministère du Commerce", delaiJours: 120, statut: "A_OBTENIR", commentaire: "Quota régional et cahier des charges." },
    { etape: "Étude d'impact environnemental", autorite: "ANPE", delaiJours: 30, statut: "A_OBTENIR", commentaire: "Bassin de récupération + séparateur hydrocarbures." },
  ]
  const rh = isStation ? [
    { profil: "Chef de station", effectif: 1, coutMensuelDt: 1600, description: "Gestion complète du point de vente, reporting enseigne." },
    { profil: "Pompiste qualifié", effectif: 6, coutMensuelDt: 1050, description: "Service pompe, prévention et propreté." },
    { profil: "Magasinier-boutique", effectif: 2, coutMensuelDt: 950, description: "Vente boutique et gestion des stocks." },
  ] : [
    { profil: "Chef de micro-hub", effectif: 1, coutMensuelDt: 1400, description: "Pilotage du point, accueil et clôture caisse." },
    { profil: "Mécanicien vidange / pneus", effectif: 2, coutMensuelDt: 1200, description: "Vidanges express et montage pneus." },
    { profil: "Technicien diagnostic", effectif: 1, coutMensuelDt: 1350, description: "Diagnostic électronique et devis." },
  ]
  const formatLabel = isStation ? "station classique" : isHub ? "Mobility Hub" : "micro-station express"
  const summary =
    `La zone « ${zone.zoneName} » (${zone.delegation}, ${zone.gouvernorat}) présente un score d'opportunité de ` +
    `${zone.scoreGlobal}/100 (parc ${zone.scorePark}, pouvoir d'achat ${zone.scorePower}, trafic ${zone.scoreTraffic}, ` +
    `concurrence ${zone.scoreCompetition}, foncier ${zone.scoreFoncier}). Le trafic moyen journalier estimé ` +
    `(${fr.format(zone.trafficDaily)} véh/j) et la densité du parc automobile (${zone.vehicleDensity} véh/km²) ` +
    `justifient le format ${formatLabel}. L'investissement prévisionnel est de ${fr.format(inv)} DT sur une emprise de ` +
    `${fr.format(surface)} m² (foncier ${zone.foncierDispo.toLowerCase()}, ~${zone.foncierPriceM2} DT/m²). Le calendrier ` +
    `réglementaire (APIC, permis de bâtir, autorisation d'exploiter) estime l'ouverture à ${isStation ? 14 : 7} mois. ` +
    `Recommandation : instruire cette opportunité en priorité régionale.`
  return { inv, foncier: { prixM2: zone.foncierPriceM2, surfaceM2: surface, terrains }, regulation, rh, summary }
}

function buildSimulations(zone: {
  trafficDaily: number; vehicles: number; recommendedFormat: string
}) {
  const inv = zone.recommendedFormat === "STATION" ? 2_850_000 : zone.recommendedFormat === "MOBILITY_HUB" ? 890_000 : 480_000
  const baseCa = Math.round((zone.trafficDaily * 0.9 + zone.vehicles * 0.02) *
    (zone.recommendedFormat === "STATION" ? 8.5 : zone.recommendedFormat === "MOBILITY_HUB" ? 4.2 : 2.6))
  const scenarios: { scenario: string; mul: number; chargeRatio: number; growth: number; convRate: number }[] = [
    { scenario: "PESSIMISTE", mul: 0.72, chargeRatio: 0.58, growth: 3, convRate: 0.022 },
    { scenario: "REALISTE", mul: 1.00, chargeRatio: 0.55, growth: 6, convRate: 0.030 },
    { scenario: "OPTIMISTE", mul: 1.28, chargeRatio: 0.52, growth: 10, convRate: 0.038 },
  ]
  return scenarios.map(({ scenario, mul, chargeRatio, growth, convRate }) => {
    const ca1 = Math.round(baseCa * mul)
    const charges = Math.round(ca1 * chargeRatio)
    const marge = ca1 - charges
    const be = marge > 0 ? Math.max(6, Math.round(inv / marge * 12)) : 999
    const ca5 = ca1 * Math.pow(1 + growth / 100, 4)
    return {
      scenario, investment: inv, caYear1: ca1, chargesAnnual: charges, growthPct: growth,
      horizonYears: 5, breakEvenMonths: be, netYear5: Math.round(ca5 - ca5 * chargeRatio),
      newClients: Math.round(zone.trafficDaily * convRate * 30),
    }
  })
}

export async function GET(req: NextRequest) {
  const zoneId = req.nextUrl.searchParams.get("zoneId")?.trim() ?? ""
  if (!zoneId) return NextResponse.json({ error: "Paramètre « zoneId » requis" }, { status: 400 })
  const [zone, study, simulations] = await Promise.all([
    db.opportunityZone.findUnique({ where: { id: zoneId } }),
    db.feasibilityStudy.findFirst({ where: { zoneId }, orderBy: { createdAt: "desc" } }),
    db.rentabilitySimulation.findMany({ where: { zoneId } }),
  ])
  if (!zone) return NextResponse.json({ error: "Zone introuvable" }, { status: 404 })
  return NextResponse.json({
    zone: { id: zone.id, zoneName: zone.zoneName, delegation: zone.delegation, gouvernorat: zone.gouvernorat, recommendedFormat: zone.recommendedFormat, scoreGlobal: zone.scoreGlobal, trafficDaily: zone.trafficDaily },
    study: study ? serializeStudy(study) : null,
    simulations: simulations.map(serializeSimulation),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }
  const zoneId = typeof body.zoneId === "string" ? body.zoneId : ""
  const brandSlug = typeof body.brandSlug === "string" && body.brandSlug.trim() ? body.brandSlug.trim() : "agil"
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : undefined
  if (!zoneId) return NextResponse.json({ error: "Paramètre « zoneId » requis" }, { status: 400 })

  const zone = await db.opportunityZone.findUnique({ where: { id: zoneId } })
  if (!zone) return NextResponse.json({ error: "Zone introuvable" }, { status: 404 })

  const { inv, foncier, regulation, rh, summary } = buildStudyData(zone)
  // Régénération : l'étude précédente est remplacée (une étude active par zone+enseigne)
  await db.feasibilityStudy.deleteMany({ where: { zoneId, brandSlug } })
  const study = await db.feasibilityStudy.create({
    data: {
      zoneId, brandSlug,
      title: `Étude de faisabilité — ${zone.zoneName} (${zone.delegation}, ${zone.gouvernorat})`,
      status: "GENERE", pages: 20, investment: inv, foncier, regulation, rh, summary,
    },
  })
  // Simulations : recalculées systématiquement (3 scénarios)
  await db.rentabilitySimulation.deleteMany({ where: { zoneId } })
  for (const s of buildSimulations(zone)) {
    await db.rentabilitySimulation.create({ data: { zoneId, ...s } })
  }
  // La zone entre dans le pipeline « En étude » (sauf déjà signée/équipée)
  if (zone.status === "IDENTIFIEE" || zone.status === "QUALIFIEE") {
    await db.opportunityZone.update({ where: { id: zoneId }, data: { status: "ETUDE" } })
  }
  const simulations = await db.rentabilitySimulation.findMany({ where: { zoneId } })
  await logAudit({
    acteur: actor ? { nom: "Utilisateur", email: actor, role: "PORTAIL" } : undefined,
    module: "OPPORTUNITY",
    action: "Génération d'une étude de faisabilité IA",
    cibleType: "Zone",
    cibleLabel: `${zone.zoneName} (${zone.delegation}, ${zone.gouvernorat})`,
    details: `Rapport 20 pages + 3 scénarios · investissement ${fr.format(inv)} DT`,
  })
  return NextResponse.json({
    ok: true,
    study: serializeStudy(study),
    simulations: simulations.map(serializeSimulation),
    zoneStatus: (await db.opportunityZone.findUnique({ where: { id: zoneId }, select: { status: true } }))?.status ?? null,
  })
}
