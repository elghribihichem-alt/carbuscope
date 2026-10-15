import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSession } from "@/lib/auth"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// T62-b — Portail enseigne / C.2.3 « API & promotions » : persistance serveur
// du cycle de vie des campagnes promotionnelles (remplace l'état local de
// démonstration T53/T61).
//
//   GET  /api/promotions?brand=agil → { promotions: PromotionDTO[] }
//   POST /api/promotions { brand, nom, debut, fin, zone, reduction } → 201 { promotion }
//
// DTO sérialisé (forme volontairement alignée sur le composant portal-promotions) :
//   { id, nom, enseigne, debut, fin, zone, reduction, suspendue, archivee, createdAt }
//   · debut/fin en « YYYY-MM-DD » ; enseigne = nom d'affichage de l'enseigne.
//
// Droits : lecture ouverte (fichage portail, filtrage par enseigne) ; création
// réservée à une session ADMIN/NETWORK de l'enseigne concernée ou SUPER_ADMIN.

const isoDay = (d: Date): string => d.toISOString().slice(0, 10)

function serializePromotion(p: { id: string; nom: string; brandSlug: string; debut: Date; fin: Date; zone: string; reduction: number; suspendue: boolean; archivee: boolean; createdAt: Date }, brandName: string) {
  return {
    id: p.id,
    nom: p.nom,
    enseigne: brandName,
    debut: isoDay(p.debut),
    fin: isoDay(p.fin),
    zone: p.zone,
    reduction: p.reduction,
    suspendue: p.suspendue,
    archivee: p.archivee,
    createdAt: p.createdAt.toISOString(),
  }
}

/** Session habilitée à muter les promotions de `brand` → l'utilisateur (ou null). */
async function managerOrNull(brand: string) {
  const u = await requireSession()
  if (!u) return null
  if (u.role === "SUPER_ADMIN") return u
  if (u.brandSlug === brand && (u.role === "ADMIN" || u.role === "NETWORK")) return u
  return null
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const brand = (req.nextUrl.searchParams.get("brand") ?? "").trim().toLowerCase()
  if (!brand) return NextResponse.json({ error: "Paramètre « brand » requis." }, { status: 400 })

  const brandRow = await db.brand.findUnique({ where: { slug: brand }, select: { name: true } })
  if (!brandRow) return NextResponse.json({ error: "Enseigne inconnue." }, { status: 404 })

  const promos = await db.promotion.findMany({
    where: { brandSlug: brand },
    orderBy: [{ archivee: "asc" }, { createdAt: "desc" }],
  })

  return NextResponse.json({
    promotions: promos.map(p => serializePromotion(p, brandRow.name)),
    total: promos.length,
  })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    brand?: string; nom?: string; debut?: string; fin?: string; zone?: string; reduction?: number | string
  }
  const brand = (body.brand ?? "").trim().toLowerCase()
  const nom = (body.nom ?? "").trim()
  const zone = (body.zone ?? "").trim()
  const reduction = Number(body.reduction)

  // ---- Validation (règles identiques au dialogue de création du portail) ----
  if (!brand) return NextResponse.json({ error: "Paramètre « brand » requis." }, { status: 400 })
  if (!nom) return NextResponse.json({ error: "Le nom de la promotion est obligatoire." }, { status: 400 })
  if (nom.length > 120) return NextResponse.json({ error: "Nom trop long (120 caractères maximum)." }, { status: 400 })
  if (!DAY_RE.test(body.debut ?? "") || !DAY_RE.test(body.fin ?? "")) {
    return NextResponse.json({ error: "Dates invalides — format attendu AAAA-MM-JJ." }, { status: 400 })
  }
  const debut = body.debut!
  const fin = body.fin!
  if (new Date(fin) < new Date(debut)) {
    return NextResponse.json({ error: "Période invalide — la fin doit suivre le début." }, { status: 400 })
  }
  if (!Number.isFinite(reduction) || !Number.isInteger(reduction) || reduction < 1 || reduction > 100) {
    return NextResponse.json({ error: "La réduction doit être un pourcentage entier entre 1 et 100." }, { status: 400 })
  }
  if (!zone || zone.length > 80) return NextResponse.json({ error: "Zone invalide (80 caractères maximum)." }, { status: 400 })

  const brandRow = await db.brand.findUnique({ where: { slug: brand }, select: { name: true } })
  if (!brandRow) return NextResponse.json({ error: "Enseigne inconnue." }, { status: 404 })

  const u = await managerOrNull(brand)
  if (!u) {
    return NextResponse.json({ error: "Action réservée aux gestionnaires de l'enseigne (session requise)." }, { status: 403 })
  }

  const p = await db.promotion.create({
    data: { nom, brandSlug: brand, debut: new Date(debut), fin: new Date(fin), zone, reduction },
  })

  await logAudit({
    acteur: { nom: u.name, email: u.email, role: u.role },
    module: "PORTAIL",
    action: "Promotion créée",
    cibleType: "ENSEIGNE",
    cibleLabel: brandRow.name,
    details: `« ${nom} » — ${debut} → ${fin} · ${zone} · −${reduction} %`,
  })

  return NextResponse.json({ promotion: serializePromotion(p, brandRow.name) }, { status: 201 })
}
