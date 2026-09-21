import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const status = sp.get("status")
  const limit = Math.min(Number(sp.get("limit") ?? 50), 200)
  const contributions = await db.contribution.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  })
  return NextResponse.json({
    contributions: contributions.map(c => ({
      id: c.id, stationCode: c.stationCode, type: c.type, comment: c.comment, photoUrl: c.photoUrl,
      author: c.author, status: c.status, validationCount: c.validationCount,
      lat: c.lat, lng: c.lng, createdAt: c.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.type || !body?.author) {
    return NextResponse.json({ error: "Champs requis : type, author" }, { status: 400 })
  }
  const c = await db.contribution.create({
    data: {
      stationCode: body.stationCode ? String(body.stationCode) : null,
      type: String(body.type),
      comment: String(body.comment ?? ""),
      photoUrl: body.photoUrl ? String(body.photoUrl) : null,
      author: String(body.author),
      lat: typeof body.lat === "number" ? body.lat : null,
      lng: typeof body.lng === "number" ? body.lng : null,
    },
  })
  return NextResponse.json({
    contribution: {
      id: c.id, stationCode: c.stationCode, type: c.type, comment: c.comment, photoUrl: c.photoUrl,
      author: c.author, status: c.status, validationCount: c.validationCount,
      lat: c.lat, lng: c.lng, createdAt: c.createdAt.toISOString(),
    },
  }, { status: 201 })
}

// Modération : validation (3 concordances → application) ou rejet
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.id || !body?.action) return NextResponse.json({ error: "id, action requis" }, { status: 400 })

  const c = await db.contribution.findUnique({ where: { id: String(body.id) } })
  if (!c) return NextResponse.json({ error: "Contribution introuvable" }, { status: 404 })

  if (body.action === "VALIDATE") {
    const nextCount = c.validationCount + 1
    const status = nextCount >= 3 ? "VALIDATED" : "PENDING"
    const updated = await db.contribution.update({
      where: { id: c.id },
      data: { validationCount: nextCount, status, updatedAt: new Date() },
    })
    if (status === "VALIDATED" && c.stationCode && c.type === "CLOSED") {
      const st = await db.station.findUnique({ where: { code: c.stationCode } })
      if (st) {
        await db.station.update({ where: { id: st.id }, data: { status: "CLOSED", traffic: 0 } })
        await db.stationHistory.create({
          data: {
            stationId: st.id, field: "statut", oldValue: st.status, newValue: "CLOSED",
            author: "Modération plateforme", source: "Utilisateur",
          },
        })
      }
    }
    return NextResponse.json({ ok: true, status: updated.status, validationCount: updated.validationCount })
  }

  if (body.action === "REJECT") {
    await db.contribution.update({ where: { id: c.id }, data: { status: "REJECTED", updatedAt: new Date() } })
    return NextResponse.json({ ok: true, status: "REJECTED" })
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 400 })
}
