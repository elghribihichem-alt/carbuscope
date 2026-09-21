// V7 — GET /api/auth/accounts : comptes de DÉMONSTRATION (écran de connexion
// et changeur de compte). Le mot de passe démo « carbuscope » est public et
// documenté sur l'écran de connexion — aucun secret ne transite ici.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { DemoAccount } from "@/lib/types"

export const dynamic = "force-dynamic"

// Sélection pédagogique : éditeur, personnel plateforme, un admin par enseigne
// cliente + un observateur (rôle limité).
const CURATED = [
  "super.admin@carbuscope.tn",
  "hichem.jaziri@carbuscope.tn",
  "ops@carbuscope.tn",
  "finance@carbuscope.tn",
  "admin@agil.tn",
  "reseau@agil.tn",
  "observateur@agil.tn",
  "admin@totalenergies.tn",
  "admin@shell.tn",
  "admin@staroil.tn",
  "admin@ola.tn",
]

export async function GET() {
  const [users, brands] = await Promise.all([
    db.user.findMany({
      where: { email: { in: CURATED }, active: true },
      select: { email: true, name: true, role: true, brandSlug: true, totpEnabled: true },
    }),
    db.brand.findMany({ select: { slug: true, name: true } }),
  ])
  const brandName = new Map(brands.map(b => [b.slug, b.name]))
  const ordre = new Map(CURATED.map((e, i) => [e, i]))
  const comptes: DemoAccount[] = users
    .map(u => ({
      name: u.name, email: u.email, role: u.role,
      brandSlug: u.brandSlug,
      brandName: u.brandSlug ? brandName.get(u.brandSlug) ?? u.brandSlug : null,
      totpEnabled: u.totpEnabled,
    }))
    .sort((a, b) => (ordre.get(a.email) ?? 99) - (ordre.get(b.email) ?? 99))
  return NextResponse.json({ comptes }, { headers: { "Cache-Control": "no-store" } })
}
