import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// T55-B3-b — PATCH /api/franchise/candidates/[id] : mise à jour du dossier
// candidat (statut, notes, coordonnées, apport, expérience). V1 : transitions
// de statut libres (validation d'énumération seulement), session requise
// (401 sinon), pas de gating rôle. Audit FRANCHISE/CANDIDAT_UPDATE.

const STATUSES = ["INTERESSE", "QUALIFIE", "VISITE", "SIGNE", "REFUSE"]

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Session requise — reconnectez-vous." }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Corps JSON requis." }, { status: 400 })

  const existing = await db.franchiseCandidate.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Candidat introuvable." }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Statut invalide (INTERESSE, QUALIFIE, VISITE, SIGNE ou REFUSE)." }, { status: 400 })
    }
    data.status = body.status
  }
  if (body.notes !== undefined) data.notes = String(body.notes).slice(0, 2000)
  if (body.email !== undefined) {
    const email = body.email === null || body.email === "" ? null : String(body.email).trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 })
    }
    data.email = email
  }
  if (body.phone !== undefined) {
    data.phone = body.phone === null || body.phone === "" ? null : String(body.phone).trim().slice(0, 40)
  }
  if (body.capital !== undefined) {
    const n = Number(body.capital)
    data.capital = Number.isFinite(n) && n > 0 ? n : null
  }
  if (body.experience !== undefined) {
    data.experience = body.experience === null || body.experience === "" ? null : String(body.experience).trim().slice(0, 500)
  }
  if (body.zoneNote !== undefined) {
    const n = Number(body.zoneNote)
    if (Number.isFinite(n)) data.zoneNote = Math.min(100, Math.max(0, Math.round(n)))
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Aucun champ modifiable fourni (status, notes, email, phone, capital, experience)." }, { status: 400 })
  }

  const updated = await db.franchiseCandidate.update({ where: { id }, data })
  await logAudit({
    acteur: { nom: user.name, email: user.email, role: user.role },
    module: "FRANCHISE",
    action: "CANDIDAT_UPDATE",
    cibleType: "Candidat",
    cibleLabel: updated.fullName,
    details: `${Object.keys(data).join(", ")} · ${existing.status} → ${updated.status}`,
  })
  return NextResponse.json({
    ok: true,
    id,
    status: updated.status,
    candidate: {
      id: updated.id,
      fullName: updated.fullName,
      email: updated.email,
      phone: updated.phone,
      gouvernorat: updated.gouvernorat,
      zoneNote: updated.zoneNote,
      capital: updated.capital,
      experience: updated.experience,
      status: updated.status,
      notes: updated.notes,
    },
  })
}
