import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeStation, STATION_INCLUDE } from "@/lib/serialize"
import type { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

// GET /api/stations?brand=agil,shell&services=lavage,cafe&status=ACTIVE&gouvernorat=Tunis&hours=24h&search=&limit=&offset=&sort=traffic
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const brand = sp.get("brand")?.split(",").filter(Boolean) ?? []
  const services = sp.get("services")?.split(",").filter(Boolean) ?? []
  const status = sp.get("status")?.split(",").filter(Boolean) ?? []
  const gouvernorat = sp.get("gouvernorat") ?? undefined
  const hours = sp.get("hours") ?? undefined
  const search = sp.get("search")?.trim() ?? ""
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 400), 1), 2200)
  const offset = Math.max(Number(sp.get("offset") ?? 0), 0)
  const sort = sp.get("sort") ?? "traffic"

  const where: Prisma.StationWhereInput = {
    ...(brand.length ? { brand: { slug: { in: brand } } } : {}),
    ...(status.length ? { status: { in: status } } : {}),
    ...(gouvernorat && gouvernorat !== "ALL" ? { gouvernorat } : {}),
    ...(hours === "24h" ? { open24: true } : hours === "7j" ? { open7j: true } : hours === "day" ? { open24: false } : {}),
    ...(services.length
      ? { AND: services.map(slug => ({ services: { some: { service: { slug } } } })) }
      : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { address: { contains: search } },
            { delegation: { contains: search } },
            { gouvernorat: { contains: search } },
            { code: { contains: search } },
            { brand: { name: { contains: search } } },
          ],
        }
      : {}),
  }

  const orderBy: Prisma.StationOrderByWithRelationInput =
    sort === "rating" ? { rating: "desc" }
    : sort === "recent" ? { lastVerified: "desc" }
    : sort === "name" ? { name: "asc" }
    : { traffic: "desc" }

  const [stations, total] = await Promise.all([
    db.station.findMany({ where, orderBy, take: limit, skip: offset, include: STATION_INCLUDE }),
    db.station.count({ where }),
  ])

  return NextResponse.json({ stations: stations.map(serializeStation), total })
}

// POST /api/stations — création (Module A.4 / C.2.1)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.name || !body?.gouvernorat || !body?.delegation || typeof body?.lat !== "number" || typeof body?.lng !== "number") {
    return NextResponse.json({ error: "Champs requis : name, gouvernorat, delegation, lat, lng" }, { status: 400 })
  }

  const last = await db.station.findFirst({ orderBy: { code: "desc" }, select: { code: true } })
  const nextNum = last ? Number(last.code.replace("TN-", "")) + 1 : 1
  const code = `TN-${String(nextNum).padStart(4, "0")}`

  let brand = null
  if (body.brandId) brand = await db.brand.findUnique({ where: { id: body.brandId } })
  else if (body.brandSlug) brand = await db.brand.findUnique({ where: { slug: body.brandSlug } })

  const serviceSlugs: string[] = Array.isArray(body.services) ? body.services : []
  const services = serviceSlugs.length
    ? await db.service.findMany({ where: { slug: { in: serviceSlugs } } })
    : []

  const station = await db.station.create({
    data: {
      code,
      name: String(body.name),
      brandId: brand?.id ?? null,
      gouvernorat: String(body.gouvernorat),
      delegation: String(body.delegation),
      address: String(body.address ?? `${body.delegation}, ${body.gouvernorat}`),
      lat: Number(body.lat),
      lng: Number(body.lng),
      status: String(body.status ?? "PROJECT"),
      traffic: Number(body.traffic ?? 0),
      open24: Boolean(body.open24 ?? false),
      open7j: Boolean(body.open7j ?? false),
      verifiedBy: String(body.verifiedBy ?? "Direction Réseau"),
      lastVerified: new Date(),
      services: { create: services.map(s => ({ serviceId: s.id })) },
      history: {
        create: {
          field: "création",
          oldValue: "—",
          newValue: `Fiche créée (${String(body.status ?? "PROJECT")})`,
          author: String(body.verifiedBy ?? "Direction Réseau"),
          source: "Enseigne",
        },
      },
    },
    include: STATION_INCLUDE,
  })

  return NextResponse.json({ station: serializeStation(station) }, { status: 201 })
}
