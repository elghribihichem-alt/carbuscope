// V7 — Authentification réelle CarbuScope : sessions signées HMAC-SHA256
// (cookie httpOnly), vérification bcrypt, TOTP 2FA (RFC 6238, implémenté sur
// crypto natif — zéro dépendance), rate limit anti-force-brute. Server-only —
// JAMAIS importé côté client.
// Les API « données » restent ouvertes en démonstration (convention du projet) ;
// cette lib protège les sessions, le 2FA et les mutations d'authentification.

import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import { cookies } from "next/headers"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import type { SessionUser } from "@/lib/types"

export const SESSION_COOKIE = "cs_session"
export const SESSION_TTL_S = 12 * 3600 // 12 h

const SECRET = process.env.AUTH_SECRET || "carbuscope-dev-secret-v7"

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

// ---------- TOTP (2FA) — RFC 6238 sur HMAC-SHA1, fenêtre de 30 s ----------

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/=+$/, "").replace(/[^A-Z2-7]/g, "")
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** Code TOTP pour un compteur de fenêtres donné (RFC 6238, 6 chiffres). */
function totpAt(secret: string, counter: number): string {
  const key = base32Decode(secret)
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac("sha1", key).update(msg).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const code =
    (((digest[offset] & 0x7f) << 24) |
      (digest[offset + 1] << 16) |
      (digest[offset + 2] << 8) |
      digest[offset + 3]) %
    1_000_000
  return code.toString().padStart(6, "0")
}

const currentWindow = () => Math.floor(Date.now() / 1000 / 30)

export function newTotpSecret(): string {
  // 20 octets aléatoires → 32 caractères base32 (standard Google Authenticator)
  return base32Encode(randomBytes(20))
}

export function totpUriFor(email: string, secret: string): string {
  return `otpauth://totp/${encodeURIComponent(`CarbuScope:${email}`)}?secret=${secret}&issuer=CarbuScope&algorithm=SHA1&digits=6&period=30`
}

/** Tolérance ±1 fenêtre (30 s) de chaque côté — comme les apps d'authentification. */
export function checkTotp(secret: string, token: string): boolean {
  const clean = token.replace(/\s+/g, "")
  if (!/^\d{6}$/.test(clean) || !secret) return false
  const w = currentWindow()
  for (const c of [w - 1, w, w + 1]) {
    const expected = totpAt(secret, c)
    if (expected.length === clean.length && timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true
  }
  return false
}

/** Génère un code TOTP valide « maintenant » (outils de QA / démo uniquement). */
export function generateTotpNow(secret: string): string {
  return totpAt(secret, currentWindow())
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
