// POST /api/media/permissions/preview — APERÇU EN DIRECT (SA) : « ce que verra
// TotalEnergies, ce que verra Agil, ce que verra un membre hors périmètre ».
// Résout la matrice complète pour une enseigne + un périmètre donné et
// retourne les comptages FULL / AGGREGE / NONE + un échantillon.

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json400, json403 } from "../../_lib"
import { MEDIA_CAPS, type PreviewResultDTO } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageReferential) return json403("Aperçu réservé à la Super Administration.")

  const b = (await req.json().catch(() => null)) as {
    brandSlug?: string; perimeterType?: string; perimeterValue?: Record<string, unknown>
  } | null
  if (!b || typeof b.brandSlug !== "string") return json400("Enseigne requise pour l'aperçu.")
  const brand = await db.brand.findUnique({ where: { slug: b.brandSlug } })
  if (!brand) return json400("Enseigne inconnue.")

  // contexte synthétique du point de vue de cette enseigne
  const contract = await db.saasContract.findUnique({ where: { brandSlug: b.brandSlug } })
  const contractAgeMonths = contract
    ? Math.max(0, Math.round((Date.now() - contract.startedAt.getTime()) / (30.4 * 86_400_000)))
    : 0
  const perimeterType = b.perimeterType === "GOUVERNORATS" || b.perimeterType === "RAYON" || b.perimeterType === "POLYGONE" ? b.perimeterType : "TOUT"
  const perimeterValue = (b.perimeterValue ?? {}) as Record<string, unknown>

  // résolution inline (même logique que permissions.ts — via import du résolveur)
  const { resolvePreviewForBrand } = await import("@/lib/media/preview")
  const result: PreviewResultDTO = await resolvePreviewForBrand({
    brandSlug: b.brandSlug,
    perimeterType,
    perimeterValue,
    contractAgeMonths,
  })
  return NextResponse.json(result)
}
