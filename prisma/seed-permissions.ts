// T48 — Seed idempotent : rôles SaaS + matrice de permissions + affectations
// + données des modules SaaS (devis, tickets, annonces, sauvegardes, clés API,
// jobs, paramètres, incidents). Usage : bun prisma/seed-permissions.ts

import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

// Niveaux : 0 aucun · 1 lecture · 2 écriture
const L = { none: 0, read: 1, write: 2 } as const
type Matrix = Record<string, number>

const saKeys = [
  "sa.overview", "sa.clients", "sa.contracts", "sa.plans", "sa.devis", "sa.invoices",
  "sa.echeances", "sa.users", "sa.permissions", "sa.clesapi", "sa.demographie", "sa.ai",
  "sa.carto", "sa.annonces", "sa.config", "sa.jobs", "sa.sauvegardes", "sa.support",
  "sa.supervision", "sa.audit", "sa.analytics",
] as const
const boKeys = ["bo.moderation", "bo.sovereign", "bo.freshness", "bo.agents", "bo.missions", "bo.decrees", "bo.veille", "bo.stats"] as const
const portalKeys = [
  "portal.dashboard", "portal.map", "portal.reviews", "portal.stations", "portal.terrain",
  "portal.prices", "portal.veille", "portal.competition", "portal.implantation",
  "portal.calculateurs", "portal.demographie", "portal.rapports", "portal.api", "portal.parametres",
] as const
const obsKeys = [
  "obs.dashboard", "obs.map", "obs.stations", "obs.competition", "obs.calculators",
  "obs.implantation", "obs.prices", "obs.veille", "obs.reports", "obs.demographie", "obs.settings",
] as const
const ALL_KEYS = [...saKeys, ...boKeys, ...portalKeys, ...obsKeys]

const full = (level: number): Matrix => Object.fromEntries(ALL_KEYS.map(k => [k, level]))
const pick = (base: Matrix, keys: readonly string[], level: number): Matrix => {
  const m = { ...base }
  for (const k of keys) m[k] = level
  return m
}

// ---- Rôles système (ordre = rang) ----
const ROLES: { code: string; name: string; description: string; rank: number; matrix: Matrix }[] = [
  {
    code: "SUPER_ADMIN", name: "Super Administrateur", rank: 0,
    description: "Racine de la plateforme : gouverne le SaaS sans exception, gère les rôles et la matrice.",
    matrix: full(L.write),
  },
  {
    code: "DIRECTEUR_PLATEFORME", name: "Directeur Plateforme", rank: 10,
    description: "Adjoint de la racine : tous les modules d'administration, matrice en lecture seule.",
    matrix: pick(full(L.write), ["sa.permissions"], L.read),
  },
  {
    code: "GESTIONNAIRE_COMMERCIAL", name: "Gestionnaire Commercial", rank: 20,
    description: "Cycle commercial SaaS : clients, contrats, plans, devis, facturation, échéances et relances.",
    matrix: {
      ...pick(full(L.none), ["sa.overview", "sa.users", "sa.analytics"], L.read),
      "sa.clients": L.write, "sa.contracts": L.write, "sa.plans": L.write,
      "sa.devis": L.write, "sa.invoices": L.write, "sa.echeances": L.write,
    },
  },
  {
    code: "OPERATEUR_PLATEFORME", name: "Opérateur Plateforme", rank: 30,
    description: "Opérations du back-office : modération, données souveraines, fraîcheur, agents, missions, décrets, veille — consultation de l'Observatoire.",
    matrix: {
      ...pick(pick(full(L.none), ["bo.moderation", "bo.sovereign", "bo.freshness", "bo.agents", "bo.missions", "bo.decrees", "bo.veille", "bo.stats"], L.write), obsKeys, L.read),
      "sa.overview": L.read, "sa.support": L.write, "sa.annonces": L.write,
      "sa.supervision": L.read, "sa.jobs": L.read, "sa.sauvegardes": L.read,
    },
  },
  {
    code: "SUPPORT_TECHNIQUE", name: "Support Technique", rank: 40,
    description: "Assistance aux enseignes : tickets, annonces, supervision temps réel, diagnostic des jobs — consultation de l'Observatoire.",
    matrix: {
      ...pick(full(L.none), [...obsKeys, "sa.overview", "sa.jobs", "sa.sauvegardes", "sa.clesapi"], L.read),
      "sa.support": L.write, "sa.annonces": L.write, "sa.supervision": L.write,
    },
  },
  {
    code: "ANALYSTE", name: "Analyste", rank: 50,
    description: "Lecture stratégique : vue d'ensemble, analytics, audit, démographie, statistiques plateforme et Observatoire marché.",
    matrix: {
      ...pick(full(L.none), ["sa.overview", "sa.audit", "sa.demographie", "sa.users", "bo.stats", ...obsKeys], L.read),
      "sa.analytics": L.write,
    },
  },
  {
    code: "CLIENT_ENSEIGNE", name: "Client Enseigne", rank: 60,
    description: "Compte enseigne cliente : l'espace unique d'administration (Portail) — gestion du réseau et observation du marché, sans accès à l'Observatoire ni au back-office.",
    matrix: pick(
      // Gestion (écriture) : le cœur du portail d'auto-publication
      pick(full(L.none), ["portal.dashboard", "portal.map", "portal.stations", "portal.reviews", "portal.terrain", "portal.api", "portal.parametres"], L.write),
      // Observation marché (lecture) : analyse sans gestion
      ["portal.prices", "portal.veille", "portal.competition", "portal.implantation", "portal.calculateurs", "portal.demographie", "portal.rapports"], L.read,
    ),
  },
  {
    code: "CLIENT_OBSERVATOIRE", name: "Client Observatoire", rank: 70,
    description: "Compte d'étude B2B (institution, banque, bureau d'études) : Observatoire marché en lecture seule — aucune fonction de gestion.",
    matrix: pick(full(L.none), [...obsKeys], L.read),
  },
  // Rôle personnalisé d'exemple (créable/supprimable depuis l'UI).
  {
    code: "CONTRIBUTEUR_PORTAIL", name: "Contributeur Portail", rank: 200,
    description: "Profil restreint d'exemple : mise à jour des fiches stations du portail, sans facturation ni observatoire.",
    matrix: pick(full(L.none), ["portal.dashboard", "portal.stations"], L.write),
  },
]

// ---- Affectations par e-mail ----
// T50 : espace unique — le SaaS est réservé aux comptes rattachés à une
// enseigne + la racine Super Admin (Rania, seule à gérer la plateforme).
// Les anciens comptes « équipe plateforme » et le client d'étude B2B ont été
// supprimés de la base (aucune ré-création au re-seed).
const ASSIGNMENTS: Record<string, string> = {
  "rania.feki@carbuscope.tn": "SUPER_ADMIN",
}

async function seedRoles() {
  for (const r of ROLES) {
    const role = await db.saasRole.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description, rank: r.rank, isSystem: r.code !== "CONTRIBUTEUR_PORTAIL" },
      create: { code: r.code, name: r.name, description: r.description, rank: r.rank, isSystem: r.code !== "CONTRIBUTEUR_PORTAIL" },
    })
    // Matrice : remplacement propre (idempotent).
    await db.saasPermission.deleteMany({ where: { roleId: role.id } })
    await db.saasPermission.createMany({
      data: Object.entries(r.matrix).map(([moduleKey, level]) => ({ roleId: role.id, moduleKey, level })),
    })
    console.log(`✓ rôle ${r.code.padEnd(22)} ${Object.values(r.matrix).filter(v => v > 0).length}/${ALL_KEYS.length} modules ouverts`)
  }

  // Affectations explicites + CLIENT_ENSEIGNE par défaut pour les enseignes.
  const roleByCode = new Map((await db.saasRole.findMany()).map(r => [r.code, r.id]))
  const users = await db.user.findMany()
  for (const u of users) {
    const code = ASSIGNMENTS[u.email] ?? (u.brandSlug ? "CLIENT_ENSEIGNE" : u.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : null)
    if (!code || !roleByCode.has(code)) continue
    const roleId = roleByCode.get(code)!
    if (u.saasRoleId !== roleId) {
      await db.user.update({ where: { id: u.id }, data: { saasRoleId: roleId } })
      console.log(`✓ ${u.email.padEnd(34)} → ${code}`)
    }
  }
}

// ---- Modules SaaS ----
async function seedModules() {
  const now = Date.now()
  const days = (n: number) => new Date(now - n * 86_400_000)
  const daysPlus = (n: number) => new Date(now + n * 86_400_000)

  // Devis
  const devis = [
    { number: "DV-2025-041", clientName: "Agil Tunisie", brandSlug: "agil", planCode: "ENTERPRISE", seats: 12, amountTnd: 2880, status: "ENVOYE", validUntil: daysPlus(12) },
    { number: "DV-2025-040", clientName: "Ola Energy", brandSlug: "ola", planCode: "PRO", seats: 6, amountTnd: 1440, status: "ACCEPTE", validUntil: daysPlus(30) },
    { number: "DV-2025-039", clientName: "Staroil", brandSlug: "staroil", planCode: "PRO", seats: 4, amountTnd: 960, status: "REFUSE", validUntil: days(6) },
    { number: "DV-2025-038", clientName: "Société Route du Sud", brandSlug: null, planCode: "ESSENTIEL", seats: 2, amountTnd: 360, status: "BROUILLON", validUntil: null },
    { number: "DV-2025-037", clientName: "TotalEnergies Tunisie", brandSlug: "totalenergies", planCode: "ENTERPRISE", seats: 15, amountTnd: 3600, status: "ACCEPTE", validUntil: days(15) },
    { number: "DV-2025-036", clientName: "Shell Tunisie", brandSlug: "shell", planCode: "PRO", seats: 5, amountTnd: 1200, status: "EXPIRE", validUntil: days(40) },
  ]
  for (const d of devis) {
    await db.saasDevis.upsert({
      where: { number: d.number },
      update: d,
      create: { ...d, notes: "", createdBy: "Rania Feki" },
    })
  }

  // Tickets support
  const tickets = [
    { number: "TK-1187", subject: "Synchronisation API interrompue", requester: "Nadia Haddad (Agil)", brandSlug: "agil", category: "TECHNIQUE", priority: "HAUTE", status: "EN_COURS", assignee: "Amine Chebbi", reply: "", repliedAt: null, createdAt: days(1) },
    { number: "TK-1186", subject: "Facture FA-2025-031 non visible", requester: "Karim Trabelsi (Shell)", brandSlug: "shell", category: "FACTURATION", priority: "NORMALE", status: "RESOLU", assignee: "Rania Feki", reply: "Facture corrigée et re-publiée dans votre espace.", repliedAt: days(1), createdAt: days(3) },
    { number: "TK-1185", subject: "Ajout d'un 6e utilisateur au contrat", requester: "Sonia Beji (Agil)", brandSlug: "agil", category: "ACCES", priority: "NORMALE", status: "OUVERT", assignee: null, reply: "", repliedAt: null, createdAt: days(4) },
    { number: "TK-1184", subject: "Export démographie bloqué en XLS", requester: "Mehdi Gharbi (Ola)", brandSlug: "ola", category: "DONNEES", priority: "BASSE", status: "OUVERT", assignee: null, reply: "", repliedAt: null, createdAt: days(5) },
    { number: "TK-1183", subject: "Alerte note descendue sous 3,0 non reçue", requester: "Ines Chaabane (TotalEnergies)", brandSlug: "totalenergies", category: "TECHNIQUE", priority: "HAUTE", status: "EN_COURS", assignee: "Amine Chebbi", reply: "", repliedAt: null, createdAt: days(6) },
    { number: "TK-1182", subject: "Question sur la TVA de la facture de mars", requester: "Finance (Shell)", brandSlug: "shell", category: "FACTURATION", priority: "NORMALE", status: "FERME", assignee: "Rania Feki", reply: "TVA 19 % applicable, détail envoyé par e-mail.", repliedAt: days(9), createdAt: days(12) },
    { number: "TK-1181", subject: "Compte observateur en lecture seule", requester: "Leila Mansour (TotalEnergies)", brandSlug: "totalenergies", category: "ACCES", priority: "BASSE", status: "RESOLU", assignee: "Amine Chebbi", reply: "Profil VIEWER confirmé sur l'observatoire.", repliedAt: days(8), createdAt: days(10) },
    { number: "TK-1180", subject: "Carte interactive lente en fin de journée", requester: "Sonia Beji (Agil)", brandSlug: "agil", category: "TECHNIQUE", priority: "CRITIQUE", status: "OUVERT", assignee: null, reply: "", repliedAt: null, createdAt: days(0) },
  ]
  for (const t of tickets) {
    await db.saasTicket.upsert({ where: { number: t.number }, update: t, create: t })
  }

  // Annonces
  const annonces = [
    { title: "Maintenance planifiée dimanche 02:00–03:30", message: "La plateforme sera momentanément indisponible pendant la montée de version. Les données restent conservées.", level: "ATTENTION", audience: "TOUTES", active: true, startsAt: days(1), endsAt: daysPlus(6), createdBy: "Rania Feki" },
    { title: "Nouveau : rapport PDF « part de marché »", message: "Le générateur de rapports produit désormais un PDF enrichi de la part de marché par enseigne.", level: "INFO", audience: "ENSEIGNES", active: true, startsAt: days(3), endsAt: null, createdBy: "Rania Feki" },
    { title: "Campagne de vérification terrain — Grand Tunis", message: "Des agents vérifieront les fiches stations du Grand Tunis cette semaine. Signalez toute anomalie via le portail.", level: "INFO", audience: "PORTAIL", active: true, startsAt: days(2), endsAt: daysPlus(5), createdBy: "Amine Chebbi" },
    { title: "Décret n°2025-14 publié", message: "Le registre des décrets a été mis à jour : gazole et essence ajustés.", level: "CRITIQUE", audience: "TOUTES", active: false, startsAt: days(30), endsAt: days(28), createdBy: "Rania Feki" },
  ]
  for (const a of annonces) {
    const existing = await db.saasAnnonce.findFirst({ where: { title: a.title } })
    if (!existing) await db.saasAnnonce.create({ data: a })
  }

  // Sauvegardes
  const sauvegardes = [
    { label: "Sauvegarde quotidienne automatique", kind: "AUTOMATIQUE", scope: "COMPLETE", sizeMb: 6.1, status: "TERMINEE", durationMs: 4120, by: "système", createdAt: days(0) },
    { label: "Sauvegarde quotidienne automatique", kind: "AUTOMATIQUE", scope: "COMPLETE", sizeMb: 6.0, status: "TERMINEE", durationMs: 3980, by: "système", createdAt: days(1) },
    { label: "Sauvegarde config avant montée de version", kind: "MANUELLE", scope: "CONFIG", sizeMb: 0.2, status: "TERMINEE", durationMs: 310, by: "Rania Feki", createdAt: days(2) },
    { label: "Export données démographie INS", kind: "MANUELLE", scope: "DONNEES", sizeMb: 1.4, status: "TERMINEE", durationMs: 850, by: "Amine Chebbi", createdAt: days(4) },
    { label: "Sauvegarde quotidienne automatique", kind: "AUTOMATIQUE", scope: "COMPLETE", sizeMb: 5.9, status: "ECHEC", durationMs: 110, by: "système", createdAt: days(5) },
    { label: "Sauvegarde hebdomadaire complète", kind: "AUTOMATIQUE", scope: "COMPLETE", sizeMb: 6.2, status: "TERMINEE", durationMs: 4550, by: "système", createdAt: days(7) },
  ]
  await db.saasSauvegarde.deleteMany({ where: { createdAt: { lt: new Date(now - 90 * 86_400_000) } } })
  for (const s of sauvegardes) {
    const twin = await db.saasSauvegarde.findFirst({ where: { label: s.label, createdAt: s.createdAt } })
    if (!twin) await db.saasSauvegarde.create({ data: s })
  }

  // Clés API
  const cles = [
    { label: "Production — portail Agil", keyPrefix: "cs_live_", keyHash: "hash-agil-1", brandSlug: "agil", scopes: "read,write", quotaHour: 2000, callsTotal: 184_512, lastUsedAt: days(0), active: true, revokedAt: null, createdBy: "Rania Feki" },
    { label: "Recette — intégration SI", keyPrefix: "cs_test_", keyHash: "hash-si-2", brandSlug: "totalenergies", scopes: "read", quotaHour: 500, callsTotal: 12_204, lastUsedAt: days(2), active: true, revokedAt: null, createdBy: "Amine Chebbi" },
    { label: "Ancienne clé (rotation sécurité)", keyPrefix: "cs_live_", keyHash: "hash-old-3", brandSlug: "shell", scopes: "read,write", quotaHour: 2000, callsTotal: 97_811, lastUsedAt: days(41), active: false, revokedAt: days(40), createdBy: "Rania Feki" },
  ]
  for (const c of cles) {
    const existing = await db.saasCleApi.findFirst({ where: { label: c.label } })
    if (!existing) await db.saasCleApi.create({ data: c })
  }

  // Jobs planifiés (reflètent les mini-services réels)
  const jobs = [
    { code: "VEILLE_QUOTIDIENNE", label: "Passe de veille (moteur des notes)", kind: "CRON", schedule: "0 8 * * * (Africa/Tunis)", endpoint: "POST /api/watchlist-alerts/run", status: "ACTIF", lastRunAt: days(0), nextRunAt: daysPlus(1), lastResult: "6 alertes déclenchées · 6 e-mails", runsCount: 148, failures: 2, active: true },
    { code: "RELANCES_J7", label: "Relances factures en retard (J+7)", kind: "CRON", schedule: "0 9 * * 1 (Africa/Tunis)", endpoint: "POST /api/relances", status: "ACTIF", lastRunAt: days(3), nextRunAt: daysPlus(4), lastResult: "3 relances groupées", runsCount: 34, failures: 0, active: true },
    { code: "NOTIF_RELAY", label: "Relais WebSocket notifications", kind: "TACHE", schedule: "permanent", endpoint: "mini-service :3036/:3037", status: "ACTIF", lastRunAt: days(0), nextRunAt: null, lastResult: "178 notifications relayées", runsCount: 1, failures: 0, active: true },
    { code: "SAUVEGARDE_QUOT", label: "Sauvegarde automatique de la base", kind: "CRON", schedule: "30 2 * * * (Africa/Tunis)", endpoint: "interne (sqlite backup)", status: "ERREUR", lastRunAt: days(5), nextRunAt: daysPlus(1), lastResult: "Verrou de base — nouvelle tentative ce soir", runsCount: 512, failures: 6, active: true },
    { code: "EXPORTS_PDF", label: "File d'attente des exports PDF", kind: "TACHE", schedule: "à la demande", endpoint: "POST /api/reports", status: "ACTIF", lastRunAt: days(0), nextRunAt: null, lastResult: "2 rapports générés", runsCount: 87, failures: 1, active: true },
  ]
  for (const j of jobs) {
    await db.saasJob.upsert({ where: { code: j.code }, update: j, create: j })
  }

  // Paramètres plateforme
  const parametres = [
    { key: "maintenance_mode", value: "false", label: "Mode maintenance (bannière sur toute la plateforme)", category: "GENERAL", kind: "BOOL", options: "", editable: true },
    { key: "session_ttl_hours", value: "12", label: "Durée des sessions (heures)", category: "SECURITE", kind: "NUMBER", options: "", editable: true },
    { key: "login_max_attempts", value: "15", label: "Tentatives de connexion avant blocage (5 min)", category: "SECURITE", kind: "NUMBER", options: "", editable: true },
    { key: "totp_required_root", value: "true", label: "2FA obligatoire pour le compte racine", category: "SECURITE", kind: "BOOL", options: "", editable: false },
    { key: "devise_facturation", value: "TND", label: "Devise de facturation", category: "FACTURATION", kind: "SELECT", options: "TND,EUR,USD", editable: true },
    { key: "tva_taux", value: "19", label: "Taux de TVA appliqué (%)", category: "FACTURATION", kind: "NUMBER", options: "", editable: true },
    { key: "delai_relance_jours", value: "7", label: "Délai de relance des factures (jours)", category: "FACTURATION", kind: "NUMBER", options: "", editable: true },
    { key: "email_expediteur", value: "no-reply@carbuscope.tn", label: "Adresse d'expédition des notifications", category: "NOTIFICATIONS", kind: "TEXT", options: "", editable: true },
    { key: "veille_heure_passe", value: "08:00", label: "Heure de la passe quotidienne de veille (Tunis)", category: "NOTIFICATIONS", kind: "TEXT", options: "", editable: true },
    { key: "carto_fond_defaut", value: "esri", label: "Fond cartographique par défaut", category: "CARTE", kind: "SELECT", options: "esri,opentopo,osm,schema", editable: true },
    { key: "essai_jours", value: "30", label: "Durée de l'essai gratuit (jours)", category: "GENERAL", kind: "NUMBER", options: "", editable: true },
    // Feature flags IA (consommés par /api/portal/ai et /api/mobile/ai)
    { key: "portal.ai.active", value: "true", label: "Assistant IA du portail enseigne", category: "GENERAL", kind: "BOOL", options: "", editable: true },
    { key: "mobile.ai.active", value: "true", label: "Copilote IA de l'application mobile", category: "GENERAL", kind: "BOOL", options: "", editable: true },
  ]
  for (const p of parametres) {
    await db.saasParametre.upsert({
      where: { key: p.key },
      update: { value: p.value, label: p.label, category: p.category, kind: p.kind, options: p.options, editable: p.editable },
      create: p,
    })
  }

  // Incidents
  const incidents = [
    { title: "Sauvegarde nocturne en échec (verrou SQLite)", severity: "MAJEUR", status: "SURVEILLE", source: "job SAUVEGARDE_QUOT", detail: "La sauvegarde de la nuit a échoué sur un verrou de base ; nouvelle tentative programmée.", startedAt: days(5), resolvedAt: null },
    { title: "Lenteur carte interactive 17h–18h", severity: "MINEUR", status: "OUVERT", source: "ticket TK-1180", detail: "Signalement enseigne Agil : temps de chargement des tuiles en fin de journée.", startedAt: days(0), resolvedAt: null },
    { title: "Notification WebSocket interrompue 12 min", severity: "MINEUR", status: "RESOLU", source: "notif-relay", detail: "Redémarrage du relais par le dev-keeper ; polling de secours a couvert l'interruption.", startedAt: days(9), resolvedAt: days(9) },
  ]
  for (const i of incidents) {
    const existing = await db.saasIncident.findFirst({ where: { title: i.title } })
    if (!existing) await db.saasIncident.create({ data: i })
  }

  console.log("✓ devis, tickets, annonces, sauvegardes, clés API, jobs, paramètres, incidents — seedés")
}

async function main() {
  await seedRoles()
  await seedModules()
  console.log("Seed T48/T49/T50 terminé.")
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
