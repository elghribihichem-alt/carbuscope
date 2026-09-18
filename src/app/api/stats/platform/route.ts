import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// /api/stats/platform — tableau de bord back-office : données réelles de toute la plateforme.
// Qualité des fiches, modération, communauté, alertes, comptes et rapports.

const round1 = (n: number) => Math.round(n * 10) / 10

const MONTHS_FR = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"]
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-")
  return `${MONTHS_FR[Number(mo) - 1]} ${y.slice(2)}`
}

export async function GET() {
  const now = Date.now()
  const DAY90 = 90 * 86400_000

  const [stations, reviews, contributions, alerts, users, reports, stationServices] = await Promise.all([
    db.station.findMany({
      select: {
        status: true, rating: true, reviewsCount: true, lastVerified: true, open24: true, open7j: true,
        address: true, gouvernorat: true,
      },
    }),
    db.review.findMany({ select: { author: true, rating: true, createdAt: true } }),
    db.contribution.findMany({ select: { type: true, status: true, author: true, createdAt: true } }),
    db.alert.findMany({ select: { type: true, severity: true } }),
    db.user.findMany({ select: { role: true, active: true, name: true } }),
    db.report.findMany({ select: { status: true, type: true } }),
    db.stationService.findMany({ select: { stationId: true } }),
  ])

  // ---------- Qualité des fiches ----------
  const total = stations.length
  const rated = stations.filter(s => s.rating > 0).length
  const wellRated = stations.filter(s => s.reviewsCount >= 3).length
  const fresh = stations.filter(s => s.lastVerified && now - s.lastVerified.getTime() <= DAY90).length
  const h24 = stations.filter(s => s.open24 || s.open7j).length
  const withAddress = stations.filter(s => (s.address ?? "").trim().length > 0).length
  const serviceDensity = total ? stationServices.length / total : 0
  // Indice qualité global (0-100) : complétude 30 + notoriété 25 + fraîcheur 25 + services 20
  const qualityScore = total
    ? Math.round(
        (withAddress / total) * 30 +
        (wellRated / total) * 25 +
        (fresh / total) * 25 +
        Math.min(1, serviceDensity / 5) * 20
      )
    : 0

  // ---------- Avis & communauté ----------
  const reviewMonths = new Map<string, { reviews: number; authors: Set<string> }>()
  const reviewerCounts = new Map<string, number>()
  let ratingSum = 0
  for (const r of reviews) {
    ratingSum += r.rating
    reviewerCounts.set(r.author, (reviewerCounts.get(r.author) ?? 0) + 1)
    const k = monthKey(new Date(r.createdAt))
    const cur = reviewMonths.get(k) ?? { reviews: 0, authors: new Set<string>() }
    cur.reviews++
    cur.authors.add(r.author)
    reviewMonths.set(k, cur)
  }
  const months = [...reviewMonths.keys()].sort().slice(-8)
  const reviewTrend = months.map(m => {
    const t = reviewMonths.get(m)!
    return { month: monthLabel(m), reviews: t.reviews, authors: t.authors.size }
  })
  const topReviewers = [...reviewerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([author, count]) => ({ author, count }))

  // ---------- Modération ----------
  const byStatus: Record<string, number> = { PENDING: 0, VALIDATED: 0, REJECTED: 0 }
  const byType: Record<string, number> = {}
  const contributorCounts = new Map<string, number>()
  for (const c of contributions) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1
    byType[c.type] = (byType[c.type] ?? 0) + 1
    contributorCounts.set(c.author, (contributorCounts.get(c.author) ?? 0) + 1)
  }
  const topContributors = [...contributorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([author, count]) => ({ author, count }))
  const resolutionRate = contributions.length
    ? Math.round(((byStatus.VALIDATED + byStatus.REJECTED) / contributions.length) * 1000) / 10
    : 0

  // ---------- Alertes ----------
  const alertsBySeverity: Record<string, number> = { CRITICAL: 0, MEDIUM: 0, INFO: 0 }
  const alertsByType: Record<string, number> = {}
  for (const a of alerts) {
    alertsBySeverity[a.severity] = (alertsBySeverity[a.severity] ?? 0) + 1
    alertsByType[a.type] = (alertsByType[a.type] ?? 0) + 1
  }

  // ---------- Comptes & rapports ----------
  const usersByRole: Record<string, number> = {}
  for (const u of users) usersByRole[u.role] = (usersByRole[u.role] ?? 0) + 1
  const reportsByStatus: Record<string, number> = {}
  for (const r of reports) reportsByStatus[r.status] = (reportsByStatus[r.status] ?? 0) + 1

  return NextResponse.json({
    fetchedAt: new Date().toISOString(),
    stations: {
      total, rated, wellRated, fresh, h24, withAddress,
      servicesTotal: stationServices.length,
      avgServicesPerStation: round1(serviceDensity),
      qualityScore,
    },
    reviews: {
      total: reviews.length,
      avgRating: round1(reviews.length ? ratingSum / reviews.length : 0),
      distinctAuthors: reviewerCounts.size,
      trend: reviewTrend,
      topReviewers,
    },
    moderation: {
      total: contributions.length,
      byStatus,
      byType,
      resolutionRate,
      topContributors,
    },
    alerts: {
      total: alerts.length,
      bySeverity: alertsBySeverity,
      byType: Object.entries(alertsByType)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count })),
    },
    users: {
      total: users.length,
      active: users.filter(u => u.active).length,
      byRole: Object.entries(usersByRole).map(([role, count]) => ({ role, count })),
    },
    reports: {
      total: reports.length,
      byStatus: Object.entries(reportsByStatus).map(([status, count]) => ({ status, count })),
    },
  })
}
