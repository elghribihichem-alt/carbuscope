import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeUser } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

// GET /api/super/users — comptes utilisateurs de la plateforme (toutes enseignes).
export async function GET() {
  const [users, contracts] = await Promise.all([
    db.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.saasContract.findMany(),
  ])
  const contractBySlug = new Map(contracts.map(c => [c.brandSlug, c]))
  return NextResponse.json({
    users: users.map(serializeUser).map(u => ({
      ...u,
      brandName: u.brandSlug ? contractBySlug.get(u.brandSlug)?.brandName ?? u.brandSlug : "Plateforme",
      brandColor: u.brandSlug ? contractBySlug.get(u.brandSlug)?.color ?? "#64748b" : "#57534e",
      contractStatus: u.brandSlug ? contractBySlug.get(u.brandSlug)?.status ?? null : null,
    })),
  })
}
