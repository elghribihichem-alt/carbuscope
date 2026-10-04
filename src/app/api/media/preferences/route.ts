// GET  /api/media/preferences — préférences du membre : pondérations du score
//      composite, colonnes favorites, branding PDF.
// PATCH — enregistrement (upsert de sa propre ligne).

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json400 } from "../_lib"
import { DEFAULT_SCORE_WEIGHTS } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const row = await db.mediaMemberSetting.findUnique({ where: { userId: guard.ctx.user.id } })
  return NextResponse.json({
    scoreWeights: { ...DEFAULT_SCORE_WEIGHTS, ...((row?.scoreWeights as object) ?? {}) },
    favoriteColumns: (row?.favoriteColumns as string[]) ?? [],
    branding: (row?.branding as { logoUrl?: string; couleur?: string; mention?: string }) ?? {},
  })
}

export async function PATCH(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  const b = (await req.json().catch(() => null)) as {
    scoreWeights?: Record<string, unknown>
    favoriteColumns?: unknown
    branding?: Record<string, unknown>
  } | null
  if (!b) return json400("Corps invalide.")

  const data: Record<string, unknown> = {}
  if (b.scoreWeights) {
    const w = b.scoreWeights
    const weights: Record<string, number> = {}
    for (const k of ["audience", "trafic", "prix", "partDeVoix"] as const) {
      const n = Number(w[k])
      if (Number.isFinite(n) && n >= 0 && n <= 1) weights[k] = n
    }
    if (Object.keys(weights).length === 0) return json400("Pondérations invalides (0 à 1).")
    data.scoreWeights = { ...DEFAULT_SCORE_WEIGHTS, ...weights }
  }
  if (Array.isArray(b.favoriteColumns)) {
    data.favoriteColumns = (b.favoriteColumns as unknown[]).filter(c => typeof c === "string").slice(0, 40)
  }
  if (b.branding && typeof b.branding === "object") {
    const br = b.branding as Record<string, unknown>
    data.branding = {
      logoUrl: typeof br.logoUrl === "string" ? br.logoUrl.slice(0, 300) : undefined,
      couleur: typeof br.couleur === "string" && /^#[0-9a-fA-F]{6}$/.test(br.couleur) ? br.couleur : undefined,
      mention: typeof br.mention === "string" ? br.mention.slice(0, 120) : undefined,
    }
  }
  if (Object.keys(data).length === 0) return json400("Aucune préférence fournie.")

  await db.mediaMemberSetting.upsert({
    where: { userId: ctx.user.id },
    update: data as never,
    create: {
      userId: ctx.user.id,
      perimeterType: "TOUT", perimeterValue: {},
      scoreWeights: (data.scoreWeights as object) ?? DEFAULT_SCORE_WEIGHTS,
      favoriteColumns: (data.favoriteColumns as string[]) ?? [],
      branding: (data.branding as object) ?? {},
    },
  })
  return NextResponse.json({ ok: true })
}
