// CarbuScope — T54-Cb — /api/hubs/settings : volet 5/5 « Paramètres TMP » du
// Module 2 « Mobility Hub Operations » — horaires d'ouverture et tarifs
// indicatifs par prestation du modèle additif HubSetting (1 ligne par hub au
// plus, onDelete: Cascade avec le hub).
//   · GET ?hubId= (session enseigne — 401 sinon) → { setting } où setting
//     vaut null tant qu'aucun enregistrement n'existe (défaut vide HONNÊTE :
//     l'UI pré-remplit 06:00-22:00 et les 3 prestations de repli sans jamais
//     les présenter comme des données enregistrées).
//   · PUT { hubId, horaires, tarifs } : session + HUBS_WRITE_ROLES (403
//     sinon) ; validations FR STRICTES :
//       – horaires : exactement 7 clés lundi…dimanche, chaque créneau au
//         format « HH:MM-HH:MM » (regex 00:00-23:59) et ouverture < fermeture ;
//       – tarifs : 1 à 12 prestations, chaque { min, max } en DT avec
//         0 ≤ min ≤ max (nombres finis) ;
//     Upsert (created/updated selon l'existence), updatedBy = e-mail de la
//     session, AuditEvent HUBS à chaque écriture (pattern T54-Ca).
// Réponse PUT : { setting } sérialisée (horaires/tarifs relus tels quels).

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import { HUBS_WRITE_ROLES, jsonError, requireHubSession } from "../_lib"

export const dynamic = "force-dynamic"

/** Les 7 jours de la semaine (clés canoniques du JSON horaires). */
const DAYS_7 = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const

/** Créneau « HH:MM-HH:MM » (24 h, minutes 00-59). */
const SLOT_RE = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/

/** Nombre fini ≥ 0 (remplace silencieusement la virgule décimale FR). */
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."))
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Sérialisation du setting (Json relus tels quels, dates en ISO). */
function serialize(s: {
  hubId: string
  horaires: unknown
  tarifs: unknown
  updatedAt: Date
  updatedBy: string | null
}) {
  return {
    hubId: s.hubId,
    horaires: s.horaires as Record<string, string>,
    tarifs: s.tarifs as Record<string, { min: number; max: number }>,
    updatedAt: s.updatedAt.toISOString(),
    updatedBy: s.updatedBy,
  }
}

/* ----------------------------- GET : lecture ----------------------------- */

export async function GET(req: NextRequest) {
  const session = await requireHubSession()
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }

  const hubId = req.nextUrl.searchParams.get("hubId")?.trim()
  if (!hubId) {
    return jsonError("Paramètre « hubId » requis — précisez le Terminal Multi-Services.", 400)
  }
  const hub = await db.mobilityHub.findUnique({ where: { id: hubId }, select: { code: true } })
  if (!hub) {
    return jsonError("Terminal Multi-Services introuvable.", 404)
  }

  const setting = await db.hubSetting.findUnique({ where: { hubId } })
  // null = aucun paramètre enregistré : l'UI affiche les pré-remplissages
  // par défaut (06:00-22:00 / lavage-vidange-pneus) SANS les faire passer
  // pour des données persistées.
  return NextResponse.json({ setting: setting ? serialize(setting) : null })
}

/* ----------------------------- PUT : upsert ----------------------------- */

export async function PUT(req: NextRequest) {
  const session = await requireHubSession()
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }
  if (!HUBS_WRITE_ROLES.has(session.role)) {
    return jsonError(
      "Action réservée aux rôles d'exploitation réseau (SUPER_ADMIN, ADMIN, NETWORK, COMMERCIAL, DG).",
      403,
    )
  }

  const body = (await req.json().catch(() => null)) as {
    hubId?: unknown
    horaires?: unknown
    tarifs?: unknown
  } | null
  if (!body || typeof body.hubId !== "string" || !body.hubId.trim()) {
    return jsonError("Corps invalide — « hubId » (string) est requis.", 400)
  }
  const hubId = body.hubId.trim()

  const hub = await db.mobilityHub.findUnique({ where: { id: hubId }, select: { code: true, name: true } })
  if (!hub) {
    return jsonError("Terminal Multi-Services introuvable.", 404)
  }

  // ---- Validation horaires : 7 jours, « HH:MM-HH:MM », ouverture < fermeture ----
  const horaires = body.horaires
  if (typeof horaires !== "object" || horaires === null || Array.isArray(horaires)) {
    return jsonError("« horaires » invalide — objet { lundi: \"06:00-22:00\", … } attendu.", 400)
  }
  const hMap = horaires as Record<string, unknown>
  const keys = Object.keys(hMap).sort()
  const expected = [...DAYS_7].sort()
  if (keys.length !== 7 || keys.some((k, i) => k !== expected[i])) {
    return jsonError(
      "« horaires » invalide — les 7 jours (lundi à dimanche) sont requis, un par ligne.",
      400,
    )
  }
  const cleanHoraires: Record<string, string> = {}
  for (const day of DAYS_7) {
    const slot = hMap[day]
    if (typeof slot !== "string" || !SLOT_RE.test(slot.trim())) {
      return jsonError(
        `Horaire « ${day} » invalide (« ${String(slot)} ») — format attendu HH:MM-HH:MM (ex. 06:00-22:00).`,
        400,
      )
    }
    const v = slot.trim()
    const [, oh, om, fh, fm] = SLOT_RE.exec(v)!
    if (Number(oh) * 60 + Number(om) >= Number(fh) * 60 + Number(fm)) {
      return jsonError(
        `Horaire « ${day} » incohérent (« ${v} ») — l'ouverture doit précéder la fermeture.`,
        400,
      )
    }
    cleanHoraires[day] = v
  }

  // ---- Validation tarifs : 1-12 prestations { min, max } en DT, min ≤ max ----
  const tarifs = body.tarifs
  if (typeof tarifs !== "object" || tarifs === null || Array.isArray(tarifs)) {
    return jsonError(
      "« tarifs » invalide — objet { lavage: { min: 20, max: 35 }, … } attendu.",
      400,
    )
  }
  const tMap = tarifs as Record<string, unknown>
  const tKeys = Object.keys(tMap)
  if (tKeys.length < 1 || tKeys.length > 12) {
    return jsonError("« tarifs » invalide — entre 1 et 12 prestations attendues.", 400)
  }
  const cleanTarifs: Record<string, { min: number; max: number }> = {}
  for (const key of tKeys) {
    const label = key.trim().toLowerCase()
    if (label.length < 1 || label.length > 40) {
      return jsonError(`Prestation « ${key} » invalide — libellé de 1 à 40 caractères.`, 400)
    }
    const entry = tMap[key]
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return jsonError(`Tarif « ${label} » invalide — objet { min, max } attendu.`, 400)
    }
    const e = entry as Record<string, unknown>
    const min = num(e.min)
    const max = num(e.max)
    if (min === null || max === null || min < 0 || max < 0) {
      return jsonError(
        `Tarif « ${label} » invalide — min et max doivent être des montants positifs en DT.`,
        400,
      )
    }
    if (min > max) {
      return jsonError(`Tarif « ${label} » incohérent — le minimum (${min} DT) dépasse le maximum (${max} DT).`, 400)
    }
    cleanTarifs[label] = {
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
    }
  }

  // ---- Upsert (une ligne par hub) + traçabilité ----
  const setting = await db.hubSetting.upsert({
    where: { hubId },
    update: { horaires: cleanHoraires, tarifs: cleanTarifs, updatedBy: session.email },
    create: { hubId, horaires: cleanHoraires, tarifs: cleanTarifs, updatedBy: session.email },
  })

  await logAudit({
    acteur: { nom: session.email, email: session.email, role: session.role },
    module: "HUBS",
    action: "Paramètres d'exploitation TMP enregistrés",
    cibleType: "HUB_SETTING",
    cibleLabel: `${hub.code} — ${hub.name}`,
    details: `horaires 7 jours · ${tKeys.length} prestation(s) tarifée(s) (${tKeys.join(", ")}) · mise à jour par ${session.email}`,
  })

  return NextResponse.json({ setting: serialize(setting) })
}
