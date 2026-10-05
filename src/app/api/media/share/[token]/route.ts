// GET /api/media/share/[token] — LECTURE SEULE du rapport par lien signé
// (30 jours, sans session). format=pdf (défaut) sert le PDF hébergé ;
// format=json retourne le rapport (intégration).

import { NextRequest, NextResponse } from "next/server"
import { json404, json403 } from "../../_lib"
import { serializeSimulation } from "@/lib/media/engine"
import { buildSimulationPdf } from "@/lib/media/report-pdf"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[a-f0-9]{16,80}$/.test(token)) return json404("Lien invalide.")

  const link = await db.mediaShareLink.findUnique({
    where: { token },
    include: { simulation: true },
  })
  if (!link || link.revoked) return json404("Lien inconnu ou révoqué.")
  if (link.expiresAt.getTime() < Date.now()) return json403("Lien expiré (validité 30 jours).")
  const sim = link.simulation
  if (!sim.results) return json404("Rapport indisponible.")

  if (req.nextUrl.searchParams.get("format") === "json") {
    return NextResponse.json({ simulation: serializeSimulation(sim) })
  }

  const brand = await db.brand.findUnique({ where: { slug: sim.brandSlug }, select: { name: true, color: true } })
  const pdf = buildSimulationPdf(serializeSimulation(sim), {
    watermark: true,
    brandName: brand?.name ?? sim.brandSlug,
    brandColor: brand?.color,
    shareInfo: `Lecture seule · valable jusqu'au ${link.expiresAt.toLocaleDateString("fr-FR")}`,
  })
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="rapport-carbuscope.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
