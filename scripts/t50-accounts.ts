// T50 — Gouvernance des comptes (restauration) : purge des comptes plateforme
// hors enseigne, activation de Star Oil (contrat + compte Anis Ferjani),
// création du rôle DG (Tarek Mabrouk), racine unique Rania Feki, 8 événements
// d'audit tracés.
// Usage : bun scripts/t50-accounts.ts
// (Le mot de passe démo « carbuscope » est documenté en clair sur l'écran
// de connexion — aucun secret ici.)

import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const db = new PrismaClient()

/** Comptes du personnel plateforme hors enseigne — purge T50. */
const PURGE = [
  "amine.chebbi@carbuscope.tn",
  "hichem.jaziri@carbuscope.tn",
  "ops@carbuscope.tn",
  "finance@carbuscope.tn",
  "admin@carbuscope.tn",
]

async function main() {
  const hash = bcrypt.hashSync("carbuscope", 10)
  const events: { kind: string; message: string; actor: string; brandSlug?: string }[] = []

  // 1. Purge des comptes plateforme hors enseigne
  for (const email of PURGE) {
    const u = await db.user.findUnique({ where: { email } })
    if (u) {
      await db.user.delete({ where: { id: u.id } })
      events.push({
        kind: "UTILISATEUR",
        message: `Compte plateforme hors enseigne supprimé (gouvernance T50) : ${u.name} (${u.email})`,
        actor: "rania.feki@carbuscope.tn",
      })
      console.log(`PURGÉ : ${email}`)
    }
  }

  // 2. Star Oil — contrat SUSPENDU → ACTIF, compte Anis Ferjani débloqué
  const contrat = await db.saasContract.findUnique({ where: { brandSlug: "staroil" } })
  if (contrat && contrat.status === "SUSPENDU") {
    await db.saasContract.update({ where: { id: contrat.id }, data: { status: "ACTIF" } })
    events.push({
      kind: "CONTRAT",
      message: `Contrat Staroil réactivé (SUSPENDU → ACTIF) — gouvernance T50`,
      actor: "rania.feki@carbuscope.tn",
      brandSlug: "staroil",
    })
    console.log("CONTRAT STAROIL : ACTIF")
  }
  const anis = await db.user.findUnique({ where: { email: "anis.ferjani@staroil.tn" } })
  if (anis && (!anis.active || !anis.passwordHash)) {
    await db.user.update({ where: { id: anis.id }, data: { active: true, passwordHash: anis.passwordHash ?? hash } })
    events.push({
      kind: "UTILISATEUR",
      message: `Compte Anis Ferjani (Staroil) débloqué — enseigne activée`,
      actor: "rania.feki@carbuscope.tn",
      brandSlug: "staroil",
    })
    console.log("ANIS FERJANI : débloqué")
  }

  // 3. DG Tarek Mabrouk (Agil) — voit tous les modules
  let tarek = await db.user.findUnique({ where: { email: "tarek.mabrouk@agil.tn" } })
  if (!tarek) {
    tarek = await db.user.create({
      data: {
        email: "tarek.mabrouk@agil.tn",
        name: "Tarek Mabrouk",
        role: "DG",
        brandSlug: "agil",
        active: true,
        passwordHash: hash,
      },
    })
    events.push({
      kind: "UTILISATEUR",
      message: `Directeur Général créé : Tarek Mabrouk (Agil) — accès complet aux modules`,
      actor: "rania.feki@carbuscope.tn",
      brandSlug: "agil",
    })
    console.log("TAREK MABROUK : créé (DG)")
  } else if (tarek.role !== "DG" || !tarek.active) {
    await db.user.update({ where: { id: tarek.id }, data: { role: "DG", active: true, passwordHash: tarek.passwordHash ?? hash } })
    events.push({
      kind: "UTILISATEUR",
      message: `Compte Tarek Mabrouk promu Directeur Général (accès complet)`,
      actor: "rania.feki@carbuscope.tn",
      brandSlug: "agil",
    })
    console.log("TAREK MABROUK : promu DG")
  }

  // 4. Racine unique — Rania Feki (SUPER_ADMIN, active)
  const rania = await db.user.findUnique({ where: { email: "rania.feki@carbuscope.tn" } })
  if (rania && (rania.role !== "SUPER_ADMIN" || !rania.active)) {
    await db.user.update({ where: { id: rania.id }, data: { role: "SUPER_ADMIN", active: true } })
    events.push({
      kind: "UTILISATEUR",
      message: `Rania Feki confirmée super-administratrice racine unique`,
      actor: "rania.feki@carbuscope.tn",
    })
    console.log("RANIA FEKI : racine confirmée")
  }

  // 5. Événements d'audit (tous idempotents au-dessus, événement récapitulatif)
  if (events.length > 0) {
    events.push({
      kind: "SYSTEME",
      message: `Gouvernance T50 appliquée : ${events.length} opérations tracées (purge hors-enseigne, Star Oil activée, DG créé)`,
      actor: "rania.feki@carbuscope.tn",
    })
    for (const e of events) {
      await db.auditEvent.create({
        data: { kind: e.kind, message: e.message, actor: e.actor, brandSlug: e.brandSlug ?? null },
      })
    }
    console.log(`AUDIT : ${events.length} événements journalisés`)
  } else {
    console.log("AUDIT : aucun changement — base déjà conforme T50")
  }

  // Récapitulatif
  const users = await db.user.findMany({ where: { active: true }, select: { email: true, role: true } })
  console.log(`\nComptes actifs (${users.length}) :`)
  for (const u of users) console.log(`  ${u.email} · ${u.role}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
