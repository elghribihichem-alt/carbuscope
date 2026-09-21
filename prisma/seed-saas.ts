/**
 * CarbuScope — Seed Super Administration (T33)
 * Contrats SaaS des enseignes clientes, factures mensuelles, comptes
 * utilisateurs plateforme et journal d'audit.
 * Exécution : bun prisma/seed-saas.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const daysAgo = (n: number) => new Date(now - n * DAY)
const daysFromNow = (n: number) => new Date(now + n * DAY)

async function main() {
  console.log("🧹 Nettoyage SaaS (contrats, factures, audit)…")
  await db.auditEvent.deleteMany()
  await db.saasInvoice.deleteMany()
  await db.saasContract.deleteMany()

  console.log("📑 Contrats & abonnements…")
  const contracts = [
    {
      brandSlug: "agil", brandName: "Agil", color: "#dc2626",
      plan: "ENTERPRISE", status: "ACTIF",
      startedAt: daysAgo(430), renewsAt: daysFromNow(76),
      monthlyFee: 2450, seats: 25, stationQuota: 250,
      contactName: "Sonia Beji", contactEmail: "sonia.beji@agil.tn", contactPhone: "+216 71 123 456",
    },
    {
      brandSlug: "totalenergies", brandName: "TotalEnergies", color: "#ea580c",
      plan: "PRO", status: "ACTIF",
      startedAt: daysAgo(310), renewsAt: daysFromNow(24),
      monthlyFee: 1690, seats: 15, stationQuota: 200,
      contactName: "Leila Mansour", contactEmail: "leila.mansour@totalenergies.tn", contactPhone: "+216 71 654 321",
    },
    {
      brandSlug: "shell", brandName: "Shell", color: "#d9a514",
      plan: "PRO", status: "ACTIF",
      startedAt: daysAgo(210), renewsAt: daysFromNow(52),
      monthlyFee: 1490, seats: 12, stationQuota: 120,
      contactName: "Karim Trabelsi", contactEmail: "karim.trabelsi@shell.tn", contactPhone: "+216 71 987 654",
    },
    {
      brandSlug: "staroil", brandName: "Staroil", color: "#059669",
      plan: "PRO", status: "SUSPENDU",
      startedAt: daysAgo(260), renewsAt: daysAgo(12),
      monthlyFee: 1290, seats: 10, stationQuota: 150,
      contactName: "Anis Ferjani", contactEmail: "anis.ferjani@staroil.tn", contactPhone: "+216 76 111 222",
    },
    {
      brandSlug: "ola", brandName: "Ola Energy", color: "#9333ea",
      plan: "ESSENTIEL", status: "ESSAI",
      startedAt: daysAgo(18), renewsAt: daysFromNow(12),
      monthlyFee: 890, seats: 5, stationQuota: 100,
      contactName: "Mehdi Gharbi", contactEmail: "mehdi.gharbi@ola.tn", contactPhone: "+216 74 333 444",
    },
  ]
  const created: Record<string, string> = {}
  for (const c of contracts) {
    const row = await db.saasContract.create({ data: c })
    created[c.brandSlug] = row.id
  }

  console.log("🧾 Facturation mensuelle…")
  let counter = 41
  const invoicePlan: { slug: string; months: [number, string][] }[] = [
    // [mois d'échéance en jours depuis aujourd'hui (négatif = passé), statut]
    { slug: "agil", months: [[-150, "PAYEE"], [-120, "PAYEE"], [-90, "PAYEE"], [-60, "PAYEE"], [-30, "PAYEE"], [-2, "IMPAYEE"]] },
    { slug: "totalenergies", months: [[-120, "PAYEE"], [-90, "PAYEE"], [-60, "PAYEE"], [-30, "IMPAYEE"], [-9, "RETARD"]] },
    { slug: "shell", months: [[-90, "PAYEE"], [-60, "PAYEE"], [-30, "PAYEE"], [-4, "IMPAYEE"]] },
    { slug: "staroil", months: [[-60, "PAYEE"], [-30, "IMPAYEE"], [-12, "RETARD"], [-42, "PAYEE"]] },
    { slug: "ola", months: [[-15, "PAYEE"]] }, // émission d'essai (0 DT après conversion ?) — essai payant 1 mois
  ]
  const year = 2025
  for (const plan of invoicePlan) {
    const contract = contracts.find(c => c.brandSlug === plan.slug)!
    for (const [dueOffset, status] of [...plan.months].sort((a, b) => a[0] - b[0])) {
      const dueAt = daysAgo(-dueOffset)
      const issuedAt = new Date(dueAt.getTime() - 30 * DAY)
      const amount = contract.monthlyFee
      const number = `FCT-${year}-${String(counter++).padStart(4, "0")}`
      await db.saasInvoice.create({
        data: {
          contractId: created[plan.slug],
          number,
          issuedAt,
          dueAt,
          amount,
          status,
          paidAt: status === "PAYEE" ? new Date(dueAt.getTime() - 3 * DAY) : null,
        },
      })
    }
  }

  console.log("👥 Comptes utilisateurs plateforme…")
  const users = [
    { email: "sonia.beji@agil.tn", name: "Sonia Beji", role: "ADMIN", brandSlug: "agil", active: true, lastLoginAt: daysAgo(0) },
    { email: "nadia.haddad@agil.tn", name: "Nadia Haddad", role: "ADMIN", brandSlug: "agil", active: true, lastLoginAt: daysAgo(1) },
    { email: "salma.ferhat@agil.tn", name: "Salma Ferhat", role: "NETWORK", brandSlug: "agil", active: true, lastLoginAt: daysAgo(3) },
    { email: "riadh.jelassi@agil.tn", name: "Riadh Jelassi", role: "VIEWER", brandSlug: "agil", active: true, lastLoginAt: daysAgo(9) },
    { email: "leila.mansour@totalenergies.tn", name: "Leila Mansour", role: "VIEWER", brandSlug: "totalenergies", active: true, lastLoginAt: daysAgo(2) },
    { email: "ines.chaabane@totalenergies.tn", name: "Ines Chaabane", role: "NETWORK", brandSlug: "totalenergies", active: true, lastLoginAt: daysAgo(6) },
    { email: "karim.trabelsi@shell.tn", name: "Karim Trabelsi", role: "COMMERCIAL", brandSlug: "shell", active: true, lastLoginAt: daysAgo(1) },
    { email: "amine.said@shell.tn", name: "Amine Said", role: "VIEWER", brandSlug: "shell", active: true, lastLoginAt: daysAgo(14) },
    { email: "mehdi.gharbi@ola.tn", name: "Mehdi Gharbi", role: "EXPANSION", brandSlug: "ola", active: true, lastLoginAt: daysAgo(0) },
    { email: "anis.ferjani@staroil.tn", name: "Anis Ferjani", role: "ADMIN", brandSlug: "staroil", active: false, lastLoginAt: daysAgo(34) },
  ]
  for (const u of users) {
    await db.user.upsert({
      where: { email: u.email },
      create: u,
      update: { name: u.name, role: u.role, brandSlug: u.brandSlug, active: u.active, lastLoginAt: u.lastLoginAt },
    })
  }

  console.log("🛡️ Journal d'audit…")
  const events = [
    { kind: "SYSTEME", message: "Sauvegarde chiffrée de la base terminée (6,2 Go)", actor: "system", brandSlug: null as string | null, createdAt: daysAgo(0.2) },
    { kind: "AUTH", message: "Connexion super-administratrice depuis 193.95.22.10", actor: "rania.feki@carbuscope.tn", brandSlug: null, createdAt: daysAgo(0.4) },
    { kind: "FACTURE", message: "Facture FCT-2025-0044 payée (TotalEnergies, 1 690,00 DT)", actor: "rania.feki@carbuscope.tn", brandSlug: "totalenergies", createdAt: daysAgo(1) },
    { kind: "CONTRAT", message: "Relance de renouvellement envoyée à Staroil (échéance dépassée)", actor: "rania.feki@carbuscope.tn", brandSlug: "staroil", createdAt: daysAgo(2) },
    { kind: "UTILISATEUR", message: "Compte « Anis Ferjani » (Staroil) suspendu — impayés", actor: "rania.feki@carbuscope.tn", brandSlug: "staroil", createdAt: daysAgo(4) },
    { kind: "IMPERSONATION", message: "Prise de main sur « Sonia Beji » (Agil) pour diagnostic", actor: "rania.feki@carbuscope.tn", brandSlug: "agil", createdAt: daysAgo(5) },
    { kind: "CONTRAT", message: "Essai « Ola Energy » démarré (plan Essentiel, 30 jours)", actor: "system", brandSlug: "ola", createdAt: daysAgo(18) },
    { kind: "FACTURE", message: "Facture FCT-2025-0040 en retard (Staroil, 1 290,00 DT)", actor: "system", brandSlug: "staroil", createdAt: daysAgo(12) },
    { kind: "CONTRAT", message: "Contrat Shell renouvelé 12 mois (plan Pro)", actor: "rania.feki@carbuscope.tn", brandSlug: "shell", createdAt: daysAgo(31) },
    { kind: "AUTH", message: "Échec de connexion répété — compte temporairement verrouillé (anis.ferjani@staroil.tn)", actor: "anis.ferjani@staroil.tn", brandSlug: "staroil", createdAt: daysAgo(33) },
  ]
  for (const e of events) {
    await db.auditEvent.create({ data: e })
  }

  const nContracts = await db.saasContract.count()
  const nInvoices = await db.saasInvoice.count()
  const nUsers = await db.user.count()
  const nAudit = await db.auditEvent.count()
  console.log(`✅ Seed SaaS terminé — ${nContracts} contrats, ${nInvoices} factures, ${nUsers} utilisateurs, ${nAudit} événements d'audit.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
