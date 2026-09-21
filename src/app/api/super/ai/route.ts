// Super Administration — E-1 : ACTIVATION RÉELLE de l'agent IA.
// Jusqu'ici simple cadre documentaire sans aucun appel réseau (B-4), l'agent
// est désormais branché sur un moteur de langage via z-ai-web-dev-sdk —
// côté serveur UNIQUEMENT, jamais depuis le navigateur.
//
// POST { question, historique? } → { reponse }
//   • validation : question 1–500 caractères, historique ≤ 8 messages
//     « user »/« assistant » de ≤ 1 500 caractères (400 FR propres) ;
//   • rate limit mémoire : fenêtre glissante 60 s, 15 requêtes GLOBALES → 429 ;
//   • contexte RAG-lite : un snapshot compact du portefeuille (clients
//     actifs/prospects, MRR/ARR, factures EN_RETARD, échéances ≤ 90 j,
//     tickets ouverts, comptes) est calculé depuis la base AVANT l'appel LLM
//     et injecté dans le prompt système — l'agent ne répond qu'avec ces
//     chiffres, rien d'autre (mêmes conventions de calcul que
//     /api/super/analytics, /api/super/factures et /api/super/echeances) ;
//   • audit systématique de chaque consultation réussie, dans un try/catch
//     séparé — ne jamais casser la réponse métier.
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
const MAX_REQUETES = 15 // requêtes globales par fenêtre

/** Horodatages des requêtes reçues (in-memory — aucune dépendance). */
const requetesRecues: number[] = []

/** Compte la requête dans la fenêtre glissante et dit si le quota est atteint. */
function quotaDepasse(): boolean {
  const maintenant = Date.now()
  while (requetesRecues.length > 0 && requetesRecues[0] <= maintenant - FENETRE_MS) {
    requetesRecues.shift()
  }
  if (requetesRecues.length >= MAX_REQUETES) return true
  requetesRecues.push(maintenant)
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
const HORIZON_ECHEANCES_J = 90 // échéances à venir surveillées pour l'agent

const nfEntier = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
const fDateLongue = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })

/** 24 960 000 millimes → « 24 960 DT » */
const dt = (millimes: number) => `${nfEntier.format(Math.round(millimes / 1000))} DT`

/** Prochain anniversaire annuel (reconduction tacite — même convention que
 *  /api/super/echeances : multiple de 12 mois suivant, année de signature
 *  ignorée, anniversaire du jour conservé). */
function prochainAnniversaire(debut: Date, now: Date): Date {
  const a = (y: number) => new Date(y, debut.getMonth(), debut.getDate(), debut.getHours(), debut.getMinutes())
  const debutDuJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  let cible = a(now.getFullYear())
  if (debutDuJour(cible) < debutDuJour(now)) cible = a(now.getFullYear() + 1)
  return cible
}

/** Snapshot compact du portefeuille SaaS, sérialisé pour le prompt système. */
async function construireContexte(now: Date): Promise<string> {
  const [contrats, abonnements, facturesRetard, ticketsOuverts, ticketsEnCours, nbComptes] = await Promise.all([
    db.contrat.findMany({ select: { nomClient: true, statut: true, brandSlug: true, dateFin: true, dateDebut: true } }),
    db.abonnementStation.findMany({ where: { statut: "ACTIF" }, select: { brandSlug: true, periodicite: true, prixMillimes: true, dateDebut: true, dateFin: true } }),
    db.facture.findMany({ where: { statut: "EN_RETARD" }, select: { numero: true, brandSlug: true, montantTtcMillimes: true, dateEcheance: true } }),
    db.ticketSupport.count({ where: { statut: "OUVERT" } }),
    db.ticketSupport.count({ where: { statut: "EN_COURS" } }),
    db.user.count(),
  ])

  // Portefeuille : actifs (enseigne câblée) + prospects
  const nomsClients = new Map(contrats.filter(c => c.brandSlug).map(c => [c.brandSlug!, c.nomClient]))
  const actifs = contrats.filter(c => c.statut === "ACTIF" && c.brandSlug)
  const prospects = contrats.filter(c => c.statut === "PROSPECT")

  // MRR/ARR — convention /api/super/analytics : annuel proratisé /12
  const mrrMillimes = abonnements.reduce((s, a) => s + (a.periodicite === "ANNUEL" ? Math.round(a.prixMillimes / 12) : a.prixMillimes), 0)
  const mensuels = abonnements.filter(a => a.periodicite === "MENSUEL").length
  const annuels = abonnements.length - mensuels

  // Retards de paiement (tri par séniorité de retard décroissante)
  const retards = facturesRetard
    .map(f => ({ ...f, jours: Math.max(0, Math.round((now.getTime() - f.dateEcheance.getTime()) / DAY_MS)) }))
    .sort((a, b) => b.jours - a.jours)
  const totalRetardMillimes = retards.reduce((s, f) => s + f.montantTtcMillimes, 0)
  const plusAncienRetardJ = retards[0]?.jours ?? 0

  // Échéances ≤ 90 j : renouvellements de contrats (fin fixe ou anniversaire
  // tacite) + groupes d'abonnements annuels (convention /api/super/echeances)
  const echeances: { label: string; jours: number }[] = []
  for (const c of contrats.filter(x => x.statut === "ACTIF" || x.statut === "ESSAI")) {
    const cible = c.dateFin ?? (c.dateDebut ? prochainAnniversaire(c.dateDebut, now) : null)
    if (!cible) continue
    const j = Math.round((cible.getTime() - now.getTime()) / DAY_MS)
    if (j < 0 || j > HORIZON_ECHEANCES_J) continue
    echeances.push({
      label: `${c.dateFin ? "fin de contrat" : "reconduction tacite"} ${c.nomClient} le ${fDateLongue.format(cible)}`,
      jours: j,
    })
  }
  const groupes = new Map<string, { cible: Date; nb: number; totalMillimes: number; nom: string }>()
  for (const ab of abonnements.filter(a => a.periodicite === "ANNUEL")) {
    const cible = ab.dateFin ?? prochainAnniversaire(ab.dateDebut, now)
    const j = Math.round((cible.getTime() - now.getTime()) / DAY_MS)
    if (j < 0 || j > HORIZON_ECHEANCES_J) continue
    const cle = `${ab.brandSlug}-${cible.getFullYear()}-${cible.getMonth()}`
    const g = groupes.get(cle)
    if (g) {
      g.nb += 1
      g.totalMillimes += ab.prixMillimes
    } else {
      groupes.set(cle, { cible, nb: 1, totalMillimes: ab.prixMillimes, nom: nomsClients.get(ab.brandSlug) ?? ab.brandSlug })
    }
  }
  for (const g of groupes.values()) {
    echeances.push({
      label: `${g.nb} abonnements annuels ${g.nom} à renouveler le ${fDateLongue.format(g.cible)} (≈ ${dt(g.totalMillimes)}/an)`,
      jours: Math.round((g.cible.getTime() - now.getTime()) / DAY_MS),
    })
  }
  echeances.sort((a, b) => a.jours - b.jours)

  // Sérialisation compacte (le prompt système reste borné)
  const lignes: string[] = []
  lignes.push(
    `— Portefeuille : ${actifs.length} clients actifs (${actifs.map(c => c.nomClient).join(", ")})` +
      (prospects.length > 0 ? `, ${prospects.length} prospect (${prospects.map(c => c.nomClient).join(", ")})` : "") +
      ".",
  )
  lignes.push(
    `— Revenus : MRR ≈ ${dt(mrrMillimes)}, ARR ≈ ${dt(mrrMillimes * 12)} — ${abonnements.length} stations souscrites ` +
      `(${mensuels} mensuelles, ${annuels} annuelles ; TVA 19 %).`,
  )
  if (retards.length > 0) {
    const detail = retards
      .slice(0, 3)
      .map(r => `${r.numero} (${nomsClients.get(r.brandSlug) ?? r.brandSlug}, ${dt(r.montantTtcMillimes)} TTC, en retard de ${r.jours} j)`)
      .join(" ; ")
    lignes.push(`— Factures en retard : ${retards.length} pour ${dt(totalRetardMillimes)} TTC — plus ancien retard : ${plusAncienRetardJ} jour(s) : ${detail}.`)
  } else {
    lignes.push("— Factures en retard : aucune.")
  }
  if (echeances.length > 0) {
    lignes.push(
      `— Échéances à venir ≤ 90 jours : ${echeances.length} — ${echeances
        .slice(0, 4)
        .map(e => `${e.label} (dans ${e.jours} j)`)
        .join(" ; ")}.`,
    )
  } else {
    lignes.push("— Échéances à venir ≤ 90 jours : aucune.")
  }
  lignes.push(`— Support : ${ticketsOuverts} ticket(s) ouverts, ${ticketsEnCours} en cours.`)
  lignes.push(`— Comptes : ${nbComptes} comptes utilisateurs au total.`)
  return lignes.join("\n")
}

// ------------------------------------------------------------------ route

export async function POST(req: Request) {
  // Garde-fou n°0 : feature flag réel — l'onglet Configuration de la Super
  // Administration pilote module.ai.active (interrupteur FONCTIONNALITES) ;
  // désactivé, la route refuse toute consultation sans consommer le quota.
  const flag = await db.parametrePlateforme.findUnique({ where: { cle: "module.ai.active" } })
  if (flag?.valeur !== "true") {
    return NextResponse.json(
      { erreur: "L'agent IA est désactivé dans la Configuration (Fonctionnalités → module.ai.active)." },
      { status: 503 },
    )
  }

  // Garde-fou n°1 : quota global — toute requête reçue compte, valide ou non.
  if (quotaDepasse()) {
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
    // Contexte RAG-lite : données réelles AVANT tout appel LLM.
    const now = new Date()
    const dateDuJour = fDateLongue.format(now)
    const contexte = await construireContexte(now)

    const systemPrompt =
      "Tu es l'assistant IA de la Super Administration de CarbuScope SAS, éditeur tunisien de la plateforme de suivi des stations-service. " +
      "Tu réponds STRICTEMENT en français, de façon concise et professionnelle (3 phrases max sauf liste demandée). " +
      "Tu ne réponds qu'à partir des DONNÉES FOURNIES ci-dessous — si l'information n'y figure pas, dis-le honnêtement, n'invente JAMAIS de chiffre. " +
      `Montants en dinars tunisiens (DT). Contexte au ${dateDuJour} :\n${contexte}`

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
    try {
      await logAudit({
        module: "AGENT_IA",
        action: "Consultation de l'agent IA",
        cibleType: "AGENT_IA",
        cibleLabel: question.slice(0, 60),
        details: `réponse ${reponse.length} car. · historique ${historique.length} message(s)`,
        severite: "NORMALE",
      })
    } catch {
      // l'audit ne doit jamais bloquer la réponse métier
    }

    return NextResponse.json({ reponse })
  } catch (e) {
    console.error("POST /api/super/ai", e)
    return NextResponse.json({ erreur: "Le service IA est momentanément indisponible — réessayez." }, { status: 500 })
  }
}
