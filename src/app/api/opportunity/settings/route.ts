import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeOpportunitySetting } from "@/lib/t51-server"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// T51 — Paramétrage Super Admin du Radar d'Opportunités.
// GET  → toutes les lignes (globale + enseignes).
// POST → « maj-reglage » : activation + poids du scoring + seuils, par
//        enseigne (brandSlug null = ligne globale). Audité (module OPPORTUNITY).

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export async function GET() {
  const settings = await db.opportunitySetting.findMany({
    orderBy: [{ brandSlug: "desc" }], // ligne globale (null) en premier
  })
  return NextResponse.json({ settings: settings.map(serializeOpportunitySetting) })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || body.action !== "maj-reglage") {
    return NextResponse.json({ error: "Action « maj-reglage » attendue" }, { status: 400 })
  }
  const brandSlug = typeof body.brandSlug === "string" && body.brandSlug.trim() ? body.brandSlug.trim() : null
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : undefined

  const data = {
    enabled: Boolean(body.enabled),
    weightPark: num(body.weightPark, 0, 1, 0.30),
    weightPower: num(body.weightPower, 0, 1, 0.20),
    weightTraffic: num(body.weightTraffic, 0, 1, 0.25),
    weightCompetition: num(body.weightCompetition, 0, 1, 0.15),
    weightFoncier: num(body.weightFoncier, 0, 1, 0.10),
    alertThreshold: Math.round(num(body.alertThreshold, 0, 100, 70)),
    whiteZoneKm: num(body.whiteZoneKm, 1, 50, 5),
    updatedBy: actor ?? null,
  }
  const sum = data.weightPark + data.weightPower + data.weightTraffic + data.weightCompetition + data.weightFoncier
  if (Math.abs(sum - 1) > 0.02) {
    return NextResponse.json(
      { error: `La somme des poids doit valoir 1 (actuellement ${Math.round(sum * 100) / 100}).` },
      { status: 400 },
    )
  }
  const existing = brandSlug
    ? await db.opportunitySetting.findUnique({ where: { brandSlug } })
    : await db.opportunitySetting.findFirst({ where: { brandSlug: null } })
  const row = existing
    ? await db.opportunitySetting.update({ where: { id: existing.id }, data })
    : await db.opportunitySetting.create({ data: { brandSlug, ...data } })
  await logAudit({
    acteur: actor ? { nom: "Super Admin", email: actor, role: "SUPER_ADMIN" } : undefined,
    module: "OPPORTUNITY",
    action: "Paramétrage du Radar d'Opportunités",
    cibleType: "Enseigne",
    cibleLabel: brandSlug ?? "Réglage global (toutes enseignes)",
    details: `${data.enabled ? "activé" : "désactivé"} · seuil ${data.alertThreshold}/100 · rayon zones blanches ${data.whiteZoneKm} km`,
  })
  return NextResponse.json({ ok: true, settings: serializeOpportunitySetting(row) })
}
