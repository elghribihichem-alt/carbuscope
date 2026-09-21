import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const limit = Math.min(Number(sp.get("limit") ?? 120), 400)
  const type = sp.get("type")
  const brand = sp.get("brand")
  const movements = await db.movement.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(brand ? { brand: { contains: brand } } : {}),
    },
    orderBy: { date: "desc" },
    take: limit,
  })
  return NextResponse.json({ movements })
}
