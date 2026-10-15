// Super Administration — ② Facturation : liste, génération mensuelle (TVA 19 %
// issue des paramètres), règlements et relances, tout audité.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializeFacture } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

const FACTURE_SELECT = {
  id: true, numero: true, brandSlug: true, moisConcerne: true, dateEmission: true, dateEcheance: true,
  statut: true, montantHtMillimes: true, montantTvaMillimes: true, montantTtcMillimes: true,
  datePaiement: true, modePaiement: true, notes: true,
  lignes: { orderBy: { ordre: "asc" as const } },
  _count: { select: { lignes: true } },
} as const

export async function GET(req: Request) {
  const url = new URL(req.url)
  const brand = url.searchParams.get("brand")
  const statut = url.searchParams.get("statut")
  const q = url.searchParams.get("q")?.toLowerCase()
  let factures = await db.facture.findMany({ select: FACTURE_SELECT, orderBy: { dateEmission: "desc" } })
  // Nom client (raison sociale du contrat) pour l'affichage direct
  const contrats = await db.contrat.findMany({ where: { brandSlug: { not: null } }, select: { brandSlug: true, nomClient: true } })
  const noms = new Map(contrats.map(c => [c.brandSlug!, c.nomClient]))
  if (brand) factures = factures.filter(f => f.brandSlug === brand)
  if (statut) factures = factures.filter(f => f.statut === statut)
  if (q) factures = factures.filter(f => f.numero.toLowerCase().includes(q) || f.brandSlug.includes(q))

  // KPI de synthèse
  const now = new Date()
  const moisCourant = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const kpis = {
    total: factures.length,
    payees: factures.filter(f => f.statut === "PAYEE").length,
    emises: factures.filter(f => f.statut === "EMISE").length,
    enRetard: factures.filter(f => f.statut === "EN_RETARD").length,
    encaisseTtcMillimes: factures.filter(f => f.statut === "PAYEE").reduce((s, f) => s + f.montantTtcMillimes, 0),
    enAttenteTtcMillimes: factures.filter(f => f.statut === "EMISE").reduce((s, f) => s + f.montantTtcMillimes, 0),
    enRetardTtcMillimes: factures.filter(f => f.statut === "EN_RETARD").reduce((s, f) => s + f.montantTtcMillimes, 0),
    moisCourant,
  }
  return NextResponse.json({ factures: factures.map(f => ({ ...serializeFacture(f), clientNom: noms.get(f.brandSlug) })), kpis })
}

// Génération des factures du mois courant pour les clients ACTIF qui n'en ont
// pas encore (idempotent). Reprend la grille paramétrée + TVA paramétrée.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string }
  if (body.action !== "generer") return NextResponse.json({ error: "Action inconnue." }, { status: 400 })

  const [tvaP, mensuelP, annuelP, delaiP] = await Promise.all([
    db.parametrePlateforme.findUnique({ where: { cle: "facturation.tva" } }),
    db.parametrePlateforme.findUnique({ where: { cle: "abonnement.mensuel" } }),
    db.parametrePlateforme.findUnique({ where: { cle: "abonnement.annuel" } }),
    db.parametrePlateforme.findUnique({ where: { cle: "facturation.delaiReglementJours" } }),
  ])
  const TVA = Number(tvaP?.valeur ?? "19") / 100
  const MENSUEL = Math.round(Number(mensuelP?.valeur ?? "40") * 1000)
  const ANNUEL = Math.round(Number(annuelP?.valeur ?? "400") * 1000)
  const delai = Number(delaiP?.valeur ?? "30")

  const now = new Date()
  const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1, 9, 0, 0)

  const contrats = await db.contrat.findMany({ where: { statut: "ACTIF", brandSlug: { not: null } } })
  const existantes = await db.facture.findMany({ where: { moisConcerne: mk }, select: { brandSlug: true } })
  const dejaFacturees = new Set(existantes.map(f => f.brandSlug))

  let creees = 0
  for (const c of contrats) {
    if (dejaFacturees.has(c.brandSlug!)) continue
    const abonnements = await db.abonnementStation.findMany({ where: { brandSlug: c.brandSlug!, statut: "ACTIF" } })
    if (abonnements.length === 0) continue
    const actives = abonnements.filter(a => a.dateDebut.getTime() <= debutMois.getTime())
    const mensuelles = actives.filter(a => a.periodicite === "MENSUEL")
    const anniversaires = actives.filter(a => a.periodicite === "ANNUEL" && a.dateDebut.getMonth() === now.getMonth())
    const lignes: { libelle: string; quantite: number; prixUnitaireMillimes: number; montantHtMillimes: number; ordre: number }[] = []
    let ordre = 0
    if (mensuelles.length > 0) {
      lignes.push({ libelle: `Abonnement mensuel — ${mensuelles.length} stations`, quantite: mensuelles.length, prixUnitaireMillimes: MENSUEL, montantHtMillimes: mensuelles.length * MENSUEL, ordre: ordre++ })
    }
    for (const a of anniversaires) {
      lignes.push({ libelle: `Abonnement annuel — station ${a.stationCode} (${a.stationNom})`, quantite: 1, prixUnitaireMillimes: ANNUEL, montantHtMillimes: ANNUEL, ordre: ordre++ })
    }
    if (lignes.length === 0) continue
    const ht = lignes.reduce((s, l) => s + l.montantHtMillimes, 0)
    const tva = Math.round(ht * TVA)
    const count = await db.facture.count({ where: { brandSlug: c.brandSlug! } })
    const facture = await db.facture.create({
      data: {
        numero: `FAC-${mk}-${c.brandSlug!.toUpperCase().slice(0, 4)}-${String(count + 1).padStart(2, "0")}`,
        brandSlug: c.brandSlug!, moisConcerne: mk,
        dateEmission: new Date(), dateEcheance: new Date(Date.now() + delai * 86400000),
        statut: "EMISE", montantHtMillimes: ht, montantTvaMillimes: tva, montantTtcMillimes: ht + tva,
      },
    })
    await db.factureLigne.createMany({ data: lignes.map(l => ({ ...l, factureId: facture.id })) })
    creees++
  }

  await logAudit({
    module: "FACTURATION",
    action: `Génération mensuelle des factures (${mk})`,
    cibleType: "FACTURE",
    cibleLabel: `${creees} facture(s) émise(s)`,
    severite: "SENSIBLE",
    details: `Grille paramétrée : ${MENSUEL / 1000} DT/station/mois, ${ANNUEL / 1000} DT/station/an, TVA ${TVA * 100} %.`,
  })
  return NextResponse.json({ creees, mois: mk }, { status: 201 })
}

export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  const body = (await req.json().catch(() => ({}))) as { action?: string; modePaiement?: string }
  if (!id) return NextResponse.json({ error: "Paramètre id manquant." }, { status: 400 })
  const f = await db.facture.findUnique({ where: { id } })
  if (!f) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 })

  let maj
  if (body.action === "payer") {
    if (f.statut === "PAYEE") return NextResponse.json({ error: "Facture déjà réglée." }, { status: 400 })
    const mode = body.modePaiement && ["VIREMENT", "CHEQUE", "ESPECES"].includes(body.modePaiement) ? body.modePaiement : "VIREMENT"
    maj = await db.facture.update({ where: { id }, data: { statut: "PAYEE", datePaiement: new Date(), modePaiement: mode }, select: FACTURE_SELECT })
    await logAudit({
      module: "FACTURATION",
      action: "Facture marquée payée",
      cibleType: "FACTURE",
      cibleLabel: f.numero,
      details: `Règlement ${mode} — ${f.montantTtcMillimes / 1000} DT TTC.`,
    })
  } else if (body.action === "relancer") {
    maj = await db.facture.update({ where: { id }, data: { notes: `${f.notes} · Relance envoyée le ${new Date().toLocaleDateString("fr-FR")}`.trim() }, select: FACTURE_SELECT })
    await logAudit({
      module: "FACTURATION",
      action: "Relance de règlement envoyée",
      cibleType: "FACTURE",
      cibleLabel: f.numero,
      details: `Retard de ${Math.max(0, Math.round((Date.now() - f.dateEcheance.getTime()) / 86400000))} jour(s).`,
    })
  } else if (body.action === "annuler") {
    maj = await db.facture.update({ where: { id }, data: { statut: "ANNULEE", notes: "Facture annulée (avoir émis le cas échéant)." }, select: FACTURE_SELECT })
    await logAudit({
      module: "FACTURATION",
      action: "Facture annulée",
      cibleType: "FACTURE",
      cibleLabel: f.numero,
      severite: "SENSIBLE",
    })
  } else {
    return NextResponse.json({ error: "Action inconnue (payer | relancer | annuler)." }, { status: 400 })
  }
  return NextResponse.json({ facture: serializeFacture(maj) })
}
