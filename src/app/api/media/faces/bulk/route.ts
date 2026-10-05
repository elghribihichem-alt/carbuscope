// POST /api/media/faces/bulk — édition EN MASSE : après sélection de lignes,
// l'utilisateur choisit un champ, saisit une valeur, PRÉVISUALISE les
// changements (preview: true → anciennes valeurs retournées, rien n'est
// écrit), puis valide (apply). Audit : une entrée par ligne modifiée.

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json400, json403, logMediaAudit, capsOf } from "../../_lib"
import { resolveFaceAccess } from "@/lib/media/permissions"
import { FIELD_BY_KEY } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard

  const body = (await req.json().catch(() => null)) as {
    ids?: string[]; field?: string; value?: unknown; preview?: boolean
  } | null
  if (!body || !Array.isArray(body.ids) || body.ids.length === 0 || typeof body.field !== "string") {
    return json400("Sélection et champ requis.")
  }
  if (body.ids.length > 200) return json400("200 lignes maximum par édition en masse.")

  const def = FIELD_BY_KEY[body.field]
  if (!def) return json400("Champ inconnu.")
  if (def.edit === "CALCULE") return json400("Champ calculé — non éditable.")

  const caps = capsOf(ctx)
  if (def.edit === "SA" && !caps.editAllFields) return json403("Champ réservé à la Super Administration.")
  if (def.edit === "GESTIONNAIRE" && !caps.editFaces) return json403("Édition réservée aux rôles gestionnaire et administrateur.")

  let typed: number | string | boolean | null
  if (def.type === "int" || def.type === "float") {
    const n = Number(body.value)
    if (!Number.isFinite(n)) return json400("Valeur numérique attendue.")
    if (def.type === "int" && !Number.isInteger(n)) return json400("Valeur entière attendue.")
    if (def.min !== undefined && n < def.min) return json400(`Minimum ${def.min}.`)
    if (def.max !== undefined && n > def.max) return json400(`Maximum ${def.max}.`)
    typed = def.type === "float" ? Math.round(n * 1000) / 1000 : n
  } else if (def.type === "bool") {
    if (typeof body.value !== "boolean") return json400("Booléen attendu.")
    typed = body.value
  } else {
    if (typeof body.value !== "string") return json400("Texte attendu.")
    if (body.value.length > 500) return json400("Texte trop long.")
    typed = body.value.trim() === "" ? null : body.value
  }

  const rows: { id: string; code: string; oldValue: unknown; face: Record<string, unknown> }[] = []
  for (const id of body.ids) {
    const face = (await db.mediaFace.findUnique({
      where: { id },
      select: {
        id: true, code: true, panel: { select: { lat: true, lng: true, governorat: true } },
        visibilityMode: true, exclusiveBrandSlug: true, allowedBrandSlugs: true, excludedBrandSlugs: true,
        allowedGroups: true, allowedZones: true, visibilityConditions: true,
      },
    })) as (Record<string, unknown> & { id: string; code: string; panel: { lat: number; lng: number; governorat: string } }) | null
    if (!face) continue
    const access = await resolveFaceAccess(ctx, face as never, face.panel.lat, face.panel.lng, face.panel.governorat)
    if (access !== "FULL") continue // écartée silencieusement — invisible/interdite
    const withField = await db.mediaFace.findUnique({ where: { id }, select: { id: true, code: true, [body.field]: true } }) as Record<string, unknown> | null
    rows.push({ id: face.id, code: face.code, oldValue: withField?.[body.field] ?? null, face })
  }
  if (rows.length === 0) return json403("Aucune face éditable dans la sélection.")

  if (body.preview) {
    return NextResponse.json({
      preview: true,
      count: rows.length,
      changes: rows.map(r => ({ id: r.id, code: r.code, oldValue: r.oldValue })),
    })
  }

  for (const r of rows) {
    await db.mediaFace.update({ where: { id: r.id }, data: { [body.field!]: typed } as never })
    await logMediaAudit(ctx, req, {
      action: "EDIT", entityType: "FACE", entityId: r.id, entityLabel: r.code,
      field: def.label,
      oldValue: r.oldValue === null || r.oldValue === undefined ? "—" : String(r.oldValue),
      newValue: typed === null ? "—" : String(typed),
    })
  }
  return NextResponse.json({ ok: true, updated: rows.length })
}
