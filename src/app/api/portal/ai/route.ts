// Portail Enseigne — F-1 : assistant IA SCOPÉ PAR ENSEIGNE (multi-tenant).
// Adaptation du pattern /api/super/ai (E-1) avec une différence de fond : le
// contexte RAG-lite n'est PAS un snapshot global de l'éditeur mais les DONNÉES
// PROPRES DE L'ENSEIGNE demandée (réseau, services, veille, réputation, part
// de marché, situation SaaS, décret prix) — aucune donnée d'une autre enseigne
// n'est lue ni injectée, l'isolation multi-tenant est garantie côté serveur.
//
// POST ?brand=<slug> { question, historique? } → { reponse }
//   • scoping : paramètre `brand` OBLIGATOIRE (400 FR) et enseigne connue
//     (400 « Enseigne inconnue ») — le rate limit et le contexte sont cléés
//     sur ce slug, le prompt système verrouille le périmètre ;
//   • garde-fou n°0 : feature flag portal.ai.active (interrupteur
//     FONCTIONNALITES de la Configuration SA) → 503 FR, AVANT le quota ;
//   • rate limit PAR ENSEIGNE (≠ global SA) : Map<slug, timestamps[]>,
//     fenêtre glissante 60 s, 10 requêtes/enseigne → 429 FR ;
//   • validation : question 1–500 caractères, historique ≤ 8 messages
//     « user »/« assistant » de ≤ 1 500 caractères (400 FR propres) ;
//   • contexte RAG-lite SCOPÉ calculé depuis la base AVANT l'appel LLM
//     (SDK z-ai-web-dev-sdk côté serveur UNIQUEMENT, thinking disabled) ;
//   • audit systématique (module AGENT_IA) avec comme acteur un utilisateur
//     ADMIN réel de l'enseigne si trouvable — try/catch séparé.
import { NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// ------------------------------------------------------------------ garde-fous

const QUESTION_MAX = 500
const HISTORIQUE_MAX = 8
const MESSAGE_MAX = 1500
const FENETRE_MS = 60_000 // fenêtre glissante du rate limit
const MAX_REQUETES = 10 // requêtes PAR ENSEIGNE et par fenêtre

/** Horodatages des requêtes reçues, par enseigne (in-memory — aucune dépendance). */
const requetesParEnseigne = new Map<string, number[]>()

/** Compte la requête de l'enseigne dans la fenêtre glissante et dit si son quota est atteint. */
function quotaDepasse(slug: string): boolean {
  const maintenant = Date.now()
  const requetes = (requetesParEnseigne.get(slug) ?? []).filter(t => t > maintenant - FENETRE_MS)
  if (requetes.length >= MAX_REQUETES) {
    requetesParEnseigne.set(slug, requetes)
    return true
  }
  requetes.push(maintenant)
  requetesParEnseigne.set(slug, requetes)
  return false
}

interface MessageHistorique {
  role: "user" | "assistant"
  content: string
}

function messageValide(m: unknown): m is MessageHistorique {
  if (typeof m !== "object" || m === null) return false
  const { role, content } = m as { role?: unknown; content?: unknown }
  return (role === "user" || role === "assistant") && typeof content === "string" && content.length <= MESSAGE_MAX
}

// ------------------------------------------------------------------ contexte

const DAY_MS = 86_400_000
const HORIZON_TENDANCE_J = 90 // fenêtre de tendance de la réputation

const nfEntier = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
const nf1Dec = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })
const nf2Dec = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })
const nfPompe = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const fDateLongue = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })

/** 24 960 000 millimes → « 24 960 DT » */
const dt = (millimes: number) => `${nfEntier.format(Math.round(millimes / 1000))} DT`

const STATUTS_STATION: Record<string, string> = {
  ACTIVE: "actives",
  RENOVATION: "en rénovation",
  PROJECT: "en projet",
  CLOSED: "fermées",
}

const TYPES_ALERTE: Record<string, string> = {
  OPENING: "ouverture",
  RENOVATION: "rénovation",
  REBRAND: "rebranding",
  INFRA: "infrastructure",
  REGULATORY: "réglementaire",
}

const SEVERITES_ALERTE: Record<string, string> = {
  CRITICAL: "critique",
  MEDIUM: "moyenne",
  INFO: "info",
}

/** Snapshot compact de l'enseigne demandée — UNIQUEMENT ses données, sérialisé
 *  pour le prompt système (aucune lecture sur une autre enseigne que le slug). */
async function construireContexte(enseigne: { slug: string; name: string }, now: Date): Promise<string> {
  const [stations, servicesDeployes, totalNational, alertes, avis, contrat, abonnements, factures, ticketsOuverts, ticketsEnCours, prixEssence, prixGazole, prixGpl] = await Promise.all([
    db.station.findMany({ where: { brand: { slug: enseigne.slug } }, select: { status: true } }),
    db.stationService.findMany({ where: { station: { brand: { slug: enseigne.slug } } }, select: { service: { select: { name: true } } } }),
    db.station.count(),
    db.alert.findMany({ where: { brand: enseigne.name }, orderBy: { date: "desc" }, take: 5, select: { type: true, title: true, severity: true, date: true } }),
    db.review.findMany({ where: { station: { brand: { slug: enseigne.slug } } }, select: { rating: true, replyText: true, createdAt: true } }),
    db.contrat.findUnique({ where: { brandSlug: enseigne.slug }, select: { statut: true, dateDebut: true, dateFin: true } }),
    db.abonnementStation.findMany({ where: { brandSlug: enseigne.slug, statut: "ACTIF" }, select: { periodicite: true, prixMillimes: true } }),
    db.facture.findMany({ where: { brandSlug: enseigne.slug }, select: { statut: true, montantTtcMillimes: true } }),
    db.ticketSupport.count({ where: { brandSlug: enseigne.slug, statut: "OUVERT" } }),
    db.ticketSupport.count({ where: { brandSlug: enseigne.slug, statut: "EN_COURS" } }),
    db.fuelPrice.findFirst({ where: { fuelType: "ESSENCE" }, orderBy: { effectiveAt: "desc" }, select: { priceMillimes: true, effectiveAt: true } }),
    db.fuelPrice.findFirst({ where: { fuelType: "GAZOLE" }, orderBy: { effectiveAt: "desc" }, select: { priceMillimes: true, effectiveAt: true } }),
    db.fuelPrice.findFirst({ where: { fuelType: "GPL" }, orderBy: { effectiveAt: "desc" }, select: { priceMillimes: true, effectiveAt: true } }),
  ])

  // Réseau : total + par statut + part de marché approximative (parc national)
  const parStatut = new Map<string, number>()
  for (const st of stations) parStatut.set(st.status, (parStatut.get(st.status) ?? 0) + 1)
  const detailStatut = ["ACTIVE", "RENOVATION", "PROJECT", "CLOSED"]
    .filter(s => parStatut.has(s))
    .map(s => `${nfEntier.format(parStatut.get(s)!)} ${STATUTS_STATION[s] ?? s.toLowerCase()}`)
    .join(", ")
  const partMarche = totalNational > 0 ? nf1Dec.format((stations.length / totalNational) * 100) : null

  // Top 3 des services les plus déployés sur le réseau (StationService)
  const parService = new Map<string, number>()
  for (const ss of servicesDeployes) parService.set(ss.service.name, (parService.get(ss.service.name) ?? 0) + 1)
  const topServices = [...parService.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)

  // Réputation : volume, note moyenne, taux de réponse officielle, tendance 90 j
  const nbAvis = avis.length
  const noteMoyenne = nbAvis > 0 ? avis.reduce((s, a) => s + a.rating, 0) / nbAvis : null
  const nbRepondus = avis.filter(a => a.replyText !== null).length
  const pctRepondus = nbAvis > 0 ? Math.round((nbRepondus / nbAvis) * 100) : 0
  const limite90j = new Date(now.getTime() - HORIZON_TENDANCE_J * DAY_MS)
  const recents = avis.filter(a => a.createdAt > limite90j)
  const anciens = avis.filter(a => a.createdAt <= limite90j)
  let tendance = "non calculable (pas assez d'avis récents sur la période)"
  if (recents.length >= 3 && anciens.length >= 3) {
    const mR = recents.reduce((s, a) => s + a.rating, 0) / recents.length
    const mA = anciens.reduce((s, a) => s + a.rating, 0) / anciens.length
    tendance = `note de ${nf2Dec.format(mR)}/5 sur les 90 derniers jours (${nfEntier.format(recents.length)} avis) contre ${nf2Dec.format(mA)}/5 auparavant — ${mR >= mA ? "en hausse" : "en baisse"}`
  }

  // Situation SaaS de l'enseigne — même convention de MRR que /api/super/analytics
  const mensuels = abonnements.filter(a => a.periodicite === "MENSUEL").length
  const annuels = abonnements.length - mensuels
  const mrrMillimes = abonnements.reduce((s, a) => s + (a.periodicite === "ANNUEL" ? Math.round(a.prixMillimes / 12) : a.prixMillimes), 0)
  const facturesRetard = factures.filter(f => f.statut === "EN_RETARD")
  const totalRetardMillimes = facturesRetard.reduce((s, f) => s + f.montantTtcMillimes, 0)

  // Sérialisation compacte (le prompt système reste borné)
  const lignes: string[] = []
  lignes.push(
    `— Réseau : ${nfEntier.format(stations.length)} stations recensées (${detailStatut || "aucune"})` +
      (partMarche !== null ? ` — part de marché ≈ ${partMarche} % du parc national (${nfEntier.format(totalNational)} stations).` : "."),
  )
  lignes.push(
    topServices.length > 0
      ? `— Services les plus déployés : ${topServices.map(([nom, c]) => `${nom} (${nfEntier.format(c)} stations)`).join(", ")}.`
      : "— Services les plus déployés : aucun service enregistré sur le réseau.",
  )
  if (alertes.length > 0) {
    const detail = alertes
      .map(a => `${TYPES_ALERTE[a.type] ?? a.type.toLowerCase()} « ${a.title} » (gravité ${SEVERITES_ALERTE[a.severity] ?? a.severity.toLowerCase()}), le ${fDateLongue.format(a.date)}`)
      .join(" ; ")
    lignes.push(`— Veille — alertes les plus récentes impliquant l'enseigne : ${detail}.`)
  } else {
    lignes.push("— Veille : aucune alerte récente enregistrée pour l'enseigne.")
  }
  lignes.push(
    nbAvis > 0
      ? `— Réputation : ${nfEntier.format(nbAvis)} avis, note moyenne ${nf2Dec.format(noteMoyenne!)}/5, ${pctRepondus} % des avis ont reçu une réponse officielle (${nfEntier.format(nbRepondus)} répondus) — tendance : ${tendance}.`
      : "— Réputation : aucun avis enregistré sur le réseau.",
  )
  lignes.push(
    contrat
      ? `— Abonnement CarbuScope : contrat ${contrat.statut}${contrat.dateFin ? `, fin fixe le ${fDateLongue.format(contrat.dateFin)}` : " (reconduction tacite)"}.`
      : "— Abonnement CarbuScope : aucun contrat enregistré.",
  )
  lignes.push(
    `— Stations souscrites au SaaS : ${nfEntier.format(abonnements.length)} (${nfEntier.format(mensuels)} mensuelles, ${nfEntier.format(annuels)} annuelles) — revenu récurrent mensuel de l'enseigne ≈ ${dt(mrrMillimes)} hors taxes.`,
  )
  lignes.push(
    facturesRetard.length > 0
      ? `— Facturation : ${nfEntier.format(factures.length)} factures au total, dont ${nfEntier.format(facturesRetard.length)} en retard pour ${dt(totalRetardMillimes)} TTC.`
      : `— Facturation : ${nfEntier.format(factures.length)} factures au total, aucune en retard.`,
  )
  lignes.push(`— Support CarbuScope : ${nfEntier.format(ticketsOuverts)} ticket(s) ouverts, ${nfEntier.format(ticketsEnCours)} en cours.`)
  const prixPompe: string[] = []
  if (prixEssence) prixPompe.push(`essence ${nfPompe.format(prixEssence.priceMillimes / 1000)} DT/L`)
  if (prixGazole) prixPompe.push(`gazole ${nfPompe.format(prixGazole.priceMillimes / 1000)} DT/L`)
  if (prixGpl) prixPompe.push(`GPL ${nfPompe.format(prixGpl.priceMillimes / 1000)} DT/kg`)
  const dateDecret = prixEssence?.effectiveAt ?? prixGazole?.effectiveAt ?? prixGpl?.effectiveAt
  if (prixPompe.length > 0) {
    lignes.push(`— Dernier décret des prix pompe (national, applicable à toutes les enseignes)${dateDecret ? ` au ${fDateLongue.format(dateDecret)}` : ""} : ${prixPompe.join(", ")}.`)
  }
  return lignes.join("\n")
}

// ------------------------------------------------------------------ route

export async function POST(req: Request) {
  // Garde-fou de scoping : l'enseigne est OBLIGATOIRE — tout le reste de la
  // route (quota, contexte, audit) est cléé sur ce slug.
  const brand = new URL(req.url).searchParams.get("brand")?.trim() ?? ""
  if (brand.length === 0) {
    return NextResponse.json(
      { erreur: "Le paramètre « brand » (identifiant de l'enseigne) est obligatoire." },
      { status: 400 },
    )
  }
  const enseigne = await db.brand.findUnique({ where: { slug: brand }, select: { slug: true, name: true } })
  if (!enseigne) {
    return NextResponse.json({ erreur: "Enseigne inconnue." }, { status: 400 })
  }

  // Garde-fou n°0 : feature flag réel — l'onglet Configuration de la Super
  // Administration pilote portal.ai.active ; désactivé, la route refuse toute
  // consultation sans consommer le quota de l'enseigne.
  const flag = await db.parametrePlateforme.findUnique({ where: { cle: "portal.ai.active" } })
  if (flag?.valeur !== "true") {
    return NextResponse.json(
      { erreur: "L'assistant IA est désactivé dans la Configuration (Fonctionnalités → portal.ai.active)." },
      { status: 503 },
    )
  }

  // Garde-fou n°1 : quota PAR ENSEIGNE — toute requête reçue compte, valide ou non.
  if (quotaDepasse(enseigne.slug)) {
    return NextResponse.json({ erreur: "Trop de consultations rapprochées — patientez une minute." }, { status: 429 })
  }

  // Garde-fou n°2 : validation stricte du corps (messages d'erreur FR).
  const body = (await req.json().catch(() => null)) as { question?: unknown; historique?: unknown } | null
  if (body === null || typeof body.question !== "string" || body.question.trim().length === 0 || body.question.length > QUESTION_MAX) {
    return NextResponse.json({ erreur: `La question est obligatoire (1 à ${QUESTION_MAX} caractères).` }, { status: 400 })
  }
  const question = body.question.trim()
  let historique: MessageHistorique[] = []
  if (body.historique !== undefined) {
    if (!Array.isArray(body.historique) || body.historique.length > HISTORIQUE_MAX || !body.historique.every(messageValide)) {
      return NextResponse.json(
        { erreur: `Historique invalide (au plus ${HISTORIQUE_MAX} messages « user »/« assistant » de ${MESSAGE_MAX} caractères).` },
        { status: 400 },
      )
    }
    historique = body.historique
  }

  try {
    // Contexte RAG-lite SCOPÉ : données réelles de CETTE enseigne uniquement,
    // recalculées à chaque consultation AVANT tout appel LLM.
    const now = new Date()
    const dateDuJour = fDateLongue.format(now)
    const [contexte, adminEnseigne] = await Promise.all([
      construireContexte(enseigne, now),
      // Acteur d'audit : un utilisateur ADMIN réel de l'enseigne si trouvable.
      db.user.findFirst({ where: { brandSlug: enseigne.slug, role: "ADMIN" }, select: { name: true, email: true } }),
    ])

    const systemPrompt =
      `Tu es l'assistant IA du Portail Enseigne de ${enseigne.name} sur la plateforme CarbuScope (observatoire tunisien des stations-service). ` +
      "Tu réponds STRICTEMENT en français, de façon concise et professionnelle (3 phrases max sauf liste demandée). " +
      `Tu ne réponds QU'À PARTIR DES DONNÉES FOURNIES, qui concernent EXCLUSIVEMENT ${enseigne.name} — si la question porte sur une autre enseigne ou sur des données concurrentielles globales non fournies, refuse poliment en le signalant. ` +
      `Montants en DT. Date du jour : ${dateDuJour}. Données ${enseigne.name} :\n${contexte}`

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: systemPrompt },
        ...historique.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: question },
      ],
      thinking: { type: "disabled" },
    })
    const reponse = String(completion.choices?.[0]?.message?.content ?? "")
    if (reponse.trim().length === 0) throw new Error("Réponse vide du moteur IA")

    // Audit systématique — try/catch séparé, ne jamais casser la réponse.
    const acteur = adminEnseigne
      ? { nom: adminEnseigne.name, email: adminEnseigne.email, role: "ADMIN" }
      : { nom: "Contact enseigne", email: `admin@${enseigne.slug}.tn`, role: "ADMIN" }
    try {
      await logAudit({
        acteur,
        module: "AGENT_IA",
        action: "Consultation de l'assistant IA enseigne",
        cibleType: "AGENT_IA",
        cibleLabel: `${enseigne.name} · ${question.slice(0, 60)}`,
        details: `réponse ${reponse.length} car. · historique ${historique.length} message(s)`,
        severite: "NORMALE",
      })
    } catch {
      // l'audit ne doit jamais bloquer la réponse métier
    }

    return NextResponse.json({ reponse })
  } catch (e) {
    console.error("POST /api/portal/ai", e)
    return NextResponse.json({ erreur: "Le service IA est momentanément indisponible — réessayez." }, { status: 500 })
  }
}
