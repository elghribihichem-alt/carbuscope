// GET  /api/media/filters — filtres sauvegardés du membre (explorateur).
// POST — enregistre un jeu de filtres sous un nom.

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json400, logMediaAudit } from "../_lib"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const rows = await db.mediaSavedFilter.findMany({
    where: { userEmail: guard.ctx.user.email },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({
    filters: rows.map(f => ({
      id: f.id, name: f.name, filters: (f.filters ?? {}) as Record<string, string>, createdAt: f.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  const b = (await req.json().catch(() => null)) as { name?: string; filters?: Record<string, string> } | null
  if (!b || typeof b.name !== "string" || b.name.trim().length < 1) return json400("Nom du filtre requis.")
  if (!b.filters || typeof b.filters !== "object") return json400("Filtres requis.")
  const row = await db.mediaSavedFilter.create({
    data: { userEmail: ctx.user.email, name: b.name.trim().slice(0, 60), filters: b.filters },
  })
  await logMediaAudit(ctx, req, {
    action: "CREATE", entityType: "FACE", entityLabel: `Filtre « ${row.name} »`, oldValue: "—", newValue: JSON.stringify(b.filters).slice(0, 200),
  })
  return NextResponse.json({
    filter: { id: row.id, name: row.name, filters: b.filters, createdAt: row.createdAt.toISOString() },
  })
}
