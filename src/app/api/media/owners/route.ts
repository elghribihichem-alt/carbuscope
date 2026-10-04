// GET /api/media/owners — propriétaires physiques (régies, communes, privés)
// avec rattachement des panneaux. POST — création (SA).

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json400, json403, logMediaAudit } from "../_lib"
import { MEDIA_CAPS, type OwnerDTO } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageReferential) return json403("Gestion des propriétaires réservée à la Super Administration.")

  const owners = await db.mediaOwner.findMany({
    orderBy: { code: "asc" },
    select: {
      id: true, code: true, name: true, type: true, contact: true, phone: true, email: true, brandSlug: true,
      _count: { select: { panels: true } },
    },
  })
  const dto: OwnerDTO[] = owners.map(o => ({
    id: o.id, code: o.code, name: o.name, type: o.type,
    contact: o.contact, phone: o.phone, email: o.email, brandSlug: o.brandSlug,
    panelsCount: o._count.panels,
  }))
  return NextResponse.json({ owners: dto }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageReferential) return json403("Création réservée à la Super Administration.")

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return json400("Corps invalide.")
  const code = typeof b.code === "string" ? b.code.trim() : ""
  const name = typeof b.name === "string" ? b.name.trim() : ""
  if (!/^[A-Z0-9-]{3,20}$/.test(code)) return json400("Code requis (3-20 caractères).")
  if (name.length < 2) return json400("Nom requis.")
  if (await db.mediaOwner.findUnique({ where: { code } })) return json400("Ce code existe déjà.")
  const type = b.type === "COMMUNE" || b.type === "PRIVE" ? b.type : "REGIE"

  const owner = await db.mediaOwner.create({
    data: {
      code, name, type,
      contact: typeof b.contact === "string" && b.contact.trim() ? b.contact.trim() : null,
      phone: typeof b.phone === "string" && b.phone.trim() ? b.phone.trim() : null,
      email: typeof b.email === "string" && b.email.trim() ? b.email.trim() : null,
      brandSlug: typeof b.brandSlug === "string" && b.brandSlug.trim() ? b.brandSlug.trim() : null,
    },
  })
  await logMediaAudit(ctx, req, {
    action: "CREATE", entityType: "OWNER", entityId: owner.id, entityLabel: code, oldValue: "—", newValue: name,
  })
  return NextResponse.json({ owner })
}
