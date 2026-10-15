import { NextRequest, NextResponse } from "next/server"
import { computeRadarZones } from "@/lib/radar-scoring"

export const dynamic = "force-dynamic"

// T55-A1 — GET /api/radar/zones?brand=agil
// Scoring 5 critères des 24 gouvernorats (pondération configurable en
// console SA) + paliers quartiles + présence enseignes + alertes actives.
export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand") || null
  const data = await computeRadarZones(brand)
  return NextResponse.json(data)
}
