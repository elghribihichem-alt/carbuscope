// CarbuScope — Module Démographie (T37) : validations serveur partagées
// entre /api/super/demographie (Super Administration) et /api/demographie
// (utilisateurs autorisés via le volet « Paramétrage »). Import serveur
// uniquement — messages d'erreur en français.

import { db } from "@/lib/db"
import { logAudit, serializeDemographicDelegation, serializeDemographicGouvernorat } from "@/lib/saas-server"
import { VEHICLE_CATEGORIES } from "@/lib/saas"

// ---- Champs éditables ----

export const DELEGATION_INT_FIELDS = ["population", ...VEHICLE_CATEGORIES.map(v => v.key)] as const
export const DELEGATION_PCT_FIELDS = ["urbanPct", "ruralPct"] as const

/** Champs du volet Gouvernorats — requis = non effaçables (modèle historique
 *  alimentant carte, implantation, rapports, calculateurs, back-office). */
export const GOVERNORAT_REQUIRED_INT_FIELDS = ["population", "vehicles"] as const
export const GOVERNORAT_REQUIRED_FLOAT_FIELDS = ["motorizationRate", "avgFleetAge"] as const
export const GOVERNORAT_OPTIONAL_PCT_FIELDS = ["menPct", "womenPct", "urbanPct", "ruralPct"] as const
export const GOVERNORAT_OPTIONAL_FLOAT_FIELDS = ["areaKm2"] as const

export const GOVERNORAT_FIELDS = new Set<string>([
  ...GOVERNORAT_REQUIRED_INT_FIELDS,
  ...GOVERNORAT_REQUIRED_FLOAT_FIELDS,
  ...GOVERNORAT_OPTIONAL_PCT_FIELDS,
  ...GOVERNORAT_OPTIONAL_FLOAT_FIELDS,
])

/** Libellés FR courts pour les messages d'erreur et d'audit. */
export const DEMOGRAPHIE_FIELD_LABELS: Record<string, string> = {
  population: "population",
  urbanPct: "taux urbain",
  ruralPct: "taux rural",
  menPct: "part des hommes",
  womenPct: "part des femmes",
  areaKm2: "superficie",
  vehicles: "parc automobile",
  motorizationRate: "taux de motorisation",
  avgFleetAge: "âge moyen du parc",
  ...Object.fromEntries(VEHICLE_CATEGORIES.map(v => [v.key, v.short.toLowerCase()])),
}

/** Nombre fr pour l'audit : « 52 400 » / « 78,5 % ». */
export function fmtAuditValue(field: string, v: number): string {
  if (field === "urbanPct" || field === "ruralPct" || field === "menPct"
    || field === "womenPct" || field === "motorizationRate") {
    return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`
  }
  if (field === "avgFleetAge") {
    return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ans`
  }
  if (field === "areaKm2") {
    return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} km²`
  }
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })
}

// ---- Types de sortie ----

export type DelegationValues = Record<string, number | null>
export type GouvernoratValues = Record<string, number | null>

// ---- Import en masse (T37) : champs acceptés côté serveur ----

// Les lignes d'import sont NORMALISÉES côté client (lib/demographie-io.ts —
// alias FR complets « Population », « Urbain (%) », « voitures légères »…)
// vers ces clés canoniques. Le serveur n'accepte QUE ces clés : les champs
// d'identité (name / isoCode / gouvernorat / delegation) servent à retrouver
// la ligne, les autres passent par validateGouvernoratValues /
// validateDelegationValues (types, 0-100 %, complément à 100 %).

/** Champs acceptés à l'import — volet Gouvernorats (identité + valeurs). */
export const GOV_IMPORT_ALIASES: Record<string, string> = {
  name: "gouvernorat",
  isoCode: "code iso",
  population: "population",
  menPct: "hommes (%)",
  womenPct: "femmes (%)",
  areaKm2: "superficie (km²)",
  urbanPct: "urbain (%)",
  ruralPct: "rural (%)",
  vehicles: "véhicules",
  motorizationRate: "motorisation (%)",
  avgFleetAge: "âge du parc (ans)",
}

/** Champs acceptés à l'import — volet Délégations (identité + valeurs). */
export const DELEG_IMPORT_ALIASES: Record<string, string> = {
  gouvernorat: "gouvernorat",
  delegation: "délégation",
  population: "population",
  urbanPct: "urbain (%)",
  ruralPct: "rural (%)",
  ...Object.fromEntries(VEHICLE_CATEGORIES.map(v => [v.key, v.label.toLowerCase()])),
}

// ---- Validation : délégation (identique au comportement T35) ----

export function validateDelegationValues(rawValues: unknown): { ok: true; values: DelegationValues } | { ok: false; error: string } {
  if (!rawValues || typeof rawValues !== "object" || Array.isArray(rawValues)) {
    return { ok: false, error: "Champ « values » invalide" }
  }
  const values: DelegationValues = {}
  for (const [field, raw] of Object.entries(rawValues as Record<string, unknown>)) {
    if (!DELEGATION_INT_FIELDS.includes(field as (typeof DELEGATION_INT_FIELDS)[number])
      && !DELEGATION_PCT_FIELDS.includes(field as (typeof DELEGATION_PCT_FIELDS)[number])) {
      return { ok: false, error: `Champ non modifiable : ${field}` }
    }
    if (raw === null || raw === "") {
      values[field] = null
      continue
    }
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      return { ok: false, error: `Valeur invalide pour « ${DEMOGRAPHIE_FIELD_LABELS[field] ?? field} » — nombre attendu` }
    }
    if (DELEGATION_PCT_FIELDS.includes(field as (typeof DELEGATION_PCT_FIELDS)[number])) {
      if (raw < 0 || raw > 100) {
        return { ok: false, error: `Le taux ${field === "urbanPct" ? "urbain" : "rural"} doit être un nombre entre 0 et 100` }
      }
    } else {
      const max = field === "population" ? 10_000_000 : 5_000_000
      if (!Number.isInteger(raw) || raw < 0 || raw > max) {
        return { ok: false, error: `« ${DEMOGRAPHIE_FIELD_LABELS[field] ?? field} » doit être un nombre entier positif` }
      }
    }
    values[field] = raw
  }
  if (Object.keys(values).length === 0) {
    return { ok: false, error: "Aucune valeur à enregistrer" }
  }
  if (values.urbanPct !== undefined && values.ruralPct !== undefined
    && values.urbanPct !== null && values.ruralPct !== null
    && Math.abs(values.urbanPct + values.ruralPct - 100) > 0.51) {
    return { ok: false, error: "La somme des taux urbain et rural doit faire 100 %" }
  }
  return { ok: true, values }
}

// ---- Validation : gouvernorat (volet Gouvernorats, T37) ----

export function validateGouvernoratValues(rawValues: unknown): { ok: true; values: GouvernoratValues } | { ok: false; error: string } {
  if (!rawValues || typeof rawValues !== "object" || Array.isArray(rawValues)) {
    return { ok: false, error: "Champ « values » invalide" }
  }
  const values: GouvernoratValues = {}
  for (const [field, raw] of Object.entries(rawValues as Record<string, unknown>)) {
    if (!GOVERNORAT_FIELDS.has(field)) {
      return { ok: false, error: `Champ non modifiable : ${field}` }
    }
    const label = DEMOGRAPHIE_FIELD_LABELS[field] ?? field
    const isRequiredInt = GOVERNORAT_REQUIRED_INT_FIELDS.includes(field as (typeof GOVERNORAT_REQUIRED_INT_FIELDS)[number])
    const isRequiredFloat = GOVERNORAT_REQUIRED_FLOAT_FIELDS.includes(field as (typeof GOVERNORAT_REQUIRED_FLOAT_FIELDS)[number])
    const isPct = GOVERNORAT_OPTIONAL_PCT_FIELDS.includes(field as (typeof GOVERNORAT_OPTIONAL_PCT_FIELDS)[number])

    if (raw === null || raw === "") {
      if (isRequiredInt || isRequiredFloat) {
        return { ok: false, error: `« ${label} » est un champ requis — effacement impossible` }
      }
      values[field] = null
      continue
    }
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      return { ok: false, error: `Valeur invalide pour « ${label} » — nombre attendu` }
    }
    if (isPct || field === "motorizationRate") {
      if (raw < 0 || raw > 100) {
        return { ok: false, error: `« ${label} » doit être un nombre entre 0 et 100` }
      }
    } else if (field === "avgFleetAge") {
      if (raw < 0 || raw > 50) {
        return { ok: false, error: `« ${label} » doit être un nombre entre 0 et 50 ans` }
      }
    } else if (field === "areaKm2") {
      if (raw <= 0 || raw > 100_000) {
        return { ok: false, error: `« ${label} » doit être un nombre positif (km²)` }
      }
    } else {
      // population / vehicles : entiers positifs
      if (!Number.isInteger(raw) || raw < 0 || raw > 10_000_000) {
        return { ok: false, error: `« ${label} » doit être un nombre entier positif` }
      }
    }
    values[field] = raw
  }
  if (Object.keys(values).length === 0) {
    return { ok: false, error: "Aucune valeur à enregistrer" }
  }
  if (values.urbanPct !== undefined && values.ruralPct !== undefined
    && values.urbanPct !== null && values.ruralPct !== null
    && Math.abs(values.urbanPct + values.ruralPct - 100) > 0.51) {
    return { ok: false, error: "La somme des taux urbain et rural doit faire 100 %" }
  }
  if (values.menPct !== undefined && values.womenPct !== undefined
    && values.menPct !== null && values.womenPct !== null
    && Math.abs(values.menPct + values.womenPct - 100) > 0.51) {
    return { ok: false, error: "La somme des parts hommes et femmes doit faire 100 %" }
  }
  return { ok: true, values }
}

// ---- Application des mises à jour (db + audit), partagée par les routes ----

type ApplyResult<T> = { ok: true; row: T } | { ok: false; status: number; error: string }

/** Enregistre un patch validé sur une délégation + journalise l'audit. */
export async function applyDelegationUpdate(
  id: string,
  values: DelegationValues,
  actor: string | undefined,
): Promise<ApplyResult<ReturnType<typeof serializeDemographicDelegation>>> {
  const row = await db.demographicDelegation.findUnique({ where: { id } })
  if (!row) return { ok: false, status: 404, error: "Délégation introuvable" }
  const updated = await db.demographicDelegation.update({
    where: { id },
    data: { ...values, updatedAt: new Date(), updatedBy: actor ?? "system" },
  })
  const changes = Object.entries(values)
    .map(([field, v]) => `${DEMOGRAPHIE_FIELD_LABELS[field] ?? field} ${v === null ? "effacé" : fmtAuditValue(field, v)}`)
    .join(" · ")
  await logAudit({
    kind: "DEMOGRAPHIE",
    message: `Démographie — ${row.gouvernorat} / ${row.delegation} : ${changes}`,
    actor,
  })
  return { ok: true, row: serializeDemographicDelegation(updated) }
}

/** Enregistre un patch validé sur un gouvernorat + journalise l'audit. */
export async function applyGouvernoratUpdate(
  id: string,
  values: GouvernoratValues,
  actor: string | undefined,
): Promise<ApplyResult<ReturnType<typeof serializeDemographicGouvernorat>>> {
  const row = await db.governoratStat.findUnique({ where: { id } })
  if (!row) return { ok: false, status: 404, error: "Gouvernorat introuvable" }
  const updated = await db.governoratStat.update({
    where: { id },
    data: { ...values, updatedAt: new Date(), updatedBy: actor ?? "system" },
  })
  const changes = Object.entries(values)
    .map(([field, v]) => `${DEMOGRAPHIE_FIELD_LABELS[field] ?? field} ${v === null ? "effacé" : fmtAuditValue(field, v)}`)
    .join(" · ")
  await logAudit({
    kind: "DEMOGRAPHIE",
    message: `Démographie — gouvernorat ${row.name} : ${changes}`,
    actor,
  })
  return { ok: true, row: serializeDemographicGouvernorat(updated) }
}
