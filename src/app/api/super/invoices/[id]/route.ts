import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { effectiveStatusInDb, logAudit, serializeInvoice } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

// PATCH /api/super/invoices/[id] — deux usages :
//  • {status:"PAYEE"} : encaissement (marque la facture PAYEE) ;
//  • {action:"relancer"} : relance d'échéance — incrémente le compteur de
//    relances, pose la date de dernière relance et journalise en audit.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)

  const invoice = await db.saasInvoice.findUnique({ where: { id }, include: { contract: true } })
  if (!invoice) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 })

  // ---------- Relance d'échéance ----------
  if (body?.action === "relancer") {
    if (effectiveStatusInDb(invoice.status, invoice.dueAt) === "PAYEE") {
      return NextResponse.json(
        { error: "Une facture déjà encaissée ne peut pas être relancée" },
        { status: 400 }
      )
    }
    const updated = await db.saasInvoice.update({
      where: { id },
      data: {
        reminderCount: { increment: 1 },
        lastReminderAt: new Date(),
      },
      include: { contract: true },
    })
    await logAudit({
      kind: "FACTURE",
      message: `Relance envoyée : ${invoice.number} — ${invoice.contract.brandName}, ${invoice.amount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DT impayés (relance n° ${updated.reminderCount})`,
      actor: body?.actor,
      brandSlug: invoice.contract.brandSlug,
    })
    return NextResponse.json({ invoice: serializeInvoice(updated) })
  }

  // ---------- Encaissement (comportement historique) ----------
  if (body?.status !== "PAYEE") {
    return NextResponse.json({ error: "Seul l'encaissement (PAYEE) est modifiable ici" }, { status: 400 })
  }

  if (invoice.status === "PAYEE") {
    return NextResponse.json({ error: "Facture déjà encaissée" }, { status: 409 })
  }

  const updated = await db.saasInvoice.update({
    where: { id },
    data: { status: "PAYEE", paidAt: new Date() },
    include: { contract: true },
  })

  await logAudit({
    kind: "FACTURE",
    message: `Facture ${invoice.number} encaissée (${invoice.contract.brandName}, ${invoice.amount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DT)`,
    actor: body?.actor,
    brandSlug: invoice.contract.brandSlug,
  })

  return NextResponse.json({ invoice: serializeInvoice(updated) })
}
