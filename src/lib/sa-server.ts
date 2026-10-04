// Super Administration — helpers serveur : audit systématique + sérialisation.
// Toute route /api/super/* journalise ses actions via logAudit().
// T58 — Grand Nettoyage SA : les sérialiseurs de la pile « commercial v1 »
// fantôme (abonnements/factures/annonces/tickets/jobs/cles-api/sauvegardes/
// paramètres — routes supprimées, archivées via branche archive/sa-ghost-routes
// + tag archive-sa-ghost-routes-2026-10-04) ont été retirés de ce fichier.
// Conservés : logAudit (auth + routes vivantes), serializeCompte (comptes),
// serializeAudit (overview/audit/saas), serializeContrat + serializeAvenant
// (echeances), interface ContratAgregats (paramètre de serializeContrat).
import { db } from "@/lib/db"
import type {
  AuditLogDTO, AvenantDTO, CompteDTO, ContratDTO,
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
    // V7 — écrit dans AuditEvent (le journal réellement exposé par
    // /api/super/audit). Message consolidé : action · cible · détails · sévérité.
    const severite = entry.severite && entry.severite !== "NORMALE" ? entry.severite : null
    await db.auditEvent.create({
      data: {
        kind: entry.module,
        message: [
          entry.action,
          entry.cibleLabel && `${entry.cibleType} : ${entry.cibleLabel}`,
          entry.details || null,
          severite,
          entry.ip || null,
        ].filter(Boolean).join(" · "),
        actor: a.email,
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

export function serializeCompte(u: { id: string; email: string; name: string; role: string; brandSlug: string | null; active: boolean; totpEnabled: boolean; createdAt: Date }, brandName: string | null = null): CompteDTO {
  // V7 — JAMAIS de passwordHash / totpSecret dans une réponse API (fuite bloquée).
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    brandSlug: u.brandSlug,
    active: u.active,
    totpEnabled: u.totpEnabled,
    createdAt: u.createdAt.toISOString(),
    brandName,
  }
}

export function serializeAudit(l: { id: string; acteurNom: string; acteurEmail: string; acteurRole: string; module: string; action: string; cibleType: string; cibleLabel: string; details: string; severite: string; ip: string; createdAt: Date }): AuditLogDTO {
  return { ...l, createdAt: l.createdAt.toISOString() }
}

// ---- Enrichissement contrat (liste clients & fiche 360°) ----
// T58 : agregatsContrat() (requêtes db.abonnementStation/db.facture — modèles
// fantômes) a été supprimé avec ses routes consommatrices (archivées) ;
// l'interface reste car serializeContrat l'exige en paramètre — les routes
// vivantes (echeances) construisent leurs agrégats elles-mêmes.

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
