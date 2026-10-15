// CarbuScope — T58 — /api/pub/campaigns : campagnes publicitaires du module
// « Publicité » (simulateur persisté → volet Rapports).
//   · GET (session requise — 401 FR) : campagnes de l'ENSEIGNE de la session
//     (scopage brandSlug — une enseigne ne voit que ses simulations) ; la
//     Super Administration voit l'intégralité (surveillance). Tri création
//     décroissant. Le snapshot des supports (supportsJson) est renvoyé
//     DÉSÉRIALISÉ (supports: Array) pour l'affichage direct des rapports.
//   · POST (session requise) : ENREGISTRE UNE CAMPAGNE SIMULÉE — le corps
//     { nom, objectif, semaines, periode, budgetCible, supportCodes } est
//     validé FR strictement (listes fermées, 1-8 semaines, 1-40 supports
//     existants), l'estimation est RECALCULÉE SERVEUR (jamais confiée au
//     client — intégrité des rapports) avec les formules transparentes du
//     simulateur (§ affichées à l'utilisateur), puis persistée avec le
//     snapshot des supports choisis.
//   · PATCH (T59 — P2 cycle de vie) : transitions auditées
//     SIMULEE → VALIDEE → EN_COURS → TERMINEE (+ ANNULEE). L'enseigne pilote
//     SES campagnes ; la Super Administration supervise TOUTES les campagnes.
//   · Rôles : miroir du gating sidebar PUB_MODULE_ROLES + SUPER_ADMIN.
// Route STRICTEMENT additive.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { PUB_MODULE_ROLES } from "@/store/app-store"

export const dynamic = "force-dynamic"

const PUB_ROLES: ReadonlySet<string> = new Set([
  ...PUB_MODULE_ROLES,
  "SUPER_ADMIN",
])

/** Objectifs fermés (miroir simulateur — libellés FR côté client). */
const OBJECTIFS = new Set(["NOTORIETE", "TRAFFIC_STATION", "PROMO_PRODUIT", "LANCEMENT"])

/** Périodes fermées + facteurs (miroir PERIODE_FACTEURS — pub-shared). */
const PERIODES: ReadonlyMap<string, number> = new Map([
  ["normale", 1],
  ["ramadan", 1.25],
  ["ete", 1.15],
  ["rentree", 1.1],
])

const WEEKS_PER_MONTH = 4.345

/** Populations INS 2024 (GRP — mêmes valeurs que pub-shared/seed). */
const GOV_POP: Record<string, number> = {
  Tunis: 1119000, Ariana: 576000, "Ben Arous": 640000, Nabeul: 826000,
  Sfax: 955000, Sousse: 700000, Monastir: 425000, Mahdia: 412000,
  Bizerte: 385000, Kairouan: 400000, Zaghouan: 193000, Béja: 285000,
  Jendouba: 265000, "Le Kef": 262000, Siliana: 234000, "Sidi Bouzid": 470000,
  Kasserine: 480000, Gabès: 375000, Médenine: 415000, Tataouine: 150000,
  Gafsa: 350000, Tozeur: 110000, Kébili: 160000, Manouba: 380000,
}

interface CampaignInput {
  nom?: unknown
  objectif?: unknown
  semaines?: unknown
  periode?: unknown
  budgetCible?: unknown
  supportCodes?: unknown
}

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json(
      { error: "Connexion requise — les rapports de campagnes sont un espace interne enseigne." },
      { status: 401 },
    )
  }
  if (!PUB_ROLES.has(session.role)) {
    return NextResponse.json(
      { error: "Accès réservé aux rôles ADMIN, COMMERCIAL et DG (module Publicité)." },
      { status: 403 },
    )
  }

  // Scopage : enseigne de la session ; SA voit tout.
  const where = session.role === "SUPER_ADMIN" || !session.brandSlug
    ? undefined
    : { brandSlug: session.brandSlug }

  const campaigns = await db.adCampaign.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({
    campaigns: campaigns.map(c => ({
      ...c,
      supports: safeParseSupports(c.supportsJson),
      supportsJson: undefined,
    })),
    generatedAt: new Date().toISOString(),
  })
}

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json(
      { error: "Connexion requise — enregistrez vos campagnes depuis un compte enseigne." },
      { status: 401 },
    )
  }
  if (!PUB_ROLES.has(session.role)) {
    return NextResponse.json(
      { error: "Accès réservé aux rôles ADMIN, COMMERCIAL et DG (module Publicité)." },
      { status: 403 },
    )
  }

  // 1) Corps JSON (≤ 8 Ko, anti-abus léger — pattern franchise/public).
  let body: CampaignInput
  try {
    const raw = await req.text()
    if (raw.length > 8192) throw new Error("trop grand")
    body = JSON.parse(raw) as CampaignInput
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide ou trop volumineux." }, { status: 400 })
  }

  // 2) Validations FR strictes.
  const nom = typeof body.nom === "string" ? body.nom.trim() : ""
  if (nom.length < 3 || nom.length > 80) {
    return NextResponse.json({ error: "Le nom de la campagne doit contenir entre 3 et 80 caractères." }, { status: 400 })
  }
  const objectif = typeof body.objectif === "string" ? body.objectif : ""
  if (!OBJECTIFS.has(objectif)) {
    return NextResponse.json({ error: "Objectif invalide (notoriété, trafic station, promotion ou lancement)." }, { status: 400 })
  }
  const semaines = Number(body.semaines)
  if (!Number.isFinite(semaines) || !Number.isInteger(semaines) || semaines < 1 || semaines > 8) {
    return NextResponse.json({ error: "La durée doit être comprise entre 1 et 8 semaines." }, { status: 400 })
  }
  const periode = typeof body.periode === "string" ? body.periode : ""
  const facteur = PERIODES.get(periode)
  if (facteur === undefined) {
    return NextResponse.json({ error: "Période invalide (normale, ramadan, été ou rentrée)." }, { status: 400 })
  }
  const budgetCible = Number(body.budgetCible)
  if (!Number.isFinite(budgetCible) || budgetCible < 0 || budgetCible > 10_000_000) {
    return NextResponse.json({ error: "Le budget cible doit être un montant positif raisonnable (DT)." }, { status: 400 })
  }
  if (!Array.isArray(body.supportCodes) || body.supportCodes.length < 1 || body.supportCodes.length > 40 || !body.supportCodes.every(c => typeof c === "string")) {
    return NextResponse.json({ error: "Sélectionnez entre 1 et 40 supports pour la campagne." }, { status: 400 })
  }

  // 3) Supports réels du référentiel (codes uniques — le client envoie une
  //    sélection, le serveur revalide l'existence).
  const codes = [...new Set(body.supportCodes as string[])]
  const rows = await db.adSupport.findMany({ where: { code: { in: codes } } })
  if (rows.length !== codes.length) {
    return NextResponse.json({ error: "Certains supports de la sélection n'existent plus — rechargez le listing." }, { status: 400 })
  }

  // 4) Estimation recalculée SERVEUR (formules transparentes § simulateur).
  const sups = rows.map(r => ({
    code: r.code, mode: r.mode, name: r.name, supportType: r.supportType,
    regie: r.regie, gouvernorat: r.gouvernorat,
    coutMensuel: r.coutMensuel, contactsJ: r.contactsJ,
  }))
  const budgetMensuel = sups.reduce((s, p) => s + p.coutMensuel, 0)
  const contactsJour = sups.reduce((s, p) => s + p.contactsJ, 0)
  const budgetEstime = (budgetMensuel / WEEKS_PER_MONTH) * semaines
  const contactsBruts = contactsJour * 7 * semaines * facteur
  const doublons = sups.length <= 1 ? 0 : 0.18 * Math.min(1, (sups.length - 1) / 4)
  const porteeNette = contactsBruts * (1 - doublons)
  const population = [...new Set(sups.map(p => p.gouvernorat))].reduce((s, g) => s + (GOV_POP[g] ?? 0), 0)
  const r2 = (v: number) => Math.round(v * 100) / 100

  const campaign = await db.adCampaign.create({
    data: {
      nom, objectif, brandSlug: session.brandSlug ?? "sans-enseigne", auteur: session.email,
      semaines, periode, facteur, budgetCible,
      budgetEstime: r2(budgetEstime), contactsBruts: Math.round(contactsBruts),
      porteeNette: Math.round(porteeNette),
      frequence: r2(porteeNette > 0 ? contactsBruts / porteeNette : 0),
      grp: r2(population > 0 ? (porteeNette / population) * 100 : 0),
      cpm: r2(contactsBruts > 0 ? budgetEstime / (contactsBruts / 1000) : 0),
      statut: "SIMULEE",
      supportsJson: JSON.stringify(sups),
    },
  })

  return NextResponse.json(
    { campaign: { ...campaign, supports: sups, supportsJson: undefined } },
    { status: 201 },
  )
}

/** Dé-sérialisation défensive du snapshot supports (rapports). */
function safeParseSupports(json: string): Array<{
  code: string; mode: string; name: string; supportType: string
  regie: string; gouvernorat: string; coutMensuel: number; contactsJ: number
}> {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is {
      code: string; mode: string; name: string; supportType: string
      regie: string; gouvernorat: string; coutMensuel: number; contactsJ: number
    } => typeof p === "object" && p !== null && "code" in p && "mode" in p)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// PATCH — T59 (P2 « cycle de vie des campagnes ») : transitions auditées.
// Machine à états SERVEUR (jamais confiée au client) :
//   SIMULEE → VALIDEE | ANNULEE
//   VALIDEE → EN_COURS | ANNULEE
//   EN_COURS → TERMINEE | ANNULEE
//   TERMINEE / ANNULEE : états absorbants (aucune transition).
// Scopage : l'enseigne n'agit que sur SES campagnes (404 opaque sinon) ;
// la Super Administration (session SUPER_ADMIN) peut agir sur TOUTES
// (supervision SA — même permission que la lecture globale du GET).
// ---------------------------------------------------------------------------

const ACTIONS: ReadonlyMap<string, { cible: string; depuis: ReadonlySet<string>; libelle: string }> = new Map([
  ["valider", { cible: "VALIDEE", depuis: new Set(["SIMULEE"]), libelle: "validée (budget engagé)" }],
  ["lancer", { cible: "EN_COURS", depuis: new Set(["VALIDEE"]), libelle: "lancée (diffusion en cours)" }],
  ["terminer", { cible: "TERMINEE", depuis: new Set(["EN_COURS"]), libelle: "clôturée" }],
  ["annuler", { cible: "ANNULEE", depuis: new Set(["SIMULEE", "VALIDEE", "EN_COURS"]), libelle: "annulée" }],
])

export async function PATCH(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json(
      { error: "Connexion requise — le cycle de vie des campagnes est un espace interne enseigne." },
      { status: 401 },
    )
  }
  if (!PUB_ROLES.has(session.role)) {
    return NextResponse.json(
      { error: "Accès réservé aux rôles ADMIN, COMMERCIAL et DG (module Publicité)." },
      { status: 403 },
    )
  }

  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "Paramètre id manquant (?id=<campagne>)." }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as { action?: unknown }
  const action = typeof body.action === "string" ? body.action : ""
  const transition = ACTIONS.get(action)
  if (!transition) {
    return NextResponse.json(
      { error: "Action inconnue — transitions autorisées : valider, lancer, terminer, annuler." },
      { status: 400 },
    )
  }

  const campaign = await db.adCampaign.findUnique({ where: { id } })
  if (!campaign) {
    return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 })
  }

  // Scopage enseigne : la SA passe, les autres rôles → uniquement LEUR enseigne
  // (404 opaque : on ne révèle pas l'existence d'une campagne d'autrui).
  const estSa = session.role === "SUPER_ADMIN" || !session.brandSlug
  if (!estSa && campaign.brandSlug !== session.brandSlug) {
    return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 })
  }

  if (!transition.depuis.has(campaign.statut)) {
    return NextResponse.json(
      {
        error: `Transition refusée : une campagne « ${campaign.statut} » ne peut pas être ${transition.libelle}.`,
      },
      { status: 409 },
    )
  }

  const maj = await db.adCampaign.update({
    where: { id },
    data: { statut: transition.cible },
  })

  // Journal d'audit (AuditEvent — l'audit ne casse jamais la réponse métier).
  try {
    await db.auditEvent.create({
      data: {
        kind: "PUBLICITE",
        message: [
          `Campagne ${transition.libelle}`,
          `${campaign.nom} · ${campaign.brandSlug}`,
          `par ${session.email}${estSa && campaign.brandSlug !== session.brandSlug ? " (SA)" : ""}`,
        ].join(" · "),
        actor: session.email,
      },
    })
  } catch {
    // noop
  }

  return NextResponse.json({
    campaign: { ...maj, supports: safeParseSupports(maj.supportsJson), supportsJson: undefined },
  })
}
