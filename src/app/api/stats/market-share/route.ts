import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  const [brands, total] = await Promise.all([
    db.brand.findMany({ include: { _count: { select: { stations: true } } } }),
    db.station.count(),
  ])
  return NextResponse.json({
    data: brands
      .map(b => ({
        brand: b.name,
        slug: b.slug,
        color: b.color,
        stations: b._count.stations,
        sharePct: total ? Math.round((b._count.stations / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.stations - a.stations),
  })
}
