// CarbuScope — T54-Ca — /api/hubs/services : gestion des services d'un TMP
// (module « Mobility Hub Operations », volet 2). Route STRICTEMENT ADDITIVE
// (gel T52/T53, schéma T54-A1 inchangé) :
//   · GET    ?hubId=… (session requise) → { hubId, services: HubServiceDTO[] }
//            — services du hub triés par catégorie puis nom ;
//   · POST   (session + rôle écrit) { hubId, category, name, price?,
//            capacityPerDay?, status } — validations FR : catégorie parmi les
//            8 du schéma, nom 2-80 caractères, prix ≥ 0 (absent = vente
//            libre), capacité entière ≥ 1/jour, statut initial Actif/En pause ;
//   · PATCH  (session + rôle écrit) { id, …champs, status } — transitions
//            ACTIVE ↔ PAUSED libres, CLOSED DÉFINITIVE ; 400 FR sur toute
//            modification d'un service CLOSED (il faut en recréer un) ;
//            champs éditables : nom, prix, capacité, statut (la catégorie est
//            structurelle : non modifiable en V1, documenté).
// Chaque mutation est tracée dans AuditEvent (module « HUBS » — pattern
// FRANCHISE du round T54-B3b). Pas de DELETE en V1 (une clôture se documente).

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import {
  HUBS_WRITE_ROLES,
  SERVICE_CATEGORIES,
  SERVICE_STATUS_LABELS,
  jsonError,
  requireHubSession,
} from "../_lib"

export const dynamic = "force-dynamic"

type ServiceRow = {
  id: string
  hubId: string
  category: string
  name: string
  price: number | null
  status: string
  capacityPerDay: number | null
  bookingsThisMonth: number
  createdAt: Date
}

const serialize = (s: ServiceRow) => ({
  id: s.id,
  hubId: s.hubId,
  category: s.category,
  name: s.name,
  price: s.price,
  status: s.status,
  capacityPerDay: s.capacityPerDay,
  bookingsThisMonth: s.bookingsThisMonth,
  createdAt: s.createdAt.toISOString(),
})

/* ----------------------------- GET : services d'un hub ----------------------------- */

export async function GET(req: NextRequest) {
  const session = await requireHubSession()
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }

  const hubId = req.nextUrl.searchParams.get("hubId")?.trim() ?? ""
  if (!hubId) {
    return jsonError("Paramètre « hubId » requis — précisez le Terminal Multi-Services.", 400)
  }
  const hub = await db.mobilityHub.findUnique({
    where: { id: hubId },
    select: { id: true, code: true, name: true, status: true },
  })
  if (!hub) {
    return jsonError("Terminal Multi-Services introuvable.", 404)
  }

  const services = await db.hubService.findMany({
    where: { hubId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  })

  return NextResponse.json({ hubId, hub, services: services.map(serialize) })
}

/* ----------------------------- POST : création ----------------------------- */

export async function POST(req: NextRequest) {
  const session = await requireHubSession()
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }
  if (!HUBS_WRITE_ROLES.has(session.role)) {
    return jsonError(
      "Action réservée aux profils d'exploitation réseau (admin, network, commercial, DG).",
      403,
    )
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const hubId = typeof body?.hubId === "string" ? body.hubId.trim() : ""
  const category = typeof body?.category === "string" ? body.category.trim() : ""
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const status = typeof body?.status === "string" ? body.status.trim() : "ACTIVE"

  if (!hubId) {
    return jsonError("Champ « hubId » requis — précisez le Terminal Multi-Services.", 400)
  }
  const hub = await db.mobilityHub.findUnique({
    where: { id: hubId },
    select: { id: true, code: true, name: true },
  })
  if (!hub) {
    return jsonError("Terminal Multi-Services introuvable.", 404)
  }

  if (!SERVICE_CATEGORIES.includes(category)) {
    return jsonError(
      "Catégorie inconnue — lavage, vidange, pneus, recharge, boutique, café, laverie ou relais colis.",
      400,
    )
  }
  if (name.length < 2 || name.length > 80) {
    return jsonError("Le nom du service doit contenir entre 2 et 80 caractères.", 400)
  }

  // Prix indicatif facultatif : absent/null = vente libre, sinon nombre ≥ 0.
  let price: number | null = null
  if (body?.price !== undefined && body?.price !== null && body?.price !== "") {
    const p = Number(body.price)
    if (!Number.isFinite(p) || p < 0) {
      return jsonError("Tarif invalide — indiquez un montant en DT supérieur ou égal à 0 (ou laissez vide pour une vente libre).", 400)
    }
    price = p
  }

  // Capacité théorique facultative : entier ≥ 1 vehicule/prestation par jour.
  let capacityPerDay: number | null = null
  if (body?.capacityPerDay !== undefined && body?.capacityPerDay !== null && body?.capacityPerDay !== "") {
    const c = Number(body.capacityPerDay)
    if (!Number.isInteger(c) || c < 1) {
      return jsonError("Capacité invalide — un nombre entier de prestations par jour (≥ 1), ou laissez vide.", 400)
    }
    capacityPerDay = c
  }

  if (!(status in SERVICE_STATUS_LABELS) || status === "CLOSED") {
    return jsonError("Statut initial invalide — un nouveau service démarre « Actif » ou « En pause ».", 400)
  }

  const created = await db.hubService.create({
    data: { hubId, category, name, price, capacityPerDay, status, bookingsThisMonth: 0 },
  })

  await logAudit({
    acteur: { nom: session.email, email: session.email, role: session.role },
    module: "HUBS",
    action: "Service TMP créé",
    cibleType: "HUB_SERVICE",
    cibleLabel: `${name} (${hub.code})`,
    details: `catégorie ${category}${price != null ? ` · tarif ${price} DT` : " · vente libre"}${capacityPerDay != null ? ` · capacité ${capacityPerDay}/j` : ""}`,
  })

  return NextResponse.json({ service: serialize(created) }, { status: 201 })
}

/* ----------------------------- PATCH : édition / transitions ----------------------------- */

export async function PATCH(req: NextRequest) {
  const session = await requireHubSession()
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }
  if (!HUBS_WRITE_ROLES.has(session.role)) {
    return jsonError(
      "Action réservée aux profils d'exploitation réseau (admin, network, commercial, DG).",
      403,
    )
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof body?.id === "string" ? body.id.trim() : ""
  if (!id) {
    return jsonError("Champ « id » requis.", 400)
  }

  const existing = await db.hubService.findUnique({
    where: { id },
    include: { hub: { select: { code: true, name: true } } },
  })
  if (!existing) {
    return jsonError("Service introuvable.", 404)
  }

  // Clôture = DÉFINITIVE : un service CLOSED ne se modifie plus (spec C2).
  if (existing.status === "CLOSED") {
    return jsonError(
      `Le service « ${existing.name} » est clôturé (close définitive) — il ne peut plus être modifié. Créez un nouveau service pour le remplacer.`,
      400,
    )
  }

  // --- Nom (2-80 caractères) ---
  let newName: string | undefined
  if (body?.name !== undefined) {
    if (typeof body.name !== "string") {
      return jsonError("Nom au format texte attendu.", 400)
    }
    const name = body.name.trim()
    if (name.length < 2 || name.length > 80) {
      return jsonError("Le nom du service doit contenir entre 2 et 80 caractères.", 400)
    }
    newName = name
  }

  // --- Prix indicatif (nombre ≥ 0, null = vente libre) ---
  let newPrice: number | null | undefined
  if (body?.price !== undefined) {
    if (body.price === null || body.price === "") {
      newPrice = null
    } else {
      const p = Number(body.price)
      if (!Number.isFinite(p) || p < 0) {
        return jsonError("Tarif invalide — un montant en DT supérieur ou égal à 0 (ou vide pour une vente libre).", 400)
      }
      newPrice = p
    }
  }

  // --- Capacité (entier ≥ 1, null = non suivie) ---
  let newCapacity: number | null | undefined
  if (body?.capacityPerDay !== undefined) {
    if (body.capacityPerDay === null || body.capacityPerDay === "") {
      newCapacity = null
    } else {
      const c = Number(body.capacityPerDay)
      if (!Number.isInteger(c) || c < 1) {
        return jsonError("Capacité invalide — un nombre entier de prestations par jour (≥ 1), ou laissez vide.", 400)
      }
      newCapacity = c
    }
  }

  // --- Statut : ACTIVE ↔ PAUSED libres, CLOSED définitif ---
  let newStatus: string | undefined
  if (body?.status !== undefined) {
    const status = typeof body.status === "string" ? body.status.trim() : ""
    if (!(status in SERVICE_STATUS_LABELS)) {
      return jsonError("Statut inconnu (actif, en pause, clôturé).", 400)
    }
    if (status === existing.status) {
      return jsonError(
        `Le service est déjà au statut « ${SERVICE_STATUS_LABELS[existing.status] ?? existing.status} ».`,
        400,
      )
    }
    // From ACTIVE|PAUSED : vers ACTIVE|PAUSED|CLOSED — tout est permis ;
    // depuis CLOSED est déjà bloqué ci-dessus (définitif).
    newStatus = status
  }

  if (newName === undefined && newPrice === undefined && newCapacity === undefined && newStatus === undefined) {
    return jsonError(
      "Rien à mettre à jour — fournissez « name », « price », « capacityPerDay » et/ou « status ».",
      400,
    )
  }

  const updated = await db.hubService.update({
    where: { id },
    data: {
      ...(newName !== undefined ? { name: newName } : {}),
      ...(newPrice !== undefined ? { price: newPrice } : {}),
      ...(newCapacity !== undefined ? { capacityPerDay: newCapacity } : {}),
      ...(newStatus !== undefined ? { status: newStatus } : {}),
    },
  })

  const changes: string[] = []
  if (newStatus !== undefined) {
    changes.push(
      `${SERVICE_STATUS_LABELS[existing.status] ?? existing.status} → ${SERVICE_STATUS_LABELS[newStatus] ?? newStatus}`,
    )
  }
  if (newName !== undefined && newName !== existing.name) changes.push(`nom : « ${newName} »`)
  if (newPrice !== undefined && newPrice !== existing.price) {
    changes.push(newPrice == null ? "tarif : vente libre" : `tarif : ${newPrice} DT`)
  }
  if (newCapacity !== undefined && newCapacity !== existing.capacityPerDay) {
    changes.push(newCapacity == null ? "capacité non suivie" : `capacité : ${newCapacity}/j`)
  }

  await logAudit({
    acteur: { nom: session.email, email: session.email, role: session.role },
    module: "HUBS",
    action: newStatus === "CLOSED" ? "Service TMP clôturé (définitif)" : "Service TMP mis à jour",
    cibleType: "HUB_SERVICE",
    cibleLabel: `${updated.name} (${existing.hub.code})`,
    details: changes.join(" · ") || "aucun changement de valeur",
  })

  return NextResponse.json({ service: serialize(updated) })
}
