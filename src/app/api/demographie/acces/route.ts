import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// /api/demographie/acces (T37) : sonde légère pour la navigation de
// l'Observatoire B2B — { access: { level, canEdit } | null }. Sert à faire
// apparaître (ou non) l'onglet « Démographie » de l'utilisateur connecté
// selon le paramétrage de visibilité défini par la Super Administration.

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.trim() ?? ""
  if (!email) {
    return NextResponse.json({ error: "Paramètre « email » requis" }, { status: 400 })
  }
  const user = await db.user.findUnique({ where: { email } })
  if (!user) return NextResponse.json({ access: null })
  const access = await db.demographicAccess.findUnique({ where: { userId: user.id } })
  if (!access) return NextResponse.json({ access: null })
  return NextResponse.json({
    access: {
      level: access.level === "DELEGATIONS" ? "DELEGATIONS" : "GOUVERNORATS",
      canEdit: access.canEdit,
    },
  })
}
