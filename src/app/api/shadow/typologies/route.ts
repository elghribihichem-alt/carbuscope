// GET/POST/PATCH /api/shadow/typologies — catalogue des typologies (T44)
// Le catalogue est extensible : création et modification (label, couleur,
// volume indicatif, active) depuis Paramètres → Typologies.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { invalidateShadowCache } from "@/app/api/shadow/_lib"

export const dynamic = "force-dynamic"

const typologyDTO = (t: {
  code: string; label: string; description: string; icon: string
  color: string; volumeLJ: number; active: boolean; sortOrder: number
}) => ({
  code: t.code, label: t.label, description: t.description, icon: t.icon,
  color: t.color, volumeLJ: t.volumeLJ, active: t.active, sortOrder: t.sortOrder,
})

export async function GET() {
  const typologies = await db.shadowTypology.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] })
  return NextResponse.json({ typologies: typologies.map(typologyDTO) })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 })
  }

  const code = String(body.code ?? "").trim().toUpperCase()
  const label = String(body.label ?? "").trim()
  if (!/^[A-Z][A-Z0-9_]{1,30}$/.test(code)) {
    return NextResponse.json({ error: "Code invalide (MAJUSCULES/AZN/underscore, 2–31 caractères)" }, { status: 400 })
  }
  if (!label) return NextResponse.json({ error: "Libellé requis" }, { status: 400 })

  const existing = await db.shadowTypology.findUnique({ where: { code } })
  if (existing) return NextResponse.json({ error: "Ce code de typologie existe déjà" }, { status: 409 })

  const volumeLJ = Number(body.volumeLJ)
  const sortOrder = Number(body.sortOrder)
  const count = await db.shadowTypology.count()

  const t = await db.shadowTypology.create({
    data: {
      code,
      label: label.slice(0, 120),
      description: String(body.description ?? "").slice(0, 500),
      icon: String(body.icon ?? "circle").slice(0, 40),
      color: /^#[0-9A-Fa-f]{6}$/.test(String(body.color ?? "")) ? String(body.color) : "#E53935",
      volumeLJ: Number.isFinite(volumeLJ) ? Math.max(0, Math.min(100000, Math.round(volumeLJ))) : 200,
      sortOrder: Number.isFinite(sortOrder) ? Math.round(sortOrder) : count + 1,
      active: true,
    },
  })
  invalidateShadowCache()
  return NextResponse.json({ typology: typologyDTO(t) }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  // Identifiant accepté : code de typologie (ex. « BIDONS », exposé par le GET)
  // OU cuid interne — le DTO ne diffuse que le code, l'UI Paramètres →
  // Typologies patche donc par code.
  const id = req.nextUrl.searchParams.get("id")?.trim()
  if (!id) return NextResponse.json({ error: "Paramètre id requis" }, { status: 400 })

  const existing = (await db.shadowTypology.findUnique({ where: { code: id } }))
    ?? (await db.shadowTypology.findUnique({ where: { id } }))
  if (!existing) return NextResponse.json({ error: "Typologie introuvable" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (body.label !== undefined) {
    const v = String(body.label).trim()
    if (!v) return NextResponse.json({ error: "Libellé non vide" }, { status: 400 })
    data.label = v.slice(0, 120)
  }
  if (body.description !== undefined) data.description = String(body.description).slice(0, 500)
  if (body.icon !== undefined) data.icon = String(body.icon).slice(0, 40)
  if (body.color !== undefined) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(String(body.color))) return NextResponse.json({ error: "Couleur hex invalide" }, { status: 400 })
    data.color = String(body.color)
  }
  if (body.volumeLJ !== undefined) {
    const v = Number(body.volumeLJ)
    if (!Number.isFinite(v) || v < 0 || v > 100000) return NextResponse.json({ error: "volumeLJ invalide" }, { status: 400 })
    data.volumeLJ = Math.round(v)
  }
  if (body.active !== undefined) data.active = Boolean(body.active)
  if (body.sortOrder !== undefined) {
    const v = Number(body.sortOrder)
    if (!Number.isFinite(v)) return NextResponse.json({ error: "sortOrder invalide" }, { status: 400 })
    data.sortOrder = Math.round(v)
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 })

  const t = await db.shadowTypology.update({ where: { id: existing.id }, data })
  invalidateShadowCache()
  return NextResponse.json({ typology: typologyDTO(t) })
}
