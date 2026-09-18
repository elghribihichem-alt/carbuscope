import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand") ?? "agil"

  const stations = await db.station.findMany({
    where: { brand: { slug: brand } },
    include: { services: true },
  })

  const yearAgo = new Date()
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)

  let complete = 0
  for (const s of stations) {
    const score =
      (s.photoUrl ? 1 : 0) +
      (s.services.length >= 3 ? 1 : 0) +
      (s.address ? 1 : 0) +
      (s.lastVerified >= yearAgo ? 1 : 0)
    complete += score
  }
  const completenessPct = stations.length ? Math.round((complete / (stations.length * 4)) * 1000) / 10 : 0

  const [lastHistory, historyCount, myCodes] = await Promise.all([
    db.stationHistory.findFirst({
      where: { station: { brand: { slug: brand } } },
      orderBy: { createdAt: "desc" },
    }),
    db.stationHistory.count({ where: { station: { brand: { slug: brand } } } }),
    db.station.findMany({ where: { brand: { slug: brand } }, select: { code: true } }),
  ])

  const moderationAlerts = myCodes.length
    ? await db.contribution.count({
        where: { stationCode: { in: myCodes.map(s => s.code) }, status: "PENDING" },
      })
    : 0

  return NextResponse.json({
    published: stations.filter(s => s.status !== "PROJECT").length,
    completenessPct,
    lastSync: lastHistory?.createdAt.toISOString() ?? null,
    moderationAlerts,
    historyCount,
  })
}
