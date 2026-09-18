import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { computeWatchlist } from "@/lib/watchlist"

export const dynamic = "force-dynamic"

// /api/watchlist-alerts?brand=agil — veille automatisée des notes (C.2.6+)
// GET  : alertes programmées de l'enseigne + évaluation live contre la watchlist courante
// POST : programme une nouvelle alerte email (validation + simulation du 1er déclenchement)

const FREQUENCIES = new Set(["IMMEDIATE", "DAILY", "WEEKLY"])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type AlertRow = {
  id: string; scope: string; stationLabel: string; thresholdPoints: number
  frequency: string; email: string; active: boolean; triggerCount: number
  lastTriggeredAt: Date | null; createdAt: Date
}

type Serialized = {
  id: string
  scope: string
  stationLabel: string
  thresholdPoints: number
  frequency: string
  email: string
  active: boolean
  triggerCount: number
  lastTriggeredAt: string | null
  createdAt: string
  // Évaluation live (état actuel de la watchlist)
  nowExceedCount: number
  nowExamples: string[]
}

// Évalue une alerte contre la watchlist courante : combien de stations dépassent
// le seuil programmé, avec quelques exemples nommés + date du dernier avis défavorable.
function evaluateLive(
  scope: string,
  threshold: number,
  watchlist: Awaited<ReturnType<typeof computeWatchlist>>,
) {
  const exceeded = watchlist.filter(w => w.delta >= threshold)
  const relevant = scope === "ALL"
    ? exceeded
    : exceeded.filter(w => w.code === scope)
  const lastLowAt = relevant.reduce<string | null>((acc, w) => {
    const at = w.lastLowReview?.createdAt ?? null
    return at && (!acc || at > acc) ? at : acc
  }, null)
  return {
    nowExceedCount: relevant.length,
    nowExamples: relevant.slice(0, 3).map(w => w.name),
    lastLowAt,
  }
}

function serialize(
  a: AlertRow,
  live: { nowExceedCount: number; nowExamples: string[] },
): Serialized {
  return {
    id: a.id, scope: a.scope, stationLabel: a.stationLabel,
    thresholdPoints: Math.round(a.thresholdPoints * 10) / 10,
    frequency: a.frequency, email: a.email, active: a.active,
    triggerCount: a.triggerCount,
    lastTriggeredAt: a.lastTriggeredAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    nowExceedCount: live.nowExceedCount,
    nowExamples: live.nowExamples,
  }
}

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brand")
  if (!brandSlug) return NextResponse.json({ error: "Paramètre 'brand' requis" }, { status: 400 })

  const [brand] = await db.brand.findMany({ where: { slug: brandSlug }, take: 1 })
  if (!brand) return NextResponse.json({ error: "Enseigne introuvable" }, { status: 404 })

  const [alerts, watchlist] = await Promise.all([
    db.watchlistAlert.findMany({ where: { brandSlug }, orderBy: { createdAt: "desc" } }),
    computeWatchlist(brandSlug),
  ])

  return NextResponse.json({
    watchlistCount: watchlist.length,
    alerts: alerts.map(a => serialize(a, evaluateLive(a.scope, a.thresholdPoints, watchlist))),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const brandSlug = typeof body?.brandSlug === "string" ? body.brandSlug : ""
  const scope = typeof body?.scope === "string" && body.scope ? body.scope : "ALL"
  const threshold = Number(body?.thresholdPoints)
  const frequency = typeof body?.frequency === "string" ? body.frequency : ""
  const email = typeof body?.email === "string" ? body.email.trim() : ""

  if (!brandSlug) return NextResponse.json({ error: "Paramètre 'brandSlug' requis." }, { status: 400 })
  if (!Number.isFinite(threshold) || threshold < 0.3 || threshold > 2) {
    return NextResponse.json({ error: "Le seuil doit être compris entre 0,3 et 2 points." }, { status: 400 })
  }
  if (!FREQUENCIES.has(frequency)) {
    return NextResponse.json({ error: "Fréquence invalide (Immédiat, Quotidien ou Hebdomadaire)." }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 })
  }

  const [brand] = await db.brand.findMany({ where: { slug: brandSlug }, take: 1 })
  if (!brand) return NextResponse.json({ error: "Enseigne introuvable." }, { status: 404 })

  const watchlist = await computeWatchlist(brandSlug)
  const live = evaluateLive(scope, threshold, watchlist)

  // Libellé lisible : station ciblée ou toute la watchlist
  let stationLabel = "Toute la watchlist"
  if (scope !== "ALL") {
    const target = watchlist.find(w => w.code === scope)
    if (!target) {
      return NextResponse.json(
        { error: "Cette station n’est pas dans la watchlist courante — choisissez « Toute la watchlist » ou une station détectée." },
        { status: 400 },
      )
    }
    stationLabel = target.name
  }

  // Simulation du premier déclenchement : l'alerte naît avec l'état actuel du terrain,
  // comme si le moteur de veille l'avait évaluée lors de sa dernière passe.
  const created = await db.watchlistAlert.create({
    data: {
      brandSlug, scope, stationLabel,
      thresholdPoints: Math.round(threshold * 10) / 10,
      frequency, email,
      active: true,
      triggerCount: live.nowExceedCount,
      lastTriggeredAt: live.lastLowAt ? new Date(live.lastLowAt) : null,
    },
  })

  return NextResponse.json({ alert: serialize(created, live) }, { status: 201 })
}
