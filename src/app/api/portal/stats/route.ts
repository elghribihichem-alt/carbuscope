import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// T53-T2 — extension ADDITIVE : le contrat historique (published,
// completenessPct, lastSync, moderationAlerts, historyCount) est conservé à
// l'identique (aucun renommage). Trois champs réels s'ajoutent pour le
// tableau de bord enseigne : note moyenne + volume d'avis (table Review,
// même source que /api/stats/reputation) et les 8 dernières traces
// d'historique (StationHistory, inclut le nom de la station).

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

  const [lastHistory, historyCount, myCodes, reviewsAgg, recentHistory] = await Promise.all([
    db.stationHistory.findFirst({
      where: { station: { brand: { slug: brand } } },
      orderBy: { createdAt: "desc" },
    }),
    db.stationHistory.count({ where: { station: { brand: { slug: brand } } } }),
    db.station.findMany({ where: { brand: { slug: brand } }, select: { code: true } }),
    // T53-T2 — note moyenne et volume d'avis réels de l'enseigne.
    db.review.aggregate({
      _avg: { rating: true },
      _count: true,
      where: { station: { brand: { slug: brand } } },
    }),
    // T53-T2 — 8 dernières traces réelles (station incluse pour l'affichage).
    db.stationHistory.findMany({
      where: { station: { brand: { slug: brand } } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true, field: true, oldValue: true, newValue: true,
        author: true, source: true, createdAt: true,
        station: { select: { code: true, name: true } },
      },
    }),
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
    // ---- T53-T2 (additif strict) ----
    avgRating: reviewsAgg._avg.rating === null ? null : Math.round(reviewsAgg._avg.rating * 10) / 10,
    reviewsCount: reviewsAgg._count,
    recentHistory: recentHistory.map(h => ({
      id: h.id,
      stationName: h.station.name,
      stationCode: h.station.code,
      field: h.field,
      oldValue: h.oldValue,
      newValue: h.newValue,
      author: h.author,
      source: h.source,
      createdAt: h.createdAt.toISOString(),
    })),
  })
}
