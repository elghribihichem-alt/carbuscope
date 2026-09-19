import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { relayNotifications } from "@/lib/notif-relay"
import type { FuelPriceCurrent, FuelPriceDTO, FuelPricesResponse, FuelType } from "@/lib/types"

export const dynamic = "force-dynamic"

// GET /api/prices — observatoire des prix du carburant (T22).
// Prix pompe tunisiens fixés par décret (identiques sur tout le territoire) :
//   - current  : dernier décret par carburant + variation vs précédent ;
//   - history  : série chronologique complète (tous carburants) ;
//   - totals   : nombre de décrets, dernier changement, prochaine révision.
// Consommé par l'onglet B2B « Prix & marges », la bannière mobile B2C et la
// référence du signalement « Prix anormal » (B.2.5).
//
// POST /api/prices — administration des décrets (back-office, T23) :
// publie un nouveau décret (prix pompe + marge détaillant réglementée) et
// notifie automatiquement toutes les enseignes via le centre de notifications
// (cloche du portail) — fermeture de boucle réglementaire.

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

// ---------- POST : publication d'un décret (back-office) ----------

const FUEL_LABELS: Record<string, string> = {
  ESSENCE: "Essence",
  GAZOLE: "Gazole",
  GPL: "GPL (au kg)",
}

const dateFr = (d: Date): string =>
  d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

export async function POST(req: NextRequest) {
  let body: {
    fuelType?: string
    priceMillimes?: number
    marginMillimes?: number
    effectiveAt?: string
    decreeNote?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 })
  }

  const fuelType = String(body.fuelType ?? "")
  if (!FUEL_TYPES.includes(fuelType as FuelType)) {
    return NextResponse.json({ error: "Type de carburant invalide (ESSENCE, GAZOLE ou GPL)." }, { status: 400 })
  }

  const priceMillimes = Number(body.priceMillimes)
  const marginMillimes = Number(body.marginMillimes)
  if (!Number.isInteger(priceMillimes) || priceMillimes < 300 || priceMillimes > 10_000) {
    return NextResponse.json(
      { error: "Prix invalide : entier en millimes, entre 300 et 10 000 (0,300 – 10,000 DT)." },
      { status: 400 }
    )
  }
  if (!Number.isInteger(marginMillimes) || marginMillimes < 0 || marginMillimes > 1_000) {
    return NextResponse.json(
      { error: "Marge invalide : entier en millimes, entre 0 et 1 000 (0 – 1,000 DT/L)." },
      { status: 400 }
    )
  }

  const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt) : new Date()
  if (Number.isNaN(effectiveAt.getTime())) {
    return NextResponse.json({ error: "Date d'application invalide." }, { status: 400 })
  }

  const decreeNote = (body.decreeNote ?? "").toString().trim().slice(0, 200) || null

  // Refus si un décret identique existe déjà pour ce carburant (doublon).
  const existing = (await db.fuelPrice.findFirst({
    where: { fuelType, priceMillimes, marginMillimes },
    orderBy: { effectiveAt: "desc" },
  })) as { effectiveAt: Date } | null
  if (existing && Math.abs(existing.effectiveAt.getTime() - effectiveAt.getTime()) < 86_400_000) {
    return NextResponse.json(
      { error: "Un décret identique existe déjà pour ce carburant à date proche." },
      { status: 409 }
    )
  }

  // Prix précédent (pour le corps de notification).
  const prev = (await db.fuelPrice.findFirst({
    where: { fuelType },
    orderBy: { effectiveAt: "desc" },
  })) as { priceMillimes: number } | null

  const created = (await db.fuelPrice.create({
    data: { fuelType, priceMillimes, marginMillimes, effectiveAt, decreeNote },
  })) as PriceRow

  // Notification in-app pour chaque enseigne — la cloche du portail sonne.
  const brands = await db.brand.findMany({ select: { slug: true, name: true } })
  const label = FUEL_LABELS[fuelType]
  const title = `Nouveau décret — ${label} à ${(priceMillimes / 1000).toFixed(3).replace(".", ",")} DT`
  const lines = [
    prev
      ? `Prix pompe révisé : ${(prev.priceMillimes / 1000).toFixed(3).replace(".", ",")} → ${(priceMillimes / 1000).toFixed(3).replace(".", ",")} DT (${signed(priceMillimes - prev.priceMillimes)} millimes).`
      : `Prix pompe fixé à ${(priceMillimes / 1000).toFixed(3).replace(".", ",")} DT.`,
    `Marge détaillant réglementée : ${(marginMillimes / 1000).toFixed(3).replace(".", ",")} DT/L.`,
    `Applicable depuis le ${dateFr(effectiveAt)}.`,
    decreeNote ? `Contexte : ${decreeNote}` : null,
  ].filter((x): x is string => x !== null)

  if (brands.length > 0) {
    await db.notification.createMany({
      data: brands.map(b => ({
        brandSlug: b.slug,
        kind: "DECREE",
        title,
        body: lines.join("\n"),
        stationLabel: null,
        deltaPoints: null,
      })),
    })
    // Relais WebSocket : les portails enseigne connectés voient le décret instantanément.
    void relayNotifications(
      brands.map(b => ({
        brandSlug: b.slug,
        kind: "DECREE",
        title,
        body: lines.join("\n"),
        createdAt: new Date().toISOString(),
      })),
    )
  }

  return NextResponse.json(
    {
      decree: serialize(created),
      notifiedBrands: brands.length,
      prevPriceMillimes: prev?.priceMillimes ?? null,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  )
}
