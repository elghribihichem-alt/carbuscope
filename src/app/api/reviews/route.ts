import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const stationId = req.nextUrl.searchParams.get("stationId")
  if (!stationId) return NextResponse.json({ reviews: [] })
  const reviews = await db.review.findMany({
    where: { stationId },
    orderBy: { createdAt: "desc" },
    take: 30,
  })
  return NextResponse.json({
    reviews: reviews.map(r => ({
      id: r.id, stationId: r.stationId, author: r.author, rating: r.rating, comment: r.comment,
      criteria: r.criteria as Record<string, number> | null, createdAt: r.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.stationId || !body?.rating || !body?.author) {
    return NextResponse.json({ error: "Champs requis : stationId, author, rating" }, { status: 400 })
  }
  const station = await db.station.findUnique({ where: { id: body.stationId } })
  if (!station) return NextResponse.json({ error: "Station introuvable" }, { status: 404 })

  const review = await db.review.create({
    data: {
      stationId: body.stationId,
      author: String(body.author),
      rating: Math.max(1, Math.min(5, Number(body.rating))),
      comment: String(body.comment ?? ""),
      criteria: body.criteria ?? null,
    },
  })

  const agg = await db.review.aggregate({
    where: { stationId: body.stationId },
    _avg: { rating: true },
    _count: { _all: true },
  })
  await db.station.update({
    where: { id: body.stationId },
    data: {
      rating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
      reviewsCount: agg._count,
    },
  })

  return NextResponse.json({
    review: {
      id: review.id, stationId: review.stationId, author: review.author, rating: review.rating,
      comment: review.comment, criteria: review.criteria as Record<string, number> | null,
      createdAt: review.createdAt.toISOString(),
    },
  }, { status: 201 })
}
