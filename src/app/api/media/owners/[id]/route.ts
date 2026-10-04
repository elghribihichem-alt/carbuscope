// PATCH / DELETE /api/media/owners/[id] — modification / suppression d'un
// propriétaire (SA). Suppression refusée si des panneaux y sont rattachés.

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json400, json403, json404, logMediaAudit } from "../../_lib"
import { MEDIA_CAPS } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageReferential) return json403("Modification réservée à la Super Administration.")
  const owner = await db.mediaOwner.findUnique({ where: { id } })
  if (!owner) return json404()

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return json400("Corps invalide.")
  const data: Record<string, unknown> = {}
  for (const k of ["name", "type", "contact", "phone", "email", "brandSlug"] as const) {
    if (typeof b[k] === "string") data[k] = (b[k] as string).trim() || null
  }
  if (Object.keys(data).length === 0) return json400("Aucun champ fourni.")
  await db.mediaOwner.update({ where: { id }, data: data as never })
  await logMediaAudit(ctx, req, {
    action: "EDIT", entityType: "OWNER", entityId: id, entityLabel: owner.code,
    field: Object.keys(data).join(", "),
    oldValue: "—", newValue: JSON.stringify(data).slice(0, 480),
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageReferential) return json403("Suppression réservée à la Super Administration.")
  const owner = await db.mediaOwner.findUnique({ where: { id }, include: { _count: { select: { panels: true } } } })
  if (!owner) return json404()
  if (owner._count.panels > 0) {
    return json400(`${owner._count.panels} panneau(x) rattaché(s) — détachez-les d'abord.`)
  }
  await db.mediaOwner.delete({ where: { id } })
  await logMediaAudit(ctx, req, {
    action: "DELETE", entityType: "OWNER", entityId: id, entityLabel: owner.code, oldValue: "—", newValue: "—",
  })
  return NextResponse.json({ ok: true })
}
