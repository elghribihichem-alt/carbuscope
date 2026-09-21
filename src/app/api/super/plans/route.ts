import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializePlan } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

const PLAN_CODES = ["ESSENTIEL", "PRO", "ENTERPRISE"]

/** Stats dérivées des contrats par plan : nb total, nb actif, MRR (ACTIF). */
async function planStats(): Promise<Map<string, { contractsCount: number; contractsActive: number; mrr: number }>> {
  const contracts = await db.saasContract.findMany({
    select: { plan: true, status: true, monthlyFee: true },
  })
  const stats = new Map<string, { contractsCount: number; contractsActive: number; mrr: number }>()
  for (const code of PLAN_CODES) stats.set(code, { contractsCount: 0, contractsActive: 0, mrr: 0 })
  for (const c of contracts) {
    const s = stats.get(c.plan)
    if (!s) continue
    s.contractsCount += 1
    if (c.status === "ACTIF") {
      s.contractsActive += 1
      s.mrr += c.monthlyFee
    }
  }
  return stats
}

// GET /api/super/plans — catalogue des plans tarifaires (trié par sortOrder)
// avec stats dérivées : nombre de contrats par plan et MRR par plan (ACTIF).
export async function GET() {
  const [plans, stats] = await Promise.all([
    db.saasPlan.findMany({ orderBy: { sortOrder: "asc" } }),
    planStats(),
  ])
  return NextResponse.json({
    plans: plans.map(p =>
      serializePlan(p, stats.get(p.code) ?? { contractsCount: 0, contractsActive: 0, mrr: 0 })
    ),
  })
}

// PATCH /api/super/plans — édition d'un plan du catalogue
// (body {id, monthlyFee?, seatsIncluded?, stationQuota?, features?}),
// journalisée en audit SYSTEME avec les seuls champs réellement modifiés.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || typeof body.id !== "string") {
    return NextResponse.json({ error: "Identifiant du plan requis" }, { status: 400 })
  }

  if (
    body.monthlyFee !== undefined &&
    (typeof body.monthlyFee !== "number" || !Number.isInteger(body.monthlyFee) || body.monthlyFee < 1 || body.monthlyFee > 100000)
  ) {
    return NextResponse.json({ error: "Tarif mensuel invalide — entier entre 1 et 100 000 DT" }, { status: 400 })
  }
  if (
    body.seatsIncluded !== undefined &&
    (typeof body.seatsIncluded !== "number" || !Number.isInteger(body.seatsIncluded) || body.seatsIncluded < 1 || body.seatsIncluded > 500)
  ) {
    return NextResponse.json({ error: "Sièges inclus invalide — entier entre 1 et 500" }, { status: 400 })
  }
  if (
    body.stationQuota !== undefined &&
    (typeof body.stationQuota !== "number" || !Number.isInteger(body.stationQuota) || body.stationQuota < 1 || body.stationQuota > 5000)
  ) {
    return NextResponse.json({ error: "Quota de stations invalide — entier entre 1 et 5 000" }, { status: 400 })
  }
  if (
    body.features !== undefined &&
    (typeof body.features !== "string" ||
      body.features.split("|").map(f => f.trim()).filter(Boolean).length === 0 ||
      body.features.length > 500)
  ) {
    return NextResponse.json({ error: "Fonctionnalités invalides — au moins une, séparées par « | »" }, { status: 400 })
  }

  const plan = await db.saasPlan.findUnique({ where: { id: body.id } })
  if (!plan) return NextResponse.json({ error: "Plan introuvable" }, { status: 404 })

  // Ne journaliser/mettre à jour que les champs réellement changés.
  const data: { monthlyFee?: number; seatsIncluded?: number; stationQuota?: number; features?: string } = {}
  const parts: string[] = []
  const fmtAmount = (v: number) => new Intl.NumberFormat("fr-FR").format(v)

  if (body.monthlyFee !== undefined && body.monthlyFee !== plan.monthlyFee) {
    data.monthlyFee = body.monthlyFee
    parts.push(`tarif ${fmtAmount(plan.monthlyFee)} → ${fmtAmount(body.monthlyFee)} DT`)
  }
  if (body.seatsIncluded !== undefined && body.seatsIncluded !== plan.seatsIncluded) {
    data.seatsIncluded = body.seatsIncluded
    parts.push(`sièges ${plan.seatsIncluded} → ${body.seatsIncluded}`)
  }
  if (body.stationQuota !== undefined && body.stationQuota !== plan.stationQuota) {
    data.stationQuota = body.stationQuota
    parts.push(`quota stations ${plan.stationQuota} → ${body.stationQuota}`)
  }
  if (body.features !== undefined) {
    const normalized = body.features.split("|").map(f => f.trim()).filter(Boolean).join("|")
    if (normalized !== plan.features) {
      data.features = normalized
      parts.push("fonctionnalités mises à jour")
    }
  }

  if (Object.keys(data).length === 0) {
    // Aucun changement effectif : renvoyer le plan tel quel, sans audit.
    const stats = await planStats()
    return NextResponse.json({
      plan: serializePlan(plan, stats.get(plan.code) ?? { contractsCount: 0, contractsActive: 0, mrr: 0 }),
    })
  }

  const updated = await db.saasPlan.update({ where: { id: body.id }, data })

  await logAudit({
    kind: "SYSTEME",
    message: `Catalogue plans : ${plan.code} — ${parts.join(", ")}`,
    actor: body?.actor,
  })

  const stats = await planStats()
  return NextResponse.json({
    plan: serializePlan(updated, stats.get(updated.code) ?? { contractsCount: 0, contractsActive: 0, mrr: 0 }),
  })
}
