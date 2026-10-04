// GET /api/media/simulations/[id]/export — export TABLEUR des faces
// sélectionnées (xlsx côté serveur) : code, ville, gouvernorat, format,
// technologie, prix unitaire, remise, ODV, audience + onglet paramètres.

import { NextRequest, NextResponse } from "next/server"
import { json404, requireMedia } from "../../../_lib"
import { db } from "@/lib/db"
import { resolveFacesByIds } from "@/lib/media/permissions"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard

  const sim = await db.mediaSimulation.findUnique({ where: { id } })
  if (!sim) return json404()
  if (ctx.role !== "SA" && sim.brandSlug !== ctx.brandSlug) return json404()

  const selections = (sim.selections as { faceId: string; prixUnitaire: number; remise: number }[]) ?? []
  const resolved = await resolveFacesByIds(ctx, selections.map(s => s.faceId))
  const rows = selections.map(sel => {
    const r = resolved.get(sel.faceId)
    if (!r || r.access !== "FULL") return null
    return {
      Face: r.face.code,
      Panneau: r.face.panel.name,
      Ville: r.face.panel.ville,
      Gouvernorat: r.face.panel.governorat,
      Format: r.face.panel.format,
      Technologie: r.face.panel.technology,
      "Prix unitaire (DT)": sel.prixUnitaire,
      "Remise (%)": sel.remise,
      "ODV/jour": r.face.odvJournalieres,
      "Audience/jour": r.face.audienceJournaliere,
      "TMJA": r.face.tmja,
      "Prix semaine (DT)": r.face.prixSemaine,
      Statut: r.face.status,
    }
  }).filter(Boolean) as Record<string, string | number>[]

  const XLSX = await import("xlsx")
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Info: "Aucune face sélectionnée" }])
  XLSX.utils.book_append_sheet(wb, ws, "Faces")
  const paramsSheet = XLSX.utils.json_to_sheet([
    { Paramètre: "Nom", Valeur: sim.name },
    { Paramètre: "Client", Valeur: sim.client ?? "—" },
    { Paramètre: "Début", Valeur: sim.dateStart?.toISOString().slice(0, 10) ?? "—" },
    { Paramètre: "Fin", Valeur: sim.dateEnd?.toISOString().slice(0, 10) ?? "—" },
    { Paramètre: "Remise globale (%)", Valeur: ((sim.params as { remiseGlobale?: number })?.remiseGlobale ?? 0) },
    { Paramètre: "Saisonnalité", Valeur: (sim.params as { saisonnalite?: boolean })?.saisonnalite ? "activée" : "désactivée" },
  ])
  XLSX.utils.book_append_sheet(wb, paramsSheet, "Paramètres")
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="carbuscope-faces-${sim.name.replace(/[^\w-]+/g, "_")}.xlsx"`,
      "Cache-Control": "no-store",
    },
  })
}
