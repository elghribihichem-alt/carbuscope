// GET /api/media/simulations/[id]/pdf — rapport PDF généré CÔTÉ SERVEUR
// (jsPDF + autoTable), filigrane optionnel (?watermark=1). Le PDF n'est
// servi qu'aux membres habilités de l'enseigne propriétaire (export = rôle).

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json404, json403 } from "../../../_lib"
import { serializeSimulation } from "@/lib/media/engine"
import { buildSimulationPdf } from "@/lib/media/report-pdf"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard

  const sim = await db.mediaSimulation.findUnique({ where: { id } })
  if (!sim) return json404()
  if (ctx.role !== "SA" && sim.brandSlug !== ctx.brandSlug) return json404()
  if (!sim.results) return json403("Aucun résultat — lancez d'abord la simulation (étape 3).")

  const brand = await db.brand.findUnique({ where: { slug: sim.brandSlug }, select: { name: true, color: true } })
  const pdf = buildSimulationPdf(serializeSimulation(sim), {
    watermark: req.nextUrl.searchParams.get("watermark") === "1",
    brandName: brand?.name ?? sim.brandSlug,
    brandColor: brand?.color,
  })

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="carbuscope-${sim.name.replace(/[^\w-]+/g, "_")}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
