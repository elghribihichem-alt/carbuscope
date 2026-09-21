import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const limit = Math.min(Number(sp.get("limit") ?? 50), 200)
  const severity = sp.get("severity")
  const alerts = await db.alert.findMany({
    where: severity ? { severity } : undefined,
    orderBy: [{ date: "desc" }],
    take: limit,
  })
  return NextResponse.json({ alerts })
}
