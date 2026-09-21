// Seed one-shot : historique des passes du moteur de veille (AlertRun).
// Crée 9 passes planifiées (quotidiennes à 08:00) + 1 passe manuelle de test,
// avec des détails réalistes calibrés sur les alertes et watchlists réelles.
// Réinitialise aussi les compteurs des alertes (état cohérent post-seed).
// Exécution : bun prisma/seed-alert-runs.ts
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

const round1 = (n: number) => Math.round(n * 10) / 10
const RECENT_WIN = 90 * 86400_000
const fr1 = (n: number) => n.toFixed(1).replace(".", ",")

const FREQUENCY_LABELS: Record<string, string> = {
  IMMEDIATE: "Immédiat",
  DAILY: "Digest quotidien",
  WEEKLY: "Digest hebdomadaire",
}

type Watch = {
  code: string; name: string; gouvernorat: string
  previousRating: number; currentRating: number; delta: number
}

type RunDetailSeed = {
  alertId: string
  brandSlug: string
  brandName: string
  brandColor: string
  stationLabel: string
  thresholdPoints: number
  frequency: string
  email: string
  status: "TRIGGERED" | "STABLE" | "SKIPPED"
  exceedCount: number
  examples: { name: string; gouvernorat: string; previousRating: number; currentRating: number; delta: number }[]
  subject: string | null
  preview: string | null
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
  const byStation = new Map<string, { name: string; gouvernorat: string; recent: number[]; older: number[] }>()
  for (const r of reviews) {
    const w = byStation.get(r.station.code) ?? { name: r.station.name, gouvernorat: r.station.gouvernorat, recent: [], older: [] }
    if (now - r.createdAt.getTime() <= RECENT_WIN) w.recent.push(r.rating)
    else w.older.push(r.rating)
    byStation.set(r.station.code, w)
  }
  const out: Watch[] = []
  for (const [code, w] of byStation) {
    if (w.recent.length < 2 || w.older.length < 1) continue
    const cur = w.recent.reduce((a, b) => a + b, 0) / w.recent.length
    const prev = w.older.reduce((a, b) => a + b, 0) / w.older.length
    const delta = prev - cur
    if (cur <= 3.5 && delta >= 0.8) {
      out.push({ code, name: w.name, gouvernorat: w.gouvernorat, previousRating: round1(prev), currentRating: round1(cur), delta: round1(delta) })
    }
  }
  return out.sort((a, b) => b.delta - a.delta)
}

type AlertRow = {
  id: string; brandSlug: string; scope: string; stationLabel: string
  thresholdPoints: number; frequency: string; email: string
}

function buildEmail(brandName: string, alert: AlertRow, exceeded: Watch[]) {
  const lines = exceeded.slice(0, 5).map(w =>
    `• ${w.name} (${w.gouvernorat}) — chute de ${fr1(w.previousRating)} à ${fr1(w.currentRating)} (−${fr1(w.delta)} pt)`)
  const subject = `[CarbuScope] ${exceeded.length} station${exceeded.length > 1 ? "s" : ""} en perte de vitesse — ${brandName}`
  const preview = `Bonjour,\n\nLe moteur de veille a détecté ${exceeded.length} station${exceeded.length > 1 ? "s" : ""} en perte de vitesse (seuil : −${fr1(alert.thresholdPoints)} pt, périmètre : ${alert.stationLabel}) :\n\n${lines.join("\n")}${exceeded.length > 5 ? `\n• …et ${exceeded.length - 5} autre${exceeded.length - 5 > 1 ? "s" : ""}.` : ""}\n\nConsultez le portail enseigne pour auditer ces stations et répondre aux avis défavorables.\n\n— La veille CarbuScope (${FREQUENCY_LABELS[alert.frequency] ?? alert.frequency})`
  return { subject, preview }
}

async function main() {
  // Nettoyage : repartir d'un historique vierge et de compteurs cohérents.
  await db.alertRun.deleteMany({})
  const alerts = (await db.watchlistAlert.findMany()) as AlertRow[]
  const brands = await db.brand.findMany({ select: { slug: true, name: true, color: true } })
  const brandBySlug = new Map(brands.map(b => [b.slug, b]))

  const watchlists = new Map<string, Watch[]>()
  for (const slug of new Set(alerts.map(a => a.brandSlug))) {
    watchlists.set(slug, await computeWatchlist(slug))
  }

  // Réinitialiser les compteurs d'alertes : dernière notification = passe
  // manuelle du support d'hier soir (cohérent avec l'historique ci-dessous).
  const lastPassAt = new Date(Date.now() - 26 * 3600_000)
  for (const alert of alerts) {
    const watch = watchlists.get(alert.brandSlug) ?? []
    const exceeded = watch.filter(w => w.delta >= alert.thresholdPoints && (alert.scope === "ALL" || w.code === alert.scope))
    await db.watchlistAlert.update({
      where: { id: alert.id },
      data: { triggerCount: exceeded.length, lastTriggeredAt: lastPassAt },
    })
  }

  // Passe manuelle de test (hier soir, support plateforme).
  const manualAt = new Date(Date.now() - 26 * 3600_000)

  // 9 passes planifiées quotidiennes à 08:00 (la plus récente = hier).
  const scheduledAt = (daysAgo: number) => {
    const d = new Date()
    d.setDate(d.getDate() - daysAgo)
    d.setHours(8, 0, 0, 0)
    return d
  }

  let created = 0

  for (let daysAgo = 9; daysAgo >= 1; daysAgo--) {
    const ranAt = scheduledAt(daysAgo)
    // Le volume de chutes détectées croît au fil des jours (avis défavorables récents).
    const growth = 0.35 + (10 - daysAgo) * 0.072 // 0,35 → ~0,92
    const details: RunDetailSeed[] = []
    let triggered = 0
    let flagged = 0

    for (const alert of alerts) {
      const brand = brandBySlug.get(alert.brandSlug)
      const watch = watchlists.get(alert.brandSlug) ?? []
      const full = watch.filter(w => w.delta >= alert.thresholdPoints && (alert.scope === "ALL" || w.code === alert.scope))
      const cut = Math.max(0, Math.round(full.length * growth))
      const exceeded = full.slice(0, cut)

      const base = {
        alertId: alert.id,
        brandSlug: alert.brandSlug,
        brandName: brand?.name ?? alert.brandSlug,
        brandColor: brand?.color ?? "#78716c",
        stationLabel: alert.stationLabel,
        thresholdPoints: alert.thresholdPoints,
        frequency: alert.frequency,
        email: alert.email,
        exceedCount: exceeded.length,
        examples: exceeded.slice(0, 3).map(w => ({
          name: w.name, gouvernorat: w.gouvernorat,
          previousRating: w.previousRating, currentRating: w.currentRating, delta: w.delta,
        })),
      }

      // Les alertes immédiates ne se déclenchent que certains jours (nouvel avis défavorable).
      const fired = alert.frequency === "IMMEDIATE"
        ? daysAgo % 3 === 0 && exceeded.length > 0
        : exceeded.length > 0

      if (fired) {
        triggered++
        flagged += exceeded.length
        const { subject, preview } = buildEmail(base.brandName, alert, exceeded)
        details.push({ ...base, status: "TRIGGERED", subject, preview })
      } else {
        details.push({ ...base, status: "STABLE", subject: null, preview: null })
      }
    }

    await db.alertRun.create({
      data: {
        ranAt,
        mode: "SCHEDULED",
        brandsCovered: watchlists.size,
        evaluatedAlerts: alerts.length,
        triggeredAlerts: triggered,
        skippedAlerts: 0,
        stationsFlagged: flagged,
        emailsQueued: triggered,
        durationMs: 60 + Math.floor(Math.random() * 180),
        details,
      },
    })
    created++
  }

  // Passe manuelle (test du moteur par le support — hier soir).
  {
    const details: RunDetailSeed[] = []
    for (const alert of alerts) {
      const brand = brandBySlug.get(alert.brandSlug)
      const watch = watchlists.get(alert.brandSlug) ?? []
      const exceeded = watch.filter(w => w.delta >= alert.thresholdPoints && (alert.scope === "ALL" || w.code === alert.scope))
      if (exceeded.length === 0 || alert.frequency !== "DAILY") continue
      const { subject, preview } = buildEmail(brand?.name ?? alert.brandSlug, alert, exceeded)
      details.push({
        alertId: alert.id, brandSlug: alert.brandSlug,
        brandName: brand?.name ?? alert.brandSlug, brandColor: brand?.color ?? "#78716c",
        stationLabel: alert.stationLabel, thresholdPoints: alert.thresholdPoints,
        frequency: alert.frequency, email: alert.email,
        status: "TRIGGERED", exceedCount: exceeded.length,
        examples: exceeded.slice(0, 3).map(w => ({
          name: w.name, gouvernorat: w.gouvernorat,
          previousRating: w.previousRating, currentRating: w.currentRating, delta: w.delta,
        })),
        subject, preview,
      })
    }
    await db.alertRun.create({
      data: {
        ranAt: manualAt,
        mode: "MANUAL",
        brandsCovered: watchlists.size,
        evaluatedAlerts: alerts.length,
        triggeredAlerts: details.length,
        skippedAlerts: 0,
        stationsFlagged: details.reduce((acc, d) => acc + (d.exceedCount as number), 0),
        emailsQueued: details.length,
        durationMs: 94,
        details,
      },
    })
    created++
  }

  console.log(`✓ ${created} passes du moteur de veille tracées (9 planifiées + 1 manuelle).`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
