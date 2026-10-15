// Super Administration — ② Abonnements stations : liste filtrable, changement
// de formule (mensuel 40 DT / annuel 400 DT) et suspension, audités.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializeAbonnement } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const brand = url.searchParams.get("brand")
  const statut = url.searchParams.get("statut")
  const periodicite = url.searchParams.get("periodicite")
  const q = url.searchParams.get("q")?.toLowerCase()
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 800), 2000)

  const where: Record<string, unknown> = {}
  if (brand) where.brandSlug = brand
  if (statut) where.statut = statut
  if (periodicite) where.periodicite = periodicite
  if (q) where.OR = [{ stationCode: { contains: q } }, { stationNom: { contains: q } }]

  const abonnements = await db.abonnementStation.findMany({ where, orderBy: [{ brandSlug: "asc" }, { stationCode: "asc" }], take: limit })
  const total = await db.abonnementStation.count({ where: where as never })
  return NextResponse.json({ abonnements: abonnements.map(serializeAbonnement), total })
}

export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  const body = (await req.json().catch(() => ({}))) as { periodicite?: string; statut?: string }
  if (!id) return NextResponse.json({ error: "Paramètre id manquant." }, { status: 400 })
  const ab = await db.abonnementStation.findUnique({ where: { id } })
  if (!ab) return NextResponse.json({ error: "Abonnement introuvable." }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.periodicite) {
    if (body.periodicite !== "MENSUEL" && body.periodicite !== "ANNUEL") {
      return NextResponse.json({ error: "Périodicité invalide (MENSUEL | ANNUEL)." }, { status: 400 })
    }
    data.periodicite = body.periodicite
    data.prixMillimes = body.periodicite === "ANNUEL" ? 400_000 : 40_000
  }
  if (body.statut) {
    if (!["ACTIF", "SUSPENDU", "RESILIE"].includes(body.statut)) {
      return NextResponse.json({ error: "Statut invalide (ACTIF | SUSPENDU | RESILIE)." }, { status: 400 })
    }
    data.statut = body.statut
    if (body.statut === "RESILIE") data.dateFin = new Date()
    if (body.statut === "ACTIF") data.dateFin = null
  }
  const maj = await db.abonnementStation.update({ where: { id }, data })
  await logAudit({
    module: "FACTURATION",
    action: [body.periodicite && `formule → ${body.periodicite}`, body.statut && `statut → ${body.statut}`].filter(Boolean).join(" · ") || "mise à jour",
    cibleType: "ABONNEMENT",
    cibleLabel: `${ab.brandSlug} / ${ab.stationCode}`,
    severite: "NORMALE",
    details: `Station ${ab.stationNom} — tarif recalculé à la prochaine échéance.`,
  })
  return NextResponse.json({ abonnement: serializeAbonnement(maj) })
}
