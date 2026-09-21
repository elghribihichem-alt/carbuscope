import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializeContract } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

const VALID = ["ESSAI", "ACTIF", "SUSPENDU", "RESILIE"]

// PATCH /api/super/contracts/[id] — change le statut d'un contrat.
// Suspendre un contrat suspend également les comptes utilisateurs de l'enseigne ;
// le réactiver les restaure (comportement SaaS cohérent).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  const status = body?.status as string | undefined
  if (!status || !VALID.includes(status)) {
    return NextResponse.json({ error: "Statut invalide (ESSAI | ACTIF | SUSPENDU | RESILIE)" }, { status: 400 })
  }

  const contract = await db.saasContract.findUnique({ where: { id } })
  if (!contract) return NextResponse.json({ error: "Contrat introuvable" }, { status: 404 })

  const updated = await db.saasContract.update({
    where: { id },
    data: { status },
    include: { invoices: true },
  })

  if (status === "SUSPENDU") {
    await db.user.updateMany({
      where: { brandSlug: contract.brandSlug, active: true },
      data: { active: false },
    })
  } else if (status === "ACTIF" && contract.status === "SUSPENDU") {
    await db.user.updateMany({
      where: { brandSlug: contract.brandSlug },
      data: { active: true },
    })
  }

  const brands = await db.brand.findMany({
    where: { slug: contract.brandSlug },
    include: { _count: { select: { stations: true } } },
  })
  const stationCount = brands[0]?._count.stations ?? 0

  await logAudit({
    kind: "CONTRAT",
    message: `Contrat « ${contract.brandName} » : ${contract.status} → ${status}`,
    actor: body?.actor,
    brandSlug: contract.brandSlug,
  })

  return NextResponse.json({ contract: serializeContract(updated, stationCount) })
}
