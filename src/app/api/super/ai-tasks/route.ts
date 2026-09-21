import { NextRequest, NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { db } from "@/lib/db"
import { logAudit, serializeAiTask } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

// Agent IA interne (Phase 3 Super Admin) — tâches créées, exécutées et
// supprimées par la Super Administration. L'exécution est RÉELLE : l'instruction
// est envoyée au LLM serveur (z-ai-web-dev-sdk — BACKEND UNIQUEMENT) avec un
// prompt système CarbuScope et un garde-fou de délai de 120 s.

// ---- Moteur LLM (serveur uniquement) ----

// Instance mise en cache au niveau du module (pattern « reuse SDK instance »).
let zaiPromise: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null
function getZAI() {
  zaiPromise ??= ZAI.create()
  return zaiPromise
}

const SYSTEM_PROMPT =
  "Tu es l'Agent IA interne de CarbuScope — la plateforme SaaS tunisienne de pilotage des stations-service, des prix du carburant et de la veille concurrence. Tu assistes la Super Administration : analyses, synthèses, rédaction, recommandations. Contexte métier : enseignes tunisiennes (Agil, TotalEnergies, Shell, Staroil, Ola, indépendants), prix pompe fixés par décret ministériel, monnaie en dinars tunisiens (DT), découpage en gouvernorats. Réponds toujours en français, de façon structurée (sections courtes en gras si utile), concise (300 mots maximum) et actionnable."

/** Garde-fou de délai : 120 s. */
const AI_TIMEOUT_MS = 120_000

/** Réponse du LLM (shape partielle — le SDK renvoie Promise<any>). */
interface LlmChoice {
  message?: { content?: string | null }
}
interface LlmCompletion {
  choices?: LlmChoice[]
}

/** Appel LLM : prompt système (role « assistant », spécificité du SDK) + instruction. */
async function callLlm(instruction: string): Promise<string> {
  const zai = await getZAI()
  const completion = (await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: SYSTEM_PROMPT },
      { role: "user", content: instruction },
    ],
    thinking: { type: "disabled" },
  })) as LlmCompletion
  return completion.choices?.[0]?.message?.content?.trim() ?? ""
}

/** Secondes françaises à 1 décimale : « 12,4 ». */
function fmtSeconds(ms: number): string {
  return (ms / 1000).toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/**
 * Exécute une tâche IA : persiste EN_COURS + launchedAt (observabilité si
 * crash), appelle le LLM sous garde-fou de délai, puis TERMINEE ou ECHEC
 * (result/error, finishedAt, durationMs) + audit AGENT_IA. Renvoie la tâche
 * sérialisée dans son état final.
 */
async function executeAiTask(taskId: string, actor: string | undefined) {
  const task = await db.aiTask.update({
    where: { id: taskId },
    data: {
      status: "EN_COURS",
      launchedAt: new Date(),
      result: null,
      error: null,
      finishedAt: null,
      durationMs: null,
    },
  })

  const startedAt = Date.now()
  let status: "TERMINEE" | "ECHEC" = "ECHEC"
  let result: string | null = null
  let error: string | null = null

  try {
    // Promise.race : null = délai de 120 s dépassé (la promesse LLM « perdante »
    // reste absorbée par la course — pas de rejet non géré).
    const text = await Promise.race([
      callLlm(task.instruction),
      new Promise<null>(resolve => setTimeout(() => resolve(null), AI_TIMEOUT_MS)),
    ])
    if (text === null) {
      error = "Délai dépassé (120 s)"
    } else if (text === "") {
      error = "Réponse vide de l'agent IA"
    } else {
      status = "TERMINEE"
      result = text.slice(0, 20_000)
    }
  } catch (e) {
    error = `Agent IA indisponible — ${(e instanceof Error ? e.message : "erreur inconnue").slice(0, 120)}`
  }

  const durationMs = Date.now() - startedAt
  const updated = await db.aiTask.update({
    where: { id: taskId },
    data: { status, result, error, finishedAt: new Date(), durationMs },
  })

  await logAudit({
    kind: "AGENT_IA",
    message:
      status === "TERMINEE"
        ? `Tâche IA exécutée : « ${task.title} » — terminée en ${fmtSeconds(durationMs)} s`
        : `Tâche IA en échec : « ${task.title} » — ${error}`,
    actor,
  })

  return serializeAiTask(updated)
}

// ---- Routes ----

// GET /api/super/ai-tasks — tâches de l'agent IA, plus récentes d'abord.
export async function GET() {
  const tasks = await db.aiTask.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  return NextResponse.json({ tasks: tasks.map(serializeAiTask) })
}

// POST /api/super/ai-tasks — 3 actions : creer / executer / supprimer.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : undefined
  const action = body.action

  if (action === "creer") {
    const title = typeof body.title === "string" ? body.title.trim() : ""
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : ""
    if (title.length < 3 || title.length > 120) {
      return NextResponse.json(
        { error: "Titre requis — entre 3 et 120 caractères" },
        { status: 400 }
      )
    }
    if (instruction.length < 10 || instruction.length > 4000) {
      return NextResponse.json(
        { error: "Instruction requise — entre 10 et 4 000 caractères" },
        { status: 400 }
      )
    }

    const task = await db.aiTask.create({
      data: { title, instruction, status: "ENREGISTREE", createdBy: actor ?? "" },
    })

    // Lancement immédiat : un seul audit (celui de l'exécution, cf. A.4).
    if (body.lancer) {
      const done = await executeAiTask(task.id, actor)
      return NextResponse.json({ task: done }, { status: 201 })
    }

    await logAudit({
      kind: "AGENT_IA",
      message: `Tâche IA enregistrée : « ${title} »`,
      actor,
    })
    return NextResponse.json({ task: serializeAiTask(task) }, { status: 201 })
  }

  if (action === "executer") {
    const id = typeof body.id === "string" ? body.id : ""
    const task = id ? await db.aiTask.findUnique({ where: { id } }) : null
    if (!task) {
      return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 })
    }
    const done = await executeAiTask(task.id, actor)
    return NextResponse.json({ task: done })
  }

  if (action === "supprimer") {
    const id = typeof body.id === "string" ? body.id : ""
    const task = id ? await db.aiTask.findUnique({ where: { id } }) : null
    if (!task) {
      return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 })
    }
    await db.aiTask.delete({ where: { id: task.id } })
    await logAudit({
      kind: "AGENT_IA",
      message: `Tâche IA supprimée : « ${task.title} »`,
      actor,
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 400 })
}
