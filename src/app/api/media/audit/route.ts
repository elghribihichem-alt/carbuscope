// GET /api/media/audit — journal d'audit INALTÉRABLE (SA uniquement, ajout
// seul). Filtres : acteur, face, champ, période + pagination.

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json403 } from "../_lib"
import { MEDIA_CAPS, type MediaAuditDTO } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].readAudit) return json403("Journal réservé à la Super Administration.")

  const q = req.nextUrl.searchParams
  const actor = q.get("actor") || undefined
  const entityId = q.get("entityId") || undefined
  const field = q.get("field") || undefined
  const action = q.get("action") || undefined
  const from = q.get("from") ? new Date(q.get("from")!) : undefined
  const to = q.get("to") ? new Date(q.get("to")!) : undefined
  const page = Math.max(1, Number(q.get("p") ?? 1) || 1)
  const pageSize = 50

  const where = {
    ...(actor ? { actorEmail: actor } : {}),
    ...(entityId ? { entityId } : {}),
    ...(field ? { field: { contains: field } } : {}),
    ...(action ? { action } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  }
  const [total, entries] = await Promise.all([
    db.mediaAuditEntry.count({ where }),
    db.mediaAuditEntry.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ])

  const dto: MediaAuditDTO[] = entries.map(e => ({
    id: e.id, actorEmail: e.actorEmail, actorName: e.actorName, action: e.action,
    entityType: e.entityType, entityLabel: e.entityLabel, field: e.field,
    oldValue: e.oldValue, newValue: e.newValue, ip: e.ip, createdAt: e.createdAt.toISOString(),
  }))
  return NextResponse.json({ entries: dto, total, page, pages: Math.ceil(total / pageSize) })
}
