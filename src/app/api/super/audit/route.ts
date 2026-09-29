import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { serializeAudit, logAudit } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

// T52-R3 : « SECURITE » ajouté — les connexions et réinitialisations 2FA sont
// journalisées avec ce kind (ancien logAudit de sa-server.ts) mais n'étaient pas
// filtrables : 11 événements invisibles des chips.
const KINDS = ["AUTH", "CONTRAT", "FACTURE", "UTILISATEUR", "IMPERSONATION", "SECURITE", "SYSTEME", "AGENT_IA", "DEMOGRAPHIE"]

// GET /api/super/audit?page=&pageSize=&kind=&q= — journal d'audit paginé (plus
// récent d'abord). page ≥ 1 (défaut 1), pageSize 1..100 (défaut 8), kind
// optionnel (filtre par type d'action), q optionnel (recherche texte libre sur
// le message et l'acteur, insensible à la casse — T52-R3). Répond
// {events, total, page, pageSize} (+ kindCounts : totaux par type sur TOUT le
// journal, pour les compteurs des chips, indépendamment des filtres actifs).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const page = Math.max(parseInt(sp.get("page") ?? "1", 10) || 1, 1)
  const pageSize = Math.min(Math.max(parseInt(sp.get("pageSize") ?? "8", 10) || 8, 1), 100)
  const kindRaw = sp.get("kind")
  const kind = kindRaw && kindRaw !== "TOUT" && KINDS.includes(kindRaw) ? kindRaw : undefined
  const q = sp.get("q")?.trim().slice(0, 80) ?? ""

  // Recherche texte (message + acteur, accents/casse neutralisés côté SQL via
  // contains insensible) combinée au filtre par type.
  const where = kind || q
    ? {
        ...(kind ? { kind } : {}),
        ...(q
          ? {
              OR: [
                { message: { contains: q } },
                { actor: { contains: q } },
              ],
            }
          : {}),
      }
    : {}
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
