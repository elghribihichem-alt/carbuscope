// POST /api/media/simulations/[id]/share — LIEN PARTAGEABLE SIGNÉ, lecture
// seule, valable 30 jours. Le lien mène au rapport PDF hébergé. Envoi par
// email (mailto) et WhatsApp via wa.me côté client — AUCUNE API Business.

import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { json404, json403, logMediaAudit, requireMedia } from "../../../_lib"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard

  const sim = await db.mediaSimulation.findUnique({ where: { id } })
  if (!sim) return json404()
  if (ctx.role !== "SA" && sim.brandSlug !== ctx.brandSlug) return json404()
  if (!sim.results) return json403("Aucun résultat — lancez d'abord la simulation.")

  const token = randomBytes(24).toString("hex")
  const expiresAt = new Date(Date.now() + 30 * 86_400_000)
  await db.mediaShareLink.create({ data: { token, simulationId: id, expiresAt } })

  const origin = req.nextUrl.origin
  const url = `${origin}/api/media/share/${token}`
  await logMediaAudit(ctx, req, {
    action: "SHARE", entityType: "SIMULATION", entityId: id, entityLabel: sim.name,
    field: "lien signé 30 j", oldValue: "—", newValue: `exp. ${expiresAt.toISOString().slice(0, 10)}`,
  })
  return NextResponse.json({ url, expiresAt: expiresAt.toISOString() })
}
