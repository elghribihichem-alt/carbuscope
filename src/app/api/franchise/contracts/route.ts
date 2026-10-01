// CarbuScope — T54-B3b — /api/franchise/contracts : contrats de franchise de
// l'enseigne (saisie interne V1). Route STRICTEMENT ADDITIVE (schéma T54-A1
// gelé) :
//   · GET   ?brand= (session requise — enseigne résolue session/param) →
//           contrats + candidat (nom, gouvernorat), décroissant createdAt ;
//   · POST  { candidateId, entryFee, royaltyPct, durationYears } (session +
//           rôle écrit) → référence générée « FR-2025-00N » (max+1 de la
//           famille FR-2025-, spec T54-B3b), statut DRAFT ; le candidat doit
//           exister, appartenir à l'enseigne et être APPROUVÉ ;
//   · PATCH { id, status } (session + rôle écrit) — cycle SENS UNIQUE
//           DRAFT → SENT → SIGNED → ACTIVE → TERMINATED (400 FR sinon),
//           signedAt horodaté au passage à SIGNED ; AuditEvent FRANCHISE.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import { getSessionUser } from "@/lib/auth"
import {
  CONTRACT_NEXT,
  CONTRACT_STATUS_LABELS,
  FRANCHISE_WRITE_ROLES,
  nextContractReference,
  resolveBrandSession,
} from "../_lib"

export const dynamic = "force-dynamic"

type ContractRow = {
  id: string
  candidateId: string
  brandSlug: string
  reference: string
  status: string
  royaltyPct: number
  entryFee: number
  durationYears: number
  signedAt: Date | null
  createdAt: Date
  candidate: { id: string; fullName: string; gouvernorat: string; status: string }
}

const serialize = (c: ContractRow) => ({
  id: c.id,
  candidateId: c.candidateId,
  candidateName: c.candidate?.fullName ?? "",
  candidateGouvernorat: c.candidate?.gouvernorat ?? "",
  candidateStatus: c.candidate?.status ?? "",
  brandSlug: c.brandSlug,
  reference: c.reference,
  status: c.status,
  royaltyPct: c.royaltyPct,
  entryFee: c.entryFee,
  durationYears: c.durationYears,
  signedAt: c.signedAt ? c.signedAt.toISOString() : null,
  createdAt: c.createdAt.toISOString(),
})

/* ----------------------------- GET : liste ----------------------------- */

export async function GET(req: NextRequest) {
  const session = await resolveBrandSession(req.nextUrl.searchParams.get("brand"))
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }

  const rows = await db.franchiseContract.findMany({
    where: { brandSlug: session.brand },
    orderBy: [{ createdAt: "desc" }],
    include: {
      candidate: { select: { id: true, fullName: true, gouvernorat: true, status: true } },
    },
  })
  return NextResponse.json({
    brand: session.brand,
    contracts: rows.map(serialize),
  })
}

/* ----------------------------- POST : création ----------------------------- */

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const brandParam = typeof body?.brandSlug === "string" ? body.brandSlug : null
  const session = await resolveBrandSession(brandParam)
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }
  if (!FRANCHISE_WRITE_ROLES.has(session.role)) {
    return NextResponse.json(
      { error: "Action réservée aux profils de développement réseau (admin, expansion, commercial, DG)." },
      { status: 403 },
    )
  }
  const brand = session.brand

  const candidateId = typeof body?.candidateId === "string" ? body.candidateId.trim() : ""
  if (!candidateId) {
    return NextResponse.json({ error: "Champ « candidateId » requis." }, { status: 400 })
  }

  const candidate = await db.franchiseCandidate.findUnique({ where: { id: candidateId } })
  if (!candidate) {
    return NextResponse.json({ error: "Candidat introuvable." }, { status: 404 })
  }
  if (candidate.brandSlug !== brand) {
    return NextResponse.json(
      { error: "Le candidat n'appartient pas à votre enseigne." },
      { status: 403 },
    )
  }
  if (candidate.status !== "APPROVED") {
    return NextResponse.json(
      { error: "Un contrat ne peut être créé que pour un candidat approuvé (pipeline franchise)." },
      { status: 400 },
    )
  }

  const entryFeeRaw = Number(body?.entryFee)
  const royaltyPctRaw = Number(body?.royaltyPct)
  const durationRaw = Number(body?.durationYears)
  if (!Number.isFinite(entryFeeRaw) || entryFeeRaw < 10_000 || entryFeeRaw > 2_000_000) {
    return NextResponse.json(
      { error: "Droit d'entrée attendu entre 10 000 et 2 000 000 DT." },
      { status: 400 },
    )
  }
  if (!Number.isFinite(royaltyPctRaw) || royaltyPctRaw < 0.5 || royaltyPctRaw > 15) {
    return NextResponse.json(
      { error: "Royalties attendues entre 0,5 et 15 % du chiffre d'affaires." },
      { status: 400 },
    )
  }
  if (!Number.isFinite(durationRaw) || durationRaw < 1 || durationRaw > 15 || !Number.isInteger(durationRaw)) {
    return NextResponse.json({ error: "Durée attendue : 1 à 15 ans (entier)." }, { status: 400 })
  }

  // Référence « FR-2025-00N » : max+1 de la famille existante (idempotent par
  // unicité — une collision concourante échoue proprement côté Prisma).
  const existingRefs = await db.franchiseContract.findMany({
    where: { reference: { startsWith: "FR-2025-" } },
    select: { reference: true },
  })
  const reference = nextContractReference(existingRefs.map(r => r.reference))

  const created = await db.franchiseContract.create({
    data: {
      candidateId,
      brandSlug: brand,
      reference,
      status: "DRAFT",
      royaltyPct: Math.round(royaltyPctRaw * 10) / 10,
      entryFee: Math.round(entryFeeRaw),
      durationYears: durationRaw,
    },
    include: {
      candidate: { select: { id: true, fullName: true, gouvernorat: true, status: true } },
    },
  })

  await logAudit({
    acteur: { nom: session.email, email: session.email, role: session.role },
    module: "FRANCHISE",
    action: "Contrat créé (brouillon)",
    cibleType: "FRANCHISE_CONTRACT",
    cibleLabel: `${reference} (${candidate.fullName}, ${brand})`,
    details: `droit d'entrée ${Math.round(entryFeeRaw).toLocaleString("fr-FR")} DT · royalties ${(Math.round(royaltyPctRaw * 10) / 10).toLocaleString("fr-FR")} % · ${durationRaw} ans`,
  })

  return NextResponse.json({ contract: serialize(created) }, { status: 201 })
}

/* ----------------------------- PATCH : statut ----------------------------- */

export async function PATCH(req: NextRequest) {
  const sessionUser = await getSessionUser()
  if (!sessionUser) {
    return NextResponse.json(
      { error: "Connexion requise — le module franchise est une saisie interne enseigne." },
      { status: 401 },
    )
  }
  if (!FRANCHISE_WRITE_ROLES.has(sessionUser.role)) {
    return NextResponse.json(
      { error: "Action réservée aux profils de développement réseau (admin, expansion, commercial, DG)." },
      { status: 403 },
    )
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof body?.id === "string" ? body.id.trim() : ""
  const status = typeof body?.status === "string" ? body.status.trim() : ""
  if (!id) {
    return NextResponse.json({ error: "Champ « id » requis." }, { status: 400 })
  }
  if (!status) {
    return NextResponse.json({ error: "Champ « status » requis." }, { status: 400 })
  }

  const existing = await db.franchiseContract.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Contrat introuvable." }, { status: 404 })
  }
  if (sessionUser.brandSlug && existing.brandSlug !== sessionUser.brandSlug) {
    return NextResponse.json(
      { error: `Accès réservé aux contrats de votre enseigne (${sessionUser.brandSlug}).` },
      { status: 403 },
    )
  }

  if (!(status in CONTRACT_NEXT)) {
    return NextResponse.json(
      { error: "Statut inconnu (brouillon, envoyé, signé, actif, résilié)." },
      { status: 400 },
    )
  }
  const expected = CONTRACT_NEXT[existing.status] ?? ""
  if (status !== expected) {
    return NextResponse.json(
      {
        error: `Transition « ${CONTRACT_STATUS_LABELS[existing.status] ?? existing.status} → ${CONTRACT_STATUS_LABELS[status] ?? status} » invalide — cycle à sens unique : Brouillon → Envoyé → Signé → Actif → Résilié.`,
      },
      { status: 400 },
    )
  }

  // signedAt est horodaté au passage SIGNED (une seule fois — jamais écrasé).
  const signedAt = status === "SIGNED" ? (existing.signedAt ?? new Date()) : existing.signedAt

  const updated = await db.franchiseContract.update({
    where: { id },
    data: { status, signedAt },
    include: {
      candidate: { select: { id: true, fullName: true, gouvernorat: true, status: true } },
    },
  })

  await logAudit({
    acteur: { nom: sessionUser.email, email: sessionUser.email, role: sessionUser.role },
    module: "FRANCHISE",
    action: "Contrat : transition de statut",
    cibleType: "FRANCHISE_CONTRACT",
    cibleLabel: `${updated.reference} (${updated.candidate?.fullName ?? "?"})`,
    details: `${CONTRACT_STATUS_LABELS[existing.status] ?? existing.status} → ${CONTRACT_STATUS_LABELS[status] ?? status}${status === "SIGNED" ? " · signature horodatée" : ""}`,
  })

  return NextResponse.json({ contract: serialize(updated) })
}
