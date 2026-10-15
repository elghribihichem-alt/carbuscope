// T59 — Seed de la console Super Administration « V7 » (modèles fantômes
// recréés par l'audit T59). Données FICTIVES cohérentes avec le reste de la
// plateforme : enseignes réelles de la base (agil, totalenergies, shell, ola,
// staroil) et codes stations réels, grille SaaS documentée (6 000 DT adhésion
// + 40 DT/station/mois ou 400 DT/station/an, TVA 19 %), dates calées sur
// NOW fixe = 2026-10-02 (même convention que seed-pub).
// USAGE : bun prisma/seed-sa-console.ts (idempotent : upsert sur clés
// naturelles — relançable sans dupliquer).
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const NOW = new Date("2026-10-02T09:30:00.000Z")
const DAY = 86_400_000
const d = (days: number) => new Date(NOW.getTime() + days * DAY)
const mois = (m: number) => {
  const x = new Date(NOW.getFullYear(), NOW.getMonth() + m, 1, 9, 0, 0)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`
}
const TVA = 0.19

async function main() {
  console.log("Seed console SA (V7) — NOW fixe :", NOW.toISOString())

  // ---------------------------------------------------------------- 1. Paramètres
  const params: [string, string, string, string, string, string, boolean][] = [
    ["maintenance.mode", "false", "BOOLEEN", "MAINTENANCE", "Mode maintenance global", "Active la bannière maintenance sur tous les espaces et bloque les écritures.", true],
    ["maintenance.message", "Maintenance planifiée — retour estimé à 22 h.", "TEXTE", "MAINTENANCE", "Message de maintenance", "Texte diffusé par la bannière quand le mode maintenance est actif.", true],
    ["facturation.tva", "19", "NOMBRE", "FACTURATION", "Taux de TVA (%)", "Taux appliqué à la génération mensuelle des factures (19 % en Tunisie).", true],
    ["facturation.delaiReglementJours", "30", "NOMBRE", "FACTURATION", "Délai de règlement (jours)", "Délai entre émission et échéance des factures mensuelles.", true],
    ["abonnement.mensuel", "40", "NOMBRE", "FACTURATION", "Tarif mensuel (DT/station)", "Grille : abonnement mensuel par station en dinars.", true],
    ["abonnement.annuel", "400", "NOMBRE", "FACTURATION", "Tarif annuel (DT/station)", "Grille : abonnement annuel par station en dinaris (2 mois offerts).", true],
    ["module.ai.active", "true", "BOOLEEN", "FONCTIONNALITES", "Agent IA Super Administration", "Interrupteur de l'agent IA de la console SA (onglet Agent IA).", true],
    ["portal.ai.active", "true", "BOOLEEN", "FONCTIONNALITES", "Assistant IA portail enseigne", "Interrupteur de l'assistant IA de l'espace enseigne.", true],
    ["mobile.ai.active", "true", "BOOLEEN", "FONCTIONNALITES", "Assistant IA mobile", "Interrupteur de l'assistant IA de l'application terrain.", true],
    ["veille.seuilPrix", "60", "NOMBRE", "LIMITES", "Seuil d'écart de prix (millimes)", "Écart de prix déclenchant une alerte de veille prix entre stations voisines.", true],
    ["reputation.seuilReponse", "48", "NOMBRE", "LIMITES", "Délai de réponse aux avis (h)", "Délai conseillé de réponse aux avis B2C avant signalement.", true],
    ["api.rateLimit", "1200", "NOMBRE", "LIMITES", "Appels API / heure / clé", "Limite horaire d'appels par clé API.", true],
    ["contributions.moderation", "true", "BOOLEEN", "FONCTIONNALITES", "Modération des contributions", "Les contributions communautaires passent par une validation avant publication.", true],
    ["exports.maxLignes", "50000", "NOMBRE", "LIMITES", "Lignes max par export CSV", "Plafond anti-saturation des exports généralisés.", true],
    ["plateforme.version", "8.2", "TEXTE", "SYSTEME", "Version de la plateforme", "Version courante du socle CarbuScope (informationnelle).", false],
    ["plateforme.editeur", "CarbuScope SAS", "TEXTE", "SYSTEME", "Éditeur", "Raison sociale de l'éditeur (informationnelle).", false],
  ]
  for (const [cle, valeur, type, categorie, libelle, description, modifiable] of params) {
    await db.parametrePlateforme.upsert({ where: { cle }, create: { cle, valeur, type, categorie, libelle, description, modifiable }, update: {} })
  }
  console.log("ParametrePlateforme :", params.length)

  // ---------------------------------------------------------------- 2. Annonces
  const annonces: [string, string, string, string, Date, Date | null, boolean, boolean][] = [
    ["Nouveau module Publicité disponible", "Le module Publicité (listing des supports, simulateur et rapports de campagne) est ouvert à toutes les enseignes.", "INFO", "TOUTES", d(-3), d(30), true, true],
    ["Maintenance réseau opérateur", "Une interruption réseau est possible entre 2 h et 4 h (maintenance opérateur) — les données terrain sont mises en file et synchronisées après.", "ATTENTION", "TOUTES", d(-1), d(1), true, true],
    ["Campagne de mise à jour des prix", "Vérifiez la concordance de vos prix affichés après le dernier décret (audit automatique planifié).", "INFO", "ENSEIGNES", d(-40), d(-10), false, true],
  ]
  for (const [titre, corps, severite, audience, dateDebut, dateFin, active, dissmissible] of annonces) {
    const existing = await db.annonce.findFirst({ where: { titre } })
    if (!existing) {
      await db.annonce.create({ data: { titre, corps, severite, audience, dateDebut, dateFin, active, dissmissible, auteur: "Nadia Ben Amor", createdAt: dateDebut } })
    }
  }
  console.log("Annonce : 3")

  // ---------------------------------------------------------------- 3. Contrats
  const contratsSeed: {
    numero: string; brandSlug: string | null; nomClient: string; contactNom: string; contactRole: string
    contactEmail: string; contactTel: string; statut: string; signature: Date | null; debut: Date | null
    fin: Date | null; adhesion: number; adhesionPayee: boolean; periodicite: string; conditions: string; notes: string
    stations: [string, string][]; statutAb: string
  }[] = [
    {
      numero: "CTR-2024-001", brandSlug: "agil", nomClient: "Agil — Distribution Fuels (groupe TAAG)",
      contactNom: "Sonia Trabelsi", contactRole: "Directrice des opérations", contactEmail: "sonia.trabelsi@agil.tn",
      contactTel: "+216 71 123 456", statut: "ACTIF", signature: d(-560), debut: d(-555), fin: null,
      adhesion: 6_000_000, adhesionPayee: true, periodicite: "MENSUEL",
      conditions: "Contrat cadre annuel à reconduction tacite — grille 40 DT/station/mois, facturation mensuelle, règlement à 30 jours.",
      notes: "Client pilote historique. Extension prévue sur le Grand Tunis.",
      stations: [["TN-0001", "Agil El Menzah 4"], ["TN-0002", "Agil Sidi Houssine 1"], ["TN-0004", "Agil El Menzah"], ["TN-0005", "Agil Tunis Centre"], ["TN-0013", "Agil Ariana"], ["TN-0025", "Agil La Marsa 2"]],
      statutAb: "ACTIF",
    },
    {
      numero: "CTR-2024-002", brandSlug: "totalenergies", nomClient: "TotalEnergies Marketing Tunisie",
      contactNom: "Karim Ben Salah", contactRole: "Responsable réseau", contactEmail: "k.bensalah@totalenergies.tn",
      contactTel: "+216 71 234 567", statut: "ACTIF", signature: d(-480), debut: d(-475), fin: null,
      adhesion: 6_000_000, adhesionPayee: true, periodicite: "ANNUEL",
      conditions: "Contrat annuel — 400 DT/station/an, reconduction tacite à l'anniversaire de signature.",
      notes: "Facturation annuelle groupée par anniversaire de contrat.",
      stations: [["TN-0035", "TotalEnergies El Kabaria 1"], ["TN-0066", "TotalEnergies La Marsa 3"], ["TN-0078", "TotalEnergies Le Bardo"], ["TN-0087", "TotalEnergies Tunis Centre 1"], ["TN-0090", "TotalEnergies Ben Arous"]],
      statutAb: "ACTIF",
    },
    {
      numero: "CTR-2025-003", brandSlug: "shell", nomClient: "Shell Tunisie SARL",
      contactNom: "Ines Chaabane", contactRole: "Directrice commerciale", contactEmail: "ines.chaabane@shell.tn",
      contactTel: "+216 71 345 678", statut: "ACTIF", signature: d(-300), debut: d(-295), fin: null,
      adhesion: 6_000_000, adhesionPayee: true, periodicite: "MENSUEL",
      conditions: "Contrat cadre — 40 DT/station/mois, TVA 19 %, échéance à 30 jours.",
      notes: "Déploiement progressif : 6 stations câblées sur 10 au réseau.",
      stations: [["TN-0030", "Shell Sidi Houssine 4"], ["TN-0040", "Shell La Goulette"], ["TN-0047", "Shell Le Bardo"], ["TN-0058", "Shell Le Bardo 3"]],
      statutAb: "ACTIF",
    },
    {
      numero: "CTR-2026-004", brandSlug: "ola", nomClient: "Ola Energy Tunisia",
      contactNom: "Mehdi Ayari", contactRole: "Directeur digital", contactEmail: "mehdi.ayari@olaenergy.tn",
      contactTel: "+216 71 456 789", statut: "ESSAI", signature: null, debut: d(-45), fin: null,
      adhesion: 6_000_000, adhesionPayee: false, periodicite: "MENSUEL",
      conditions: "Essai 60 jours — accès complet, sans engagement, adhesion offerte.",
      notes: "Essai suivi par la direction commerciale — décision attendue avant J+60.",
      stations: [["TN-0037", "Ola Energy Le Bardo"], ["TN-0072", "Ola Energy La Marsa 4"], ["TN-0101", "Ola Energy La Marsa"]],
      statutAb: "ACTIF",
    },
    {
      numero: "CTR-2025-005", brandSlug: "staroil", nomClient: "Staroil Tunisie",
      contactNom: "Fawzi Gharbi", contactRole: "gérant", contactEmail: "fawzi.gharbi@staroil.tn",
      contactTel: "+216 71 567 890", statut: "SUSPENDU", signature: d(-700), debut: d(-695), fin: d(-20),
      adhesion: 6_000_000, adhesionPayee: true, periodicite: "MENSUEL",
      conditions: "Contrat suspendu pour impayés — réactivation sur règlement de l'arriéré.",
      notes: "Suspension décidée après 3 relances sans règlement. Dossier suivi par la direction.",
      stations: [["TN-0011", "Staroil Le Bardo"], ["TN-0017", "Staroil Tunis Centre"]],
      statutAb: "SUSPENDU",
    },
    {
      numero: "CTR-2026-006", brandSlug: null, nomClient: "Zoom Station (prospect)",
      contactNom: "Leila Mansour", contactRole: "Directrice générale", contactEmail: "contact@zoomstation.tn",
      contactTel: "+216 71 678 901", statut: "PROSPECT", signature: null, debut: null, fin: null,
      adhesion: 6_000_000, adhesionPayee: false, periodicite: "MENSUEL",
      conditions: "Prospect 18 stations — devis DEV-2026-003 en cours d'examen.",
      notes: "Rencontre commerciale du 24/09 — très intéressé par la veille prix.",
      stations: [], statutAb: "ACTIF",
    },
    {
      numero: "CTR-2026-007", brandSlug: null, nomClient: "PetroExpress (prospect)",
      contactNom: "Ahmed Khelifi", contactRole: "Fondateur", contactEmail: "ahmed@petroexpress.tn",
      contactTel: "+216 71 789 012", statut: "ESSAI", signature: null, debut: d(-12), fin: null,
      adhesion: 6_000_000, adhesionPayee: false, periodicite: "MENSUEL",
      conditions: "Essai 30 jours initié après la démonstration.",
      notes: "Essai court suite webinaire B2B.",
      stations: [], statutAb: "ACTIF",
    },
  ]
  const contratIds = new Map<string, string>()
  for (const c of contratsSeed) {
    const created = await db.contrat.upsert({
      where: { numero: c.numero },
      create: {
        numero: c.numero, brandSlug: c.brandSlug, nomClient: c.nomClient, contactNom: c.contactNom,
        contactRole: c.contactRole, contactEmail: c.contactEmail, contactTel: c.contactTel,
        statut: c.statut, dateSignature: c.signature, dateDebut: c.debut, dateFin: c.fin,
        fraisAdhesionMillimes: c.adhesion, adhesionPayee: c.adhesionPayee, periodiciteDefaut: c.periodicite,
        conditions: c.conditions, notes: c.notes, createdAt: c.signature ?? c.debut ?? d(-90),
      },
      update: {},
    })
    contratIds.set(c.numero, created.id)

    // Avenants sur les contrats actifs
    if (c.numero === "CTR-2024-001") {
      await db.avenant.upsert({
        where: { id: (await db.avenant.findFirst({ where: { numero: "AV-001", contratId: created.id } }))?.id ?? "" },
        create: {
          contratId: created.id, numero: "AV-001",
          objet: "Ajout de 3 stations au périmètre souscrit",
          contenu: "Extension du périmètre de 3 à 6 stations (Grand Tunis) à compter du mois suivant, au même tarif unitaire.",
          dateEffet: d(-200), statut: "APPLIQUE", createdAt: d(-205),
        },
        update: {},
      })
    }
    if (c.numero === "CTR-2025-005") {
      await db.avenant.upsert({
        where: { id: (await db.avenant.findFirst({ where: { numero: "AV-001", contratId: created.id } }))?.id ?? "" },
        create: {
          contratId: created.id, numero: "AV-001",
          objet: "Suspension temporaire pour impayés",
          contenu: "Suspension des abonnements et de la facturation jusqu'au règlement de l'arriéré de 2 mois. Données conservées 90 jours.",
          dateEffet: d(-20), statut: "APPLIQUE", createdAt: d(-22),
        },
        update: {},
      })
    }

    // Abonnements stations (grille : 40 000 millimes/mois ou 400 000/an)
    for (const [code, nom] of c.stations) {
      const periodicite = c.periodicite === "ANNUEL" ? "ANNUEL" : "MENSUEL"
      await db.abonnementStation.upsert({
        where: { id: (await db.abonnementStation.findFirst({ where: { brandSlug: c.brandSlug!, stationCode: code } }))?.id ?? "" },
        create: {
          brandSlug: c.brandSlug!, stationCode: code, stationNom: nom, periodicite,
          prixMillimes: periodicite === "ANNUEL" ? 400_000 : 40_000,
          dateDebut: c.debut ?? d(-45), dateFin: c.statutAb === "SUSPENDU" ? c.fin : null,
          statut: c.statutAb,
        },
        update: {},
      })
    }
  }
  console.log("Contrat :", contratsSeed.length, "· Avenant : 2 · AbonnementStation :", contratsSeed.reduce((s, c) => s + c.stations.length, 0))

  // ---------------------------------------------------------------- 4. Factures
  // Historique 12 mois pour les clients facturés (PAYEE), mois courant (EMISE),
  // retards marqués pour Staroil (EN_RETARD) — cohérent avec sa suspension.
  type Fac = { brand: string; numero: string; mois: string; emission: Date; echeance: Date; statut: string; ht: number; paiement: Date | null; mode: string | null; notes: string; lignes: [string, number, number][] }
  const factures: Fac[] = []
  const facturables = [
    { brand: "agil", nb: 6, prefix: "AGIL", ref: 1 },
    { brand: "shell", nb: 4, prefix: "SHEL", ref: 3 },
  ]
  for (const f of facturables) {
    for (let m = -11; m <= 0; m++) {
      const mk = mois(m)
      const ht = f.nb * 40_000
      const statut = m === 0 ? "EMISE" : "PAYEE"
      const emission = new Date(NOW.getFullYear(), NOW.getMonth() + m, 1, 9, 0, 0)
      factures.push({
        brand: f.brand, numero: `FAC-${mk}-${f.prefix}-${String(f.ref).padStart(2, "0")}`,
        mois: mk, emission, echeance: new Date(emission.getTime() + 30 * DAY), statut, ht,
        paiement: statut === "PAYEE" ? new Date(emission.getTime() + 18 * DAY) : null,
        mode: statut === "PAYEE" ? "VIREMENT" : null,
        notes: statut === "PAYEE" ? "Règlement reçu — merci." : "",
        lignes: [[`Abonnement mensuel — ${f.nb} stations`, f.nb, 40_000]],
      })
    }
  }
  // TotalEnergies : facturation annuelle à l'anniversaire (2 factures)
  const totSign = d(-475)
  for (const ann of [0, 1]) {
    const emission = new Date(totSign.getFullYear() + ann, totSign.getMonth(), totSign.getDate(), 9, 0, 0)
    if (emission > NOW) continue
    const ht = 5 * 400_000
    const statut = ann === 1 ? "EMISE" : "PAYEE"
    factures.push({
      brand: "totalenergies", numero: `FAC-${mois(0)}-TOTA-0${ann + 1}`,
      mois: `${emission.getFullYear()}-${String(emission.getMonth() + 1).padStart(2, "0")}`,
      emission, echeance: new Date(emission.getTime() + 30 * DAY), statut, ht,
      paiement: statut === "PAYEE" ? new Date(emission.getTime() + 22 * DAY) : null,
      mode: statut === "PAYEE" ? "VIREMENT" : null, notes: "",
      lignes: [["Abonnement annuel — 5 stations", 5, 400_000]],
    })
  }
  // Staroil : 2 mois en retard (cohérent suspension)
  for (const m of [-3, -2]) {
    const mk = mois(m)
    const emission = new Date(NOW.getFullYear(), NOW.getMonth() + m, 1, 9, 0, 0)
    factures.push({
      brand: "staroil", numero: `FAC-${mk}-STAR-01`, mois: mk, emission,
      echeance: new Date(emission.getTime() + 30 * DAY), statut: "EN_RETARD", ht: 2 * 40_000,
      paiement: null, mode: null,
      notes: m === -2 ? "Relance envoyée le 15/09/2026 · Relance envoyée le 01/10/2026" : "Relance envoyée le 01/10/2026",
      lignes: [["Abonnement mensuel — 2 stations", 2, 40_000]],
    })
  }
  // Ola (ESSAI) : aucune facture (essai gratuit) — honnête.

  for (const f of factures) {
    const tva = Math.round(f.ht * TVA)
    const created = await db.facture.upsert({
      where: { numero: f.numero },
      create: {
        numero: f.numero, brandSlug: f.brand, moisConcerne: f.mois, dateEmission: f.emission,
        dateEcheance: f.echeance, statut: f.statut, montantHtMillimes: f.ht, montantTvaMillimes: tva,
        montantTtcMillimes: f.ht + tva, datePaiement: f.paiement, modePaiement: f.mode, notes: f.notes,
      },
      update: {},
    })
    const nb = await db.factureLigne.count({ where: { factureId: created.id } })
    if (nb === 0) {
      await db.factureLigne.createMany({
        data: f.lignes.map(([libelle, quantite, prix], i) => ({
          factureId: created.id, libelle, quantite, prixUnitaireMillimes: prix,
          montantHtMillimes: quantite * prix, ordre: i,
        })),
      })
    }
  }
  console.log("Facture :", factures.length, "· FactureLigne :", factures.reduce((s, f) => s + f.lignes.length, 0))

  // ---------------------------------------------------------------- 5. Devis
  const devis: [string, string, string, number, string, boolean, number, string, Date][] = [
    ["DEV-2026-0001", "Ola Energy Tunisia", "mehdi.ayari@olaenergy.tn", 9, "MENSUEL", false, 9 * 40_000 * 12, "REFUSE", d(-120)],
    ["DEV-2026-0002", "Carrefour Fuel (prospect)", "direction@carrefourfuel.tn", 24, "ANNUEL", true, 24 * 400_000, "ENVOYE", d(-60)],
    ["DEV-2026-0003", "Zoom Station (prospect)", "contact@zoomstation.tn", 18, "MENSUEL", false, 18 * 40_000 * 12, "ENVOYE", d(-8)],
    ["DEV-2026-0004", "PetroExpress (prospect)", "ahmed@petroexpress.tn", 6, "MENSUEL", true, 6 * 40_000 * 12, "BROUILLON", d(-2)],
  ]
  for (const [numero, enseigneNom, contactEmail, nbStations, modeFacturation, adhesionOfferte, ab, statut, createdAt] of devis) {
    const adhesion = adhesionOfferte ? 0 : 6_000_000
    const ht = adhesion + ab
    const tva = Math.round(ht * TVA)
    await db.devis.upsert({
      where: { numero },
      create: {
        numero, enseigneNom, contactEmail, nbStations, modeFacturation, adhesionOfferte,
        montantHtMillimes: ht, montantTvaMillimes: tva, montantTtcMillimes: ht + tva,
        statut, creePar: "super.admin@carbuscope.tn", createdAt,
      },
      update: {},
    })
  }
  console.log("Devis : 4")

  // ---------------------------------------------------------------- 6. Clés API
  const cles: [string, string, string, string | null, string, boolean, Date | null, number, Date][] = [
    ["Intégration SI Agil (lecture)", "cs_agil_", "cs_agil_••••••••a3f1", "agil", "lecture", true, d(-2), 18_412, d(-160)],
    ["Console interne CarbuScope", "cs_admin_", "cs_admin_••••••••9c2e", null, "lecture+ecriture", true, null, 942, d(-480)],
    ["Ola Energy — essai API", "cs_olaen_", "cs_olaen_••••••••7b04", "ola", "lecture", true, d(-1), 118, d(-40)],
    ["Ancienne clé Staroil (révoquée)", "cs_staro_", "cs_staro_••••••••4d77", "staroil", "lecture", false, d(-30), 3_205, d(-700)],
  ]
  for (const [label, prefixe, cleMasquee, brandSlug, scopes, active, derniereUtilisation, nbAppels, createdAt] of cles) {
    await db.cleApi.upsert({
      where: { id: (await db.cleApi.findFirst({ where: { cleMasquee } }))?.id ?? "" },
      create: { label, prefixe, cleMasquee, brandSlug, scopes, active, derniereUtilisation, nbAppels, createdAt },
      update: {},
    })
  }
  console.log("CleApi : 4")

  // ---------------------------------------------------------------- 7. Sauvegardes
  const sauvegardes: [string, string, string, number, number, number, string, Date][] = [
    ["backup-auto-2026-10-02T03-00-00.db", "AUTO", "REUSSIE", 6_912, 73, 214, "Sauvegarde nocturne automatique (copie physique vérifiée).", d(-0.25)],
    ["backup-auto-2026-10-01T03-00-00.db", "AUTO", "REUSSIE", 6_848, 73, 198, "Sauvegarde nocturne automatique.", d(-1.25)],
    ["backup-manuel-2026-09-28T14-12-33.db", "MANUELLE", "REUSSIE", 6_702, 72, 411, "Sauvegarde manuelle avant migration des tables Publicité.", d(-4)],
    ["backup-auto-2026-09-27T03-00-00.db", "AUTO", "REUSSIE", 6_650, 72, 201, "Sauvegarde nocturne automatique.", d(-5.25)],
    ["backup-pre-restauration-2026-09-20T10-05-11.db", "PRE_RESTAURATION", "REUSSIE", 6_590, 72, 389, "Instantané pris avant test de restauration.", d(-12)],
  ]
  for (const [nomFichier, type, statut, tailleKo, nbTables, dureeMs, note, createdAt] of sauvegardes) {
    await db.sauvegarde.upsert({
      where: { id: (await db.sauvegarde.findFirst({ where: { nomFichier } }))?.id ?? "" },
      create: { nomFichier, type, statut, tailleKo, nbTables, dureeMs, note, createdAt },
      update: {},
    })
  }
  console.log("Sauvegarde : 5 (journal — fichiers physiques non recréés, restauration gérée 409)")

  // ---------------------------------------------------------------- 8. Jobs
  const jobs: [string, string, string, string, boolean, Date | null, string, number, string][] = [
    ["veille.reputation", "Veille réputation & watchlist", "Évalue les nouveaux avis et alertes contre la watchlist des enseignes.", "HORAIRE", true, d(-0.1), "OK", 640, "Passe : 5 marques couvertes · alertes évaluées contre la watchlist"],
    ["facturation.generation", "Génération mensuelle des factures", "Émet les factures du mois pour les clients ACTIF (idempotent).", "MENSUEL", true, d(-1), "OK", 580, "Vérification : factures du mois déjà présentes (idempotent)"],
    ["sauvegarde.auto", "Sauvegarde automatique nocturne", "Copie physique de la base SQLite avec vérification de checksum.", "QUOTIDIEN", true, d(-0.25), "OK", 214, "Copie vérifiée · checksum OK"],
    ["contrats.expiration", "Échéances de contrats", "Détecte les contrats arrivant à échéance sous 60 jours et prépare les renouvellements.", "HEBDO", true, d(-2), "OK", 120, "2 contrat(s) sous 60 jours — dossiers de renouvellement préparés"],
    ["facturation.relances", "Relances de règlement", "Envoie les rappels avant échéance puis les relances de retard.", "HEBDO", true, d(-1), "OK", 310, "Rappels avant échéance envoyés aux clients concernés"],
    ["contributions.digest", "Digest des contributions", "Compile les contributions communautaires de la semaine pour l'équipe.", "HEBDO", true, d(-3), "OK", 95, "Digest compilé et transmis à l'équipe (SMTP repris)"],
    ["analytics.aggregation", "Agrégation analytique MRR/ARR", "Recalcule les indicateurs SaaS sur les factures réelles.", "QUOTIDIEN", true, d(-0.2), "OK", 88, "MRR recalculé sur 26 factures · 0 anomalie"],
    ["fraisdonnee.fraicheur", "Fraîcheur des données terrain", "Recalcule l'âge moyen des vérifications par gouvernorat.", "QUOTIDIEN", false, null, "JAMAIS", 0, "Jamais exécuté (job désactivé à la demande de la direction)"],
  ]
  for (const [code, nom, description, periodicite, actif, dernierRun, statutDernierRun, dureeDernierRunMs, resultat] of jobs) {
    await db.jobPlateforme.upsert({
      where: { code },
      create: { code, nom, description, periodicite, actif, dernierRun, statutDernierRun, dureeDernierRunMs, resultat },
      update: {},
    })
  }
  console.log("JobPlateforme : 8")

  // ---------------------------------------------------------------- 9. Tickets
  const tickets: {
    numero: string; brandSlug: string; demandeur: string; sujet: string; priorite: string
    statut: string; assigneA: string | null; cree: Date; maj: Date
    messages: [string, boolean, string, Date][]
  }[] = [
    {
      numero: "TCK-2026-0001", brandSlug: "agil", demandeur: "sonia.trabelsi@agil.tn",
      sujet: "Écart de prix affiché sur la station TN-0004", priorite: "HAUTE", statut: "EN_COURS",
      assigneA: "Nadia Ben Amor (CarbuScope)", cree: d(-6), maj: d(-1),
      messages: [
        ["sonia.trabelsi@agil.tn", false, "Bonjour, le prix essence affiché sur la fiche TN-0004 ne correspond pas au prix à la pompe (2,515 DT vs 2,525 DT constaté ce matin).", d(-6)],
        ["Nadia Ben Amor (CarbuScope)", true, "Bonjour Sonia, merci pour le signalement — la fiche reprend le dernier décret publié. Nous lançons une vérification terrain prioritaire.", d(-4)],
        ["Nadia Ben Amor (CarbuScope)", true, "Vérification effectuée : la pompe applique bien le décret, l'écart venait d'un arrondi d'affichage — corrigé en production. Pouvez-vous confirmer de votre côté ?", d(-1)],
      ],
    },
    {
      numero: "TCK-2026-0002", brandSlug: "totalenergies", demandeur: "k.bensalah@totalenergies.tn",
      sujet: "Export CSV des rapports incomplet au-delà de 5 000 lignes", priorite: "NORMALE", statut: "OUVERT",
      assigneA: null, cree: d(-2), maj: d(-2),
      messages: [
        ["k.bensalah@totalenergies.tn", false, "Bonjour, l'export CSV des rapports de visite se coupe autour de 5 000 lignes. Nous en attendions plus de 12 000.", d(-2)],
      ],
    },
    {
      numero: "TCK-2026-0003", brandSlug: "ola", demandeur: "mehdi.ayari@olaenergy.tn",
      sujet: "Question sur l'API — quota d'appels par heure", priorite: "BASSE", statut: "EN_ATTENTE_CLIENT",
      assigneA: "Nadia Ben Amor (CarbuScope)", cree: d(-5), maj: d(-3),
      messages: [
        ["mehdi.ayari@olaenergy.tn", false, "Bonjour, quel est le quota d'appels horaire pour notre clé d'essai ?", d(-5)],
        ["Nadia Ben Amor (CarbuScope)", true, "Bonjour Mehdi, la clé d'essai est limitée à 1 200 appels/heure (paramètre api.rateLimit). Un onglet dédié de la configuration affiche cette valeur. Souhaitez-vous une élévation temporaire pour vos tests d'intégration ?", d(-3)],
      ],
    },
    {
      numero: "TCK-2025-0117", brandSlug: "staroil", demandeur: "fawzi.gharbi@staroil.tn",
      sujet: "Réactivation du compte après suspension", priorite: "URGENTE", statut: "EN_COURS",
      assigneA: "Nadia Ben Amor (CarbuScope)", cree: d(-8), maj: d(-0.5),
      messages: [
        ["fawzi.gharbi@staroil.tn", false, "Nous avons réglé l'arriéré par virement ce matin, pouvez-vous réactiver l'accès ?", d(-8)],
        ["Nadia Ben Amor (CarbuScope)", true, "Bonjour, le règlement a bien été réceptionné par la comptabilité. Réactivation en cours après vérification (délai 24 h ouvrées).", d(-1)],
      ],
    },
    {
      numero: "TCK-2025-0109", brandSlug: "shell", demandeur: "ines.chaabane@shell.tn",
      sujet: "Ajout de stations au périmètre souscrit", priorite: "NORMALE", statut: "RESOLU",
      assigneA: "Nadia Ben Amor (CarbuScope)", cree: d(-25), maj: d(-20),
      messages: [
        ["ines.chaabane@shell.tn", false, "Nous souhaitons ajouter 2 stations (Le Bardo 3 et Sidi Houssine 4) à notre abonnement.", d(-25)],
        ["Nadia Ben Amor (CarbuScope)", true, "C'est noté — les 2 stations sont câblées, un avenant AV-002 sera édité avec la facturation du mois prochain.", d(-22)],
        ["ines.chaabane@shell.tn", false, "Parfait, merci pour la réactivité !", d(-20)],
      ],
    },
    {
      numero: "TCK-2025-0094", brandSlug: "agil", demandeur: "sonia.trabelsi@agil.tn",
      sujet: "Formation équipe sur le module Media Planner", priorite: "NORMALE", statut: "FERME",
      assigneA: null, cree: d(-80), maj: d(-75),
      messages: [
        ["sonia.trabelsi@agil.tn", false, "Proposez-vous des sessions de formation sur le module Media Planner ?", d(-80)],
        ["Nadia Ben Amor (CarbuScope)", true, "Oui — une session de 45 min a été organisée le mois dernier, replay disponible sur demande. Je clôture ce ticket, n'hésitez pas à en ouvrir un autre si besoin.", d(-75)],
      ],
    },
  ]
  for (const t of tickets) {
    const created = await db.ticketSupport.upsert({
      where: { numero: t.numero },
      create: {
        numero: t.numero, brandSlug: t.brandSlug, demandeur: t.demandeur, sujet: t.sujet,
        priorite: t.priorite, statut: t.statut, assigneA: t.assigneA, createdAt: t.cree, updatedAt: t.maj,
      },
      update: {},
    })
    const nb = await db.ticketMessage.count({ where: { ticketId: created.id } })
    if (nb === 0) {
      await db.ticketMessage.createMany({
        data: t.messages.map(([auteur, estStaff, contenu, createdAt]) => ({ ticketId: created.id, auteur, estStaff, contenu, createdAt })),
      })
    }
  }
  console.log("TicketSupport : 6 · TicketMessage :", tickets.reduce((s, t) => s + t.messages.length, 0))

  // ---------------------------------------------------------------- 10. Journal d'audit V7
  const auditEntries: [string, string, string, string, string, string, string, string, string, Date][] = [
    ["Nadia Ben Amor", "super.admin@carbuscope.tn", "SUPER_ADMIN", "FACTURATION", "Facture marquée payée", "FACTURE", "FAC-2026-09-AGIL-01", "Règlement VIREMENT — 285,600 DT TTC.", "NORMALE", d(-12)],
    ["Nadia Ben Amor", "super.admin@carbuscope.tn", "SUPER_ADMIN", "CLIENTS", "Statut contrat modifié : ACTIF → SUSPENDU", "CONTRAT", "CTR-2025-005 — Staroil Tunisie", "Transition de cycle de vie client appliquée depuis le module Clients & Contrats.", "SENSIBLE", d(-20)],
    ["Nadia Ben Amor", "super.admin@carbuscope.tn", "SUPER_ADMIN", "FACTURATION", "Relance de règlement envoyée", "FACTURE", "FAC-2026-08-STAR-01", "Retard de 12 jour(s).", "NORMALE", d(-15)],
    ["Nadia Ben Amor", "super.admin@carbuscope.tn", "SUPER_ADMIN", "SECURITE", "Clé API générée", "CLE_API", "cs_olaen_••••••••7b04", "Clé d'essai API — portée lecture — enseigne ola.", "SENSIBLE", d(-40)],
    ["Nadia Ben Amor", "super.admin@carbuscope.tn", "SUPER_ADMIN", "SECURITE", "Clé API révoquée", "CLE_API", "cs_staro_••••••••4d77", "Révocation consécutive à la suspension du contrat.", "SENSIBLE", d(-20)],
    ["Nadia Ben Amor", "super.admin@carbuscope.tn", "SUPER_ADMIN", "SUPERVISION", "Sauvegarde manuelle créée", "SAUVEGARDE", "backup-manuel-2026-09-28T14-12-33.db", "Copie physique de la base (6,5 Mo) en 411 ms.", "SENSIBLE", d(-4)],
    ["Nadia Ben Amor", "super.admin@carbuscope.tn", "SUPER_ADMIN", "SUPPORT", "Annonce diffusée", "ANNONCE", "Nouveau module Publicité disponible", "Audience TOUTES — sévérité INFO.", "NORMALE", d(-3)],
    ["Nadia Ben Amor", "super.admin@carbuscope.tn", "SUPER_ADMIN", "SUPPORT", "Ticket créé", "TICKET", "TCK-2026-0002", "Export CSV des rapports incomplet au-delà de 5 000 lignes — priorité NORMALE.", "NORMALE", d(-2)],
    ["Nadia Ben Amor", "super.admin@carbuscope.tn", "SUPER_ADMIN", "CLIENTS", "Devis créé", "DEVIS", "DEV-2026-0003 — Zoom Station (prospect)", "18 stations · MENSUEL · 8 700,000 DT TTC", "NORMALE", d(-8)],
    ["Nadia Ben Amor", "super.admin@carbuscope.tn", "SUPER_ADMIN", "CONFIG", "Paramètre modifié", "PARAMETRE", "api.rateLimit", "Limite horaire d'appels par clé API : « 900 » → « 1200 ».", "SENSIBLE", d(-9)],
    ["Nadia Ben Amor", "super.admin@carbuscope.tn", "SUPER_ADMIN", "SUPPORT", "Réponse staff envoyée", "TICKET", "TCK-2026-0001", "Première réponse : Bonjour Sonia, merci pour le signalement…", "NORMALE", d(-4)],
    ["Nadia Ben Amor", "super.admin@carbuscope.tn", "SUPER_ADMIN", "CLIENTS", "Avenant créé", "CONTRAT", "CTR-2025-005 / AV-001", "Suspension temporaire pour impayés.", "SENSIBLE", d(-22)],
  ]
  for (const [acteurNom, acteurEmail, acteurRole, module, action, cibleType, cibleLabel, details, severite, createdAt] of auditEntries) {
    const existing = await db.auditLog.findFirst({ where: { acteurEmail, action, cibleLabel, createdAt } })
    if (!existing) {
      await db.auditLog.create({
        data: { acteurNom, acteurEmail, acteurRole, module, action, cibleType, cibleLabel, details, severite, ip: "196.203.12.44", createdAt },
      })
    }
  }
  console.log("AuditLog :", auditEntries.length)

  // ---------------------------------------------------------------- vérification
  const counts = {
    parametres: await db.parametrePlateforme.count(),
    annonces: await db.annonce.count(),
    contrats: await db.contrat.count(),
    avenants: await db.avenant.count(),
    abonnements: await db.abonnementStation.count(),
    factures: await db.facture.count(),
    lignes: await db.factureLigne.count(),
    devis: await db.devis.count(),
    cles: await db.cleApi.count(),
    sauvegardes: await db.sauvegarde.count(),
    jobs: await db.jobPlateforme.count(),
    tickets: await db.ticketSupport.count(),
    messages: await db.ticketMessage.count(),
    audit: await db.auditLog.count(),
  }
  console.log("BILAN :", JSON.stringify(counts))
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
