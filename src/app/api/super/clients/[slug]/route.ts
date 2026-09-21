// Super Administration — ① Fiche client 360° : contrat + avenants + abonnements
// + factures + comptes + usage + piste d'audit de l'enseigne.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { agregatsContrat, serializeAbonnement, serializeAudit, serializeCompte, serializeContrat, serializeFacture } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: param } = await params
  // Le paramètre accepte le slug d'enseigne OU l'id du contrat (prospects).
  const contrat = param.startsWith("CTR-")
    ? await db.contrat.findFirst({ where: { numero: param }, include: { avenants: { orderBy: { dateEffet: "desc" } } } })
    : await db.contrat.findUnique({ where: { brandSlug: param }, include: { avenants: { orderBy: { dateEffet: "desc" } } } })
  if (!contrat) return NextResponse.json({ error: "Client introuvable." }, { status: 404 })

  const brandSlug = contrat.brandSlug
  const [ag, factures, abonnements, comptes, audit, brand] = await Promise.all([
    agregatsContrat(brandSlug),
    brandSlug
      ? db.facture.findMany({ where: { brandSlug }, orderBy: { dateEmission: "desc" }, include: { lignes: { orderBy: { ordre: "asc" } } } })
      : Promise.resolve([]),
    brandSlug
      ? db.abonnementStation.findMany({ where: { brandSlug }, orderBy: { dateDebut: "desc" } })
      : Promise.resolve([]),
    brandSlug
      ? db.user.findMany({ where: { brandSlug } , orderBy: { createdAt: "asc" } })
      : Promise.resolve([]),
    db.auditLog.findMany({
      where: brandSlug
        ? { OR: [{ cibleLabel: { contains: contrat.numero } }, { cibleLabel: { contains: brandSlug } }, { cibleLabel: { contains: contrat.nomClient.split(" (")[0] } }] }
        : { cibleLabel: { contains: contrat.numero } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    brandSlug ? db.brand.findUnique({ where: { slug: brandSlug } }) : Promise.resolve(null),
  ])

  return NextResponse.json({
    client: serializeContrat(contrat, ag),
    factures: factures.map(serializeFacture),
    abonnements: abonnements.map(serializeAbonnement),
    comptes: comptes.map(u => serializeCompte(u, brand?.name ?? null)),
    audit: audit.map(serializeAudit),
  })
}
