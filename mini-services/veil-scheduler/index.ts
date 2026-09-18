/**
 * veil-scheduler — planificateur réel du moteur de veille CarbuScope (T20).
 *
 * Rôle :
 *   - tous les jours à 08:00 (heure de Tunis, Africa/Tunis, UTC+1 sans DST),
 *     déclenche POST /api/watchlist-alerts/run { mode: "SCHEDULED" } sur le
 *     serveur Next.js (localhost:3000) → la passe est tracée AlertRun avec le
 *     bon mode, les emails sont simulés et les notifications in-app partent ;
 *   - journalise chaque passe (succès/échec, alertes déclenchées, durée) ;
 *   - expose GET /status pour le badge « Planificateur » du back-office
 *     (via la passerelle : /status?XTransformPort=3035) ;
 *   - GET /run force une passe SCHEDULED à la demande (débogage/opération).
 *
 * Anti-doublon : une seule passe par jour calendaire tunisien, même si le tick
 * de 30 s retombe plusieurs fois dans la fenêtre 08:00.
 */

const PORT = 3035
const APP_URL = "http://localhost:3000"
const RUN_ENDPOINT = `${APP_URL}/api/watchlist-alerts/run`
const SCHEDULE_HOUR = 8 // 08:00 Tunis
const TZ = "Africa/Tunis"
const TICK_MS = 30_000
const JOURNAL_MAX = 20

type JournalEntry = {
  at: string // ISO
  ok: boolean
  mode: "SCHEDULED" | "FORCED"
  triggeredAlerts?: number
  skippedAlerts?: number
  stationsFlagged?: number
  emailsQueued?: number
  durationMs?: number
  httpStatus?: number
  error?: string
}

const startedAt = Date.now()
const journal: JournalEntry[] = []
let lastFireDayKey: string | null = null // « 2026-09-19 » en heure Tunis
let firing = false

/** Clé du jour calendaire courant en heure de Tunis (UTC+1 fixe). */
function tunisDayKey(d = new Date()): string {
  // Africa/Tunis = UTC+1 toute l'année (pas d'heure d'été).
  const t = new Date(d.getTime() + 60 * 60_000)
  return t.toISOString().slice(0, 10)
}

/** « Maintenant » projeté en heure de Tunis : { hour, minute }. */
function tunisClock(d = new Date()): { hour: number; minute: number; seconds: number } {
  const t = new Date(d.getTime() + 60 * 60_000)
  return { hour: t.getUTCHours(), minute: t.getUTCMinutes(), seconds: t.getUTCSeconds() }
}

/** Prochain 08:00 Tunis, en epoch ms. */
function nextRunAt(now = Date.now()): number {
  const shifted = now + 60 * 60_000
  const dayStartUtc = shifted - (shifted % 86_400_000)
  let candidate = dayStartUtc + SCHEDULE_HOUR * 3_600_000 - 60 * 60_000 // retour en epoch UTC réel
  if (candidate <= now) candidate += 86_400_000
  return candidate
}

/** Prochaine passe en texte FR court : « aujourd'hui 08:00 » / « demain 08:00 ». */
function nextRunLabel(next: number): string {
  const nowShifted = Date.now() + 60 * 60_000
  const nextShifted = next + 60 * 60_000
  const sameDay = tunisDayKey(new Date(nowShifted)) === tunisDayKey(new Date(nextShifted))
  return `${sameDay ? "aujourd'hui" : "demain"} 08:00`
}

async function runEngine(mode: "SCHEDULED" | "FORCED"): Promise<JournalEntry> {
  const entry: JournalEntry = { at: new Date().toISOString(), ok: false, mode }
  try {
    const res = await fetch(RUN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "SCHEDULED" }),
      signal: AbortSignal.timeout(180_000),
    })
    entry.httpStatus = res.status
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = (await res.json()) as {
      run?: {
        triggeredAlerts: number; skippedAlerts: number; stationsFlagged: number
        emailsQueued: number; durationMs: number
      }
    }
    entry.ok = true
    entry.triggeredAlerts = j.run?.triggeredAlerts ?? 0
    entry.skippedAlerts = j.run?.skippedAlerts ?? 0
    entry.stationsFlagged = j.run?.stationsFlagged ?? 0
    entry.emailsQueued = j.run?.emailsQueued ?? 0
    entry.durationMs = j.run?.durationMs ?? 0
    console.log(
      `[veil-scheduler] passe ${mode} OK — ${entry.triggeredAlerts} alerte(s) déclenchée(s), ` +
      `${entry.stationsFlagged} station(s) signalée(s) en ${entry.durationMs} ms`,
    )
  } catch (err) {
    entry.error = err instanceof Error ? err.message : String(err)
    console.error(`[veil-scheduler] passe ${mode} ÉCHOUÉE — ${entry.error}`)
  }
  journal.unshift(entry)
  if (journal.length > JOURNAL_MAX) journal.length = JOURNAL_MAX
  return entry
}

// --- Boucle de planification -----------------------------------------------
function tick() {
  if (firing) return
  const { hour, minute, seconds } = tunisClock()
  const dayKey = tunisDayKey()
  // Fenêtre 08:00:00 → 08:00:59 (le tick de 30 s y entre au moins une fois).
  if (hour === SCHEDULE_HOUR && minute === 0 && seconds < 60 && lastFireDayKey !== dayKey) {
    lastFireDayKey = dayKey
    firing = true
    runEngine("SCHEDULED").finally(() => { firing = false })
  }
}

setInterval(tick, TICK_MS)
tick() // rattrapage immédiat au démarrage si la fenêtre est ouverte

// --- Serveur d'état (badge back-office via la passerelle) -------------------
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS })
    }

    if (req.method === "GET" && (url.pathname === "/status" || url.pathname === "/")) {
      const next = nextRunAt()
      return Response.json(
        {
          service: "veil-scheduler",
          ok: true,
          timezone: TZ,
          scheduleHour: SCHEDULE_HOUR,
          nextRunAt: new Date(next).toISOString(),
          nextRunInMin: Math.max(0, Math.round((next - Date.now()) / 60_000)),
          nextRunLabel: nextRunLabel(next),
          uptimeSec: Math.round((Date.now() - startedAt) / 1000),
          lastFireDayKey,
          journal,
        },
        { headers: { ...CORS, "Cache-Control": "no-store" } },
      )
    }

    if (req.method === "POST" && url.pathname === "/run") {
      if (firing) {
        return Response.json({ error: "Une passe est déjà en cours." }, { status: 409, headers: CORS })
      }
      firing = true
      const entry = await runEngine("FORCED")
      firing = false
      return Response.json(entry, { headers: CORS })
    }

    return Response.json({ error: "Route inconnue." }, { status: 404, headers: CORS })
  },
})

console.log(
  `[veil-scheduler] actif sur le port ${PORT} — prochaine passe ${nextRunLabel(nextRunAt())} (${TZ})`,
)
