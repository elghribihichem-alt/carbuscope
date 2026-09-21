// V7 — Authentification réelle CarbuScope : sessions signées HMAC-SHA256
// (cookie httpOnly), vérification bcrypt, TOTP 2FA (otplib), rate limit
// anti-force-brute. Server-only — JAMAIS importé côté client.
// Les API « données » restent ouvertes en démonstration (convention du projet) ;
// cette lib protège les sessions, le 2FA et les mutations d'authentification.

import { createHmac, timingSafeEqual } from "crypto"
import { cookies } from "next/headers"
import bcrypt from "bcryptjs"
import { generateSecret, generateURI, verify as verifyTotp } from "otplib"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import type { SessionUser } from "@/lib/types"

export const SESSION_COOKIE = "cs_session"
export const SESSION_TTL_S = 12 * 3600 // 12 h

const SECRET = process.env.AUTH_SECRET || "carbuscope-dev-secret-v7"
const ISSUER = "CarbuScope"

// ---------- Sessions signées ----------

const sign = (data: string) => createHmac("sha256", SECRET).update(data).digest("base64url")

export function signSessionToken(uid: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid, iat: Date.now(), exp: Date.now() + SESSION_TTL_S * 1000 }),
  ).toString("base64url")
  return `${payload}.${sign(payload)}`
}

export function verifySessionToken(token: string): { uid: string } | null {
  const idx = token.lastIndexOf(".")
  if (idx <= 0) return null
  const payload = token.slice(0, idx)
  const mac = token.slice(idx + 1)
  const expected = Buffer.from(sign(payload))
  const got = Buffer.from(mac)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid?: unknown; exp?: unknown }
    if (typeof data.uid !== "string" || typeof data.exp !== "number" || data.exp < Date.now()) return null
    return { uid: data.uid }
  } catch {
    return null
  }
}

// ---------- Espaces autorisés par profil ----------

export function spacesForUser(role: string, brandSlug: string | null): string[] {
  if (role === "SUPER_ADMIN") return ["observatoire", "portail", "mobile", "backoffice", "superadmin"]
  if (brandSlug) return ["observatoire", "portail", "mobile"] // compte enseigne cliente
  return ["observatoire", "backoffice", "mobile"] // personnel plateforme (non éditeur)
}

/** Espace d'accueil après connexion, selon le profil. */
export function defaultSpaceForUser(role: string, brandSlug: string | null): string {
  if (role === "SUPER_ADMIN") return "superadmin"
  if (brandSlug) return "portail"
  return "backoffice"
}

// ---------- Lecture de session ----------

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null
  const claims = verifySessionToken(token)
  if (!claims) return null
  const u = await db.user.findUnique({ where: { id: claims.uid } })
  if (!u || !u.active) return null
  let brandName: string | null = null
  if (u.brandSlug) {
    const b = await db.brand.findUnique({ where: { slug: u.brandSlug }, select: { name: true } })
    brandName = b?.name ?? u.brandSlug
  }
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    brandSlug: u.brandSlug,
    brandName,
    totpEnabled: u.totpEnabled,
    spaces: spacesForUser(u.role, u.brandSlug),
  }
}

/** Exige une session valide — renvoie l'utilisateur ou null (route 401). */
export async function requireSession(): Promise<SessionUser | null> {
  return getSessionUser()
}

// ---------- Mots de passe ----------

export const hashPassword = (plain: string) => bcrypt.hashSync(plain, 10)
export const checkPassword = (plain: string, hash: string) => bcrypt.compareSync(plain, hash)

// ---------- TOTP (2FA) ----------

export function newTotpSecret(): string {
  return generateSecret()
}

export function totpUriFor(email: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret })
}

export async function checkTotp(secret: string, token: string): Promise<boolean> {
  const clean = token.replace(/\s+/g, "")
  if (!/^\d{6}$/.test(clean)) return false
  try {
    const res = await verifyTotp({ secret, token: clean, epochTolerance: 30 })
    return res.valid === true
  } catch {
    return false
  }
}

/** Génère un code TOTP valide « maintenant » (outils de QA / démo uniquement). */
export async function generateTotpNow(secret: string): Promise<string> {
  const { generate } = await import("otplib")
  return generate({ secret })
}

// ---------- Rate limit anti-force-brute (login) ----------

const loginAttempts = new Map<string, number[]>()
const LOGIN_WINDOW_MS = 5 * 60 * 1000
const LOGIN_MAX = 15

export function tooManyLoginAttempts(ip: string): boolean {
  const now = Date.now()
  const arr = (loginAttempts.get(ip) ?? []).filter(t => now - t < LOGIN_WINDOW_MS)
  arr.push(now)
  loginAttempts.set(ip, arr)
  if (loginAttempts.size > 500) loginAttempts.clear() // garde mémoire
  return arr.length > LOGIN_MAX
}

// ---------- Audit d'authentification ----------

export async function auditAuth(
  user: { name: string; email: string; role: string } | null,
  action: string,
  details: string,
  severite: "NORMALE" | "SENSIBLE" = "NORMALE",
  ip = "127.0.0.1",
) {
  await logAudit({
    acteur: user
      ? { nom: user.name, email: user.email, role: user.role }
      : { nom: "Visiteur non authentifié", email: "anonyme", role: "VIEWER" },
    module: "SECURITE",
    action,
    cibleType: "COMPTE",
    cibleLabel: user?.email ?? "anonyme",
    details,
    severite,
    ip,
  })
}
