// CarbuScope — T54-B2 — GET /api/radar/indicators : indicateurs dérivés des
// 24 gouvernorats (pouvoir d'achat + foncier, badge « est. »).
// PATCH (Super Administration UNIQUEMENT) : { gouvernorat, kind:
// "purchasing"|"land", …champs } — mise à jour ligne par ligne, estimated
// reste true (les valeurs restent des estimations travaillées), updatedAt /
// updatedBy tracés, audit journalisé (pattern des routes /api/super/*).
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import { requireSuperAdmin } from "../_lib"

export const dynamic = "force-dynamic"

type PurchasingDTO = {
  kind?: "purchasing"
  gouvernorat: string
  gdpPerCapita: number | null
  avgIncome: number | null
  index: number
  estimated: boolean
  updatedAt: string | null
  updatedBy: string | null
}

type LandDTO = {
  kind?: "land"
  gouvernorat: string
  pricePerM2: number | null
  availability: number
  urbanPressure: number
  estimated: boolean
  updatedAt: string | null
  updatedBy: string | null
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)

export async function GET() {
  const [purchasing, land] = await Promise.all([
    db.purchasingPower.findMany({ orderBy: { gouvernorat: "asc" } }),
    db.landIndicator.findMany({ orderBy: { gouvernorat: "asc" } }),
  ])
  return NextResponse.json({
    purchasing: purchasing.map(
      (p): PurchasingDTO => ({
        gouvernorat: p.gouvernorat,
        gdpPerCapita: p.gdpPerCapita,
        avgIncome: p.avgIncome,
        index: p.index,
        estimated: p.estimated,
        updatedAt: iso(p.updatedAt),
        updatedBy: p.updatedBy,
      }),
    ),
    land: land.map(
      (l): LandDTO => ({
        gouvernorat: l.gouvernorat,
        pricePerM2: l.pricePerM2,
        availability: l.availability,
        urbanPressure: l.urbanPressure,
        estimated: l.estimated,
        updatedAt: iso(l.updatedAt),
        updatedBy: l.updatedBy,
      }),
    ),
  })
}

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."))
    if (Number.isFinite(n)) return n
  }
  return null
}

export async function PATCH(req: NextRequest) {
  const sa = await requireSuperAdmin()
  if (!sa.ok) {
    return NextResponse.json({ error: sa.error }, { status: sa.status })
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.gouvernorat !== "string" || typeof body.kind !== "string") {
    return NextResponse.json(
      { error: "Champs « gouvernorat » et « kind » (purchasing | land) requis." },
      { status: 400 },
    )
  }
  const gouvernorat = body.gouvernorat.trim()

  if (body.kind === "purchasing") {
    const row = await db.purchasingPower.findUnique({ where: { gouvernorat } })
    if (!row) {
      return NextResponse.json(
        { error: `Pouvoir d'achat introuvable pour « ${gouvernorat} ».` },
        { status: 404 },
      )
    }
    const index = body.index === undefined ? row.index : num(body.index)
    const gdp = body.gdpPerCapita === undefined ? row.gdpPerCapita : num(body.gdpPerCapita)
    const income = body.avgIncome === undefined ? row.avgIncome : num(body.avgIncome)
    if (index === null || index < 0 || index > 100) {
      return NextResponse.json(
        { error: "Indice 0-100 attendu pour le pouvoir d'achat." },
        { status: 400 },
      )
    }
    if (gdp !== null && gdp <= 0) {
      return NextResponse.json(
        { error: "PIB/habitant positif attendu (DT/an)." },
        { status: 400 },
      )
    }
    if (income !== null && income <= 0) {
      return NextResponse.json(
        { error: "Revenu moyen positif attendu (DT/mois)." },
        { status: 400 },
      )
    }
    const maj = await db.purchasingPower.update({
      where: { gouvernorat },
      // estimated reste true : les valeurs demeurent des estimations (V1).
      data: { index, gdpPerCapita: gdp, avgIncome: income, updatedAt: new Date(), updatedBy: sa.email },
    })
    await logAudit({
      acteur: { nom: sa.email, email: sa.email, role: "SUPER_ADMIN" },
      module: "RADAR",
      action: "Indicateur pouvoir d'achat modifié",
      cibleType: "PURCHASING_POWER",
      cibleLabel: gouvernorat,
      details: `indice ${Math.round(row.index)} → ${Math.round(index)}${gdp != null ? ` · PIB ${Math.round(gdp)} DT/an` : ""}${income != null ? ` · revenu ${Math.round(income)} DT/mois` : ""}`,
      severite: "NORMALE",
    })
    return NextResponse.json({
      indicator: {
        kind: "purchasing",
        gouvernorat: maj.gouvernorat,
        gdpPerCapita: maj.gdpPerCapita,
        avgIncome: maj.avgIncome,
        index: maj.index,
        estimated: maj.estimated,
        updatedAt: iso(maj.updatedAt),
        updatedBy: maj.updatedBy,
      } satisfies PurchasingDTO,
    })
  }

  if (body.kind === "land") {
    const row = await db.landIndicator.findUnique({ where: { gouvernorat } })
    if (!row) {
      return NextResponse.json(
        { error: `Indicateur foncier introuvable pour « ${gouvernorat} ».` },
        { status: 404 },
      )
    }
    const price = body.pricePerM2 === undefined ? row.pricePerM2 : num(body.pricePerM2)
    const availability =
      body.availability === undefined ? row.availability : num(body.availability)
    const pressure = body.urbanPressure === undefined ? row.urbanPressure : num(body.urbanPressure)
    if (availability === null || availability < 0 || availability > 100) {
      return NextResponse.json(
        { error: "Disponibilité foncière 0-100 attendue." },
        { status: 400 },
      )
    }
    if (pressure === null || pressure < 0 || pressure > 100) {
      return NextResponse.json(
        { error: "Pression urbaine 0-100 attendue." },
        { status: 400 },
      )
    }
    if (price !== null && price <= 0) {
      return NextResponse.json(
        { error: "Prix du m² positif attendu (DT/m²)." },
        { status: 400 },
      )
    }
    const maj = await db.landIndicator.update({
      where: { gouvernorat },
      // estimated reste true : les valeurs demeurent des estimations (V1).
      data: { pricePerM2: price, availability, urbanPressure: pressure, updatedAt: new Date(), updatedBy: sa.email },
    })
    await logAudit({
      acteur: { nom: sa.email, email: sa.email, role: "SUPER_ADMIN" },
      module: "RADAR",
      action: "Indicateur foncier modifié",
      cibleType: "LAND_INDICATOR",
      cibleLabel: gouvernorat,
      details: `disponibilité ${Math.round(row.availability)} → ${Math.round(availability)}${price != null ? ` · prix ${Math.round(price)} DT/m²` : ""}`,
      severite: "NORMALE",
    })
    return NextResponse.json({
      indicator: {
        kind: "land",
        gouvernorat: maj.gouvernorat,
        pricePerM2: maj.pricePerM2,
        availability: maj.availability,
        urbanPressure: maj.urbanPressure,
        estimated: maj.estimated,
        updatedAt: iso(maj.updatedAt),
        updatedBy: maj.updatedBy,
      } satisfies LandDTO,
    })
  }

  return NextResponse.json(
    { error: "Valeur « kind » inconnue — purchasing ou land attendu." },
    { status: 400 },
  )
}
