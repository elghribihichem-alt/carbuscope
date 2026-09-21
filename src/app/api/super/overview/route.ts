import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeContract, serializeInvoice, serializeAudit } from "@/lib/saas-server"
import { effectiveStatusInDb } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

// GET /api/super/overview — KPIs SaaS, renouvellements, factures et audit récents.
export async function GET() {
  const [contracts, brandCounts, users, auditRows] = await Promise.all([
    db.saasContract.findMany({ include: { invoices: true }, orderBy: { renewsAt: "asc" } }),
    db.brand.findMany({ include: { _count: { select: { stations: true } } } }),
    db.user.findMany(),
    db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ])

  const stationBySlug = new Map(brandCounts.map(b => [b.slug, b._count.stations]))

  const dtos = contracts.map(c => serializeContract(c, stationBySlug.get(c.brandSlug) ?? 0))
  const active = dtos.filter(c => c.status === "ACTIF")
  const trials = dtos.filter(c => c.status === "ESSAI")
  const suspended = dtos.filter(c => c.status === "SUSPENDU")

  const allInvoices = contracts.flatMap(c =>
    c.invoices.map(i => ({ i, c }))
  )
  const unpaid = allInvoices.filter(({ i }) => effectiveStatusInDb(i.status, i.dueAt) !== "PAYEE")
  const overdue = unpaid.filter(({ i }) => effectiveStatusInDb(i.status, i.dueAt) === "RETARD")

  const mrr = active.reduce((s, c) => s + c.monthlyFee, 0)

  const recentInvoices = await db.saasInvoice.findMany({
    include: { contract: true },
    orderBy: { issuedAt: "desc" },
    take: 6,
  })

  return NextResponse.json({
    kpis: {
      activeContracts: active.length,
      trials: trials.length,
      suspended: suspended.length,
      mrr,
      arr: mrr * 12,
      invoicesUnpaid: unpaid.length,
      unpaidTotal: unpaid.reduce((s, { i }) => s + i.amount, 0),
      invoicesOverdue: overdue.length,
      activeUsers: users.filter(u => u.active).length,
      stationsManaged: active.reduce((s, c) => s + (stationBySlug.get(c.brandSlug) ?? 0), 0),
    },
    renewals: dtos
      .filter(c => c.status === "ACTIF" || c.status === "ESSAI")
      .slice(0, 4),
    recentInvoices: recentInvoices.map(serializeInvoice),
    audit: auditRows.map(serializeAudit),
  })
}
