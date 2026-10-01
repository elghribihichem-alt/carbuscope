// CarbuScope — T54-B3a — /api/radar/simulations : scénarios de rentabilité du
// module Opportunity Radar, persistés dans SavedCalculation (type
// « radar-simulation »). Route STRICTEMENT ADDITIVE (aucune route existante
// modifiée — gel T52/T53) :
//   · GET    (ouvert, convention « données » du projet) → derniers scénarios
//            du type radar-simulation, décroissant, limite 50 ;
//   · POST   (session requise — 401 sinon) → crée un scénario { label,
//            gouvernorat, formatId, params, result } avec validations FR ;
//   · DELETE ?id= (session requise) → supprime UNIQUEMENT les lignes du type
//            radar-simulation (404 sinon — protège les scénarios des autres
//            calculateurs) + AuditEvent RADAR.
// NB : la route historique POST /api/calculations existe mais n'offre ni
// filtrage par type, ni DELETE, ni session : ce CRUD dédié et filtré évite
// toute mutation sur son périmètre (deviation documentée T54-B3a).

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import { requireSessionOr401 } from "../_lib"

export const dynamic = "force-dynamic"

/** Type SavedCalculation réservé aux simulations du Radar. */
const SAVE_TYPE = "radar-simulation"

const FORMAT_IDS = new Set(["classique", "compacte", "automatisee", "food-store", "hub-hybride"])

const serialize = (c: {
  id: string
  type: string
  label: string
  gouvernorat: string
  formatId: string
  params: unknown
  result: unknown
  createdAt: Date
}) => ({
  id: c.id,
  type: c.type,
  label: c.label,
  gouvernorat: c.gouvernorat,
  formatId: c.formatId,
  params: c.params as Record<string, unknown>,
  result: c.result as Record<string, unknown>,
  createdAt: c.createdAt.toISOString(),
})

/* ----------------------------- GET : liste ----------------------------- */

export async function GET(req: NextRequest) {
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 50)
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 50
  const rows = await db.savedCalculation.findMany({
    where: { type: SAVE_TYPE },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
  return NextResponse.json({
    simulations: rows.map(c =>
      serialize({
        id: c.id,
        type: c.type,
        label: c.label,
        gouvernorat: String((c.params as Record<string, unknown>).gouvernorat ?? ""),
        formatId: String((c.params as Record<string, unknown>).formatId ?? "classique"),
        params: c.params,
        result: c.result,
        createdAt: c.createdAt,
      }),
    ),
  })
}

/* ----------------------------- POST : création ----------------------------- */

export async function POST(req: NextRequest) {
  const session = await requireSessionOr401()
  if (!session.ok) {
    return NextResponse.json(
      { error: "Connexion requise — connectez-vous pour enregistrer un scénario." },
      { status: 401 },
    )
  }

  const body = await req.json().catch(() => null)
  const label = typeof body?.label === "string" ? body.label.trim() : ""
  const gouvernorat = typeof body?.gouvernorat === "string" ? body.gouvernorat.trim() : ""
  const formatId = typeof body?.formatId === "string" ? body.formatId : ""

  if (!label) {
    return NextResponse.json({ error: "Le nom du scénario est requis." }, { status: 400 })
  }
  if (label.length > 120) {
    return NextResponse.json({ error: "Le nom du scénario est trop long (120 max)." }, { status: 400 })
  }
  if (!gouvernorat) {
    return NextResponse.json({ error: "Le gouvernorat est requis." }, { status: 400 })
  }
  if (!FORMAT_IDS.has(formatId)) {
    return NextResponse.json({ error: "Format de station inconnu." }, { status: 400 })
  }
  if (typeof body.params !== "object" || body.params == null) {
    return NextResponse.json({ error: "Paramètres du scénario requis." }, { status: 400 })
  }

  const created = await db.savedCalculation.create({
    data: {
      type: SAVE_TYPE,
      label,
      params: { ...(body.params as Record<string, unknown>), gouvernorat, formatId },
      result: typeof body.result === "object" && body.result != null ? body.result : {},
    },
  })

  await logAudit({
    acteur: { nom: session.email, email: session.email, role: session.role ?? "ADMIN" },
    module: "RADAR",
    action: "Scénario de simulation enregistré",
    cibleType: "SAVED_CALCULATION",
    cibleLabel: `${label} (${gouvernorat}, ${formatId})`,
  })

  return NextResponse.json(
    {
      simulation: serialize({
        id: created.id,
        type: created.type,
        label: created.label,
        gouvernorat,
        formatId,
        params: created.params,
        result: created.result,
        createdAt: created.createdAt,
      }),
    },
    { status: 201 },
  )
}

/* ----------------------------- DELETE : suppression ----------------------------- */

export async function DELETE(req: NextRequest) {
  const session = await requireSessionOr401()
  if (!session.ok) {
    return NextResponse.json(
      { error: "Connexion requise — connectez-vous pour supprimer un scénario." },
      { status: 401 },
    )
  }

  const id = req.nextUrl.searchParams.get("id")?.trim() ?? ""
  if (!id) {
    return NextResponse.json({ error: "Identifiant du scénario requis." }, { status: 400 })
  }

  // Garde-fou : la route ne supprime QUE les scénarios radar-simulation.
  const existing = await db.savedCalculation.findUnique({ where: { id } })
  if (!existing || existing.type !== SAVE_TYPE) {
    return NextResponse.json({ error: "Scénario introuvable." }, { status: 404 })
  }

  await db.savedCalculation.delete({ where: { id } })

  await logAudit({
    acteur: { nom: session.email, email: session.email, role: session.role ?? "ADMIN" },
    module: "RADAR",
    action: "Scénario de simulation supprimé",
    cibleType: "SAVED_CALCULATION",
    cibleLabel: existing.label,
  })

  return NextResponse.json({ ok: true, id })
}
