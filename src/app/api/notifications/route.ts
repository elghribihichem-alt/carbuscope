import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { NotificationDTO } from "@/lib/types"

export const dynamic = "force-dynamic"

// /api/notifications?brand=agil — centre de notifications in-app enseigne (C.2.6+)
// GET   : dernières notifications de l'enseigne + compteur de non-lues
// PATCH : { action: "READ_ALL" } ou { id } → marque comme lues

type NotificationRow = {
  id: string; brandSlug: string; kind: string; title: string; body: string
  stationLabel: string | null; deltaPoints: number | null; alertRunId: string | null
  read: boolean; createdAt: Date
}

function serialize(n: NotificationRow): NotificationDTO {
  return {
    id: n.id,
    brandSlug: n.brandSlug,
    kind: n.kind,
    title: n.title,
    body: n.body,
    stationLabel: n.stationLabel,
    deltaPoints: n.deltaPoints,
    alertRunId: n.alertRunId,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  }
}

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand")?.trim().toLowerCase() ?? ""
  if (!brand) {
    return NextResponse.json({ error: "Paramètre « brand » requis." }, { status: 400 })
  }
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 30) || 30, 100)

  const [rows, unread, total] = await Promise.all([
    db.notification.findMany({
      where: { brandSlug: brand },
      orderBy: { createdAt: "desc" },
      take: limit,
    }) as Promise<NotificationRow[]>,
    db.notification.count({ where: { brandSlug: brand, read: false } }),
    db.notification.count({ where: { brandSlug: brand } }),
  ])

  return NextResponse.json(
    { notifications: rows.map(serialize), unread, total },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function PATCH(req: NextRequest) {
  let payload: { action?: string; brand?: string; id?: string }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 })
  }

  if (payload.action === "READ_ALL") {
    const brand = (payload.brand ?? "").trim().toLowerCase()
    if (!brand) {
      return NextResponse.json({ error: "Champ « brand » requis." }, { status: 400 })
    }
    const updated = await db.notification.updateMany({
      where: { brandSlug: brand, read: false },
      data: { read: true },
    })
    return NextResponse.json({ updated: updated.count })
  }

  if (payload.id) {
    try {
      await db.notification.update({ where: { id: payload.id }, data: { read: true } })
      return NextResponse.json({ updated: 1 })
    } catch {
      return NextResponse.json({ error: "Notification introuvable." }, { status: 404 })
    }
  }

  return NextResponse.json(
    { error: "Fournir { action: \"READ_ALL\", brand } ou { id }." },
    { status: 400 },
  )
}
