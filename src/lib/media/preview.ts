// CarbuScope — Module Média (T60) : aperçu en direct des permissions (SA).
// « Ce que verra TotalEnergies, ce que verra Agil, ce que verra un membre
// hors périmètre. » Résout la matrice complète avec un contexte synthétique
// du point de vue de l'enseigne choisie — même résolveur, zéro duplication
// de règles.

import { db } from "@/lib/db"
import type { PreviewResultDTO } from "./shared"
import { resolveFaceAccess, refreshGroupCache, type MediaCtx } from "./permissions"

type PreviewInput = {
  brandSlug: string
  perimeterType: string
  perimeterValue: Record<string, unknown>
  contractAgeMonths: number
}

export async function resolvePreviewForBrand(input: PreviewInput): Promise<PreviewResultDTO> {
  // contexte synthétique : un membre « lecteur » de l'enseigne choisie
  const ctx: MediaCtx = {
    user: {
      id: "preview", email: "preview@carbuscope.tn", name: "Aperçu", role: "VIEWER",
      brandSlug: input.brandSlug, brandName: null, totpEnabled: false, spaces: [],
    } as MediaCtx["user"],
    role: "LECTEUR",
    brandSlug: input.brandSlug,
    perimeterType: input.perimeterType,
    perimeterValue: input.perimeterValue as MediaCtx["perimeterValue"],
    contractAgeMonths: input.contractAgeMonths,
  }

  const faces = await db.mediaFace.findMany({
    select: {
      id: true, code: true,
      visibilityMode: true, exclusiveBrandSlug: true,
      allowedBrandSlugs: true, excludedBrandSlugs: true, allowedGroups: true, allowedZones: true,
      visibilityConditions: true,
      panel: { select: { lat: true, lng: true, governorat: true, ville: true } },
    },
    orderBy: { code: "asc" },
  })

  await refreshGroupCache()
  let full = 0, aggrege = 0, invisible = 0
  const sample: PreviewResultDTO["sample"] = []
  for (const f of faces) {
    const access = await resolveFaceAccess(ctx, f, f.panel.lat, f.panel.lng, f.panel.governorat)
    if (access === "FULL") full++
    else if (access === "AGGREGE") aggrege++
    else invisible++
    if (sample.length < 12 && access !== "FULL") {
      sample.push({ code: f.code, mode: access, ville: f.panel.ville })
    }
  }

  return {
    brandSlug: input.brandSlug,
    perimeterType: input.perimeterType,
    total: faces.length,
    full,
    aggrege,
    invisible,
    sample,
  }
}
