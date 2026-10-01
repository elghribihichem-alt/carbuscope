// CarbuScope — T54-B3b — /api/franchise/candidates : pipeline de candidatures
// franchise (saisie INTERNE enseigne V1 — formulaire public = V2). Route
// STRICTEMENT ADDITIVE (gel T52/T53, schéma T54-A1 inchangé) :
//   · GET    ?brand= (session requise — enseigne résolue depuis la session,
//            paramètre brand pour les comptes plateforme) → candidatures de
//            l'enseigne, décroissant sur createdAt ;
//   · POST   (session + rôle écrit) → création avec validation FR complète :
//            nom / e-mail (regex) / téléphone (+216) / gouvernorat (24 réels)
//            requis, expérience et budget dans les énumérations du schéma ;
//   · PATCH  { id, status?, notes? } (session + rôle écrit) — transitions
//            VALIDES uniquement (NEW → CONTACTED → INTERVIEW → APPROVED |
//            REJECTED, terminaux sans retour — 400 FR sinon) + notes libres ;
//            chaque mutation est tracée dans AuditEvent (module FRANCHISE).
// NB : pas de DELETE en V1 (spec T54-B3b) — un candidat de test se rejette et
// se documente au lieu d'être supprimé.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import { getSessionUser } from "@/lib/auth"
import { GOV_REGION } from "@/lib/radar/scoring"
import {
  CANDIDATE_STATUS_LABELS,
  CANDIDATE_TRANSITIONS,
  FRANCHISE_WRITE_ROLES,
  resolveBrandSession,
} from "../_lib"

export const dynamic = "force-dynamic"

const EXPERIENCES = new Set(["NONE", "STATION", "RETAIL", "OTHER"])
const BUDGETS = new Set(["<500K", "500K_1M", "1M_2M", ">2M"])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Téléphone tunisien : +216 suivi de 8 chiffres (séparateurs libres). */
const PHONE_RE = /^\+216[\s.\-()]*(?:\d[\s.\-()]*){8}$/

type CandidateRow = {
  id: string
  brandSlug: string
  fullName: string
  email: string
  phone: string
  gouvernorat: string
  delegation: string | null
  city: string | null
  experience: string
  investmentRange: string
  status: string
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

const serialize = (c: CandidateRow) => ({
  id: c.id,
  brandSlug: c.brandSlug,
  fullName: c.fullName,
  email: c.email,
  phone: c.phone,
  gouvernorat: c.gouvernorat,
  delegation: c.delegation,
  city: c.city,
  experience: c.experience,
  investmentRange: c.investmentRange,
  status: c.status,
  notes: c.notes,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
})

/* ----------------------------- GET : liste ----------------------------- */

export async function GET(req: NextRequest) {
  const session = await resolveBrandSession(req.nextUrl.searchParams.get("brand"))
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }

  const rows = await db.franchiseCandidate.findMany({
    where: { brandSlug: session.brand },
    orderBy: [{ createdAt: "desc" }],
  })
  return NextResponse.json({
    brand: session.brand,
    candidates: rows.map(serialize),
  })
}

/* ----------------------------- POST : création ----------------------------- */

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  // Enseigne : celle de la session en priorité ; pour les comptes plateforme,
  // brandSlug explicite du corps (résolu par resolveBrandSession → 400 sinon).
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

  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : ""
  const email = typeof body?.email === "string" ? body.email.trim() : ""
  const phone = typeof body?.phone === "string" ? body.phone.trim() : ""
  const gouvernorat = typeof body?.gouvernorat === "string" ? body.gouvernorat.trim() : ""
  const delegation = typeof body?.delegation === "string" ? body.delegation.trim() : null
  const city = typeof body?.city === "string" ? body.city.trim() : null
  const experience = typeof body?.experience === "string" ? body.experience : ""
  const investmentRange = typeof body?.investmentRange === "string" ? body.investmentRange : ""
  const notes = typeof body?.notes === "string" ? body.notes.trim() : null

  if (!fullName) {
    return NextResponse.json({ error: "Le nom du candidat est requis." }, { status: 400 })
  }
  if (fullName.length > 120) {
    return NextResponse.json({ error: "Le nom du candidat est trop long (120 caractères max)." }, { status: 400 })
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Adresse e-mail invalide (ex. prenom.nom@exemple.tn)." },
      { status: 400 },
    )
  }
  if (!phone || !PHONE_RE.test(phone)) {
    return NextResponse.json(
      { error: "Téléphone tunisien attendu au format +216 XX XXX XXX." },
      { status: 400 },
    )
  }
  if (!gouvernorat || !(gouvernorat in GOV_REGION)) {
    return NextResponse.json(
      { error: "Gouvernorat inconnu — choisissez parmi les 24 gouvernorats." },
      { status: 400 },
    )
  }
  if (!EXPERIENCES.has(experience)) {
    return NextResponse.json(
      { error: "Expérience invalide (aucune, station, commerce, autre)." },
      { status: 400 },
    )
  }
  if (!BUDGETS.has(investmentRange)) {
    return NextResponse.json(
      { error: "Budget d'investissement invalide (moins de 500 KDT, 500 KDT-1 MDT, 1-2 MDT, plus de 2 MDT)." },
      { status: 400 },
    )
  }
  if (notes && notes.length > 2000) {
    return NextResponse.json({ error: "Notes trop longues (2 000 caractères max)." }, { status: 400 })
  }

  const created = await db.franchiseCandidate.create({
    data: {
      brandSlug: brand,
      fullName,
      email,
      phone,
      gouvernorat,
      delegation: delegation || null,
      city: city || null,
      experience,
      investmentRange,
      status: "NEW",
      notes: notes || null,
    },
  })

  await logAudit({
    acteur: { nom: session.email, email: session.email, role: session.role },
    module: "FRANCHISE",
    action: "Candidature créée",
    cibleType: "FRANCHISE_CANDIDATE",
    cibleLabel: `${fullName} (${brand}, ${gouvernorat})`,
  })

  return NextResponse.json({ candidate: serialize(created) }, { status: 201 })
}

/* ----------------------------- PATCH : statut / notes ----------------------------- */

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
  if (!id) {
    return NextResponse.json({ error: "Champ « id » requis." }, { status: 400 })
  }

  const existing = await db.franchiseCandidate.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 })
  }
  // Un compte enseigne ne mute que SES candidatures ; les comptes plateforme
  // (sans brandSlug — Super Admin, personnel) opèrent sur toutes les enseignes.
  if (sessionUser.brandSlug && existing.brandSlug !== sessionUser.brandSlug) {
    return NextResponse.json(
      { error: `Accès réservé aux candidatures de votre enseigne (${sessionUser.brandSlug}).` },
      { status: 403 },
    )
  }
  const session = { email: sessionUser.email, role: sessionUser.role }

  // --- Transition de statut (uniquement si fournie) ---
  let newStatus: string | undefined
  if (body?.status !== undefined) {
    const status = typeof body.status === "string" ? body.status.trim() : ""
    if (!(status in CANDIDATE_TRANSITIONS)) {
      return NextResponse.json(
        { error: "Statut inconnu (nouveau, contacté, entretien, approuvé, rejeté)." },
        { status: 400 },
      )
    }
    const valid = CANDIDATE_TRANSITIONS[existing.status] ?? []
    if (status === existing.status) {
      return NextResponse.json(
        { error: `La candidature est déjà au statut « ${CANDIDATE_STATUS_LABELS[existing.status] ?? existing.status} ».` },
        { status: 400 },
      )
    }
    if (!valid.includes(status)) {
      return NextResponse.json(
        {
          error: `Transition « ${CANDIDATE_STATUS_LABELS[existing.status] ?? existing.status} → ${CANDIDATE_STATUS_LABELS[status] ?? status} » invalide — pipeline : Nouveau → Contacté → Entretien → Approuvé / Rejeté (sans retour).`,
        },
        { status: 400 },
      )
    }
    newStatus = status
  }

  // --- Notes libres (facultatives) ---
  let newNotes: string | undefined
  if (body?.notes !== undefined) {
    if (typeof body.notes !== "string") {
      return NextResponse.json({ error: "Notes au format texte attendues." }, { status: 400 })
    }
    const notes = body.notes.trim()
    if (notes.length > 2000) {
      return NextResponse.json({ error: "Notes trop longues (2 000 caractères max)." }, { status: 400 })
    }
    newNotes = notes || null
  }

  if (newStatus === undefined && newNotes === undefined) {
    return NextResponse.json(
      { error: "Rien à mettre à jour — fournissez « status » et/ou « notes »." },
      { status: 400 },
    )
  }

  const updated = await db.franchiseCandidate.update({
    where: { id },
    data: {
      ...(newStatus !== undefined ? { status: newStatus } : {}),
      ...(newNotes !== undefined ? { notes: newNotes } : {}),
    },
  })

  await logAudit({
    acteur: { nom: session.email, email: session.email, role: session.role },
    module: "FRANCHISE",
    action: newStatus !== undefined ? "Candidature : transition de statut" : "Candidature : notes mises à jour",
    cibleType: "FRANCHISE_CANDIDATE",
    cibleLabel: `${updated.fullName} (${updated.brandSlug})`,
    details:
      newStatus !== undefined
        ? `${CANDIDATE_STATUS_LABELS[existing.status] ?? existing.status} → ${CANDIDATE_STATUS_LABELS[newStatus] ?? newStatus}${newNotes !== undefined ? " · notes actualisées" : ""}`
        : "notes internes actualisées",
  })

  return NextResponse.json({ candidate: serialize(updated) })
}
