// CarbuScope — T54-Ca → T54-Cb — /api/hubs : inventaire des Terminaux
// Multi-Services (module « Mobility Hub Operations », volet carte) + édition
// du hub lui-même (volet « Paramètres TMP », T54-Cb).
//   · GET (session requise — 401 sinon) → { hubs: HubDTO[] } avec compteurs
//     consolidés par hub : servicesCount (total), activeServicesCount (actifs)
//     et bookingsThisMonth (somme des réservations du mois des services).
//     Les 45 services TMP au total rendent l'inclusion JS plus lisible qu'un
//     groupBy par statut (documenté — même convention que les listes légères).
//     Tri : statut (ACTIVE → CONSTRUCTION → PLANNED → CLOSED) puis code.
//     Les hubs PLANNED/CONSTRUCTION restent à 0 trafic/CA tant qu'ils ne sont
//     pas ouverts (invariant du seed T54-A1 — l'API ne fait que relire).
//   · PATCH { id, name?, address?, manager?, phone?, status?, surfaceM2?,
//     dailyVehicles?, monthlyRevenue? } (T54-Cb — session + HUBS_WRITE_ROLES,
//     401/403 sinon) : validations FR (nom 2-80, adresse 5-200, téléphone
//     +216 à 8 chiffres, surface > 0, trafic ≥ 0, CA ≥ 0) et CYCLE DE VIE À
//     SENS UNIQUE : PLANNED → CONSTRUCTION → ACTIVE → CLOSED (400 FR pour
//     toute autre transition — CLOSED est terminal, pas de retour arrière en
//     V1). Le passage à ACTIVE HORODATE openedAt (première ouverture
//     seulement). AuditEvent HUBS à chaque écriture (pattern T54-Ca).
//     Réponse : { hub } sérialisé comme le GET (compteurs recalculés).

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import { HUB_STATUS_RANK, HUBS_WRITE_ROLES, requireHubSession } from "./_lib"

export const dynamic = "force-dynamic"

/** Cycle de vie à SENS UNIQUE (spec T54-Cb) — index + 1 = étape suivante. */
const STATUS_CHAIN: readonly string[] = ["PLANNED", "CONSTRUCTION", "ACTIVE", "CLOSED"]

const STATUS_LABELS: Readonly<Record<string, string>> = {
  PLANNED: "Planifié",
  CONSTRUCTION: "En construction",
  ACTIVE: "Actif",
  CLOSED: "Fermé",
}

/** Téléphone tunisien : « +216 » puis 8 chiffres (espaces tolérés). */
const PHONE_RE = /^\+216( ?\d){8}$/

/** Sérialisation commune GET/PATCH (compteurs services consolidés). */
function serializeHub(h: {
  id: string
  code: string
  name: string
  gouvernorat: string
  address: string
  lat: number
  lng: number
  status: string
  type: string
  openedAt: Date | null
  surfaceM2: number | null
  dailyVehicles: number
  monthlyRevenue: number
  manager: string | null
  phone: string | null
  services: Array<{ status: string; bookingsThisMonth: number }>
}) {
  return {
    id: h.id,
    code: h.code,
    name: h.name,
    gouvernorat: h.gouvernorat,
    address: h.address,
    lat: h.lat,
    lng: h.lng,
    status: h.status,
    type: h.type,
    openedAt: h.openedAt ? h.openedAt.toISOString() : null,
    surfaceM2: h.surfaceM2,
    dailyVehicles: h.dailyVehicles,
    monthlyRevenue: h.monthlyRevenue,
    manager: h.manager,
    phone: h.phone,
    servicesCount: h.services.length,
    activeServicesCount: h.services.filter(s => s.status === "ACTIVE").length,
    bookingsThisMonth: h.services.reduce((a, s) => a + s.bookingsThisMonth, 0),
  }
}

export async function GET(_req: NextRequest) {
  const session = await requireHubSession()
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }

  const rows = await db.mobilityHub.findMany({
    orderBy: { code: "asc" },
    include: {
      services: { select: { status: true, bookingsThisMonth: true } },
    },
  })

  const hubs = rows
    .map(serializeHub)
    // Actifs d'abord (même rang que la légende de la carte), puis code croissant.
    .sort(
      (a, b) =>
        (HUB_STATUS_RANK[a.status] ?? 9) - (HUB_STATUS_RANK[b.status] ?? 9) ||
        a.code.localeCompare(b.code),
    )

  return NextResponse.json({ hubs })
}

/* ------------------- PATCH : identité & cycle de vie (T54-Cb) ------------------- */

export async function PATCH(req: NextRequest) {
  const session = await requireHubSession()
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }
  if (!HUBS_WRITE_ROLES.has(session.role)) {
    return NextResponse.json(
      {
        error:
          "Action réservée aux rôles d'exploitation réseau (SUPER_ADMIN, ADMIN, NETWORK, COMMERCIAL, DG).",
      },
      { status: 403 },
    )
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.id !== "string" || !body.id.trim()) {
    return NextResponse.json(
      { error: "Corps invalide — « id » (string) du Terminal Multi-Services est requis." },
      { status: 400 },
    )
  }

  const existing = await db.mobilityHub.findUnique({
    where: { id: body.id },
    include: { services: { select: { status: true, bookingsThisMonth: true } } },
  })
  if (!existing) {
    return NextResponse.json({ error: "Terminal Multi-Services introuvable." }, { status: 404 })
  }

  const patch: Record<string, string | number | Date | null> = {}
  const changes: string[] = []

  // ---- Nom ----
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 80) {
      return NextResponse.json(
        { error: "« name » invalide — le nom du hub doit contenir entre 2 et 80 caractères." },
        { status: 400 },
      )
    }
    patch.name = body.name.trim()
    if (patch.name !== existing.name) changes.push(`nom « ${patch.name} »`)
  }

  // ---- Adresse ----
  if (body.address !== undefined) {
    if (typeof body.address !== "string" || body.address.trim().length < 5 || body.address.trim().length > 200) {
      return NextResponse.json(
        { error: "« address » invalide — l'adresse doit contenir entre 5 et 200 caractères." },
        { status: 400 },
      )
    }
    patch.address = body.address.trim()
    if (patch.address !== existing.address) changes.push("adresse")
  }

  // ---- Responsable (null autorisé : efface) ----
  if (body.manager !== undefined) {
    if (body.manager !== null) {
      if (typeof body.manager !== "string" || body.manager.trim().length < 2 || body.manager.trim().length > 80) {
        return NextResponse.json(
          { error: "« manager » invalide — entre 2 et 80 caractères, ou null pour effacer." },
          { status: 400 },
        )
      }
      patch.manager = body.manager.trim()
    } else {
      patch.manager = null
    }
    if (patch.manager !== existing.manager) changes.push("responsable")
  }

  // ---- Téléphone (null autorisé : efface) — format +216 ----
  if (body.phone !== undefined) {
    if (body.phone !== null) {
      if (typeof body.phone !== "string" || !PHONE_RE.test(body.phone.trim())) {
        return NextResponse.json(
          { error: "« phone » invalide — format tunisien attendu : +216 suivi de 8 chiffres (ex. +216 71 234 567)." },
          { status: 400 },
        )
      }
      patch.phone = body.phone.trim()
    } else {
      patch.phone = null
    }
    if (patch.phone !== existing.phone) changes.push("téléphone")
  }

  // ---- Surface (m²) ----
  if (body.surfaceM2 !== undefined) {
    const v = body.surfaceM2
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : null
    if (n === null || !Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      return NextResponse.json(
        { error: "« surfaceM2 » invalide — la surface doit être un entier strictement positif (m²)." },
        { status: 400 },
      )
    }
    patch.surfaceM2 = n
    if (patch.surfaceM2 !== existing.surfaceM2) changes.push(`surface ${n} m²`)
  }

  // ---- Trafic journalier (véhicules/j, 0 possible) ----
  if (body.dailyVehicles !== undefined) {
    const v = body.dailyVehicles
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : null
    if (n === null || !Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      return NextResponse.json(
        { error: "« dailyVehicles » invalide — le trafic doit être un entier positif (véhicules/jour)." },
        { status: 400 },
      )
    }
    patch.dailyVehicles = n
    if (patch.dailyVehicles !== existing.dailyVehicles) changes.push(`trafic ${n} véh./j`)
  }

  // ---- CA mensuel (DT, estimatif — badge « est. » côté UI) ----
  if (body.monthlyRevenue !== undefined) {
    const v = body.monthlyRevenue
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : null
    if (n === null || !Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: "« monthlyRevenue » invalide — le CA mensuel doit être un montant positif en DT." },
        { status: 400 },
      )
    }
    patch.monthlyRevenue = Math.round(n * 100) / 100
    if (patch.monthlyRevenue !== existing.monthlyRevenue) changes.push(`CA ${patch.monthlyRevenue} DT/mois`)
  }

  // ---- Statut : cycle de vie À SENS UNIQUE ----
  let openedNow = false
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !STATUS_CHAIN.includes(body.status)) {
      return NextResponse.json(
        { error: "« status » invalide — statuts attendus : PLANNED, CONSTRUCTION, ACTIVE ou CLOSED." },
        { status: 400 },
      )
    }
    const target = body.status
    if (target !== existing.status) {
      const curIdx = STATUS_CHAIN.indexOf(existing.status)
      const next = STATUS_CHAIN[curIdx + 1] // undefined si terminal (CLOSED)
      if (target !== next) {
        return NextResponse.json(
          {
            error:
              `Transition de statut invalide — le cycle de vie est à sens unique : ` +
              `Planifié → En construction → Actif → Fermé. ` +
              `« ${STATUS_LABELS[existing.status] ?? existing.status} » ne peut pas passer à ` +
              `« ${STATUS_LABELS[target] ?? target} »${next ? ` (étape suivante : « ${STATUS_LABELS[next]} »)` : " (statut terminal)"} ` +
              `et il n'y a pas de retour arrière en V1.`,
          },
          { status: 400 },
        )
      }
      patch.status = target
      changes.push(`statut ${STATUS_LABELS[target] ?? target}`)
      // Première ouverture → horodatage (les réouvertures n'écrasent pas
      // l'historique — V1 : CLOSED est terminal de toute façon).
      if (target === "ACTIVE" && existing.openedAt == null) {
        patch.openedAt = new Date()
        openedNow = true
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Aucun champ modifiable fourni — rien à mettre à jour (les champs identiques sont ignorés)." },
      { status: 400 },
    )
  }

  const updated = await db.mobilityHub.update({
    where: { id: existing.id },
    data: patch,
    include: { services: { select: { status: true, bookingsThisMonth: true } } },
  })

  await logAudit({
    acteur: { nom: session.email, email: session.email, role: session.role },
    module: "HUBS",
    action: openedNow
      ? "Hub TMP ouvert — statut passé à Actif (openedAt horodaté)"
      : "Hub TMP mis à jour",
    cibleType: "MOBILITY_HUB",
    cibleLabel: `${updated.code} — ${updated.name}`,
    details: `${changes.join(" · ")} · par ${session.email}`,
  })

  return NextResponse.json({ hub: serializeHub(updated) })
}
