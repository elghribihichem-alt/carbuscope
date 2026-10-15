import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeService, serializeConversion } from "@/lib/t51-server"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// T51 — Gestion des services TMP. GET ?hubId=&type=&limit= → prestations
// (vidanges, pneus, diagnostics) + conversions + statistiques (par type,
// série mensuelle CA/prestations/conversions, top véhicules).
// POST « creer-prestation » → enregistre une prestation réalisée (met à jour
// la fiche véhicule si elle existe). POST « confirmer-conversion » /
// « perdre-conversion » → suivi des conversions.

const DAY = 86_400_000

export async function GET(req: NextRequest) {
  const hubId = req.nextUrl.searchParams.get("hubId")?.trim() || null
  const type = req.nextUrl.searchParams.get("type")?.trim() || null
  const limit = Math.min(400, Math.max(10, Number(req.nextUrl.searchParams.get("limit") ?? 200)))
  const TYPES = ["VIDANGE", "PNEUS_VENTE", "PNEUS_MONTAGE", "DIAGNOSTIC"]

  const [records, conversions, hubs] = await Promise.all([
    db.hubServiceRecord.findMany({
      where: {
        ...(hubId ? { hubId } : {}),
        ...(type && TYPES.includes(type) ? { type } : {}),
      },
      orderBy: { performedAt: "desc" },
      take: limit,
    }),
    db.hubConversion.findMany({
      where: hubId ? { hubId } : {},
      orderBy: { proposedAt: "desc" },
      take: 200,
    }),
    db.mobilityHub.findMany({ select: { id: true, code: true } }),
  ])
  const codeById = new Map(hubs.map(h => [h.id, h.code]))
  // Agrégats sur les prestations de la fenêtre (les plus récentes ≤ limit)
  const now = Date.now()
  const byType = TYPES.map(t => {
    const rows = records.filter(r => r.type === t)
    return {
      type: t, count: rows.length,
      amount: Math.round(rows.reduce((s, r) => s + r.amount, 0)),
      avg: rows.length ? Math.round(rows.reduce((s, r) => s + r.amount, 0) / rows.length) : 0,
    }
  })
  // Série mensuelle (6 mois) CA + prestations + conversions confirmées
  const monthly: { month: string; ca: number; services: number; conversions: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now - (i + 1) * 30 * DAY)
    const end = new Date(now - i * 30 * DAY)
    const inRange = (d: Date) => d >= start && d < end
    const mr = records.filter(r => inRange(r.performedAt))
    const mc = conversions.filter(c => inRange(c.proposedAt) && c.status === "CONFIRMEE")
    monthly.push({
      month: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(end),
      ca: Math.round(mr.reduce((s, r) => s + r.amount, 0)),
      services: mr.length,
      conversions: mc.length,
    })
  }
  const convStats = {
    total: conversions.length,
    confirmed: conversions.filter(c => c.status === "CONFIRMEE").length,
    proposed: conversions.filter(c => c.status === "PROPOSEE").length,
    lost: conversions.filter(c => c.status === "PERDUE").length,
    captured: Math.round(conversions.filter(c => c.status === "CONFIRMEE").reduce((s, c) => s + c.amount, 0)),
  }
  return NextResponse.json({
    records: records.map(r => serializeService(r, codeById.get(r.hubId))),
    conversions: conversions.map(c => serializeConversion(c, codeById.get(c.hubId))),
    byType,
    monthly,
    convStats,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : undefined

  if (body.action === "creer-prestation") {
    const hubId = typeof body.hubId === "string" ? body.hubId : ""
    const type = typeof body.type === "string" ? body.type : ""
    const plate = typeof body.plate === "string" ? body.plate.trim().toUpperCase() : ""
    const TYPES = ["VIDANGE", "PNEUS_VENTE", "PNEUS_MONTAGE", "DIAGNOSTIC"]
    if (!hubId || !TYPES.includes(type) || plate.length < 4) {
      return NextResponse.json({ error: "Paramètres « hubId » / « type » / « plate » invalides" }, { status: 400 })
    }
    const hub = await db.mobilityHub.findUnique({ where: { id: hubId } })
    if (!hub) return NextResponse.json({ error: "TMP introuvable" }, { status: 404 })
    const amount = typeof body.amount === "number" && body.amount > 0 ? body.amount : 0
    const durationMin = typeof body.durationMin === "number" && body.durationMin > 0 ? Math.round(body.durationMin) : 30
    const detail = typeof body.detail === "string" ? body.detail.slice(0, 300) : null
    const record = await db.hubServiceRecord.create({
      data: { hubId, type, plate, performedAt: new Date(), amount, durationMin, detail, vehicleId: null },
    })
    // Mise à jour de la fiche véhicule (si immatriculation connue du TMP)
    const vehicle = await db.hubVehicle.findUnique({ where: { hubId_plate: { hubId, plate } } })
    if (vehicle) {
      const next = new Date()
      next.setDate(next.getDate() + 180)
      await db.hubVehicle.update({
        where: { id: vehicle.id },
        data: {
          servicesCount: { increment: 1 },
          totalSpent: { increment: amount },
          loyaltyPoints: { increment: type === "VIDANGE" ? 10 : type === "DIAGNOSTIC" ? 5 : type.startsWith("PNEUS") ? 15 : 0 },
          lastServiceAt: new Date(),
          nextServiceDueAt: next,
        },
      })
      // Recalcul du palier de fidélité
      const pts = vehicle.loyaltyPoints + (type === "VIDANGE" ? 10 : type === "DIAGNOSTIC" ? 5 : type.startsWith("PNEUS") ? 15 : 0)
      const tier = pts >= 500 ? "PLATINE" : pts >= 300 ? "OR" : pts >= 150 ? "ARGENT" : "BRONZE"
      await db.hubVehicle.update({ where: { id: vehicle.id }, data: { loyaltyTier: tier } })
      await db.hubServiceRecord.update({ where: { id: record.id }, data: { vehicleId: vehicle.id } })
    }
    await logAudit({
      acteur: actor ? { nom: "Utilisateur", email: actor, role: "PORTAIL" } : undefined,
      module: "MOBILITY",
      action: "Enregistrement d'une prestation TMP",
      cibleType: "TMP",
      cibleLabel: `${hub.code} — ${type} · ${plate}`,
      details: `${amount.toLocaleString("fr-FR")} DT · ${durationMin} min`,
    })
    return NextResponse.json({ ok: true, id: record.id, vehicleUpdated: Boolean(vehicle) })
  }

  if (body.action === "confirmer-conversion" || body.action === "perdre-conversion") {
    const conversionId = typeof body.conversionId === "string" ? body.conversionId : ""
    if (!conversionId) return NextResponse.json({ error: "Paramètre « conversionId » requis" }, { status: 400 })
    const conv = await db.hubConversion.findUnique({ where: { id: conversionId } })
    if (!conv) return NextResponse.json({ error: "Conversion introuvable" }, { status: 404 })
    const status = body.action === "confirmer-conversion" ? "CONFIRMEE" : "PERDUE"
    await db.hubConversion.update({
      where: { id: conversionId },
      data: { status, confirmedAt: status === "CONFIRMEE" ? new Date() : null },
    })
    await logAudit({
      acteur: actor ? { nom: "Utilisateur", email: actor, role: "PORTAIL" } : undefined,
      module: "MOBILITY",
      action: `Conversion ${status === "CONFIRMEE" ? "confirmée" : "marquée perdue"}`,
      cibleType: "Conversion",
      cibleLabel: `${conv.plate} → ${conv.targetStationName}`,
      details: conv.reason,
    })
    return NextResponse.json({ ok: true, status })
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 400 })
}
