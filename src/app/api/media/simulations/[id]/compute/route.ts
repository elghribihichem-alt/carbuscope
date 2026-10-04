// POST /api/media/simulations/[id]/compute — MOTEUR DE SIMULATION (étape 3).
// Exécution < 2 s. Produit le rapport complet : ODV totales, audience brute,
// reach dédupliqué par zone, fréquence, CPM, coût par tête, stations du
// réseau touchées + concurrentes par enseigne adverse, part de voix,
// couverture réseau. Les résultats sont persistés (reprise + rapport PDF).

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json403, json404, logMediaAudit } from "../../../_lib"
import { serializeSimulation, computeSimulation } from "@/lib/media/engine"
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

  const results = await computeSimulation(ctx, {
    brandSlug: sim.brandSlug,
    selections: (sim.selections as { faceId: string; prixUnitaire: number; remise: number }[]) ?? [],
    dateStart: sim.dateStart,
    dateEnd: sim.dateEnd,
    params: (sim.params as { remiseGlobale: number; saisonnalite: boolean }) ?? { remiseGlobale: 0, saisonnalite: true },
  })

  const updated = await db.mediaSimulation.update({ where: { id }, data: { results: results as never } })
  await logMediaAudit(ctx, req, {
    action: "SIMULATION", entityType: "SIMULATION", entityId: id, entityLabel: sim.name,
    field: "calcul moteur",
    oldValue: "—",
    newValue: `${results.facesCount} faces · ${results.odvTotal.toLocaleString("fr-FR")} ODV · ${results.coutTotal.toLocaleString("fr-FR")} DT`,
  })
  return NextResponse.json({ simulation: serializeSimulation(updated) })
}
