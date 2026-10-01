// CarbuScope — T54-B2 — GET /api/radar/config : configuration du moteur de
// scoring (poids des 5 critères + seuils, singleton OpportunityConfig).
// PATCH (Super Administration UNIQUEMENT) : { weightParc, weightPurchasing,
// weightTrafic, weightConcurrence, weightFoncier, zoneBlancheThreshold,
// alertThreshold } — la somme des poids DOIT faire 100 (sinon 400 avec
// message FR), chaque écriture trace un AuditEvent (pattern des routes
// /api/super/*) et porte updatedBy = e-mail de la session SA.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import { loadConfig, requireSuperAdmin } from "../_lib"

export const dynamic = "force-dynamic"

export async function GET() {
  const config = await loadConfig()
  return NextResponse.json({ config })
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
  if (!body) {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 })
  }

  // ---- Poids (les 5 sont requis ensemble) ----
  const keys = [
    "weightParc",
    "weightPurchasing",
    "weightTrafic",
    "weightConcurrence",
    "weightFoncier",
  ] as const
  const weights: Record<string, number> = {}
  for (const k of keys) {
    const v = num(body[k])
    if (v === null) {
      return NextResponse.json(
        { error: `Poids « ${k} » manquant ou non numérique.` },
        { status: 400 },
      )
    }
    if (v < 0 || v > 100) {
      return NextResponse.json(
        { error: `Poids « ${k} » invalide : ${v} — chaque poids doit être compris entre 0 et 100.` },
        { status: 400 },
      )
    }
    weights[k] = v
  }
  const somme = keys.reduce((s, k) => s + weights[k], 0)
  if (Math.abs(somme - 100) > 0.001) {
    return NextResponse.json(
      {
        error: `La somme des 5 poids doit faire 100 (actuellement ${Math.round(somme * 10) / 10}). Ajustez les curseurs avant d'enregistrer.`,
      },
      { status: 400 },
    )
  }

  // ---- Seuils (optionnels : absents = inchangés) ----
  const patch: Record<string, number | string> = {}
  const thresholds: Array<[string, number, number]> = [
    ["zoneBlancheThreshold", 0, 100],
    ["alertThreshold", 0, 100],
  ]
  for (const [k, lo, hi] of thresholds) {
    if (body[k] === undefined) continue
    const v = num(body[k])
    if (v === null || v < lo || v > hi) {
      return NextResponse.json(
        { error: `Seuil « ${k} » invalide : valeur attendue entre ${lo} et ${hi}.` },
        { status: 400 },
      )
    }
    patch[k] = v
  }

  // Cohérence : le seuil d'alerte doit rester au-dessus du seuil zone blanche.
  const nextZone =
    typeof patch.zoneBlancheThreshold === "number"
      ? patch.zoneBlancheThreshold
      : (await loadConfig()).thresholds.zoneBlanche
  const nextAlert =
    typeof patch.alertThreshold === "number" ? patch.alertThreshold : (await loadConfig()).thresholds.alert
  if (nextZone > nextAlert) {
    return NextResponse.json(
      {
        error: `Incohérence : le seuil zone blanche (${nextZone}) doit rester inférieur ou égal au seuil d'alerte (${nextAlert}).`,
      },
      { status: 400 },
    )
  }

  const before = await db.opportunityConfig.findUnique({ where: { id: "default" } })
  const maj = await db.opportunityConfig.update({
    where: { id: "default" },
    data: {
      ...weights,
      ...patch,
      updatedBy: sa.email,
    },
  })

  await logAudit({
    acteur: { nom: sa.email, email: sa.email, role: "SUPER_ADMIN" },
    module: "RADAR",
    action: "Configuration du moteur de scoring modifiée",
    cibleType: "OPPORTUNITY_CONFIG",
    cibleLabel: "default",
    details:
      `poids ${maj.weightParc}/${maj.weightPurchasing}/${maj.weightTrafic}/${maj.weightConcurrence}/${maj.weightFoncier}` +
      (before
        ? ` (avant ${before.weightParc}/${before.weightPurchasing}/${before.weightTrafic}/${before.weightConcurrence}/${before.weightFoncier})`
        : "") +
      ` · seuils ${maj.zoneBlancheThreshold}/${maj.alertThreshold}`,
    severite: "SENSIBLE",
  })

  return NextResponse.json({
    config: {
      weights: {
        parc: maj.weightParc,
        purchasing: maj.weightPurchasing,
        trafic: maj.weightTrafic,
        concurrence: maj.weightConcurrence,
        foncier: maj.weightFoncier,
      },
      thresholds: {
        zoneBlanche: maj.zoneBlancheThreshold,
        alert: maj.alertThreshold,
      },
      updatedBy: maj.updatedBy,
      updatedAt: maj.updatedAt.toISOString(),
    },
  })
}
