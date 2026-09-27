/**
 * CarbuScope — Seed Super Administration (T33)
 * Contrats SaaS des enseignes clientes, factures mensuelles, comptes
 * utilisateurs plateforme, journal d'audit, tâches de l'agent IA (Phase 3)
 * et module Démographie (Phase 4 : 24 gouvernorats INS 2024 + 277 délégations).
 * Exécution : bunx tsx prisma/seed-saas.ts
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

  // Reset Phase 3 (T33) : settings agent IA, zone cartographique et tâches
  // créées pendant les QA (les 2 tâches de démonstration sont conservées).
  console.log("🧹 Reset Phase 3 (agent IA + cartographie)…")
  await db.aiAgentUserSetting.deleteMany()
  await db.aiAgentBrandSetting.deleteMany()
  await db.cartoBoundary.deleteMany()
  await db.aiTask.deleteMany({ where: { id: { notIn: ["ai-demo-relances", "ai-demo-synthese"] } } })

  // Reset Phase 4 (T35) : module Démographie — les délégations sont recréées
  // vierges ci-dessous (valeurs éditables remises à zéro, structure conservée).
  // T37 : les accès de visibilité (volet Paramétrage) sont re-seedés.
  console.log("🧹 Reset Phase 4 (module Démographie)…")
  await db.demographicDelegation.deleteMany()
  await db.demographicAccess.deleteMany()

  console.log("🏷️ Catalogue des plans tarifaires (upserts)…")
  // features FR séparées par « | » (T32)
  const plans = [
    {
      code: "ESSENTIEL", label: "Essentiel", monthlyFee: 890,
      seatsIncluded: 5, stationQuota: 100, sortOrder: 1,
      features: "Observatoire prix & concurrence|Rapport hebdo|1 gouvernorat",
    },
    {
      code: "PRO", label: "Pro", monthlyFee: 1490,
      seatsIncluded: 15, stationQuota: 300, sortOrder: 2,
      features: "Tout Essentiel|Portail enseigne complet|Veille terrain|Exports CSV",
    },
    {
      code: "ENTERPRISE", label: "Enterprise", monthlyFee: 2450,
      seatsIncluded: 25, stationQuota: 500, sortOrder: 3,
      features: "Tout Pro|API dédiée|Back-office souverain|Support prioritaire",
    },
  ]
  for (const p of plans) {
    await db.saasPlan.upsert({ where: { code: p.code }, create: p, update: p })
  }

  console.log("📑 Contrats & abonnements…")
  const contracts = [
    {
      brandSlug: "agil", brandName: "Agil", color: "#dc2626",
      plan: "ENTERPRISE", status: "ACTIF",
      startedAt: daysAgo(430), renewsAt: daysFromNow(76),
      monthlyFee: 3450, seats: 30, stationQuota: 1300,
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

  console.log("🛡️ Journal d'audit (25 événements sur ~2 mois, plus récents d'abord)…")
  const events = [
    // J0 → J-7 : activité courante
    { kind: "SYSTEME", message: "Sauvegarde chiffrée de la base terminée (6,2 Go)", actor: "system", brandSlug: null as string | null, createdAt: daysAgo(0.2) },
    { kind: "AUTH", message: "Connexion super-administratrice depuis 193.95.22.10", actor: "rania.feki@carbuscope.tn", brandSlug: null, createdAt: daysAgo(0.4) },
    { kind: "FACTURE", message: "Facture FCT-2025-0044 payée (TotalEnergies, 1 690,00 DT)", actor: "rania.feki@carbuscope.tn", brandSlug: "totalenergies", createdAt: daysAgo(1) },
    { kind: "CONTRAT", message: "Relance de renouvellement envoyée à Staroil (échéance dépassée)", actor: "rania.feki@carbuscope.tn", brandSlug: "staroil", createdAt: daysAgo(2) },
    { kind: "DEMOGRAPHIE", message: "Référentiel démographique importé (INS 2024) : 24 gouvernorats, 277 délégations", actor: "system", brandSlug: null, createdAt: daysAgo(1.5) },
    { kind: "UTILISATEUR", message: "Compte « Anis Ferjani » (Staroil) suspendu — impayés", actor: "rania.feki@carbuscope.tn", brandSlug: "staroil", createdAt: daysAgo(4) },
    { kind: "AUTH", message: "Connexion direction commerciale depuis 41.226.11.8 (Karim Trabelsi, Shell)", actor: "karim.trabelsi@shell.tn", brandSlug: "shell", createdAt: daysAgo(6) },
    // J-9 → J-27 : pilotage hebdomadaire
    { kind: "FACTURE", message: "Facture FCT-2025-0046 relancée (Agil, 2 450,00 DT — relance n° 2)", actor: "rania.feki@carbuscope.tn", brandSlug: "agil", createdAt: daysAgo(9) },
    { kind: "FACTURE", message: "Facture FCT-2025-0040 en retard (Staroil, 1 290,00 DT)", actor: "system", brandSlug: "staroil", createdAt: daysAgo(12) },
    { kind: "UTILISATEUR", message: "Nouveau compte « Ines Chaabane » créé (TotalEnergies, rôle NETWORK)", actor: "leila.mansour@totalenergies.tn", brandSlug: "totalenergies", createdAt: daysAgo(14) },
    { kind: "SYSTEME", message: "Veille automatisée des notes exécutée : 34 alertes évaluées, 3 déclenchées", actor: "system", brandSlug: null, createdAt: daysAgo(15) },
    { kind: "CONTRAT", message: "Essai « Ola Energy » démarré (plan Essentiel, 30 jours)", actor: "system", brandSlug: "ola", createdAt: daysAgo(18) },
    { kind: "CONTRAT", message: "Contrat Shell renouvelé 12 mois (plan Pro)", actor: "rania.feki@carbuscope.tn", brandSlug: "shell", createdAt: daysAgo(21) },
    { kind: "FACTURE", message: "Facture FCT-2025-0039 payée (Shell, 1 490,00 DT)", actor: "rania.feki@carbuscope.tn", brandSlug: "shell", createdAt: daysAgo(24) },
    { kind: "AUTH", message: "Échec de connexion répété — compte temporairement verrouillé (anis.ferjani@staroil.tn)", actor: "anis.ferjani@staroil.tn", brandSlug: "staroil", createdAt: daysAgo(27) },
    // J-31 → J-56 : historique
    { kind: "UTILISATEUR", message: "Compte « Nadia Haddad » réactivé (Agil)", actor: "sonia.beji@agil.tn", brandSlug: "agil", createdAt: daysAgo(31) },
    { kind: "SYSTEME", message: "Rapport hebdomadaire de veille envoyé à 12 enseignes clientes", actor: "system", brandSlug: null, createdAt: daysAgo(33) },
    { kind: "CONTRAT", message: "Contrat Staroil suspendu — deux échéances impayées", actor: "rania.feki@carbuscope.tn", brandSlug: "staroil", createdAt: daysAgo(34) },
    { kind: "SYSTEME", message: "Décret des prix importé : essence 2 510, gazole 1 875 millimes/L", actor: "system", brandSlug: null, createdAt: daysAgo(38) },
    { kind: "FACTURE", message: "Facture FCT-2025-0037 payée (Agil, 2 450,00 DT)", actor: "rania.feki@carbuscope.tn", brandSlug: "agil", createdAt: daysAgo(41) },
    { kind: "AUTH", message: "Connexion administratrice depuis 193.95.22.10 (Sonia Beji, Agil)", actor: "sonia.beji@agil.tn", brandSlug: "agil", createdAt: daysAgo(45) },
    { kind: "CONTRAT", message: "Contrat TotalEnergies converti d'Essentiel vers Pro (15 sièges)", actor: "rania.feki@carbuscope.tn", brandSlug: "totalenergies", createdAt: daysAgo(49) },
    { kind: "CONTRAT", message: "Devis envoyé à Vivo Energy (plan Pro, 1 490 DT/mois)", actor: "rania.feki@carbuscope.tn", brandSlug: null, createdAt: daysAgo(51) },
    { kind: "UTILISATEUR", message: "Sièges supplémentaires demandés pour Agil (25 → 30)", actor: "sonia.beji@agil.tn", brandSlug: "agil", createdAt: daysAgo(53) },
    { kind: "FACTURE", message: "Paiement partiel reçu : FCT-2025-0035 (Staroil, 640,00 DT sur 1 290,00 DT)", actor: "rania.feki@carbuscope.tn", brandSlug: "staroil", createdAt: daysAgo(56) },
  ]
  for (const e of events) {
    await db.auditEvent.create({ data: e })
  }

  console.log("🤖 Agent IA interne — tâches de démonstration…")
  const aiDemoLaunchedAt = daysAgo(2)
  const aiTasks = [
    {
      id: "ai-demo-relances",
      title: "Plan de relance des impayés",
      instruction: "Analyse les factures impayées des enseignes clientes et propose un plan de relance priorisé en 3 actions.",
      status: "TERMINEE",
      result: "**Situation** — Deux enseignes concentrent l'essentiel des impayés : Staroil (1 290,00 DT, échéance dépassée de 12 jours, contrat suspendu) et Agil (2 450,00 DT, échéance récente, déjà relancée deux fois).\n\n**Plan de relance priorisé :**\n1. Staroil — appeler Anis Ferjani sous 48 h et proposer un échéancier en 2 versements pour éviter la résiliation.\n2. Agil — envoyer une relance ferme avec copie à la direction financière, en rappelant le renouvellement du contrat à 76 jours.\n3. Ola Energy — point préventif avant la fin d'essai (12 jours restants) pour ne pas créer un nouvel impayé.\n\n**Suivi** — relancer chaque 7 jours et consigner chaque contact dans le journal d'audit ; escalade à la direction si aucun règlement sous 30 jours.",
      launchedAt: aiDemoLaunchedAt,
      finishedAt: new Date(aiDemoLaunchedAt.getTime() + 9_000),
      durationMs: 9200,
      createdBy: "rania.feki@carbuscope.tn",
      createdAt: daysAgo(2),
    },
    {
      id: "ai-demo-synthese",
      title: "Synthèse hebdo — mouvements concurrents",
      instruction: "Rédige la synthèse hebdomadaire des mouvements du marché (ouvertures, rénovations, changements d'enseigne) à destination de la direction.",
      status: "ENREGISTREE",
      createdBy: "rania.feki@carbuscope.tn",
      createdAt: daysAgo(1),
    },
  ]
  for (const t of aiTasks) {
    await db.aiTask.upsert({ where: { id: t.id }, create: t, update: t })
  }

  // ---- Module Démographie (Phase 4, T35) : données INS 2024 fournies par
  // l'utilisateur. estimated = chiffres marqués « (est.) » / « ~50 % » dans la
  // source. Les gouvernorats (existants) sont mis à jour — véhicules, taux de
  // motorisation et âge du parc (colonnes historiques) ne sont PAS touchés.
  // Les délégations démarrent vierges : à alimenter par édition en ligne.
  console.log("📊 Module Démographie — 24 gouvernorats (INS 2024) + délégations…")
  const DEMO_GOVS: {
    name: string; isoCode: string; population: number
    menPct: number; womenPct: number; areaKm2: number
    urbanPct: number; ruralPct: number; estimated: boolean
    delegations: string[]
  }[] = [
    {
      name: "Tunis", isoCode: "TN-11", population: 1056247, menPct: 49.3, womenPct: 50.7,
      areaKm2: 346, urbanPct: 100, ruralPct: 0, estimated: false,
      delegations: ["Bab El Bhar", "Bab Souika", "Carthage", "Cité El Khadra", "Djebel Jelloud", "El Hrairia", "El Kabaria", "El Menzah", "El Omrane", "El Omrane Supérieur", "El Ouardia", "Ettahrir", "Ezzouhour", "La Goulette", "La Marsa", "Le Bardo", "Le Kram", "Médina", "Sidi El Béchir", "Sidi Hassine", "Séjoumi"],
    },
    {
      name: "Ariana", isoCode: "TN-12", population: 412360, menPct: 49.5, womenPct: 50.5,
      areaKm2: 482, urbanPct: 88.8, ruralPct: 11.2, estimated: false,
      delegations: ["Ariana Ville", "Cité Ettadhamen", "Kalâat El Andalous", "La Soukra", "Mnihla", "Raoued", "Sidi Thabet"],
    },
    {
      name: "Ben Arous", isoCode: "TN-13", population: 501924, menPct: 49.4, womenPct: 50.6,
      areaKm2: 761, urbanPct: 90.8, ruralPct: 9.2, estimated: false,
      delegations: ["Ben Arous", "Bou Mhel El Bassatine", "El Mourouj", "Ezzahra", "Fouchana", "Hammam Chott", "Hammam Lif", "Medina Jedida", "Mégrine", "Mohamedia", "Mornag", "Radès"],
    },
    {
      name: "Manouba", isoCode: "TN-14", population: 379518, menPct: 49.6, womenPct: 50.4,
      areaKm2: 1137, urbanPct: 76, ruralPct: 24, estimated: false,
      delegations: ["Borj El Amri", "Douar Hicher", "El Battan", "Jedaida", "Manouba", "Mornaguia", "Oued Ellil", "Tebourba"],
    },
    {
      name: "Nabeul", isoCode: "TN-21", population: 787920, menPct: 49.8, womenPct: 50.2,
      areaKm2: 2788, urbanPct: 68.1, ruralPct: 31.9, estimated: false,
      delegations: ["Béni Khalled", "Béni Khiar", "Bou Argoub", "Dar Chaabane El Fehri", "El Haouaria", "El Mida", "Grombalia", "Hammamet", "Hammam Ghezèze", "Kélibia", "Korba", "Menzel Bouzelfa", "Menzel Temime", "Nabeul", "Soliman", "Takelsa"],
    },
    {
      name: "Zaghouan", isoCode: "TN-22", population: 176945, menPct: 50.1, womenPct: 49.9,
      areaKm2: 2768, urbanPct: 43.7, ruralPct: 56.3, estimated: false,
      delegations: ["Bir Mcherga", "El Fahs", "Nadhour", "Saouaf", "Zaghouan", "Zriba"],
    },
    {
      name: "Bizerte", isoCode: "TN-23", population: 568219, menPct: 50.2, womenPct: 49.8,
      areaKm2: 3750, urbanPct: 65.3, ruralPct: 34.7, estimated: false,
      delegations: ["Bizerte Nord", "Bizerte Sud", "El Alia", "Ghar El Melh", "Ghezala", "Joumine", "Mateur", "Menzel Bourguiba", "Menzel Jemil", "Ras Jebel", "Sejnane", "Tinja", "Utique", "Zarzouna"],
    },
    {
      name: "Béja", isoCode: "TN-31", population: 303032, menPct: 50.1, womenPct: 49.9,
      areaKm2: 3740, urbanPct: 44.7, ruralPct: 55.3, estimated: false,
      delegations: ["Amdoun", "Béja Nord", "Béja Sud", "Goubellat", "Medjez El Bab", "Nefza", "Téboursouk", "Testour", "Thibar"],
    },
    {
      name: "Jendouba", isoCode: "TN-32", population: 401000, menPct: 50, womenPct: 50,
      areaKm2: 3102, urbanPct: 30.8, ruralPct: 69.2, estimated: true,
      delegations: ["Aïn Draham", "Balta - Bou Aouane", "Bou Salem", "Fernana", "Ghardimaou", "Jendouba", "Jendouba Nord", "Oued Meliz", "Tabarka"],
    },
    {
      name: "Le Kef", isoCode: "TN-33", population: 237686, menPct: 49.6, womenPct: 50.4,
      areaKm2: 4965, urbanPct: 56.5, ruralPct: 43.5, estimated: false,
      delegations: ["Dahmani", "El Ksour", "Jérissa", "Kalàat Khasba", "Kalaat Senan", "Kef Est", "Kef Ouest", "Nebeur", "Sakit Sidi Youssef", "Sers", "Tajerouine", "Touiref"],
    },
    {
      name: "Siliana", isoCode: "TN-34", population: 223000, menPct: 50, womenPct: 50,
      areaKm2: 4642, urbanPct: 42.4, ruralPct: 57.6, estimated: true,
      delegations: ["Bargou", "Bou Arada", "El Aroussa", "El Krib", "Gaâfour", "Kesra", "Makthar", "Rouhia", "Siliana Nord", "Siliana Sud"],
    },
    {
      name: "Kairouan", isoCode: "TN-41", population: 600803, menPct: 49.5, womenPct: 50.5,
      areaKm2: 6712, urbanPct: 35.4, ruralPct: 64.6, estimated: false,
      delegations: ["Aïn Djeloula", "Bou Hajla", "Chebika", "Echrarda", "El Alâa", "Haffouz", "Hajeb el Ayoun", "Kairouan Nord", "Kairouan Sud", "Menzel Mehiri", "Nasrallah", "Oueslatia", "Sbikha"],
    },
    {
      name: "Kasserine", isoCode: "TN-42", population: 492741, menPct: 49.7, womenPct: 50.3,
      areaKm2: 8066, urbanPct: 43.6, ruralPct: 56.4, estimated: false,
      delegations: ["El Ayoun", "Ezzouhour", "Fériana", "Foussana", "Haïdra", "Hassi El Ferid", "Jedelienne", "Kasserine Nord", "Kasserine Sud", "Majel Bel Abbès", "Sbeïtla", "Sbiba", "Thala"],
    },
    {
      name: "Sidi Bouzid", isoCode: "TN-43", population: 429000, menPct: 50, womenPct: 50,
      areaKm2: 6994, urbanPct: 27.1, ruralPct: 72.9, estimated: true,
      delegations: ["Bir El Hafey", "Cebbala Ouled Asker", "Jilma", "Meknassy", "Menzel Bouzaiane", "Mezzouna", "Ouled Haffouz", "Regueb", "Sidi Ali Ben Aoun", "Sidi Bouzid Est", "Sidi Bouzid Ouest", "Souk Jedid"],
    },
    {
      name: "Sousse", isoCode: "TN-51", population: 674000, menPct: 50, womenPct: 50,
      areaKm2: 2669, urbanPct: 81, ruralPct: 19, estimated: true,
      delegations: ["Akouda", "Bou Ficha", "Enfidha", "Hammam Sousse", "Hergla", "Kalâa Kebira", "Kalâa Seghira", "Kondar", "M'saken", "Sidi Bou Ali", "Sidi El Hani", "Sousse Jawhara", "Sousse Médina", "Sousse Riadh", "Sousse Sidi Abdelhamid"],
    },
    {
      name: "Monastir", isoCode: "TN-52", population: 548000, menPct: 50, womenPct: 50,
      areaKm2: 1019, urbanPct: 100, ruralPct: 0, estimated: true,
      delegations: ["Bekalta", "Bembla", "Beni Hassen", "Jemmal", "Ksar Hellal", "Ksibet El Mediouni", "Moknine", "Monastir", "Ouerdanine", "Sahline", "Sayada-Lamta-Bou Hajar", "Sidi Bennour", "Téboulba", "Zeramdine"],
    },
    {
      name: "Mahdia", isoCode: "TN-53", population: 410000, menPct: 50, womenPct: 50,
      areaKm2: 2966, urbanPct: 45.8, ruralPct: 54.2, estimated: true,
      delegations: ["Bou Merdes", "Chebba", "Chorbane", "El Bradâa", "El Jem", "Essouassi", "Hebira", "Ksour Essef", "Mahdia", "Melloulèche", "Ouled Chamekh", "Rejiche", "Sidi Alouane"],
    },
    {
      name: "Sfax", isoCode: "TN-61", population: 955000, menPct: 50, womenPct: 50,
      areaKm2: 7545, urbanPct: 62.4, ruralPct: 37.6, estimated: true,
      delegations: ["Agareb", "Bir Ali Ben Khélifa", "Dhaou", "El Amra", "El Hencha", "Graïba", "Ghraïba", "Jebiniana", "Kerkennah", "Mahrès", "Menzel Chaker", "Sakiet Eddaïer", "Sakiet Ezzit", "Sfax Ouest", "Sfax Sud", "Sfax Ville", "Skhira", "Thyna"],
    },
    {
      name: "Gafsa", isoCode: "TN-71", population: 337000, menPct: 50, womenPct: 50,
      areaKm2: 7807, urbanPct: 74.3, ruralPct: 25.7, estimated: true,
      delegations: ["Belkhir", "El Guettar", "El Ksar", "Gafsa Nord", "Gafsa Sud", "Mdhila", "Métlaoui", "Moularès", "Redeyef", "Sened", "Sidi Aïch", "Sidi Boubaker", "Zannouch"],
    },
    {
      name: "Tozeur", isoCode: "TN-72", population: 107000, menPct: 50, womenPct: 50,
      areaKm2: 4719, urbanPct: 70.1, ruralPct: 29.9, estimated: true,
      delegations: ["Degache", "Hammet Jerid", "Hazoua", "Nefta", "Tamaghza", "Tozeur"],
    },
    {
      name: "Kébili", isoCode: "TN-73", population: 156000, menPct: 50, womenPct: 50,
      areaKm2: 22084, urbanPct: 54.5, ruralPct: 45.5, estimated: true,
      delegations: ["Douz Nord", "Douz Sud", "Faouar", "Kébili Nord", "Kébili Sud", "Rjim Maatoug", "Souk Lahad"],
    },
    {
      name: "Gabès", isoCode: "TN-81", population: 374000, menPct: 50, womenPct: 50,
      areaKm2: 7175, urbanPct: 70.2, ruralPct: 29.8, estimated: true,
      delegations: ["Dkhilet Toujane", "El Hamma", "Gabès Médina", "Gabès Ouest", "Gabès Sud", "Ghannouch", "Habib Thameur Bouatouch", "Mareth", "Matmata", "Menzel El Habib", "Métouia", "Nouvelle Matmata", "Oudhref"],
    },
    {
      name: "Médenine", isoCode: "TN-82", population: 479000, menPct: 50, womenPct: 50,
      areaKm2: 8588, urbanPct: 78.7, ruralPct: 21.3, estimated: true,
      delegations: ["Ben Gardane", "Beni Khedache", "Djerba - Ajim", "Djerba - Houmt Souk", "Djerba - Midoun", "Médenine Nord", "Médenine Sud", "Sidi Makhlouf", "Zarzis"],
    },
    {
      name: "Tataouine", isoCode: "TN-83", population: 149000, menPct: 50, womenPct: 50,
      areaKm2: 38889, urbanPct: 63.8, ruralPct: 36.2, estimated: true,
      delegations: ["Bir Lahmar", "Dehiba", "Ghomrassen", "Remada", "Smâr", "Tataouine Nord", "Tataouine Sud"],
    },
  ]
  for (const g of DEMO_GOVS) {
    await db.governoratStat.updateMany({
      where: { name: g.name },
      data: {
        population: g.population,
        delegationCount: g.delegations.length,
        isoCode: g.isoCode,
        menPct: g.menPct,
        womenPct: g.womenPct,
        areaKm2: g.areaKm2,
        urbanPct: g.urbanPct,
        ruralPct: g.ruralPct,
        estimated: g.estimated,
      },
    })
    for (const d of g.delegations) {
      await db.demographicDelegation.create({
        data: { gouvernorat: g.name, isoCode: g.isoCode, delegation: d },
      })
    }
  }

  // T37/T45 — volet « Paramétrage » : 2 accès de démonstration (lecture seule) :
  // Sonia Beji (Agil) voit les gouvernorats, Karim Trabelsi (Shell) voit
  // gouvernorats + délégations + cités (3ᵉ niveau T45 — drill-down B2B).
  // Les autres comptes démarrent sans accès.
  console.log("🔐 Visibilité démographie — accès de démonstration…")
  const DEMO_ACCESS = [
    { email: "sonia.beji@agil.tn", level: "GOUVERNORATS", canEdit: false, updatedBy: "rania.feki@carbuscope.tn" },
    { email: "karim.trabelsi@shell.tn", level: "CITES", canEdit: false, updatedBy: "rania.feki@carbuscope.tn" },
  ]
  for (const a of DEMO_ACCESS) {
    const u = await db.user.findUnique({ where: { email: a.email } })
    if (u) {
      await db.demographicAccess.create({
        data: { userId: u.id, level: a.level, canEdit: a.canEdit, updatedBy: a.updatedBy },
      })
    }
  }

  const nContracts = await db.saasContract.count()
  const nInvoices = await db.saasInvoice.count()
  const nUsers = await db.user.count()
  const nAudit = await db.auditEvent.count()
  const nPlans = await db.saasPlan.count()
  const nAiTasks = await db.aiTask.count()
  const nDelegations = await db.demographicDelegation.count()
  const nGovs = await db.governoratStat.count({ where: { isoCode: { not: null } } })
  const nAccess = await db.demographicAccess.count()
  console.log(`✅ Seed SaaS terminé — ${nContracts} contrats, ${nInvoices} factures, ${nUsers} utilisateurs, ${nAudit} événements d'audit, ${nPlans} plans, ${nAiTasks} tâches IA, ${nGovs} gouvernorats INS 2024, ${nDelegations} délégations, ${nAccess} accès démographie.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
