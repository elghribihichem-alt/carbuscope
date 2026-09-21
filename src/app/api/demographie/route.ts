import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeDemographicDelegation, serializeDemographicGouvernorat } from "@/lib/saas-server"
import type { DemographicAccessLevel } from "@/lib/saas"
import {
  applyDelegationUpdate, applyGouvernoratUpdate,
  validateDelegationValues, validateGouvernoratValues,
} from "@/lib/demographie-server"

export const dynamic = "force-dynamic"

// /api/demographie (T37 — transversalité, volet « Paramétrage ») : données
// démographiques pour un utilisateur AUTORISÉ (accès accordé par la Super
// Administration). GET ?email=… → { access, governorats, delegations? } — les
// délégations ne sont servies qu'au niveau DELEGATIONS. POST (action
// maj-delegation / maj-gouvernorat) réservé aux accès avec canEdit, dans la
// limite du niveau accordé ; chaque écriture est auditée (kind DEMOGRAPHIE).

async function resolveAccess(email: string): Promise<{
  userId: string
  level: DemographicAccessLevel
  canEdit: boolean
} | null> {
  const user = await db.user.findUnique({ where: { email } })
  if (!user) return null
  const access = await db.demographicAccess.findUnique({ where: { userId: user.id } })
  if (!access) return null
  return {
    userId: user.id,
    level: access.level === "DELEGATIONS" ? "DELEGATIONS" : "GOUVERNORATS",
    canEdit: access.canEdit,
  }
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.trim() ?? ""
  if (!email) {
    return NextResponse.json({ error: "Paramètre « email » requis" }, { status: 400 })
  }
  const access = await resolveAccess(email)
  if (!access) {
    return NextResponse.json({ access: null })
  }
  const [governorats, delegations] = await Promise.all([
    db.governoratStat.findMany({ orderBy: { isoCode: "asc" } }),
    access.level === "DELEGATIONS"
      ? db.demographicDelegation.findMany({ orderBy: [{ isoCode: "asc" }, { delegation: "asc" }] })
      : Promise.resolve([]),
  ])
  return NextResponse.json({
    access: { level: access.level, canEdit: access.canEdit },
    governorats: governorats.map(serializeDemographicGouvernorat),
    delegations: delegations.map(serializeDemographicDelegation),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }
  const email = typeof body.email === "string" ? body.email.trim() : ""
  if (!email) {
    return NextResponse.json({ error: "Champ « email » requis (compte effectuant la modification)" }, { status: 400 })
  }
  const access = await resolveAccess(email)
  if (!access) {
    return NextResponse.json({ error: "Aucun accès au module Démographie pour ce compte" }, { status: 403 })
  }
  if (!access.canEdit) {
    return NextResponse.json({ error: "L'édition du module Démographie n'est pas autorisée pour ce compte (lecture seule)" }, { status: 403 })
  }

  if (body.action === "maj-gouvernorat") {
    const id = typeof body.id === "string" ? body.id : ""
    if (!id) return NextResponse.json({ error: "Identifiant de gouvernorat requis" }, { status: 400 })
    const check = validateGouvernoratValues(body.values)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
    const res = await applyGouvernoratUpdate(id, check.values, email)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ governorat: res.row })
  }

  if (body.action === "maj-delegation") {
    if (access.level !== "DELEGATIONS") {
      return NextResponse.json({ error: "Les délégations ne sont pas visibles pour ce compte (niveau gouvernorats)" }, { status: 403 })
    }
    const id = typeof body.id === "string" ? body.id : ""
    if (!id) return NextResponse.json({ error: "Identifiant de délégation requis" }, { status: 400 })
    const check = validateDelegationValues(body.values)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
    const res = await applyDelegationUpdate(id, check.values, email)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ delegation: res.row })
  }

  return NextResponse.json({ error: "Action inconnue — maj-delegation ou maj-gouvernorat" }, { status: 400 })
}
