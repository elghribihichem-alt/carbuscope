// Super Administration — ⑧ Support : fiche ticket (fil de discussion),
// réponse staff, changement de statut / priorité / attribution — audité.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializeTicket } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

const TICKET_INCLUDE = {
  messages: { orderBy: { createdAt: "asc" as const } },
  _count: { select: { messages: true } },
} as const

type Params = { params: Promise<{ id: string }> }

async function getTicket(idOrNumero: string) {
  return (await db.ticketSupport.findUnique({ where: { id: idOrNumero }, include: TICKET_INCLUDE }))
    ?? db.ticketSupport.findUnique({ where: { numero: idOrNumero }, include: TICKET_INCLUDE })
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const t = await getTicket(id)
  if (!t) return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 })
  return NextResponse.json({ ticket: serializeTicket(t) })
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { contenu?: string; auteur?: string }
  const t = await getTicket(id)
  if (!t) return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 })
  if (!body.contenu?.trim()) return NextResponse.json({ error: "contenu requis." }, { status: 400 })
  const auteur = body.auteur?.slice(0, 60) ?? "Nadia Ben Amor (CarbuScope)"
  await db.ticketMessage.create({ data: { ticketId: t.id, auteur, estStaff: true, contenu: body.contenu.slice(0, 3000) } })
  const data: Record<string, unknown> = { updatedAt: new Date() }
  if (t.statut === "OUVERT") data.statut = "EN_COURS"
  if (t.statut === "EN_ATTENTE_CLIENT") data.statut = "EN_COURS"
  const maj = await db.ticketSupport.update({ where: { id: t.id }, data, include: TICKET_INCLUDE })
  await logAudit({
    module: "SUPPORT",
    action: "Réponse staff envoyée",
    cibleType: "TICKET",
    cibleLabel: t.numero,
    details: `Première réponse : ${body.contenu.slice(0, 90)}…`,
  })
  return NextResponse.json({ ticket: serializeTicket(maj) })
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { statut?: string; priorite?: string; assigneA?: string | null }
  const t = await getTicket(id)
  if (!t) return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 })

  const data: Record<string, unknown> = { updatedAt: new Date() }
  if (body.statut) {
    if (!["OUVERT", "EN_COURS", "EN_ATTENTE_CLIENT", "RESOLU", "FERME"].includes(body.statut)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 })
    }
    data.statut = body.statut
  }
  if (body.priorite) {
    if (!["BASSE", "NORMALE", "HAUTE", "URGENTE"].includes(body.priorite)) {
      return NextResponse.json({ error: "Priorité invalide." }, { status: 400 })
    }
    data.priorite = body.priorite
  }
  if (body.assigneA !== undefined) data.assigneA = body.assigneA?.slice(0, 60) ?? null

  const maj = await db.ticketSupport.update({ where: { id: t.id }, data, include: TICKET_INCLUDE })
  await logAudit({
    module: "SUPPORT",
    action: body.statut ? `Ticket ${body.statut === "RESOLU" || body.statut === "FERME" ? "clôturé" : "mis à jour"}` : "Ticket réorienté",
    cibleType: "TICKET",
    cibleLabel: t.numero,
    details: [body.statut && `statut : ${t.statut} → ${body.statut}`, body.priorite && `priorité : ${t.priorite} → ${body.priorite}`, body.assigneA !== undefined && `assigné à : ${body.assigneA ?? "—"}`].filter(Boolean).join(" · "),
  })
  return NextResponse.json({ ticket: serializeTicket(maj) })
}
