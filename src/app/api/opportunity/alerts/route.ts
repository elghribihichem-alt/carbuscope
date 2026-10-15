import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeAlert } from "@/lib/t51-server"

export const dynamic = "force-dynamic"

// T51 — Alertes du Radar d'Opportunités (nouvelles zones, seuils atteints,
// zones équipées). GET → dernières alertes. POST « lire » / « lire-toutes ».

export async function GET() {
  const alerts = await db.opportunityAlert.findMany({ orderBy: { createdAt: "desc" }, take: 40 })
  return NextResponse.json({ alerts: alerts.map(serializeAlert) })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }
  if (body.action === "lire") {
    const id = typeof body.alertId === "string" ? body.alertId : ""
    if (!id) return NextResponse.json({ error: "Paramètre « alertId » requis" }, { status: 400 })
    await db.opportunityAlert.update({ where: { id }, data: { read: true } })
    return NextResponse.json({ ok: true })
  }
  if (body.action === "lire-toutes") {
    await db.opportunityAlert.updateMany({ where: { read: false }, data: { read: true } })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: "Action inconnue" }, { status: 400 })
}
