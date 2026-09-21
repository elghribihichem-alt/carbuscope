import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/saas-server"
import { CARTO_DEFAULTS, type CartoBoundaryDTO } from "@/lib/saas"

export const dynamic = "force-dynamic"

// Paramètre cartographique (Phase 3 Super Admin) : délimitation de la zone de
// couverture (bounding box éditable, singleton « zone-principale »).
// CarbuScope ne couvre que la Tunisie — cette zone borne le chargement
// cartographique pour éviter le poids et les zones hors pays inutiles.

const BOUNDARY_ID = "zone-principale"

/** DTO de la ligne unique (ou des valeurs par défaut si jamais modifiée). */
function toDTO(row: {
  id: string
  name: string
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
  active: boolean
  updatedAt: Date
}): CartoBoundaryDTO {
  return {
    id: row.id,
    name: row.name,
    minLat: row.minLat,
    maxLat: row.maxLat,
    minLng: row.minLng,
    maxLng: row.maxLng,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
    isDefault: false,
  }
}

/** Nombre fr à 2 décimales pour l'audit : « 30,20 ». */
function fmtAuditCoord(v: number): string {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Arrondi à 4 décimales (précision de saisie ~11 m). */
function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000
}

// GET /api/super/carto — zone de couverture (valeurs par défaut si jamais
// enregistrée : isDefault true, updatedAt null).
export async function GET() {
  const row = await db.cartoBoundary.findUnique({ where: { id: BOUNDARY_ID } })
  if (!row) {
    return NextResponse.json({
      boundary: {
        id: BOUNDARY_ID,
        name: CARTO_DEFAULTS.name,
        minLat: CARTO_DEFAULTS.minLat,
        maxLat: CARTO_DEFAULTS.maxLat,
        minLng: CARTO_DEFAULTS.minLng,
        maxLng: CARTO_DEFAULTS.maxLng,
        active: true,
        updatedAt: null,
        isDefault: true,
      } satisfies CartoBoundaryDTO,
    })
  }
  return NextResponse.json({ boundary: toDTO(row) })
}

// POST /api/super/carto — enregistre la zone (upsert de la ligne unique),
// validations FR strictes puis audit SYSTEME. Répond { boundary }.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }

  // Nom optionnel : absent → conserve le nom actuel (ou le défaut).
  let name: string | undefined
  if (body.name !== undefined && body.name !== null) {
    const raw: unknown = body.name
    if (typeof raw !== "string") {
      return NextResponse.json({ error: "Nom de la zone requis — entre 3 et 80 caractères" }, { status: 400 })
    }
    const trimmed = raw.trim()
    if (trimmed.length < 3 || trimmed.length > 80) {
      return NextResponse.json({ error: "Nom de la zone requis — entre 3 et 80 caractères" }, { status: 400 })
    }
    name = trimmed
  }

  const nums: Record<string, number> = {}
  for (const f of ["minLat", "maxLat", "minLng", "maxLng"]) {
    const v = body[f]
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return NextResponse.json(
        { error: f.endsWith("Lat") ? "Latitude invalide — nombre entre -90 et 90" : "Longitude invalide — nombre entre -180 et 180" },
        { status: 400 }
      )
    }
    nums[f] = v
  }
  if (nums.minLat < -90 || nums.minLat > 90 || nums.maxLat < -90 || nums.maxLat > 90) {
    return NextResponse.json({ error: "Latitude invalide — nombre entre -90 et 90" }, { status: 400 })
  }
  if (nums.minLng < -180 || nums.minLng > 180 || nums.maxLng < -180 || nums.maxLng > 180) {
    return NextResponse.json({ error: "Longitude invalide — nombre entre -180 et 180" }, { status: 400 })
  }
  if (nums.minLat >= nums.maxLat) {
    return NextResponse.json({ error: "La latitude minimale doit être inférieure à la maximale" }, { status: 400 })
  }
  if (nums.minLng >= nums.maxLng) {
    return NextResponse.json({ error: "La longitude minimale doit être inférieure à la maximale" }, { status: 400 })
  }

  const minLat = round4(nums.minLat)
  const maxLat = round4(nums.maxLat)
  const minLng = round4(nums.minLng)
  const maxLng = round4(nums.maxLng)

  const existing = await db.cartoBoundary.findUnique({ where: { id: BOUNDARY_ID } })
  const finalName = name ?? existing?.name ?? CARTO_DEFAULTS.name

  const row = await db.cartoBoundary.upsert({
    where: { id: BOUNDARY_ID },
    create: {
      id: BOUNDARY_ID,
      name: finalName,
      minLat,
      maxLat,
      minLng,
      maxLng,
      active: true,
    },
    update: {
      ...(name !== undefined ? { name: finalName } : {}),
      minLat,
      maxLat,
      minLng,
      maxLng,
    },
  })

  await logAudit({
    kind: "SYSTEME",
    message: `Délimitation cartographique : lat ${fmtAuditCoord(minLat)} → ${fmtAuditCoord(maxLat)} · lng ${fmtAuditCoord(minLng)} → ${fmtAuditCoord(maxLng)} — ${finalName}`,
    actor: typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : undefined,
  })

  return NextResponse.json({ boundary: toDTO(row) })
}
