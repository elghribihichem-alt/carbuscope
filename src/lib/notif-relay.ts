// CarbuScope — publication vers le relais WebSocket notif-relay (mini-service,
// contrôle HTTP :3037 — le WebSocket enseigne écoute :3036). Côté serveur
// Next.js uniquement (jamais côté client) : fire-and-forget avec timeout court
// — si le relais est arrêté, les notifications in-app restent disponibles via
// l'API /api/notifications (polling), aucune perte de données.

const RELAY_URL = "http://localhost:3037/publish"

export interface RelayNotification {
  brandSlug: string
  kind: string
  title: string
  body?: string | null
  stationLabel?: string | null
  deltaPoints?: number | null
  alertRunId?: string | null
  createdAt?: string
}

/**
 * Pousse une notification vers les portails enseigne connectés (temps réel).
 * Ne bloque jamais l'appelant : 1,5 s de timeout, erreurs silencieuses.
 */
export async function relayNotifications(items: RelayNotification[]): Promise<void> {
  if (!items.length) return
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 1500)
    await Promise.allSettled(
      items.map(item =>
        fetch(RELAY_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...item, createdAt: item.createdAt ?? new Date().toISOString() }),
          signal: ctrl.signal,
        }).catch(() => {}),
      ),
    )
    clearTimeout(timer)
  } catch {
    // Relais injoignable : la notification reste lisible via /api/notifications.
  }
}
