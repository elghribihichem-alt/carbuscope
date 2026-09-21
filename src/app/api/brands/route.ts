import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  const brands = await db.brand.findMany({
    orderBy: [{ isIndependents: "asc" }, { name: "asc" }],
    include: { _count: { select: { stations: true } } },
  })
  return NextResponse.json({
    brands: brands.map(b => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      color: b.color,
      isIndependents: b.isIndependents,
      stationCount: b._count.stations,
    })),
  })
}
