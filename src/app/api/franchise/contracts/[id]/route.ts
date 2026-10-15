import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// T55-B3-b — PATCH /api/franchise/contracts/[id] : cycle de vie du contrat.
//   BROUILLON → SIGNE (signedAt posé) → ACTIF (hubId optionnel, hub vérifié)
//   → RESILIE. Session requise (401 sinon), pas de gating rôle V1.
// Audit FRANCHISE/CONTRAT_UPDATE.

const STATUSES = ["BROUILLON", "SIGNE", "ACTIF", "RESILIE"]

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Session requise — reconnectez-vous." }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Corps JSON requis." }, { status: 400 })

  const existing = await db.franchiseContract.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Contrat introuvable." }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Statut invalide (BROUILLON, SIGNE, ACTIF ou RESILIE)." }, { status: 400 })
    }
    data.status = body.status
    // La signature date le contrat — on conserve la date si déjà signée.
    if (body.status === "SIGNE" && !existing.signedAt) data.signedAt = new Date()
  }
  if (body.hubId !== undefined) {
    if (body.hubId === null || body.hubId === "") {
      data.hubId = null
    } else {
      const hub = await db.mobilityHub.findUnique({ where: { id: String(body.hubId) } })
      if (!hub) return NextResponse.json({ error: "Hub introuvable — impossible de rattacher le contrat." }, { status: 400 })
      data.hubId = hub.id
    }
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Aucun champ modifiable fourni (status, hubId)." }, { status: 400 })
  }

  const updated = await db.franchiseContract.update({ where: { id }, data })
  await logAudit({
    acteur: { nom: user.name, email: user.email, role: user.role },
    module: "FRANCHISE",
    action: "CONTRAT_UPDATE",
    cibleType: "Contrat",
    cibleLabel: updated.number,
    details: `${existing.status} → ${updated.status}${updated.hubId ? " · hub rattaché" : ""}${updated.signedAt ? ` · signé le ${updated.signedAt.toLocaleDateString("fr-FR")}` : ""}`,
  })
  return NextResponse.json({
    ok: true,
    id,
    status: updated.status,
    signedAt: updated.signedAt?.toISOString() ?? null,
    hubId: updated.hubId,
  })
}
