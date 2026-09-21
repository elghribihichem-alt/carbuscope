// CarbuScope — Helpers serveur du module Super Administration (T33)
// Sérialisation + journalisation d'audit. Import serveur uniquement.

import { db } from "@/lib/db"
import type { Prisma } from "@prisma/client"
import {
  type SaasAuditDTO, type SaasContractDTO, type SaasInvoiceDTO, type SaasUserDTO,
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

/** Journalise une action sensible de la Super Administration. */
export async function logAudit(input: {
  kind: string
  message: string
  actor?: string
  brandSlug?: string | null
}) {
  const kinds = ["AUTH", "CONTRAT", "FACTURE", "UTILISATEUR", "IMPERSONATION", "SYSTEME"]
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
