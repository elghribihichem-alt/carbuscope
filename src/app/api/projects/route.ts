import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  const projects = await db.infraProject.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json({ projects })
}
