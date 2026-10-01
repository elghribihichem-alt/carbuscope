// ============================================================================
// CarbuScope — T54-B3b — lib serveur partagée des routes /api/franchise/*.
//
// FRANCHISE = saisie INTERNE enseigne V1 (formulaire public = V2, exclu de ce
// round). Auth « enseigne » : une session est exigée ; l'enseigne est résolue
// depuis la SESSION (user.brandSlug — pattern du portail) avec possibilité de
// la préciser via ?brand= pour les comptes plateforme/Super Admin :
//   · session avec brandSlug  → enseigne IMPOSÉE (un compte enseigne ne peut
//     ni lire ni muter les candidatures/contrats d'une autre enseigne — 403) ;
//   · session sans brandSlug  → paramètre brand requis (400 sinon) ;
//   · pas de session          → 401.
// Rôles en écrit : SUPER_ADMIN, ADMIN, EXPANSION, COMMERCIAL, DG (le module
// Radar est visible pour les mêmes profils côté sidebar — T54-A2B1). La
// lecture est ouverte à toute session de l'enseigne (consultation).
// Conventions : AuditEvent module « FRANCHISE » sur chaque mutation,
// messages d'erreur 100 % FR, schéma T54-A1 GELÉ (aucun modèle modifié).
// ============================================================================

import { getSessionUser } from "@/lib/auth"

/** Rôles autorisés à créer / faire évoluer candidatures et contrats. */
export const FRANCHISE_WRITE_ROLES: ReadonlySet<string> = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "EXPANSION",
  "COMMERCIAL",
  "DG",
])

export type BrandSession =
  | { ok: true; brand: string; email: string; role: string }
  | { ok: false; status: number; error: string }

/**
 * Résout l'enseigne effective d'une requête franchise (session d'abord,
 * paramètre brand ensuite pour les comptes sans enseigne).
 */
export async function resolveBrandSession(brandParam: string | null): Promise<BrandSession> {
  const session = await getSessionUser()
  if (!session) {
    return {
      ok: false,
      status: 401,
      error: "Connexion requise — le module franchise est une saisie interne enseigne.",
    }
  }
  if (session.brandSlug) {
    if (brandParam && brandParam.trim() !== session.brandSlug) {
      return {
        ok: false,
        status: 403,
        error: `Accès réservé à votre enseigne (${session.brandSlug}).`,
      }
    }
    return { ok: true, brand: session.brandSlug, email: session.email, role: session.role }
  }
  const brand = (brandParam ?? "").trim()
  if (!brand) {
    return {
      ok: false,
      status: 400,
      error: "Paramètre « brand » requis pour les comptes plateforme (précisez l'enseigne).",
    }
  }
  return { ok: true, brand, email: session.email, role: session.role }
}

/* ============================== Pipeline candidatures ============================== */

/**
 * Transitions VALIDES du pipeline de candidature (spec T54-B3b, chaîne
 * stricte documentée) :
 *   NEW → CONTACTED → INTERVIEW → APPROVED | REJECTED
 * APPROVED et REJECTED sont terminaux (aucun retour possible).
 */
export const CANDIDATE_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  NEW: ["CONTACTED"],
  CONTACTED: ["INTERVIEW"],
  INTERVIEW: ["APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: [],
}

export const CANDIDATE_STATUS_LABELS: Readonly<Record<string, string>> = {
  NEW: "Nouveau",
  CONTACTED: "Contacté",
  INTERVIEW: "Entretien",
  APPROVED: "Approuvé",
  REJECTED: "Rejeté",
}

/* ============================== Cycle de vie contrats ============================== */

/**
 * Transitions VALIDES du contrat (sens unique, spec T54-B3b) :
 *   DRAFT → SENT → SIGNED → ACTIVE → TERMINATED
 * (TERMINATED est terminal ; aucune marche arrière.)
 */
export const CONTRACT_NEXT: Readonly<Record<string, string>> = {
  DRAFT: "SENT",
  SENT: "SIGNED",
  SIGNED: "ACTIVE",
  ACTIVE: "TERMINATED",
  TERMINATED: "",
}

export const CONTRACT_STATUS_LABELS: Readonly<Record<string, string>> = {
  DRAFT: "Brouillon",
  SENT: "Envoyé",
  SIGNED: "Signé",
  ACTIVE: "Actif",
  TERMINATED: "Résilié",
}

/* ============================== Références de contrats ============================== */

/**
 * Génère la prochaine référence « FR-2025-00N » : N = max des numéros
 * existants à préfixe FR-2025- + 1 (padding 3 chiffres). Famille fixe
 * « FR-2025- » conformément à la spec T54-B3b (les 6 contrats seedés T54-A1
 * suivent déjà cette nomenclature).
 */
export function nextContractReference(existingReferences: readonly string[]): string {
  let max = 0
  for (const ref of existingReferences) {
    const m = /^FR-2025-(\d+)$/.exec(ref.trim())
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `FR-2025-${String(max + 1).padStart(3, "0")}`
}
