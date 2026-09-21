import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  const calcs = await db.savedCalculation.findMany({ orderBy: { createdAt: "desc" }, take: 50 })
  return NextResponse.json({
    calculations: calcs.map(c => ({
      id: c.id, type: c.type, label: c.label,
      params: c.params as Record<string, unknown>, result: c.result as Record<string, unknown>,
      createdAt: c.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.type || !body?.label) return NextResponse.json({ error: "type, label requis" }, { status: 400 })
  const c = await db.savedCalculation.create({
    data: {
      type: String(body.type),
      label: String(body.label),
      params: body.params ?? {},
      result: body.result ?? {},
    },
  })
  return NextResponse.json({
    calculation: {
      id: c.id, type: c.type, label: c.label,
      params: c.params as Record<string, unknown>, result: c.result as Record<string, unknown>,
      createdAt: c.createdAt.toISOString(),
    },
  }, { status: 201 })
}
