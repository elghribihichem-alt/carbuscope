// CarbuScope — Helpers serveur du module Super Administration (T33)
// Sérialisation + journalisation d'audit. Import serveur uniquement.

import { db } from "@/lib/db"
import type { Prisma } from "@prisma/client"
import {
  type AiTaskDTO, type DemographicAccessDTO, type DemographicCiteDTO, type DemographicDelegationDTO, type DemographicGouvernoratDTO, type SaasAuditDTO, type SaasContractDTO, type SaasInvoiceDTO, type SaasPlanDTO, type SaasUserDTO,
} from "@/lib/saas"
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts"

type ContractFull = Prisma.SaasContractGetPayload<{
  include: { invoices: true }
}>

export function serializeContract(
  c: ContractFull,
  stationCount: number
): SaasContractDTO {
  const effective = c.invoices.map(inv => ({
    ...inv,
    eff: inv.status !== "PAYEE" && inv.dueAt.getTime() < Date.now() ? "RETARD" : inv.status,
  }))
  const unpaid = effective.filter(i => i.eff !== "PAYEE")
  return {
    id: c.id,
    brandSlug: c.brandSlug,
    brandName: c.brandName,
    color: c.color,
    plan: c.plan,
    status: c.status,
    startedAt: c.startedAt.toISOString(),
    renewsAt: c.renewsAt.toISOString(),
    monthlyFee: c.monthlyFee,
    seats: c.seats,
    stationQuota: c.stationQuota,
    contactName: c.contactName,
    contactEmail: c.contactEmail,
    contactPhone: c.contactPhone,
    stationCount,
    invoiceCount: c.invoices.length,
    totalBilled: c.invoices.reduce((s, i) => s + i.amount, 0),
    unpaidCount: unpaid.length,
    unpaidTotal: unpaid.reduce((s, i) => s + i.amount, 0),
  }
}

type InvoiceFull = Prisma.SaasInvoiceGetPayload<{
  include: { contract: true }
}>

export function serializeInvoice(inv: InvoiceFull): SaasInvoiceDTO {
  const eff =
    inv.status !== "PAYEE" && inv.dueAt.getTime() < Date.now() ? "RETARD" : inv.status
  return {
    id: inv.id,
    number: inv.number,
    contractId: inv.contractId,
    brandName: inv.contract.brandName,
    brandSlug: inv.contract.brandSlug,
    color: inv.contract.color,
    issuedAt: inv.issuedAt.toISOString(),
    dueAt: inv.dueAt.toISOString(),
    amount: inv.amount,
    status: eff,
    paidAt: inv.paidAt?.toISOString() ?? null,
    reminderCount: inv.reminderCount,
    lastReminderAt: inv.lastReminderAt?.toISOString() ?? null,
  }
}

type UserFull = Prisma.UserGetPayload<Record<string, never>>

export function serializeUser(u: UserFull): SaasUserDTO {
  const persona = DEMO_ACCOUNTS.find(a => a.email.toLowerCase() === u.email.toLowerCase())
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    brandSlug: u.brandSlug,
    active: u.active,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    personaId: persona?.id ?? null,
    totpEnabled: u.totpEnabled ?? false,
  }
}

type AuditFull = Prisma.AuditEventGetPayload<Record<string, never>>

export function serializeAudit(e: AuditFull): SaasAuditDTO {
  return {
    id: e.id,
    kind: e.kind,
    message: e.message,
    actor: e.actor,
    brandSlug: e.brandSlug,
    createdAt: e.createdAt.toISOString(),
  }
}

type AiTaskFull = Prisma.AiTaskGetPayload<Record<string, never>>

/** Sérialise une tâche de l'agent IA interne (Phase 3 Super Admin). */
export function serializeAiTask(t: AiTaskFull): AiTaskDTO {
  return {
    id: t.id,
    title: t.title,
    instruction: t.instruction,
    status: t.status,
    result: t.result,
    error: t.error,
    launchedAt: t.launchedAt?.toISOString() ?? null,
    finishedAt: t.finishedAt?.toISOString() ?? null,
    durationMs: t.durationMs,
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

type PlanFull = Prisma.SaasPlanGetPayload<Record<string, never>>

/** Sérialise un plan du catalogue avec ses stats dérivées des contrats. */
export function serializePlan(
  p: PlanFull,
  stats: { contractsCount: number; contractsActive: number; mrr: number }
): SaasPlanDTO {
  return {
    id: p.id,
    code: p.code,
    label: p.label,
    monthlyFee: p.monthlyFee,
    seatsIncluded: p.seatsIncluded,
    stationQuota: p.stationQuota,
    features: p.features.split("|").map(f => f.trim()).filter(Boolean),
    sortOrder: p.sortOrder,
    active: p.active,
    ...stats,
  }
}

type DemographicGovFull = Prisma.GovernoratStatGetPayload<Record<string, never>>

/** Sérialise la référence INS 2024 d'un gouvernorat (module Démographie). */
export function serializeDemographicGouvernorat(g: DemographicGovFull): DemographicGouvernoratDTO {
  return {
    id: g.id,
    name: g.name,
    isoCode: g.isoCode,
    population: g.population,
    menPct: g.menPct,
    womenPct: g.womenPct,
    areaKm2: g.areaKm2,
    urbanPct: g.urbanPct,
    ruralPct: g.ruralPct,
    estimated: g.estimated,
    delegationCount: g.delegationCount,
    vehicles: g.vehicles,
    motorizationRate: g.motorizationRate,
    avgFleetAge: g.avgFleetAge,
    updatedAt: g.updatedAt?.toISOString() ?? null,
    updatedBy: g.updatedBy,
  }
}

// ---- T37 : sérialisation d'un accès démographie (volet Paramétrage) ----

type DemographicAccessFull = Prisma.DemographicAccessGetPayload<Record<string, never>>

/** Accès démographie sérialisé (jointure utilisateur faite en amont). */
export function serializeDemographicAccess(
  a: DemographicAccessFull,
  user: { id: string; email: string; name: string; brandSlug: string | null },
): DemographicAccessDTO {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    brandSlug: user.brandSlug,
    level: a.level === "CITES" ? "CITES" : a.level === "DELEGATIONS" ? "DELEGATIONS" : "GOUVERNORATS",
    canEdit: a.canEdit,
    updatedAt: a.updatedAt.toISOString(),
    updatedBy: a.updatedBy,
  }
}

type DemographicDelegationFull = Prisma.DemographicDelegationGetPayload<Record<string, never>>

type DemographicCiteFull = Prisma.DemographicCiteGetPayload<Record<string, never>>

/** Sérialise une ligne de cité du tableau démographique (T45 — 3ᵉ niveau). */
export function serializeDemographicCite(c: DemographicCiteFull): DemographicCiteDTO {
  return {
    id: c.id,
    gouvernorat: c.gouvernorat,
    delegation: c.delegation,
    cite: c.cite,
    population: c.population,
    urbanPct: c.urbanPct,
    vehiclesLight: c.vehiclesLight,
    vehiclesUtility: c.vehiclesUtility,
    vehiclesHeavy: c.vehiclesHeavy,
    vehiclesBuses: c.vehiclesBuses,
    vehiclesMotorcycles: c.vehiclesMotorcycles,
    source: c.source,
    updatedAt: c.updatedAt?.toISOString() ?? null,
    updatedBy: c.updatedBy,
  }
}

/** Sérialise une ligne de délégation du tableau démographique. */
export function serializeDemographicDelegation(d: DemographicDelegationFull): DemographicDelegationDTO {
  return {
    id: d.id,
    gouvernorat: d.gouvernorat,
    isoCode: d.isoCode,
    delegation: d.delegation,
    population: d.population,
    urbanPct: d.urbanPct,
    ruralPct: d.ruralPct,
    vehiclesLight: d.vehiclesLight,
    vehiclesUtility: d.vehiclesUtility,
    vehiclesHeavy: d.vehiclesHeavy,
    vehiclesBuses: d.vehiclesBuses,
    vehiclesMotorcycles: d.vehiclesMotorcycles,
    updatedAt: d.updatedAt?.toISOString() ?? null,
    updatedBy: d.updatedBy,
  }
}

/** Journalise une action sensible de la Super Administration. */
export async function logAudit(input: {
  kind: string
  message: string
  actor?: string
  brandSlug?: string | null
}) {
  const kinds = ["AUTH", "CONTRAT", "FACTURE", "UTILISATEUR", "IMPERSONATION", "SYSTEME", "AGENT_IA", "DEMOGRAPHIE"]
  if (!kinds.includes(input.kind)) throw new Error(`kind invalide: ${input.kind}`)
  return db.auditEvent.create({
    data: {
      kind: input.kind,
      message: input.message.slice(0, 300),
      actor: input.actor?.slice(0, 120) || "system",
      brandSlug: input.brandSlug ?? null,
    },
  })
}

/** Statut effectif d'une facture en base (retard dérivé de l'échéance). */
export function effectiveStatusInDb(status: string, dueAt: Date): "PAYEE" | "IMPAYEE" | "RETARD" {
  if (status === "PAYEE") return "PAYEE"
  return dueAt.getTime() < Date.now() ? "RETARD" : "IMPAYEE"
}
