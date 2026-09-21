import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeAudit, logAudit } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

const KINDS = ["AUTH", "CONTRAT", "FACTURE", "UTILISATEUR", "IMPERSONATION", "SYSTEME", "AGENT_IA", "DEMOGRAPHIE"]

// GET /api/super/audit?page=&pageSize=&kind= — journal d'audit paginé (plus
// récent d'abord). page ≥ 1 (défaut 1), pageSize 1..100 (défaut 8), kind
// optionnel (filtre par type d'action). Répond {events, total, page, pageSize}
// (+ kindCounts : totaux par type, pour les compteurs des filtres existants).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const page = Math.max(parseInt(sp.get("page") ?? "1", 10) || 1, 1)
  const pageSize = Math.min(Math.max(parseInt(sp.get("pageSize") ?? "8", 10) || 8, 1), 100)
  const kindRaw = sp.get("kind")
  const kind = kindRaw && kindRaw !== "TOUT" && KINDS.includes(kindRaw) ? kindRaw : undefined

  const where = kind ? { kind } : {}
  const [events, total, all] = await Promise.all([
    db.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({ select: { kind: true } }),
  ])

  const kindCounts: Record<string, number> = {}
  all.forEach(e => { kindCounts[e.kind] = (kindCounts[e.kind] ?? 0) + 1 })
  kindCounts.TOUT = all.length

  return NextResponse.json({
    events: events.map(serializeAudit),
    total,
    page,
    pageSize,
    kindCounts,
  })
}

// POST /api/super/audit — journalise un événement (ex. prise de main).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.kind || !body?.message) {
    return NextResponse.json({ error: "Champs « kind » et « message » requis" }, { status: 400 })
  }
  try {
    const event = await logAudit({
      kind: body.kind,
      message: body.message,
      actor: body.actor,
      brandSlug: body.brandSlug ?? null,
    })
    return NextResponse.json({ event: serializeAudit(event) }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inconnue" }, { status: 400 })
  }
}
