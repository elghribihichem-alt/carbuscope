// CarbuScope — Module Média (T60) : helpers partagés des routes /api/media/*.
// Chaque route passe par requireMedia() (session + contexte permissions) —
// aucune ne construit ses règles de visibilité elle-même.

import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { getMediaContext, type MediaCtx } from "@/lib/media/permissions"
import { MEDIA_CAPS } from "@/lib/media/shared"
import { db } from "@/lib/db"

export const json401 = () => NextResponse.json({ error: "Session requise — reconnectez-vous." }, { status: 401 })
export const json403 = (msg: string) => NextResponse.json({ error: msg }, { status: 403 })
export const json400 = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })
export const json404 = (msg = "Introuvable") => NextResponse.json({ error: msg }, { status: 404 })

export type MediaGuard = { ctx: MediaCtx } | { error: NextResponse }

/** Session + contexte média. Les comptes plateforme sans enseigne n'ont pas
 *  accès au module (réservé aux enseignes clientes + Super Administration). */
export async function requireMedia(req?: NextRequest): Promise<MediaGuard> {
  const user = await getSessionUser()
  if (!user) return { error: json401() }
  const ctx = await getMediaContext(user)
  if (ctx.role !== "SA" && !ctx.brandSlug) {
    return { error: json403("Le module Média est réservé aux enseignes clientes et à la Super Administration.") }
  }
  return { ctx }
}

export const capsOf = (ctx: MediaCtx) => MEDIA_CAPS[ctx.role]

/** Adresse réseau de la requête (journal d'audit). */
export function clientIp(req?: NextRequest): string {
  const fwd = req?.headers.get("x-forwarded-for")
  return (fwd?.split(",")[0]?.trim() || req?.headers.get("x-real-ip") || "127.0.0.1").slice(0, 64)
}

/** Journal d'audit INALTÉRABLE — en ajout seul. */
export async function logMediaAudit(
  ctx: MediaCtx,
  req: NextRequest | undefined,
  entry: {
    action: string
    entityType: string
    entityId?: string
    entityLabel?: string
    field?: string
    oldValue?: string
    newValue?: string
  },
): Promise<void> {
  await db.mediaAuditEntry.create({
    data: {
      actorEmail: ctx.user.email,
      actorName: ctx.user.name,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      entityLabel: entry.entityLabel ?? null,
      field: entry.field ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      ip: clientIp(req),
    },
  })
}

export function parseBool(v: string | null): boolean | undefined {
  if (v === null) return undefined
  if (v === "1" || v === "true") return true
  if (v === "0" || v === "false") return false
  return undefined
}

export function parseNum(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
