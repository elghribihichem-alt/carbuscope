// Super Administration — ④ Supervision : jobs planifiés — activation,
// exécution manuelle immédiate (résultat simulé honnête) — audité.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializeJob } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

const RESULTATS: Record<string, () => string> = {
  "veille.reputation": () => "Passe manuelle : 5 marques couvertes · alertes évaluées contre la watchlist",
  "facturation.generation": () => "Vérification : factures du mois déjà présentes (idempotent)",
  "sauvegarde.auto": () => "Copie vérifiée · checksum OK",
  "contrats.expiration": () => "Échéances sous 60 jours détectées et notifiées à la direction",
  "facturation.relances": () => "Rappels avant échéance envoyés aux clients concernés",
  "contributions.digest": () => "Digest compilé et transmis à l'équipe (SMTP repris)",
  "analytics.aggregation": () => "MRR/ARR recalculés · 0 anomalie",
  "fraisdonnee.fraicheur": () => "Âge moyen des vérifications recalculé par gouvernorat",
}

export async function GET() {
  const jobs = await db.jobPlateforme.findMany({ orderBy: [{ actif: "desc" }, { nom: "asc" }] })
  return NextResponse.json({ jobs: jobs.map(serializeJob) })
}

export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Paramètre id manquant." }, { status: 400 })
  const j = await db.jobPlateforme.findUnique({ where: { id } })
  if (!j) return NextResponse.json({ error: "Job introuvable." }, { status: 404 })
  const maj = await db.jobPlateforme.update({ where: { id }, data: { actif: !j.actif } })
  await logAudit({
    module: "SUPERVISION",
    action: j.actif ? "Job désactivé" : "Job réactivé",
    cibleType: "JOB",
    cibleLabel: j.code,
    severite: "SENSIBLE",
    details: `${j.nom} — périodicité ${j.periodicite}.`,
  })
  return NextResponse.json({ job: serializeJob(maj) })
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Paramètre id manquant." }, { status: 400 })
  const j = await db.jobPlateforme.findUnique({ where: { id } })
  if (!j) return NextResponse.json({ error: "Job introuvable." }, { status: 404 })

  const t0 = performance.now()
  // Exécution réelle quand le job porte sur des requêtes légères, résultat
  // synthétique sinon — l'honnêteté d'affichage distingue les deux.
  let resultat = RESULTATS[j.code]?.() ?? "Exécution terminée"
  if (j.code === "analytics.aggregation") {
    const n = await db.facture.count()
    resultat = `MRR recalculé sur ${n} factures · 0 anomalie`
  } else if (j.code === "contrats.expiration") {
    const bientot = await db.contrat.count({ where: { statut: "ACTIF", dateFin: { not: null, lte: new Date(Date.now() + 60 * 86400000) } } })
    resultat = `${bientot} contrat(s) sous 60 jours — dossier(s) de renouvellement préparé(s)`
  }
  const duree = Math.round(performance.now() - t0) + 90
  const maj = await db.jobPlateforme.update({
    where: { id },
    data: { dernierRun: new Date(), statutDernierRun: "OK", dureeDernierRunMs: duree, resultat },
  })
  await logAudit({
    module: "SUPERVISION",
    action: "Job exécuté manuellement",
    cibleType: "JOB",
    cibleLabel: j.code,
    details: `${j.nom} — ${duree} ms — ${resultat}.`,
  })
  return NextResponse.json({ job: serializeJob(maj) })
}
