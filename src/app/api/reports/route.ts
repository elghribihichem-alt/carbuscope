import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { missionStatusFromTasks } from "@/lib/missions"

export const dynamic = "force-dynamic"

// /api/reports (T28) — rapports de visite terrain (application mobile agent)
// GET  ?missionId=&agentCode=&stationCode=&limit= → rapports (+ mission + agent)
// POST { taskId, agentCode, ...champs, anomaly? } → crée le rapport, met à jour
//      la cible (FAITE/ANOMALIE) et le statut de la mission (TERMINEE si tout fait).

function serializeReport(r: {
  id: string; taskId: string; agentId: string; stationCode: string | null
  gazolePrice: number | null; essencePrice: number | null; gplPrice: number | null
  queueMinutes: number | null; staffCount: number | null; cleanliness: number | null
  complianceScore: number | null; anomalies: string; competitorPractices: string | null
  notes: string; createdAt: Date
  agent?: { name: string } | null
  task?: { targetLabel: string; missionId: string; mission?: { title: string; brandSlug: string } | null } | null
}) {
  return {
    id: r.id,
    taskId: r.taskId,
    agentId: r.agentId,
    agentName: r.agent?.name ?? null,
    missionTitle: r.task?.mission?.title ?? null,
    missionBrand: r.task?.mission?.brandSlug ?? null,
    targetLabel: r.task?.targetLabel ?? null,
    stationCode: r.stationCode,
    gazolePrice: r.gazolePrice,
    essencePrice: r.essencePrice,
    gplPrice: r.gplPrice,
    queueMinutes: r.queueMinutes,
    staffCount: r.staffCount,
    cleanliness: r.cleanliness,
    complianceScore: r.complianceScore,
    anomalies: r.anomalies,
    competitorPractices: r.competitorPractices,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const missionId = sp.get("missionId")
  const agentCode = sp.get("agentCode")
  const stationCode = sp.get("stationCode")
  const limit = Math.min(Number(sp.get("limit") ?? 100), 300)

  let agentId: string | undefined
  if (agentCode) {
    const a = await db.fieldAgent.findUnique({ where: { code: agentCode } })
    agentId = a?.id
  }

  const reports = await db.visitReport.findMany({
    where: {
      ...(missionId ? { task: { missionId } } : {}),
      ...(agentId ? { agentId } : {}),
      ...(stationCode ? { stationCode } : {}),
    },
    include: {
      agent: { select: { name: true } },
      task: { select: { targetLabel: true, missionId: true, mission: { select: { title: true, brandSlug: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return NextResponse.json({ reports: reports.map(serializeReport), total: reports.length })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.taskId !== "string" || typeof body.agentCode !== "string") {
    return NextResponse.json({ error: "Champs 'taskId' et 'agentCode' requis." }, { status: 400 })
  }

  const agent = await db.fieldAgent.findUnique({ where: { code: body.agentCode } })
  if (!agent) return NextResponse.json({ error: "Code agent inconnu." }, { status: 404 })
  if (!agent.active) return NextResponse.json({ error: "Agent inactif — contactez votre superviseur." }, { status: 409 })

  const task = await db.missionTask.findUnique({
    where: { id: body.taskId },
    include: { mission: { select: { id: true, agentId: true, status: true } } },
  })
  if (!task) return NextResponse.json({ error: "Cible introuvable." }, { status: 404 })
  if (task.mission.status === "ANNULEE") {
    return NextResponse.json({ error: "Mission annulée — rapport refusé." }, { status: 409 })
  }
  if (task.mission.agentId && task.mission.agentId !== agent.id) {
    return NextResponse.json(
      { error: "Cette mission est assignée à un autre agent." },
      { status: 403 },
    )
  }

  const cleanliness = toIntOrNull(body.cleanliness)
  if (cleanliness !== null && (cleanliness < 1 || cleanliness > 5)) {
    return NextResponse.json({ error: "Propreté : entier entre 1 et 5." }, { status: 400 })
  }
  const complianceScore = toIntOrNull(body.complianceScore)
  if (complianceScore !== null && (complianceScore < 0 || complianceScore > 100)) {
    return NextResponse.json({ error: "Score de conformité : entier entre 0 et 100." }, { status: 400 })
  }
  for (const k of ["gazolePrice", "essencePrice", "gplPrice", "queueMinutes", "staffCount"] as const) {
    const v = toIntOrNull(body[k])
    if (v !== null && v < 0) return NextResponse.json({ error: `${k} doit être positif.` }, { status: 400 })
  }

  const anomaly = body.anomaly === true || !!body.anomalies?.trim?.()
  const report = await db.visitReport.create({
    data: {
      taskId: task.id,
      agentId: agent.id,
      stationCode: typeof body.stationCode === "string" ? body.stationCode : task.stationCode,
      gazolePrice: toIntOrNull(body.gazolePrice),
      essencePrice: toIntOrNull(body.essencePrice),
      gplPrice: toIntOrNull(body.gplPrice),
      queueMinutes: toIntOrNull(body.queueMinutes),
      staffCount: toIntOrNull(body.staffCount),
      cleanliness,
      complianceScore,
      anomalies: typeof body.anomalies === "string" ? body.anomalies.slice(0, 1000) : "",
      competitorPractices:
        typeof body.competitorPractices === "string" ? body.competitorPractices.slice(0, 1000) : null,
      notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : "",
    },
  })

  // Mise à jour de la cible puis de la mission
  await db.missionTask.update({
    where: { id: task.id },
    data: { status: anomaly ? "ANOMALIE" : "FAITE" },
  })
  const tasks = await db.missionTask.findMany({
    where: { missionId: task.missionId },
    select: { status: true },
  })
  const newStatus = missionStatusFromTasks(tasks, task.mission.status)
  await db.mission.update({
    where: { id: task.missionId },
    data: { status: newStatus, agentId: task.mission.agentId ?? agent.id },
  })

  return NextResponse.json(
    {
      report: serializeReport({ ...report, agent: { name: agent.name } }),
      taskStatus: anomaly ? "ANOMALIE" : "FAITE",
      missionStatus: newStatus,
    },
    { status: 201 },
  )
}
