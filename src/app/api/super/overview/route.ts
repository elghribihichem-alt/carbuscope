import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeContract, serializeInvoice, serializeAudit } from "@/lib/saas-server"
import { effectiveStatusInDb } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

// GET /api/super/overview — KPIs SaaS, renouvellements, factures et audit récents.
// T52-R1 : réponse enrichie de façon ADDITIVE (overdueInvoices, mrrHistory) —
// champs existants strictement inchangés pour ne casser aucun consommateur.
export async function GET() {
  const now = new Date()
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

  // T52-R1 — factures en retard (statut effectif RETARD) pour la carte
  // « Échéances & renouvellements » : les plus anciennes échéances d'abord.
  const overdueInvoices = contracts
    .flatMap(c => c.invoices.map(i => ({ i, c })))
    .filter(({ i }) => effectiveStatusInDb(i.status, i.dueAt) === "RETARD")
    .sort((a, b) => a.i.dueAt.getTime() - b.i.dueAt.getTime())
    .slice(0, 6)
    .map(({ i, c }) => serializeInvoice({ ...i, contract: c }))

  // T52-R1 — historique MRR reconstruit sur les 6 derniers mois depuis les
  // contrats ACTIF (convention du KPI « MRR ») et leurs dates de souscription.
  // Reconstruction honnête : contrats résiliés exclus (date de sortie inconnue
  // en base), essais et suspendus non comptés — aucun montant inventé.
  const mrrHistory: { mois: string; mrr: number }[] = []
  for (let k = 5; k >= 0; k--) {
    const mois = new Date(now.getFullYear(), now.getMonth() - k, 1)
    const finMois = new Date(mois.getFullYear(), mois.getMonth() + 1, 1)
    mrrHistory.push({
      mois: `${mois.getFullYear()}-${String(mois.getMonth() + 1).padStart(2, "0")}`,
      mrr: active.reduce(
        (s, c) => s + (new Date(c.startedAt) <= finMois ? c.monthlyFee : 0),
        0,
      ),
    })
  }

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
    overdueInvoices,
    mrrHistory,
  })
}
