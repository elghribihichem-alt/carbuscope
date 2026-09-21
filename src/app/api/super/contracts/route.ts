import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeContract } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

// GET /api/super/contracts — contrats SaaS avec statistiques de facturation.
export async function GET() {
  const [contracts, brandCounts] = await Promise.all([
    db.saasContract.findMany({ include: { invoices: true }, orderBy: { renewsAt: "asc" } }),
    db.brand.findMany({ include: { _count: { select: { stations: true } } } }),
  ])
  const stationBySlug = new Map(brandCounts.map(b => [b.slug, b._count.stations]))
  return NextResponse.json({
    contracts: contracts.map(c => serializeContract(c, stationBySlug.get(c.brandSlug) ?? 0)),
  })
}
