// Super Administration — ① Clients & contrats : liste enrichie + transitions
// de cycle de vie (PROSPECT → ESSAI → ACTIF → SUSPENDU → RÉSILIÉ), tout audité.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { agregatsContrat, logAudit, serializeContrat } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

const CONTRAT_INCLUDE = { avenants: { orderBy: { dateEffet: "desc" as const } } } as const

export async function GET() {
  const contrats = await db.contrat.findMany({ include: CONTRAT_INCLUDE, orderBy: { createdAt: "asc" } })
  const clients = await Promise.all(
    contrats.map(async c => serializeContrat(c, await agregatsContrat(c.brandSlug))),
  )
  return NextResponse.json({ clients })
}

const TRANSITIONS: Record<string, string[]> = {
  PROSPECT: ["ESSAI"],
  ESSAI: ["ACTIF", "PROSPECT", "RESILIE"],
  ACTIF: ["SUSPENDU", "RESILIE"],
  SUSPENDU: ["ACTIF", "RESILIE"],
  RESILIE: ["PROSPECT"],
}

export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  const body = (await req.json().catch(() => ({}))) as { statut?: string; notes?: string; dateFin?: string | null }
  if (!id) return NextResponse.json({ error: "Paramètre id manquant." }, { status: 400 })
  const contrat = await db.contrat.findUnique({ where: { id } })
  if (!contrat) return NextResponse.json({ error: "Contrat introuvable." }, { status: 404 })

  if (body.notes !== undefined) {
    const maj = await db.contrat.update({ where: { id }, data: { notes: body.notes }, include: CONTRAT_INCLUDE })
    return NextResponse.json({ contrat: serializeContrat(maj, await agregatsContrat(maj.brandSlug)) })
  }

  const cible = body.statut
  if (!cible || !TRANSITIONS[contrat.statut]?.includes(cible)) {
    return NextResponse.json(
      { error: `Transition ${contrat.statut} → ${cible ?? "?"} invalide. Autorisées : ${TRANSITIONS[contrat.statut]?.join(", ") ?? "—"}.` },
      { status: 400 },
    )
  }

  const now = new Date()
  const data: Record<string, unknown> = { statut: cible }
  if (cible === "ESSAI") { data.dateDebut = now; data.adhesionPayee = false }
  if (cible === "ACTIF") {
    data.dateSignature = contrat.dateSignature ?? now
    data.dateDebut = contrat.dateDebut ?? now
    data.adhesionPayee = true
  }
  if (cible === "SUSPENDU") data.dateFin = body.dateFin ? new Date(body.dateFin) : null
  if (cible === "RESILIE") data.dateFin = now
  if (cible === "PROSPECT") { data.dateSignature = null; data.dateDebut = null; data.dateFin = null; data.adhesionPayee = false }

  const maj = await db.contrat.update({ where: { id }, data, include: CONTRAT_INCLUDE })
  await logAudit({
    module: "CLIENTS",
    action: `Statut contrat modifié : ${contrat.statut} → ${cible}`,
    cibleType: "CONTRAT",
    cibleLabel: `${contrat.numero} — ${contrat.nomClient}`,
    severite: "SENSIBLE",
    details: "Transition de cycle de vie client appliquée depuis le module Clients & Contrats.",
  })
  return NextResponse.json({ contrat: serializeContrat(maj, await agregatsContrat(maj.brandSlug)) })
}

export async function POST(req: Request) {
  // Création d'avenant sur un contrat existant.
  const body = (await req.json().catch(() => ({}))) as { contratId?: string; objet?: string; contenu?: string }
  if (!body.contratId || !body.objet || !body.contenu) {
    return NextResponse.json({ error: "contratId, objet et contenu sont requis." }, { status: 400 })
  }
  const contrat = await db.contrat.findUnique({ where: { id: body.contratId } })
  if (!contrat) return NextResponse.json({ error: "Contrat introuvable." }, { status: 404 })
  const count = await db.avenant.count({ where: { contratId: contrat.id } })
  const avenant = await db.avenant.create({
    data: {
      contratId: contrat.id,
      numero: `AV-${String(count + 1).padStart(3, "0")}`,
      objet: body.objet,
      contenu: body.contenu,
      dateEffet: new Date(),
      statut: "APPLIQUE",
    },
  })
  await logAudit({
    module: "CLIENTS",
    action: "Avenant créé",
    cibleType: "CONTRAT",
    cibleLabel: `${contrat.numero} / ${avenant.numero}`,
    severite: "SENSIBLE",
    details: body.objet,
  })
  return NextResponse.json({ avenant }, { status: 201 })
}
