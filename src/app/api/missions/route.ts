import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeMission, agentsWithStats } from "@/lib/missions"

export const dynamic = "force-dynamic"

// /api/missions (T28) — module veille terrain
// GET  ?brand=&agent=&agentCode=&status=&type=&competitor=&zone= → missions + agents
// POST { title, type, brandSlug, agentId?, zone, dueDate?, instructions?, tasks[] }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T.*)?$/

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const brand = sp.get("brand")
  const agent = sp.get("agent") // id agent
  const agentCode = sp.get("agentCode") // code agent (mobile)
  const status = sp.get("status")
  const type = sp.get("type")
  const competitor = sp.get("competitor") // slug enseigne observée
  const zone = sp.get("zone")

  let agentId = agent ?? undefined
  if (agentCode) {
    const a = await db.fieldAgent.findUnique({ where: { code: agentCode } })
    if (!a) return NextResponse.json({ missions: [], total: 0, agents: [] }, { status: 200 })
    agentId = a.id
  }

  const missions = await db.mission.findMany({
    where: {
      ...(brand ? { brandSlug: brand } : {}),
      ...(agentId ? { agentId } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(zone ? { zone } : {}),
      ...(competitor ? { type: "VEILLE_CONCURRENT", tasks: { some: { competitorSlug: competitor } } } : {}),
    },
    include: {
      agent: { select: { name: true, code: true } },
      tasks: { select: { status: true } },
    },
    orderBy: [
      { status: "asc" }, // ANNULEE < EN_COURS < PLANIFIEE < TERMINEE (alpha)
      { createdAt: "desc" },
    ],
    take: 200,
  })

  const serialized: Awaited<ReturnType<typeof serializeMission>>[] = []
  for (const m of missions) serialized.push(await serializeMission(m))

  return NextResponse.json({
    missions: serialized,
    total: serialized.length,
    agents: await agentsWithStats(),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "Champ 'title' requis." }, { status: 400 })
  }
  const type = body.type === "VEILLE_CONCURRENT" ? "VEILLE_CONCURRENT" : "CONTROLE"
  if (typeof body.brandSlug !== "string" || !body.brandSlug.trim()) {
    return NextResponse.json({ error: "Champ 'brandSlug' (enseigne commanditaire) requis." }, { status: 400 })
  }
  if (typeof body.zone !== "string" || !body.zone.trim()) {
    return NextResponse.json({ error: "Champ 'zone' (gouvernorat) requis." }, { status: 400 })
  }
  const tasks = Array.isArray(body.tasks) ? body.tasks : []
  if (tasks.length === 0) {
    return NextResponse.json({ error: "Au moins une cible (task) est requise." }, { status: 400 })
  }
  if (tasks.length > 30) {
    return NextResponse.json({ error: "Maximum 30 cibles par mission." }, { status: 400 })
  }

  // Validation de l'agent (doit être actif)
  let agentId: string | null = null
  if (typeof body.agentId === "string" && body.agentId) {
    const agent = await db.fieldAgent.findUnique({ where: { id: body.agentId } })
    if (!agent) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 })
    if (!agent.active) return NextResponse.json({ error: "Agent inactif — assignez un agent actif." }, { status: 409 })
    agentId = agent.id
  }

  let dueDate: Date | null = null
  if (typeof body.dueDate === "string" && ISO_DATE.test(body.dueDate)) {
    dueDate = new Date(body.dueDate)
    if (Number.isNaN(dueDate.getTime())) dueDate = null
  }

  const mission = await db.mission.create({
    data: {
      title: body.title.trim().slice(0, 140),
      type,
      brandSlug: body.brandSlug.trim(),
      agentId,
      zone: body.zone.trim(),
      status: agentId ? "EN_COURS" : "PLANIFIEE",
      dueDate,
      instructions: typeof body.instructions === "string" ? body.instructions.slice(0, 2000) : "",
      tasks: {
        create: tasks.map((t: Record<string, unknown>, i: number) => ({
          stationCode: typeof t.stationCode === "string" ? t.stationCode : null,
          stationName: typeof t.stationName === "string" ? t.stationName.slice(0, 160) : "",
          competitorSlug: typeof t.competitorSlug === "string" ? t.competitorSlug : null,
          targetLabel: typeof t.targetLabel === "string" ? t.targetLabel.slice(0, 200) : "Cible",
          lat: typeof t.lat === "number" ? t.lat : null,
          lng: typeof t.lng === "number" ? t.lng : null,
          taskType:
            type === "VEILLE_CONCURRENT"
              ? "VEILLE_CONCURRENT"
              : typeof t.taskType === "string" && t.taskType === "VEILLE_CONCURRENT"
                ? "VEILLE_CONCURRENT"
                : "CONTROLE_STATION",
          order: i,
        })),
      },
    },
    include: {
      agent: { select: { name: true, code: true } },
      tasks: { select: { status: true } },
    },
  })

  return NextResponse.json({ mission: await serializeMission(mission) }, { status: 201 })
}
