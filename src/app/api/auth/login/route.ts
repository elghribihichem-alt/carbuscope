// V7 — POST /api/auth/login : authentification réelle (bcrypt) + défi 2FA TOTP.
// Corps : { email, password, code? } → { user } | { twoFactor: true } | 401/403/429.
// La session est posée en cookie httpOnly signé HMAC (12 h).

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  auditAuth, checkPassword, checkTotp, spacesForUser,
  signSessionToken, tooManyLoginAttempts, SESSION_COOKIE, SESSION_TTL_S,
} from "@/lib/auth"

export const dynamic = "force-dynamic"

const ipOf = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1"

export async function POST(req: NextRequest) {
  const ip = ipOf(req)
  if (tooManyLoginAttempts(ip)) {
    return NextResponse.json(
      { error: "Trop de tentatives de connexion — patientez quelques minutes." },
      { status: 429 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: string; password?: string; code?: string
  }
  const email = (body.email ?? "").trim().toLowerCase()
  const password = body.password ?? ""
  const code = (body.code ?? "").trim()

  if (!email || !password) {
    return NextResponse.json({ error: "E-mail et mot de passe obligatoires." }, { status: 400 })
  }

  const u = await db.user.findUnique({ where: { email } })
  // Message générique volontaire (pas de divulgation d'existence de compte)
  if (!u || !u.passwordHash || !checkPassword(password, u.passwordHash)) {
    await auditAuth(u ? { name: u.name, email: u.email, role: u.role } : null,
      "Tentative de connexion échouée", `Mot de passe incorrect · IP ${ip}`, "SENSIBLE", ip)
    return NextResponse.json({ error: "Identifiants incorrects — vérifiez votre e-mail et votre mot de passe." }, { status: 401 })
  }
  if (!u.active) {
    await auditAuth({ name: u.name, email: u.email, role: u.role },
      "Connexion refusée (compte désactivé)", `IP ${ip}`, "SENSIBLE", ip)
    return NextResponse.json(
      { error: "Ce compte est désactivé — contactez la Super Administration." },
      { status: 403 },
    )
  }

  // ---- 2FA : défi TOTP avant toute session ----
  if (u.totpEnabled && u.totpSecret) {
    if (!code) {
      // Défi : aucune session posée, le client passe à l'étape « code à 6 chiffres »
      return NextResponse.json({ twoFactor: true, email })
    }
    const ok = await checkTotp(u.totpSecret, code)
    if (!ok) {
      await auditAuth({ name: u.name, email: u.email, role: u.role },
        "Code 2FA invalide", `IP ${ip}`, "SENSIBLE", ip)
      return NextResponse.json(
        { error: "Code de vérification invalide ou expiré — rejetez-le et saisissez le code courant de votre application d'authentification." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }
  }

  let brandName: string | null = null
  if (u.brandSlug) {
    const b = await db.brand.findUnique({ where: { slug: u.brandSlug }, select: { name: true } })
    brandName = b?.name ?? u.brandSlug
  }

  const user = {
    id: u.id, email: u.email, name: u.name, role: u.role,
    brandSlug: u.brandSlug, brandName, totpEnabled: u.totpEnabled,
    spaces: spacesForUser(u.role, u.brandSlug),
  }

  await auditAuth({ name: u.name, email: u.email, role: u.role },
    "Connexion réussie", `${u.totpEnabled ? "avec 2FA · " : ""}IP ${ip}`, "NORMALE", ip)

  const res = NextResponse.json({ user })
  res.cookies.set({
    name: SESSION_COOKIE,
    value: signSessionToken(u.id),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_S,
  })
  return res
}
