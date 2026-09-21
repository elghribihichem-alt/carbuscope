import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializeUser } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

// PATCH /api/super/users/[id] — active / suspend un compte utilisateur.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  if (typeof body?.active !== "boolean") {
    return NextResponse.json({ error: "Champ « active » (booléen) requis" }, { status: 400 })
  }

  const user = await db.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })

  const updated = await db.user.update({ where: { id }, data: { active: body.active } })

  await logAudit({
    kind: "UTILISATEUR",
    message: `Compte « ${user.name} » (${user.email}) ${body.active ? "réactivé" : "suspendu"}`,
    actor: body?.actor,
    brandSlug: user.brandSlug,
  })

  return NextResponse.json({ user: serializeUser(updated) })
}
