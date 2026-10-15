// Super Administration — ⑧ Support : file de tickets clients (statistiques
// comprises) + création de tickets côté équipe.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializeTicket } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

const TICKET_INCLUDE = {
  messages: { orderBy: { createdAt: "asc" as const } },
  _count: { select: { messages: true } },
} as const

export async function GET(req: Request) {
  const url = new URL(req.url)
  const statut = url.searchParams.get("statut")
  const brand = url.searchParams.get("brand")
  // KPI calculées sur l'ENSEMBLE des tickets (indépendantes des filtres de vue)
  const tous = await db.ticketSupport.findMany({ select: { statut: true, priorite: true, updatedAt: true } })
  const kpis = {
    total: tous.length,
    ouverts: tous.filter(t => t.statut === "OUVERT").length,
    enCours: tous.filter(t => t.statut === "EN_COURS" || t.statut === "EN_ATTENTE_CLIENT").length,
    resoluJour: tous.filter(t => t.statut === "RESOLU" && Date.now() - t.updatedAt.getTime() < 7 * 86400000).length,
    urgents: tous.filter(t => t.priorite === "URGENTE" && t.statut !== "FERME" && t.statut !== "RESOLU").length,
  }
  let tickets = await db.ticketSupport.findMany({ include: TICKET_INCLUDE, orderBy: { updatedAt: "desc" } })
  if (statut) tickets = tickets.filter(t => t.statut === statut)
  if (brand) tickets = tickets.filter(t => t.brandSlug === brand)
  return NextResponse.json({ tickets: tickets.map(serializeTicket), kpis })
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    brandSlug?: string; demandeur?: string; sujet?: string; priorite?: string; message?: string
  }
  if (!body.brandSlug || !body.demandeur || !body.sujet || !body.message) {
    return NextResponse.json({ error: "brandSlug, demandeur, sujet et message requis." }, { status: 400 })
  }
  const priorite = ["BASSE", "NORMALE", "HAUTE", "URGENTE"].includes(body.priorite ?? "") ? body.priorite! : "NORMALE"
  const count = await db.ticketSupport.count()
  const t = await db.ticketSupport.create({
    data: {
      numero: `TCK-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
      brandSlug: body.brandSlug, demandeur: body.demandeur.slice(0, 120),
      sujet: body.sujet.slice(0, 160), priorite, statut: "OUVERT",
      messages: { create: { auteur: body.demandeur.slice(0, 60), estStaff: false, contenu: body.message.slice(0, 3000) } },
    },
    include: TICKET_INCLUDE,
  })
  await logAudit({
    module: "SUPPORT",
    action: "Ticket créé",
    cibleType: "TICKET",
    cibleLabel: t.numero,
    details: `${body.sujet} — priorité ${priorite}.`,
  })
  return NextResponse.json({ ticket: serializeTicket(t) }, { status: 201 })
}
