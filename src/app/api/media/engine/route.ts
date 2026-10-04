// GET  /api/media/engine — paramétrage du moteur de simulation (SA) :
// coefficients de saisonnalité mensuels par gouvernorat, matrice de
// chevauchement, formules de coût.
// PATCH — mise à jour d'une clé (audit MOTEUR).

import { NextRequest, NextResponse } from "next/server"
import { requireMedia, json400, json403, logMediaAudit } from "../_lib"
import { MEDIA_CAPS, type EngineSettingsDTO } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const DEFAULTS: EngineSettingsDTO = {
  SAISONNALITE: {},
  CHEVAUCHEMENT: { facteurSupplementaire: 0.12, croissanceJournaliere: 0.08, plafondUnicite: 3.5 },
  COUT: { cpmReference: 1.4, margePlateforme: 0.1 },
}

export async function GET() {
  const rows = await db.mediaEngineSetting.findMany()
  const map = new Map(rows.map(r => [r.key, r.value as unknown]))
  const dto: EngineSettingsDTO = {
    SAISONNALITE: (map.get("SAISONNALITE") as EngineSettingsDTO["SAISONNALITE"]) ?? DEFAULTS.SAISONNALITE,
    CHEVAUCHEMENT: { ...DEFAULTS.CHEVAUCHEMENT, ...((map.get("CHEVAUCHEMENT") as object) ?? {}) },
    COUT: { ...DEFAULTS.COUT, ...((map.get("COUT") as object) ?? {}) },
  }
  return NextResponse.json(dto, { headers: { "Cache-Control": "no-store" } })
}

export async function PATCH(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  if (!MEDIA_CAPS[ctx.role].manageReferential) return json403("Paramétrage du moteur réservé à la Super Administration.")

  const b = (await req.json().catch(() => null)) as { key?: string; value?: unknown } | null
  if (!b || typeof b.key !== "string" || !["SAISONNALITE", "CHEVAUCHEMENT", "COUT"].includes(b.key) || !b.value) {
    return json400("Clé moteur et valeur requises (SAISONNALITE | CHEVAUCHEMENT | COUT).")
  }

  // validation structurelle
  if (b.key === "SAISONNALITE") {
    const v = b.value as Record<string, unknown>
    for (const [gov, coeffs] of Object.entries(v)) {
      if (!Array.isArray(coeffs) || coeffs.length !== 12 || !(coeffs as unknown[]).every(c => Number.isFinite(Number(c)) && Number(c) > 0 && Number(c) < 5)) {
        return json400(`Saisonnalité ${gov} : 12 coefficients entre 0 et 5 attendus.`)
      }
    }
  } else if (b.key === "CHEVAUCHEMENT") {
    const v = b.value as Record<string, unknown>
    for (const k of ["facteurSupplementaire", "croissanceJournaliere"] as const) {
      const n = Number(v[k])
      if (!Number.isFinite(n) || n < 0 || n > 1) return json400(`${k} : valeur entre 0 et 1 attendue.`)
    }
    const pl = Number(v.plafondUnicite)
    if (!Number.isFinite(pl) || pl < 1 || pl > 10) return json400("plafondUnicite : valeur entre 1 et 10 attendue.")
  } else if (b.key === "COUT") {
    const v = b.value as Record<string, unknown>
    for (const k of ["cpmReference", "margePlateforme"] as const) {
      const n = Number(v[k])
      if (!Number.isFinite(n) || n < 0) return json400(`${k} : valeur positive attendue.`)
    }
  }

  const existing = await db.mediaEngineSetting.findUnique({ where: { key: b.key } })
  if (existing) {
    await db.mediaEngineSetting.update({ where: { key: b.key }, data: { value: b.value as never } })
  } else {
    await db.mediaEngineSetting.create({ data: { key: b.key, value: b.value as never } })
  }
  await logMediaAudit(ctx, req, {
    action: "EDIT", entityType: "MOTEUR", entityLabel: b.key,
    field: b.key, oldValue: "—", newValue: JSON.stringify(b.value).slice(0, 480),
  })
  return NextResponse.json({ ok: true })
}
