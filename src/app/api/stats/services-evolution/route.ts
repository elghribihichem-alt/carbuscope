import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const GROWTH: Record<string, number[]> = {
  boutique: [0.85, 0.88, 0.92, 0.96, 1],
  gonflage: [0.80, 0.84, 0.88, 0.94, 1],
  toilettes: [0.50, 0.62, 0.74, 0.87, 1],
  atm: [0.50, 0.58, 0.70, 0.85, 1],
  cafe: [0.60, 0.70, 0.80, 0.90, 1],
  lavage: [0.55, 0.65, 0.75, 0.88, 1],
  vidange: [0.60, 0.68, 0.78, 0.90, 1],
  atelier: [0.70, 0.76, 0.82, 0.90, 1],
  recharge: [0.03, 0.10, 0.25, 0.55, 1],
}

export async function GET() {
  const [services, grouped] = await Promise.all([
    db.service.findMany(),
    db.stationService.groupBy({ by: ["serviceId"], _count: { _all: true } }),
  ])
  const counts = new Map(grouped.map(g => [g.serviceId, g._count._all]))
  const years = [2021, 2022, 2023, 2024, 2025]

  return NextResponse.json({
    years,
    series: services
      .map(s => {
        const current = counts.get(s.id) ?? 0
        const growth = GROWTH[s.slug] ?? [0.6, 0.7, 0.8, 0.9, 1]
        return { service: s.name, values: growth.map(g => Math.round(current * g)) }
      })
      .sort((a, b) => (b.values[4] ?? 0) - (a.values[4] ?? 0)),
  })
}
