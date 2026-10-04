// DELETE /api/media/filters/[id] — suppression d'un filtre sauvegardé (le sien).

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json404 } from "../../_lib"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const row = await db.mediaSavedFilter.findUnique({ where: { id } })
  if (!row || row.userEmail !== guard.ctx.user.email) return json404()
  await db.mediaSavedFilter.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
