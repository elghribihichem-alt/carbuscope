// GET    /api/media/simulations/[id] — simulation complète (résultats inclus).
// PATCH  — sauvegarde automatique de l'assistant (une étape à la fois) :
//          selections filtrées par les permissions AVANT enregistrement.
//          status : BROUILLON | ENVOYEE | ARCHIVEE (réouverture = BROUILLON).
// POST   — duplication.
// DELETE — suppression (enseigne propriétaire uniquement).

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json400, json403, json404, logMediaAudit, capsOf } from "../../_lib"
import { MEDIA_CAPS, type SimulationSelectionDTO } from "@/lib/media/shared"
import { serializeSimulation } from "@/lib/media/engine"
import { resolveFacesByIds } from "@/lib/media/permissions"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

async function loadOwn(ctx: { role: string; brandSlug: string | null }, id: string) {
  const sim = await db.mediaSimulation.findUnique({ where: { id } })
  if (!sim) return null
  if (ctx.role !== "SA" && sim.brandSlug !== ctx.brandSlug) return null // 404 : n'existe pas pour ce lecteur
  return sim
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const sim = await loadOwn(guard.ctx, id)
  if (!sim) return json404()
  return NextResponse.json({ simulation: serializeSimulation(sim) })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  const sim = await loadOwn(ctx, id)
  if (!sim) return json404()
  if (ctx.role !== "SA" && sim.authorEmail !== ctx.user.email && !capsOf(ctx).createSimulation) {
    return json403("Modification réservée aux rôles habilités.")
  }

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return json400("Corps invalide.")

  const data: Record<string, unknown> = {}
  const changes: string[] = []

  if (typeof b.name === "string" && b.name.trim().length >= 2) { data.name = b.name.trim().slice(0, 120); changes.push("nom") }
  if (typeof b.client === "string") { data.client = b.client.trim().slice(0, 120) || null; changes.push("client") }
  if (typeof b.currentStep === "number" && b.currentStep >= 1 && b.currentStep <= 5) { data.currentStep = Math.trunc(b.currentStep); changes.push("étape") }
  if (typeof b.dateStart === "string" && !Number.isNaN(new Date(b.dateStart).getTime())) data.dateStart = new Date(b.dateStart)
  if (b.dateStart === null) data.dateStart = null
  if (typeof b.dateEnd === "string" && !Number.isNaN(new Date(b.dateEnd).getTime())) data.dateEnd = new Date(b.dateEnd)
  if (b.dateEnd === null) data.dateEnd = null

  if (typeof b.status === "string") {
    if (!["BROUILLON", "ENVOYEE", "ARCHIVEE"].includes(b.status)) return json400("Statut inconnu.")
    if (b.status === "ENVOYEE" && !capsOf(ctx).createSimulation) return json403("Envoi réservé aux rôles habilités.")
    data.status = b.status
    changes.push(`statut→${b.status}`)
  }

  if (b.params && typeof b.params === "object") {
    const p = b.params as Record<string, unknown>
    const params = {
      remiseGlobale: Number.isFinite(Number(p.remiseGlobale)) ? Math.min(90, Math.max(0, Number(p.remiseGlobale))) : 0,
      saisonnalite: typeof p.saisonnalite === "boolean" ? p.saisonnalite : true,
    }
    data.params = params
    changes.push("paramètres")
  }

  // Sélections — résolution de permission AVANT enregistrement : une face
  // non autorisée est écartée silencieusement (elle n'existe pas pour ce membre).
  if (Array.isArray(b.selections)) {
    const raw = (b.selections as SimulationSelectionDTO[]).filter(s => s && typeof s.faceId === "string")
    const resolved = await resolveFacesByIds(ctx, raw.map(s => s.faceId))
    const cleaned = raw
      .filter(s => resolved.get(s.faceId)?.access === "FULL")
      .map(s => ({
        faceId: s.faceId,
        prixUnitaire: Number.isFinite(Number(s.prixUnitaire)) ? Math.max(0, Number(s.prixUnitaire)) : 0,
        remise: Number.isFinite(Number(s.remise)) ? Math.min(90, Math.max(0, Number(s.remise))) : 0,
      }))
      .slice(0, 500)
    data.selections = cleaned
    changes.push(`sélection (${cleaned.length})`)
  }

  if (Object.keys(data).length === 0) return json400("Aucun champ fourni.")
  const updated = await db.mediaSimulation.update({ where: { id }, data: data as never })
  await logMediaAudit(ctx, req, {
    action: "SIMULATION", entityType: "SIMULATION", entityId: id, entityLabel: sim.name,
    field: changes.join(", "), oldValue: `étape ${sim.currentStep} · ${sim.status}`,
    newValue: `étape ${updated.currentStep} · ${updated.status}`,
  })
  return NextResponse.json({ simulation: serializeSimulation(updated) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  const sim = await loadOwn(ctx, id)
  if (!sim) return json404()
  if (!capsOf(ctx).createSimulation) return json403("Duplication réservée aux rôles habilités.")

  const copy = await db.mediaSimulation.create({
    data: {
      brandSlug: sim.brandSlug, authorEmail: ctx.user.email,
      name: `${sim.name} (copie)`, client: sim.client,
      dateStart: sim.dateStart, dateEnd: sim.dateEnd,
      currentStep: sim.currentStep, status: "BROUILLON",
      selections: sim.selections as never, params: sim.params as never,
    },
  })
  await logMediaAudit(ctx, req, {
    action: "SIMULATION", entityType: "SIMULATION", entityId: copy.id,
    entityLabel: copy.name, oldValue: "—", newValue: `dupliquée depuis ${sim.name}`,
  })
  return NextResponse.json({ simulation: serializeSimulation(copy) })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  const sim = await loadOwn(ctx, id)
  if (!sim) return json404()
  if (ctx.role !== "SA" && sim.authorEmail !== ctx.user.email) return json403("Suppression réservée à l'auteur.")
  void MEDIA_CAPS
  await db.mediaSimulation.delete({ where: { id } })
  await logMediaAudit(ctx, req, {
    action: "DELETE", entityType: "SIMULATION", entityId: id, entityLabel: sim.name, oldValue: "—", newValue: "—",
  })
  return NextResponse.json({ ok: true })
}
