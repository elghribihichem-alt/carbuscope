// Super Administration — helpers serveur : audit systématique + sérialisation.
// Toute route /api/super/* journalise ses actions via logAudit().
import { db } from "@/lib/db"
import type {
  AbonnementDTO, AnnonceDTO, AuditLogDTO, AvenantDTO, CleApiDTO, CompteDTO, ContratDTO,
  FactureDTO, FactureLigneDTO, IncidentDTO, JobDTO, ParametreDTO, SauvegardeDTO,
  TicketDTO, TicketMessageDTO,
} from "@/lib/sa-types"

const DEFAULT_ACTEUR = { nom: "Nadia Ben Amor", email: "super.admin@carbuscope.tn", role: "SUPER_ADMIN" }

export async function logAudit(entry: {
  acteur?: { nom: string; email: string; role: string }
  module: string
  action: string
  cibleType: string
  cibleLabel: string
  details?: string
  severite?: string
  ip?: string
}) {
  const a = entry.acteur ?? DEFAULT_ACTEUR
  try {
    await db.auditLog.create({
      data: {
        acteurNom: a.nom, acteurEmail: a.email, acteurRole: a.role,
        module: entry.module, action: entry.action,
        cibleType: entry.cibleType, cibleLabel: entry.cibleLabel,
        details: entry.details ?? "", severite: entry.severite ?? "NORMALE",
        ip: entry.ip ?? "10.0.0.2",
      },
    })
  } catch {
    // l'audit ne doit jamais casser la réponse métier
  }
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export function serializeAvenant(a: { id: string; numero: string; objet: string; contenu: string; dateEffet: Date; statut: string; createdAt: Date }): AvenantDTO {
  return { id: a.id, numero: a.numero, objet: a.objet, contenu: a.contenu, dateEffet: a.dateEffet.toISOString(), statut: a.statut, createdAt: a.createdAt.toISOString() }
}

export function serializeAbonnement(a: { id: string; brandSlug: string; stationCode: string; stationNom: string; periodicite: string; prixMillimes: number; dateDebut: Date; dateFin: Date | null; statut: string }): AbonnementDTO {
  return { ...a, dateDebut: a.dateDebut.toISOString(), dateFin: iso(a.dateFin) }
}

export function serializeFactureLigne(l: { id: string; libelle: string; quantite: number; prixUnitaireMillimes: number; montantHtMillimes: number; ordre: number }): FactureLigneDTO {
  return { ...l }
}

export function serializeFacture(f: {
  id: string; numero: string; brandSlug: string; moisConcerne: string; dateEmission: Date; dateEcheance: Date;
  statut: string; montantHtMillimes: number; montantTvaMillimes: number; montantTtcMillimes: number;
  datePaiement: Date | null; modePaiement: string | null; notes: string;
  lignes?: { id: string; libelle: string; quantite: number; prixUnitaireMillimes: number; montantHtMillimes: number; ordre: number }[]
  _count?: { lignes?: number }
  contrat?: { nomClient: string } | null
}): FactureDTO {
  return {
    id: f.id, numero: f.numero, brandSlug: f.brandSlug, moisConcerne: f.moisConcerne,
    dateEmission: f.dateEmission.toISOString(), dateEcheance: f.dateEcheance.toISOString(),
    statut: f.statut, montantHtMillimes: f.montantHtMillimes, montantTvaMillimes: f.montantTvaMillimes,
    montantTtcMillimes: f.montantTtcMillimes, datePaiement: iso(f.datePaiement), modePaiement: f.modePaiement,
    notes: f.notes,
    lignes: f.lignes ? f.lignes.map(serializeFactureLigne) : [],
    lignesCount: f._count?.lignes ?? f.lignes?.length ?? 0,
    clientNom: f.contrat?.nomClient ?? undefined,
  }
}

export function serializeCompte(u: { id: string; email: string; name: string; role: string; brandSlug: string | null; active: boolean; totpEnabled: boolean; createdAt: Date }, brandName: string | null = null): CompteDTO {
  return { ...u, brandName, createdAt: u.createdAt.toISOString() }
}

export function serializeAudit(l: { id: string; acteurNom: string; acteurEmail: string; acteurRole: string; module: string; action: string; cibleType: string; cibleLabel: string; details: string; severite: string; ip: string; createdAt: Date }): AuditLogDTO {
  return { ...l, createdAt: l.createdAt.toISOString() }
}

export function serializeParametre(p: { cle: string; valeur: string; type: string; categorie: string; libelle: string; description: string; modifiable: boolean; updatedAt: Date }): ParametreDTO {
  return { ...p, updatedAt: p.updatedAt.toISOString() }
}

export function serializeCle(c: { id: string; label: string; prefixe: string; cleMasquee: string; brandSlug: string | null; scopes: string; active: boolean; derniereUtilisation: Date | null; nbAppels: number; createdAt: Date }): CleApiDTO {
  return { ...c, derniereUtilisation: iso(c.derniereUtilisation), createdAt: c.createdAt.toISOString() }
}

export function serializeSauvegarde(s: { id: string; nomFichier: string; type: string; statut: string; tailleKo: number; nbTables: number; dureeMs: number; note: string; createdAt: Date }): SauvegardeDTO {
  return { ...s, createdAt: s.createdAt.toISOString() }
}

export function serializeJob(j: { id: string; code: string; nom: string; description: string; periodicite: string; actif: boolean; dernierRun: Date | null; statutDernierRun: string; dureeDernierRunMs: number; resultat: string }): JobDTO {
  return { ...j, dernierRun: iso(j.dernierRun) }
}

export function serializeAnnonce(a: { id: string; titre: string; corps: string; audience: string; severite: string; dateDebut: Date; dateFin: Date | null; active: boolean; dissmissible: boolean; auteur: string; createdAt: Date }): AnnonceDTO {
  return { ...a, dateDebut: a.dateDebut.toISOString(), dateFin: iso(a.dateFin), createdAt: a.createdAt.toISOString() }
}

export function serializeTicketMessage(m: { id: string; auteur: string; estStaff: boolean; contenu: string; createdAt: Date }): TicketMessageDTO {
  return { ...m, createdAt: m.createdAt.toISOString() }
}

export function serializeTicket(t: { id: string; numero: string; brandSlug: string; demandeur: string; sujet: string; priorite: string; statut: string; assigneA: string | null; createdAt: Date; updatedAt: Date; messages?: { id: string; auteur: string; estStaff: boolean; contenu: string; createdAt: Date }[]; _count?: { messages?: number } }): TicketDTO {
  const msgs = t.messages ? [...t.messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) : []
  return {
    id: t.id, numero: t.numero, brandSlug: t.brandSlug, demandeur: t.demandeur, sujet: t.sujet,
    priorite: t.priorite, statut: t.statut, assigneA: t.assigneA,
    createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
    messagesCount: t._count?.messages ?? msgs.length,
    dernierMessage: msgs.length ? serializeTicketMessage(msgs[msgs.length - 1]) : null,
    messages: msgs.map(serializeTicketMessage),
  }
}

export function serializeIncident(i: { id: string; titre: string; composant: string; severite: string; statut: string; debut: Date; fin: Date | null; impact: string; description: string; resolution: string }): IncidentDTO {
  return { ...i, debut: i.debut.toISOString(), fin: iso(i.fin) }
}

// ---- Enrichissement contrat (liste clients & fiche 360°) ----

export interface ContratAgregats {
  stationsSouscrites: number
  stationsReseau: number
  abonnementsMensuels: number
  abonnementsAnnuels: number
  mrrMillimes: number
  facturesTotal: number
  facturesPayees: number
  facturesEnRetard: number
  impayesTtcMillimes: number
  comptesActifs: number
  usage: { missions: number; rapports: number; notifications: number; avisRepondes: number; controlesConformite: number | null }
}

export async function agregatsContrat(brandSlug: string | null): Promise<ContratAgregats> {
  if (!brandSlug) {
    return { stationsSouscrites: 0, stationsReseau: 0, abonnementsMensuels: 0, abonnementsAnnuels: 0, mrrMillimes: 0, facturesTotal: 0, facturesPayees: 0, facturesEnRetard: 0, impayesTtcMillimes: 0, comptesActifs: 0, usage: { missions: 0, rapports: 0, notifications: 0, avisRepondes: 0, controlesConformite: 0 } }
  }
  const [abonnements, stationsReseau, factures, comptes, missions, rapports, notifications, avis, controles] = await Promise.all([
    db.abonnementStation.findMany({ where: { brandSlug, statut: "ACTIF" }, select: { periodicite: true, prixMillimes: true } }),
    db.station.count({ where: { brand: { slug: brandSlug } } }),
    db.facture.findMany({ where: { brandSlug }, select: { statut: true, montantTtcMillimes: true } }),
    db.user.count({ where: { brandSlug, active: true } }),
    db.mission.count({ where: { brandSlug } }),
    db.visitReport.count({ where: { stationCode: { not: null }, agent: { brandSlug } } }),
    db.notification.count({ where: { brandSlug } }),
    db.review.count({ where: { station: { brand: { slug: brandSlug } }, repliedAt: { not: null } } }),
    db.mission.count({ where: { brandSlug, type: "CONTROLE" } }),
  ])
  const mensuels = abonnements.filter(a => a.periodicite === "MENSUEL").length
  const annuels = abonnements.filter(a => a.periodicite === "ANNUEL").length
  const mrr = abonnements.reduce((s, a) => s + (a.periodicite === "ANNUEL" ? Math.round(a.prixMillimes / 12) : a.prixMillimes), 0)
  const impayees = factures.filter(f => f.statut === "EMISE" || f.statut === "EN_RETARD")
  return {
    stationsSouscrites: mensuels + annuels,
    stationsReseau,
    abonnementsMensuels: mensuels,
    abonnementsAnnuels: annuels,
    mrrMillimes: mrr,
    facturesTotal: factures.length,
    facturesPayees: factures.filter(f => f.statut === "PAYEE").length,
    facturesEnRetard: factures.filter(f => f.statut === "EN_RETARD").length,
    impayesTtcMillimes: impayees.reduce((s, f) => s + f.montantTtcMillimes, 0),
    comptesActifs: comptes,
    usage: { missions, rapports, notifications, avisRepondes: avis, controlesConformite: controles },
  }
}

export function serializeContrat(c: {
  id: string; numero: string; brandSlug: string | null; nomClient: string; contactNom: string; contactRole: string;
  contactEmail: string; contactTel: string; statut: string; dateSignature: Date | null; dateDebut: Date | null; dateFin: Date | null;
  fraisAdhesionMillimes: number; adhesionPayee: boolean; periodiciteDefaut: string; conditions: string; notes: string;
  createdAt: Date; updatedAt: Date;
  avenants: { id: string; numero: string; objet: string; contenu: string; dateEffet: Date; statut: string; createdAt: Date }[]
}, ag: ContratAgregats): ContratDTO {
  const joursAvantEcheance = c.dateFin ? Math.round((c.dateFin.getTime() - Date.now()) / 86400000) : null
  return {
    id: c.id, numero: c.numero, brandSlug: c.brandSlug, nomClient: c.nomClient,
    contactNom: c.contactNom, contactRole: c.contactRole, contactEmail: c.contactEmail, contactTel: c.contactTel,
    statut: c.statut, dateSignature: iso(c.dateSignature), dateDebut: iso(c.dateDebut), dateFin: iso(c.dateFin),
    fraisAdhesionMillimes: c.fraisAdhesionMillimes, adhesionPayee: c.adhesionPayee,
    periodiciteDefaut: c.periodiciteDefaut, conditions: c.conditions, notes: c.notes,
    createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
    avenants: c.avenants.map(serializeAvenant),
    ...ag,
    joursAvantEcheance,
  }
}

export async function parametre(cle: string): Promise<string | null> {
  const p = await db.parametrePlateforme.findUnique({ where: { cle } })
  return p?.valeur ?? null
}
