import { db } from "@/lib/db"
import { computeWatchlist, type WatchEntry } from "@/lib/watchlist"
import type { AlertRunDetail, AlertRunExample } from "@/lib/types"

// Moteur périodique de veille des notes (C.2.6+) — cœur partagé :
//   - POST /api/watchlist-alerts/run (passe manuelle back-office)
//   - en production : cron planifié qui appellerait runAlertEngine("SCHEDULED")
// Évalue toutes les alertes actives de toutes les enseignes contre l'état live
// du terrain (règle watchlist), honore la fréquence (digest non re-envoyé),
// incrémente les compteurs et trace chaque passe dans AlertRun.

const FREQUENCY_LABELS: Record<string, string> = {
  IMMEDIATE: "Immédiat",
  DAILY: "Digest quotidien",
  WEEKLY: "Digest hebdomadaire",
}

// Fenêtre minimale entre deux déclenchements pour une fréquence donnée.
const FREQUENCY_WINDOW_MS: Record<string, number> = {
  IMMEDIATE: 0, // régi par la règle « nouveau signal » ci-dessous
  DAILY: 24 * 3600_000,
  WEEKLY: 7 * 24 * 3600_000,
}

// Une alerte est-elle due ? Règle de fréquence honnête :
//   - IMMEDIATE : due seulement si un avis défavorable plus récent que la dernière
//     notification existe (sinon : rien de nouveau à signaler) ;
//   - DAILY/WEEKLY : due si la fenêtre du digest est écoulée.
export function isDue(
  frequency: string,
  lastTriggeredAt: Date | null,
  lastSignalAt: Date | null = null,
  now = Date.now(),
): boolean {
  const win = FREQUENCY_WINDOW_MS[frequency]
  if (win === undefined) return true
  if (frequency === "IMMEDIATE") {
    if (!lastTriggeredAt) return true
    if (!lastSignalAt) return false // aucun signal connu : rien de neuf
    return lastSignalAt.getTime() > lastTriggeredAt.getTime()
  }
  if (!lastTriggeredAt) return true
  return now - lastTriggeredAt.getTime() >= win
}

// Email de notification tel qu'il serait envoyé (démo — aucun envoi réel).
// Format partagé avec l'aperçu unitaire de /api/watchlist-alerts/[id].

const fr1 = (n: number) => n.toFixed(1).replace(".", ",")

export function buildAlertEmail(
  brandName: string,
  alert: { stationLabel: string; thresholdPoints: number; frequency: string },
  exceeded: WatchEntry[],
): { subject: string; preview: string } {
  const lines = exceeded.slice(0, 5).map(w =>
    `• ${w.name} (${w.gouvernorat}) — chute de ${fr1(w.previousRating)} à ${fr1(w.currentRating)} (−${fr1(w.delta)} pt)`)

  const subject = exceeded.length === 0
    ? `[CarbuScope] Veille des notes — ${brandName} : situation stable`
    : `[CarbuScope] ${exceeded.length} station${exceeded.length > 1 ? "s" : ""} en perte de vitesse — ${brandName}`

  const preview = exceeded.length === 0
    ? `Bonjour,\n\nAucune station ne dépasse actuellement le seuil de ${fr1(alert.thresholdPoints)} pt configuré sur « ${alert.stationLabel} ».\nLa surveillance continue.\n\n— La veille CarbuScope`
    : `Bonjour,\n\nLe moteur de veille a détecté ${exceeded.length} station${exceeded.length > 1 ? "s" : ""} en perte de vitesse (seuil : −${fr1(alert.thresholdPoints)} pt, périmètre : ${alert.stationLabel}) :\n\n${lines.join("\n")}${exceeded.length > 5 ? `\n• …et ${exceeded.length - 5} autre${exceeded.length - 5 > 1 ? "s" : ""}.` : ""}\n\nConsultez le portail enseigne pour auditer ces stations et répondre aux avis défavorables.\n\n— La veille CarbuScope (${FREQUENCY_LABELS[alert.frequency] ?? alert.frequency})`

  return { subject, preview }
}

function toExample(w: WatchEntry): AlertRunExample {
  return {
    name: w.name,
    gouvernorat: w.gouvernorat,
    previousRating: w.previousRating,
    currentRating: w.currentRating,
    delta: w.delta,
  }
}

type AlertRow = {
  id: string
  brandSlug: string
  scope: string
  stationLabel: string
  thresholdPoints: number
  frequency: string
  email: string
  triggerCount: number
  lastTriggeredAt: Date | null
}

export type AlertEngineResult = {
  id: string
  ranAt: Date
  mode: string
  brandsCovered: number
  evaluatedAlerts: number
  triggeredAlerts: number
  skippedAlerts: number
  stationsFlagged: number
  emailsQueued: number
  durationMs: number
  details: AlertRunDetail[]
}

export async function runAlertEngine(mode: "MANUAL" | "SCHEDULED" = "MANUAL"): Promise<AlertEngineResult> {
  const startedAt = Date.now()
  const now = new Date()

  const alerts = await db.watchlistAlert.findMany({ where: { active: true } })
  const brands = await db.brand.findMany({ select: { slug: true, name: true, color: true } })
  const brandBySlug = new Map(brands.map(b => [b.slug, b]))

  // Watchlist calculée une seule fois par enseigne concernée.
  const watchlists = new Map<string, WatchEntry[]>()
  for (const slug of new Set(alerts.map(a => a.brandSlug))) {
    watchlists.set(slug, await computeWatchlist(slug))
  }

  const details: AlertRunDetail[] = []
  const triggeredNotifications: {
    brandSlug: string
    title: string
    body: string
    stationLabel: string
    deltaPoints: number | null
  }[] = []
  let triggeredAlerts = 0
  let skippedAlerts = 0
  let stationsFlagged = 0

  for (const alert of alerts as AlertRow[]) {
    const brand = brandBySlug.get(alert.brandSlug)
    const brandName = brand?.name ?? alert.brandSlug
    const brandColor = brand?.color ?? "#78716c"
    const watchlist = watchlists.get(alert.brandSlug) ?? []
    const exceeded = watchlist.filter(w =>
      w.delta >= alert.thresholdPoints
      && (alert.scope === "ALL" || w.code === alert.scope))

    const base = {
      alertId: alert.id,
      brandSlug: alert.brandSlug,
      brandName,
      brandColor,
      stationLabel: alert.stationLabel,
      thresholdPoints: Math.round(alert.thresholdPoints * 10) / 10,
      frequency: alert.frequency,
      email: alert.email,
      exceedCount: exceeded.length,
      examples: exceeded.slice(0, 3).map(toExample),
    }

    // Dernier avis défavorable dans le périmètre (signal le plus récent).
    const lastSignalAt = watchlist
      .filter(w => alert.scope === "ALL" || w.code === alert.scope)
      .reduce<Date | null>((acc, w) => {
        const at = w.lastLowReview ? new Date(w.lastLowReview.createdAt) : null
        return at && (!acc || at > acc) ? at : acc
      }, null)

    // Fréquence déjà honorée / aucun nouveau signal : pas de re-notification.
    if (!isDue(alert.frequency, alert.lastTriggeredAt, lastSignalAt)) {
      skippedAlerts++
      details.push({ ...base, status: "SKIPPED", subject: null, preview: null })
      continue
    }

    if (exceeded.length === 0) {
      details.push({ ...base, status: "STABLE", subject: null, preview: null })
      continue
    }

    // Déclenchement : compteur + horodatage + email simulé en file
    // + notification in-app enseigne (badge portail, boucle de fermeture).
    triggeredAlerts++
    stationsFlagged += exceeded.length
    const { subject, preview } = buildAlertEmail(brandName, alert, exceeded)
    await db.watchlistAlert.update({
      where: { id: alert.id },
      data: { triggerCount: { increment: 1 }, lastTriggeredAt: now },
    })
    details.push({ ...base, status: "TRIGGERED", subject, preview })
    triggeredNotifications.push({
      brandSlug: alert.brandSlug,
      title: exceeded.length === 1
        ? `Veille des notes : ${exceeded[0].name} en perte de vitesse`
        : `Veille des notes : ${exceeded.length} stations en perte de vitesse`,
      body: exceeded.slice(0, 3).map(w =>
        `${w.name} (${w.gouvernorat}) — chute de ${fr1(w.previousRating)} à ${fr1(w.currentRating)} (−${fr1(w.delta)} pt)`).join("\n"),
      stationLabel: exceeded.length === 1 ? exceeded[0].name : alert.stationLabel,
      deltaPoints: exceeded.length > 0 ? Math.round(exceeded[0].delta * 10) / 10 : null,
    })
  }

  const evaluatedAlerts = alerts.length - skippedAlerts
  const durationMs = Math.max(Date.now() - startedAt, 1)

  const run = await db.alertRun.create({
    data: {
      ranAt: now,
      mode,
      brandsCovered: watchlists.size,
      evaluatedAlerts,
      triggeredAlerts,
      skippedAlerts,
      stationsFlagged,
      emailsQueued: triggeredAlerts,
      durationMs,
      details,
    },
  })

  // Écriture des notifications in-app après la trace de passe (runId disponible).
  if (triggeredNotifications.length > 0) {
    await db.notification.createMany({
      data: triggeredNotifications.map(n => ({ ...n, alertRunId: run.id, kind: "WATCHLIST" })),
    })
  }

  return { ...run, details }
}

// Sérialisation ISO des dates pour les réponses API.
export function serializeRun(run: {
  id: string; ranAt: Date; mode: string; brandsCovered: number; evaluatedAlerts: number
  triggeredAlerts: number; skippedAlerts: number; stationsFlagged: number
  emailsQueued: number; durationMs: number; details: unknown
}) {
  return {
    id: run.id,
    ranAt: run.ranAt.toISOString(),
    mode: run.mode,
    brandsCovered: run.brandsCovered,
    evaluatedAlerts: run.evaluatedAlerts,
    triggeredAlerts: run.triggeredAlerts,
    skippedAlerts: run.skippedAlerts,
    stationsFlagged: run.stationsFlagged,
    emailsQueued: run.emailsQueued,
    durationMs: run.durationMs,
    details: (run.details as AlertRunDetail[]) ?? [],
  }
}
