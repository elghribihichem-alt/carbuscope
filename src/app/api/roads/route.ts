import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  const roads = await db.roadAxis.findMany()
  return NextResponse.json({
    roads: roads.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.type,
      tmj: r.tmj,
      heavyVehiclePct: r.heavyVehiclePct,
      segments: (r.segments as [number, number][]) ?? [],
    })),
  })
}
