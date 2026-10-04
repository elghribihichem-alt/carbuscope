// GET  /api/media/simulations — liste des simulations de l'enseigne
//       (brouillons / envoyées / archivées ; la SA voit tout, ?brandSlug=).
// POST — création d'un brouillon (l'état est conservé à chaque étape de
//       l'assistant — reprise plus tard possible).

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json400, json403, logMediaAudit, capsOf } from "../_lib"
import { MEDIA_CAPS } from "@/lib/media/shared"
import { serializeSimulation } from "@/lib/media/engine"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard

  const q = req.nextUrl.searchParams.get("brandSlug")
  const brandSlug = ctx.role === "SA" ? (q ?? undefined) : ctx.brandSlug
  const sims = await db.mediaSimulation.findMany({
    where: brandSlug ? { brandSlug } : undefined,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, brandSlug: true, authorEmail: true, name: true, client: true,
      dateStart: true, dateEnd: true, currentStep: true, status: true,
      selections: true, params: true, results: true, createdAt: true, updatedAt: true,
    },
  })
  return NextResponse.json(
    { simulations: sims.map(serializeSimulation) },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!capsOf(ctx).createSimulation) return json403("Création réservée aux rôles administrateur, gestionnaire et analyste.")
  if (ctx.role === "SA" || !ctx.brandSlug) return json403("La Super Administration gère le référentiel — les simulations sont côté enseigne.")

  const b = (await req.json().catch(() => ({}))) as { name?: string; client?: string }
  const name = typeof b.name === "string" && b.name.trim().length >= 2 ? b.name.trim().slice(0, 120) : "Nouvelle simulation"
  const client = typeof b.client === "string" && b.client.trim() ? b.client.trim().slice(0, 120) : null

  const sim = await db.mediaSimulation.create({
    data: {
      brandSlug: ctx.brandSlug!, authorEmail: ctx.user.email,
      name, client, currentStep: 1, status: "BROUILLON",
      selections: [], params: { remiseGlobale: 0, saisonnalite: true },
    },
  })
  await logMediaAudit(ctx, req, {
    action: "SIMULATION", entityType: "SIMULATION", entityId: sim.id, entityLabel: name, oldValue: "—", newValue: "BROUILLON",
  })
  return NextResponse.json({ simulation: serializeSimulation(sim) })
}
