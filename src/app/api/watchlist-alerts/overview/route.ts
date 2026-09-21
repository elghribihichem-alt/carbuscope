import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { computeWatchlist } from "@/lib/watchlist"
import { serializeRun } from "@/lib/alert-engine"
import type { BrandAlertsRow, AlertRunDetail } from "@/lib/types"

export const dynamic = "force-dynamic"

// GET /api/watchlist-alerts/overview — vue consolidée back-office de la veille
// automatisée : toutes les alertes de toutes les enseignes, état du terrain
// (watchlist par enseigne), totaux plateforme, prochaine passe planifiée et
// historique des passes du moteur (AlertRun).

export async function GET(req: NextRequest) {
  const limitRuns = Math.min(Math.max(Number(req.nextUrl.searchParams.get("runs")) || 8, 1), 25)

  const [alerts, brands, runs] = await Promise.all([
    db.watchlistAlert.findMany(),
    db.brand.findMany({ select: { slug: true, name: true, color: true } }),
    db.alertRun.findMany({ orderBy: { ranAt: "desc" }, take: limitRuns }),
  ])

  // Watchlist par enseigne ayant des alertes (état live du terrain).
  const watchlists = new Map<string, Awaited<ReturnType<typeof computeWatchlist>>>()
  for (const slug of new Set(alerts.map(a => a.brandSlug))) {
    watchlists.set(slug, await computeWatchlist(slug))
  }

  const brandRows: BrandAlertsRow[] = brands
    .map(brand => {
      const own = alerts.filter(a => a.brandSlug === brand.slug)
      const active = own.filter(a => a.active)
      const watchlist = watchlists.get(brand.slug) ?? []
      const worst = watchlist[0] ?? null
      return {
        slug: brand.slug,
        name: brand.name,
        color: brand.color,
        alertsTotal: own.length,
        alertsActive: active.length,
        watchlistCount: watchlist.length,
        worstDropName: worst ? worst.name : null,
        worstDropDelta: worst ? worst.delta : null,
        immediate: active.filter(a => a.frequency === "IMMEDIATE").length,
        daily: active.filter(a => a.frequency === "DAILY").length,
        weekly: active.filter(a => a.frequency === "WEEKLY").length,
        totalTriggers: own.reduce((acc, a) => acc + a.triggerCount, 0),
        lastTriggeredAt: own.reduce<string | null>((acc, a) => {
          const at = a.lastTriggeredAt?.toISOString() ?? null
          return at && (!acc || at > acc) ? at : acc
        }, null),
        activeEmails: new Set(active.map(a => a.email)).size,
      }
    })
    .filter(row => row.alertsTotal > 0)
    .sort((a, b) => b.alertsActive - a.alertsActive || b.totalTriggers - a.totalTriggers)

  const runsSerialized = runs.map(r => serializeRun({
    ...r,
    details: (r.details as AlertRunDetail[]) ?? [],
  }))

  // Prochaine passe planifiée : prochain 08:00 strictement futur (quotidien).
  const next8 = new Date()
  next8.setHours(8, 0, 0, 0)
  if (next8.getTime() <= Date.now()) next8.setDate(next8.getDate() + 1)
  const nextScheduledAt = next8.toISOString()

  const totals = {
    alertsTotal: alerts.length,
    alertsActive: alerts.filter(a => a.active).length,
    brandsCovered: brandRows.length,
    totalTriggers: alerts.reduce((acc, a) => acc + a.triggerCount, 0),
    emailsQueuedLastRun: runsSerialized[0]?.emailsQueued ?? 0,
    lastRunAt: runsSerialized[0]?.ranAt ?? null,
    nextScheduledAt,
  }

  return NextResponse.json({ totals, brands: brandRows, runs: runsSerialized })
}
