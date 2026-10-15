import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSession } from "@/lib/auth"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// T63-b — Module « Panneaux publicitaires » : cycle de vie d'une face.
//
//   PATCH /api/panels/[id] { action: "reserver" | "liberer" }
//     → 200 { panel } | 403 | 404 | 409
//
// · reserver : RESERVE le panneau au nom de l'enseigne de la session
//   (rôles ADMIN / NETWORK / COMMERCIAL / DG) — SUPER_ADMIN précise la marque
//   cible via { brand }. Un panneau LOUE (engagement tiers) ou déjà RESERVE
//   par une autre enseigne est refusé (409) ; réserver un panneau déjà à soi
//   est idempotent (200).
// · liberer : rend le panneau DISPONIBLE — réservé par l'enseigne de la
//   session uniquement (ou SUPER_ADMIN).
// Toutes les transitions sont tracées dans AuditEvent (module PORTAIL).

const MANAGER_ROLES = new Set(["ADMIN", "NETWORK", "COMMERCIAL", "DG"])

function serializePanel(p: {
  id: string; code: string; nom: string; format: string; gouvernorat: string;
  delegation: string; axe: string; flux: number; visibilite: number;
  illumination: boolean; prixSemaine: number; loueur: string;
  statut: string; reservePar: string | null;
}) {
  return {
    id: p.id,
    code: p.code,
    nom: p.nom,
    format: p.format,
    gouvernorat: p.gouvernorat,
    delegation: p.delegation,
    axe: p.axe,
    flux: p.flux,
    visibilite: p.visibilite,
    illumination: p.illumination,
    prixSemaine: p.prixSemaine,
    loueur: p.loueur,
    statut: p.statut,
    reservePar: p.reservePar,
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { action?: string; brand?: string }

  if (body.action !== "reserver" && body.action !== "liberer") {
    return NextResponse.json({ error: "Action invalide — « reserver » ou « liberer » attendu." }, { status: 400 })
  }

  const panel = await db.adPanel.findUnique({ where: { id } })
  if (!panel) return NextResponse.json({ error: "Panneau introuvable." }, { status: 404 })

  const u = await requireSession()
  if (!u) {
    return NextResponse.json({ error: "Session requise — connectez-vous pour réserver un emplacement." }, { status: 403 })
  }

  if (body.action === "reserver") {
    // Marque bénéficiaire : l'enseigne de la session, ou celle précisée par
    // la Super Administration (prise en main / test).
    let brand = u.brandSlug ?? ""
    if (u.role === "SUPER_ADMIN") brand = (body.brand ?? "").trim().toLowerCase()
    if (!brand) {
      return NextResponse.json({ error: "Enseigne bénéficiaire indisponible (paramètre « brand » requis)." }, { status: 400 })
    }
    if (u.role !== "SUPER_ADMIN" && !MANAGER_ROLES.has(u.role)) {
      return NextResponse.json({ error: "Réservation réservée aux rôles commerciaux et de direction (ADMIN, NETWORK, COMMERCIAL, DG)." }, { status: 403 })
    }

    if (panel.statut === "LOUE") {
      return NextResponse.json({ error: `Panneau ${panel.code} engagé à l'année (${panel.reservePar ?? "tiers"}) — contactez la régie ${panel.loueur}.` }, { status: 409 })
    }
    if (panel.statut === "RESERVE" && panel.reservePar && panel.reservePar !== brand) {
      return NextResponse.json({ error: `Panneau ${panel.code} déjà réservé par une autre enseigne.` }, { status: 409 })
    }
    if (panel.statut === "RESERVE" && panel.reservePar === brand) {
      // Idempotent : déjà à nous — on renvoie l'état courant sans écrire.
      return NextResponse.json({ panel: serializePanel(panel) })
    }

    const maj = await db.adPanel.update({
      where: { id },
      data: { statut: "RESERVE", reservePar: brand },
    })

    await logAudit({
      acteur: { nom: u.name, email: u.email, role: u.role },
      module: "PORTAIL",
      action: "Panneau publicitaire réservé",
      cibleType: "ENSEIGNE",
      cibleLabel: brand,
      details: `${panel.code} · ${panel.nom} · ${panel.prixSemaine} DT/sem — ${panel.gouvernorat} (${panel.format})`,
    })

    return NextResponse.json({ panel: serializePanel(maj) })
  }

  // ---- liberer ----
  if (panel.statut === "DISPONIBLE") {
    return NextResponse.json({ panel: serializePanel(panel) })
  }
  if (panel.statut === "LOUE") {
    return NextResponse.json({ error: `Panneau ${panel.code} engagé à l'année — la libération passe par la régie ${panel.loueur}.` }, { status: 409 })
  }
  const owner = panel.reservePar ?? ""
  if (u.role !== "SUPER_ADMIN" && (u.brandSlug ?? "") !== owner) {
    return NextResponse.json({ error: "Seule l'enseigne ayant réservé ce panneau peut le libérer." }, { status: 403 })
  }

  const maj = await db.adPanel.update({
    where: { id },
    data: { statut: "DISPONIBLE", reservePar: null },
  })

  await logAudit({
    acteur: { nom: u.name, email: u.email, role: u.role },
    module: "PORTAIL",
    action: "Panneau publicitaire libéré",
    cibleType: "ENSEIGNE",
    cibleLabel: owner,
    details: `${panel.code} · ${panel.nom} — rendu disponible`,
  })

  return NextResponse.json({ panel: serializePanel(maj) })
}
