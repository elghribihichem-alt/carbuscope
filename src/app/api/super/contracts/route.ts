import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializeContract } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

/** Format montants pour l'audit : « 1 690 » / « 2 450,5 » */
function fmtAuditAmount(v: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(v)
}

/** Format date pour l'audit : « 15 janv. 2026 » */
function fmtAuditDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

// GET /api/super/contracts — contrats SaaS avec statistiques de facturation.
export async function GET() {
  const [contracts, brandCounts] = await Promise.all([
    db.saasContract.findMany({ include: { invoices: true }, orderBy: { renewsAt: "asc" } }),
    db.brand.findMany({ include: { _count: { select: { stations: true } } } }),
  ])
  const stationBySlug = new Map(brandCounts.map(b => [b.slug, b._count.stations]))
  return NextResponse.json({
    contracts: contracts.map(c => serializeContract(c, stationBySlug.get(c.brandSlug) ?? 0)),
  })
}

// POST /api/super/contracts — création d'un contrat (nouveau client).
// Le contrat démarre au statut ESSAI, renouvellement par défaut à J+30.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }

  const brandSlug = typeof body.brandSlug === "string" ? body.brandSlug.trim() : ""
  const plan = typeof body.plan === "string" ? body.plan.trim().toUpperCase() : ""
  if (!brandSlug) {
    return NextResponse.json({ error: "Enseigne requise (brandSlug)" }, { status: 400 })
  }

  if (typeof body.monthlyFee !== "number" || !Number.isFinite(body.monthlyFee) || body.monthlyFee < 1 || body.monthlyFee > 100000) {
    return NextResponse.json(
      { error: "Tarif mensuel invalide — nombre entre 1 et 100 000 DT" },
      { status: 400 }
    )
  }
  if (typeof body.seats !== "number" || !Number.isInteger(body.seats) || body.seats < 1 || body.seats > 500) {
    return NextResponse.json(
      { error: "Nombre de sièges invalide — entier entre 1 et 500" },
      { status: 400 }
    )
  }
  if (typeof body.stationQuota !== "number" || !Number.isInteger(body.stationQuota) || body.stationQuota < 1 || body.stationQuota > 5000) {
    return NextResponse.json(
      { error: "Quota de stations invalide — entier entre 1 et 5 000" },
      { status: 400 }
    )
  }
  if (body.renewsAt !== undefined && body.renewsAt !== null && body.renewsAt !== "" &&
    (typeof body.renewsAt !== "string" || Number.isNaN(Date.parse(body.renewsAt)))) {
    return NextResponse.json(
      { error: "Date de renouvellement invalide (date ISO attendue)" },
      { status: 400 }
    )
  }
  const contactName = typeof body.contactName === "string" ? body.contactName.trim() : ""
  const contactEmail = typeof body.contactEmail === "string" ? body.contactEmail.trim() : ""
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return NextResponse.json({ error: "Adresse e-mail de contact invalide" }, { status: 400 })
  }

  const brand = await db.brand.findUnique({
    where: { slug: brandSlug },
    include: { _count: { select: { stations: true } } },
  })
  if (!brand) {
    return NextResponse.json({ error: "Enseigne introuvable" }, { status: 404 })
  }

  const existing = await db.saasContract.findUnique({ where: { brandSlug } })
  if (existing) {
    return NextResponse.json(
      { error: "Un contrat existe déjà pour cette enseigne" },
      { status: 409 }
    )
  }

  const planRow = await db.saasPlan.findUnique({ where: { code: plan } })
  if (!planRow || !planRow.active) {
    return NextResponse.json(
      { error: "Plan inconnu ou inactif dans le catalogue (ESSENTIEL | PRO | ENTERPRISE)" },
      { status: 400 }
    )
  }

  const renewsAt = body.renewsAt
    ? new Date(String(body.renewsAt))
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  const contract = await db.saasContract.create({
    data: {
      brandSlug,
      brandName: brand.name,
      color: brand.color,
      plan,
      status: "ESSAI",
      renewsAt,
      monthlyFee: body.monthlyFee,
      seats: body.seats,
      stationQuota: body.stationQuota,
      contactName: contactName || brand.name,
      contactEmail,
    },
    include: { invoices: true },
  })

  await logAudit({
    kind: "CONTRAT",
    message: `Contrat créé : ${brand.name} — plan ${plan}, ${fmtAuditAmount(body.monthlyFee)} DT/mois, essai jusqu'au ${fmtAuditDate(renewsAt)}`,
    actor: body?.actor,
    brandSlug,
  })

  return NextResponse.json(
    { contract: serializeContract(contract, brand._count.stations) },
    { status: 201 }
  )
}
