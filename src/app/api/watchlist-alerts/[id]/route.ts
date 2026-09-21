import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { computeWatchlist } from "@/lib/watchlist"

export const dynamic = "force-dynamic"

// /api/watchlist-alerts/[id] — gestion d'une alerte programmée (C.2.6+)
// PATCH  { active }        : active / met en pause (ré-évalue l'état du terrain au passage)
// DELETE                    : supprime l'alerte
// POST   (action: "test")  : rend l'email de notification tel qu'il serait envoyé

const FREQUENCY_LABELS: Record<string, string> = {
  IMMEDIATE: "Immédiat",
  DAILY: "Digest quotidien",
  WEEKLY: "Digest hebdomadaire",
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (typeof body?.active !== "boolean") {
    return NextResponse.json({ error: "Champ 'active' (booléen) requis." }, { status: 400 })
  }

  const existing = await db.watchlistAlert.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Alerte introuvable." }, { status: 404 })

  // Réactivation : ré-évaluation live du terrain (le compteur repart de l'état courant).
  let triggerCount = existing.triggerCount
  let lastTriggeredAt = existing.lastTriggeredAt
  if (body.active && !existing.active) {
    const watchlist = await computeWatchlist(existing.brandSlug)
    const exceeded = watchlist.filter(w =>
      w.delta >= existing.thresholdPoints
      && (existing.scope === "ALL" || w.code === existing.scope))
    triggerCount += exceeded.length
    const lastLowAt = exceeded.reduce<string | null>((acc, w) => {
      const at = w.lastLowReview?.createdAt ?? null
      return at && (!acc || at > acc) ? at : acc
    }, null)
    if (lastLowAt) lastTriggeredAt = new Date(lastLowAt)
  }

  const updated = await db.watchlistAlert.update({
    where: { id },
    data: { active: body.active, triggerCount, lastTriggeredAt },
  })

  return NextResponse.json({
    alert: {
      id: updated.id, active: updated.active, triggerCount: updated.triggerCount,
      lastTriggeredAt: updated.lastTriggeredAt?.toISOString() ?? null,
    },
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.watchlistAlert.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: "Alerte introuvable." }, { status: 404 })
  await db.watchlistAlert.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

// Aperçu de l'email de notification (démo — aucun envoi réel).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const alert = await db.watchlistAlert.findUnique({ where: { id } })
  if (!alert) return NextResponse.json({ error: "Alerte introuvable." }, { status: 404 })

  const [brand] = await db.brand.findMany({ where: { slug: alert.brandSlug }, take: 1 })
  const watchlist = await computeWatchlist(alert.brandSlug)
  const exceeded = watchlist.filter(w =>
    w.delta >= alert.thresholdPoints
    && (alert.scope === "ALL" || w.code === alert.scope))

  const lines = exceeded.slice(0, 5).map(w =>
    `• ${w.name} (${w.gouvernorat}) — chute de ${w.previousRating.toFixed(1).replace(".", ",")} à ${w.currentRating.toFixed(1).replace(".", ",")} (−${w.delta.toFixed(1).replace(".", ",")} pt)`)

  const subject = exceeded.length === 0
    ? `[CarbuScope] Veille des notes — ${brand?.name ?? alert.brandSlug} : situation stable`
    : `[CarbuScope] ${exceeded.length} station${exceeded.length > 1 ? "s" : ""} en perte de vitesse — ${brand?.name ?? alert.brandSlug}`

  const body = exceeded.length === 0
    ? `Bonjour,\n\nAucune station ne dépasse actuellement le seuil de ${alert.thresholdPoints.toFixed(1).replace(".", ",")} pt configuré sur « ${alert.stationLabel} ».\nLa surveillance continue.\n\n— La veille CarbuScope`
    : `Bonjour,\n\nLe moteur de veille a détecté ${exceeded.length} station${exceeded.length > 1 ? "s" : ""} en perte de vitesse (seuil : −${alert.thresholdPoints.toFixed(1).replace(".", ",")} pt, périmètre : ${alert.stationLabel}) :\n\n${lines.join("\n")}${exceeded.length > 5 ? `\n• …et ${exceeded.length - 5} autre${exceeded.length - 5 > 1 ? "s" : ""}.` : ""}\n\nConsultez le portail enseigne pour auditer ces stations et répondre aux avis défavorables.\n\n— La veille CarbuScope (${FREQUENCY_LABELS[alert.frequency] ?? alert.frequency})`

  return NextResponse.json({ subject, preview: body, recipients: exceeded.length })
}
