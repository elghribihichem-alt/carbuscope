import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand") ?? "agil"

  const [totalNational, brandRow, myActive, myRenovation, myLowTraffic, alerts] = await Promise.all([
    db.station.count(),
    db.brand.findUnique({ where: { slug: brand }, include: { _count: { select: { stations: true } } } }),
    db.station.findMany({
      where: { brand: { slug: brand }, status: "ACTIVE" },
      select: { traffic: true },
    }),
    db.station.count({ where: { brand: { slug: brand }, status: "RENOVATION" } }),
    db.station.count({ where: { brand: { slug: brand }, status: "ACTIVE", traffic: { lt: 1100 } } }),
    db.alert.findMany({ orderBy: { date: "desc" }, take: 60 }),
  ])

  const myStations = brandRow?._count.stations ?? 0
  const avgTraffic = myActive.length
    ? myActive.reduce((s, x) => s + x.traffic, 0) / myActive.length
    : 0

  const sevOrder: Record<string, number> = { CRITICAL: 0, MEDIUM: 1, INFO: 2 }
  const alertsFeed = [...alerts]
    .sort((a, b) => {
      const d = new Date(b.date).getTime() - new Date(a.date).getTime()
      return d !== 0 ? d : (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9)
    })
    .slice(0, 8)
    .map(a => ({
      id: a.id, type: a.type, severity: a.severity, title: a.title, description: a.description,
      brand: a.brand, gouvernorat: a.gouvernorat, date: a.date.toISOString(), impact: a.impact,
      stationCode: a.stationCode, read: a.read,
    }))

  return NextResponse.json({
    totalNational,
    myStations,
    marketSharePct: totalNational ? Math.round((myStations / totalNational) * 1000) / 10 : 0,
    toRenovate: myRenovation,
    underTension: myLowTraffic,
    avgTraffic: Math.round(avgTraffic),
    alerts: {
      critical: alerts.filter(a => a.severity === "CRITICAL").length,
      medium: alerts.filter(a => a.severity === "MEDIUM").length,
      info: alerts.filter(a => a.severity === "INFO").length,
      total: alerts.length,
    },
    alertsFeed,
  })
}
