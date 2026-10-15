// Super Administration — ⑧ Support & communication : centre d'annonces
// (bannière système globale incluse) avec diffusion et archivage audité.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializeAnnonce } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  // Mode bannière : annonces actives MAINTENANT + état maintenance (public,
  // consommé par l'en-tête de tous les espaces).
  if (url.searchParams.get("banner") === "1") {
    const now = new Date()
    const [actives, maintenanceP, maintenanceMsgP] = await Promise.all([
      db.annonce.findMany({ where: { active: true, dateDebut: { lte: now } }, orderBy: { dateDebut: "desc" } }),
      db.parametrePlateforme.findUnique({ where: { cle: "maintenance.mode" } }),
      db.parametrePlateforme.findUnique({ where: { cle: "maintenance.message" } }),
    ])
    const visibles = actives.filter(a => !a.dateFin || a.dateFin >= now)
    return NextResponse.json({
      annonces: visibles.map(serializeAnnonce),
      maintenance: { mode: maintenanceP?.valeur === "true", message: maintenanceMsgP?.valeur ?? "" },
    })
  }
  const annonces = await db.annonce.findMany({ orderBy: { dateDebut: "desc" } })
  return NextResponse.json({ annonces: annonces.map(serializeAnnonce) })
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    titre?: string; corps?: string; audience?: string; severite?: string
    dateFin?: string | null; dissmissible?: boolean; auteur?: string
  }
  if (!body.titre || !body.corps) return NextResponse.json({ error: "titre et corps requis." }, { status: 400 })
  const audience = ["TOUTES", "ENSEIGNES", "B2C", "B2B"].includes(body.audience ?? "") ? body.audience! : "TOUTES"
  const severite = ["INFO", "ATTENTION", "CRITIQUE"].includes(body.severite ?? "") ? body.severite! : "INFO"
  const a = await db.annonce.create({
    data: {
      titre: body.titre.slice(0, 120), corps: body.corps.slice(0, 2000),
      audience, severite,
      dateDebut: new Date(), dateFin: body.dateFin ? new Date(body.dateFin) : null,
      active: true, dissmissible: body.dissmissible ?? true,
      auteur: body.auteur?.slice(0, 80) ?? "Nadia Ben Amor",
    },
  })
  await logAudit({
    module: "SUPPORT",
    action: "Annonce diffusée",
    cibleType: "ANNONCE",
    cibleLabel: body.titre,
    severite: severite === "CRITIQUE" ? "SENSIBLE" : "NORMALE",
    details: `Audience ${audience} — sévérité ${severite}.`,
  })
  return NextResponse.json({ annonce: serializeAnnonce(a) }, { status: 201 })
}

export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  const body = (await req.json().catch(() => ({}))) as { active?: boolean }
  if (!id) return NextResponse.json({ error: "Paramètre id manquant." }, { status: 400 })
  const a = await db.annonce.findUnique({ where: { id } })
  if (!a) return NextResponse.json({ error: "Annonce introuvable." }, { status: 404 })
  const active = body.active ?? !a.active
  const maj = await db.annonce.update({ where: { id }, data: { active } })
  await logAudit({
    module: "SUPPORT",
    action: active ? "Annonce réactivée" : "Annonce archivée",
    cibleType: "ANNONCE",
    cibleLabel: a.titre,
  })
  return NextResponse.json({ annonce: serializeAnnonce(maj) })
}
