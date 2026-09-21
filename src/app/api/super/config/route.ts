// Super Administration — ⑥ Configuration & référentiels : paramètres pilotables
// (flags, seuils, facturation), prix officiels en vigueur, maintenance.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializeParametre } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const cle = url.searchParams.get("cle")
  if (cle) {
    const p = await db.parametrePlateforme.findUnique({ where: { cle } })
    return NextResponse.json({ parametre: p ? serializeParametre(p) : null })
  }
  const [params, prix] = await Promise.all([
    db.parametrePlateforme.findMany({ orderBy: [{ categorie: "asc" }, { libelle: "asc" }] }),
    db.fuelPrice.findMany({ orderBy: { effectiveAt: "desc" } }),
  ])
  // Prix en vigueur = dernière entrée par carburant
  const enVigueur = new Map<string, typeof prix[number]>()
  for (const p of prix) if (!enVigueur.has(p.fuelType)) enVigueur.set(p.fuelType, p)
  return NextResponse.json({
    parametres: params.map(serializeParametre),
    prixOfficiels: Array.from(enVigueur.values()).map(p => ({
      fuelType: p.fuelType, priceMillimes: p.priceMillimes, marginMillimes: p.marginMillimes,
      effectiveAt: p.effectiveAt.toISOString(), decreeNote: p.decreeNote ?? "",
    })),
    nbDecrets: prix.length,
  })
}

export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const cle = url.searchParams.get("cle")
  const body = (await req.json().catch(() => ({}))) as { valeur?: string }
  if (!cle || body.valeur === undefined) return NextResponse.json({ error: "cle et valeur requis." }, { status: 400 })
  const p = await db.parametrePlateforme.findUnique({ where: { cle } })
  if (!p) return NextResponse.json({ error: "Paramètre inconnu." }, { status: 404 })
  if (!p.modifiable) return NextResponse.json({ error: "Paramètre verrouillé (non modifiable)." }, { status: 403 })

  // Validation de type
  if (p.type === "BOOLEEN" && !["true", "false"].includes(body.valeur)) {
    return NextResponse.json({ error: "Valeur booléenne attendue (true | false)." }, { status: 400 })
  }
  if (p.type === "NOMBRE" && Number.isNaN(Number(body.valeur.replace(",", ".")))) {
    return NextResponse.json({ error: "Valeur numérique attendue." }, { status: 400 })
  }

  const maj = await db.parametrePlateforme.update({ where: { cle }, data: { valeur: body.valeur } })
  await logAudit({
    module: "CONFIG",
    action: "Paramètre modifié",
    cibleType: "PARAMETRE",
    cibleLabel: cle,
    severite: cle.startsWith("maintenance") ? "CRITIQUE" : "SENSIBLE",
    details: `${p.libelle} : « ${p.valeur} » → « ${body.valeur} ».`,
  })
  return NextResponse.json({ parametre: serializeParametre(maj) })
}
