// GET/PATCH /api/shadow/config — configuration du module (T44)
// Ligne unique (upsert) : rayons, seuils d'alerte, notifications, marge.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { configDTO, invalidateShadowCache } from "@/app/api/shadow/_lib"

export const dynamic = "force-dynamic"

async function ensureRow() {
  const row = await db.shadowConfig.findUnique({ where: { id: "shadow-config" } })
  if (row) return row
  return db.shadowConfig.create({
    data: {
      id: "shadow-config",
      radiiM: "500,1000,2000",
      cannibRadiusM: 2000,
      redZoneThreshold: 5,
      lossRedTnd: 20000,
      lossOrangeTnd: 5000,
      notifyRadiusM: 500,
      notifyActive: true,
      marginTndPerL: 0.2,
    },
  })
}

export async function GET() {
  const row = await ensureRow()
  return NextResponse.json(configDTO(row))
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (body.radiiM !== undefined) {
    const radii = Array.isArray(body.radiiM) ? body.radiiM.map(Number) : []
    const clean = radii.filter(x => Number.isFinite(x) && x > 0 && x <= 50000).map(Math.round)
    if (clean.length === 0 || clean.length > 8) return NextResponse.json({ error: "radiiM : liste de rayons (m) invalide" }, { status: 400 })
    data.radiiM = clean.join(",")
  }
  const intFields: [string, number, number][] = [
    ["cannibRadiusM", 200, 20000],
    ["redZoneThreshold", 2, 50],
    ["lossRedTnd", 500, 10000000],
    ["lossOrangeTnd", 100, 10000000],
    ["notifyRadiusM", 100, 10000],
  ]
  for (const [field, min, max] of intFields) {
    if (body[field] !== undefined) {
      const v = Number(body[field])
      if (!Number.isFinite(v) || v < min || v > max) {
        return NextResponse.json({ error: `${field} invalide (${min}–${max})` }, { status: 400 })
      }
      data[field] = Math.round(v)
    }
  }
  if (body.notifyActive !== undefined) data.notifyActive = Boolean(body.notifyActive)
  if (body.marginTndPerL !== undefined) {
    const v = Number(body.marginTndPerL)
    if (!Number.isFinite(v) || v <= 0 || v > 1) return NextResponse.json({ error: "marginTndPerL invalide (0–1 DT/L)" }, { status: 400 })
    data.marginTndPerL = v
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 })

  if (data.lossRedTnd !== undefined && data.lossOrangeTnd !== undefined && Number(data.lossRedTnd) <= Number(data.lossOrangeTnd)) {
    return NextResponse.json({ error: "lossRedTnd doit rester supérieur à lossOrangeTnd" }, { status: 400 })
  }

  const row = await db.shadowConfig.upsert({
    where: { id: "shadow-config" },
    update: data,
    create: {
      id: "shadow-config",
      radiiM: (data.radiiM as string) ?? "500,1000,2000",
      cannibRadiusM: (data.cannibRadiusM as number) ?? 2000,
      redZoneThreshold: (data.redZoneThreshold as number) ?? 5,
      lossRedTnd: (data.lossRedTnd as number) ?? 20000,
      lossOrangeTnd: (data.lossOrangeTnd as number) ?? 5000,
      notifyRadiusM: (data.notifyRadiusM as number) ?? 500,
      notifyActive: data.notifyActive === undefined ? true : Boolean(data.notifyActive),
      marginTndPerL: (data.marginTndPerL as number) ?? 0.2,
    },
  })
  invalidateShadowCache()
  return NextResponse.json(configDTO(row))
}
