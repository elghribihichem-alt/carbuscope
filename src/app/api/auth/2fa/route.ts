// V7 — /api/auth/2fa : gestion réelle de la double authentification TOTP.
//   POST   → génère un secret + QR (exige une session, non encore activée)
//   PUT    { code } → vérifie le code et ACTIVE la 2FA
//   DELETE { code } → vérifie le code et DÉSACTIVE la 2FA
// Le secret est stocké côté serveur (totpSecret) dès la génération, mais la
// 2FA ne s'applique qu'une fois totpEnabled=true (code vérifié).

import { NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"
import { db } from "@/lib/db"
import { auditAuth, checkTotp, getSessionUser, newTotpSecret, totpUriFor } from "@/lib/auth"
import { spacesForUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

const sessionUser = () => getSessionUser()

export async function POST() {
  const me = await sessionUser()
  if (!me) return NextResponse.json({ error: "Session expirée — reconnectez-vous." }, { status: 401 })

  const u = await db.user.findUnique({ where: { id: me.id } })
  if (!u) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 })
  if (u.totpEnabled) {
    return NextResponse.json(
      { error: "La double authentification est déjà activée sur ce compte." },
      { status: 409 },
    )
  }

  const secret = newTotpSecret()
  await db.user.update({ where: { id: u.id }, data: { totpSecret: secret, totpEnabled: false } })
  const uri = totpUriFor(u.email, secret)
  const qrDataUrl = await QRCode.toDataURL(uri, { width: 220, margin: 1 })

  await auditAuth({ name: u.name, email: u.email, role: u.role },
    "Configuration 2FA démarrée", "Génération du secret TOTP + QR", "NORMALE")

  return NextResponse.json({ secret, uri, qrDataUrl })
}

export async function PUT(req: NextRequest) {
  const me = await sessionUser()
  if (!me) return NextResponse.json({ error: "Session expirée — reconnectez-vous." }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { code?: string }
  const code = (body.code ?? "").trim()

  const u = await db.user.findUnique({ where: { id: me.id } })
  if (!u) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 })
  if (u.totpEnabled) {
    return NextResponse.json({ error: "La double authentification est déjà activée." }, { status: 409 })
  }
  if (!u.totpSecret) {
    return NextResponse.json(
      { error: "Aucune configuration en cours — cliquez d'abord sur « Activer la 2FA » pour générer le QR code." },
      { status: 400 },
    )
  }
  if (!code) return NextResponse.json({ error: "Code de vérification obligatoire (6 chiffres)." }, { status: 400 })

  const ok = await checkTotp(u.totpSecret, code)
  if (!ok) {
    return NextResponse.json(
      { error: "Code invalide — vérifiez que l'heure de votre application d'authentification est à jour, puis rejetez le code." },
      { status: 401 },
    )
  }

  await db.user.update({ where: { id: u.id }, data: { totpEnabled: true } })
  await auditAuth({ name: u.name, email: u.email, role: u.role },
    "2FA activée", "TOTP vérifié avec succès — la connexion exigera désormais un code à 6 chiffres", "SENSIBLE")

  return NextResponse.json({
    user: {
      id: u.id, email: u.email, name: u.name, role: u.role,
      brandSlug: u.brandSlug, brandName: me.brandName, totpEnabled: true,
      spaces: spacesForUser(u.role, u.brandSlug),
    },
  })
}

export async function DELETE(req: NextRequest) {
  const me = await sessionUser()
  if (!me) return NextResponse.json({ error: "Session expirée — reconnectez-vous." }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { code?: string }
  const code = (body.code ?? "").trim()

  const u = await db.user.findUnique({ where: { id: me.id } })
  if (!u) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 })
  if (!u.totpEnabled) {
    // rien à désactiver — on nettoie un éventuel secret orphelin
    await db.user.update({ where: { id: u.id }, data: { totpSecret: null, totpEnabled: false } })
    return NextResponse.json({ ok: true, alreadyOff: true })
  }
  if (!code) return NextResponse.json({ error: "Code de vérification obligatoire pour désactiver la 2FA." }, { status: 400 })

  const ok = await checkTotp(u.totpSecret ?? "", code)
  if (!ok) {
    return NextResponse.json({ error: "Code invalide — la désactivation est refusée." }, { status: 401 })
  }

  await db.user.update({ where: { id: u.id }, data: { totpSecret: null, totpEnabled: false } })
  await auditAuth({ name: u.name, email: u.email, role: u.role },
    "2FA désactivée", "Code TOTP vérifié — secret supprimé", "SENSIBLE")

  return NextResponse.json({
    user: {
      id: u.id, email: u.email, name: u.name, role: u.role,
      brandSlug: u.brandSlug, brandName: me.brandName, totpEnabled: false,
      spaces: spacesForUser(u.role, u.brandSlug),
    },
  })
}
