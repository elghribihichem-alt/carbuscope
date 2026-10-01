// CarbuScope — T54-B2 — GET /api/radar/alerts : passe de détection du Radar
// d'opportunités, UPSERT IDEMPOTENT dans ZoneAlert puis liste (non acquittées
// d'abord). Trois types :
//   · OPPORTUNITE   : score ≥ alertThreshold (config) ;
//   · ZONE_BLANCHE  : densité de stations sous le seuil des zones blanches
//                     existantes (ratio véh./station > 3ᵉ quartile, même
//                     convention que computeGovStats) ET score ≥ seuil zone
//                     blanche (config) → « zone blanche à fort potentiel » ;
//   · FONCIER       : disponibilité foncière < 30/100 (règle constante).
// Idempotence : même gouvernorat + type + seuil NON ACQUITTÉ et créé depuis
// moins de 24 h → pas de recréation (message/score rafraîchis) ; une alerte
// non acquittée de plus de 24 h est REMPLACÉE (l'ancienne supprimée) ; les
// alertes acquittées sont conservées (historique, jamais retouchées).
// PATCH { id, acknowledged } : acquitte / désacquitte — session requise,
// acknowledgedBy = e-mail de la session (updatedBy équivalent).
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import { loadConfig, loadScoringInputs, requireSessionOr401 } from "../_lib"
import {
  computeCriteria,
  scoreGouvernorats,
  zoneBlancheRatioThreshold,
} from "@/lib/radar/scoring"

export const dynamic = "force-dynamic"

/** Disponibilité foncière sous ce seuil → alerte FONCIER (règle constante). */
const FONCIER_AVAILABILITY_THRESHOLD = 30

/** Fenêtre de dédoublonnage des alertes non acquittées. */
const DEDUP_WINDOW_MS = 24 * 3600 * 1000

type Detected = {
  gouvernorat: string
  type: "OPPORTUNITE" | "ZONE_BLANCHE" | "FONCIER"
  score: number
  threshold: number
  message: string
}

/** Garde-fou anti-concurrence : une seule passe de détection à la fois. */
let inflight: Promise<{ created: number }> | null = null

async function runDetection(): Promise<{ created: number }> {
  const [config, inputs] = await Promise.all([loadConfig(), loadScoringInputs()])
  // Même moteur que /api/radar/scoring : critères + scores pondérés.
  const criteria = computeCriteria(inputs)
  const scores = new Map(scoreGouvernorats(inputs, config.weights).map(r => [r.name, r.score]))
  const q3 = zoneBlancheRatioThreshold(inputs)

  const detected: Detected[] = []
  for (const [gov, c] of criteria) {
    const score = scores.get(gov) ?? 0

    // 1) Opportunité forte (score ≥ seuil d'alerte).
    if (score >= config.thresholds.alert) {
      detected.push({
        gouvernorat: gov,
        type: "OPPORTUNITE",
        score,
        threshold: config.thresholds.alert,
        message: `Opportunité forte : ${gov} — score ${score}`,
      })
    }

    // 2) Zone blanche à fort potentiel : densité de stations sous le seuil
    //    des zones blanches existantes (ratio véh./station > q3) ET score
    //    au-dessus du seuil zone blanche (sinon : simple sous-équipement).
    if (c.ratio > q3 && score >= config.thresholds.zoneBlanche) {
      detected.push({
        gouvernorat: gov,
        type: "ZONE_BLANCHE",
        score,
        threshold: config.thresholds.zoneBlanche,
        message: `Zone blanche à fort potentiel : ${gov} — ${Math.round(c.ratio)} véh./station, score ${score}`,
      })
    }
  }

  // 3) Foncier tendu (disponibilité < 30) — indicateur indépendant du score.
  const landRows = await db.landIndicator.findMany({
    select: { gouvernorat: true, availability: true },
  })
  for (const l of landRows) {
    if (l.availability < FONCIER_AVAILABILITY_THRESHOLD) {
      detected.push({
        gouvernorat: l.gouvernorat,
        type: "FONCIER",
        score: scores.get(l.gouvernorat) ?? 0,
        threshold: FONCIER_AVAILABILITY_THRESHOLD,
        message: `Foncier tendu : ${l.gouvernorat} — disponibilité ${Math.round(l.availability)}/100`,
      })
    }
  }

  // ---- Upsert idempotent (fenêtre 24 h) ----
  // Règles (documentées) :
  //   · non acquittée récente (< 24 h) → message/score rafraîchis, pas de
  //     recréation (lecture littérale du contrat) ;
  //   · acquittée récente (< 24 h) → silence de courtoisie : l'acquittement
  //     calme l'alerte pendant la fenêtre, sinon chaque affichage de la page
  //     re-créerait l'alerte aussitôt acquittée (le modèle n'a pas de
  //     acknowledgedAt — le décompte se fait sur createdAt) ;
  //   · rien de récent → les non acquittées périmées (> 24 h) du même couple
  //     sont remplacées, puis l'alerte est (re)créée. Les acquittées anciennes
  //     sont conservées : elles constituent l'historique.
  let created = 0
  const now = Date.now()
  for (const d of detected) {
    const recent = await db.zoneAlert.findFirst({
      where: {
        gouvernorat: d.gouvernorat,
        type: d.type,
        threshold: d.threshold,
        createdAt: { gte: new Date(now - DEDUP_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    })
    if (recent) {
      if (!recent.acknowledged) {
        // Rafraîchissement du message/score (pas de recréation).
        await db.zoneAlert.update({
          where: { id: recent.id },
          data: { score: d.score, message: d.message },
        })
      }
      continue
    }
    // Remplacement des non acquittées périmées (> 24 h) du même couple.
    await db.zoneAlert.deleteMany({
      where: {
        gouvernorat: d.gouvernorat,
        type: d.type,
        acknowledged: false,
        createdAt: { lt: new Date(now - DEDUP_WINDOW_MS) },
      },
    })
    await db.zoneAlert.create({
      data: {
        gouvernorat: d.gouvernorat,
        type: d.type,
        score: d.score,
        threshold: d.threshold,
        message: d.message,
      },
    })
    created++
  }
  return { created }
}

export async function GET() {
  if (!inflight) {
    inflight = runDetection().finally(() => {
      inflight = null
    })
  }
  const { created } = await inflight

  const alerts = await db.zoneAlert.findMany({
    orderBy: [{ acknowledged: "asc" }, { createdAt: "desc" }],
  })
  return NextResponse.json({
    alerts: alerts.map(a => ({
      id: a.id,
      gouvernorat: a.gouvernorat,
      type: a.type,
      score: a.score,
      threshold: a.threshold,
      message: a.message,
      acknowledged: a.acknowledged,
      acknowledgedBy: a.acknowledgedBy,
      createdAt: a.createdAt.toISOString(),
    })),
    newCount: created,
    generatedAt: new Date().toISOString(),
  })
}

export async function PATCH(req: NextRequest) {
  const session = await requireSessionOr401()
  if (!session.ok) {
    return NextResponse.json(
      { error: "Connexion requise — connectez-vous pour acquitter une alerte." },
      { status: 401 },
    )
  }

  const body = (await req.json().catch(() => null)) as
    | { id?: string; acknowledged?: boolean }
    | null
  if (!body || typeof body.id !== "string" || typeof body.acknowledged !== "boolean") {
    return NextResponse.json(
      { error: "Champs « id » et « acknowledged » (booléen) requis." },
      { status: 400 },
    )
  }

  const alert = await db.zoneAlert.findUnique({ where: { id: body.id } })
  if (!alert) {
    return NextResponse.json({ error: "Alerte introuvable." }, { status: 404 })
  }

  const maj = await db.zoneAlert.update({
    where: { id: body.id },
    data: {
      acknowledged: body.acknowledged,
      acknowledgedBy: body.acknowledged ? session.email : null,
    },
  })

  await logAudit({
    acteur: { nom: session.email, email: session.email, role: session.role ?? "ADMIN" },
    module: "RADAR",
    action: body.acknowledged ? "Alerte zone acquittée" : "Alerte zone désacquittée",
    cibleType: "ZONE_ALERT",
    cibleLabel: `${alert.gouvernorat} (${alert.type})`,
    details: alert.message,
  })

  return NextResponse.json({
    alert: {
      id: maj.id,
      gouvernorat: maj.gouvernorat,
      type: maj.type,
      score: maj.score,
      threshold: maj.threshold,
      message: maj.message,
      acknowledged: maj.acknowledged,
      acknowledgedBy: maj.acknowledgedBy,
      createdAt: maj.createdAt.toISOString(),
    },
  })
}
