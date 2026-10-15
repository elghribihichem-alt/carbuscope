// CarbuScope — T55-c — POST /api/radar/etude-ia : analyse de faisabilité RÉDIGÉE
// PAR IA (générative, bêta) pour un gouvernorat du module Opportunity Radar.
//
// FONCTIONNEMENT (strictement additif — aucune route existante modifiée) :
//   1. session enseigne OBLIGATOIRE (pattern requireSessionOr401 de radar/_lib,
//      401 sinon) ;
//   2. corps { gouvernorat, formatsTop? } — le gouvernorat doit faire partie
//      des 24 du moteur (400 FR sinon ; formatsTop = libellés éventuellement
//      passés par le client, sinon la route recalcule les formats via
//      src/lib/radar/formats.ts) ;
//   3. ASSEMBLAGE SERVEUR des données réelles : profil 5 critères 0-100 + poids
//      actifs + score (moteur scoring T54-B2), stations en service réelles,
//      pouvoir d'achat + foncier (PurchasingPower / LandIndicator), top 3
//      formats (recommendFormats), top 5 délégations (scoreDelegations),
//      verdict faisabilité 4 axes (computeFaisabilite T54-B3b) ;
//   4. appel LLM via z-ai-web-dev-sdk — BACKEND UNIQUEMENT (interdit côté
//      client) : système = analyste expansion senior, réponse attendue = JSON
//      strict { resume, pointsForts, risques, recommandations, conclusion } ;
//      retry 2× (backoff 400 ms / 1 s), délai global ~60 s (Promise.race),
//      échec de parsing → relance AVEC consigne renforcée ;
//   5. parsing robuste (blocs ```json éventuels retirés, JSON.parse
//      try/catch) + validation/sanitisation : champs présents et non vides,
//      coupe à 400 caractères par élément, 5 éléments maximum par liste,
//      strip des balises HTML ;
//   6. TRACE AiTask : créée au lancement (status EN_COURS — vocabulaire du
//      modèle : ENREGISTREE | EN_COURS | TERMINEE | ECHEC), mise à jour à la
//      fin (result = JSON parsé, durationMs, finishedAt, createdBy = e-mail
//      de la session, error le cas échéant). Titre stable
//      « Étude IA — {gouvernorat} » : c'est le marqueur de filtrage du suivi
//      SA (GET /api/radar/etude-ia/tasks) ;
//   7. rate-limit mémoire : 6 générations/heure/session (Map e-mail →
//      horodatages, purge à chaque contrôle + purge amortie — la quota se
//      consomme AU LANCEMENT de la génération : il protège le backend LLM,
//      les rejets de validation ne comptent pas), 429 FR + Retry-After ;
//   8. réponse 200 { analysis, taskId, gouvernorat, generatedAt, model } +
//      AuditEvent RADAR.
//
// ARBITRAGE (mission T55-c) : l'IA ENRICHIT, ne bloque JAMAIS — tout échec
// renvoie une erreur FR gracieuse (502) et le PDF template du volet faisabilité
// reste utilisable sans section IA (la carte cliente gère l'état d'erreur).
import { NextRequest, NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import { loadConfig, loadScoringInputs, requireSessionOr401 } from "../_lib"
import { GOV_REGION, scoreDelegations, scoreGouvernorats, zoneBlancheRatioThreshold } from "@/lib/radar/scoring"
import { recommendFormats } from "@/lib/radar/formats"
import { computeFaisabilite } from "@/lib/radar/faisabilite"

export const dynamic = "force-dynamic"

/* ============================== SDK LLM (serveur uniquement) ============================== */

// Instance mise en cache au niveau du module (pattern « reuse SDK instance »
// de /api/super/ai-tasks — jamais importé côté client).
let zaiPromise: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null
function getZAI() {
  zaiPromise ??= ZAI.create()
  return zaiPromise
}

// Prompt système (énoncé T55-c — rôle, langue, garde-fou factuel, JSON strict).
const SYSTEM_PROMPT =
  "Tu es un analyste expansion senior spécialisé stations-service Tunisie. Tu rédiges en FRANÇAIS professionnel, factuel, nuancé, sans inventer de chiffres absents des données. Réponds UNIQUEMENT avec un JSON valide."

/** Réponse du LLM (shape partielle — le SDK renvoie Promise<any>). */
interface LlmChoice {
  message?: { content?: string | null }
}
interface LlmCompletion {
  choices?: LlmChoice[]
}

/** Appel LLM : prompt système (role « assistant », spécificité du SDK) + contenu. */
async function callLlm(userPrompt: string): Promise<string> {
  const zai = await getZAI()
  const completion = (await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    thinking: { type: "disabled" },
  })) as LlmCompletion
  return completion.choices?.[0]?.message?.content?.trim() ?? ""
}

/* ============================== Constantes ============================== */

/** Délai global de génération (mission : ~60 s — l'UI annonce « jusqu'à une minute »). */
const AI_TIMEOUT_MS = 60_000
/** Retry 2× avec backoff (400 ms puis 1 s) après un échec d'appel. */
const RETRY_BACKOFF_MS: readonly number[] = [400, 1_000]
/** Rate-limit mémoire : 6 générations / heure / session. */
const RATE_LIMIT_MAX = 6
const RATE_WINDOW_MS = 60 * 60 * 1_000

/* ============================== Rate-limit (mémoire volatile) ============================== */

const generationLog = new Map<string, number[]>()

/** Consomme le quota d'une session → false + délai restant si dépassé. */
function takeQuota(email: string): { ok: boolean; retryAfterS: number } {
  const now = Date.now()
  const stamps = (generationLog.get(email) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  if (stamps.length >= RATE_LIMIT_MAX) {
    generationLog.set(email, stamps)
    const retryAfterS = Math.max(1, Math.ceil((stamps[0] + RATE_WINDOW_MS - now) / 1000))
    return { ok: false, retryAfterS }
  }
  stamps.push(now)
  generationLog.set(email, stamps)
  // Purge amortie des autres clés (la Map reste bornée en pratique).
  if (generationLog.size > 64) {
    for (const [key, val] of generationLog) {
      const kept = val.filter(t => now - t < RATE_WINDOW_MS)
      if (kept.length === 0) generationLog.delete(key)
      else generationLog.set(key, kept)
    }
  }
  return { ok: true, retryAfterS: 0 }
}

/* ============================== Analyse : type + parsing robuste ============================== */

export type EtudeIaAnalysis = {
  resume: string
  pointsForts: string[]
  risques: string[]
  recommandations: string[]
  conclusion: string
}

const MAX_ITEMS = 5
const MAX_ITEM_CHARS = 400
const MAX_TEXT_CHARS = 800

/** Sanitise une chaîne : strip des balises HTML, espaces normalisés, coupe. */
function cleanText(raw: unknown, maxChars: number): string {
  if (typeof raw !== "string") return ""
  return raw
    .replace(/<[^>]*>/g, "") // strip tags
    .replace(/[\u200b\u200e\u200f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars)
}

/** Sanitise une liste : éléments nettoyés, non vides, 5 maximum. */
function cleanList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const items = raw.map(v => cleanText(v, MAX_ITEM_CHARS)).filter(v => v.length > 0)
  return items.slice(0, MAX_ITEMS)
}

/** Retire un éventuel bloc de code markdown autour du JSON. */
function stripCodeFence(raw: string): string {
  let text = raw.trim()
  const fence = /^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/.exec(text)
  if (fence) text = fence[1].trim()
  // Repli : extraire l'objet JSON le plus externe si du texte l'entoure.
  if (!text.startsWith("{")) {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start >= 0 && end > start) text = text.slice(start, end + 1)
  }
  return text
}

/** Parse + valide la réponse de l'IA → null si non conforme. */
function parseAnalysis(raw: string): EtudeIaAnalysis | null {
  let obj: unknown
  try {
    obj = JSON.parse(stripCodeFence(raw))
  } catch {
    return null
  }
  if (obj == null || typeof obj !== "object") return null
  const o = obj as Record<string, unknown>
  const resume = cleanText(o.resume, MAX_TEXT_CHARS)
  const conclusion = cleanText(o.conclusion, MAX_TEXT_CHARS)
  const pointsForts = cleanList(o.pointsForts)
  const risques = cleanList(o.risques)
  const recommandations = cleanList(o.recommandations)
  if (!resume || !conclusion) return null
  if (pointsForts.length === 0 || risques.length === 0 || recommandations.length === 0) return null
  return { resume, pointsForts, risques, recommandations, conclusion }
}

/* ============================== Prompt utilisateur ============================== */

const fmtInt = (v: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number.isFinite(v) ? v : 0)
const fmt1 = (v: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(Number.isFinite(v) ? v : 0)

const CONSIGNE =
  'RÉDIGE MAINTENANT L\'ANALYSE : réponds UNIQUEMENT avec un JSON valide strictement conforme à ce schéma (aucun texte autour, aucune balise markdown) :\n' +
  '{"resume":"...","pointsForts":["...","...","..."],"risques":["...","...","..."],"recommandations":["...","...","..."],"conclusion":"..."}\n' +
  "Contraintes : \"resume\" = 3-4 phrases ; \"conclusion\" = 2-3 phrases ; listes de 3 à 5 éléments ; chaque élément ≤ 220 caractères ; français professionnel, factuel et nuancé ; utilise uniquement les chiffres fournis ci-dessus (n'en invente aucun)."

/** Consigne renforcée ajoutée après un échec de parsing (relance unique). */
const CONSIGNE_RENFORCEE =
  "\n\nATTENTION : ta réponse précédente n'était PAS un JSON valide conforme au schéma. Réponds cette fois UNIQUEMENT avec l'objet JSON demandé — sans introduction, sans conclusion textuelle, sans balise, avec exactement les 5 clés resume, pointsForts, risques, recommandations, conclusion."

/* ============================== POST ============================== */

export async function POST(req: NextRequest) {
  // ---- 1. Session enseigne obligatoire ----
  const session = await requireSessionOr401()
  if (!session.ok) {
    return NextResponse.json(
      { error: "Connexion requise — connectez-vous pour générer une analyse IA." },
      { status: 401 },
    )
  }

  // ---- 2. Corps + validations FR ----
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 })
  }
  const gouvernorat = typeof body.gouvernorat === "string" ? body.gouvernorat.trim() : ""
  if (!gouvernorat) {
    return NextResponse.json(
      { error: "Le gouvernorat est requis pour générer une étude IA." },
      { status: 400 },
    )
  }

  // formatsTop : libellés optionnels passés par le client (sinon recalcul serveur).
  let formatsTop: string[] | null = null
  if (body.formatsTop !== undefined) {
    if (!Array.isArray(body.formatsTop) || body.formatsTop.some(f => typeof f !== "string")) {
      return NextResponse.json(
        { error: "Champ « formatsTop » invalide : un tableau de libellés est attendu." },
        { status: 400 },
      )
    }
    formatsTop = (body.formatsTop as string[])
      .map(f => f.trim().slice(0, 60))
      .filter(f => f.length > 0)
      .slice(0, 5)
  }

  // ---- 3. Assemblage serveur des données réelles (moteurs gelés réutilisés) ----
  const [config, inputs] = await Promise.all([loadConfig(), loadScoringInputs()])
  const govs = scoreGouvernorats(inputs, config.weights)
  const profile = govs.find(g => g.name === gouvernorat)
  if (!profile) {
    return NextResponse.json(
      {
        error:
          "Gouvernorat inconnu — l'étude IA couvre les 24 gouvernorats du moteur de scoring (vérifiez l'orthographe).",
      },
      { status: 400 },
    )
  }

  // ---- Rate-limit (consommé au lancement — protège le backend LLM) ----
  const quota = takeQuota(session.email)
  if (!quota.ok) {
    const minutes = Math.max(1, Math.round(quota.retryAfterS / 60))
    return NextResponse.json(
      {
        error: `Trop de générations IA pour cette session (${RATE_LIMIT_MAX} maximum par heure) — patientez environ ${minutes} minute${minutes > 1 ? "s" : ""} avant de réessayer.`,
      },
      { status: 429, headers: { "Retry-After": String(quota.retryAfterS) } },
    )
  }

  const [purchasing, land] = await Promise.all([
    db.purchasingPower.findUnique({ where: { gouvernorat } }),
    db.landIndicator.findUnique({ where: { gouvernorat } }),
  ])

  const threshold = zoneBlancheRatioThreshold(inputs)
  const ratio = profile.stations > 0 ? profile.vehicles / profile.stations : 0
  const zoneBlanche = threshold > 0 && ratio > threshold

  const recos = recommendFormats(
    {
      name: profile.name,
      parc: profile.parc,
      pouvoir: profile.pouvoir,
      trafic: profile.trafic,
      concurrence: profile.concurrence,
      foncier: profile.foncier,
      vehicles: profile.vehicles,
      stations: profile.stations,
      score: profile.score,
      rank: profile.rank,
    },
    threshold,
  )

  const delegs = scoreDelegations(gouvernorat, inputs, config.weights)
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  const faisa = computeFaisabilite({
    profil: {
      gouvernorat,
      parc: profile.parc,
      pouvoir: profile.pouvoir,
      trafic: profile.trafic,
      concurrence: profile.concurrence,
      foncier: profile.foncier,
      vehicles: profile.vehicles,
      stations: profile.stations,
      population: profile.population,
      score: profile.score,
      rank: profile.rank,
    },
    land: land
      ? { pricePerM2: land.pricePerM2, availability: land.availability, urbanPressure: land.urbanPressure }
      : null,
    zoneBlanche,
  })

  // ---- Prompt utilisateur : données structurées + consigne de format ----
  const w = config.weights
  const regionFr =
    GOV_REGION[gouvernorat] === "GRAND_TUNIS"
      ? "Grand Tunis"
      : GOV_REGION[gouvernorat] === "NORD"
        ? "Nord"
        : GOV_REGION[gouvernorat] === "SUD"
          ? "Sud"
          : "Centre"
  const dataLines: string[] = [
    `ÉTUDE DE FAISABILITÉ D'IMPLANTATION — STATION-SERVICE (gouvernorat de ${gouvernorat})`,
    "",
    "DONNÉES RÉELLES DU MOTEUR CARBUSCOPE (source unique — n'invente aucun autre chiffre) :",
    `- Gouvernorat : ${gouvernorat} (${regionFr}) — rang ${profile.rank}/24 · score d'opportunité pondéré ${fmt1(profile.score)}/100`,
    `- Critères normalisés 0-100 : parc ${fmt1(profile.parc)} · pouvoir d'achat ${fmt1(profile.pouvoir)} · trafic ${fmt1(profile.trafic)} · concurrence (inverse de la densité concurrentielle) ${fmt1(profile.concurrence)} · foncier ${fmt1(profile.foncier)}`,
    `- Poids actifs du moteur : parc ${w.parc} % · pouvoir ${w.purchasing} % · trafic ${w.trafic} % · concurrence ${w.concurrence} % · foncier ${w.foncier} %`,
    `- Parc automobile réel (INS 2024) : ${fmtInt(profile.vehicles)} véhicules · population ${fmtInt(profile.population)} habitants`,
    `- Stations en service sur le territoire (concurrence réelle, toutes enseignes) : ${fmtInt(profile.stations)}`,
    `- Ratio véhicules/station : ${fmt1(ratio)}${zoneBlanche ? " — zone blanche (ratio supérieur au 3ᵉ quartile national)" : ""}`,
  ]
  if (purchasing) {
    dataLines.push(
      `- Pouvoir d'achat (est.) : indice ${fmt1(purchasing.index)}/100` +
        (purchasing.gdpPerCapita != null ? ` · PIB/habitant ${fmtInt(purchasing.gdpPerCapita)} DT/an` : "") +
        (purchasing.avgIncome != null ? ` · revenu moyen ${fmtInt(purchasing.avgIncome)} DT/mois` : ""),
    )
  }
  if (land) {
    dataLines.push(
      `- Foncier (est.) : ${land.pricePerM2 != null ? `${fmtInt(land.pricePerM2)} DT/m² · ` : ""}disponibilité ${fmt1(land.availability)}/100 · pression urbaine ${fmt1(land.urbanPressure)}/100`,
    )
  }
  dataLines.push(
    `- Verdict faisabilité (4 axes pondérés 40/25/20/15) : ${faisa.verdictLabel} — score ${fmt1(faisa.score)}/100 (${faisa.axes.map(a => `${a.label} ${fmt1(a.note)}`).join(" · ")})`,
    "",
  )

  // Top 3 formats : libellés client (formatsTop) le cas échéant, sinon moteur.
  dataLines.push("FORMATS DE STATION RECOMMANDÉS (adéquation 0-100) :")
  if (formatsTop && formatsTop.length > 0) {
    formatsTop.forEach((label, i) => {
      const reco = recos.find(r => r.format.nom === label)
      dataLines.push(
        `${i + 1}. ${label}${reco ? ` — adéquation ${fmt1(reco.adequation)}/100 — ${reco.justifications.join(" ; ")}` : ""}`,
      )
    })
  } else {
    recos.slice(0, 3).forEach((r, i) => {
      dataLines.push(`${i + 1}. ${r.format.nom} — adéquation ${fmt1(r.adequation)}/100 — ${r.justifications.join(" ; ")}`)
    })
  }
  dataLines.push("")

  if (delegs.length > 0) {
    dataLines.push("TOP DÉLÉGATIONS DU GOUVERNORAT (parc réel, score d'opportunité) :")
    delegs.forEach((d, i) => {
      dataLines.push(`${i + 1}. ${d.name} — ${fmtInt(d.parc ?? 0)} véhicules · score ${fmt1(d.score)}/100`)
    })
    dataLines.push("")
  }

  let userPrompt = dataLines.join("\n") + "\n" + CONSIGNE

  // ---- 4. Trace AiTask au lancement (EN_COURS — vocabulaire existant) ----
  const startedAt = Date.now()
  const task = await db.aiTask.create({
    data: {
      title: `Étude IA — ${gouvernorat}`,
      instruction: `Rédiger l'analyse de faisabilité du gouvernorat ${gouvernorat} (Opportunity Radar) : résumé, points forts, risques, recommandations, conclusion — JSON strict, données réelles du moteur de scoring.`,
      status: "EN_COURS",
      launchedAt: new Date(),
      createdBy: session.email,
    },
  })

  // ---- 5. Appels LLM : retry 2× (backoff 400 ms / 1 s), délai global 60 s ----
  let analysis: EtudeIaAnalysis | null = null
  let failure: { kind: "DELAI" | "VIDE" | "STRUCTURE" | "SERVICE"; detail: string } = {
    kind: "SERVICE",
    detail: "erreur inconnue",
  }
  const deadline = Date.now() + AI_TIMEOUT_MS

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const waitMs = RETRY_BACKOFF_MS[attempt - 1] ?? 1_000
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      failure = { kind: "DELAI", detail: "délai global de 60 s dépassé avant l'appel" }
      break
    }

    let text: string | null = null
    try {
      text = await Promise.race([
        callLlm(userPrompt),
        new Promise<null>(resolve => setTimeout(() => resolve(null), remaining)),
      ])
    } catch (e) {
      failure = {
        kind: "SERVICE",
        detail: e instanceof Error ? e.message.slice(0, 160) : "erreur inconnue",
      }
      text = null
    }

    if (text === null) {
      failure = { kind: "DELAI", detail: `délai de ${AI_TIMEOUT_MS / 1000} s dépassé pendant l'appel` }
      continue
    }
    if (text === "") {
      failure = { kind: "VIDE", detail: "réponse vide de l'IA" }
      continue
    }

    const parsed = parseAnalysis(text)
    if (parsed) {
      analysis = parsed
      break
    }
    // Échec de structure → relance avec consigne renforcée (conservée pour
    // l'éventuel 3ᵉ essai après un échec de transport).
    failure = { kind: "STRUCTURE", detail: "réponse non conforme au schéma JSON demandé" }
    if (!userPrompt.includes(CONSIGNE_RENFORCEE)) {
      userPrompt += CONSIGNE_RENFORCEE
    }
  }

  const durationMs = Date.now() - startedAt

  // ---- 6. Échec final : AiTask ECHEC + 502 FR gracieuse (rien ne bloque) ----
  if (!analysis) {
    await db.aiTask.update({
      where: { id: task.id },
      data: {
        status: "ECHEC",
        error: `${failure.kind} — ${failure.detail}`.slice(0, 240),
        finishedAt: new Date(),
        durationMs,
      },
    })
    await logAudit({
      acteur: { nom: session.email, email: session.email, role: session.role ?? "ADMIN" },
      module: "RADAR",
      action: "Analyse IA de faisabilité en échec",
      cibleType: "GOUVERNORAT",
      cibleLabel: gouvernorat,
      details: `AiTask ${task.id} · ${failure.kind} — ${failure.detail} · ${(durationMs / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`,
      severite: "NORMALE",
    })
    const message =
      failure.kind === "DELAI"
        ? "Le délai de génération a été dépassé (60 s) — réessayez."
        : failure.kind === "VIDE"
          ? "L'IA n'a renvoyé aucune réponse — réessayez."
          : failure.kind === "SERVICE"
            ? "Le service IA est momentanément indisponible — réessayez plus tard."
            : "L'analyse IA n'a pas pu être structurée — réessayez."
    return NextResponse.json({ error: message, taskId: task.id }, { status: 502 })
  }

  // ---- 7. Succès : AiTask TERMINEE + audit + réponse 200 ----
  const finished = await db.aiTask.update({
    where: { id: task.id },
    data: {
      status: "TERMINEE",
      result: JSON.stringify(analysis),
      error: null,
      finishedAt: new Date(),
      durationMs,
    },
  })

  await logAudit({
    acteur: { nom: session.email, email: session.email, role: session.role ?? "ADMIN" },
    module: "RADAR",
    action: "Analyse IA de faisabilité générée",
    cibleType: "GOUVERNORAT",
    cibleLabel: gouvernorat,
    details: `AiTask ${finished.id} · ${(durationMs / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s · ${analysis.pointsForts.length} points forts / ${analysis.risques.length} risques / ${analysis.recommandations.length} recommandations`,
    severite: "NORMALE",
  })

  const generatedAt = new Date().toISOString()
  return NextResponse.json({
    analysis,
    taskId: finished.id,
    gouvernorat,
    generatedAt,
    model: "IA générative (bêta)",
  })
}
