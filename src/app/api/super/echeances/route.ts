// Super Administration — ① Échéances & renouvellements automatiques du
// portefeuille SaaS (Task C-2). Lecture seule : aucune écriture, pas d'audit —
// les alertes sont RECALCULÉES à chaque consultation depuis les contrats
// (Contrat) et les abonnements annuels (AbonnementStation) en base.
//
// Trois familles d'échéances, fenêtre de surveillance −30 → +90 jours :
//   • RENOUVELLEMENT_CONTRAT   — date de fin contractuelle si définie, SINON
//     prochain anniversaire de dateDebut (reconduction tacite, multiple de
//     12 mois suivant, année de signature ignorée) ;
//   • PREAVIS_RESILIATION      — contrats tacites (dateFin null) dont le
//     renouvellement est à ≤ 60 j : échéance = renouvellement − 60 j
//     (fenêtre limite de résiliation) ;
//   • RENOUVELLEMENT_ABONNEMENT — abonnements ANNUELS actifs GROUPÉS par
//     (enseigne, mois + année de l'échéance) : une seule entrée par groupe,
//     avec le montant annuel cumulé (somme prixMillimes → DT/an).
//
// Gravité : DEPASSE (jours < 0) · CRITIQUE (≤ 7 j) · WARNING (≤ 30 j) ·
// INFO (≤ 90 j) — tri final par joursRestants croissants.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const DAY_MS = 86_400_000
const FENETRE_MIN = -30 // échéances récemment dépassées conservées
const FENETRE_MAX = 90 // horizon de surveillance
const PREAVIS_JOURS = 60 // préavis contractuel (reconduction tacite)

type EcheanceType = "RENOUVELLEMENT_CONTRAT" | "PREAVIS_RESILIATION" | "RENOUVELLEMENT_ABONNEMENT"
type Gravite = "DEPASSE" | "CRITIQUE" | "WARNING" | "INFO"

interface Echeance {
  id: string
  type: EcheanceType
  clientSlug: string
  clientNom: string
  reference: string
  libelle: string
  dateEcheance: string
  joursRestants: number
  gravite: Gravite
  detail: string
}

const nfEntier = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })

/** 8 000 000 millimes → « 8 000 DT » (montants annuels cumulés, DT entiers). */
function dt(millimes: number): string {
  return `${nfEntier.format(Math.round(millimes / 1000))} DT`
}

const fDateLongue = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })
const fMois = new Intl.DateTimeFormat("fr-FR", { month: "long" })

function dateFr(d: Date): string {
  const s = fDateLongue.format(d)
  return d.getDate() === 1 ? s.replace(/^1\s/, "1er ") : s
}

/** Écart entier en jours (même convention que serializeContrat). */
function joursEntre(cible: Date, now: Date): number {
  return Math.round((cible.getTime() - now.getTime()) / DAY_MS)
}

function graviteDe(jours: number): Gravite {
  if (jours < 0) return "DEPASSE"
  if (jours <= 7) return "CRITIQUE"
  if (jours <= 30) return "WARNING"
  return "INFO"
}

function dansFenetre(jours: number): boolean {
  return jours >= FENETRE_MIN && jours <= FENETRE_MAX
}

/** Prochain anniversaire annuel de la date de référence (multiple de 12 mois
 * suivant, année de signature ignorée — reconduction tacite). L'anniversaire
 * du jour même est conservé (J-0 → CRITIQUE). */
function prochainAnniversaire(debut: Date, now: Date): Date {
  const a = (y: number) => new Date(
    y, debut.getMonth(), debut.getDate(),
    debut.getHours(), debut.getMinutes(), debut.getSeconds(), debut.getMilliseconds(),
  )
  const debutDuJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  let cible = a(now.getFullYear())
  if (debutDuJour(cible) < debutDuJour(now)) cible = a(now.getFullYear() + 1)
  return cible
}

export async function GET() {
  try {
    const now = new Date()
    const contrats = await db.contrat.findMany({ orderBy: { createdAt: "asc" } })
    const abonnements = await db.abonnementStation.findMany({
      where: { periodicite: "ANNUEL", statut: "ACTIF" },
      select: { brandSlug: true, dateDebut: true, dateFin: true, prixMillimes: true },
    })
    // Raison sociale par enseigne (contrats actifs/essais d'abord, repli sur
    // n'importe quel contrat de l'enseigne).
    const nomsClients = new Map<string, string>()
    for (const c of contrats) {
      if (c.brandSlug) nomsClients.set(c.brandSlug, c.nomClient)
    }

    const echeances: Echeance[] = []

    // ------------------------------- renouvellements de contrats + préavis
    for (const c of contrats.filter((x) => x.statut === "ACTIF" || x.statut === "ESSAI")) {
      const slug = c.brandSlug ?? c.numero
      let cible: Date | null = null
      let tacite = false
      if (c.dateFin) {
        cible = c.dateFin // échéance contractuelle fixe
      } else if (c.dateDebut) {
        cible = prochainAnniversaire(c.dateDebut, now) // reconduction tacite
        tacite = true
      }
      if (!cible) continue // prospect sans dates → rien à surveiller

      const j = joursEntre(cible, now)
      if (!dansFenetre(j)) continue

      echeances.push({
        id: `RENOU-${c.numero}`,
        type: "RENOUVELLEMENT_CONTRAT",
        clientSlug: slug,
        clientNom: c.nomClient,
        reference: c.numero,
        libelle: tacite
          ? "Reconduction tacite annuelle du contrat"
          : "Fin de contrat à échéance fixe",
        dateEcheance: cible.toISOString(),
        joursRestants: j,
        gravite: graviteDe(j),
        detail: tacite
          ? `Contrat sans date de fin : reconduction automatique le ${dateFr(cible)} (anniversaire du ${dateFr(c.dateDebut!)}) — préavis de résiliation 60 jours.`
          : `Signé le ${c.dateSignature ? dateFr(c.dateSignature) : "—"} · échéance contractuelle le ${dateFr(cible)} — préparer le dossier de renouvellement ou la clôture.`,
      })

      // Préavis de résiliation : tacite ET renouvellement à ≤ 60 jours.
      if (tacite && j <= PREAVIS_JOURS) {
        const dateLimite = new Date(cible.getTime() - PREAVIS_JOURS * DAY_MS)
        const jp = joursEntre(dateLimite, now)
        if (dansFenetre(jp)) {
          echeances.push({
            id: `PREAVIS-${c.numero}`,
            type: "PREAVIS_RESILIATION",
            clientSlug: slug,
            clientNom: c.nomClient,
            reference: c.numero,
            libelle: "Fenêtre préavis 60 j — dernière date pour ne pas reconduire tacitement",
            dateEcheance: dateLimite.toISOString(),
            joursRestants: jp,
            gravite: graviteDe(jp),
            detail: `Notifier la résiliation au plus tard le ${dateFr(dateLimite)} (60 jours avant la reconduction du ${dateFr(cible)}) — sinon le contrat est reconduit automatiquement.`,
          })
        }
      }
    }

    // ---------------- renouvellements d'abonnements annuels (groupés)
    type Groupe = { cible: Date; nb: number; totalMillimes: number }
    const groupes = new Map<string, Groupe>()
    for (const ab of abonnements) {
      // dateFin si définie, sinon anniversaire de souscription (tacite).
      const cible = ab.dateFin ?? prochainAnniversaire(ab.dateDebut, now)
      const j = joursEntre(cible, now)
      if (!dansFenetre(j)) continue
      const cle = `${ab.brandSlug}#${cible.getFullYear()}-${String(cible.getMonth() + 1).padStart(2, "0")}`
      const g = groupes.get(cle)
      if (g) {
        g.nb += 1
        g.totalMillimes += ab.prixMillimes
      } else {
        groupes.set(cle, { cible, nb: 1, totalMillimes: ab.prixMillimes })
      }
    }
    for (const [cle, g] of groupes) {
      const [brandSlug, ym] = cle.split("#")
      const [annee, moisNum] = ym.split("-").map(Number)
      const nomMois = fMois.format(new Date(annee, moisNum - 1, 1))
      const nomClient = nomsClients.get(brandSlug) ?? brandSlug
      echeances.push({
        id: `ABOS-${brandSlug}-${ym}`,
        type: "RENOUVELLEMENT_ABONNEMENT",
        clientSlug: brandSlug,
        clientNom: nomClient,
        reference: `GRPE-${brandSlug.toUpperCase()}-${ym}`,
        libelle: `${g.nb} abonnements annuels à renouveler (≈ ${dt(g.totalMillimes)}/an)`,
        dateEcheance: g.cible.toISOString(),
        joursRestants: joursEntre(g.cible, now),
        gravite: graviteDe(joursEntre(g.cible, now)),
        detail: `${g.nb} stations ${nomClient} en formule annuelle, reconduites tacitement à leur anniversaire (${nomMois} ${annee}) — ≈ ${dt(Math.round(g.totalMillimes / g.nb))}/an par station.`,
      })
    }

    // ------------------------------------------------- tri + statistiques
    echeances.sort((a, b) => a.joursRestants - b.joursRestants)
    const stats = {
      total: echeances.length,
      depasse: echeances.filter((e) => e.gravite === "DEPASSE").length,
      critique: echeances.filter((e) => e.gravite === "CRITIQUE").length,
      warning: echeances.filter((e) => e.gravite === "WARNING").length,
      info: echeances.filter((e) => e.gravite === "INFO").length,
    }
    return NextResponse.json({ echeances, stats })
  } catch (e) {
    console.error("GET /api/super/echeances", e)
    return NextResponse.json(
      { error: "Impossible de calculer les échéances du portefeuille." },
      { status: 500 },
    )
  }
}
