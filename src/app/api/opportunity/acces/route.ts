import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// T51 — sonde légère pour la navigation du Portail Enseigne : le module
// « Radar d'Opportunités » n'apparaît que si la Super Administration l'a
// activé pour l'enseigne (OpportunitySetting — absence de ligne = activé).

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand")?.trim() ?? ""
  if (!brand) return NextResponse.json({ error: "Paramètre « brand » requis" }, { status: 400 })
  const setting = await db.opportunitySetting.findUnique({ where: { brandSlug: brand } })
  return NextResponse.json({ enabled: setting ? setting.enabled : true })
}
