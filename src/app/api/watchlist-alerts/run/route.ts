import { NextResponse } from "next/server"
import { runAlertEngine, serializeRun } from "@/lib/alert-engine"

export const dynamic = "force-dynamic"

// POST /api/watchlist-alerts/run — déclenche une passe du moteur de veille
// (cron simulé). Évalue toutes les alertes actives de toutes les enseignes,
// honore les fréquences (digest non re-envoyé), met à jour les compteurs et
// trace la passe dans AlertRun. Retourne le rapport complet.
export async function POST() {
  try {
    const run = await runAlertEngine("MANUAL")
    return NextResponse.json({ run: serializeRun(run) })
  } catch (err) {
    console.error("[api/watchlist-alerts/run]", err)
    return NextResponse.json({ error: "La passe de veille a échoué." }, { status: 500 })
  }
}
