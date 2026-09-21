import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeMission } from "@/lib/missions"

export const dynamic = "force-dynamic"

// /api/missions/[id] (T28) — détail et pilotage d'une mission
// GET    → mission + tasks (avec dernier rapport de visite)
// PATCH  { agentId?, status?, title?, instructions?, dueDate?, taskStatus? } 
//        (taskStatus appliqué à ?taskId= pour marquer une cible FAITE/ANOMALIE/TODO)
// DELETE → suppression (cascade tâches + rapports)

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T.*)?$/
const TASK_STATUSES = new Set(["TODO", "FAITE", "ANOMALIE"])
const MISSION_STATUSES = new Set(["PLANIFIEE", "EN_COURS", "TERMINEE", "ANNULEE"])

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const mission = await db.mission.findUnique({
    where: { id },
    include: {
      agent: { select: { name: true, code: true } },
      tasks: {
        orderBy: { order: "asc" },
        include: {
          reports: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { agent: { select: { name: true } } },
          },
        },
      },
    },
  })
  if (!mission) return NextResponse.json({ error: "Mission introuvable." }, { status: 404 })

  const base = await serializeMission(mission)
  return NextResponse.json({
    mission: {
      ...base,
      tasks: mission.tasks.map((t) => {
        const r = t.reports[0]
        return {
          id: t.id,
          missionId: t.missionId,
          stationCode: t.stationCode,
          stationName: t.stationName,
          competitorSlug: t.competitorSlug,
          targetLabel: t.targetLabel,
          lat: t.lat,
          lng: t.lng,
          taskType: t.taskType,
          status: t.status as "TODO" | "FAITE" | "ANOMALIE",
          order: t.order,
          lastReport: r
            ? {
                id: r.id,
                taskId: r.taskId,
                agentId: r.agentId,
                agentName: r.agent?.name ?? null,
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
            : null,
        }
      }),
    },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Corps JSON requis." }, { status: 400 })

  const existing = await db.mission.findUnique({ where: { id }, include: { tasks: { select: { status: true } } } })
  if (!existing) return NextResponse.json({ error: "Mission introuvable." }, { status: 404 })

  // --- Cas 1 : mise à jour du statut d'une cible (?taskId=) ---
  const sp = req.nextUrl.searchParams
  const taskId = sp.get("taskId")
  if (taskId) {
    const taskStatus = String(body.taskStatus ?? "")
    if (!TASK_STATUSES.has(taskStatus)) {
      return NextResponse.json({ error: "taskStatus invalide (TODO | FAITE | ANOMALIE)." }, { status: 400 })
    }
    const task = await db.missionTask.findFirst({ where: { id: taskId, missionId: id } })
    if (!task) return NextResponse.json({ error: "Cible introuvable pour cette mission." }, { status: 404 })
    await db.missionTask.update({ where: { id: taskId }, data: { status: taskStatus } })
  }

  // --- Cas 2 : assignation / pilotage global ---
  const data: Record<string, unknown> = {}
  if (typeof body.agentId === "string" || body.agentId === null) {
    if (body.agentId === null || body.agentId === "") {
      data.agentId = null
    } else {
      const agent = await db.fieldAgent.findUnique({ where: { id: body.agentId } })
      if (!agent) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 })
      if (!agent.active) return NextResponse.json({ error: "Agent inactif." }, { status: 409 })
      data.agentId = agent.id
    }
  }
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 140)
  if (typeof body.instructions === "string") data.instructions = body.instructions.slice(0, 2000)
  if (typeof body.dueDate === "string" && ISO_DATE.test(body.dueDate)) {
    const d = new Date(body.dueDate)
    if (!Number.isNaN(d.getTime())) data.dueDate = d
  }
  const explicitStatus = typeof body.status === "string" && MISSION_STATUSES.has(body.status) ? body.status : null
  if (explicitStatus) data.status = explicitStatus

  // Statut dérivé : uniquement si l'appelant n'a PAS imposé un statut explicite.
  // On relit les tâches APRÈS l'éventuelle mise à jour d'une cible (?taskId=).
  if (!explicitStatus) {
    const tasksNow = await db.missionTask.findMany({
      where: { missionId: id },
      select: { status: true },
    })
    if (tasksNow.length > 0) {
      if (tasksNow.every((t) => t.status === "FAITE" || t.status === "ANOMALIE")) {
        data.status = "TERMINEE"
      } else {
        const effectiveAgent = (data.agentId as string | null | undefined) ?? existing.agentId
        data.status = effectiveAgent ? "EN_COURS" : "PLANIFIEE"
      }
    }
  }

  const updated = await db.mission.update({
    where: { id },
    data,
    include: {
      agent: { select: { name: true, code: true } },
      tasks: { select: { status: true } },
    },
  })
  return NextResponse.json({ mission: await serializeMission(updated) })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.mission.findUnique({
    where: { id },
    include: { _count: { select: { tasks: true } } },
  })
  if (!existing) return NextResponse.json({ error: "Mission introuvable." }, { status: 404 })
  const hasReports = await db.visitReport.count({ where: { task: { missionId: id } } })
  if (hasReports > 0) {
    // Rapports déjà remontés : on annule au lieu de détruire l'historique terrain
    const cancelled = await db.mission.update({
      where: { id },
      data: { status: "ANNULEE" },
      include: { agent: { select: { name: true, code: true } }, tasks: { select: { status: true } } },
    })
    return NextResponse.json({
      mission: await serializeMission(cancelled),
      note: "Mission annulée (des rapports de visite existent — historique conservé).",
    })
  }
  await db.mission.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
