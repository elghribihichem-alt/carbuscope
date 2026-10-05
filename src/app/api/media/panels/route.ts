// GET /api/media/panels — référentiel complet panneaux→faces (SA UNIQUEMENT).
// POST — création d'un panneau (+ faces initiales optionnelles), audit CREATE.

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json400, json403, logMediaAudit } from "../_lib"
import { MEDIA_CAPS } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageReferential) return json403("Consultation du référentiel réservée à la Super Administration.")

  const panels = await db.mediaPanel.findMany({
    orderBy: { code: "asc" },
    select: {
      id: true, code: true, name: true, mediaType: true, supportType: true, format: true, technology: true,
      widthCm: true, heightCm: true, heightAboveGroundM: true, illumination: true,
      lat: true, lng: true, governorat: true, delegation: true, ville: true, rue: true,
      photos: true, status: true, authorizationRef: true, authorizationStart: true, authorizationEnd: true,
      createdAt: true,
      owner: { select: { id: true, code: true, name: true, type: true, brandSlug: true } },
      faces: {
        orderBy: { code: "asc" },
        select: {
          id: true, code: true, orientation: true, sensLecture: true, status: true,
          tmja: true, audienceJournaliere: true, odvJournalieres: true, prixSemaine: true,
          tauxOccupation12m: true, partDeVoix: true,
          visibilityMode: true, exclusiveBrandSlug: true,
          allowedBrandSlugs: true, excludedBrandSlugs: true, allowedGroups: true, allowedZones: true, visibilityConditions: true,
        },
      },
    },
  })
  return NextResponse.json({ panels }, { headers: { "Cache-Control": "no-store" } })
}

type FaceInput = {
  code?: string; orientation?: string; sensLecture?: string; status?: string
  tmja?: number; audienceJournaliere?: number; odvJournalieres?: number; prixSemaine?: number
}

export async function POST(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageReferential) return json403("Création réservée à la Super Administration.")

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return json400("Corps de requête invalide.")
  const code = typeof b.code === "string" ? b.code.trim() : ""
  const name = typeof b.name === "string" ? b.name.trim() : ""
  const ownerId = typeof b.ownerId === "string" ? b.ownerId : ""
  if (!/^[A-Z0-9-]{3,20}$/.test(code)) return json400("Code panneau requis (3-20 caractères A-Z, chiffres, tirets).")
  if (name.length < 2) return json400("Nom requis (2 caractères minimum).")
  if (!ownerId) return json400("Propriétaire requis.")
  const lat = Number(b.lat), lng = Number(b.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json400("Coordonnées invalides.")
  const gouvernorat = typeof b.governorat === "string" ? b.governorat.trim() : ""
  const ville = typeof b.ville === "string" ? b.ville.trim() : ""
  const delegation = typeof b.delegation === "string" ? b.delegation.trim() : ""
  if (!gouvernorat || !ville || !delegation) return json400("Gouvernorat, délégation et ville requis.")
  const owner = await db.mediaOwner.findUnique({ where: { id: ownerId } })
  if (!owner) return json400("Propriétaire introuvable.")
  const dup = await db.mediaPanel.findUnique({ where: { code } })
  if (dup) return json400("Ce code panneau existe déjà.")

  const mediaType = b.mediaType === "MOBILE" || b.mediaType === "FERROVIAIRE" ? b.mediaType : "URBAIN"
  const facesInput = Array.isArray(b.faces) ? (b.faces as FaceInput[]).slice(0, 6) : []

  const panel = await db.mediaPanel.create({
    data: {
      code, name, ownerId,
      mediaType,
      supportType: typeof b.supportType === "string" ? b.supportType : "GRAND_FORMAT",
      format: typeof b.format === "string" ? b.format : "4x3",
      technology: typeof b.technology === "string" ? b.technology : "PAPIER",
      widthCm: intOr(b.widthCm, 400), heightCm: intOr(b.heightCm, 300),
      heightAboveGroundM: numOr(b.heightAboveGroundM, 4),
      illumination: typeof b.illumination === "string" ? b.illumination : "AUCUNE",
      lat, lng, governorat: gouvernorat, delegation, ville,
      rue: strOrNull(b.rue),
      photos: Array.isArray(b.photos) ? b.photos : [],
      status: b.status === "MAINTENANCE" || b.status === "RETIRE" ? b.status : "ACTIF",
      authorizationRef: strOrNull(b.authorizationRef),
      authorizationStart: dateOrNull(b.authorizationStart),
      authorizationEnd: dateOrNull(b.authorizationEnd),
      faces: {
        create: facesInput.map((f, i) => ({
          code: f.code?.trim() || `${code}-${String.fromCharCode(65 + i)}`,
          orientation: f.orientation || "N",
          sensLecture: f.sensLecture || "GAUCHE_DROITE",
          visibiliteMinM: 30, visibiliteMaxM: 150, tempsLectureS: 5,
          tmja: intOr(f.tmja, 0), traficHeurePointe: 0,
          partDeuxRoues: 5, partVL: 82, partPL: 8, partTaxis: 5,
          vitesseReglementaire: 70, vitesseReelle: 45, indiceCongestion: 50,
          audienceJournaliere: intOr(f.audienceJournaliere, 0), audienceMensuelle: intOr(f.audienceJournaliere, 0) * 30,
          odvJournalieres: intOr(f.odvJournalieres, 0), odvMensuelles: intOr(f.odvJournalieres, 0) * 30,
          profilDemographique: "Urbain mixte", cspDominante: "Employés",
          partResidents: 50, partPassants: 50,
          stationsProprietaireRayon: 0, stationsConcurrentesRayon: 0, panneauxRayon1km: 0, partDeVoix: 0,
          pois: [],
          prixSemaine: numOr(f.prixSemaine, 0), prixMois: 0, prixTrimestre: 0, prixSemestre: 0, prixAnnee: 0,
          remiseVolumeMax: 0, tauxOccupation12m: 0, clientsActuels: [],
          zonesInterdites: [], alcoolAutorise: false,
          status: f.status || "DISPONIBLE",
          visibilityMode: "PUBLIQUE",
          allowedBrandSlugs: [], excludedBrandSlugs: [], allowedGroups: [], allowedZones: [],
        })),
      },
    },
    include: { faces: true },
  })
  await logMediaAudit(ctx, req, {
    action: "CREATE", entityType: "PANEL", entityId: panel.id, entityLabel: code,
    oldValue: "—", newValue: `${name} · ${panel.faces.length} face(s)`,
  })
  return NextResponse.json({ panel })
}

const intOr = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d)
const numOr = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d)
const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null)
const dateOrNull = (v: unknown) => {
  if (typeof v !== "string" || !v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
