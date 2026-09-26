// Super Administration — ③ Comptes & personnel : vue consolidée par enseigne,
// onboarding de nouveaux comptes, activation/désactivation et rôles, audités.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializeCompte } from "@/lib/sa-server"
import { hashPassword } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  const [users, brands, saasSlugs] = await Promise.all([
    db.user.findMany({ orderBy: [{ brandSlug: "asc" }, { createdAt: "asc" }] }),
    db.brand.findMany({ select: { slug: true, name: true } }),
    db.saasContract.findMany({ select: { brandSlug: true, status: true } }),
  ])
  const brandName = new Map(brands.map(b => [b.slug, b.name]))
  const contratsActifs = new Set(saasSlugs.filter(c => c.status === "ACTIF").map(c => c.brandSlug))
  const comptes = users.map(u => serializeCompte(u, u.brandSlug ? brandName.get(u.brandSlug) ?? u.brandSlug : "CarbuScope (éditeur)"))
  return NextResponse.json({
    comptes,
    parEnseigne: Array.from(new Set(users.map(u => u.brandSlug ?? "carbuscope"))).map(slug => {
      const list = comptes.filter(c => (c.brandSlug ?? "carbuscope") === slug)
      return {
        slug: slug === "carbuscope" ? null : slug,
        nom: slug === "carbuscope" ? "CarbuScope (équipe éditeur)" : brandName.get(slug) ?? slug,
        clientSaaS: slug === "carbuscope" ? null : contratsActifs.has(slug) ? "ACTIF" : "HORS_CONTRAT",
        total: list.length,
        actifs: list.filter(c => c.active).length,
      }
    }),
  })
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; role?: string; brandSlug?: string | null }
  if (!body.email || !body.name || !body.role) {
    return NextResponse.json({ error: "email, name et role sont requis." }, { status: 400 })
  }
  const ROLES = ["SUPER_ADMIN", "ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER"]
  if (!ROLES.includes(body.role)) return NextResponse.json({ error: `Rôle invalide (${ROLES.join(" | ")}).` }, { status: 400 })
  if (body.brandSlug) {
    const brand = await db.brand.findUnique({ where: { slug: body.brandSlug } })
    if (!brand) return NextResponse.json({ error: "Enseigne inconnue." }, { status: 400 })
  }
  const existe = await db.user.findUnique({ where: { email: body.email } })
  if (existe) return NextResponse.json({ error: "Un compte existe déjà avec cet e-mail." }, { status: 409 })
  // V7 — mot de passe de démonstration posé à la création (public : « carbuscope »),
  // à changer par l'utilisateur une l'authentification réelle en production.
  const u = await db.user.create({
    data: { email: body.email, name: body.name, role: body.role, brandSlug: body.brandSlug ?? null, active: true, passwordHash: hashPassword("carbuscope") },
  })
  await logAudit({
    module: "COMPTES",
    action: "Compte créé (onboarding)",
    cibleType: "COMPTE",
    cibleLabel: body.email,
    details: `Rôle ${body.role} — ${body.brandSlug ? `enseigne ${body.brandSlug}` : "équipe CarbuScope"}.`,
  })
  return NextResponse.json({ compte: serializeCompte(u) }, { status: 201 })
}

export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  const body = (await req.json().catch(() => ({}))) as { active?: boolean; role?: string; resetTotp?: boolean }
  if (!id) return NextResponse.json({ error: "Paramètre id manquant." }, { status: 400 })
  const u = await db.user.findUnique({ where: { id } })
  if (!u) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.active !== undefined) data.active = body.active
  if (body.role) {
    const ROLES = ["SUPER_ADMIN", "ADMIN", "NETWORK", "COMMERCIAL", "EXPANSION", "VIEWER"]
    if (!ROLES.includes(body.role)) return NextResponse.json({ error: "Rôle invalide." }, { status: 400 })
    data.role = body.role
  }
  // V7 — réinitialisation 2FA par la Super Administration (utilisateur ayant
  // perdu son téléphone : le secret TOTP est supprimé, il devra la réactiver).
  if (body.resetTotp === true) {
    if (!u.totpEnabled) return NextResponse.json({ error: "La 2FA n'est pas activée sur ce compte." }, { status: 400 })
    data.totpEnabled = false
    data.totpSecret = null
  }
  const maj = await db.user.update({ where: { id }, data })
  await logAudit({
    module: body.resetTotp === true ? "SECURITE" : "COMPTES",
    action: body.resetTotp === true ? "2FA réinitialisée (Super Administration)"
      : body.active === false ? "Compte désactivé" : body.active === true ? "Compte réactivé" : "Rôle modifié",
    cibleType: "COMPTE",
    cibleLabel: u.email,
    severite: "SENSIBLE",
    details: [
      body.active !== undefined && `actif : ${body.active}`,
      body.role && `rôle : ${u.role} → ${body.role}`,
      body.resetTotp === true && "2FA TOTP désactivée — secret supprimé",
    ].filter(Boolean).join(" · "),
  })
  return NextResponse.json({ compte: serializeCompte(maj) })
}
