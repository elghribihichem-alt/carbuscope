import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeAudit, logAudit } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

// GET /api/super/audit?limit= — journal d'audit (plus récent d'abord).
export async function GET(req: NextRequest) {
  const limitRaw = req.nextUrl.searchParams.get("limit")
  const limit = Math.min(Math.max(parseInt(limitRaw ?? "60", 10) || 60, 1), 200)
  const events = await db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: limit })
  return NextResponse.json({ events: events.map(serializeAudit) })
}

// POST /api/super/audit — journalise un événement (ex. prise de main).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.kind || !body?.message) {
    return NextResponse.json({ error: "Champs « kind » et « message » requis" }, { status: 400 })
  }
  try {
    const event = await logAudit({
      kind: body.kind,
      message: body.message,
      actor: body.actor,
      brandSlug: body.brandSlug ?? null,
    })
    return NextResponse.json({ event: serializeAudit(event) }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, { status: 400 })
  }
}
