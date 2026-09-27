// GET/PATCH/DELETE /api/shadow/points/[id] — fiche point informel (T44)
// [id] accepte l'identifiant interne (cuid) OU le code « SM-26-XXXX ».
// PATCH : workflow de validation ({ status }) ou mise à jour terrain
// ({ volumeLJ, priceMillimes, active, typologyCode, lat, lng, notes }) avec
// trace ShadowPointUpdate. DELETE : suppression douce (disparition).
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import {
  getDataset, invalidateShadowCache, nearestStationFor, pointDTO, pointLossTnd, updateDTO,
} from "@/app/api/shadow/_lib"

export const dynamic = "force-dynamic"

const TRANSITIONS: Record<string, string[]> = {
  BRUT: ["VERIFIE", "REJETE", "DOUBLON"],
  VERIFIE: ["VALIDE", "REJETE", "DOUBLON"],
  VALIDE: ["REJETE", "DOUBLON"],
  REJETE: [],
  DOUBLON: [],
}

async function findPoint(idOrCode: string) {
  return (
    (await db.shadowPoint.findUnique({ where: { id: idOrCode } })) ??
    (await db.shadowPoint.findUnique({ where: { code: idOrCode.toUpperCase() } }))
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const point = await findPoint(id)
  if (!point) return NextResponse.json({ error: "Point introuvable" }, { status: 404 })

  const ds = await getDataset()
  const eff = ds.points.find(p => p.id === point.id)
  const loss = pointLossTnd(point.volumeLJ, ds.config.marginTndPerL)
  const dto = eff ? pointDTO(eff, eff.lossTnd, eff.nearest) : pointDTO(point, loss, nearestStationFor(point.lat, point.lng, ds))

  const updates = await db.shadowPointUpdate.findMany({
    where: { pointId: point.id },
    orderBy: { date: "desc" },
    include: { point: { select: { code: true, typologyCode: true, gouvernorat: true } } },
  })

  return NextResponse.json({ point: dto, updates: updates.map(updateDTO) })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const point = await findPoint(id)
  if (!point) return NextResponse.json({ error: "Point introuvable" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 })
  }

  const session = await getSessionUser()
  const author = session?.name ?? "Plateforme"
  const now = new Date()
  const ds = await getDataset()

  // --- Chemin 1 : workflow de validation ({ status }) ---
  if (body.status !== undefined && Object.keys(body).length === 1) {
    const next = String(body.status).toUpperCase()
    if (!(TRANSITIONS[point.status] ?? []).includes(next)) {
      return NextResponse.json(
        { error: `Transition ${point.status} → ${next} non autorisée (BRUT→VERIFIE→VALIDE/REJETE/DOUBLON)` },
        { status: 400 },
      )
    }
    const updated = await db.shadowPoint.update({ where: { id: point.id }, data: { status: next, lastCheckAt: now } })
    await db.shadowPointUpdate.create({
      data: { pointId: point.id, kind: "STATUT", oldValue: point.status, newValue: next, author, date: now },
    })
    invalidateShadowCache()
    const eff = ds.points.find(p => p.id === point.id)
    return NextResponse.json({
      point: pointDTO(updated, pointLossTnd(updated.volumeLJ, ds.config.marginTndPerL), eff?.nearest ?? nearestStationFor(updated.lat, updated.lng, ds)),
    })
  }

  // --- Chemin 2 : mise à jour terrain ---
  const data: Record<string, unknown> = { lastCheckAt: now }
  const queue: { kind: string; oldValue: string | null; newValue: string | null }[] = []

  if (body.volumeLJ !== undefined) {
    const v = Number(body.volumeLJ)
    if (!Number.isFinite(v) || v < 0 || v > 100000) return NextResponse.json({ error: "Volume L/j invalide" }, { status: 400 })
    if (Math.round(v) !== point.volumeLJ) {
      queue.push({ kind: "VOLUME", oldValue: `${point.volumeLJ} L/j`, newValue: `${Math.round(v)} L/j` })
      data.volumeLJ = Math.round(v)
    }
  }
  if (body.priceMillimes !== undefined) {
    if (body.priceMillimes === null) {
      data.priceMillimes = null
    } else {
      const v = Number(body.priceMillimes)
      if (!Number.isFinite(v) || v < 0 || v > 5000) return NextResponse.json({ error: "Prix en millimes invalide" }, { status: 400 })
      if (point.priceMillimes === null || Math.round(v) !== point.priceMillimes) {
        queue.push({ kind: "PRIX", oldValue: point.priceMillimes === null ? "—" : `${point.priceMillimes} mill.`, newValue: `${Math.round(v)} mill.` })
      }
      data.priceMillimes = Math.round(v)
    }
  }
  if (body.typologyCode !== undefined) {
    const t = String(body.typologyCode).toUpperCase()
    if (!ds.typologies.some(x => x.code === t && x.active)) return NextResponse.json({ error: "Typologie inconnue" }, { status: 400 })
    if (t !== point.typologyCode) {
      const label = (code: string) => ds.typologies.find(x => x.code === code)?.label ?? code
      queue.push({ kind: "TYPE", oldValue: label(point.typologyCode), newValue: label(t) })
      data.typologyCode = t
    }
  }
  if (body.active !== undefined) {
    const active = Boolean(body.active)
    if (active !== point.active) {
      queue.push({ kind: active ? "REAPPARITION" : "DISPARITION", oldValue: active ? "Disparu" : "Actif", newValue: active ? "Actif" : "Disparu" })
      data.active = active
    }
  }
  if (body.lat !== undefined && body.lng !== undefined) {
    const lat = Number(body.lat)
    const lng = Number(body.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 29 || lat > 38 || lng < 7 || lng > 12.5) {
      return NextResponse.json({ error: "Coordonnées invalides (Tunisie)" }, { status: 400 })
    }
    if (lat !== point.lat || lng !== point.lng) {
      queue.push({ kind: "DEPLACEMENT", oldValue: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`, newValue: `${lat.toFixed(5)}, ${lng.toFixed(5)}` })
      data.lat = lat
      data.lng = lng
    }
  }
  if (body.notes !== undefined) data.notes = String(body.notes).slice(0, 500)
  if (body.cite !== undefined) data.cite = body.cite === null ? null : String(body.cite).slice(0, 120)

  const updated = await db.shadowPoint.update({ where: { id: point.id }, data })

  // Recalcul de l'enseigne menacée si déplacement
  if (data.lat !== undefined || data.lng !== undefined) {
    const nearest = nearestStationFor(updated.lat, updated.lng, ds)
    await db.shadowPoint.update({ where: { id: point.id }, data: { brandThreat: nearest?.brandSlug ?? null } })
  }

  for (const u of queue) {
    await db.shadowPointUpdate.create({
      data: { pointId: point.id, kind: u.kind, oldValue: u.oldValue, newValue: u.newValue, author, date: now },
    })
  }

  invalidateShadowCache()
  const eff = ds.points.find(p => p.id === point.id)
  return NextResponse.json({
    point: pointDTO(updated, pointLossTnd(updated.volumeLJ, ds.config.marginTndPerL), eff?.nearest ?? nearestStationFor(updated.lat, updated.lng, ds)),
    updates: queue.map(u => ({ kind: u.kind, oldValue: u.oldValue, newValue: u.newValue })),
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const point = await findPoint(id)
  if (!point) return NextResponse.json({ error: "Point introuvable" }, { status: 404 })

  const session = await getSessionUser()
  const now = new Date()
  await db.shadowPoint.update({ where: { id: point.id }, data: { active: false, lastCheckAt: now } })
  await db.shadowPointUpdate.create({
    data: { pointId: point.id, kind: "DISPARITION", oldValue: "Actif", newValue: "Disparu", author: session?.name ?? "Plateforme", date: now },
  })
  invalidateShadowCache()
  return NextResponse.json({ ok: true })
}
