// V7 — GET /api/auth/accounts : comptes de DÉMONSTRATION (écran de connexion
// et changeur de compte). Le mot de passe démo « carbuscope » est public et
// documenté sur l'écran de connexion — aucun secret ne transite ici.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { DemoAccount } from "@/lib/types"

export const dynamic = "force-dynamic"

// T50 — sélection alignée sur la gouvernance : la racine Super Admin, le DG
// Agil, un admin par enseigne cliente (Star Oil incluse) + profils variés.
// Les comptes du personnel plateforme hors enseigne ont été purgés.
const CURATED = [
  "rania.feki@carbuscope.tn",
  "tarek.mabrouk@agil.tn",
  "sonia.beji@agil.tn",
  "nadia.haddad@agil.tn",
  "karim.trabelsi@shell.tn",
  "mehdi.gharbi@ola.tn",
  "leila.mansour@totalenergies.tn",
  "anis.ferjani@staroil.tn",
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
