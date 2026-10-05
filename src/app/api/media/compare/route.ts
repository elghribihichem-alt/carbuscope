// POST /api/media/compare — MODE COMPARATEUR : 2 à 8 faces côte à côte.
// Seules les faces en accès FULL sont comparables (une face agrégée n'a pas
// de données détaillées — 400 explicite). Le score composite est calculé côté
// serveur avec les pondérations du membre (personnalisables, sauvegardées).

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json400, capsOf } from "../_lib"
import { compositeScore, type FaceFullDTO } from "@/lib/media/shared"
import { resolveFacesByIds, serializeFace } from "@/lib/media/permissions"
import { db } from "@/lib/db"
import { DEFAULT_SCORE_WEIGHTS } from "@/lib/media/shared"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!capsOf(ctx).export) return new NextResponse(JSON.stringify({ error: "Comparateur réservé aux rôles habilités." }), { status: 403, headers: { "Content-Type": "application/json" } })

  const b = (await req.json().catch(() => null)) as { faceIds?: string[] } | null
  if (!b || !Array.isArray(b.faceIds)) return json400("Sélection de faces requise.")
  const ids = [...new Set(b.faceIds)].slice(0, 8)
  if (ids.length < 2) return json400("Sélectionnez au moins 2 faces (2 à 8).")

  const resolved = await resolveFacesByIds(ctx, ids)
  const faces: FaceFullDTO[] = []
  for (const id of ids) {
    const r = resolved.get(id)
    if (!r) return json400("Une face sélectionnée n'existe pas dans votre périmètre.")
    if (r.access !== "FULL") return json400("Une face sélectionnée est en visibilité restreinte — retirez-la du comparateur.")
    faces.push(serializeFace(ctx, r.face, "FULL") as FaceFullDTO)
  }
  if (faces.length < 2) return json400("Sélectionnez au moins 2 faces.")

  const setting = await db.mediaMemberSetting.findUnique({ where: { userId: ctx.user.id } })
  const weights = { ...DEFAULT_SCORE_WEIGHTS, ...((setting?.scoreWeights as object) ?? {}) } as { audience: number; trafic: number; prix: number; partDeVoix: number }
  const scores = compositeScore(faces, weights)

  return NextResponse.json({ faces, scores, weights })
}
