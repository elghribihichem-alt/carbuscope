// CarbuScope — T58 — /api/pub/supports : inventaire des supports
// publicitaires des RÉGIES EXTERNES du module « Publicité » (listing par
// mode : Cartographie / RFR / Metro / Urbain — données fictives du seed).
//   · GET (session requise — 401 FR sinon) : renvoie { supports } SÉRIALISÉS
//     COMPLÈTEMENT (toutes les données attributaires + CPM dérivé). Le
//     référentiel des régies est COMMUN à toutes les enseignes (c'est le
//     terrain : ce qui existe chez les régies), donc aucun scopage marque —
//     la Super Administration voit l'intégralité (surveillance).
//   · Rôles : miroir du gating sidebar PUB_MODULE_ROLES (ADMIN, COMMERCIAL,
//     DG) + SUPER_ADMIN — 403 FR sinon.
//   · Tri : mode puis gouvernorat puis code (stable pour la table imbriquée).
// Route STRICTEMENT additive — aucune table ni route existante touchée.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { PUB_MODULE_ROLES } from "@/store/app-store"

export const dynamic = "force-dynamic"

/** Rôles autorisés à lire le listing (sidebar + SA — miroir pattern média). */
const PUB_READ_ROLES: ReadonlySet<string> = new Set([
  ...PUB_MODULE_ROLES,
  "SUPER_ADMIN",
])

/** Sérialisation complète + CPM dérivé (DT pour 1 000 contacts/mois). */
function serializeSupport(s: {
  id: string
  code: string
  mode: string
  name: string
  supportType: string
  format: string
  surfaceM2: number
  orientation: string
  eclairage: string
  regie: string
  gouvernorat: string
  delegation: string
  lieu: string
  lat: number
  lng: number
  environnement: string
  visibilite: number
  traficVehJ: number
  fluxPietonsJ: number
  contactsJ: number
  coutMensuel: number
  dureeMinMois: number
  statut: string
  etat: string
  dernierControle: Date | null
  notes: string | null
}) {
  const cpm = s.contactsJ > 0 ? s.coutMensuel / ((s.contactsJ * 30.4) / 1000) : null
  return { ...s, cpm: cpm === null ? null : Math.round(cpm * 10) / 10 }
}

export async function GET() {
  // 1) Session (401 FR — pattern radar/_lib, media/panels).
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json(
      { error: "Connexion requise — le module Publicité est un espace interne enseigne." },
      { status: 401 },
    )
  }

  // 2) Rôle (403 FR — miroir du gating sidebar PUB_MODULE_ROLES).
  if (!PUB_READ_ROLES.has(session.role)) {
    return NextResponse.json(
      { error: "Accès réservé aux rôles ADMIN, COMMERCIAL et DG (module Publicité)." },
      { status: 403 },
    )
  }

  // 3) Référentiel commun des régies : AUCUN scopage marque (le terrain
  //    appartient aux régies — toute enseigne voit ce qui existe).
  const supports = await db.adSupport.findMany({
    orderBy: [{ mode: "asc" }, { gouvernorat: "asc" }, { code: "asc" }],
  })

  return NextResponse.json({ supports: supports.map(serializeSupport), generatedAt: new Date().toISOString() })
}
