import { db } from "@/lib/db"

// Règle partagée « Surveillance des notes » (C.2.6+) — utilisée par :
//   - /api/stats/reputation (carte Surveillance du portail)
//   - /api/watchlist-alerts (veille automatisée email)
// Stations en perte de vitesse : ≥ 2 avis récents (≤ 90 j) à moyenne ≤ 3,5
// et chute ≥ 0,8 pt vs moyenne historique (≥ 1 avis antérieur).

export type WatchEntry = {
  id: string
  code: string
  name: string
  gouvernorat: string
  previousRating: number
  currentRating: number
  delta: number
  recentCount: number
  lastLowReview: { author: string; rating: number; comment: string; createdAt: string } | null
}

const round1 = (n: number) => Math.round(n * 10) / 10
const RECENT_WIN = 90 * 86400_000

export async function computeWatchlist(brandSlug: string): Promise<WatchEntry[]> {
  const reviews = await db.review.findMany({
    where: { station: { brand: { slug: brandSlug } } },
    select: {
      author: true, rating: true, comment: true, createdAt: true,
      station: { select: { code: true, name: true, gouvernorat: true } },
    },
  })

  const now = Date.now()
  const watchByStation = new Map<
    string,
    {
      name: string; gouvernorat: string
      recent: number[]; older: number[]
      low: { author: string; rating: number; comment: string; createdAt: Date } | null
    }
  >()

  for (const r of reviews) {
    const entry = watchByStation.get(r.station.code) ?? {
      name: r.station.name, gouvernorat: r.station.gouvernorat,
      recent: [], older: [], low: null,
    }
    const isRecent = now - r.createdAt.getTime() <= RECENT_WIN
    if (isRecent) {
      entry.recent.push(r.rating)
      if (r.rating <= 3 && (!entry.low || r.createdAt > entry.low.createdAt)) {
        entry.low = { author: r.author, rating: r.rating, comment: r.comment, createdAt: r.createdAt }
      }
    } else {
      entry.older.push(r.rating)
    }
    watchByStation.set(r.station.code, entry)
  }

  const watchlist: WatchEntry[] = []
  for (const [code, w] of watchByStation) {
    if (w.recent.length < 2 || w.older.length < 1) continue
    const cur = w.recent.reduce((a, b) => a + b, 0) / w.recent.length
    const prev = w.older.reduce((a, b) => a + b, 0) / w.older.length
    const delta = prev - cur
    if (cur <= 3.5 && delta >= 0.8) {
      watchlist.push({
        id: "", // renseigné par l'appelant si besoin (fiche station)
        code, name: w.name, gouvernorat: w.gouvernorat,
        previousRating: round1(prev), currentRating: round1(cur), delta: round1(delta),
        recentCount: w.recent.length,
        lastLowReview: w.low
          ? { author: w.low.author, rating: w.low.rating, comment: w.low.comment, createdAt: w.low.createdAt.toISOString() }
          : null,
      })
    }
  }
  watchlist.sort((a, b) => b.delta - a.delta)
  return watchlist
}
