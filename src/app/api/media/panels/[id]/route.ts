// PATCH /api/media/panels/[id] — modification d'un panneau (SA) : identité,
// support, localisation, photos, autorisation municipale, statut.
// DELETE — suppression (les faces partent en cascade).

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json400, json403, json404, logMediaAudit } from "../../_lib"
import { MEDIA_CAPS } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const PANEL_FIELDS: Record<string, "string" | "number" | "date" | "json"> = {
  name: "string", supportType: "string", format: "string", technology: "string",
  mediaType: "string", illumination: "string", status: "string", rue: "string",
  governorat: "string", delegation: "string", ville: "string", authorizationRef: "string",
  widthCm: "number", heightCm: "number", heightAboveGroundM: "number", lat: "number", lng: "number",
  authorizationStart: "date", authorizationEnd: "date",
  photos: "json",
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageReferential) return json403("Modification réservée à la Super Administration.")

  const panel = await db.mediaPanel.findUnique({ where: { id } })
  if (!panel) return json404()
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return json400("Corps invalide.")

  const data: Record<string, unknown> = {}
  const changes: string[] = []
  for (const [k, v] of Object.entries(body)) {
    const type = PANEL_FIELDS[k]
    if (!type) continue
    if (type === "string") data[k] = typeof v === "string" ? v.trim() : undefined
    else if (type === "number") {
      const n = Number(v)
      if (Number.isFinite(n)) data[k] = n
    } else if (type === "date") {
      if (v === null) data[k] = null
      else if (typeof v === "string" && !Number.isNaN(new Date(v).getTime())) data[k] = new Date(v)
    } else if (type === "json") {
      if (Array.isArray(v)) data[k] = v
    }
    if (data[k] !== undefined) changes.push(k)
  }
  if (Object.keys(data).length === 0) return json400("Aucun champ modifiable fourni.")

  await db.mediaPanel.update({ where: { id }, data: data as never })
  await logMediaAudit(ctx, req, {
    action: "EDIT", entityType: "PANEL", entityId: id, entityLabel: panel.code,
    field: changes.join(", "),
    oldValue: "—", newValue: changes.map(c => `${c}=${String(body[c])}`).join(" · ").slice(0, 480),
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageReferential) return json403("Suppression réservée à la Super Administration.")

  const panel = await db.mediaPanel.findUnique({ where: { id }, include: { _count: { select: { faces: true } } } })
  if (!panel) return json404()
  await db.mediaPanel.delete({ where: { id } })
  await logMediaAudit(ctx, req, {
    action: "DELETE", entityType: "PANEL", entityId: id,
    entityLabel: `${panel.code} (+${panel._count.faces} faces)`, oldValue: "—", newValue: "—",
  })
  return NextResponse.json({ ok: true })
}
