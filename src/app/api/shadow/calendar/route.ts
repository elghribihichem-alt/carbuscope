// GET/POST /api/shadow/calendar — calendrier des recensements (T44)
// GET : événements triés chronologiquement. POST : planification d'un
// nouvel événement (statut PLANIFIE).
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { eventDTO } from "@/app/api/shadow/_lib"

export const dynamic = "force-dynamic"

const KINDS = ["RECENSEMENT", "RECHECK", "VALIDATION"]

export async function GET() {
  const events = await db.shadowCensusEvent.findMany({ orderBy: { date: "asc" } })
  return NextResponse.json({ events: events.map(eventDTO) })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 })
  }

  const teamLabel = String(body.teamLabel ?? "").trim()
  const zone = String(body.zone ?? "").trim()
  if (!teamLabel || !zone) return NextResponse.json({ error: "teamLabel et zone requis" }, { status: 400 })

  const kind = String(body.kind ?? "RECENSEMENT").toUpperCase()
  if (!KINDS.includes(kind)) return NextResponse.json({ error: `kind invalide (${KINDS.join(", ")})` }, { status: 400 })

  const date = new Date(String(body.date ?? ""))
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Date invalide (ISO attendu)" }, { status: 400 })

  const pointsTargeted = Number(body.pointsTargeted)
  const event = await db.shadowCensusEvent.create({
    data: {
      teamLabel: teamLabel.slice(0, 120),
      zone: zone.slice(0, 160),
      kind,
      date,
      pointsTargeted: Number.isFinite(pointsTargeted) ? Math.max(0, Math.round(pointsTargeted)) : 0,
      pointsFound: 0,
      status: "PLANIFIE",
    },
  })
  return NextResponse.json({ event: eventDTO(event) }, { status: 201 })
}
