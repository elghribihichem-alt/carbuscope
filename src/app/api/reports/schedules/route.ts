import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  const schedules = await db.reportSchedule.findMany({ orderBy: { createdAt: "desc" } })
  return NextResponse.json({
    schedules: schedules.map(s => ({
      id: s.id, name: s.name, type: s.type, target: s.target, channel: s.channel,
      active: s.active, createdAt: s.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.name) return NextResponse.json({ error: "Nom requis" }, { status: 400 })
  const s = await db.reportSchedule.create({
    data: {
      name: String(body.name),
      type: String(body.type ?? "WEEKLY"),
      target: String(body.target ?? "National"),
      channel: String(body.channel ?? "Email"),
    },
  })
  return NextResponse.json({
    schedule: {
      id: s.id, name: s.name, type: s.type, target: s.target, channel: s.channel,
      active: s.active, createdAt: s.createdAt.toISOString(),
    },
  }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: "id requis" }, { status: 400 })
  const s = await db.reportSchedule.update({
    where: { id: String(body.id) },
    data: { active: Boolean(body.active) },
  })
  return NextResponse.json({
    schedule: {
      id: s.id, name: s.name, type: s.type, target: s.target, channel: s.channel,
      active: s.active, createdAt: s.createdAt.toISOString(),
    },
  })
}
