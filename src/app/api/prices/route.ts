import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { FuelPriceCurrent, FuelPriceDTO, FuelPricesResponse, FuelType } from "@/lib/types"

export const dynamic = "force-dynamic"

// GET /api/prices — observatoire des prix du carburant (T22).
// Prix pompe tunisiens fixés par décret (identiques sur tout le territoire) :
//   - current  : dernier décret par carburant + variation vs précédent ;
//   - history  : série chronologique complète (tous carburants) ;
//   - totals   : nombre de décrets, dernier changement, prochaine révision.
// Consommé par l'onglet B2B « Prix & marges », la bannière mobile B2C et la
// référence du signalement « Prix anormal » (B.2.5).

const FUEL_TYPES: FuelType[] = ["ESSENCE", "GAZOLE", "GPL"]

type PriceRow = {
  id: string; fuelType: string; priceMillimes: number; marginMillimes: number
  effectiveAt: Date; decreeNote: string | null
}

function serialize(r: PriceRow): FuelPriceDTO {
  return {
    id: r.id,
    fuelType: r.fuelType as FuelType,
    priceMillimes: r.priceMillimes,
    marginMillimes: r.marginMillimes,
    effectiveAt: r.effectiveAt.toISOString(),
    decreeNote: r.decreeNote,
  }
}

export async function GET() {
  const rows = (await db.fuelPrice.findMany({
    orderBy: [{ fuelType: "asc" }, { effectiveAt: "asc" }],
  })) as PriceRow[]

  const now = Date.now()
  const current: FuelPriceCurrent[] = []
  const seen = new Map<string, PriceRow[]>()

  for (const r of rows) {
    const arr = seen.get(r.fuelType) ?? []
    arr.push(r)
    seen.set(r.fuelType, arr)
  }

  for (const [fuelType, arr] of seen) {
    const last = arr[arr.length - 1]
    const prev = arr.length > 1 ? arr[arr.length - 2] : null
    const daysSince = Math.max(0, Math.floor((now - last.effectiveAt.getTime()) / 86_400_000))
    current.push({
      fuelType: fuelType as FuelType,
      priceMillimes: last.priceMillimes,
      marginMillimes: last.marginMillimes,
      effectiveAt: last.effectiveAt.toISOString(),
      decreeNote: last.decreeNote,
      daysSince,
      prevPriceMillimes: prev?.priceMillimes ?? null,
      deltaMillimes: prev ? last.priceMillimes - prev.priceMillimes : null,
      deltaPct: prev && prev.priceMillimes > 0
        ? Math.round(((last.priceMillimes - prev.priceMillimes) / prev.priceMillimes) * 1000) / 10
        : null,
    })
  }

  // Ordre canonique : essence, gazole, GPL.
  current.sort((a, b) => FUEL_TYPES.indexOf(a.fuelType) - FUEL_TYPES.indexOf(b.fuelType))

  const lastChange = current
    .map(c => new Date(c.effectiveAt).getTime())
    .reduce<number | null>((acc, t) => (acc === null || t > acc ? t : acc), null)

  const res: FuelPricesResponse = {
    fetchedAt: new Date().toISOString(),
    current,
    history: rows.map(serialize),
    totals: {
      decrees: rows.length,
      lastChangeAt: lastChange ? new Date(lastChange).toISOString() : null,
      nextReviewLabel: "révision mensuelle — début du mois prochain",
    },
  }

  return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } })
}
