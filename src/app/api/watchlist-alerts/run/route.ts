import { NextRequest, NextResponse } from "next/server"
import { runAlertEngine, serializeRun } from "@/lib/alert-engine"

export const dynamic = "force-dynamic"

// POST /api/watchlist-alerts/run — déclenche une passe du moteur de veille.
//   - sans corps / mode=MANUAL     : passe manuelle (bouton back-office) ;
//   - mode=SCHEDULED               : passe planifiée (scheduler mini-service,
//     quotidien 08:00 Tunis — trace le mode SCHEDULED dans l'historique).
// Évalue toutes les alertes actives de toutes les enseignes, honore les
// fréquences, met à jour les compteurs, trace la passe dans AlertRun et
// laisse une notification in-app par alerte déclenchée.
export async function POST(req: NextRequest) {
  let mode: "MANUAL" | "SCHEDULED" = "MANUAL"
  try {
    const body = await req.json() as { mode?: string }
    if (body?.mode === "SCHEDULED") mode = "SCHEDULED"
  } catch {
    // Corps absent ou non-JSON : passe manuelle.
  }
  try {
    const run = await runAlertEngine(mode)
    return NextResponse.json({ run: serializeRun(run) })
  } catch (err) {
    console.error("[api/watchlist-alerts/run]", err)
    return NextResponse.json({ error: "La passe de veille a échoué." }, { status: 500 })
  }
}
