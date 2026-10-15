import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// T55-B2 — Acquittement d'une alerte « nouvelle zone » : l'enseigne marque le
// signalement comme traité (elle a instruit la zone : étude lancée, candidat
// franchise identifié, ou décision de ne pas agir). L'alerte disparaît du fil
// actif sans être supprimée (historique conservé). Toute session authentifiée
// du espace enseigne peut acquitter — action auditée.

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Session requise." }, { status: 401 })
  }

  const alert = await db.zoneAlert.findUnique({ where: { id } })
  if (!alert) {
    return NextResponse.json({ error: "Alerte introuvable." }, { status: 404 })
  }
  if (alert.acknowledged) {
    return NextResponse.json({ alert: { ...alert, createdAt: alert.createdAt.toISOString() } })
  }

  const saved = await db.zoneAlert.update({
    where: { id },
    data: { acknowledged: true },
  })

  await logAudit({
    acteur: { nom: user.name, email: user.email, role: user.role },
    module: "RADAR",
    action: "ALERTE_ACK",
    cibleType: "ZoneAlert",
    cibleLabel: `${alert.gouvernorat} (score ${alert.score})`,
    details: `seuil ${alert.threshold} · acquittée depuis le fil d'alertes`,
  })

  return NextResponse.json({
    alert: {
      id: saved.id, gouvernorat: saved.gouvernorat, score: saved.score,
      threshold: saved.threshold, detail: saved.detail,
      acknowledged: saved.acknowledged, createdAt: saved.createdAt.toISOString(),
    },
  })
}
