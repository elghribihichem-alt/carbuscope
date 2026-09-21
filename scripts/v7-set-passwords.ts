// V7 — Authentification réelle : pose le mot de passe de DÉMONSTRATION
// « carbuscope » (bcrypt, coût 10) sur tous les comptes actifs du seed.
// Usage : bun scripts/v7-set-passwords.ts
// (Le mot de passe démo est documenté en clair sur l'écran de connexion.)

import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const db = new PrismaClient()

async function main() {
  const users = await db.user.findMany({ select: { id: true, email: true, active: true } })
  const hash = bcrypt.hashSync("carbuscope", 10)
  let n = 0
  for (const u of users) {
    if (!u.active) continue // comptes désactivés : pas d'accès
    await db.user.update({ where: { id: u.id }, data: { passwordHash: hash } })
    n++
  }
  console.log(`Mot de passe démo posé sur ${n}/${users.length} comptes actifs.`)
  const verif = await db.user.findFirst({ where: { email: "super.admin@carbuscope.tn" }, select: { passwordHash: true } })
  console.log("Vérification bcrypt super.admin :", verif?.passwordHash ? "OK" : "ÉCHEC")
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
