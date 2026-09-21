// V7 — POST /api/auth/logout : détruit la session (cookie) + audit.
import { NextRequest, NextResponse } from "next/server"
import { auditAuth, getSessionUser, SESSION_COOKIE } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function POST(_req: NextRequest) {
  const user = await getSessionUser()
  if (user) {
    await auditAuth({ name: user.name, email: user.email, role: user.role },
      "Déconnexion", "Fin de session", "NORMALE")
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set({ name: SESSION_COOKIE, value: "", httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 })
  return res
}
