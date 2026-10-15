import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeCandidate, serializeContract, serializeKit } from "@/lib/t51-server"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// T51 — Module Franchise (au sein du Radar d'Opportunités).
// GET ?brand= → candidats + contrats (de l'enseigne ou tous) + kit de
//              démarrage + suivi des franchisés actifs (TMP correspondants
//              avec leurs KPIs 30 jours).
// POST actions : « maj-candidat » (statut), « generer-contrat » (génère le
//              contrat type avec droits d'entrée / redevance / durée), «
//              maj-kit » (activer/désactiver un élément). Tout est audité.

const CANDIDATE_VALID = ["NOUVEAU", "CONTACTE", "EN_NEGOCIATION", "SIGNE", "REFUSE"]

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand")?.trim() || null
  const [candidates, contracts, kit, hubs, records, conversions] = await Promise.all([
    db.franchiseCandidate.findMany({ orderBy: { score: "desc" } }),
    brand
      ? db.franchiseContract.findMany({ where: { brandSlug: brand }, orderBy: { createdAt: "desc" } })
      : db.franchiseContract.findMany({ orderBy: { createdAt: "desc" } }),
    brand
      ? db.franchiseKitItem.findMany({ where: { brandSlug: brand }, orderBy: [{ category: "asc" }, { label: "asc" }] })
      : db.franchiseKitItem.findMany({ orderBy: [{ brandSlug: "asc" }, { category: "asc" }] }),
    brand ? db.mobilityHub.findMany({ where: { brandSlug: brand } }) : db.mobilityHub.findMany(),
    db.hubServiceRecord.findMany({ select: { hubId: true, amount: true, performedAt: true } }),
    db.hubConversion.findMany({ select: { hubId: true, status: true, amount: true, proposedAt: true } }),
  ])
  const candidateById = new Map(candidates.map(c => [c.id, c]))
  const contractDTOs = contracts.map(k => serializeContract(k, candidateById.get(k.candidateId)?.name ?? null))
  const day = 86_400_000
  const now = Date.now()
  const franchises = hubs.map(h => {
    const hubRecords = records.filter(r => r.hubId === h.id && now - r.performedAt.getTime() < 30 * day)
    const conv = conversions.filter(c => c.hubId === h.id && now - c.proposedAt.getTime() < 90 * day)
    const contract = contracts.find(k =>
      candidateById.get(k.candidateId)?.name === h.franchisee)
    return {
      hubId: h.id, code: h.code, name: h.name, franchisee: h.franchisee,
      gouvernorat: h.gouvernorat, status: h.status, openedAt: h.openedAt.toISOString(),
      rating: h.rating, contractRef: contract?.reference ?? null,
      ca30: Math.round(hubRecords.reduce((s, r) => s + r.amount, 0)),
      services30: hubRecords.length,
      conversions90: conv.length,
      conversionRate: conv.length > 0 ? Math.round(conv.filter(c => c.status === "CONFIRMEE").length / conv.length * 100) : 0,
      caCaptured: Math.round(conv.filter(c => c.status === "CONFIRMEE").reduce((s, c) => s + c.amount, 0)),
      roiPct: h.investment > 0 ? Math.round(hubRecords.reduce((s, r) => s + r.amount, 0) * 12 / h.investment * 100) : 0,
    }
  })
  return NextResponse.json({
    candidates: candidates.map(serializeCandidate),
    contracts: contractDTOs,
    kit: kit.map(serializeKit),
    franchises,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : undefined

  if (body.action === "maj-candidat") {
    const candidateId = typeof body.candidateId === "string" ? body.candidateId : ""
    const status = typeof body.status === "string" ? body.status : ""
    if (!candidateId || !CANDIDATE_VALID.includes(status)) {
      return NextResponse.json({ error: "Paramètres « candidateId » / « status » invalides" }, { status: 400 })
    }
    const c = await db.franchiseCandidate.update({ where: { id: candidateId }, data: { status } })
    await logAudit({
      acteur: actor ? { nom: "Utilisateur", email: actor, role: "PORTAIL" } : undefined,
      module: "OPPORTUNITY",
      action: "Mise à jour d'un candidat franchise",
      cibleType: "Candidat",
      cibleLabel: `${c.name} → ${status}`,
    })
    return NextResponse.json({ ok: true, status: c.status })
  }

  if (body.action === "generer-contrat") {
    const candidateId = typeof body.candidateId === "string" ? body.candidateId : ""
    const brandSlug = typeof body.brandSlug === "string" && body.brandSlug.trim() ? body.brandSlug.trim() : ""
    if (!candidateId || !brandSlug) {
      return NextResponse.json({ error: "Paramètres « candidateId » / « brandSlug » requis" }, { status: 400 })
    }
    const candidate = await db.franchiseCandidate.findUnique({ where: { id: candidateId } })
    if (!candidate) return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 })
    const zone = candidate.zoneId ? await db.opportunityZone.findUnique({ where: { id: candidate.zoneId } }) : null
    const entryFee = typeof body.entryFee === "number" && body.entryFee > 0 ? body.entryFee : 35_000
    const royaltyPct = typeof body.royaltyPct === "number" && body.royaltyPct > 0 ? body.royaltyPct : 2.2
    const durationYears = typeof body.durationYears === "number" && body.durationYears >= 3 ? Math.round(body.durationYears) : 7
    const count = await db.franchiseContract.count()
    const reference = `FR-2026-${String(count + 1).padStart(2, "0")}`
    const zoneLabel = zone ? `${zone.zoneName} (${zone.delegation}, ${zone.gouvernorat})` : candidate.zoneLabel ?? "zone à définir"
    const dateFr = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date())
    const content =
      `CONTRAT DE FRANCHISE « ${brandSlug.toUpperCase()} MOBILITY POINT »\n` +
      `Référence : ${reference}\n\n` +
      `Entre la direction de l'enseigne (ci-après « le Franchiseur ») et ${candidate.name} (ci-après « le Franchisé »), ` +
      `il est convenu ce qui suit :\n\n` +
      `Article 1 — Objet. Le Franchiseur accorde au Franchisé l'exploitation d'un point de service ` +
      `« Mobility Point » sur la zone « ${zoneLabel} », sous enseigne, signes distinctifs et savoir-faire du Franchiseur.\n\n` +
      `Article 2 — Droit d'entrée. Le Franchisé verse au Franchiseur un droit d'entrée forfaitaire de ` +
      `${entryFee.toLocaleString("fr-FR")} DT, non remboursable, à la signature.\n\n` +
      `Article 3 — Redevance. Le Franchisé verse une redevance mensuelle égale à ${String(royaltyPct).replace(".", ",")} % ` +
      `du chiffre d'affaires hors taxes réalisé par le point de service.\n\n` +
      `Article 4 — Durée. Le présent contrat est conclu pour une durée de ${durationYears} ans, renouvelable par tacite ` +
      `reconduction sous réserve d'un préavis de 6 mois.\n\n` +
      `Article 5 — Obligations du Franchiseur : enseigne et kit de démarrage complet, formation initiale de 2 semaines, ` +
      `logiciel de gestion CarbuScope TMP, hotline technique 6j/7, audit qualité annuel.\n\n` +
      `Article 6 — Obligations du Franchisé : respect du cahier des charges (propreté, délais de service, prix affichés), ` +
      `approvisionnements référencés, transmission quotidienne des données d'exploitation.\n\n` +
      `Article 7 — Exclusivité territoriale : rayon de 10 km autour du point de service.\n\n` +
      `Fait à Tunis, le ${dateFr}.`
    const contract = await db.franchiseContract.create({
      data: {
        reference, candidateId, brandSlug,
        zoneId: candidate.zoneId ?? "",
        entryFee, royaltyPct, durationYears, status: "BROUILLON", content,
      },
    })
    await db.franchiseCandidate.update({ where: { id: candidateId }, data: { status: "EN_NEGOCIATION" } })
    await logAudit({
      acteur: actor ? { nom: "Utilisateur", email: actor, role: "PORTAIL" } : undefined,
      module: "OPPORTUNITY",
      action: "Génération d'un contrat de franchise",
      cibleType: "Contrat",
      cibleLabel: `${reference} — ${candidate.name} (${brandSlug})`,
      details: `Droit d'entrée ${entryFee.toLocaleString("fr-FR")} DT · redevance ${royaltyPct} % · ${durationYears} ans`,
    })
    return NextResponse.json({
      ok: true,
      contract: serializeContract(contract, candidate.name),
      candidateStatus: "EN_NEGOCIATION",
    })
  }

  if (body.action === "maj-kit") {
    const itemId = typeof body.itemId === "string" ? body.itemId : ""
    if (!itemId) return NextResponse.json({ error: "Paramètre « itemId » requis" }, { status: 400 })
    const active = Boolean(body.active)
    const item = await db.franchiseKitItem.update({ where: { id: itemId }, data: { active } })
    await logAudit({
      acteur: actor ? { nom: "Utilisateur", email: actor, role: "PORTAIL" } : undefined,
      module: "OPPORTUNITY",
      action: `${active ? "Activation" : "Désactivation"} d'un élément du kit de démarrage`,
      cibleType: "Kit",
      cibleLabel: `${item.label} (${item.brandSlug})`,
    })
    return NextResponse.json({ ok: true, active: item.active })
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 400 })
}
