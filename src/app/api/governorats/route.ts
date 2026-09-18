import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  const [stats, grouped] = await Promise.all([
    db.governoratStat.findMany({ orderBy: { population: "desc" } }),
    db.station.groupBy({ by: ["gouvernorat"], _count: { _all: true } }),
  ])
  const counts = new Map(grouped.map(g => [g.gouvernorat, g._count._all]))
  return NextResponse.json({
    governorats: stats.map(g => ({
      name: g.name,
      population: g.population,
      vehicles: g.vehicles,
      motorizationRate: g.motorizationRate,
      avgFleetAge: g.avgFleetAge,
      delegationCount: g.delegationCount,
      stations: counts.get(g.name) ?? 0,
    })),
  })
}
