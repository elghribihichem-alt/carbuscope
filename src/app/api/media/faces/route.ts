// GET /api/media/faces — liste imbriquée panneaux→faces, filtrée par les
// permissions (résolution serveur unique : buildFacesList). C'est LA porte
// d'entrée de l'explorateur : toute face non autorisée est absente de la
// réponse (couche 3) ou servie en vue agrégée (couche 2).
// POST (SA) — création d'une face sur un panneau existant du référentiel.

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, parseBool, parseNum, json400, json403, json404, logMediaAudit } from "../_lib"
import { buildFacesList } from "@/lib/media/permissions"
import { MEDIA_CAPS, type FaceFilters } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const q = req.nextUrl.searchParams
  const filters: FaceFilters = {
    gouvernorat: q.get("gouvernorat") || undefined,
    delegation: q.get("delegation") || undefined,
    format: q.get("format") || undefined,
    technologie: q.get("technologie") || undefined,
    statut: q.get("statut") || undefined,
    support: q.get("support") || undefined,
    prixMin: parseNum(q.get("prixMin")),
    prixMax: parseNum(q.get("prixMax")),
    tmjaMin: parseNum(q.get("tmjaMin")),
    audienceMin: parseNum(q.get("audienceMin")),
    distanceStationKm: parseNum(q.get("distanceStationKm")),
    concurrence: parseBool(q.get("concurrence")),
    alcool: parseBool(q.get("alcool")),
    sovMax: parseNum(q.get("sovMax")),
  }
  const data = await buildFacesList(guard.ctx, filters)
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageReferential) return json403("Création réservée à la Super Administration.")

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return json400("Corps invalide.")
  const panelId = typeof b.panelId === "string" ? b.panelId : ""
  if (!panelId) return json400("Panneau requis.")
  const panel = await db.mediaPanel.findUnique({ where: { id: panelId }, select: { code: true, faces: { select: { code: true } } } })
  if (!panel) return json404("Panneau introuvable.")
  const code = typeof b.code === "string" ? b.code.trim() : ""
  if (!/^[A-Z0-9-]{3,24}$/.test(code)) return json400("Code face requis (3-24 caractères A-Z, chiffres, tirets).")
  if (await db.mediaFace.findUnique({ where: { code } })) return json400("Ce code face existe déjà.")
  const nb = intOr(b.tmja, 0)
  const aud = intOr(b.audienceJournaliere, 0)
  const odv = intOr(b.odvJournalieres, 0)
  const px = numOr(b.prixSemaine, 0)

  const face = await db.mediaFace.create({
    data: {
      panelId, code,
      orientation: typeof b.orientation === "string" ? b.orientation : "N",
      sensLecture: typeof b.sensLecture === "string" ? b.sensLecture : "GAUCHE_DROITE",
      visibiliteMinM: intOr(b.visibiliteMinM, 30), visibiliteMaxM: intOr(b.visibiliteMaxM, 150),
      tempsLectureS: numOr(b.tempsLectureS, 5),
      tmja: nb, traficHeurePointe: intOr(b.traficHeurePointe, Math.round(nb * 0.09)),
      partDeuxRoues: numOr(b.partDeuxRoues, 5), partVL: numOr(b.partVL, 82), partPL: numOr(b.partPL, 8), partTaxis: numOr(b.partTaxis, 5),
      vitesseReglementaire: intOr(b.vitesseReglementaire, 70), vitesseReelle: numOr(b.vitesseReelle, 45), indiceCongestion: numOr(b.indiceCongestion, 50),
      audienceJournaliere: aud, audienceMensuelle: aud * 30,
      odvJournalieres: odv, odvMensuelles: odv * 30,
      profilDemographique: typeof b.profilDemographique === "string" ? b.profilDemographique : "Urbain mixte",
      cspDominante: typeof b.cspDominante === "string" ? b.cspDominante : "Employés",
      partResidents: numOr(b.partResidents, 50), partPassants: 50,
      stationsProprietaireRayon: 0, stationsConcurrentesRayon: 0, panneauxRayon1km: 0, partDeVoix: 0,
      pois: [],
      prixSemaine: px, prixMois: Math.round(px * 4.2), prixTrimestre: Math.round(px * 4.2 * 3 * 0.95),
      prixSemestre: Math.round(px * 4.2 * 6 * 0.9), prixAnnee: Math.round(px * 4.2 * 12 * 0.85),
      remiseVolumeMax: numOr(b.remiseVolumeMax, 0), tauxOccupation12m: numOr(b.tauxOccupation12m, 0),
      clientsActuels: [],
      contraintesMunicipales: typeof b.contraintesMunicipales === "string" && b.contraintesMunicipales.trim() ? b.contraintesMunicipales.trim() : null,
      zonesInterdites: [], alcoolAutorise: b.alcoolAutorise === true,
      procedureReservation: null,
      status: typeof b.status === "string" ? b.status : "DISPONIBLE",
      visibilityMode: "PUBLIQUE",
      allowedBrandSlugs: [], excludedBrandSlugs: [], allowedGroups: [], allowedZones: [],
    },
  })
  await logMediaAudit(ctx, req, {
    action: "CREATE", entityType: "FACE", entityId: face.id, entityLabel: code,
    oldValue: "—", newValue: `panneau ${panel.code} · TMJA ${nb} · ${px} DT/semaine`,
  })
  return NextResponse.json({ face: { id: face.id, code: face.code, panelId } })
}

const intOr = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d)
const numOr = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d)
