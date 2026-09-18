import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand") ?? "agil"

  const [mineGrouped, totalGrouped] = await Promise.all([
    db.station.groupBy({
      by: ["gouvernorat"],
      _count: { _all: true },
      where: { brand: { slug: brand } },
    }),
    db.station.groupBy({ by: ["gouvernorat"], _count: { _all: true } }),
  ])

  const mine = new Map(mineGrouped.map(g => [g.gouvernorat, g._count._all]))
  const total = new Map(totalGrouped.map(g => [g.gouvernorat, g._count._all]))
  const names = [...new Set([...mine.keys(), ...total.keys()])].sort((a, b) => (total.get(b) ?? 0) - (total.get(a) ?? 0))

  return NextResponse.json({
    data: names.map(name => ({
      gouvernorat: name,
      mine: mine.get(name) ?? 0,
      competitors: (total.get(name) ?? 0) - (mine.get(name) ?? 0),
      total: total.get(name) ?? 0,
    })),
  })
}
