// Seed one-shot : alertes email programmées de veille des notes (C.2.6+).
// Crée 1-2 alertes réalistes par enseigne, calibrées sur la watchlist réelle de chacune.
// Exécution : bun prisma/seed-watch-alerts.ts
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

const round1 = (n: number) => Math.round(n * 10) / 10
const RECENT_WIN = 90 * 86400_000

type Watch = {
  code: string; name: string; gouvernorat: string
  previousRating: number; currentRating: number; delta: number
  lastLowAt: string | null
}

async function computeWatchlist(brandSlug: string): Promise<Watch[]> {
  const reviews = await db.review.findMany({
    where: { station: { brand: { slug: brandSlug } } },
    select: {
      rating: true, createdAt: true,
      station: { select: { code: true, name: true, gouvernorat: true } },
    },
  })
  const now = Date.now()
  const byStation = new Map<string, { recent: number[]; older: number[]; lastLowAt: Date | null }>()
  for (const r of reviews) {
    const w = byStation.get(r.station.code) ?? { recent: [], older: [], lastLowAt: null }
    const isRecent = now - r.createdAt.getTime() <= RECENT_WIN
    if (isRecent) {
      w.recent.push(r.rating)
      if (r.rating <= 3) w.lastLowAt = !w.lastLowAt || r.createdAt > w.lastLowAt ? r.createdAt : w.lastLowAt
    } else {
      w.older.push(r.rating)
    }
    byStation.set(r.station.code, w)
  }
  const out: Watch[] = []
  for (const [code, w] of byStation) {
    if (w.recent.length < 2 || w.older.length < 1) continue
    const cur = w.recent.reduce((a, b) => a + b, 0) / w.recent.length
    const prev = w.older.reduce((a, b) => a + b, 0) / w.older.length
    const delta = prev - cur
    if (cur <= 3.5 && delta >= 0.8) {
      out.push({
        code, name: "", gouvernorat: "",
        previousRating: round1(prev), currentRating: round1(cur), delta: round1(delta),
        lastLowAt: w.lastLowAt?.toISOString() ?? null,
      })
    }
  }
  return out.sort((a, b) => b.delta - a.delta)
}

async function main() {
  const brands = await db.brand.findMany()
  let created = 0

  for (const brand of brands) {
    const slug = brand.slug
    // Les indépendants (faible volume d'avis par station) n'ont pas de watchlist exploitable.
    const watch = await computeWatchlist(slug)
    if (watch.length === 0) continue

    // Compléter les libellés depuis les stations.
    const stations = await db.station.findMany({
      where: { brand: { slug } },
      select: { code: true, name: true, gouvernorat: true },
    })
    const byCode = new Map(stations.map(s => [s.code, s]))
    for (const w of watch) {
      w.name = byCode.get(w.code)?.name ?? w.code
      w.gouvernorat = byCode.get(w.code)?.gouvernorat ?? ""
    }

    // Alerte n°1 : toute la watchlist, seuil standard 0,8 pt, digest quotidien.
    const top = watch[0]
    const dailyCount = watch.filter(w => w.delta >= 0.8).length
    const dailyLast = watch.reduce<string | null>((acc, w) => {
      const at = w.lastLowAt
      return at && w.delta >= 0.8 && (!acc || at > acc) ? at : acc
    }, null)
    await db.watchlistAlert.create({
      data: {
        brandSlug: slug,
        scope: "ALL",
        stationLabel: "Toute la watchlist",
        thresholdPoints: 0.8,
        frequency: "DAILY",
        email: `qualite.${slug.replace(/[^a-z0-9]/gi, "")}@example.tn`,
        active: true,
        triggerCount: dailyCount,
        lastTriggeredAt: dailyLast ? new Date(dailyLast) : null,
      },
    })
    created++

    // Alerte n°2 (si la chute max est sévère) : station la plus touchée, seuil serré, immédiat.
    if (top.delta >= 1 && top.lastLowAt) {
      await db.watchlistAlert.create({
        data: {
          brandSlug: slug,
          scope: top.code,
          stationLabel: top.name,
          thresholdPoints: Math.max(0.5, round1(top.delta - 0.3)),
          frequency: "IMMEDIATE",
          email: `direction.${slug.replace(/[^a-z0-9]/gi, "")}@example.tn`,
          active: true,
          triggerCount: 1,
          lastTriggeredAt: new Date(top.lastLowAt),
        },
      })
      created++
    }
  }

  console.log(`✓ ${created} alertes de veille programmées pour les enseignes avec watchlist active.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
