import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializeInvoice } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

// PATCH /api/super/invoices/[id] — encaissement : marque la facture PAYEE.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  if (body?.status !== "PAYEE") {
    return NextResponse.json({ error: "Seul l'encaissement (PAYEE) est modifiable ici" }, { status: 400 })
  }

  const invoice = await db.saasInvoice.findUnique({ where: { id }, include: { contract: true } })
  if (!invoice) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 })
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
