// GET /api/media/permissions — matrice enseigne × face (SA UNIQUEMENT).
// Interface guidée SANS code brut : règles de visibilité par face + liste des
// enseignes + groupes. L'édition passe par PATCH /permissions/[faceId].

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json403 } from "../_lib"
import { MEDIA_CAPS, type PermissionsMatrixResponse, type FaceRuleDTO } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageReferential) return json403("Interface de permissions réservée à la Super Administration.")

  const [faces, brands, groups] = await Promise.all([
    db.mediaFace.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true, code: true, visibilityMode: true, exclusiveBrandSlug: true,
        allowedBrandSlugs: true, excludedBrandSlugs: true, allowedGroups: true, allowedZones: true,
        visibilityConditions: true,
        panel: { select: { name: true, ville: true } },
      },
    }),
    db.brand.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true, color: true } }),
    db.mediaBrandGroup.findMany({ orderBy: { name: "asc" } }),
  ])

  const rules: FaceRuleDTO[] = faces.map(f => ({
    faceId: f.id,
    code: f.code,
    panelName: f.panel.name,
    ville: f.panel.ville,
    mode: f.visibilityMode,
    exclusiveBrandSlug: f.exclusiveBrandSlug,
    allowedBrandSlugs: (f.allowedBrandSlugs as string[]) ?? [],
    excludedBrandSlugs: (f.excludedBrandSlugs as string[]) ?? [],
    allowedGroups: (f.allowedGroups as string[]) ?? [],
    allowedZones: (f.allowedZones as string[]) ?? [],
    conditions: (f.visibilityConditions as FaceRuleDTO["conditions"]) ?? null,
  }))

  const dto: PermissionsMatrixResponse = {
    rules,
    brands: brands.filter(b => b.slug !== "independants"),
    groups: groups.map(g => ({ id: g.id, name: g.name, brandSlugs: (g.brandSlugs as string[]) ?? [] })),
  }
  return NextResponse.json(dto, { headers: { "Cache-Control": "no-store" } })
}
