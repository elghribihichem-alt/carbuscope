// Super Administration — ⑥ Clés API : génération (masquée à l'affichage),
// révocation, régénération du compteur d'appels — audité.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializeCle } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

const HEX = "0123456789abcdef"
function token(len: number) {
  let s = ""
  for (let i = 0; i < len; i++) s += HEX[Math.floor(Math.random() * 16)]
  return s
}

export async function GET() {
  const cles = await db.cleApi.findMany({ orderBy: { createdAt: "desc" } })
  return NextResponse.json({
    cles: cles.map(serializeCle),
    stats: {
      actives: cles.filter(c => c.active).length,
      appelsTotal: cles.reduce((s, c) => s + c.nbAppels, 0),
    },
  })
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { label?: string; brandSlug?: string | null; scopes?: string }
  if (!body.label) return NextResponse.json({ error: "label requis." }, { status: 400 })
  const scopes = body.scopes === "lecture+ecriture" ? "lecture+ecriture" : "lecture"
  if (body.brandSlug) {
    const brand = await db.brand.findUnique({ where: { slug: body.brandSlug } })
    if (!brand) return NextResponse.json({ error: "Enseigne inconnue." }, { status: 400 })
  }
  const suffixe = token(4)
  const prefixe = body.brandSlug ? `cs_${body.brandSlug.slice(0, 6)}_` : "cs_admin_"
  const c = await db.cleApi.create({
    data: {
      label: body.label.slice(0, 80),
      prefixe,
      cleMasquee: `${prefixe}••••••••${suffixe}`,
      brandSlug: body.brandSlug ?? null,
      scopes,
      active: true,
    },
  })
  await logAudit({
    module: "SECURITE",
    action: "Clé API générée",
    cibleType: "CLE_API",
    cibleLabel: c.cleMasquee,
    severite: "SENSIBLE",
    details: `${body.label} — portée ${scopes}${body.brandSlug ? ` — enseigne ${body.brandSlug}` : " — plateforme"}.`,
  })
  return NextResponse.json({ cle: serializeCle(c) }, { status: 201 })
}

export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Paramètre id manquant." }, { status: 400 })
  const c = await db.cleApi.findUnique({ where: { id } })
  if (!c) return NextResponse.json({ error: "Clé introuvable." }, { status: 404 })
  const maj = await db.cleApi.update({ where: { id }, data: { active: !c.active } })
  await logAudit({
    module: "SECURITE",
    action: c.active ? "Clé API révoquée" : "Clé API réactivée",
    cibleType: "CLE_API",
    cibleLabel: c.cleMasquee,
    severite: "SENSIBLE",
  })
  return NextResponse.json({ cle: serializeCle(maj) })
}
