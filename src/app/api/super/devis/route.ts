// Super Administration — ⑩ Devis : configurateur de devis SaaS interactif
// (Vague 7, G-2). L'éditeur CarbuScope SAS simule l'abonnement d'un prospect
// ou d'une enseigne — grille 6 000 DT d'adhésion + 40 DT/station/mois ou
// 400 DT/station/an, TVA 19 % — persiste le devis et suit son statut
// (BROUILLON → ENVOYE → ACCEPTE | REFUSE), chaque action étant auditée.
// Montants stockés en MILLIMES (1 DT = 1 000, convention Facture) ;
// le DTO expose les montants convertis en DT (3 décimales).
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// ---- Grille SaaS CarbuScope — source de vérité SERVEUR (millimes) ----
const ADHESION_MILL = 6_000_000 // 6 000 DT / enseigne (1re année)
const MENSUEL_MILL = 40_000 // 40 DT / station / mois
const ANNUEL_MILL = 400_000 // 400 DT / station / an
const TAUX_TVA = 0.19 // 19 %

const MODES: readonly string[] = ["MENSUEL", "ANNUEL"]
const STATUTS: readonly string[] = ["BROUILLON", "ENVOYE", "ACCEPTE", "REFUSE"]

// Acteur démo de l'espace SA (même identité que le DEFAULT_ACTEUR de
// sa-server : Nadia Ben Amor, SUPER_ADMIN) — l'espace n'a pas d'auth réelle.
const AUTEUR = "super.admin@carbuscope.tn"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type DevisRow = {
  id: string
  numero: string
  enseigneNom: string
  contactEmail: string
  nbStations: number
  modeFacturation: string
  adhesionOfferte: boolean
  montantHtMillimes: number
  montantTvaMillimes: number
  montantTtcMillimes: number
  statut: string
  creePar: string
  createdAt: Date
  updatedAt: Date
}

/** DTO sérialisé : millimes → DT (nombre, 3 décimales), dates ISO. */
function serializeDevis(d: DevisRow) {
  return {
    id: d.id,
    numero: d.numero,
    enseigneNom: d.enseigneNom,
    contactEmail: d.contactEmail,
    nbStations: d.nbStations,
    modeFacturation: d.modeFacturation,
    adhesionOfferte: d.adhesionOfferte,
    montantHt: Math.round(d.montantHtMillimes) / 1000,
    montantTva: Math.round(d.montantTvaMillimes) / 1000,
    montantTtc: Math.round(d.montantTtcMillimes) / 1000,
    statut: d.statut,
    creePar: d.creePar,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// GET — historique des devis (plus récents d'abord)
// ---------------------------------------------------------------------------
export async function GET() {
  const lignes = await db.devis.findMany({ orderBy: { createdAt: "desc" } })
  return NextResponse.json({ devis: lignes.map(serializeDevis) })
}

// ---------------------------------------------------------------------------
// POST — création d'un devis (calcul serveur = source de vérité unique)
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    enseigneNom?: unknown
    contactEmail?: unknown
    nbStations?: unknown
    modeFacturation?: unknown
    adhesionOfferte?: unknown
  }

  // Validations (messages FR précis) — même esprit que les autres routes SA.
  const nom = typeof body.enseigneNom === "string" ? body.enseigneNom.trim() : ""
  if (nom.length < 1 || nom.length > 80) {
    return NextResponse.json(
      { error: "Le nom de l'enseigne / prospect est obligatoire (1 à 80 caractères)." },
      { status: 400 },
    )
  }
  const email = typeof body.contactEmail === "string" ? body.contactEmail.trim() : ""
  if (email !== "" && !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "L'e-mail contact est optionnel, mais s'il est renseigné il doit être une adresse valide (ex. contact@enseigne.tn)." },
      { status: 400 },
    )
  }
  const nbStations = body.nbStations
  if (typeof nbStations !== "number" || !Number.isInteger(nbStations) || nbStations < 1 || nbStations > 2000) {
    return NextResponse.json(
      { error: "Le nombre de stations doit être un entier entre 1 et 2 000." },
      { status: 400 },
    )
  }
  const modeFacturation = body.modeFacturation
  if (typeof modeFacturation !== "string" || !MODES.includes(modeFacturation)) {
    return NextResponse.json(
      { error: "Le mode de facturation doit être MENSUEL ou ANNUEL." },
      { status: 400 },
    )
  }
  const adhesionOfferte = body.adhesionOfferte === undefined ? false : body.adhesionOfferte
  if (typeof adhesionOfferte !== "boolean") {
    return NextResponse.json(
      { error: "adhesionOfferte doit être un booléen (true = geste commercial)." },
      { status: 400 },
    )
  }

  // Calcul serveur en millimes — le panneau client ne sert qu'à l'affichage.
  const adhesion = adhesionOfferte ? 0 : ADHESION_MILL
  const abonnement = nbStations * (modeFacturation === "ANNUEL" ? ANNUEL_MILL : MENSUEL_MILL * 12)
  const ht = adhesion + abonnement
  const tva = Math.round(ht * TAUX_TVA)
  const ttc = ht + tva

  // Numérotation DEV-{année}-{NNNN} : compte les devis de l'année + 1.
  // La course rare (2 créations simultanées → même numéro) est rattrapée
  // en réessayant : le compteur intègre alors l'insertion concurrente.
  const annee = new Date().getFullYear()
  for (let essai = 0; essai < 3; essai++) {
    const dejaCetteAnnee = await db.devis.count({
      where: { numero: { startsWith: `DEV-${annee}-` } },
    })
    const numero = `DEV-${annee}-${String(dejaCetteAnnee + 1).padStart(4, "0")}`
    try {
      const d = await db.devis.create({
        data: {
          numero,
          enseigneNom: nom,
          contactEmail: email,
          nbStations,
          modeFacturation,
          adhesionOfferte,
          montantHtMillimes: ht,
          montantTvaMillimes: tva,
          montantTtcMillimes: ttc,
          statut: "BROUILLON",
          creePar: AUTEUR,
        },
      })
      await logAudit({
        module: "CLIENTS",
        action: "Devis créé",
        cibleType: "DEVIS",
        cibleLabel: `${d.numero} — ${d.enseigneNom}`,
        details: `${nbStations} stations · ${modeFacturation} · ${ttc / 1000} DT TTC`,
        severite: "NORMALE",
      })
      return NextResponse.json({ devis: serializeDevis(d) }, { status: 201 })
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002" && essai < 2) continue // collision → n° suivant
      throw e
    }
  }
  return NextResponse.json(
    { error: "Numéro de devis déjà attribué (course concurrente) — réessayez." },
    { status: 500 },
  )
}

// ---------------------------------------------------------------------------
// PATCH — changement de statut (BROUILLON | ENVOYE | ACCEPTE | REFUSE)
// ---------------------------------------------------------------------------
export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; statut?: unknown }
  const id = typeof body.id === "string" ? body.id.trim() : ""
  if (!id) {
    return NextResponse.json({ error: "L'identifiant du devis (id) est requis." }, { status: 400 })
  }
  const statut = body.statut
  if (typeof statut !== "string" || !STATUTS.includes(statut)) {
    return NextResponse.json(
      { error: "Le statut doit être BROUILLON, ENVOYE, ACCEPTE ou REFUSE." },
      { status: 400 },
    )
  }

  const existant = await db.devis.findUnique({ where: { id } })
  if (!existant) {
    return NextResponse.json({ error: "Devis introuvable." }, { status: 404 })
  }

  const maj = await db.devis.update({ where: { id }, data: { statut } })
  await logAudit({
    module: "CLIENTS",
    action: "Statut devis modifié",
    cibleType: "DEVIS",
    cibleLabel: `${maj.numero} — ${maj.enseigneNom}`,
    details: `→ ${statut}`,
    severite: "NORMALE",
  })
  return NextResponse.json({ devis: serializeDevis(maj) })
}
