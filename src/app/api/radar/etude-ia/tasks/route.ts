// CarbuScope — T55-c — GET /api/radar/etude-ia/tasks : suivi Super Admin des
// analyses IA d'études de faisabilité (LECTURE SEULE, additif strict).
//
// Accès : Super Administration UNIQUEMENT (pattern requireSuperAdmin de
// radar/_lib — 401 non connecté / 403 rôle insuffisant, comme /api/radar/config).
//
// FILTRE DOCUMENTÉ : seules les AiTask dont le TITRE commence par le marqueur
// stable « Étude IA — » (posé par POST /api/radar/etude-ia) sont considérées
// comme « tâches d'étude » — le reste du journal AiTask (agent IA interne SA,
// démos « ai-demo-relances »…) reste hors périmètre. La réponse renvoie le
// TOTAL de ces tâches + les 10 dernières (sérialisation LÉGÈRE : pas de
// result — le JSON complet vit dans AiTask et reste consultable côté SA).
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSuperAdmin } from "../../_lib"

export const dynamic = "force-dynamic"

/** Marqueur de titre des tâches d'étude IA (miroir de POST /api/radar/etude-ia). */
export const ETUDE_IA_TITLE_PREFIX = "Étude IA — "

export async function GET() {
  const sa = await requireSuperAdmin()
  if (!sa.ok) {
    return NextResponse.json({ error: sa.error }, { status: sa.status })
  }

  const where = { title: { startsWith: ETUDE_IA_TITLE_PREFIX } }
  const [total, rows] = await Promise.all([
    db.aiTask.count({ where }),
    db.aiTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        status: true,
        error: true,
        durationMs: true,
        launchedAt: true,
        finishedAt: true,
        createdAt: true,
        createdBy: true,
      },
    }),
  ])

  const iso = (d: Date | null) => (d ? d.toISOString() : null)
  return NextResponse.json({
    total,
    tasks: rows.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      error: t.error ? t.error.slice(0, 160) : null,
      durationMs: t.durationMs,
      launchedAt: iso(t.launchedAt),
      finishedAt: iso(t.finishedAt),
      createdAt: t.createdAt.toISOString(),
      createdBy: t.createdBy,
    })),
    generatedAt: new Date().toISOString(),
  })
}
