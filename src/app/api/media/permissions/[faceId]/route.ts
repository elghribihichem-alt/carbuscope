// PATCH /api/media/permissions/[faceId] — édition GUIDÉE des règles de
// visibilité d'une face (SA) : mode PUBLIQUE / GRANULAIRE / EXCLUSIVE,
// enseignes autorisées, interdictions (prioritaires), groupes, zones,
// conditions commerciales. Jamais de code brut : tout est structuré.
// POST — gestion des groupes d'enseignes (création / modification membres).

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json400, json403, json404, logMediaAudit } from "../../_lib"
import { MEDIA_CAPS } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const asStringArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.every(x => typeof x === "string") ? (v as string[]).slice(0, 30) : undefined

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ faceId: string }> }) {
  const { faceId } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageReferential) return json403("Permissions réservées à la Super Administration.")

  const face = await db.mediaFace.findUnique({ where: { id: faceId }, select: { code: true, visibilityMode: true } })
  if (!face) return json404()
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return json400("Corps invalide.")

  const mode = b.mode === "GRANULAIRE" || b.mode === "EXCLUSIVE" || b.mode === "PUBLIQUE" ? b.mode : undefined
  if (mode === "EXCLUSIVE" && typeof b.exclusiveBrandSlug !== "string") {
    return json400("Mode exclusif : l'enseigne réservataire est requise.")
  }

  const data: Record<string, unknown> = {}
  if (mode) data.visibilityMode = mode
  if (mode === "EXCLUSIVE") {
    data.exclusiveBrandSlug = (b.exclusiveBrandSlug as string).trim()
    data.allowedBrandSlugs = []
    data.excludedBrandSlugs = []
    data.allowedGroups = []
    data.allowedZones = []
    data.visibilityConditions = null
  } else if (mode === "PUBLIQUE") {
    data.exclusiveBrandSlug = null
    data.allowedBrandSlugs = []
    data.excludedBrandSlugs = []
    data.allowedGroups = []
    data.allowedZones = []
    data.visibilityConditions = null
  } else if (mode === "GRANULAIRE") {
    data.exclusiveBrandSlug = null
    const allowed = asStringArray(b.allowedBrandSlugs)
    if (allowed) data.allowedBrandSlugs = allowed
    const excluded = asStringArray(b.excludedBrandSlugs)
    if (excluded) data.excludedBrandSlugs = excluded
    const groups = asStringArray(b.allowedGroups)
    if (groups) data.allowedGroups = groups
    const zones = asStringArray(b.allowedZones)
    if (zones) data.allowedZones = zones
    if (b.conditions === null) data.visibilityConditions = null
    else if (b.conditions && typeof b.conditions === "object") {
      const c = b.conditions as Record<string, unknown>
      data.visibilityConditions = {
        ancienneteMinMois: Number.isFinite(Number(c.ancienneteMinMois)) && Number(c.ancienneteMinMois) >= 0 ? Math.trunc(Number(c.ancienneteMinMois)) : undefined,
        budgetMin: Number.isFinite(Number(c.budgetMin)) && Number(c.budgetMin) >= 0 ? Number(c.budgetMin) : undefined,
        typesEnseignes: Array.isArray(c.typesEnseignes) ? (c.typesEnseignes as string[]).slice(0, 10) : [],
      }
    }
  }
  if (Object.keys(data).length === 0) return json400("Aucune règle fournie.")

  await db.mediaFace.update({ where: { id: faceId }, data: data as never })
  await logMediaAudit(ctx, req, {
    action: "PERMISSION", entityType: "PERMISSION", entityId: faceId, entityLabel: face.code,
    field: `mode=${mode ?? face.visibilityMode}`,
    oldValue: face.visibilityMode,
    newValue: JSON.stringify(data).slice(0, 480),
  })
  return NextResponse.json({ ok: true })
}

// POST — groupes d'enseignes : { groupName, brandSlugs } crée ou met à jour.
export async function POST(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageReferential) return json403("Groupes réservés à la Super Administration.")
  const b = (await req.json().catch(() => null)) as { groupName?: string; brandSlugs?: string[] } | null
  if (!b || typeof b.groupName !== "string" || b.groupName.trim().length < 2) return json400("Nom de groupe requis.")
  const slugs = Array.isArray(b.brandSlugs) ? b.brandSlugs.filter(s => typeof s === "string") : []
  if (slugs.length === 0) return json400("Sélectionnez au moins une enseigne.")
  const name = b.groupName.trim()
  const existing = await db.mediaBrandGroup.findUnique({ where: { name } })
  if (existing) {
    await db.mediaBrandGroup.update({ where: { id: existing.id }, data: { brandSlugs: slugs } })
  } else {
    await db.mediaBrandGroup.create({ data: { name, brandSlugs: slugs } })
  }
  await logMediaAudit(ctx, req, {
    action: "PERMISSION", entityType: "PERMISSION", entityLabel: `Groupe ${name}`,
    oldValue: existing ? "mis à jour" : "—", newValue: slugs.join(", "),
  })
  return NextResponse.json({ ok: true })
}
