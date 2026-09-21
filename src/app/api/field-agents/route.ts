import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { agentsWithStats } from "@/lib/missions"

export const dynamic = "force-dynamic"

// /api/field-agents (T28) — agents de veille terrain (un agent = une zone)
// GET   ?brand=&zone=&active= → agents + statistiques dérivées
// POST  { code, name, phone?, brandSlug, zone } → création d'un agent
// PATCH ?id= { active?, zone?, phone?, name? } → mise à jour (back-office)

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const brand = sp.get("brand")
  const zone = sp.get("zone")
  const active = sp.get("active")

  let agents = await agentsWithStats()
  if (brand) agents = agents.filter((a) => a.brandSlug === brand)
  if (zone) agents = agents.filter((a) => a.zone === zone)
  if (active === "true" || active === "false") agents = agents.filter((a) => a.active === (active === "true"))

  return NextResponse.json({ agents, total: agents.length })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : ""
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const brandSlug = typeof body?.brandSlug === "string" ? body.brandSlug.trim() : ""
  const zone = typeof body?.zone === "string" ? body.zone.trim() : ""

  if (!/^[A-Z0-9-]{3,12}$/.test(code)) {
    return NextResponse.json(
      { error: "Code agent : 3 à 12 caractères (lettres majuscules, chiffres, tirets)." },
      { status: 400 },
    )
  }
  if (!name || !brandSlug || !zone) {
    return NextResponse.json({ error: "Champs 'name', 'brandSlug' et 'zone' requis." }, { status: 400 })
  }

  const duplicate = await db.fieldAgent.findUnique({ where: { code } })
  if (duplicate) return NextResponse.json({ error: `Le code agent « ${code} » existe déjà.` }, { status: 409 })

  const agent = await db.fieldAgent.create({
    data: {
      code,
      name: name.slice(0, 120),
      phone: typeof body.phone === "string" ? body.phone.slice(0, 30) : "",
      brandSlug,
      zone,
    },
  })
  return NextResponse.json(
    {
      agent: {
        id: agent.id, code: agent.code, name: agent.name, phone: agent.phone,
        brandSlug: agent.brandSlug, zone: agent.zone, active: agent.active,
        createdAt: agent.createdAt.toISOString(),
        missionsTotal: 0, missionsOpen: 0, missionsDone: 0, reportsCount: 0,
      },
    },
    { status: 201 },
  )
}

export async function PATCH(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const id = sp.get("id")
  if (!id) return NextResponse.json({ error: "Paramètre 'id' requis." }, { status: 400 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Corps JSON requis." }, { status: 400 })

  const existing = await db.fieldAgent.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (typeof body.active === "boolean") {
    data.active = body.active
    if (!body.active) {
      // Désactivation : détacher les missions ouvertes de cet agent
      await db.mission.updateMany({
        where: { agentId: id, status: { in: ["PLANIFIEE", "EN_COURS"] } },
        data: { agentId: null, status: "PLANIFIEE" },
      })
    }
  }
  if (typeof body.zone === "string" && body.zone.trim()) data.zone = body.zone.trim()
  if (typeof body.phone === "string") data.phone = body.phone.slice(0, 30)
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 120)

  const updated = await db.fieldAgent.update({ where: { id }, data })
  return NextResponse.json({
    agent: {
      id: updated.id, code: updated.code, name: updated.name, phone: updated.phone,
      brandSlug: updated.brandSlug, zone: updated.zone, active: updated.active,
      createdAt: updated.createdAt.toISOString(),
      missionsTotal: 0, missionsOpen: 0, missionsDone: 0, reportsCount: 0,
    },
  })
}
