// CarbuScope — T60 (P3 « optimiseur de plan média ») — /api/pub/optimize :
// calcule SERVEUR un plan de supports optimal pour une campagne du module
// « Publicité », à partir du cadrage (objectif, semaines, période, budget)
// et de filtres optionnels (modes, gouvernorats).
//   · Candidats : supports DISPONIBLES du référentiel des régies (on ne
//     réserve pas un support occupé/réservé/en maintenance), filtrés par
//     modes/zones si demandé.
//   · Score d'efficacité par support (transparent, renvoyé dans
//     « explication ») :
//       score = contactsJ × affinité(mode/objectif) × poids(gouvernorat)
//               × bonus environnement × bonus éclairage
//               × (0,7 + 0,006 × visibilité) ÷ coût effectif
//     coût effectif = tarif mensuel × max(semaines ÷ 4,345 ; engagement
//     minimum régie) — un support dont l'engagement dépasse la durée de
//     campagne est pénalisé (coût réel plus élevé), mais le budget AFFICHÉ
//     reste le prorata du simulateur (cohérence avec /api/pub/campaigns).
//   · Poids gouvernorat selon l'objectif :
//       · TRAFFIC_STATION → densité des stations de l'ENSEIGNE de la
//         session (groupBy gouvernorat) — la SA (sans enseigne) n'a pas de
//         pondération ;
//       · NOTORIETE → légère préférence grands foyers de population ;
//       · LANCEMENT → concentration assumée sur les grands foyers ;
//       · PROMO_PRODUIT → poids uniforme (proximité points de vente portée
//         par l'affinité de modes URBAIN/METRO).
//   · Sélection gloutonne (score décroissant) sous contraintes :
//       · budget : budget engagé (prorata) ≤ budget cible ;
//       · plafond de supports par gouvernorat (étalement de couverture) ;
//       · part maximale du budget mensuel par mode (mix média — sauf pour
//         le premier support d'un mode, toujours permis) ;
//       · 40 supports maximum (limite d'enregistrement d'une campagne).
//   · Estimation finale : MÊMES formules que le simulateur et
//     /api/pub/campaigns (contacts × 7 × semaines × facteur, doublons
//     18 %, portée, GRP population INS, CPM) — le client peut comparer
//     le plan optimisé à sa sélection avec les mêmes repères.
//   · Aucun état modifié → aucun AuditEvent (route de calcul pure).
//   · Rôles : miroir du gating PUB_MODULE_ROLES + SUPER_ADMIN (401/403 FR).
// Route STRICTEMENT additive — aucune table ni route existante touchée.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { PUB_MODULE_ROLES } from "@/store/app-store"

export const dynamic = "force-dynamic"

const PUB_ROLES: ReadonlySet<string> = new Set([
  ...PUB_MODULE_ROLES,
  "SUPER_ADMIN",
])

/** Objectifs fermés (miroir simulateur). */
const OBJECTIFS = new Set(["NOTORIETE", "TRAFFIC_STATION", "PROMO_PRODUIT", "LANCEMENT"])

/** Périodes fermées + facteurs (miroir pub-shared). */
const PERIODES: ReadonlyMap<string, number> = new Map([
  ["normale", 1],
  ["ramadan", 1.25],
  ["ete", 1.15],
  ["rentree", 1.1],
])

const MODES = new Set(["CARTOGRAPHIE", "RFR", "METRO", "URBAIN"])
const MAX_SUPPORTS = 40
const WEEKS_PER_MONTH = 4.345

/** Populations INS 2024 (GRP — mêmes valeurs que pub-shared/campaigns). */
const GOV_POP: Record<string, number> = {
  Tunis: 1119000, Ariana: 576000, "Ben Arous": 640000, Nabeul: 826000,
  Sfax: 955000, Sousse: 700000, Monastir: 425000, Mahdia: 412000,
  Bizerte: 385000, Kairouan: 400000, Zaghouan: 193000, Béja: 285000,
  Jendouba: 265000, "Le Kef": 262000, Siliana: 234000, "Sidi Bouzid": 470000,
  Kasserine: 480000, Gabès: 375000, Médenine: 415000, Tataouine: 150000,
  Gafsa: 350000, Tozeur: 110000, Kébili: 160000, Manouba: 380000,
}

/** Paramètres d'affinité par objectif (transparents, renvoyés dans
 *  l'explication) : affinité de mode, plafond par gouvernorat, part
 *  maximale du budget mensuel par mode. */
interface Affinites {
  modes: Readonly<Record<string, number>>
  capParGouv: number
  partMaxParMode: number
  libelle: string
}

const AFFINITES: Readonly<Record<string, Affinites>> = {
  NOTORIETE: {
    modes: { CARTOGRAPHIE: 1, RFR: 1, METRO: 1, URBAIN: 1 },
    capParGouv: 6,
    partMaxParMode: 0.55,
    libelle: "notoriété — portée maximale, mix média équilibré (aucun mode au-delà de 55 % du budget)",
  },
  TRAFFIC_STATION: {
    modes: { CARTOGRAPHIE: 1.15, RFR: 1, METRO: 1.05, URBAIN: 1.2 },
    capParGouv: 10,
    partMaxParMode: 0.7,
    libelle: "trafic en station — zones pondérées par la densité de vos stations, axes routiers et mobilier favorisés",
  },
  PROMO_PRODUIT: {
    modes: { CARTOGRAPHIE: 0.85, RFR: 0.95, METRO: 1.15, URBAIN: 1.3 },
    capParGouv: 12,
    partMaxParMode: 0.6,
    libelle: "promotion produit — mobilier urbain et métro favorisés (flux répétitifs des points de vente)",
  },
  LANCEMENT: {
    modes: { CARTOGRAPHIE: 1.3, RFR: 1.05, METRO: 0.95, URBAIN: 0.9 },
    capParGouv: 14,
    partMaxParMode: 0.75,
    libelle: "lancement — grands formats routiers concentrés sur les grands foyers de population",
  },
}

/** Bonus environnement (léger, commun aux objectifs). */
const ENV_BONUS: Readonly<Record<string, number>> = {
  COMMERCIAL: 1.1, ROUTIER: 1.05, TRANSPORT: 1.05, URBAIN: 1, PERIURBAIN: 0.95,
}

/** Bonus éclairage. */
const ECLAIRAGE_BONUS: Readonly<Record<string, number>> = {
  AVANT: 1.05, RETRO: 1.08, NON: 1,
}

interface OptimizeInput {
  objectif?: unknown
  semaines?: unknown
  periode?: unknown
  budgetCible?: unknown
  modes?: unknown
  gouvernorats?: unknown
}

/** Sérialisation complète d'un support (miroir /api/pub/supports). */
function serializeSupport(s: {
  id: string; code: string; mode: string; name: string; supportType: string
  format: string; surfaceM2: number; orientation: string; eclairage: string
  regie: string; gouvernorat: string; delegation: string; lieu: string
  lat: number; lng: number; environnement: string; visibilite: number
  traficVehJ: number; fluxPietonsJ: number; contactsJ: number
  coutMensuel: number; dureeMinMois: number; statut: string; etat: string
  dernierControle: Date | null; notes: string | null
}) {
  const cpm = s.contactsJ > 0 ? s.coutMensuel / ((s.contactsJ * 30.4) / 1000) : null
  return { ...s, cpm: cpm === null ? null : Math.round(cpm * 10) / 10 }
}

export async function POST(req: Request) {
  // 1) Session (401 FR — pattern pub/*).
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json(
      { error: "Connexion requise — l'optimiseur est un espace interne enseigne." },
      { status: 401 },
    )
  }
  if (!PUB_ROLES.has(session.role)) {
    return NextResponse.json(
      { error: "Accès réservé aux rôles ADMIN, COMMERCIAL et DG (module Publicité)." },
      { status: 403 },
    )
  }

  // 2) Corps JSON (≤ 8 Ko — miroir campaigns).
  let body: OptimizeInput
  try {
    const raw = await req.text()
    if (raw.length > 8192) throw new Error("trop grand")
    body = JSON.parse(raw) as OptimizeInput
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide ou trop volumineux." }, { status: 400 })
  }

  // 3) Validations FR strictes (miroir POST /api/pub/campaigns).
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

  // Filtres optionnels : modes (sous-ensemble des 4) + gouvernorats.
  let modes: string[] | null = null
  if (body.modes !== undefined && body.modes !== null) {
    if (!Array.isArray(body.modes) || body.modes.length === 0 || body.modes.length > 4
      || !body.modes.every(m => typeof m === "string" && MODES.has(m))) {
      return NextResponse.json({ error: "Filtre modes invalide (sous-ensemble de Cartographie, RFR, Metro, Urbain)." }, { status: 400 })
    }
    modes = [...new Set(body.modes as string[])]
  }
  let gouvFiltre: string[] | null = null
  if (body.gouvernorats !== undefined && body.gouvernorats !== null) {
    if (!Array.isArray(body.gouvernorats) || body.gouvernorats.length === 0 || body.gouvernorats.length > 24
      || !body.gouvernorats.every(g => typeof g === "string" && g.length > 0 && g.length <= 40)) {
      return NextResponse.json({ error: "Filtre gouvernorats invalide." }, { status: 400 })
    }
    gouvFiltre = [...new Set(body.gouvernorats as string[])]
  }

  // 4) Candidats : supports DISPONIBLES (le terrain réservable), filtrés.
  const candidats = await db.adSupport.findMany({
    where: {
      statut: "DISPONIBLE",
      ...(modes ? { mode: { in: modes } } : {}),
      ...(gouvFiltre ? { gouvernorat: { in: gouvFiltre } } : {}),
    },
  })
  if (candidats.length === 0) {
    return NextResponse.json(
      { error: "Aucun support disponible ne correspond à ces filtres — élargissez les modes ou les zones." },
      { status: 422 },
    )
  }

  const aff = AFFINITES[objectif]
  const explication: string[] = []

  // Plafond de mix EFFECTIF : si le filtre ne laisse qu'un ou deux modes,
  // le plafond « part max par mode » doit s'élargir (sinon un plan mono-mode
  // serait bloqué à 1 support — part toujours 100 %). Règle transparente :
  // max(plafond objectif, 1 ÷ nb modes du vivier + 0,15).
  const modesDisponibles = new Set(candidats.map(p => p.mode)).size
  const partMaxEffective = Math.max(aff.partMaxParMode, 1 / Math.max(1, modesDisponibles) + 0.15)
  if (partMaxEffective > aff.partMaxParMode) {
    explication.push(
      `Vivier restreint à ${modesDisponibles} mode${modesDisponibles > 1 ? "s" : ""} — plafond de mix par mode élargi à ${Math.round(partMaxEffective * 100)} % (sinon le plan serait artificiellement bloqué).`,
    )
  }

  // 5) Poids par gouvernorat selon l'objectif.
  let poidsGouv: Readonly<Record<string, number>> = {}
  if (objectif === "TRAFFIC_STATION") {
    const brandSlug = session.brandSlug
    if (brandSlug) {
      const brand = await db.brand.findUnique({ where: { slug: brandSlug }, select: { id: true } })
      const stations = brand
        ? await db.station.findMany({ where: { brandId: brand.id }, select: { gouvernorat: true } })
        : []
      const m = new Map<string, number>()
      for (const st of stations) m.set(st.gouvernorat, (m.get(st.gouvernorat) ?? 0) + 1)
      const max = Math.max(1, ...m.values())
      poidsGouv = Object.fromEntries([...m.entries()].map(([g, n]) => [g, 0.5 + 0.5 * (n / max)]))
      const topZones = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([g, n]) => `${g} (${n} stations)`).join(", ")
      explication.push(
        `Zones pondérées par la densité de vos stations — ${stations.length} stations cartographiées, pôles principaux : ${topZones}.`,
      )
    } else {
      explication.push("Session Super Administration (sans enseigne) : aucune pondération par densité de stations appliquée.")
    }
  } else if (objectif === "NOTORIETE" || objectif === "LANCEMENT") {
    const intensite = objectif === "LANCEMENT" ? { base: 0.6, amplitude: 0.4 } : { base: 0.85, amplitude: 0.15 }
    const maxPop = Math.max(1, ...candidats.map(p => GOV_POP[p.gouvernorat] ?? 0))
    poidsGouv = Object.fromEntries(
      [...new Set(candidats.map(p => p.gouvernorat))].map(g => [
        g, intensite.base + intensite.amplitude * ((GOV_POP[g] ?? 0) / maxPop),
      ]),
    )
    explication.push(
      objectif === "LANCEMENT"
        ? "Zones pondérées vers les grands foyers de population (concentration assumée du lancement)."
        : "Légère préférence pour les grands foyers de population (portée de notoriété).",
    )
  } else {
    explication.push("Poids des zones uniforme — la proximité des points de vente est portée par l'affinité de modes (urbain, métro).")
  }

  // 6) Scoring + coût effectif (engagement minimum régie).
  const moisCampagne = semaines / WEEKS_PER_MONTH
  const candidatsScores = candidats.map(p => {
    const coutEffectif = p.coutMensuel * Math.max(moisCampagne, p.dureeMinMois)
    const score =
      (p.contactsJ
        * (aff.modes[p.mode] ?? 1)
        * (poidsGouv[p.gouvernorat] ?? 1)
        * (ENV_BONUS[p.environnement] ?? 1)
        * (ECLAIRAGE_BONUS[p.eclairage] ?? 1)
        * (0.7 + 0.006 * p.visibilite))
      / coutEffectif
    return { p, coutEffectif, score }
  })
  const engagesLongs = candidatsScores.filter(c => c.p.dureeMinMois > moisCampagne + 0.001)
  if (engagesLongs.length > 0) {
    explication.push(
      `Engagements minimums appliqués : ${engagesLongs.length} support(s) du vivier exigent plus que ${semaines} semaine(s) — leur coût effectif (tarif × engagement régie) pénalise leur score.`,
    )
  }

  // 7) Sélection gloutonne sous contraintes.
  candidatsScores.sort((a, b) => b.score - a.score)
  const retenus: Array<{ p: (typeof candidats)[number]; coutEffectif: number; score: number }> = []
  const retenusIds = new Set<string>()
  const nbParGouv = new Map<string, number>()
  const budgetMensuelParMode = new Map<string, number>()
  let budgetMensuelTotal = 0
  let engage = 0 // budget prorata (même unité que le simulateur)
  const ajouter = (c: { p: (typeof candidats)[number]; coutEffectif: number; score: number }) => {
    retenus.push(c)
    retenusIds.add(c.p.id)
    nbParGouv.set(c.p.gouvernorat, (nbParGouv.get(c.p.gouvernorat) ?? 0) + 1)
    budgetMensuelParMode.set(c.p.mode, (budgetMensuelParMode.get(c.p.mode) ?? 0) + c.p.coutMensuel)
    budgetMensuelTotal += c.p.coutMensuel
    engage += (c.p.coutMensuel / WEEKS_PER_MONTH) * semaines
  }
  for (const c of candidatsScores) {
    if (retenus.length >= MAX_SUPPORTS) break
    if (engage + (c.p.coutMensuel / WEEKS_PER_MONTH) * semaines > budgetCible) continue
    const nbGouv = nbParGouv.get(c.p.gouvernorat) ?? 0
    if (nbGouv >= aff.capParGouv) continue
    const budgetMode = budgetMensuelParMode.get(c.p.mode) ?? 0
    const partApres = (budgetMode + c.p.coutMensuel) / (budgetMensuelTotal + c.p.coutMensuel)
    // Le premier support d'un mode est toujours permis (amorçage du mix) ;
    // ensuite la part du mode est plafonnée (mix média — plafond effectif).
    if (budgetMode > 0 && partApres > partMaxEffective) continue
    ajouter(c)
  }

  // 7-bis) RELAXATION du plafond de mix : si le budget reste largement
  // inutilisé alors que des candidats existent (vivier étroit — filtres
  // étroits ou tarifs des supports restants), on comble la cible en ne
  // gardant que les contraintes de budget / couverture / 40 supports.
  // La discipline de mix s'applique D'ABORD ; la relaxation ne comble que
  // le reste — et c'est documenté dans l'explication.
  if (retenus.length > 0 && engage < budgetCible * 0.85) {
    let relaxe = false
    for (const c of candidatsScores) {
      if (retenus.length >= MAX_SUPPORTS) break
      if (retenusIds.has(c.p.id)) continue
      if (engage + (c.p.coutMensuel / WEEKS_PER_MONTH) * semaines > budgetCible) continue
      const nbGouv = nbParGouv.get(c.p.gouvernorat) ?? 0
      if (nbGouv >= aff.capParGouv) continue
      ajouter(c)
      relaxe = true
    }
    if (relaxe) {
      explication.push(
        `Plafond de mix relâché en fin de sélection pour investir la cible (vivier étroit) : la discipline de mix s'applique d'abord, la relaxation ne comble que le reste du budget.`,
      )
    }
  }

  if (retenus.length === 0) {
    const moinsCher = Math.min(...candidatsScores.map(c => (c.p.coutMensuel / WEEKS_PER_MONTH) * semaines))
    return NextResponse.json(
      {
        error: `Aucun plan possible avec ce budget : le support disponible le moins cher coûte environ ${Math.round(moinsCher).toLocaleString("fr-FR")} DT sur ${semaines} semaine(s).`,
      },
      { status: 422 },
    )
  }

  // 8) Estimation (MÊMES formules que le simulateur / campaigns POST).
  const sups = retenus.map(r => r.p)
  const budgetMensuel = sups.reduce((s, p) => s + p.coutMensuel, 0)
  const contactsJour = sups.reduce((s, p) => s + p.contactsJ, 0)
  const budgetEstime = (budgetMensuel / WEEKS_PER_MONTH) * semaines
  const contactsBruts = contactsJour * 7 * semaines * facteur
  const doublons = sups.length <= 1 ? 0 : 0.18 * Math.min(1, (sups.length - 1) / 4)
  const porteeNette = contactsBruts * (1 - doublons)
  const population = [...new Set(sups.map(p => p.gouvernorat))].reduce((s, g) => s + (GOV_POP[g] ?? 0), 0)
  const r2 = (v: number) => Math.round(v * 100) / 100

  const parMode = [...budgetMensuelParMode.entries()]
    .map(([mode, budget]) => ({
      mode,
      nb: sups.filter(p => p.mode === mode).length,
      budgetMensuel: Math.round(budget),
      contactsJ: sups.filter(p => p.mode === mode).reduce((s, p) => s + p.contactsJ, 0),
    }))
    .sort((a, b) => b.budgetMensuel - a.budgetMensuel)
  const parGouvMap = new Map<string, { nb: number; budgetMensuel: number; contactsJ: number }>()
  for (const p of sups) {
    const e = parGouvMap.get(p.gouvernorat) ?? { nb: 0, budgetMensuel: 0, contactsJ: 0 }
    e.nb += 1
    e.budgetMensuel += p.coutMensuel
    e.contactsJ += p.contactsJ
    parGouvMap.set(p.gouvernorat, e)
  }
  const parGouv = [...parGouvMap.entries()]
    .map(([gouvernorat, v]) => ({ gouvernorat, nb: v.nb, budgetMensuel: Math.round(v.budgetMensuel), contactsJ: v.contactsJ }))
    .sort((a, b) => b.contactsJ - a.contactsJ)

  const coutEffectifTotal = retenus.reduce((s, c) => s + c.coutEffectif, 0)

  // Transparence : budget non investi (vivier épuisé sous contraintes).
  const resteNonInvesti = budgetCible - (engage)
  if (resteNonInvesti > budgetCible * 0.05 && retenus.length < MAX_SUPPORTS) {
    explication.push(
      `${Math.round(resteNonInvesti).toLocaleString("fr-FR")} DT de la cible restent non investis : le vivier ne contient plus de support respectant à la fois le budget, les plafonds de couverture et le mix de modes — élargissez les filtres ou augmentez la durée.`,
    )
  }

  explication.push(
    `Objectif « ${aff.libelle} » — affinités de modes : ${Object.entries(aff.modes).map(([m, f]) => `${m} ×${f}`).join(", ")} ; plafond ${aff.capParGouv} supports par gouvernorat.`,
    `Vivier : ${candidats.length} supports disponibles${modes ? ` (modes filtrés : ${modes.join(", ")})` : ""}${gouvFiltre ? ` (zones filtrées : ${gouvFiltre.join(", ")})` : ""}.`,
    `Sélection gloutonne par efficacité (contacts ajustés ÷ coût effectif) sous contrainte de ${Math.round(budgetCible).toLocaleString("fr-FR")} DT → ${retenus.length} supports retenus, reste disponible ${Math.round(budgetCible - budgetEstime).toLocaleString("fr-FR")} DT (budget au prorata du simulateur ; coût régie avec engagements minimums : ${Math.round(coutEffectifTotal).toLocaleString("fr-FR")} DT).`,
  )

  return NextResponse.json({
    plan: {
      nbSupports: retenus.length,
      supports: sups.map(serializeSupport),
      budgetEstime: r2(budgetEstime),
      contactsBruts: Math.round(contactsBruts),
      porteeNette: Math.round(porteeNette),
      frequence: r2(porteeNette > 0 ? contactsBruts / porteeNette : 0),
      grp: r2(population > 0 ? (porteeNette / population) * 100 : 0),
      cpm: r2(contactsBruts > 0 ? budgetEstime / (contactsBruts / 1000) : 0),
      resteBudget: r2(budgetCible - budgetEstime),
      coutEffectifTotal: r2(coutEffectifTotal),
      parMode,
      parGouv,
      engagesLongs: retenus
        .filter(c => c.p.dureeMinMois > moisCampagne + 0.001)
        .map(c => ({ code: c.p.code, dureeMinMois: c.p.dureeMinMois })),
    },
    explication,
    nbCandidats: candidats.length,
    generatedAt: new Date().toISOString(),
  })
}
