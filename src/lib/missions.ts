import { db } from "@/lib/db"

// T28 — module veille terrain : sérialisation et statistiques partagées
// entre /api/missions, /api/missions/[id], /api/reports et /api/field-agents.

export async function serializeMission(m: {
  id: string; title: string; type: string; brandSlug: string
  agentId: string | null; zone: string; status: string
  dueDate: Date | null; instructions: string; createdAt: Date
  agent?: { name: string; code: string } | null
  _count?: { tasks: number }
  tasks?: { status: string }[]
}) {
  const tasks = m.tasks ?? []
  return {
    id: m.id,
    title: m.title,
    type: m.type as "CONTROLE" | "VEILLE_CONCURRENT",
    brandSlug: m.brandSlug,
    agentId: m.agentId,
    agentName: m.agent?.name ?? null,
    agentCode: m.agent?.code ?? null,
    zone: m.zone,
    status: m.status as "PLANIFIEE" | "EN_COURS" | "TERMINEE" | "ANNULEE",
    dueDate: m.dueDate ? m.dueDate.toISOString() : null,
    instructions: m.instructions,
    createdAt: m.createdAt.toISOString(),
    tasksTotal: tasks.length || (m._count?.tasks ?? 0),
    tasksDone: tasks.filter((t) => t.status === "FAITE").length,
    tasksAnomaly: tasks.filter((t) => t.status === "ANOMALIE").length,
  }
}

export async function agentsWithStats() {
  const agents = await db.fieldAgent.findMany({
    orderBy: [{ brandSlug: "asc" }, { name: "asc" }],
  })
  const missions = await db.mission.findMany({ select: { agentId: true, status: true } })
  const reportCounts = await db.visitReport.groupBy({
    by: ["agentId"], _count: { _all: true },
  })
  const reportsBy = new Map(reportCounts.map((r) => [r.agentId, r._count._all]))
  return agents.map((a) => {
    const mine = missions.filter((m) => m.agentId === a.id)
    return {
      id: a.id, code: a.code, name: a.name, phone: a.phone,
      brandSlug: a.brandSlug, zone: a.zone, active: a.active,
      createdAt: a.createdAt.toISOString(),
      missionsTotal: mine.length,
      missionsOpen: mine.filter((m) => m.status === "PLANIFIEE" || m.status === "EN_COURS").length,
      missionsDone: mine.filter((m) => m.status === "TERMINEE").length,
      reportsCount: reportsBy.get(a.id) ?? 0,
    }
  })
}

/** Recalcule le statut d'une mission d'après ses tâches. */
export function missionStatusFromTasks(
  tasks: { status: string }[],
  current: string,
): "PLANIFIEE" | "EN_COURS" | "TERMINEE" | "ANNULEE" {
  if (current === "ANNULEE") return "ANNULEE"
  if (tasks.length > 0 && tasks.every((t) => t.status === "FAITE" || t.status === "ANOMALIE")) {
    return "TERMINEE"
  }
  return "EN_COURS"
}
