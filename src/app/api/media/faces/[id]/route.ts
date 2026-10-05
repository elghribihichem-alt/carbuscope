// PATCH /api/media/faces/[id] — édition EN LIGNE d'une cellule (une valeur).
// Validation par le registre FACE_FIELDS (type, min/max, qui peut éditer) ;
// trace systématique dans le journal d'audit (ancienne → nouvelle valeur,
// auteur, date, IP). Une face hors périmètre est 404 (elle n'existe pas pour
// le lecteur) ; une face agrégée est 403.
// DELETE (SA uniquement) — suppression d'une face du référentiel.

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json400, json403, json404, logMediaAudit, capsOf } from "../../_lib"
import { resolveFaceAccess, serializeFace, type FaceRow } from "@/lib/media/permissions"
import { FIELD_BY_KEY, MEDIA_CAPS } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const SELECT_FACE_ROW = {
  id: true, code: true, panelId: true,
  orientation: true, sensLecture: true, visibiliteMinM: true, visibiliteMaxM: true,
  angleMortDeg: true, obstacles: true, tempsLectureS: true,
  tmja: true, traficHeurePointe: true, repartitionSens: true,
  partDeuxRoues: true, partVL: true, partPL: true, partTaxis: true,
  vitesseReglementaire: true, vitesseReelle: true, indiceCongestion: true,
  audienceJournaliere: true, audienceMensuelle: true, odvJournalieres: true, odvMensuelles: true,
  profilDemographique: true, cspDominante: true, partResidents: true, partPassants: true,
  stationsProprietaireRayon: true, stationsConcurrentesRayon: true, panneauxRayon1km: true, partDeVoix: true,
  pois: true,
  prixSemaine: true, prixMois: true, prixTrimestre: true, prixSemestre: true, prixAnnee: true,
  remiseVolumeMax: true, tauxOccupation12m: true, dateDerniereCampagne: true, clientsActuels: true,
  contraintesMunicipales: true, zonesInterdites: true, alcoolAutorise: true, procedureReservation: true,
  status: true, visibilityMode: true, exclusiveBrandSlug: true,
  allowedBrandSlugs: true, excludedBrandSlugs: true, allowedGroups: true, allowedZones: true,
  visibilityConditions: true,
  panel: {
    select: {
      id: true, code: true, name: true, ville: true, governorat: true, delegation: true,
      lat: true, lng: true, format: true, technology: true,
      owner: { select: { name: true, type: true, brandSlug: true } },
    },
  },
} as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard

  const body = (await req.json().catch(() => null)) as { field?: string; value?: unknown } | null
  if (!body || typeof body.field !== "string") return json400("Champ manquant.")

  const def = FIELD_BY_KEY[body.field]
  if (!def) return json400("Champ inconnu.")
  if (def.edit === "CALCULE") return json400("Champ calculé par le moteur — non éditable.")

  const caps = capsOf(ctx)
  if (def.edit === "SA" && !caps.editAllFields) return json403("Champ réservé à la Super Administration.")
  if (def.edit === "GESTIONNAIRE" && !caps.editFaces) return json403("Édition réservée aux rôles gestionnaire et administrateur.")

  const face = (await db.mediaFace.findUnique({ where: { id }, select: SELECT_FACE_ROW })) as unknown as FaceRow | null
  if (!face) return json404()

  // Résolution de permission — LA fonction unique, jamais contournée.
  const access = await resolveFaceAccess(ctx, face, face.panel.lat, face.panel.lng, face.panel.governorat)
  if (access === "NONE") return json404()
  if (access === "AGGREGE") return json403("Face en visibilité restreinte — édition impossible.")

  // Validation de la valeur selon le registre
  const raw = body.value
  let typed: number | string | boolean | null
  if (def.type === "int") {
    const n = Number(raw)
    if (!Number.isFinite(n) || !Number.isInteger(n)) return json400("Valeur entière attendue.")
    if (def.min !== undefined && n < def.min) return json400(`Minimum ${def.min}.`)
    if (def.max !== undefined && n > def.max) return json400(`Maximum ${def.max}.`)
    typed = n
  } else if (def.type === "float") {
    const n = Number(raw)
    if (!Number.isFinite(n)) return json400("Valeur numérique attendue.")
    if (def.min !== undefined && n < def.min) return json400(`Minimum ${def.min}.`)
    if (def.max !== undefined && n > def.max) return json400(`Maximum ${def.max}.`)
    typed = Math.round(n * 1000) / 1000
  } else if (def.type === "bool") {
    if (typeof raw !== "boolean") return json400("Booléen attendu (true/false).")
    typed = raw
  } else {
    if (typeof raw !== "string") return json400("Texte attendu.")
    if (raw.length > 500) return json400("Texte trop long (500 caractères max).")
    typed = raw.trim() === "" ? null : raw
  }

  const oldValue = (face as unknown as Record<string, unknown>)[body.field]
  await db.mediaFace.update({ where: { id }, data: { [body.field]: typed } as never })
  await logMediaAudit(ctx, req, {
    action: "EDIT",
    entityType: "FACE",
    entityId: id,
    entityLabel: face.code,
    field: def.label,
    oldValue: oldValue === null || oldValue === undefined ? "—" : String(oldValue),
    newValue: typed === null ? "—" : String(typed),
  })

  const row = (await db.mediaFace.findUnique({ where: { id }, select: SELECT_FACE_ROW })) as unknown as FaceRow
  return NextResponse.json({ face: serializeFace(ctx, row, "FULL") })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageReferential) return json403("Suppression réservée à la Super Administration.")

  const face = await db.mediaFace.findUnique({ where: { id }, select: { code: true, panel: { select: { code: true } } } })
  if (!face) return json404()
  await db.mediaFace.delete({ where: { id } })
  await logMediaAudit(ctx, req, {
    action: "DELETE", entityType: "FACE", entityId: id,
    entityLabel: `${face.code} (${face.panel.code})`, oldValue: "—", newValue: "—",
  })
  return NextResponse.json({ ok: true })
}
