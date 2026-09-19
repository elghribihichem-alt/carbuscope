import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// DELETE /api/prices/[id] — purge d'un décret erroné du registre (T23).
// Sécurité : le dernier décret d'un carburant ne peut pas être supprimé —
// sinon le marché n'aurait plus de référence de prix ; la suppression d'un
// décret récent fait retomber le prix en vigueur sur le décret précédent
// (comportement naturel de l'API GET qui lit le dernier par effectiveAt).

type Params = { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params

  const decree = await db.fuelPrice.findUnique({ where: { id } })
  if (!decree) {
    return NextResponse.json({ error: "Décret introuvable." }, { status: 404 })
  }

  // Le décret visé est-il le plus récent de son carburant ?
  const latest = await db.fuelPrice.findFirst({
    where: { fuelType: decree.fuelType },
    orderBy: { effectiveAt: "desc" },
  })
  if (latest && latest.id === decree.id) {
    const count = await db.fuelPrice.count({ where: { fuelType: decree.fuelType } })
    if (count <= 1) {
      return NextResponse.json(
        { error: "Impossible de supprimer le dernier décret de ce carburant — le marché perdrait sa référence de prix." },
        { status: 409 }
      )
    }
  }

  const fallback = latest && latest.id !== decree.id
    ? null
    : await db.fuelPrice.findFirst({
        where: { fuelType: decree.fuelType, id: { not: decree.id } },
        orderBy: { effectiveAt: "desc" },
      })

  await db.fuelPrice.delete({ where: { id } })

  return NextResponse.json(
    {
      deleted: {
        id: decree.id,
        fuelType: decree.fuelType,
        priceMillimes: decree.priceMillimes,
        effectiveAt: decree.effectiveAt.toISOString(),
      },
      fallbackPriceMillimes: fallback?.priceMillimes ?? null,
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
