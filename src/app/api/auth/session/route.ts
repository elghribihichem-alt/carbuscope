// V7 — GET /api/auth/session : l'utilisateur connecté (ou null).
import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getSessionUser()
  return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } })
}
