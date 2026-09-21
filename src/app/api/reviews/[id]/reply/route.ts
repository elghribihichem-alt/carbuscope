import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// /api/reviews/[id]/reply — réponse officielle de l'enseigne à un avis client (C.2.6+)
// POST   { text, by }  : publie ou met à jour la réponse
// DELETE               : retire la réponse

const MAX_LEN = 600

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  const text = typeof body?.text === "string" ? body.text.trim() : ""
  const by = typeof body?.by === "string" && body.by.trim() ? body.by.trim() : null

  if (!text) return NextResponse.json({ error: "Le texte de la réponse est requis." }, { status: 400 })
  if (text.length > MAX_LEN) {
    return NextResponse.json({ error: `La réponse ne peut dépasser ${MAX_LEN} caractères.` }, { status: 400 })
  }

  const review = await db.review.findUnique({
    where: { id },
    select: { id: true, station: { select: { brand: { select: { name: true } } } } },
  })
  if (!review) return NextResponse.json({ error: "Avis introuvable" }, { status: 404 })

  const updated = await db.review.update({
    where: { id },
    data: {
      replyText: text,
      repliedAt: new Date(),
      repliedBy: by ?? `Équipe ${review.station.brand?.name ?? "enseigne"}`,
    },
  })

  return NextResponse.json({
    reply: {
      reviewId: id,
      replyText: updated.replyText,
      repliedAt: updated.repliedAt?.toISOString() ?? null,
      repliedBy: updated.repliedBy,
    },
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const review = await db.review.findUnique({ where: { id }, select: { id: true } })
  if (!review) return NextResponse.json({ error: "Avis introuvable" }, { status: 404 })

  await db.review.update({
    where: { id },
    data: { replyText: null, repliedAt: null, repliedBy: null },
  })
  return NextResponse.json({ ok: true, reviewId: id })
}
