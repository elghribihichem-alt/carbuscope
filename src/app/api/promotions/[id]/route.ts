import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSession } from "@/lib/auth"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// T62-b — PATCH /api/promotions/[id] : cycle de vie d'une campagne (persisté).
//   Body : { action: "suspendre" | "reprendre" | "archiver" }
//     · suspendre → suspendue = true  (décision enseigne, hors diffusion)
//     · reprendre  → suspendue = false (retour au cycle des dates)
//     · archiver   → archivee = true + suspendue = false (sortie du pilotage,
//                    historique conservé — visible via le filtre « Archivées »)
// Réponse : 200 { promotion } (DTO identique à GET/POST /api/promotions).
// Droits : session ADMIN/NETWORK de l'enseigne propriétaire, ou SUPER_ADMIN.

const isoDay = (d: Date): string => d.toISOString().slice(0, 10)

const ACTIONS = ["suspendre", "reprendre", "archiver"] as const
type Action = (typeof ACTIONS)[number]

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { action?: string }
  const action = body.action as Action | undefined
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Action invalide — attendu : suspendre, reprendre ou archiver." }, { status: 400 })
  }

  const promo = await db.promotion.findUnique({ where: { id } })
  if (!promo) return NextResponse.json({ error: "Promotion introuvable." }, { status: 404 })

  const u = await requireSession()
  const autorise = !!u && (u.role === "SUPER_ADMIN" || (u.brandSlug === promo.brandSlug && (u.role === "ADMIN" || u.role === "NETWORK")))
  if (!autorise) {
    return NextResponse.json({ error: "Action réservée aux gestionnaires de l'enseigne (session requise)." }, { status: 403 })
  }

  // Archivage : décision irréversible côté pilotage (conservée en historique).
  if (action === "archiver" && promo.archivee) {
    return NextResponse.json({ error: "Promotion déjà archivée." }, { status: 409 })
  }

  const data =
    action === "suspendre" ? { suspendue: true }
    : action === "reprendre" ? { suspendue: false }
    : { archivee: true, suspendue: false }

  const p = await db.promotion.update({ where: { id }, data })

  const brandRow = await db.brand.findUnique({ where: { slug: promo.brandSlug }, select: { name: true } })
  const brandName = brandRow?.name ?? promo.brandSlug

  await logAudit({
    acteur: u ? { nom: u.name, email: u.email, role: u.role } : undefined,
    module: "PORTAIL",
    action: action === "suspendre" ? "Promotion suspendue" : action === "reprendre" ? "Promotion reprise" : "Promotion archivée",
    cibleType: "ENSEIGNE",
    cibleLabel: brandName,
    details: `« ${p.nom} » (${isoDay(p.debut)} → ${isoDay(p.fin)} · ${p.zone} · −${p.reduction} %)`,
  })

  return NextResponse.json({
    promotion: {
      id: p.id,
      nom: p.nom,
      enseigne: brandName,
      debut: isoDay(p.debut),
      fin: isoDay(p.fin),
      zone: p.zone,
      reduction: p.reduction,
      suspendue: p.suspendue,
      archivee: p.archivee,
      createdAt: p.createdAt.toISOString(),
    },
  })
}
