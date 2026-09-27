// GET/POST/PATCH /api/shadow/auditors — équipe d'audit terrain (T44)
// GET : auditeurs + gouvernorats distincts couverts par le recensement.
// POST : création. PATCH ?id= : mise à jour (zone, active, pointsDone…).
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getDataset, auditorDTO } from "@/app/api/shadow/_lib"

export const dynamic = "force-dynamic"

export async function GET() {
  const [auditors, ds] = await Promise.all([
    db.shadowAuditor.findMany({ orderBy: [{ active: "desc" }, { pointsDone: "desc" }] }),
    getDataset(),
  ])
  // Gouvernorats distincts couverts (points actifs ∪ zones des auditeurs)
  const zones = new Set<string>()
  for (const p of ds.points) zones.add(p.gouvernorat)
  for (const a of auditors) if (a.zone && a.zone !== "National") zones.add(a.zone)

  return NextResponse.json({
    auditors: auditors.map(auditorDTO),
    zones: [...zones].sort((a, b) => a.localeCompare(b, "fr")),
  })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 })
  }
  const name = String(body.name ?? "").trim()
  const zone = String(body.zone ?? "").trim()
  if (!name || !zone) return NextResponse.json({ error: "Nom et zone requis" }, { status: 400 })

  const auditor = await db.shadowAuditor.create({
    data: {
      name: name.slice(0, 120),
      zone: zone.slice(0, 120),
      brandSlug: body.brandSlug ? String(body.brandSlug).slice(0, 60) : "",
      phone: body.phone ? String(body.phone).slice(0, 40) : "",
      pointsDone: 0,
      rechecks: 0,
      active: true,
    },
  })
  return NextResponse.json({ auditor: auditorDTO(auditor) }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim()
  if (!id) return NextResponse.json({ error: "Paramètre id requis" }, { status: 400 })

  const existing = await db.shadowAuditor.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Auditeur introuvable" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = String(body.name).slice(0, 120)
  if (body.zone !== undefined) data.zone = String(body.zone).slice(0, 120)
  if (body.brandSlug !== undefined) data.brandSlug = String(body.brandSlug).slice(0, 60)
  if (body.phone !== undefined) data.phone = String(body.phone).slice(0, 40)
  if (body.active !== undefined) data.active = Boolean(body.active)
  if (body.pointsDone !== undefined) {
    const v = Number(body.pointsDone)
    if (!Number.isFinite(v) || v < 0 || v > 100000) return NextResponse.json({ error: "pointsDone invalide" }, { status: 400 })
    data.pointsDone = Math.round(v)
  }
  if (body.rechecks !== undefined) {
    const v = Number(body.rechecks)
    if (!Number.isFinite(v) || v < 0 || v > 100000) return NextResponse.json({ error: "rechecks invalide" }, { status: 400 })
    data.rechecks = Math.round(v)
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 })

  const auditor = await db.shadowAuditor.update({ where: { id }, data })
  return NextResponse.json({ auditor: auditorDTO(auditor) })
}
