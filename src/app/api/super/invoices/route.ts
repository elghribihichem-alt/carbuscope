import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeInvoice } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

// GET /api/super/invoices?status= — factures avec filtre de statut effectif.
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") // PAYEE | IMPAYEE | RETARD | (vide = toutes)
  const invoices = await db.saasInvoice.findMany({
    include: { contract: true },
    orderBy: { issuedAt: "desc" },
  })
  let dtos = invoices.map(serializeInvoice)
  if (status && status !== "TOUTES") {
    dtos = dtos.filter(i => i.status === status)
  }
  return NextResponse.json({
    invoices: dtos,
    totals: {
      count: dtos.length,
      amount: dtos.reduce((s, i) => s + i.amount, 0),
    },
  })
}
