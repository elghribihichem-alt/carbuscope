// Super Administration — échéances SaaS consolidées (T52-R1, réécriture).
// Lecture seule : aucune écriture, pas d'audit — les alertes sont RECALCULÉES
// à chaque consultation depuis les contrats SaaS (SaasContract) et les
// factures (SaasInvoice) réellement présents en base.
//
// ⚠️ Historique : la version d'origine (T44) sondatait les modèles Prisma
// « Contrat », « AbonnementStation », « Facture » du stock historique — ces
// modèles n'existent plus dans le schéma, la route répondait donc HTTP 500
// systématiquement (Cannot read properties of undefined). Cette version
// s'appuie exclusivement sur les modèles vivants.
//
// Deux familles d'échéances, fenêtre de surveillance −30 → +90 jours :
//   • RENOUVELLEMENT_CONTRAT — date de renouvellement (renewsAt) des contrats
//     ACTIF/ESSAI : reconduction ou dossier de renouvellement à préparer ;
//   • FACTURE_RETARD         — factures impayées dont l'échéance (dueAt) est
//     dépassée (statut effectif RETARD), avec jours de retard et montant.
//
// Gravité : DEPASSE (jours < 0) · CRITIQUE (≤ 7 j) · WARNING (≤ 30 j) ·
// INFO (≤ 90 j) — tri final par joursRestants croissants.
// La réponse alimente la bannière d'alertes de la Vue d'ensemble
// (sa-overview-alertes.tsx) : champs id/type/clientNom/libelle/
// dateEcheance/joursRestants/gravite conservés pour compatibilité.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { effectiveStatusInDb } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

const DAY_MS = 86_400_000
const FENETRE_MIN = -30 // échéances contractuelles récemment dépassées conservées
const FENETRE_MIN_RETARD = -90 // factures en retard : alerte active tant qu'impayée (jusqu'à 90 j de retard)
const FENETRE_MAX = 90 // horizon de surveillance

type EcheanceType = "RENOUVELLEMENT_CONTRAT" | "FACTURE_RETARD"
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
  /** Montant mensuel du contrat (renouvellements) — null pour les factures. */
  montantMensuelDt: number | null
  /** Montant TTC de la facture (retards) — null pour les renouvellements. */
  montantDt: number | null
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

/** Fenêtre élargie pour les retards de factures (alerte tant que la facture
 *  est impayée, jusqu'à 90 j de retard — aligne bannière et KPI « en attente »). */
function dansFenetreRetard(jours: number): boolean {
  return jours >= FENETRE_MIN_RETARD && jours <= FENETRE_MAX
}

/** Écart entier en jours (même convention que serializeContrat). */
function joursEntre(cible: Date, now: Date): number {
  return Math.round((cible.getTime() - now.getTime()) / DAY_MS)
}

export async function GET() {
  try {
    const now = new Date()
    const [contrats, factures] = await Promise.all([
      db.saasContract.findMany({ orderBy: { renewsAt: "asc" } }),
      db.saasInvoice.findMany({ include: { contract: true }, orderBy: { dueAt: "asc" } }),
    ])

    const echeances: Echeance[] = []

    // ------------------------------- renouvellements de contrats SaaS
    for (const c of contrats.filter(x => x.status === "ACTIF" || x.status === "ESSAI")) {
      const j = joursEntre(c.renewsAt, now)
      if (!dansFenetre(j)) continue
      const essai = c.status === "ESSAI"
      echeances.push({
        id: `RENOU-${c.id}`,
        type: "RENOUVELLEMENT_CONTRAT",
        clientSlug: c.brandSlug,
        clientNom: c.brandName,
        reference: c.plan,
        libelle: essai
          ? "Fin d'essai — conversion à décider"
          : "Renouvellement de l'abonnement SaaS",
        dateEcheance: c.renewsAt.toISOString(),
        joursRestants: j,
        gravite: graviteDe(j),
        detail: essai
          ? `Essai ${c.brandName} se terminant le ${c.renewsAt.toLocaleDateString("fr-FR")} — arbitrer la conversion en contrat payant (${c.monthlyFee} DT/mois).`
          : `Contrat ${c.brandName} (plan ${c.plan}) à renouveler le ${c.renewsAt.toLocaleDateString("fr-FR")} — préparer le dossier de reconduction ou de clôture.`,
        montantMensuelDt: c.monthlyFee,
        montantDt: null,
      })
    }

    // ---------------- factures en retard (statut effectif, échéance dépassée)
    for (const f of factures) {
      if (effectiveStatusInDb(f.status, f.dueAt) !== "RETARD") continue
      const j = joursEntre(f.dueAt, now) // toujours négatif ici
      if (!dansFenetreRetard(j)) continue
      echeances.push({
        id: `FACT-${f.id}`,
        type: "FACTURE_RETARD",
        clientSlug: f.contract.brandSlug,
        clientNom: f.contract.brandName,
        reference: f.number,
        libelle: "Facture en retard de paiement",
        dateEcheance: f.dueAt.toISOString(),
        joursRestants: j,
        gravite: graviteDe(j),
        detail: `Facture ${f.number} (${f.amount} DT) de ${f.contract.brandName} échue le ${f.dueAt.toLocaleDateString("fr-FR")} — en retard de ${Math.abs(j)} jour(s)${f.reminderCount > 0 ? ` · ${f.reminderCount} relance(s) envoyée(s)` : " · aucune relance envoyée"}.`,
        montantMensuelDt: null,
        montantDt: f.amount,
      })
    }

    // ------------------------------------------------- tri + statistiques
    echeances.sort((a, b) => a.joursRestants - b.joursRestants)
    const retards = echeances.filter(e => e.type === "FACTURE_RETARD")
    const stats = {
      total: echeances.length,
      depasse: echeances.filter(e => e.gravite === "DEPASSE").length,
      critique: echeances.filter(e => e.gravite === "CRITIQUE").length,
      warning: echeances.filter(e => e.gravite === "WARNING").length,
      info: echeances.filter(e => e.gravite === "INFO").length,
      facturesRetard: retards.length,
      montantRetardDt: Math.round(retards.reduce((s, r) => s + (r.montantDt ?? 0), 0)),
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
