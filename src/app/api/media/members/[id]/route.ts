// PATCH /api/media/members/[id] — attribution du périmètre géographique média
// d'un membre de SON enseigne (TOUT / GOUVERNORATS / RAYON / POLYGONE).
// Réservé à l'administrateur enseigne. Audit MEMBRE.

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json400, json403, json404, logMediaAudit } from "../../_lib"
import { MEDIA_CAPS, toMediaRole } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const PERIMETER_TYPES = ["TOUT", "GOUVERNORATS", "RAYON", "POLYGONE"] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageMembers) return json403("Gestion des membres réservée à l'administrateur enseigne.")

  const member = await db.user.findUnique({ where: { id } })
  if (!member || member.brandSlug !== ctx.brandSlug) return json404()

  const b = (await req.json().catch(() => null)) as { perimeterType?: string; perimeterValue?: Record<string, unknown> } | null
  if (!b || typeof b.perimeterType !== "string" || !PERIMETER_TYPES.includes(b.perimeterType as never)) {
    return json400("Type de périmètre invalide (TOUT, GOUVERNORATS, RAYON, POLYGONE).")
  }
  const type = b.perimeterType as (typeof PERIMETER_TYPES)[number]
  let value: Record<string, unknown> = {}
  if (type === "GOUVERNORATS") {
    const list = (b.perimeterValue?.gouvernorats ?? []) as unknown
    if (!Array.isArray(list) || list.length === 0 || !list.every(g => typeof g === "string")) {
      return json400("Liste de gouvernorats requise (au moins un).")
    }
    value = { gouvernorats: list.slice(0, 24) }
  } else if (type === "RAYON") {
    const lat = Number(b.perimeterValue?.lat), lng = Number(b.perimeterValue?.lng), rayonKm = Number(b.perimeterValue?.rayonKm)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(rayonKm) || rayonKm <= 0 || rayonKm > 500) {
      return json400("Rayon invalide — centre (lat, lng) et rayonKm (1-500) requis.")
    }
    value = { lat, lng, rayonKm }
  } else if (type === "POLYGONE") {
    const poly = b.perimeterValue?.polygon as unknown
    if (!Array.isArray(poly) || poly.length < 3 || !poly.every(p => Array.isArray(p) && p.length === 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))) {
      return json400("Polygone invalide — au moins 3 points [lat, lng].")
    }
    value = { polygon: poly.slice(0, 50) }
  }

  const existing = await db.mediaMemberSetting.findUnique({ where: { userId: id } })
  if (existing) {
    await db.mediaMemberSetting.update({ where: { userId: id }, data: { perimeterType: type, perimeterValue: value as never } })
  } else {
    await db.mediaMemberSetting.create({
      data: {
        userId: id, perimeterType: type, perimeterValue: value as never,
        scoreWeights: { audience: 0.35, trafic: 0.25, prix: 0.2, partDeVoix: 0.2 },
        favoriteColumns: [], branding: {},
      },
    })
  }
  await logMediaAudit(ctx, req, {
    action: "MEMBRE", entityType: "MEMBRE", entityId: id, entityLabel: member.email,
    field: "périmètre géographique",
    oldValue: existing ? `${existing.perimeterType} ${JSON.stringify(existing.perimeterValue).slice(0, 120)}` : "TOUT",
    newValue: `${type} ${JSON.stringify(value).slice(0, 120)}`,
  })
  return NextResponse.json({
    ok: true,
    member: { id: member.id, email: member.email, name: member.name, role: toMediaRole(member.role), perimeterType: type, perimeterValue: value },
  })
}
