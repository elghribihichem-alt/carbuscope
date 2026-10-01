// CarbuScope — T54-B2 — GET /api/radar/scoring : classement pondéré des 24
// gouvernorats (5 critères 0-100, poids lus dans OpportunityConfig) + moteur
// brut « engine » (le client recalcule les simulations what-if avec le même
// scoring.ts partagé). Paramètre ?gouvernorat=X → ajoute le drill-down
// délégations du gouvernorat demandé. Calcul à la volée, sans cache.
import { NextRequest, NextResponse } from "next/server"
import { loadConfig, loadScoringInputs } from "../_lib"
import { scoreGouvernorats, scoreDelegations } from "@/lib/radar/scoring"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const gouvernorat = req.nextUrl.searchParams.get("gouvernorat")?.trim() || null

  const [config, inputs] = await Promise.all([loadConfig(), loadScoringInputs()])
  const gouvernorats = scoreGouvernorats(inputs, config.weights)

  const body: Record<string, unknown> = {
    weights: config.weights,
    threshold: config.thresholds,
    gouvernorats,
    engine: inputs,
    generatedAt: new Date().toISOString(),
  }

  if (gouvernorat) {
    body.delegations = scoreDelegations(gouvernorat, inputs, config.weights)
  }

  return NextResponse.json(body)
}
