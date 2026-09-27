// GET /api/shadow/updates — historique du cycle de vie des points (T44)
// Filtres limit / kind / gouvernorat, tri date desc.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { updateDTO } from "@/app/api/shadow/_lib"

export const dynamic = "force-dynamic"

const KINDS = ["APPARITION", "DISPARITION", "REAPPARITION", "VOLUME", "PRIX", "TYPE", "DEPLACEMENT", "STATUT"]

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const limit = Math.min(300, Math.max(1, Number(sp.get("limit")) || 60))
  const kind = sp.get("kind")?.trim().toUpperCase() || null
  const gouvernorat = sp.get("gouvernorat")?.trim() || null

  if (kind && !KINDS.includes(kind)) {
    return NextResponse.json({ error: `kind invalide (${KINDS.join(", ")})` }, { status: 400 })
  }

  const where: Record<string, unknown> = {}
  if (kind) where.kind = kind
  if (gouvernorat) where.point = { gouvernorat }

  const [updates, total] = await Promise.all([
    db.shadowPointUpdate.findMany({
      where,
      orderBy: { date: "desc" },
      take: limit,
      include: { point: { select: { code: true, typologyCode: true, gouvernorat: true } } },
    }),
    db.shadowPointUpdate.count({ where }),
  ])

  return NextResponse.json({ updates: updates.map(updateDTO), total })
}
