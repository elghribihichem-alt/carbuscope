// GET /api/media/members — membres de l'enseigne avec leur périmètre
// géographique média (réservé à l'administrateur enseigne — gestion des
// membres : rôles et périmètres).

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json403 } from "../_lib"
import { MEDIA_CAPS, type MemberMediaDTO } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageMembers) return json403("Gestion des membres réservée à l'administrateur enseigne.")

  const [users, settings] = await Promise.all([
    db.user.findMany({
      where: { brandSlug: ctx.brandSlug, active: true },
      orderBy: { name: "asc" },
      select: { id: true, email: true, name: true, role: true },
    }),
    db.mediaMemberSetting.findMany({ select: { userId: true, perimeterType: true, perimeterValue: true } }),
  ])
  const settingByUser = new Map(settings.map(s => [s.userId, s]))
  const dto: MemberMediaDTO[] = users.map(u => ({
    id: u.id, email: u.email, name: u.name, role: u.role,
    perimeterType: settingByUser.get(u.id)?.perimeterType ?? "TOUT",
    perimeterValue: (settingByUser.get(u.id)?.perimeterValue ?? {}) as MemberMediaDTO["perimeterValue"],
  }))
  return NextResponse.json({ members: dto }, { headers: { "Cache-Control": "no-store" } })
}
