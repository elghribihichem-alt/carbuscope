import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { REVIEW_CRITERIA_LABELS } from "@/lib/types"

export const dynamic = "force-dynamic"

// /api/stats/reputation?brand=ola
// Réputation de l'enseigne connectée : avis clients, comparaison concurrents,
// tendance, critères, top/flop stations, flux récent + Indice de Valeur d'Enseigne (IVE).

const round1 = (n: number) => Math.round(n * 10) / 10

// IVE : Indice de Valeur d'Enseigne (0-100) — composite comparable entre enseignes
//   Note client 40 pts · Volume d'avis 20 pts · Expérience réseau 20 pts · Fraîcheur 20 pts
function computeIVE(input: {
  avgRating: number
  reviews: number
  stations: number
  active: number
  open24or7: number
  fresh90: number
}) {
  const { avgRating, reviews, stations, active, open24or7, fresh90 } = input
  const note = (avgRating / 5) * 40
  const volume = Math.min(1, stations ? reviews / (stations * 3) : 0) * 20 // 3 avis/station = maximum
  const exp = (stations ? active / stations : 0) * 10 + (stations ? open24or7 / stations : 0) * 10
  const fresh = (stations ? fresh90 / stations : 0) * 20
  return { note, volume, exp, fresh, total: note + volume + exp + fresh }
}

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brand")
  if (!brandSlug) return NextResponse.json({ error: "Paramètre 'brand' requis" }, { status: 400 })

  const [brand] = await db.brand.findMany({ where: { slug: brandSlug }, take: 1 })
  if (!brand) return NextResponse.json({ error: "Enseigne introuvable" }, { status: 404 })

  const [reviews, stations, brands] = await Promise.all([
    db.review.findMany({
      select: {
        id: true, author: true, rating: true, comment: true, criteria: true, createdAt: true,
        station: {
          select: { code: true, name: true, gouvernorat: true, brand: { select: { slug: true, name: true, color: true } } },
        },
      },
    }),
    db.station.findMany({
      select: {
        code: true, name: true, gouvernorat: true, status: true, open24: true, open7j: true,
        lastVerified: true, rating: true, reviewsCount: true,
        brand: { select: { slug: true } },
      },
    }),
    db.brand.findMany(),
  ])

  const now = Date.now()
  const DAY90 = 90 * 86400_000

  // --- Agrégats par enseigne ---
  type BrandAgg = {
    slug: string; name: string; color: string
    reviews: number; ratingSum: number
    stations: number; active: number; open24or7: number; fresh90: number
    dist: Record<number, number>
    criteriaSum: Record<string, { sum: number; n: number }>
    monthAvg: Map<string, { sum: number; n: number }>
  }
  const aggs = new Map<string, BrandAgg>()
  const init = (slug: string, name: string, color: string): BrandAgg => ({
    slug, name, color, reviews: 0, ratingSum: 0, stations: 0, active: 0, open24or7: 0, fresh90: 0,
    dist: {}, criteriaSum: {}, monthAvg: new Map(),
  })
  for (const b of brands) aggs.set(b.slug, init(b.slug, b.name, b.color))

  for (const s of stations) {
    const slug = s.brand?.slug
    if (!slug) continue
    const a = aggs.get(slug)
    if (!a) continue
    a.stations++
    if (s.status === "ACTIVE") a.active++
    if (s.open24 || s.open7j) a.open24or7++
    if (s.lastVerified && now - s.lastVerified.getTime() <= DAY90) a.fresh90++
  }

  for (const r of reviews) {
    const slug = r.station.brand?.slug
    if (!slug) continue
    const a = aggs.get(slug)
    if (!a) continue
    a.reviews++
    a.ratingSum += r.rating
    a.dist[r.rating] = (a.dist[r.rating] ?? 0) + 1
    const crit = (r.criteria ?? {}) as Record<string, unknown>
    for (const [key, val] of Object.entries(crit)) {
      const num = typeof val === "number" ? val : Number(val)
      if (!Number.isFinite(num) || num <= 0) continue
      const cur = a.criteriaSum[key] ?? { sum: 0, n: 0 }
      cur.sum += num
      cur.n++
      a.criteriaSum[key] = cur
    }
    const d = new Date(r.createdAt)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const m = a.monthAvg.get(month) ?? { sum: 0, n: 0 }
    m.sum += r.rating
    m.n++
    a.monthAvg.set(month, m)
  }

  // --- IVE par enseigne + classement ---
  const iveByBrand = new Map<string, ReturnType<typeof computeIVE>>()
  for (const [slug, a] of aggs) {
    if (a.slug === brand.slug || a.stations > 0) {
      iveByBrand.set(slug, computeIVE({
        avgRating: a.reviews ? a.ratingSum / a.reviews : 0,
        reviews: a.reviews, stations: a.stations,
        active: a.active, open24or7: a.open24or7, fresh90: a.fresh90,
      }))
    }
  }

  const totalReviews = reviews.length
  const marketRatingSum = [...aggs.values()].reduce((s, a) => s + a.ratingSum, 0)
  const marketAvg = totalReviews ? marketRatingSum / totalReviews : 0

  const brandComparison = [...aggs.values()]
    .map(a => {
      const ive = iveByBrand.get(a.slug)!
      return {
        slug: a.slug, name: a.name, color: a.color,
        avgRating: round1(a.reviews ? a.ratingSum / a.reviews : 0),
        reviewsCount: a.reviews,
        stationsCount: a.stations,
        shareOfVoice: totalReviews ? Math.round((a.reviews / totalReviews) * 1000) / 10 : 0,
        valueIndex: Math.round(ive.total),
      }
    })
    .sort((x, y) => y.avgRating - x.avgRating || y.reviewsCount - x.reviewsCount)

  const own = aggs.get(brand.slug)!
  const ownIve = iveByBrand.get(brand.slug)!

  // --- Détails de l'enseigne connectée ---
  const ownStations = stations.filter(s => s.brand?.slug === brand.slug)
  const ownReviews = reviews
    .filter(r => r.station.brand?.slug === brand.slug)
    .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())

  const distribution = [1, 2, 3, 4, 5].map(rating => ({ rating, count: own.dist[rating] ?? 0 }))
  const marketDistribution = [1, 2, 3, 4, 5].map(rating => ({
    rating,
    count: [...aggs.values()].reduce((s, a) => s + (a.dist[rating] ?? 0), 0),
  }))

  const critKeys = [...new Set([...Object.keys(REVIEW_CRITERIA_LABELS), ...Object.keys(own.criteriaSum)])]
  const criteria = critKeys.map(key => {
    const c = own.criteriaSum[key]
    return {
      key,
      label: REVIEW_CRITERIA_LABELS[key] ?? key,
      value: c && c.n ? round1(c.sum / c.n) : 0,
    }
  })
  const marketCriteria = critKeys.map(key => {
    let sum = 0, n = 0
    for (const a of aggs.values()) {
      const c = a.criteriaSum[key]
      if (c) { sum += c.sum; n += c.n }
    }
    return { key, label: REVIEW_CRITERIA_LABELS[key] ?? key, value: n ? round1(sum / n) : 0 }
  })

  // Tendance : 8 derniers mois observés dans les données
  const allMonths = new Set<string>()
  for (const a of aggs.values()) for (const m of a.monthAvg.keys()) allMonths.add(m)
  const months = [...allMonths].sort().slice(-8)
  const monthLabel = (m: string) => {
    const [y, mo] = m.split("-")
    return `${["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"][Number(mo) - 1]} ${y.slice(2)}`
  }

  const ownTrend = months.map(m => {
    const t = own.monthAvg.get(m)
    return t && t.n ? t.sum / t.n : 0
  })
  const ownTrendCounts = months.map(m => own.monthAvg.get(m)?.n ?? 0)
  const marketTrend = months.map(m => {
    let sum = 0, n = 0
    for (const a of aggs.values()) {
      const t = a.monthAvg.get(m)
      if (t) { sum += t.sum; n += t.n }
    }
    return n ? sum / n : 0
  })

  // Top / flop stations (minimum 3 avis pour être significatif)
  const ratedStations = ownStations
    .filter(s => s.reviewsCount >= 3 && s.rating > 0)
    .sort((a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount)
  const topStations = ratedStations.slice(0, 5).map(s => ({
    code: s.code, name: s.name, gouvernorat: s.gouvernorat, rating: s.rating, reviewsCount: s.reviewsCount,
  }))
  const flopStations = [...ratedStations].sort((a, b) => a.rating - b.rating || b.reviewsCount - a.reviewsCount)
    .slice(0, 5).map(s => ({
      code: s.code, name: s.name, gouvernorat: s.gouvernorat, rating: s.rating, reviewsCount: s.reviewsCount,
    }))

  const recentReviews = ownReviews.slice(0, 20).map(r => ({
    id: r.id, author: r.author, rating: r.rating, comment: r.comment,
    createdAt: r.createdAt.toISOString(),
    stationName: r.station.name, stationCode: r.station.code, gouvernorat: r.station.gouvernorat,
  }))

  // Classement IVE
  const iveRanking = [...iveByBrand.entries()]
    .map(([slug, ive]) => ({ slug, score: ive.total }))
    .sort((a, b) => b.score - a.score)
  const rank = iveRanking.findIndex(x => x.slug === brand.slug) + 1

  return NextResponse.json({
    fetchedAt: new Date().toISOString(),
    brand: { slug: brand.slug, name: brand.name, color: brand.color },
    own: {
      avgRating: round1(own.reviews ? own.ratingSum / own.reviews : 0),
      reviewsCount: own.reviews,
      stationsWithReviews: ownStations.filter(s => s.reviewsCount > 0).length,
      stationsTotal: own.stations,
      shareOfVoice: totalReviews ? Math.round((own.reviews / totalReviews) * 1000) / 10 : 0,
      distribution,
      criteria,
      trend: { months: months.map(monthLabel), values: ownTrend.map(round1), counts: ownTrendCounts },
      topStations,
      flopStations,
      recentReviews,
    },
    market: {
      avgRating: round1(marketAvg),
      reviewsCount: totalReviews,
      distribution: marketDistribution,
      criteria: marketCriteria,
      trend: { months: months.map(monthLabel), values: marketTrend.map(round1) },
      brandComparison,
    },
    valueIndex: {
      score: Math.round(ownIve.total),
      rank,
      brandsCount: aggs.size,
      details: [
        {
          key: "note", label: "Note client", points: round1(ownIve.note), max: 40,
          hint: "Moyenne des avis clients (note / 5 × 40 points).",
        },
        {
          key: "volume", label: "Volume d'avis", points: round1(ownIve.volume), max: 20,
          hint: "Densité d'avis par station (3 avis/station = 20 points).",
        },
        {
          key: "experience", label: "Expérience réseau", points: round1(ownIve.exp), max: 20,
          hint: "Stations actives et ouvertes 24h/24 ou 7j/7.",
        },
        {
          key: "fraicheur", label: "Fraîcheur des données", points: round1(ownIve.fresh), max: 20,
          hint: "Part des stations vérifiées il y a moins de 90 jours.",
        },
      ],
    },
  })
}
