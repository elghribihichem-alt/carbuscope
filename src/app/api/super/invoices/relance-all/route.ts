import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

// POST /api/super/invoices/relance-all — relance groupée : toutes les factures
// non payées (statut effectif IMPAYEE ou RETARD, PAYEE exclue) reçoivent une
// relance (compteur +1, date de dernière relance) et un événement d'audit
// FACTURE au même format que la relance unitaire (T30).
// Répond {relanced, totalMillimes} — 200 avec relanced: 0 si rien à relancer.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const actor = body?.actor

  // Statut effectif non payé : en base, seules IMPAYEE/RETARD (ou tout statut
  // non PAYEE dont l'échéance est dépassée) correspondent — PAYEE exclue.
  const invoices = await db.saasInvoice.findMany({
    where: { status: { not: "PAYEE" } },
    include: { contract: true },
    orderBy: [{ dueAt: "asc" }, { number: "asc" }],
  })

  let relanced = 0
  let totalDt = 0
  for (const inv of invoices) {
    const updated = await db.saasInvoice.update({
      where: { id: inv.id },
      data: { reminderCount: { increment: 1 }, lastReminderAt: new Date() },
    })
    relanced += 1
    totalDt += inv.amount
    await logAudit({
      kind: "FACTURE",
      message: `Relance envoyée : ${inv.number} — ${inv.contract.brandName}, ${inv.amount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DT impayés (relance n° ${updated.reminderCount})`,
      actor,
      brandSlug: inv.contract.brandSlug,
    })
  }

  return NextResponse.json({
    relanced,
    totalMillimes: Math.round(totalDt * 1000),
  })
}
