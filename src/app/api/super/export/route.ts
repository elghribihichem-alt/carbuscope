// Super Administration — exports CSV généralisés : portefeuille clients,
// factures de comptabilité et comptes. Lecture PURE (aucune écriture en
// base, pas d'entrée d'audit : une consultation n'est pas une action).
// Même style que l'export CSV du journal d'audit : BOM \uFEFF, séparateur
// « ; », chaque valeur entre guillemets doublés, dates ISO 8601 et
// montants en MILLIMES entiers (1 DT = 1 000 — source de vérité compta).
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { agregatsContrat } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

const TYPES = ["clients", "factures", "comptes"] as const
type ExportType = (typeof TYPES)[number]

/** Échappe une valeur CSV : guillemets internes doublés, sauts de ligne aplanis. */
function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v)
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`
}

/** Date → ISO 8601, chaîne vide si absente (convention compta du module). */
function iso(d: Date | null | undefined): string {
  return d ? d.toISOString() : ""
}

function ouiNon(b: boolean): string {
  return b ? "oui" : "non"
}

/** Réponse CSV attachée, style identique à /api/super/audit?format=csv. */
function reponseCsv(type: ExportType, entetes: string, lignes: string[]): NextResponse {
  const corps = [entetes, ...lignes].join("\n")
  return new NextResponse(`\uFEFF${corps}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="carbuscope-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const type = url.searchParams.get("type") as ExportType | null
  if (!type || !TYPES.includes(type)) {
    return NextResponse.json(
      { error: `Type d'export manquant ou inconnu (${type ?? "—"}). Valeurs acceptées : ${TYPES.join(" | ")}.` },
      { status: 400 },
    )
  }

  try {
    if (type === "clients") {
      // Mêmes requêtes que GET /api/super/clients (contrats + agrégats 360°).
      const contrats = await db.contrat.findMany({
        include: { avenants: { orderBy: { dateEffet: "desc" as const } } },
        orderBy: { createdAt: "asc" },
      })
      const lignes: string[] = []
      for (const c of contrats) {
        const ag = await agregatsContrat(c.brandSlug)
        lignes.push([
          c.nomClient, c.numero, c.brandSlug ?? "", c.statut,
          c.contactNom, c.contactRole, c.contactEmail, c.contactTel,
          iso(c.dateSignature), iso(c.dateDebut), iso(c.dateFin),
          ag.stationsSouscrites, ag.stationsReseau, ag.abonnementsMensuels, ag.abonnementsAnnuels,
          c.fraisAdhesionMillimes, ouiNon(c.adhesionPayee), c.periodiciteDefaut,
          ag.mrrMillimes, ag.facturesTotal, ag.facturesPayees, ag.facturesEnRetard,
          ag.impayesTtcMillimes, ag.comptesActifs, c.avenants.length, c.notes,
        ].map(cell).join(";"))
      }
      return reponseCsv(
        "clients",
        "enseigne;reference contrat;slug;statut client;contact;role contact;email contact;telephone contact;date signature;date debut;date fin;stations souscrites;stations reseau;abonnements mensuels;abonnements annuels;frais adhesion (millimes);adhesion payee;periodicite par defaut;mrr (millimes);factures totales;factures payees;factures en retard;impayes ttc (millimes);comptes actifs;nb avenants;notes",
        lignes,
      )
    }

    if (type === "factures") {
      // Mêmes requêtes que GET /api/super/factures (sélect + noms clients).
      const factures = await db.facture.findMany({
        select: {
          id: true, numero: true, brandSlug: true, moisConcerne: true, dateEmission: true, dateEcheance: true,
          statut: true, montantHtMillimes: true, montantTvaMillimes: true, montantTtcMillimes: true,
          datePaiement: true, modePaiement: true, notes: true,
        },
        orderBy: { dateEmission: "desc" },
      })
      const contrats = await db.contrat.findMany({
        where: { brandSlug: { not: null } },
        select: { brandSlug: true, nomClient: true },
      })
      const noms = new Map(contrats.map(c => [c.brandSlug!, c.nomClient]))
      const lignes = factures.map(f => [
        f.numero, noms.get(f.brandSlug) ?? f.brandSlug, f.moisConcerne, f.statut,
        iso(f.dateEmission), iso(f.dateEcheance),
        f.montantHtMillimes, f.montantTvaMillimes, f.montantTtcMillimes,
        iso(f.datePaiement), f.modePaiement ?? "",
        (f.notes.match(/Relance envoyée le/g) ?? []).length, f.notes,
      ].map(cell).join(";"))
      return reponseCsv(
        "factures",
        "numero;client;mois concerne;statut;date emission;date echeance;montant ht (millimes);tva (millimes);ttc (millimes);date paiement;mode paiement;nb relances;notes",
        lignes,
      )
    }

    // type === "comptes" — mêmes requêtes que GET /api/super/comptes.
    // Le modèle Utilisateur n'a PAS de champ « dernière connexion » : la
    // dernière activité est dérivée du journal d'audit (lecture seule).
    const [users, brands, activite] = await Promise.all([
      db.user.findMany({ orderBy: [{ brandSlug: "asc" }, { createdAt: "asc" }] }),
      db.brand.findMany({ select: { slug: true, name: true } }),
      db.auditLog.groupBy({ by: ["acteurEmail"], _count: { _all: true }, _max: { createdAt: true } }),
    ])
    const brandName = new Map(brands.map(b => [b.slug, b.name]))
    const act = new Map(activite.map(a => [a.acteurEmail, { n: a._count._all, dernier: a._max.createdAt }]))
    const lignes = users.map(u => {
      const a = act.get(u.email)
      return [
        u.name, u.email, u.role,
        u.brandSlug ? brandName.get(u.brandSlug) ?? u.brandSlug : "CarbuScope (éditeur)",
        ouiNon(u.active), iso(u.createdAt),
        a?.dernier ? iso(a.dernier) : "", a?.n ?? 0,
      ].map(cell).join(";")
    })
    return reponseCsv(
      "comptes",
      "nom;email;role;enseigne;actif;date creation;derniere activite (journal);actions tracees",
      lignes,
    )
  } catch (e) {
    return NextResponse.json(
      { error: `Export impossible : ${e instanceof Error ? e.message : "erreur inconnue"}.` },
      { status: 500 },
    )
  }
}
