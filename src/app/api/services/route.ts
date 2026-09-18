import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  const services = await db.service.findMany({ orderBy: { slug: "asc" } })
  return NextResponse.json({ services })
}
