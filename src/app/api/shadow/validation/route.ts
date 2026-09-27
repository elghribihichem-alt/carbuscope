// GET /api/shadow/validation — file de validation des signalements (T44)
// Points BRUT / VERIFIE en attente + statistiques par statut.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getDataset, pointDTO, pointLossTnd, nearestStationFor } from "@/app/api/shadow/_lib"

export const dynamic = "force-dynamic"

export async function GET() {
  const ds = await getDataset()
  const [pending, rows] = await Promise.all([
    db.shadowPoint.findMany({
      where: { status: { in: ["BRUT", "VERIFIE"] } },
      orderBy: { firstSeenAt: "desc" },
    }),
    db.shadowPoint.findMany({ select: { status: true } }),
  ])

  const byId = new Map(ds.points.map(p => [p.id, p]))
  const pendingDtos = pending.map(r => {
    const eff = byId.get(r.id)
    if (eff) return pointDTO(eff, eff.lossTnd, eff.nearest)
    return pointDTO(r, pointLossTnd(r.volumeLJ, ds.config.marginTndPerL), nearestStationFor(r.lat, r.lng, ds))
  })

  const stats = {
    brut: rows.filter(r => r.status === "BRUT").length,
    verifie: rows.filter(r => r.status === "VERIFIE").length,
    valide: rows.filter(r => r.status === "VALIDE").length,
    rejete: rows.filter(r => r.status === "REJETE").length,
    doublon: rows.filter(r => r.status === "DOUBLON").length,
  }

  return NextResponse.json({ pending: pendingDtos, stats })
}
